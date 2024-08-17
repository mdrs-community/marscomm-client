/* TODO
*/

/* Copyright © 2024 by Matthew F. Storch.  Usage is subject to the license included in the MarsComm client repo. */

let urlPrefix = 'http://localhost:8081/';
let refDate = null;
let commsDelay = 0;
let crewNum = 0;
let rotationLength = 0;
let username = null;
let planet = null;
let app = null;
let theme = 0; // 0=dark, 1=light
const darkColor = '#222222';
const lightColor = '#eeeeee';
function themeBgColor()       { return theme ? lightColor : darkColor; }
function themeButtonColor()   { return theme ? "#ccccff"  : '#9999dd' }
function themeInactiveColor() { return theme ? "#cccccc"  : '#999999' }
function themeBlueText()      { return theme ? "blue"     : '#4444ff' }
function themeStdText()       { return theme ? "black"    : 'white' }

function log(str) { console.log(str); }

function getQueryParams() 
{
  
  log(window.location);
  let params = {};
  let queryString = window.location.search;
  if (queryString) 
  {
    let urlParams = new URLSearchParams(queryString);
    for (let [key, value] of urlParams.entries())
      params[key] = value;
  }
  return params;
}

function arrayBufferToBase64(buffer)
{
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) 
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function getSolNum(date) 
{
  if (!date) date = new Date(); 
  let solNum = Math.floor((date.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24)); 
  if (solNum > rotationLength-1) solNum = rotationLength-1;
  return solNum;
}

function commsDelayPassed(sentTime)
{
  if (!(sentTime instanceof Date)) sentTime = new Date(sentTime);
  const now = new Date();
  //log("CDPassed: " + ((now - sentTime) / 1000) + ", commsDelay: " + commsDelay + ", CDP ret: " + ((now - sentTime) / 1000 > commsDelay));
  return ((now - sentTime) / 1000 > commsDelay);
}

function timeSinceSent(sentTime)
{
  if (!(sentTime instanceof Date)) sentTime = new Date(sentTime);
  const now = new Date();
  return (now - sentTime) / 1000;  
}

function inTransit(obj) 
{ 
  const cdp = commsDelayPassed(obj.xmitTime, commsDelay);
  //log("in transit? " + obj.xmitTime.toString() + " vs " + (new Date()).toString() + " CDP " + cdp);
  return obj.transmitted && !cdp; 
}

function timeInTransit(obj) 
{ 
  const tit = ((new Date()) - obj.xmitTime) / 1000; 
  //log("timeInTransit is " + tit + " seconds");
  return tit;
}

function setBGColor(btn, clr1, clr2) 
{
   var elem = btn.getContentElement();
   var dom  = elem.getDomElement();
   if (!dom) return;
   if (!clr2) clr2 = clr1;
   var img  = "linear-gradient(" + clr1 + " 35%, " + clr2 + " 100%)";
   if (dom.style.setProperty)
       dom.style.setProperty ("background-image", img, null);
   else
       dom.style.setAttribute ("backgroundImage", img);
}

function makeButton(container, str, onExecute, color, fontSize, that, image)
{
  if (!fontSize) fontSize = 14;
  if (!color) color = "gray";
  const button = str ? new qx.ui.form.Button(str) : new qx.ui.form.Button(null, image);
  if (str) button.addListenerOnce("appear", function () { setBGColor(button, color); }, that);
  button.addListener("execute", onExecute, that);
  container.add(button);
  return button;
}

function makeLabel(container, str, color, fontSize)
{
  let label = new qx.ui.basic.Label(str);
  label.setTextColor(color);
  label.setFont(new qx.bom.Font(fontSize, ["Arial"]));
  container.add(label);
  return label;
}

function doDownload(urlPath, filename)
{
  // Create an invisible link to trigger the download
  var link = document.createElement("a");
  link.href = urlPrefix + urlPath;
  
  log("attempting download of " + link.href);
  // The desired filename for the download, BUT seems to be overridden by the Content-Disosition header set by server
  link.download = filename; 
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

//////////////////////////////////////////////////////////////////////////////////////////////////

function newIM(content)
{
	let that = { };
  that.type = "IM";
  that.content = content;
  that.user = username;
  that.planet = planet;
  that.xmitTime = new Date();
  that.transmitted = true; // IMs are automatically transmitted

  that.received = function () { return commsDelayPassed(that.xmitTime); }
  
  return that;
}

/**
 * This is the main application class of "myapp"
 *
 * @asset(myapp/*)
 */
qx.Class.define("myapp.Application",
{
  extend: qx.application.Standalone,

  members:
  {
    isLoggedIn: false,
    token: 0,
    loginButton: null,
    planetIcon: null,
    solNum: 0,
    sol: null,
    reportUIs: null,
    chatUI: null,

    /** @lint ignoreDeprecated(alert)
     */
    async main()
    {
      super.main();
      const that = this; // "this" won't work inside the setTimeout callback
      app = this;

      log("Welcome to MarsComm");
      // Enable logging in debug variant
      if (qx.core.Environment.get("qx.debug"))
      {
        qx.log.appender.Native;  // support native logging capabilities, e.g. Firebug for Firefox
        qx.log.appender.Console;  // support additional cross-browser console. Press F7 to toggle visibility
      }

      let queryParams = getQueryParams();
      if (queryParams.theme) 
        theme = Number(queryParams.theme);
      let protocol = 'http';
      let host = window.location.hostname;
      let port = 8081;

      if (queryParams.protocol) protocol = queryParams.protocol;      
      if (queryParams.serverHost) host = queryParams.serverHost;
      if (queryParams.serverPort) port = queryParams.serverPort;

      urlPrefix = protocol + '://' + host + ':' + port + '/';
      
      log('urlPrefix=' + urlPrefix);

      commsDelay     = await this.recvCommsDelay();
      crewNum        = await this.recvCrewNum();
      rotationLength = await this.recvRotationLength();
      refDate = new Date(await this.recvRefDate());
      this.refDate = refDate;
      log("commsDelay=" + commsDelay + ", refDate=" + this.refDate);

      // Create the main layout
      let doc = this.getRoot();
      let mainContainer = new qx.ui.container.Composite(new qx.ui.layout.VBox());
      mainContainer.setBackgroundColor(themeBgColor());
      doc.add(mainContainer, { edge: 0 });

      let topPanel = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
      topPanel.setPadding(10);
      topPanel.setDecorator("main");
      mainContainer.add(topPanel);
      this.topPanel = topPanel;

      let logo = new qx.ui.basic.Image("myapp/MDRSlogo.jpg");
      topPanel.add(logo); 
      const mcLabel = makeLabel(topPanel, "MarsComm", themeBlueText(), 24);
      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
      makeLabel(topPanel, "Crew: " + crewNum, themeBlueText(), 24);
      topPanel.add(new qx.ui.core.Spacer(), { flex: 0 });
      makeLabel(topPanel, "Sol", themeBlueText(), 24);
      let numberInput = new qx.ui.form.Spinner();
      numberInput.set({ minimum: 0, maximum: rotationLength-1 });
      numberInput.addListener("changeValue", async function(event) 
      {
        const solNum = event.getData(); // proper event is not available inside the setTimeout callback
        if (this.timerId) { clearTimeout(this.timerId); } // Clear any existing timer       
        this.timerId = setTimeout(async function() { that.changeSol(that, solNum); }, 900);
      }, this);
      topPanel.add(numberInput);
      numberInput.setBackgroundColor(themeBgColor()); // TODO: find different way since this somehow doesn't seem to work :(
      this.numberInput = numberInput;

      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
         
      let middleContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox());
      middleContainer.setDecorator("main");
      mainContainer.add(middleContainer, { flex: 1 });
      this.chatUI = new myapp.ChatUI(middleContainer, this);

      let rightPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox(10));
      rightPanel.setPadding(10);
      rightPanel.setWidth(300);
      rightPanel.setDecorator("main");
      middleContainer.add(rightPanel);

      let reportNames = await this.recvReports();
      let reportUIs = [];      
      log(reportNames);
      reportNames.forEach((name, index) => 
      {
        let reportUI = new myapp.ReportUI(name, rightPanel, this);
        reportUIs.push(reportUI);
      });
      this.reportUIs = reportUIs;

      this.templates = await this.recvReportTemplates();

      makeButton(topPanel, "Download Attachments...", () => this.downloadAttachments(),           themeButtonColor(), 16, this);
      makeButton(topPanel, "Download Reports...",     () => this.createZipFromReports(reportUIs), themeButtonColor(), 16, this);
      makeButton(topPanel, " ", () => this.toggleTheme(), themeButtonColor(), 16, this);

      this.loginButton = makeButton(topPanel, "Login", () => this.handleLoginLogout(), "#ffcccc", 16);
      this.planetIcon = new qx.ui.basic.Image("myapp/Earth.png");
      //log("Planet padding = " + this.planetIcon.getPaddingTop()); 
      //this.planetIcon.setPadding(0);
      topPanel.add(this.planetIcon);

      if (queryParams.user) 
        await this.attemptLogin(queryParams.user, "word"); //TODO: disable autologin before release
      else
        this.openLoginDialog();
      // Unfortunately we don't know what planet we are on until after we complete the login, and without knowing the
      // planet we don't what to do with incoming reports.  So we can start listeners and such but they can't do...anything
      // until the login is done.
      //await this.changeSol(this, getCurrentSolNum(this.startDay));

    }, //-------------- end of main()

    sleep(ms) { return new Promise((resolve) => { setTimeout(resolve, ms); }); },

    getReportUIbyName(name)
    {
      const reportUIs = this.reportUIs;
      for (let i = 0; i < reportUIs.length; i++)
        if (reportUIs[i].name === name) return reportUIs[i];
      return null;
    },

    syncDisplay() 
    { 
      const sol = this.sol;
      
      log("this display styncs");
      this.chatUI.changeSol(sol.ims);

      const reportUIs = this.reportUIs;
      for (let i = 0; i < reportUIs.length; i++)
        reportUIs[i].reset();
      
      for (let i = 0; i < sol.reports.length; i++)
      {
        const reportUI = this.getReportUIbyName(sol.reports[i].name);
        if (reportUI)
        {       
          log("update ReportUI for " + sol.reports[i].name);
          reportUI.update(sol.reports[i]);
        }
      }
    },

    toggleTheme() 
    { 
      theme = theme ? 0 : 1; 
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("theme", theme);
      window.location.href = currentUrl.toString();
    },

    getUiSolNum() { return this.solNum; },
    isCurrentSol() { return getSolNum() === this.solNum },

    async changeSol(that, solNum) 
    { 
      that.solNum = solNum;
      log("Sol supposedly set to " + that.solNum);
      const sol = await that.recvSol(solNum);
      //log(sol); 
      that.sol = sol;
      that.syncDisplay();
    },    

    addContent(chatPanel, numberInput) 
    {
      let number = numberInput.getValue();
      for (let i = 0; i < number; i++) {
        let newMessage = new qx.ui.basic.Label(`New message ${i + 1}`);
        chatPanel.add(newMessage);
      }
    },

    doMessage(chatPanel, chatInput) 
    {
      let message = chatInput.getValue().trim();
      if (!message) 
      {
        alert("Please enter a message.");
        return;
      }

      // Simple markdown and emoticon parsing
      let formattedMessage = this.parseMessage(message);
      let newMessage = new qx.ui.basic.Label().set({ value: formattedMessage, rich: true });
      chatPanel.add(newMessage);
      chatInput.setValue("");
      this.sendIM(formattedMessage);
    },

    parseMessage(message) 
    {
      // Replace basic emoticons
      message = message.replace(/:\)/g, '😊');
      message = message.replace(/:\(/g, '😞');

      // Replace markdown formatting
      message = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      message = message.replace(/__(.*?)__/g, '<em>$1</em>');
      message = message.replace(/`(.*?)`/g, '<code>$1</code>');

      return message;
    },

    //--------------------------------------------------------------------------------------------
    // networking/server comms

    async doGET(endpoint)
    {
      
      log("GETsome: " + endpoint);
      try 
      {
        const response = await fetch(urlPrefix + endpoint, 
        {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        });

        if (response.ok) 
        {
            const result = await response.json();            
            log('GET succcessful: ' + JSON.stringify(result));
            return result;
        } else 
        {
            alert('GET most epically failed.');
            alert(JSON.stringify(response));
        }
      } catch (error) { console.error('GETsome exception:', error); }
      return null;

    },

    async doPOST(endpoint, body, contentType)
    {
      contentType = contentType || "application/json";
      if (endpoint !== 'login')
      {
        body.username = username;
        body.token = this.token;
      }
      
      log("POSTality: " + JSON.stringify(body));
      try 
      {
        const response = await fetch(urlPrefix + endpoint, 
        {
          method: 'POST',
          //mode: 'no-cors', // this fixes CORS problems but introduces other problems -- DON'T USE
          headers: { 'Content-Type': contentType },
          body: JSON.stringify(body)
        });

        if (response.ok) 
        {
          const result = await response.json(); // text();
          log('POST succcessful: ' + JSON.stringify(result));
          return result;
        } else 
        {          
          log('POST most epically failed.');
          log(JSON.stringify(response));
        }
      } catch (error) { console.error('POSTal exception:', error); }
      return null;
    },

    async sendIM(im)
    {
      const body = { message: im.content };
      this.doPOST('ims', body);
    },

    async sendLogin(username, password)
    {
      const body = { username: username, password, password };
      return await this.doPOST('login', body);
    },

    async sendReport(report)
    {
      const body = 
      {
        reportName: report.name,
        content: report.content, // fileContent
        approved: report.approved,
        attachments: report.attachments,
      };
      this.doPOST('reports/update', body);
    },

    async sendAttachment(reportName, filename, content)
    {
      const body = 
      {
        reportName: reportName,
        filename: filename,
        content: content, 
      };
      this.doPOST('reports/add-attachment', body);
    },

    async sendAttachments(report, files)
    {
      log("sending " + files.length + " dataers");
      var formData = new FormData();
      for (let i = 0; i < files.length; i++)
        formData.append("files", files[i]);
      formData.append("reportName", report.name);
      formData.append("username", username);
      formData.append("token", this.token);
    
      var req = new qx.io.request.Xhr(urlPrefix + 'attachments');
      req.setMethod("POST");
      //req.setRequestHeader("Content-Type", "multipart/form-data");
      req.setRequestData(formData);
      
      req.addListener("success", function(e) { 
        log("Upload successfoo!"); } );
      req.addListener("fail",    function(e) { console.error("Upload failed miserably:", e); } );
    
      req.send();
      //req.dispose();
    },

    async transmitReport(report)
    {
      const body = { };
      this.doPOST('reports/transmit/' + report.name, body);
    },

    async recvSol(solNum) 
    { 
      const sol = await this.doGET('sols/' + solNum);
      sol.reports = (planet === "Earth") ? sol.reportsEarth : sol.reportsMars;
      for (let i = 0; i < sol.ims.length; i++)
        sol.ims[i].xmitTime = new Date(sol.ims[i].xmitTime);
      for (let i = 0; i < sol.reports.length; i++)
        sol.reports[i].xmitTime = new Date(sol.reports[i].xmitTime);
      return sol; 
    },

    async recvReports()         { return  await this.doGET('reports'); },
    async recvCommsDelay()      { return (await this.doGET('comms-delay')).commsDelay; },
    async recvCrewNum()         { return (await this.doGET('crew-num')).crewNum; },
    async recvRotationLength()  { return (await this.doGET('rotation-length')).rotationLength; },
    async recvRefDate()         { return (await this.doGET('ref-date')).refDate; },
    async recvReportTemplates() { return  await this.doGET('reports/templates'); },
    async recvAttachments()     { return  await this.doGET('attachments/' + planet + '/' + getSolNum()); },
    

    //--------------------------------------------------------------------------------------------
    // login

    handleLoginLogout() 
    {
      if (this.isLoggedIn) 
      {
        // Display logout menu
        let menu = new qx.ui.menu.Menu();
        let logoutButton = new qx.ui.menu.Button("Log out");
        logoutButton.addListener("execute", () => this.logout());
        menu.add(logoutButton);
        menu.setOpener(this.loginButton);
        menu.open();
        //menu.placeToWidget(this.__loginButton); // this doesn't seem to be necessary when using setOpener
      }
      else 
        this.openLoginDialog();
    },

    openLoginDialog() 
    {
      let loginDialog = new qx.ui.window.Window("Login");
      loginDialog.setLayout(new qx.ui.layout.VBox(10));
      loginDialog.setModal(true);
      loginDialog.setShowMinimize(false);
      loginDialog.setShowMaximize(false);
      loginDialog.setWidth(300);
      loginDialog.setHeight(200);

      let usernameInput = new qx.ui.form.TextField();
      usernameInput.setPlaceholder("Username");
      loginDialog.add(usernameInput);

      let passwordInput = new qx.ui.form.PasswordField();
      passwordInput.setPlaceholder("Password");
      loginDialog.add(passwordInput);

      let buttonContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(10, "right"));
      loginDialog.add(buttonContainer);

      let loginButton = new qx.ui.form.Button("Login");
      loginButton.addListener("execute", () => this.attemptLogin(usernameInput.getValue(), passwordInput.getValue(), loginDialog));
      buttonContainer.add(loginButton);

      //let cancelButton = new qx.ui.form.Button("Cancel");
      //cancelButton.addListener("execute", () => loginDialog.close());
      //buttonContainer.add(cancelButton);

      loginDialog.center();
      loginDialog.open();
    },

    async attemptLogin(usernameIn, password, loginDialog) 
    {
      const result = await this.sendLogin(usernameIn, password);
      if (result && result.token)
      {
        this.isLoggedIn = true;
        username = usernameIn;
        planet = result.planet;
        this.token = result.token;
        this.loginButton.setLabel(username + '[' + planet + ']');
        const planetIconFile = planet === "Mars" ? "myapp/Mars.png" : "myapp/Earth.png";
        this.planetIcon.setSource(planetIconFile);
        const tpcolor = theme ? (planet === "Mars" ? "#ffeeee" : "#eeeeff") : (planet === "Mars" ? "#220000" : "#000022");
        this.topPanel.setBackgroundColor(tpcolor);

        if (loginDialog) loginDialog.close();
        // now that we're logged in we can finish the startup
        await this.changeSol(this, getSolNum());
        this.numberInput.setValue(getSolNum());

        setBGColor(this.loginButton, themeButtonColor());

        // set up server-sent events
        // eventSource is tied to login because the planet can change
        this.eventSource = new EventSource(urlPrefix + 'events/' + planet);
        this.eventSource.onmessage = function(event) 
        {          
          log("SSE received!!!!");
          log(event.data);
          const obj = JSON.parse(event.data);
          if (app.isCurrentSol() /* && obj.user !== username */) // ignore new messages if we aren't looking at the current Sol, or they they are coming from us 
            if (obj.type === "IM")
            {
              obj.xmitTime = new Date(obj.xmitTime); // ALWAYS have to fix the faruking date.  ALWAYS
              app.chatUI.addIM(obj);
              app.chatUI.ims.push(obj);
            }
            else if (obj.type === "Report")
            {
              obj.xmitTime = new Date(obj.xmitTime); // ALWAYS have to fix the faruking date.  ALWAYS
              app.getReportUIbyName(obj.name).update(obj);
            }
        }
      } 
      else if (result && result.message)
        alert(result.message);
      else 
        alert("Login failure for " + usernameIn);
    },

    logout() 
    {
      this.eventSource.close();
      this.eventSource = null;
      this.isLoggedIn = false;
      username = null;
      planet = null;
      this.loginButton.setLabel("Login");
      setBGColor(this.loginButton, "#ffcccc");
      this.openLoginDialog();
    },

    //--------------------------------------------------------------------------------------------
    // other

    async createZipFromReports(reportUIs) 
    {
      // Create a new JSZip instance      
      log("create zip from " + reportUIs.length + " RUIs");
      const zip = new JSZip();

      // Add each object as a file to the zip
      reportUIs.forEach(reportUI => 
      {
        log("  RUI " + reportUI.name);
        const report = reportUI.report;
        if (report)
        {
          const fileName = `${report.name}.txt`;
          zip.file(fileName, report.content);
        }
      });

      const attachments = await this.recvAttachments();
      attachments.forEach(attachment =>
      {
        const fileName = attachment.reportName + '/' + attachment.filename;
        zip.file(fileName, attachment.content, {base64: true} );
      });

      // Generate the zip file
      const zipBlob = await zip.generateAsync( { type: "blob" } );

      // Create a download link for the zip file
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(zipBlob);
      downloadLink.download = "reports.zip";

      // Trigger the download
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      log("RUIs are DONE DUDE");
    },

    async downloadAttachments()
    {
      const href = 'attachments/zip/' + planet + '/' + this.getUiSolNum();
      const filename = 'attachments' + this.getUiSolNum() + planet + '.zip';
      doDownload(href, filename);
    }
  }
});



//////////////////////////////////////////////////////////////////////////////////////////////////

qx.Class.define("myapp.ChatUI", 
{ extend: qx.core.Object, 
  construct: function(parentContainer) 
  {
    const that = this;

    let chatContainer = new qx.ui.container.Composite(new qx.ui.layout.VBox());
    chatContainer.setDecorator("main");
    chatContainer.setWidth(400);
    parentContainer.add(chatContainer, { flex: 3 });

    let chatPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox());
    chatPanel.setPadding(10);
    this.chatPanel = chatPanel;
    chatPanel.setDecorator("main");
    chatPanel.getContentElement().addClass("background-composite"); // sets CSS class defined in index.html
    /*chatPanel.getContentElement().setStyles(
    {
      "background-image": "url(resource/myapp/MDRS-2017.jpg)",
      "background-size": "cover", // Ensures the image covers the entire container
      "background-repeat": "no-repeat",
      "background-position": "center",
      "background-opacity": "0.25" // Adjust this value to set the desired transparency
    });*/
    chatContainer.add(chatPanel, { flex: 2 });
    let chatScroll = new qx.ui.container.Scroll();
    chatScroll.add(chatPanel);
    chatContainer.add(chatScroll, { flex: 1 });

    let chatInputContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    chatInputContainer.setPadding(10);
    chatContainer.add(chatInputContainer);
  
    let chatInput = new qx.ui.form.TextField();
    this.chatInput = chatInput;
    chatInput.setBackgroundColor(themeBgColor());
    chatInput.setTextColor(themeStdText());
    chatInput.setPlaceholder("Type a message...");
    chatInput.addListener("keypress", function(e) 
      { if (e.getKeyIdentifier() === "Enter") { that.doMessage(that); } } );
    chatInputContainer.add(chatInput, { flex: 1 });

    makeButton(chatInputContainer, "Send", () => this.doMessage(this), themeButtonColor(), 14, this);
  },

  /* scenarios: 
  ** SolNum changed (changeSol())
  **   clear IMs
  **   populate IMs, starting any animations
  ** Message submitted (doMessage())
  **   create new IM
  **   put IM in window, statting animation
  **   push IM to server
  */
  members: 
  {
    chatPanel: null,

    reset() { try { this.chatPanel.removeAll(); } catch (e) { log("clean et up"); } this.ims = null; },

    changeSol(ims)
    { 
      log("changing Sol to " + app.getUiSolNum() + "; update chat with " + ims.length + " ims");
      log("currentSolNum is " + getSolNum());
      this.reset();
      this.ims = ims;
      const isCurrentSol = getSolNum() === app.getUiSolNum();
      this.chatInput.setEnabled(isCurrentSol);
      for (let i = 0; i < ims.length; i++)
        this.addIM(ims[i]);
    },

    addIM(im)
    {
      
      log("addIM: " + im.content + " from planet " + im.planet + " (we are on " + planet + ")");
      if (!im.content) return;

      
      log("  commsDelay=" + commsDelay + ", tit=" + timeInTransit(im));
      const timeRemaining = commsDelay - timeInTransit(im);
      if (im.planet === planet || !inTransit(im))
      {
        let container = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    
        const str = '<b>' + im.user + '</b> <font size="-2">' + (new Date()).toString() + ':</font><br>' + im.content + '<br> <br>';
        const label = new qx.ui.basic.Label().set( { value: str, rich: true });
        const color = theme ? ((im.user === username) ? "#0000bb" : "black") : (im.user === username) ? "#9999ff" : "white";
        label.setTextColor(color);
        label.setFont(new qx.bom.Font(16, ["Arial"]));
        container.add(label);  
        log("  still in transit!")
        log("time since sent is " + timeSinceSent(im.xmitTime));
        if (inTransit(im)) 
          startXmitProgressDisplay(timeRemaining, container, 55);
        this.chatPanel.add(container);
      }
      else // IM is NOT from this planet and has not yet arrived, so wait for it
      {        
        log("scheduling IM arrival in " + timeRemaining);
        setTimeout(() => this.addIM(im), timeRemaining*1000);
      }
    },

    doMessage(that) 
    {
      let message = that.chatInput.getValue();
      if (message === null) return;
      message = message.trim();
      
      log("doing message: " + message);
      if (!message) 
      {
        alert("Please enter a message.");
        return;
      }

      that.chatInput.setValue("");
      let formattedMessage = that.parseMessage(message);
      const im = newIM(formattedMessage);
      
      log(im);
      //that.addIM(im);    // don't need to add locally as we'll add it on the SSE
      that.ims.push(im);   // add IM to local model
      app.sendIM(im); // send IM to server
    },

    doMessages(that)
    {
      for (let i = 0; i < 15; i++)
      {
        that.doMessage(that);
        that.chatInput.setValue("peat and repeat");
      }
    },

    parseMessage(message) 
    {
      // Replace basic emoticons
      message = message.replace(/:\)/g, '😊');
      message = message.replace(/:\(/g, '😞');

      // Replace markdown formatting
      message = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      message = message.replace(/__(.*?)__/g, '<em>$1</em>');
      message = message.replace(/`(.*?)`/g, '<code>$1</code>');
      return message;
    },
  }
});

/* What exactly does it mean to transmit an IM or report? The design for these two types of objects
is different, for some intrinsic reasons.  IMs are simpler because there aren't multiple versions -- 
an IM is either transmitted or it isn't, and IMs are automatically transmitted when created/"sent".
Therefore, it is simple to make all clients see all IMs, and simply not show those that originate 
from a different planet and haven't been received.

The IM solution unfortunately doesn't work for Reports, which can be altered even after being 
transmitted, and can then be re-transmitted.  That means that there can be several versions of a
report floating around -- each planet has its own current version (which may be the same or 
different from the other planet), and in addition there can be one or more versions in transit.

After some consideration, going to try the following scheme: each planet has a single current
version that is either the latest version or the latest received version.  In addition there is a
queue of versions that have been transmitted but not received.  Either the server or the client
could manage that, but going to try first with the server.  Actually it is hard to avoid using the
server because a new client could appear at any time so the full state needs to be on the server.
It's somewhat unlike the solution for IMs, but it is more authentic and perhaps simpler.

On the server, the "current" Reports (both Earth and Mars) are never created (except at server 
startup) or destroyed.  Reports in transit *are* created and destroyed, and their contents are
copied on arrival.

When a report is updated, it is immediately sent by SSE to other clients on the same planet.
When a report is transmitted, a copy is made and put in a queue while on the way to the other
planet.  After it arrives, the current version for the other planet is updated. 
*/

qx.Class.define("myapp.ReportUI", 
{ extend: qx.core.Object, 
  construct: function(name, parentContainer) 
  {
    const that = this;
    this.base(arguments); // call superclass constructor
    this.name = name;

    let container = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    parentContainer.add(container);
    this.container = container;

    let fsb = new qx.ui.form.FileSelectorButton("Upload...");
    fsb.setMultiple(true);
    fsb.addListener("changeFileSelection", function(e) 
    {
      let files = e.getData();
      
      log("there are actually " + files.length + " attachments");
      app.sendAttachments(that.report, files);
    }, this);
    container.add(fsb);
    //fsb.setEnabled(false); // disabling the FileSelectorButton somehow prevents it working properly even after it's re-enabled
    this.fsButton = fsb;

    this.amanButton = makeButton(container, "00", () => that.openAttachManager(), themeButtonColor(), 14, this);
    const cimage = "myapp/copyIcon.png";
    const pimage = "myapp/pasteIcon.png";
    this.copyButton = makeButton(container, null, () => navigator.clipboard.writeText(that.report.content), themeButtonColor(), 14, this, cimage);
    this.pasteButton = makeButton(container, null, () => that.setContentFromBored(), "gray", 14, this, pimage);

    this.editButton = makeButton(container, "Edit", () => that.openReportEditor(), "gray", 14, this);

    this.approveButton = new qx.ui.form.CheckBox("Approve");
    this.approveButton.addListener("execute", () => { this.report.approved = this.approveButton.getValue() ? true : false; this.onChange(); })
    container.add(this.approveButton);

    function onXmit()
    { 
      that.report.transmitted = true;
      that.report.xmitTime = new Date();
      app.transmitReport(that.report); // tell server to send report to other planet
      //that.realizeState("Transmitted"); // SSE will cause UI to be updated
    }
    this.txButton = makeButton(container, "Transmit", onXmit, "gray", 14, this);
    this.txButton.setEnabled(false);

    this.label = makeLabel(container, name, "gray", 18);
    this.label.setWidth(100);
    this.slabel = makeLabel(container, "TODO", "gray", 14);
    //this.slabel.setTextAlign("right");
  },
  
  members: 
  {
    name:       null,
    container:  null,
    icon:       null,
    fsButton:   null,
    amanButton: null,
    editButton: null,
    approveButton: null,
    txButton:   null,
    label:      null,
    slabel:     null,

    state: "Unused", // ReportUI states: Unused, Empty, Populated, Transmitted, Received, Approved
    report: null,

    reset() { /* log("reset"); */ this.realizeState("Unused"); },

    xmitDone(container) 
    { 
      if (this.report.approved)
        this.realizeState("Approved");
      else
        this.realizeState("Received");
    },

    onChange() 
    { 
      
      log("something changed, Holmez");
      app.sendReport(this.report);
      //this.realizeState(); // SSE will cause UI to be updated
    },

    update(report) // called when the SolNum is changed, and when a transmitted Report arrives 
    { //  instead of copying state out, we need to keep a reference to the report so that we can later update it e.g. when the xmit button is pressed
      if (report.transmitted) log("changeSol => new report incoming: " + report.name);
      this.report = report;
      if (this.xmitProgress) this.xmitProgress.forceDone();
      this.realizeState();
    },

    isCurrentSol() { return getSolNum() === app.getUiSolNum() },

    computeState()
    {
      if (this.report.transmitted) 
      log("compute this: " + JSON.stringify(this.report));
      if (this.report.transmitted) 
      log("transmitted..." + this.report.xmitTime.toString() + " " + commsDelayPassed(this.report.xmitTime, this.commsDelay));
      if (this.report.transmitted) 
        if (commsDelayPassed(this.report.xmitTime)) 
          if (this.report.approved) return "Approved";
          else return "Received";
        else return "Transmitted";

      if (this.report.content) return "Populated";
      else return "Empty";
    },

    realizeState(forcedState)
    {
      const isCurrentSol = this.isCurrentSol();
      this.state = forcedState ? forcedState : this.computeState();
      if (this.report && this.report.transmitted) 
      log("realizing new state: " + this.state + ", isCurrentSol=" + isCurrentSol);
      const viewEnabled = this.state !== "Unused"; // edit button now works in View mode for non-current Sols
      const editEnabled = viewEnabled && isCurrentSol;
      const aprvEnabled = editEnabled && (this.state === "Received" || this.state === "Approved");
      const editBgColor = editEnabled ? themeButtonColor() : "#cccccc";
      const txEnabled = isCurrentSol && editEnabled && this.state !== "Empty";
      const txBgColor = txEnabled ? themeButtonColor() : "#cccccc";
      if (this.fsButton)      {      this.fsButton.setEnabled(editEnabled); setBGColor(this.fsButton,      editBgColor); }
      if (this.editButton)    {    this.editButton.setEnabled(viewEnabled); setBGColor(this.editButton,    editBgColor); }
      if (this.approveButton) { this.approveButton.setEnabled(aprvEnabled); setBGColor(this.approveButton, editBgColor); }
      if (this.txButton)      {      this.txButton.setEnabled(txEnabled);   setBGColor(this.txButton,      txBgColor); }

      if (planet === "Earth") this.approveButton.setVisibility("visible");
      else                    this.approveButton.setVisibility("excluded");

      const editStr = isCurrentSol ? "Edit..." : "View...";
      this.editButton.setLabel(editStr);

      let n = 0;
      if (this.report && this.report.attachments) n = this.report.attachments.length;
      const str = (n < 10) ? "0" + n : n.toString();
      this.amanButton.setLabel(str);

      let color;
      if      (this.state === "Unused")      color = "gray";
      else if (this.state === "Empty")       color = "orange";
      else if (this.state === "Populated")   color = themeBlueText();
      else if (this.state === "Transmitted") color = "purple";
      else if (this.state === "Approved")    color = "green";
      else if (this.state === "Received" && planet === "Mars" && this.report.authorPlanet === "Earth") color = "red";
      else if (this.state === "Received")    color = "#20f0f0"; // teal

      if (this.label) this.label.setTextColor(color);

      if (this.slabel)
      {
        let slabelTxt = this.state;
        if (this.state === "Empty") slabelTxt = "TODO";
        else if (this.state === "Populated") slabelTxt = "Filled";
        else if (this.state === "Received" && planet === "Mars" && this.report.authorPlanet === "Earth") slabelTxt = "Rejected";
        this.slabel.setValue(slabelTxt);
      }
      if (this.state === "Transmitted" && this.report && inTransit(this.report)) 
        this.xmitProgress = startXmitProgressDisplay(commsDelay, this.container, 33, (container) => this.xmitDone(container));
    },

    openReportEditor()
    {
      // Create and open the CKEditor window
      const content = this.report.content || app.templates[this.name];
      let ckEditorWindow = new myapp.CKEditorWindow(this, content, this.isCurrentSol());
      ckEditorWindow.open();
      //doc.add(ckEditorWindow);      
    },

    openAttachManager()
    {
      const attachments = this.report.attachments;
      let attachManager = new myapp.AttachmentManager(this, attachments, this.isCurrentSol());
      attachManager.center();
      attachManager.open();
    },

    removeAttachment(attachment)
    {
      this.report.attachments.splice(this.report.attachments.indexOf(attachment), 1);
      log("removing attachment -- after: ");
      log(this.report.attachments);
    },

    setContent(content)
    {      
      log("setting model content: " + content);
      this.report.content = content;
      this.onChange();
    },

    async setContentFromBored() 
    { 
      if (navigator)
        if (navigator.clipboard)
          this.setContent(await navigator.clipboard.readText());
        else
          log("the bored is busted");
      else
        log("no navigator...I'm lost"); 
    },

  }
});


//////////////////////////////////////////////////////////////////////////////////////////////////

const editorConfig = 
{
	toolbar: 
  {
		items: 
    [
      'undo', 'redo', '|', 'findAndReplace', 'selectAll',	'|', 'heading', 'style', '|',	
      'fontSize', 'fontFamily', 'fontColor', 'fontBackgroundColor', '|', 
      'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript', 'code', 'removeFormat', '|',
			'specialCharacters', 'horizontalLine', 'pageBreak', 'link', 'insertTable', 'highlight', 'blockQuote', 'codeBlock', '|',
			'alignment', '|', 'bulletedList', 'numberedList', 'outdent', 'indent', '|',	'accessibilityHelp'
		],
		shouldNotGroupWhenFull: true
	},

	plugins: 
  [
		CKEDITOR.AccessibilityHelp, CKEDITOR.Alignment, CKEDITOR.Autoformat, CKEDITOR.AutoImage, CKEDITOR.AutoLink, CKEDITOR.Autosave, CKEDITOR.BlockQuote, CKEDITOR.Bold, CKEDITOR.CloudServices,	CKEDITOR.Code,	CKEDITOR.CodeBlock,
		CKEDITOR.Essentials,	CKEDITOR.FindAndReplace,	CKEDITOR.FontBackgroundColor, CKEDITOR.FontColor,	CKEDITOR.FontFamily,	CKEDITOR.FontSize,	CKEDITOR.GeneralHtmlSupport,	CKEDITOR.Heading, CKEDITOR.Highlight, CKEDITOR.HorizontalLine,
		CKEDITOR.ImageBlock,	CKEDITOR.ImageCaption,	CKEDITOR.ImageInline, CKEDITOR.ImageInsertViaUrl,	CKEDITOR.ImageResize, CKEDITOR.ImageStyle, CKEDITOR.ImageTextAlternative, CKEDITOR.ImageToolbar, CKEDITOR.ImageUpload,	
    CKEDITOR.Indent,	CKEDITOR.IndentBlock, CKEDITOR.Italic, CKEDITOR.Link, CKEDITOR.LinkImage, CKEDITOR.List,	CKEDITOR.Markdown, CKEDITOR.Mention, CKEDITOR.PageBreak,	CKEDITOR.Paragraph, CKEDITOR.PasteFromMarkdownExperimental, CKEDITOR.PasteFromOffice,
		CKEDITOR.RemoveFormat,	CKEDITOR.SelectAll, CKEDITOR.SpecialCharacters,	CKEDITOR.SpecialCharactersArrows, CKEDITOR.SpecialCharactersCurrency,	CKEDITOR.SpecialCharactersEssentials, CKEDITOR.SpecialCharactersLatin,
		CKEDITOR.SpecialCharactersMathematical, CKEDITOR.SpecialCharactersText,	CKEDITOR.Strikethrough, CKEDITOR.Style,	CKEDITOR.Subscript, CKEDITOR.Superscript,
		CKEDITOR.Table, CKEDITOR.TableCaption, CKEDITOR.TableCellProperties, CKEDITOR.TableColumnResize, CKEDITOR.TableProperties,	CKEDITOR.TableToolbar,	CKEDITOR.TextTransformation,	CKEDITOR.Underline, CKEDITOR.Undo
	],

	fontFamily: {	supportAllValues: true },

  fontSize: {	options: [10, 12, 14, 'default', 18, 20, 22],	supportAllValues: true },

  heading: { options: 
  [
    {	model: 'paragraph',		              title: 'Paragraph',		class: 'ck-heading_paragraph'	},
    {	model: 'heading1',		view: 'h1',   title: 'Heading 1',		class: 'ck-heading_heading1'	},
    {	model: 'heading2',		view: 'h2',		title: 'Heading 2',		class: 'ck-heading_heading2'	},
    {	model: 'heading3',		view: 'h3',		title: 'Heading 3',		class: 'ck-heading_heading3'	},
    { model: 'heading4',		view: 'h4',		title: 'Heading 4',		class: 'ck-heading_heading4'	},
    {	model: 'heading5',		view: 'h5',		title: 'Heading 5',		class: 'ck-heading_heading5'	},
    {	model: 'heading6',		view: 'h6',		title: 'Heading 6',		class: 'ck-heading_heading6'	}
  ] },

	htmlSupport: { allow: [	{	name: /^.*$/,	styles: true,	attributes: true,	classes: true	}	]	},

	image: { toolbar: ['toggleImageCaption',	'imageTextAlternative',	'|', 'imageStyle:inline',	'imageStyle:wrapText', 'imageStyle:breakText', '|',	'resizeImage'	]	},

  initialData: '<h2>Congratulations on setting up CKEditor 5! 🎉</h2>\n<p>\n    You\'ve successfully created a CKEditor 5 project. This powerful text editor will enhance your application, enabling rich text editing\n    capabilities that are customizable and easy to use.\n</p>\n<h3>What\'s next?</h3>\n<ol>\n    <li>\n        <strong>Integrate into your app</strong>: time to bring the editing into your application. Take the code you created and add to your\n        application.\n    </li>\n    <li>\n        <strong>Explore features:</strong> Experiment with different plugins and toolbar options to discover what works best for your needs.\n    </li>\n    <li>\n        <strong>Customize your editor:</strong> Tailor the editor\'s configuration to match your application\'s style and requirements. Or even\n        write your plugin!\n    </li>\n</ol>\n<p>\n    Keep experimenting, and don\'t hesitate to push the boundaries of what you can achieve with CKEditor 5. Your feedback is invaluable to us\n    as we strive to improve and evolve. Happy editing!\n</p>\n<h3>Helpful resources</h3>\n<ul>\n    <li>📝 <a href="https://orders.ckeditor.com/trial/premium-features">Trial sign up</a>,</li>\n    <li>📕 <a href="https://ckeditor.com/docs/ckeditor5/latest/installation/index.html">Documentation</a>,</li>\n    <li>⭐️ <a href="https://github.com/ckeditor/ckeditor5">GitHub</a> (star us if you can!),</li>\n    <li>🏠 <a href="https://ckeditor.com">CKEditor Homepage</a>,</li>\n    <li>🧑‍💻 <a href="https://ckeditor.com/ckeditor-5/demo/">CKEditor 5 Demos</a>,</li>\n</ul>\n<h3>Need help?</h3>\n<p>\n    See this text, but the editor is not starting up? Check the browser\'s console for clues and guidance. It may be related to an incorrect\n    license key if you use premium features or another feature-related requirement. If you cannot make it work, file a GitHub issue, and we\n    will help as soon as possible!\n</p>\n',

  link: 
  {
		addTargetToExternalLinks: true,
		defaultProtocol: 'https://',
		decorators: {	toggleDownloadable: {	mode: 'manual',	label: 'Downloadable',	attributes: {	download: 'file' } } }
	},

  mention: { feeds: [	{	marker: '@',	feed: [	/* See: https://ckeditor.com/docs/ckeditor5/latest/features/mentions.html */ ] } ] },

  placeholder: 'Type or paste your content here!',

  style: { definitions: [
    {	name: 'Article category',	element: 'h3',	        classes: ['category']	},
    {	name: 'Title',			      element: 'h2',	        classes: ['document-title']	},
    {	name: 'Subtitle',   			element: 'h3',	        classes: ['document-subtitle'] },
    {	name: 'Info box',     		element: 'p',		        classes: ['info-box']	},
    {	name: 'Side quote',   		element: 'blockquote',	classes: ['side-quote']	},
    {	name: 'Marker',       		element: 'span',				classes: ['marker']	},
    {	name: 'Spoiler',    			element: 'span',				classes: ['spoiler'] },
    { name: 'Code (dark)',  		element: 'pre', 				classes: ['fancy-code', 'fancy-code-dark'] },
    {	name: 'Code (bright)',		element: 'pre', 				classes: ['fancy-code', 'fancy-code-bright'] }
	] },

	table: { contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells', 'tableProperties', 'tableCellProperties'] }
};


qx.Class.define("myapp.CKEditor", 
{ extend: qx.ui.core.Widget,
  construct: function(afterInit) 
  {
    this.base(arguments);
    this._setLayout(new qx.ui.layout.Grow());
    this.afterInit = afterInit;
    this.addListenerOnce("appear", this.initCKEditor, this); // Add an appear listener to initialize CKEditor
    this.addListener("resize", this.onResize, this); // Add a resize listener to adjust CKEditor height
  },

  members: 
  {
    editor: null,
    editorId: null,
    afterInit: null,

    _createContentElement: function () // override -- do NOT rename
    {
      // Create a div with a unique ID for CKEditor to attach to
      this.editorId = "ckeditor-" + this.toHashCode();
      let div = new qx.html.Element("div", null, 
      {
        "id": this.editorId,
        "style": "height:100%;"
      });

      return div;
    },

    initCKEditor: function () 
    {
      // Initialize CKEditor with the unique ID
      let editorElement = document.getElementById(this.editorId);
      //this.editor = CKEDITOR.replace(editorElement, { height: '100%', versionCheck: false } ); // CKEditor 4 version
      CKEDITOR.ClassicEditor.create(editorElement, /*document.querySelector('#' + this.editorId),*/ editorConfig, 
      /*{
        plugins: [ CKEDITOR.Essentials, CKEDITOR.Paragraph, CKEDITOR.Bold, CKEDITOR.Italic, CKEDITOR.Font ],
        toolbar: [ 'undo', 'redo', '|', 'bold', 'italic', '|', 'fontSize', 'fontFamily', 'fontColor', 'fontBackgroundColor' ],
        minHeight: '600px'
      }*/)
      .then( editor => { console.log('Editor was initialized', editor); this.editor = editor; })
      .catch( error => { console.error(error); });

      qx.event.Timer.once(() => 
      { // Explicitly focus the editor after initialization
        if (this.afterInit) this.afterInit(); 
        this.editor.focus();
        this.updateEditorHeight();
      }, this, 600);
    },

    onResize: function () { this.updateEditorHeight(); },

    updateEditorHeight: function () 
    {
      if (this.editor) 
      {
        //let containerHeight = this.getContentElement().getDomElement().clientHeight;
        let containerHeight = this.getBounds().height - 90;
        log("winder size: " + containerHeight);
        //this.editor.resize('100%', containerHeight); // for CKEditor4
        this.editor.ui.view.editable.element.style.minHeight = containerHeight + 'px';
        this.editor.ui.view.editable.element.style.maxHeight = containerHeight + 'px';
      }
    },

    replacePlaceholders: function (str)
    {
      str = str.replace("{crewNum}", crewNum);
      str = str.replace('{date}', new Date().toDateString());
      str = str.replace('{solNum}', getSolNum());
      return str;
    },

    // Method to set data into the editor
    setContent: function (data) 
    { 
      log("setting editor content: " + data); 
      log("this.editor " + this.editor);
      data = this.replacePlaceholders(data);
      if (this.editor) 
        this.editor.setData(data);
      else 
        this.addListenerOnce("editorReady", () => { this.editor.setData(data); } );
    },
    
    // Method to get data from the editor
    getContent: function () 
    {
      if (this.editor) 
        return this.editor.getData();
      return "";
    }
  }
});

qx.Class.define("myapp.CKEditorWindow", 
{ extend: qx.ui.window.Window,
  construct: function(parent, content, canEdit) 
  {
    this.base(arguments, "CKEditor");
    this.setLayout(new qx.ui.layout.Dock());
    this.setWidth(800);
    this.setHeight(600);
    this.center();

    this.parent = parent;
    
    log("new editor with content:\n" + content);
    // Add the CKEditor to the window and set content after the editor is actually created
    const ckEditor = new myapp.CKEditor(function () { ckEditor.setContent(content); });
    this.ckEditor = ckEditor;
    this.add(this.ckEditor);

    // Enable focus for the window
    this.setModal(true);
    this.setAllowClose(true);
    this.setAllowMinimize(false);

    let toolbar = new qx.ui.toolbar.ToolBar();
    if (canEdit)
    {
      let okButton = new qx.ui.toolbar.Button("OK");
      okButton.addListener("execute", this.onOK, this);
      toolbar.add(okButton);
    }
    let cancelButton = new qx.ui.toolbar.Button("Cancel");
    cancelButton.addListener("execute", this.onCancel, this);
    toolbar.add(cancelButton);

    this.add(toolbar, { edge: "south" });
  },

  members: 
  {
    ckEditor: null,
    parent: null,

    onOK: function() 
    {
      let content = this.ckEditor.getContent();
      log("onOK setting content: " + content);
      this.parent.setContent(content);
      this.close();
    },

    onCancel: function() { this.close(); }
  }

});

//////////////////////////////////////////////////////////////////////////////////////////////////

qx.Class.define("myapp.CircularProgress", {
  extend: qx.ui.core.Widget,

  construct: function() 
  {
    this.base(arguments);
    this._setLayout(new qx.ui.layout.Canvas());
    this.progress = 0;

    // Add a listener to update the progress when the widget appears
    this.addListenerOnce("appear", this.draw, this);
  },

  properties: 
  {
    progress: 
    {
      check: "Number",
      init: 0,
      apply: "applyProgress"
    }
  },

  members: {
    progress: null,

    _createContentElement: function() 
    {
      let canvas = new qx.html.Element("canvas");
      return canvas;
    },

    applyProgress: function(value) 
    {
      this.progress = value;
      this.draw();
    },

    draw: function() 
    {
      let canvas = this.getContentElement().getDomElement();
      let context = canvas.getContext("2d");

      let width = this.getWidth();
      let height = this.getHeight();
      let radius = Math.min(width, height) / 2;

      // Ensure the canvas is the correct size
      canvas.width = width;
      canvas.height = height;

      context.clearRect(0, 0, width, height);

      // Draw the background circle
      context.beginPath();
      context.arc(width / 2, height / 2, radius, 0, 2 * Math.PI);
      context.fillStyle = "#e6e6e6";
      context.fill();

      // Draw the progress circle
      context.beginPath();
      context.moveTo(width / 2, height / 2);
      context.arc(
        width / 2,
        height / 2,
        radius,
        -Math.PI / 2,
        -Math.PI / 2 + 2 * Math.PI * this.progress,
        false
      );
      context.closePath();
      context.fillStyle = "#4caf50";
      context.fill();
    }
  }
});

function startXmitProgressDisplay(commsDelay, parentContainer, size, onDone)
{
  
  log("starting Xmit display for " + commsDelay);
  let circularProgress = new myapp.CircularProgress();
  circularProgress.setWidth(size);
  circularProgress.setHeight(size);
  parentContainer.add(circularProgress);

  const totalUpdates = 100;
  let progress = 0;
  let timer = new qx.event.Timer(Math.round(commsDelay * 1000 / totalUpdates)); // update every 1/100 of the commsDelay
  timer.addListener("interval", function() 
  {
    progress += 1/totalUpdates;
    if (progress > 1) 
    {
      timer.stop();
      parentContainer.remove(circularProgress);
      if (onDone) onDone(parentContainer);
    }
    circularProgress.setProgress(progress);
  });
  timer.start();

  circularProgress.forceDone = function () { progress = 1.1; }

  return circularProgress;
}

//////////////////////////////////////////////////////////////////////////////////////////////////

qx.Class.define("myapp.AttachmentManager", 
{
  extend: qx.ui.window.Window,

  construct: function(reportUI, attachments, canEdit) 
  {
    this.base(arguments, "Attachment Manager");
    this.setLayout(new qx.ui.layout.VBox(10));
    this.setWidth(400);
    this.setHeight(300);

    this.reportUI = reportUI;

    // List to display attachments
    this.__attachmentList = new qx.ui.form.List();
    this.__attachmentList.setAllowGrowY(true);
    this.__attachmentList.setHeight(200);
    this.__attachmentList.setSelectionMode("multi");
    
    log("AttachMan sees " + attachments.length + " attachments");
    attachments.forEach(attachment => 
    {
      let listItem = new qx.ui.form.ListItem(attachment.filename);
      listItem.setUserData("attachment", attachment);
      this.__attachmentList.add(listItem);
    });

    // Add scroll container
    let scrollContainer = new qx.ui.container.Scroll();
    scrollContainer.add(this.__attachmentList);
    this.add(scrollContainer, { flex: 1 });

    const bbar = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    bbar.add(new qx.ui.core.Spacer(), { flex: 1 });
    makeButton(bbar, "Download", this.__onDownload, themeButtonColor(), 14, this);
    if (canEdit) makeButton(bbar, "Delete",   this.__onDelete,   themeButtonColor(), 14, this);
    makeButton(bbar, "Close",    this.close,        themeButtonColor(), 14, this);
    this.add(bbar);
  },

  members: 
  {
    __attachmentList: null,

    __onDownload: function() 
    {
      let selection = this.__attachmentList.getSelection();
      if (selection.length === 0) { alert("Please select an attachment to download."); return; }
      selection.forEach(selectedItem =>
      {
        const attachment = selectedItem.getUserData("attachment");
        let downloadUrl = "/download?filename=" + encodeURIComponent(attachment.getFilename());
        doDownload(downloadUrl, attachment.filename);
      });       
    },

    __onDelete: function() 
    {
      let selection = this.__attachmentList.getSelection();
      if (selection.length === 0) { alert("Please select an attachment to download."); return; }
      selection.forEach(selectedItem => 
      { 
        this.__attachmentList.remove(selectedItem);
        const attachment = selectedItem.getUserData("attachment");
        this.reportUI.removeAttachment(attachment);
      });
      this.reportUI.onChange(); // done removing attachments, now call onChange() to send to server
    }
  }
});

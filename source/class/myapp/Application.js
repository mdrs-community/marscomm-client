/* TODO
    //different roles...but what should be different?
    //test with 3 clients -- need to switch to a different port for FireFox to work...somehow it goes to Mongoose but Chrome goes to qooxdoo
    //rockal time
    //view old reports
    //report templates
    add attachment
    talk to Sean!
    deferred: fix support for Report images
    deferred: small Mars/Earth planet icons...do only after suckcessfoolly accepted, as this is pure sizzle
*/

//const JSZip = require('jszip');

function log(str) { console.log(str); }

function getQueryParams() 
{
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

const urlPrefix = 'http://localhost:8081/';
let refDate = null;
let commsDelay = 0;
let username = null;
let planet = null;
let app = null;

function getSolNum(date) 
{
  if (!date) date = new Date(); 
  return Math.floor((date.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24)); 
}

function commsDelayPassed(sentTime)
{
  if (!(sentTime instanceof Date)) sentTime = new Date(sentTime);
  const now = new Date();
  //console.log("CDPlease: " + ((now - sentTime) / 1000) + ", commsDelay: " + commsDelay + ", CDP ret: " + ((now - sentTime) / 1000 > commsDelay));
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
  //console.log("in transit? " + obj.xmitTime.toString() + " vs " + (new Date()).toString() + " CDP " + cdp);
  return obj.transmitted && !cdp; 
}

function timeInTransit(obj) 
{ 
  const tit = ((new Date()) - obj.xmitTime) / 1000; 
  //console.log("timeInTransit is " + tit + " seconds");
  return tit;
}

function setBGColor(btn, clr1, clr2) 
{
   var elem = btn.getContentElement();
   var dom  = elem.getDomElement();
   if (!clr2) clr2 = clr1;
   var img  = "linear-gradient(" + clr1 + " 35%, " + clr2 + " 100%)";
   if (dom.style.setProperty)
       dom.style.setProperty ("background-image", img, null);
   else
       dom.style.setAttribute ("backgroundImage", img);
}

function makeButton(container, str, onExecute, color, fontSize, image)
{
  if (!fontSize) fontSize = 14;
  if (!color) color = "gray";
  const button = str ? new qx.ui.form.Button(str) : new qx.ui.form.Button(null, image);
  if (str) button.addListenerOnce("appear", function () { setBGColor(button, color); }, this);
  button.addListener("execute", onExecute);
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

function newAttachment(filename, content)
{ // Attachment doesn't have it's own planet as it's on its parent Report's planet
	var that = { };

  that.type = "Attachment";
	that.filename = filename;
  that.content = content;
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

      // Enable logging in debug variant
      if (qx.core.Environment.get("qx.debug"))
      {
        // support native logging capabilities, e.g. Firebug for Firefox
        qx.log.appender.Native;
        // support additional cross-browser console. Press F7 to toggle visibility
        qx.log.appender.Console;
      }

      commsDelay = await this.recvCommsDelay();
      refDate = new Date(await this.recvRefDate());
      this.refDate = refDate;
      //this.startDay = daysSinceRef(this.startDate);
      //console.log("commsDelay=" + this.commsDelay + ", startDay=" + this.startDay + ", startDate=" + this.startDate);
      console.log("commsDelay=" + commsDelay + ", refDate=" + this.refDate);

      // Create the main layout
      let doc = this.getRoot();
      let mainContainer = new qx.ui.container.Composite(new qx.ui.layout.VBox());
      doc.add(mainContainer, { edge: 0 });

      let topPanel = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
      topPanel.setPadding(10);
      topPanel.setDecorator("main");
      mainContainer.add(topPanel);
      this.topPanel = topPanel;

      const mcLabel = makeLabel(topPanel, "MarsComm", "blue", 24);
      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
      let solNumLabel = makeLabel(topPanel, "Sol", "blue", 24);

      let numberInput = new qx.ui.form.Spinner();
      numberInput.addListener("changeValue", async function(event) 
      {
        const solNum = event.getData(); // proper event is not available inside the setTimeout callback
        if (this.timerId) { clearTimeout(this.timerId); } // Clear any existing timer       
        this.timerId = setTimeout(async function() { that.changeSol(that, solNum); }, 900);
      }, this);
      topPanel.add(numberInput);

      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
         
      let middleContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox());
      middleContainer.setDecorator("main");
      mainContainer.add(middleContainer, { flex: 1 });
      this.chatUI = new myapp.ChatUI(middleContainer, this);

      let rightPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox(10));
      rightPanel.setPadding(10);
      rightPanel.setDecorator("main");
      middleContainer.add(rightPanel, { flex: 1 });

      let reportNames = await this.recvReports();
      let reportUIs = [];
      console.log(reportNames);
      reportNames.forEach((name, index) => 
      {
        let reportUI = new myapp.ReportUI(name, rightPanel, this);
        reportUIs.push(reportUI);
      });
      this.reportUIs = reportUIs;

      this.templates = await this.recvReportTemplates();

      makeButton(topPanel, "Download Reports",     () => this.createZipFromReports(reportUIs), "#ccccff", 16);
      makeButton(topPanel, "Download Attachments", () => this.downloadAttachments(),           "#ccccff", 16);

      this.loginButton = makeButton(topPanel, "Login", () => this.handleLoginLogout(), "#ffcccc", 16);

      let queryParams = getQueryParams();
      if (queryParams.user) 
        await this.attemptLogin(queryParams.user, "yo"); //TODO: remove autologin before release
      // Unfortunately we don't know what planet we are on until after we complete the login, and without knowing the
      // planet we don't what to do with incoming reports.  So we can start listeners and such but they can't do shiite
      // until the login is done.
      //await this.changeSol(this, getCurrentSolNum(this.startDay));
      //this.checkTransmissions(); // should no longer be needed

    }, //-------------- end of main()

    sleep(ms) { return new Promise((resolve) => { setTimeout(resolve, ms); }); },

    checkTransmissions()
    {
      console.log("checkTrans");
      const that = this;
      function checkEt()
      {
        console.log("check et out");
        const reportUIs = that.reportUIs;
        for (let i = 0; i < reportUIs.length; i++)
          reportUIs[i].checkTransmission();
        setTimeout(checkEt, 20*1000);
      }
      checkEt();
    },

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
      console.log("this display styncs");
      this.chatUI.changeSol(sol.ims);

      const reportUIs = this.reportUIs;
      for (let i = 0; i < reportUIs.length; i++)
        reportUIs[i].reset();
      console.log("reset THIS");
      for (let i = 0; i < sol.reports.length; i++)
      {
        const reportUI = this.getReportUIbyName(sol.reports[i].name);
        if (reportUI)
        { 
          console.log("update ReportUI for " + sol.reports[i].name);
          reportUI.update(sol.reports[i]);
        }
      }
    },

    getUiSolNum() { return this.solNum; },
    isCurrentSol() { return getSolNum() === this.solNum },

    async changeSol(that, solNum) 
    { 
      that.solNum = solNum;
      console.log("Sol supposedly set to " + that.solNum);
      const sol = await that.recvSol(solNum);
      //console.log(sol); 
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
      if (!message) {
        alert("Please enter a message.");
        return;
      }

      // Simple markdown and emoticon parsing
      let formattedMessage = this.parseMessage(message);
      let newMessage = new qx.ui.basic.Label().set({
        value: formattedMessage,
        rich: true
      });
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
      console.log("GETsome: " + endpoint);
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
            console.log('GET suckcessfool: ' + JSON.stringify(result));
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
      console.log("POSTality: " + JSON.stringify(body));
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
          console.log('POST suckcessfool: ' + JSON.stringify(result));
          return result;
        } else 
        {
          console.log('POST most epically failed.');
          console.log(JSON.stringify(response));
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
        content: report.content, // fileContent,
        //username: "matts",
        //token: "Boken"
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
      console.log("sending " + files.length + " dataers");
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
      
      req.addListener("success", function(e) { console.log("Upload successfoo!"); } );
      req.addListener("fail",    function(e) { console.error("Upload failed miserably:", e); } );
    
      req.send();
      //req.dispose();
    },

    async transmitReport(report)
    {
      const body = 
      {
        //username: "matts",
        //token: "Boken"
      };
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

    async recvReports()         { return await this.doGET('reports'); },

    async recvCommsDelay()      { return (await this.doGET('comms-delay')).commsDelay; },

    async recvRefDate()         { return (await this.doGET('ref-date')).refDate; },

    async recvReportTemplates() { return await this.doGET('reports/templates'); },

    async recvAttachments()     { return await this.doGET('attachments/' + planet + '/' + getSolNum()); },
    

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

      let cancelButton = new qx.ui.form.Button("Cancel");
      cancelButton.addListener("execute", () => loginDialog.close());
      buttonContainer.add(cancelButton);

      loginDialog.center();
      loginDialog.open();
    },

    async attemptLogin(usernameIn, password, loginDialog) 
    {
      const result = await this.sendLogin(usernameIn, password);
      if (result.token)
      {
        this.isLoggedIn = true;
        username = usernameIn;
        planet = result.planet;
        this.token = result.token;
        this.loginButton.setLabel(username + '[' + planet + ']');
        //this.__loginButton.setBackgroundColor("#ccccff");
        setBGColor(this.loginButton, "#ccccff");
        const tpcolor = planet === "Mars" ? "#ffeeee" : "#eeeeff";
        this.topPanel.setBackgroundColor(tpcolor);

        if (loginDialog) loginDialog.close();
        // now that we're logged in we can finish the startup
        await this.changeSol(this, getSolNum());

        // set up server-sent events
        // eventSource is tied to login because the planet can change
        this.eventSource = new EventSource(urlPrefix + 'events/' + planet);
        this.eventSource.onmessage = function(event) 
        {
          console.log("SSE received!!!!");
          console.log(event.data);
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
      else if (result.message)
        alert(result.message);
      else 
        alert("Login failure");

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
      // Add any additional logout logic here
    },

    //--------------------------------------------------------------------------------------------
    // other

    async createZipFromReports(reportUIs) 
    {
      // Create a new JSZip instance
      console.log("CREATE THIS from " + reportUIs.length + " RUIs");
      const zip = new JSZip();

      // Add each object as a file to the zip
      reportUIs.forEach(reportUI => 
      {
        console.log("  RUI " + reportUI.name);
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
        zip.file(fileName, attachment.content, {base64: true});
      });

      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Create a download link for the zip file
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(zipBlob);
      downloadLink.download = "reports.zip";

      // Trigger the download
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      console.log("RUIs are DONE DUDE");

    },

    async downloadAttachments()
    {
      // Create an invisible link to trigger the download
      var link = document.createElement("a");
      link.href = urlPrefix + 'attachments/zip/' + planet + '/' + this.getUiSolNum();
      console.log("attempting download of " + link.href);
      // The desired filename for the download, BUT seems to be overridden by the Content-Disosition header set by server
      link.download = 'attachments' + this.getUiSolNum() + planet + '.zip'; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
    parentContainer.add(chatContainer, { flex: 2 });

    let chatPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox());
    chatPanel.setPadding(10);
    this.chatPanel = chatPanel;
    chatPanel.setDecorator("main");
    chatContainer.add(chatPanel, { flex: 2 });
    let chatScroll = new qx.ui.container.Scroll();
    chatScroll.add(chatPanel);
    chatContainer.add(chatScroll, { flex: 1 });

    let chatInputContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    chatInputContainer.setPadding(10);
    chatContainer.add(chatInputContainer);
  
    let chatInput = new qx.ui.form.TextField();
    this.chatInput = chatInput;
    chatInput.setPlaceholder("Type a message...");
    chatInput.addListener("keypress", function(e) 
      { if (e.getKeyIdentifier() === "Enter") { that.doMessage(that); } } );
    chatInputContainer.add(chatInput, { flex: 1 });

    makeButton(chatInputContainer, "Send", () => this.doMessage(this), "#ccccff", 14);
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

    reset() { try { this.chatPanel.removeAll(); } catch (e) { console.log("clean et up"); } this.ims = null; },

    changeSol(ims)
    {
      console.log("changing Sol to " + app.getUiSolNum() + "; update dat chat wit " + ims.length + " ims");
      console.log("currentSolNum is " + getSolNum());
      this.reset();
      this.ims = ims;
      const isCurrentSol = getSolNum() === app.getUiSolNum();
      this.chatInput.setEnabled(isCurrentSol);
      for (let i = 0; i < ims.length; i++)
        this.addIM(ims[i]);
    },

    addIM(im)
    {
      console.log("addIM: " + im.content + " from planet " + im.planet + " (we are on " + planet + ")");
      if (!im.content) return;

      console.log("  commsDelay=" + commsDelay + ", tit=" + timeInTransit(im));
      const timeRemaining = commsDelay - timeInTransit(im);
      if (im.planet === planet || !inTransit(im))
      {
        let container = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    
        const str = '<b>' + im.user + '</b> <font size="-2">' + (new Date()).toString() + ':</font><br>' + im.content + '<br> <br>';
        const label = new qx.ui.basic.Label().set( { value: str, rich: true });
        const color = (im.user === username) ? "blue" : "black";
        label.setTextColor(color);
        label.setFont(new qx.bom.Font(16, ["Arial"]));
        container.add(label);  
        //if (inTransit(im)) console.log("  still in transit!")
        //else console.log("time since sent is " + timeSinceSent(im.xmitTime));
        if (inTransit(im)) 
          startXmitProgressDisplay(timeRemaining, container, 55);
        this.chatPanel.add(container);
      }
      else // IM is NOT from this planet and has not yet arrived, so wait for et
      {
        console.log("scheduling IM arrival in " + timeRemaining);
        setTimeout(() => this.addIM(im), timeRemaining*1000);
      }
    },

    doMessage(that) 
    {
      let message = that.chatInput.getValue();
      if (message === null) return;
      message = message.trim();
      console.log("doing message: " + message);
      if (!message) 
      {
        alert("Please enter a message.");
        return;
      }

      that.chatInput.setValue("");
      // Simple markdown and emoticon parsing
      let formattedMessage = that.parseMessage(message);
      const im = newIM(formattedMessage);
      console.log(im);
      //that.addIM(im);           // add IM to chatPanel; don't need to add locally as we'll add it on the SSE
      that.ims.push(im);        // add IM to local model
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
    this.base(arguments); // Call superclass constructor
    this.name = name;

    let container = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    parentContainer.add(container);
    this.container = container;

    //let icon = new qx.ui.basic.Image("icon/22/actions/document-open.png");
    //container.add(icon);
    //this.icon = icon;

    let fsb = new qx.ui.form.FileSelectorButton("Upload...");
    fsb.setMultiple(true);
    fsb.addListener("changeFileSelection", function(e) 
    {
      let files = e.getData();
      console.log("there are actually " + files.length + " attachments");
      app.sendAttachments(that.report, files);
    }, this);
    container.add(fsb);
    //fsb.setEnabled(false); // disabling the FileSelectorButton somehow prevents it working properly even after it's re-enabled -- FARUK
    this.fsButton = fsb;

    const cimage = "myapp/copyIcon.png";
    const pimage = "myapp/pasteIcon.png";
    this.copyButton = makeButton(container, null, () => navigator.clipboard.writeText(that.report.content), "#ccccff", 14, cimage);
    this.pasteButton = makeButton(container, null, () => that.setContentFromBored(), "gray", 14, pimage);

    this.editButton = makeButton(container, "Edit", () => that.openReportEditor(), "gray", 14);

    function onXmit()
    { 
      that.report.transmitted = true;
      that.report.xmitTime = new Date();
      app.transmitReport(that.report); // tell server to send report to other planet
      //that.realizeState("Transmitted"); // SSE will cause UI to be updated
    }
    this.txButton = makeButton(container, "Transmit", onXmit, "gray", 14);
    this.txButton.setEnabled(false);

    this.label = makeLabel(container, name, "gray", 18);
  },
  
  members: 
  {
    name: null,

    container: null,
    icon: null,
    fsButton: null,
    editButton: null,
    txButton: null,
    label: null,

    state: "Unused", // ReportUI states: Unused, Empty, Populated, Transmitted, Received
    report: null,

    reset() { /* console.log("reset"); */ this.realizeState("Unused"); },

    xmitDone(container) 
    { 
      //if (this.xmitProgress) 
      //{ 
      //  container.remove(this.xmitProgress); 
      //  this.xmitProgress = null; 
        this.realizeState("Received");
      //} 
    },

    onChange() 
    { 
      console.log("something changed, Holmez");
      app.sendReport(this.report);
      //this.realizeState(); // SSE will cause UI to be updated
    },

    update(report) // called when the SolNum is changed, and when a transmitted Report arrives 
    { //  instead of copying state out, we need to keep a reference to the report so that we can later update it e.g. when the xmit button is pressed
      if (report.transmitted) console.log("changeSol => new report incoming: " + report.name);
      this.report = report;
      if (this.xmitProgress) this.xmitProgress.forceDone();
      this.realizeState();
    },

    isCurrentSol() { return getSolNum() === app.getUiSolNum() },

    computeState()
    {
      if (this.report.transmitted) console.log("compute THIS: " + JSON.stringify(this.report));
      if (this.report.transmitted) console.log("transmitted..." + this.report.xmitTime.toString() + " " + commsDelayPassed(this.report.xmitTime, this.commsDelay));
      if (this.report.transmitted) 
        if (commsDelayPassed(this.report.xmitTime)) return "Received";
        else return "Transmitted";

      if (this.report.content) return "Populated";
      else return "Empty";
    },

    realizeState(forcedState)
    {
      const isCurrentSol = this.isCurrentSol();
      this.state = forcedState ? forcedState : this.computeState();
      if (this.report && this.report.transmitted) console.log("realizing new state: " + this.state + ", isCurrentSol=" + isCurrentSol);
      const editEnabled = this.state !== "Unused"; // && isCurrentSol; // edit button now works in View mode for non-current Sols
      const editBgColor = editEnabled ? "#ccccff" : "#cccccc";
      const txEnabled = isCurrentSol && editEnabled && this.state !== "Empty";
      const txBgColor = txEnabled ? "#ccccff" : "#cccccc";
      if (this.fsButton)   {   this.fsButton.setEnabled(editEnabled); setBGColor(this.fsButton, editBgColor); }
      if (this.editButton) { this.editButton.setEnabled(editEnabled); setBGColor(this.editButton, editBgColor); }
      if (this.txButton)   {   this.txButton.setEnabled(txEnabled);   setBGColor(this.txButton, txBgColor); }

      const editStr = isCurrentSol ? "Edit" : "View";
      this.editButton.setLabel(editStr);

      let color;
      if      (this.state === "Unused")      color = "gray";
      else if (this.state === "Empty")       color = "orange";
      else if (this.state === "Populated")   color = "blue";
      else if (this.state === "Transmitted") color = "purple";
      else if (this.state === "Received")    color = "green";
      if (this.label) this.label.setTextColor(color);

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

    setContent(content)
    {
      console.log("setting model content: " + content);
      this.report.content = content;
      this.onChange();
    },

    async setContentFromBored() { this.setContent(await navigator.clipboard.readText()); },

    checkTransmission()
    {
      if (this.state === "Transmitted") console.log(commsDelayPassed(this.report.xmitTime));
      if (this.state === "Transmitted" && commsDelayPassed(this.report.xmitTime)) 
      {
        console.log("comms delay has passed for " + this.name)
        this.realizeState("Received");
      }
    }
  }
});


//////////////////////////////////////////////////////////////////////////////////////////////////


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

    _createContentElement: function() // override -- do NOT rename
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

    initCKEditor: function() 
    {
      // Initialize CKEditor with the unique ID
      let editorElement = document.getElementById(this.editorId);
      this.editor = CKEDITOR.replace(editorElement, { height: '100%', versionCheck: false } );

      // Explicitly focus the editor after initialization
      qx.event.Timer.once(() => 
      { 
        if (this.afterInit) this.afterInit(); 
        this.editor.focus();
        this.updateEditorHeight();
      }, this, 600);
    },

    onResize: function() { this.updateEditorHeight(); },

    updateEditorHeight: function() 
    {
      if (this.editor) 
      {
        //let containerHeight = this.getContentElement().getDomElement().clientHeight;
        let containerHeight = this.getBounds().height - 50;
        console.log("winder size: " + containerHeight);
        this.editor.resize('100%', containerHeight);
      }
    },

    // Method to set data into the editor
    setContent: function(data) 
    {
      console.log("setting editor content: " + data);
      console.log("this.editor" + this.editor);
      if (this.editor) 
        this.editor.setData(data);
      else 
        this.addListenerOnce("editorReady", () => { this.editor.setData(data); } );
    },
    
        // Method to get data from the editor
    getContent: function() 
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
    console.log("new editor with content:\n" + content);
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
      console.log("onOK setting content: " + content);
      this.parent.setContent(content);
      this.close();
    },

    onCancel: function() { this.close(); }
  }

});

//////////////////////////////////////////////////////////////////////////////////////////////////

qx.Class.define("myapp.CircularProgress", {
  extend: qx.ui.core.Widget,

  construct: function() {
    this.base(arguments);
    this._setLayout(new qx.ui.layout.Canvas());
    this.progress = 0;

    // Add a listener to update the progress when the widget appears
    this.addListenerOnce("appear", this.draw, this);
  },

  properties: {
    progress: {
      check: "Number",
      init: 0,
      apply: "applyProgress"
    }
  },

  members: {
    progress: null,

    _createContentElement: function() {
      let canvas = new qx.html.Element("canvas");
      return canvas;
    },

    applyProgress: function(value) {
      this.progress = value;
      this.draw();
    },

    draw: function() {
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
  console.log("starting Xmit display for " + commsDelay);
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

  circularProgress.forceDone = function () { progress = 1.1;}

  return circularProgress;
}


/*
createBtn : function ( txt, clr, width, cb, ctx )  {
  var btn = new qx.ui.form.Button ( "<b style='color: white'>" + txt + "</b>" );
  btn.set ( { width: width, cursor: 'pointer' } );
  let lbl = btn.getChildControl ( "label" );
  lbl.setRich ( true );
  btn.addListenerOnce ( "appear", function ( )  {
    this.setBGColor ( btn, "#AAAAAA00", "#AAAAAA00" );
  },this );
  btn.addListener ( "mouseover", function ( )  {
    this.setBGColor ( btn, clr, clr );
  },this );
  btn.addListener ( "mouseout", function ( )  {
    this.setBGColor ( btn, "#AAAAAA00", "#AAAAAA00" );
  },this );
  btn.addListener ( "execute", function ( e )  {
     cb.call ( this );
  }, ctx );
  return btn;
},

    fsb.addListener("changeFileSelection", function(e) 
    {
      let files = e.getData();
      console.log("there are actually " + files.length + " attachments");
      if (files && files.length > 0) 
      {
        const file = files[0];
        console.log("Selected file:", file);
        let isText = false;
        const reader = new FileReader(); 
        reader.addEventListener('load', () => 
        { 
          if (isText)
          {
            that.report.content = reader.result;
            console.log("The report content is:\n" + that.report.content); 
            that.onChange();
          }
          else
          {
            console.log("attach THIS: " + file.name);
            if (!that.report.attachNames) that.report.attachNames = [];
            that.report.attachNames.push(file.name);
            //const str = arrayBufferToBase64(reader.result);  // reader.result.toString('base64')
            //app.sendAttachment(that.report.name, file.name, str); // convert attachment to base64 string from the get go
            console.log("attempting to send " + files.length + " attachments");
            app.sendAttachments(that.report.name, files);
          }
        });
        const ext = file.name.split('.').pop();
        if (ext === "txt" || ext === "md" || ext === "rtf")
        {
          isText = true;
          reader.readAsText(file);
        }
        else
          reader.readAsArrayBuffer(file);
      }
    }, this);

*/

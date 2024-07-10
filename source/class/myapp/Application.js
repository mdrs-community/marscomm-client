/* TODO
    //fix reports to start animations on reentry, like chat
    //fix SolNum calculation
    //for testing purposes, allow initial SolNum to be set in config.json
    //reorg code, especially in App class (do as separate checkin)
    //futz with chat scroll
    //basic multi-luser testing
    //server should only deliver reports after they have finished transmission, otherwise the client has to hold multiple versions 
    //  of the report (but the server has to hold multiple versions anyawy)
    test with 3 clients -- need to switch to a different port for FireFox to work...somehow it goes to Mongoose but Chrome goes to qooxdoo
    rockal time
    different roles
    view old reports
    talk to Sean!
    small Mars/Earth planet icons
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

function commsDelayPassed(sentTime, commsDelay)
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

function daysSinceEpoch(date) { return Math.floor(date.getTime() / (1000 * 60 * 60 * 24)); }

function getCurrentSolNum(startDay) { return daysSinceEpoch(new Date()) - startDay; }

function inTransit(obj, commsDelay) 
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

function newIM(content, user, commsDelay)
{
	let that = { };

  that.content = content;
  that.user = user;
  that.xmitTime = new Date();
  that.transmitted = true; // IMs are automatically transmitted

  that.received = function () { return commsDelayPassed(that.xmitTime, commsDelay); }
  
  return that;
}

let app = null;

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
    username: null,
    token: 0,
    planet: null,
    loginButton: null,
    solNum: 0,
    sol: null,
    commsDelay: 0,
    startDate: null,
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

      this.commsDelay = await this.recvCommsDelay();
      this.startDate = new Date(await this.recvStartDate());
      this.startDay = daysSinceEpoch(this.startDate);
      console.log("commsDelay=" + this.commsDelay + ", startDay=" + this.startDay + ", startDate=" + this.startDate);

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
      this.chatUI = new myapp.ChatUI(middleContainer, this.commsDelay, this, this.startDay);

      let rightPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox(10));
      rightPanel.setPadding(10);
      rightPanel.setDecorator("main");
      middleContainer.add(rightPanel, { flex: 1 });

      let reportNames = await this.recvReports();
      let reportUIs = [];
      console.log(reportNames);
      reportNames.forEach((name, index) => 
      {
        let reportUI = new myapp.ReportUI(name, rightPanel, this.commsDelay, this, this.startDay);
        reportUIs.push(reportUI);
      });
      this.reportUIs = reportUIs;

      makeButton(topPanel, "Download Reports", () => this.createZipFromReports(reportUIs), "#ccccff", 16);
      this.loginButton = makeButton(topPanel, "Login", () => this.handleLoginLogout(), "#ffcccc", 16);

      let queryParams = getQueryParams();
      if (queryParams.user) 
        await this.attemptLogin(queryParams.user, "yo"); //TODO: remove autologin before release
      // Unfortunately we don't know what planet we are on until after we complete the login, and without knowing the
      // planet we don't what to do with incoming reports.  So we can start listeners and such but they can't do shiite
      // until the login is done.
      //await this.changeSol(this, getCurrentSolNum(this.startDay));
      this.checkTransmissions();

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
    isCurrentSol() { return getCurrentSolNum(this.startDay) === this.solNum },

    async changeSol(that, solNum) 
    { 
      console.log("time THIS: " + solNum);
      that.solNum = solNum;
      console.log("Sol supposedly set to " + that.solNum);
      const sol = await that.recvSol(solNum);
      //console.log(sol); 
      console.log("got some Sol...time to stync");
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
        const response = await fetch('http://localhost:8081/' + endpoint, 
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

    async doPOST(endpoint, body)
    {
      if (endpoint !== 'login')
      {
        body.username = this.username;
        body.token = this.token;
      }
      console.log("POSTality: " + JSON.stringify(body));
      try 
      {
        const response = await fetch('http://localhost:8081/' + endpoint, 
        {
          method: 'POST',
          //mode: 'no-cors', // this fixes CORS problems but introduces other problems -- DON'T USE
          headers: { 'Content-Type': 'application/json' },
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
      console.log("solabaloni");
      sol.reports = (this.planet === "Earth") ? sol.reportsEarth : sol.reportsMars;
      for (let i = 0; i < sol.ims.length; i++)
        sol.ims[i].xmitTime = new Date(sol.ims[i].xmitTime);
      for (let i = 0; i < sol.reports.length; i++)
        sol.reports[i].xmitTime = new Date(sol.reports[i].xmitTime);
      console.log("solaroni");
      return sol; 
    },

    async recvReports()   { return await this.doGET('reports'); },

    async recvCommsDelay()   { return (await this.doGET('comms-delay')).commsDelay; },

    async recvStartDate()   { return (await this.doGET('start-date')).startDate; },


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

    async attemptLogin(username, password, loginDialog) 
    {
      const result = await this.sendLogin(username, password);
      if (result.token)
      {
        this.isLoggedIn = true;
        this.username = username;
        this.token = result.token;
        this.planet = result.planet;
        this.loginButton.setLabel(username + '[' + result.planet + ']');
        //this.__loginButton.setBackgroundColor("#ccccff");
        setBGColor(this.loginButton, "#ccccff");
        const tpcolor = result.planet === "Mars" ? "#ffeeee" : "#eeeeff";
        this.topPanel.setBackgroundColor(tpcolor);

        if (loginDialog) loginDialog.close();
        // now that we're logged in we can finish the startup
        await this.changeSol(this, getCurrentSolNum(this.startDay));

        // eventSource is tied to login because the planet can change
        this.eventSource = new EventSource('http://localhost:8081/events/' + this.planet);
        this.eventSource.onmessage = function(event) 
        {
          console.log("SSE received!!!!");
          console.log(event.data);
          const obj = JSON.parse(event.data);
          if (app.isCurrentSol() && obj.user !== app.username) // ignore new messages if we aren't looking at the current Sol, or they they are coming from us 
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
      this.username = null;
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
  }
});



//////////////////////////////////////////////////////////////////////////////////////////////////

qx.Class.define("myapp.ChatUI", 
{ extend: qx.core.Object, 
  construct: function(parentContainer, commsDelay, network, startDay) 
  {
    const that = this;
    this.commsDelay = commsDelay;
    this.network = network;
    this.startDay = startDay;

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
    commsDelay: 0,
    network: null,
    startDay: 0,

    reset() { try { this.chatPanel.removeAll(); } catch (e) { console.log("clean et up"); } this.ims = null; },

    changeSol(ims)
    {
      console.log("changing Sol to " + this.network.getUiSolNum() + "; update dat chat wit " + ims.length + " ims");
      console.log("currentSolNum is " + getCurrentSolNum(this.startDay));
      this.reset();
      this.ims = ims;
      const isCurrentSol = getCurrentSolNum(this.startDay) === this.network.getUiSolNum();
      this.chatInput.setEnabled(isCurrentSol);
      for (let i = 0; i < ims.length; i++)
        this.addIM(ims[i]);
    },

    addIM(im)
    {
      console.log("addIM: " + im.content);
      if (!im.content) return;

      console.log("  commsDelay=" + this.commsDelay + ", tit=" + timeInTransit(im));
      const timeRemaining = this.commsDelay - timeInTransit(im);
      if (im.planet === this.planet || !inTransit(im, this.commsDelay))
      {
        let container = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    
        const str = '<b>' + im.user + '</b> <font size="-2">' + (new Date()).toString() + ':</font><br>' + im.content + '<br> <br>';
        const label = new qx.ui.basic.Label().set( { value: str, rich: true });
        const color = (im.user === this.network.username) ? "blue" : "black";
        label.setTextColor(color);
        label.setFont(new qx.bom.Font(16, ["Arial"]));
        container.add(label);  
        //if (inTransit(im)) console.log("  still in transit!")
        //else console.log("time since sent is " + timeSinceSent(im.xmitTime));
        if (inTransit(im, this.commsDelay)) 
          startXmitProgressDisplay(timeRemaining, container, 55);
        this.chatPanel.add(container);
      }
      else
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
      const im = newIM(formattedMessage, that.network.username, that.commsDelay);
      console.log(im);
      that.addIM(im);           // add IM to chatPanel
      that.ims.push(im);        // add IM to local model
      that.network.sendIM(im); // send IM to server
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
  construct: function(name, parentContainer, commsDelay, network, startDay) 
  {
    const that = this;
    this.base(arguments); // Call superclass constructor
    this.name = name;
    this.commsDelay = commsDelay;
    this.network = network;
    this.startDay = startDay;

    let container = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    parentContainer.add(container);
    this.container = container;

    let icon = new qx.ui.basic.Image("icon/22/actions/document-open.png");
    container.add(icon);
    this.icon = icon;

    let fsb = new qx.ui.form.FileSelectorButton("Upload...");
    fsb.addListener("changeFileSelection", function(e) 
    {
      var files = e.getData();
      if (files && files.length > 0) 
      {
        var file = files[0];
        console.log("Selected file:", file);
        const reader = new FileReader(); 
        reader.addEventListener('load', () => 
        { 
          that.report.content = reader.result;
          console.log("The first 4 chars are: " + that.report.content); 
          that.onChange();
        });
        reader.readAsText(file.slice(0,4));
      }
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
      that.network.transmitReport(that.report); // tell server to send report to Earth
      that.realizeState("Transmitted"); 
    }
    this.txButton = makeButton(container, "Transmit", onXmit, "gray", 14);
    this.txButton.setEnabled(false);

    this.label = makeLabel(container, name, "gray", 18);
  },
  
  members: 
  {
    name: null,
    network: null,
    commsDelay: 0,

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
      this.network.sendReport(this.report);
      this.realizeState();
    },

    update(report) // called when the SolNum is changed, and when a transmitted Report arrives 
    { //  instead of copying state out, we need to keep a reference to the report so that we can later update it e.g. when the xmit button is pressed
      if (report.transmitted) console.log("changeSol => new report incoming: " + report.name);
      this.report = report;
      if (this.xmitProgress) this.xmitProgress.forceDone();
      this.realizeState();
    },

    isCurrentSol() { return getCurrentSolNum(this.startDay) === this.network.getUiSolNum() },

    computeState()
    {
      if (this.report.transmitted) console.log("compute THIS: " + JSON.stringify(this.report));
      if (this.report.transmitted) console.log("transmitted..." + this.report.xmitTime.toString() + " " + commsDelayPassed(this.report.xmitTime, this.commsDelay));
      if (this.report.transmitted) 
        if (commsDelayPassed(this.report.xmitTime, this.commsDelay)) return "Received";
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
      const txEnabled = editEnabled && this.state !== "Empty";
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

      if (this.state === "Transmitted" && this.report && inTransit(this.report, this.commsDelay)) 
        this.xmitProgress = startXmitProgressDisplay(this.commsDelay, this.container, 33, (container) => this.xmitDone(container));
    },

    openReportEditor()
    {
      // Create and open the CKEditor window
      let ckEditorWindow = new myapp.CKEditorWindow(this, this.report.content, this.isCurrentSol());
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
      if (this.state === "Transmitted") console.log(commsDelayPassed(this.report.xmitTime, this.commsDelay));
      if (this.state === "Transmitted" && commsDelayPassed(this.report.xmitTime, this.commsDelay)) 
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
      console.log("init dat bitch");
      let editorElement = document.getElementById(this.editorId);
      this.editor = CKEDITOR.replace(editorElement, { height: '100%', versionCheck: false } );

      // Explicitly focus the editor after initialization
      qx.event.Timer.once(() => 
      { 
        if (this.afterInit) this.afterInit(); 
        this.editor.focus();
        this.updateEditorHeight();
        console.log("post init fun"); 
      }, this, 300);
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
    console.log("new editor with content " + content);
    // Add the CKEditor to the window and set content after the editor is actually created
    const ckEditor = new myapp.CKEditor(function () { console.log("set dat shiite"); ckEditor.setContent(content); });
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
*/

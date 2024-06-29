function log(str) { console.log(str); }

function makeLabel(str, color, fontSize)
{
  let label = new qx.ui.basic.Label(str);
  label.setTextColor(color);
  label.setFont(new qx.bom.Font(fontSize, ["Arial"]));
  return label;
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
    __isLoggedIn: false,
    __username: null,
    __token: 0,
    __loginButton: null,
    __solNum: 0,
    __sol: null,
    __commsDelay: 0,
    startDate: null,

    /** @lint ignoreDeprecated(alert)
     */
    async main()
    {
      super.main();

      // Enable logging in debug variant
      if (qx.core.Environment.get("qx.debug"))
      {
        // support native logging capabilities, e.g. Firebug for Firefox
        qx.log.appender.Native;
        // support additional cross-browser console. Press F7 to toggle visibility
        qx.log.appender.Console;
      }

      this.__commsDelay = await this._recvCommsDelay();
      this.startDate    = new Date(await this._recvStartDate());
      console.log("commsDelay=" + this.__commsDelay + ", startDate=" + this.startDate);

      // Create the main layout
      let doc = this.getRoot();
      let mainContainer = new qx.ui.container.Composite(new qx.ui.layout.VBox());
      doc.add(mainContainer, { edge: 0 });

      // Top panel
      let topPanel = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
      topPanel.setPadding(10);
      topPanel.setDecorator("main");
      mainContainer.add(topPanel);

      const mcLabel = makeLabel("MarsComm", "blue", 24);
      topPanel.add(mcLabel);      
      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
      let solNumLabel = makeLabel("Sol", "blue", 24);
      topPanel.add(solNumLabel);

      let numberInput = new qx.ui.form.Spinner();
      numberInput.addListener("changeValue", async function(event) 
      {
        const that = this; // "this" won't work inside the setTimeout callback 
        const solNum = event.getData(); // proper event is not available inside the setTimeout callback

        if (this.__timerId) { clearTimeout(this.__timerId); } // Clear any existing timer       
        this.__timerId = setTimeout(async function() { that._changeSol(that, solNum); }, 700);
      }, this);
      topPanel.add(numberInput);

      //let addButton = new qx.ui.form.Button("Add to Chat");
      //addButton.addListener("execute", () => this._addContent(chatPanel, numberInput));
      //topPanel.add(addButton);
      
      // Login/Logout Button
      this.__loginButton = new qx.ui.form.Button("Login");
      this.__loginButton.addListenerOnce ( "appear", function ( )  
        { setBGColor(this.__loginButton, "#ffcccc"); }, this);
      this.__loginButton.addListener("execute", () => this._handleLoginLogout());
      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
      topPanel.add(this.__loginButton);
      
      // Container for the middle section
      let middleContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox());
      middleContainer.setDecorator("main");
      mainContainer.add(middleContainer, { flex: 1 });

      // Chat panel container
      let chatContainer = new qx.ui.container.Composite(new qx.ui.layout.VBox());
      chatContainer.setDecorator("main");
      chatContainer.setWidth(400);
      middleContainer.add(chatContainer, { flex: 2 });

      let chatPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox());
      chatPanel.setDecorator("main");
      chatContainer.add(chatPanel, { flex: 2 });
      //let chatScroll = new qx.ui.container.Scroll().add(chatPanel);
      //chatContainer.add(chatScroll, { flex: 1 });

      // Chat input panel
      let chatInputContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
      chatInputContainer.setPadding(10);
      chatContainer.add(chatInputContainer);
   
      const that = this;
      let chatInput = new qx.ui.form.TextField();
      chatInput.setPlaceholder("Type a message...");
      chatInput.addListener("keypress", function(e) {
        // Check if the Enter key (key code 13) was pressed
        if (e.getKeyIdentifier() === "Enter") {
          //let inputValue = chatInput.getValue();
          that._doMessage(chatPanel, chatInput);
          //alert("You pressed Enter! The value is: " + inputValue);
        }
      });
      chatInputContainer.add(chatInput, { flex: 1 });

      let sendButton = new qx.ui.form.Button("Send");
      sendButton.addListener("execute", () => this._doMessage(chatPanel, chatInput));
      chatInputContainer.add(sendButton);

      // Right panel
      let rightPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox(10));
      rightPanel.setPadding(10);
      rightPanel.setDecorator("main");
      middleContainer.add(rightPanel, { flex: 1 });

      let reportNames = await this._recvReports();
      let reportUIs = [];
      console.log(reportNames);
      reportNames.forEach((name, index) => 
      {
        let reportUI = new myapp.ReportUI(name, rightPanel, this.__commsDelay, this);
        reportUIs.push(reportUI);
      });
      this.__reportUIs = reportUIs;

      await this._attemptLogin("matts", "yo"); //TODO: remove autologin before release
      await this._changeSol(this, 0);
      this.checkTransmissions();

    },

    sleep(ms) { return new Promise((resolve) => { setTimeout(resolve, ms); }); },

    checkTransmissions()
    {
      console.log("checkTrans");
      const that = this;
      function checkEt()
      {
        console.log("check et out");
        const reportUIs = that.__reportUIs;
        for (let i = 0; i < reportUIs.length; i++)
          reportUIs[i].checkTransmission();
        setTimeout(checkEt, 20*1000);
      }
      checkEt();
    },

    checkTransmissions0()
    {
      const reportUIs = that.__reportUIs;
      for (let i = 0; i < reportUIs.length; i++)
        reportUIs[i].checkTransmission();
      setTimeout(this.checkTransmissions, 20*1000);
    },

    commsDelayPassed(sentTime)
    {
      const now = new Date();
      return (now - sentTime) * 1000 >= this.__commsDelay;
    },

    _getReportUIbyName(name)
    {
      const reportUIs = this.__reportUIs;
      for (let i = 0; i < reportUIs.length; i++)
        if (reportUIs[i].name === name) return reportUIs[i];
      return null;
    },

    _syncDisplay() 
    { 
      const reportUIs = this.__reportUIs;
      for (let i = 0; i < reportUIs.length; i++)
        reportUIs[i].reset();
      const sol = this.__sol;
      for (let i = 0; i < sol.reports.length; i++)
      {
        const reportUI = this._getReportUIbyName(sol.reports[i].name);
        if (reportUI)
        { 
          reportUI.update(sol.reports[i]);
        }
      }
    },

    daysBetween(date1, date2) 
    {
      if (!(date1 instanceof Date) || !(date2 instanceof Date)) { throw new Error("Both arguments must be valid Date objects"); }
      const timeDifference = Math.abs(date2 - date1); // Get the time difference in milliseconds
      const millisecondsPerDay = 1000 * 60 * 60 * 24;
      const daysDifference = Math.floor(timeDifference / millisecondsPerDay);
      return daysDifference;
    },

    getCurrentSolNum() { return this.daysBetween(this.startDate, new Date()); },
    getUiSolNum() { return this.__solNum; },

    async _changeSol(that, solNum) 
    { 
      console.log("time THIS: " + solNum);
      that.__solNum = solNum;
      console.log("Sol set to " + that.__solNum);
      const sol = await that._recvSol(solNum);
      console.log(sol); 
      that.__sol = sol;
      that._syncDisplay();
    },    

    _addContent(chatPanel, numberInput) 
    {
      let number = numberInput.getValue();
      for (let i = 0; i < number; i++) {
        let newMessage = new qx.ui.basic.Label(`New message ${i + 1}`);
        chatPanel.add(newMessage);
      }
    },

    async _doGET(endpoint)
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

    async _doPOST(endpoint, body)
    {
      if (endpoint !== 'login')
      {
        body.username = this.__username;
        body.token = "Boken";
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

    async _sendMessage(message)
    {
      const body = { message: message };
      this._doPOST('ims', body);
    },

    async _sendLogin(username, password)
    {
      const body = { username: username, password, password };
      return await this._doPOST('login', body);
    },

    async _sendReport(report)
    {
      const body = 
      {
        reportName: report.name,
        content: report.content, // fileContent,
        username: "matts",
        token: "Boken"
      };
      this._doPOST('reports/update', body);
    },

    async _transmitReport(report)
    {
      const body = 
      {
        username: "matts",
        token: "Boken"
      };
      this._doPOST('reports/transmit/' + report.name, body);
    },

    async _recvSol(solNum) { return await this._doGET('sols/' + solNum); },

    async _recvReports()   { return await this._doGET('reports'); },

    async _recvCommsDelay()   { return (await this._doGET('comms-delay')).commsDelay; },

    async _recvStartDate()   { return (await this._doGET('start-date')).startDate; },

    async _transmitMessage0(message)
    {
      const data = 
      {
        message: message,
        username: "matts",
        token: "Boken"
      };
      alert(JSON.stringify(data));
      try 
      {
        const response = await fetch('http://localhost:8081/ims', 
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) 
        {
            const result = await response.text();
            alert('File uploaded successfully: ' + result);
        } else 
        {
            alert('File upload failed.');
            alert(JSON.stringify(response));
        }
      } catch (error) 
      {
        console.error('Error uploading file:', error);
        alert('An error occurred while uploading the file.');
      }
    },

    _doMessage(chatPanel, chatInput) 
    {
      let message = chatInput.getValue().trim();
      if (!message) {
        alert("Please enter a message.");
        return;
      }

      // Simple markdown and emoticon parsing
      let formattedMessage = this._parseMessage(message);
      let newMessage = new qx.ui.basic.Label().set({
        value: formattedMessage,
        rich: true
      });
      chatPanel.add(newMessage);
      chatInput.setValue("");
      this._sendMessage(formattedMessage);
    },

    _parseMessage(message) 
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

    _handleLoginLogout() 
    {
      if (this.__isLoggedIn) 
      {
        // Display logout menu
        let menu = new qx.ui.menu.Menu();
        let logoutButton = new qx.ui.menu.Button("Log out");
        logoutButton.addListener("execute", () => this._logout());
        menu.add(logoutButton);
        menu.setOpener(this.__loginButton);
        menu.open();
        //menu.placeToWidget(this.__loginButton); // this doesn't seem to be necessary when using setOpener
      }
      else 
        this._openLoginDialog();
    },

    _openLoginDialog() 
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
      loginButton.addListener("execute", () => this._attemptLogin(usernameInput.getValue(), passwordInput.getValue(), loginDialog));
      buttonContainer.add(loginButton);

      let cancelButton = new qx.ui.form.Button("Cancel");
      cancelButton.addListener("execute", () => loginDialog.close());
      buttonContainer.add(cancelButton);

      loginDialog.center();
      loginDialog.open();
    },

    async _attemptLogin(username, password, loginDialog) 
    {
      const result = await this._sendLogin(username, password);
      if (result.token)
      {
        this.__isLoggedIn = true;
        this.__username = username;
        this.__token = result.token;
        this.__loginButton.setLabel(username);
        //this.__loginButton.setBackgroundColor("#ccccff");
        setBGColor ( this.__loginButton, "#ccccff" );
        if (loginDialog) loginDialog.close();
      } else {
        alert("Invalid username or password");
      }

    },

    _logout() 
    {
      this.__isLoggedIn = false;
      this.__username = null;
      this.__loginButton.setLabel("Login");
      this.__loginButton.setBackgroundColor("#ffcccc");
      // Add any additional logout logic here
    },
  }
});

function commsDelayPassed(sentTime, commsDelay)
{
  if (!(sentTime instanceof Date)) sentTime = new Date(sentTime);
  const now = new Date();
  return (now - sentTime) * 1000 >= commsDelay;
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


qx.Class.define("myapp.ReportUI", 
{ extend: qx.core.Object, 
  construct: function(name, parentContainer, commsDelay, network) 
  {
    const that = this;
    this.base(arguments); // Call superclass constructor
    this.name = name;
    this.network = network;
    this.commsDelay = commsDelay;

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

    let editButton = new qx.ui.form.Button("Edit");
    editButton.addListener("execute", function () { that.openReportEditor(); } );
    container.add(editButton);
    this.editButton = editButton;
    
    let txButton = new qx.ui.form.Button("Transmit");
    txButton.addListener("execute", function () 
    { 
      that.report.transmitted = true;
      that.report.xmitTime = new Date();
      that.network._transmitReport(that.report); // tell server to send report to Earth
      that.realizeState("Transmitted"); 
      startXmitProgressDisplay(commsDelay, container);
    });
    txButton.setEnabled(false);
    container.add(txButton);
    this.txButton = txButton;

    const label = makeLabel(name, "gray", 18);
    //let label = new qx.ui.basic.Label(name);
    container.add(label);
    this.label = label;
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

    reset() { console.log("reset"); this.realizeState("Unused"); },

    onChange() 
    { 
      console.log("something changed, Holmez");
      this.network._sendReport(this.report);
      this.realizeState();
    },

    update(report) 
    { //  instead of copying state out, we need to keep a reference to the report so that we can later update it e.g. when the xmit button is pressed
      console.log("new report incoming: " + report.name);
      this.report = report;
      this.realizeState();
    },

    computeState()
    {
      console.log("compute THIS: " + JSON.stringify(this.report));
      if (this.report.transmitted) console.log("transmitted..." + commsDelayPassed(this.report.xmitTime, this.commsDelay));
      if (this.report.transmitted) 
        if (commsDelayPassed(this.report.xmitTime, this.commsDelay)) return "Received";
        else return "Transmitted";

      if (this.report.content) return "Populated";
      else return "Empty";
    },

    realizeState(forcedState)
    {
      const isCurrentSol = this.network.getCurrentSolNum() === this.network.getUiSolNum();
      this.state = forcedState ? forcedState : this.computeState();
      console.log("realizing new state: " + this.state + ", isCurrentSol=" + isCurrentSol);
      const editEnabled = this.state !== "Unused" && isCurrentSol;
      const editBgColor = editEnabled ? "#ccccff" : "#cccccc";
      const txEnabled = editEnabled && this.state !== "Empty";
      const txBgColor = txEnabled ? "#ccccff" : "#cccccc";
      if (this.fsButton)   {   this.fsButton.setEnabled(editEnabled); setBGColor(this.fsButton, editBgColor); }
      if (this.editButton) { this.editButton.setEnabled(editEnabled); setBGColor(this.editButton, editBgColor); }
      if (this.txButton)   {   this.txButton.setEnabled(txEnabled);   setBGColor(this.txButton, txBgColor); }

      let color;
      if      (this.state === "Unused")      color = "gray";
      else if (this.state === "Empty")       color = "orange";
      else if (this.state === "Populated")   color = "blue";
      else if (this.state === "Transmitted") color = "purple";
      else if (this.state === "Received")    color = "green";
      if (this.label) this.label.setTextColor(color);
    },

    openReportEditor()
    {
      // Create and open the CKEditor window
      let ckEditorWindow = new myapp.CKEditorWindow(this, this.report.content);
      ckEditorWindow.open();
      //doc.add(ckEditorWindow);      
    },

    setContent(content)
    {
      console.log("setting model content: " + content);
      this.report.content = content;
      this.onChange();
    },

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



qx.Class.define("myapp.CKEditor", 
{ extend: qx.ui.core.Widget,
  construct: function(afterInit) 
  {
    this.base(arguments);
    this._setLayout(new qx.ui.layout.Grow());
    this.afterInit = afterInit;
    this.addListenerOnce("appear", this.__initCKEditor, this); // Add an appear listener to initialize CKEditor
    this.addListener("resize", this.__onResize, this); // Add a resize listener to adjust CKEditor height
  },

  members: 
  {
    __editor: null,
    __editorId: null,
    afterInit: null,

    _createContentElement: function() 
    {
      // Create a div with a unique ID for CKEditor to attach to
      this.__editorId = "ckeditor-" + this.toHashCode();
      let div = new qx.html.Element("div", null, 
      {
        "id": this.__editorId,
        "style": "height:100%;"
      });

      return div;
    },

    __initCKEditor: function() 
    {
      // Initialize CKEditor with the unique ID
      console.log("init dat bitch");
      let editorElement = document.getElementById(this.__editorId);
      this.__editor = CKEDITOR.replace(editorElement, { height: '100%' } );

      // Explicitly focus the editor after initialization
      qx.event.Timer.once(() => 
      { 
        if (this.afterInit) this.afterInit(); 
        this.__editor.focus();
        this.__updateEditorHeight();
        console.log("post init fun"); 
      }, this, 300);
    },

    __onResize: function() { this.__updateEditorHeight(); },

    __updateEditorHeight: function() 
    {
      if (this.__editor) 
      {
        //let containerHeight = this.getContentElement().getDomElement().clientHeight;
        let containerHeight = this.getBounds().height - 50;
        console.log("winder size: " + containerHeight);
        this.__editor.resize('100%', containerHeight);
      }
    },

    // Method to set data into the editor
    setContent: function(data) 
    {
      console.log("setting editor content: " + data);
      console.log("this.__editor" + this.__editor);
      if (this.__editor) 
        this.__editor.setData(data);
      else 
        this.addListenerOnce("editorReady", () => { this.__editor.setData(data); } );
    },
    
        // Method to get data from the editor
    getContent: function() 
    {
      if (this.__editor) 
        return this.__editor.getData();
      return "";
    }
  }
});

qx.Class.define("myapp.CKEditorWindow", 
{ extend: qx.ui.window.Window,
  construct: function(parent, content) 
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
    let okButton = new qx.ui.toolbar.Button("OK");
    okButton.addListener("execute", this.__onOK, this);
    toolbar.add(okButton);

    let cancelButton = new qx.ui.toolbar.Button("Cancel");
    cancelButton.addListener("execute", this.__onCancel, this);
    toolbar.add(cancelButton);

    this.add(toolbar, { edge: "south" });
  },

  members: 
  {
    ckEditor: null,
    parent: null,

    __onOK: function() 
    {
      let content = this.ckEditor.getContent();
      console.log("onOK setting content: " + content);
      this.parent.setContent(content);
      this.close();
    },

    __onCancel: function() { this.close(); }
  }

});


qx.Class.define("myapp.CircularProgress", {
  extend: qx.ui.core.Widget,

  construct: function() {
    this.base(arguments);
    this._setLayout(new qx.ui.layout.Canvas());
    this.__progress = 0;

    // Add a listener to update the progress when the widget appears
    this.addListenerOnce("appear", this._draw, this);
  },

  properties: {
    progress: {
      check: "Number",
      init: 0,
      apply: "_applyProgress"
    }
  },

  members: {
    __progress: null,

    _createContentElement: function() {
      let canvas = new qx.html.Element("canvas");
      return canvas;
    },

    _applyProgress: function(value) {
      this.__progress = value;
      this._draw();
    },

    _draw: function() {
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
        -Math.PI / 2 + 2 * Math.PI * this.__progress,
        false
      );
      context.closePath();
      context.fillStyle = "#4caf50";
      context.fill();
    }
  }
});

function startXmitProgressDisplay(commsDelay, parentContainer)
{
  // Create the circular progress widget
  let circularProgress = new myapp.CircularProgress();
  circularProgress.setWidth(30);
  circularProgress.setHeight(30);
  parentContainer.add(circularProgress);

  // do progress updates
  const totalUpdates = 100;
  let progress = 0;
  let timer = new qx.event.Timer(commsDelay * 1000 / totalUpdates); // update every 1/100 of the commsDelay
  timer.addListener("interval", function() 
  {
    progress += 1/totalUpdates;
    if (progress > 1) 
    {
      timer.stop();
      parentContainer.remove(circularProgress);
    }
    circularProgress.setProgress(progress);
  });
  timer.start();      
}


/*
_createBtn : function ( txt, clr, width, cb, ctx )  {
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


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

      this.__commsDelay = this._recvCommsDelay();

/*      // Define custom decorators
      qx.theme.manager.Decoration.getInstance().setTheme(qx.theme.Simple);
      qx.Class.define("custom.Decoration",
        {
          extend: qx.core.Object,
          statics: {
            register: function () {
              let manager = qx.theme.manager.Decoration.getInstance();
              manager.add({
                loginButton: {
                  style: {
                    width: 1,
                    color: "red",
                    backgroundColor: "#ffcccc",
                    radius: 3
                  }
                },
                loggedInButton: {
                  style: {
                    width: 1,
                    color: "blue",
                    backgroundColor: "#ccccff",
                    radius: 3
                  }
                }
              });
            }
          }
        });

      custom.Decoration.register();
*/

      // Create the main layout
      let doc = this.getRoot();
      let mainContainer = new qx.ui.container.Composite(new qx.ui.layout.VBox());
      doc.add(mainContainer, { edge: 0 });

      // Top panel
      let topPanel = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
      topPanel.setPadding(10);
      topPanel.setDecorator("main");
      mainContainer.add(topPanel);

      let numberLabel = new qx.ui.basic.Label("Choose a number, foo 05:");
      numberLabel.setTextColor("blue");
      topPanel.add(numberLabel);

      let numberInput = new qx.ui.form.Spinner();
      numberInput.addListener("changeValue", async function(event) 
      {
        const that = this; // "this" won't work inside the setTimeout callback 
        const solNum = event.getData(); // proper event is not available inside the setTimeout callback

        if (this.__timerId) { clearTimeout(this.__timerId); } // Clear any existing timer       
        this.__timerId = setTimeout(async function() 
        { // Set a new timer to execute after 500ms
          that._changeSol(that, solNum);
          /*
          console.log("time THIS: " + solNum);
          that.__solNum = solNum;
          console.log("Sol set to " + that.__solNum);
          const sol = await that._recvSol(solNum);
          console.log(sol); 
          that.__sol = sol;
          that._syncDisplay();
          */
        }, 700);
      }, this);
      topPanel.add(numberInput);

      let addButton = new qx.ui.form.Button("Add to Chat");
      addButton.addListener("execute", () => this._addContent(chatPanel, numberInput));
      topPanel.add(addButton);
      
      // Login/Logout Button
      this.__loginButton = new qx.ui.form.Button("Login");
      this.__loginButton.addListenerOnce ( "appear", function ( )  
        { this.setBGColor (this.__loginButton, "#ffcccc"); }, this);

      //this.setBGColor(this.__loginButton, "#ffcccc", '#ffcccc');
      //this.__loginButton.setBackgroundColor("#ffcccc");
      //this.__loginButton.setDecorator("loginButton");
      this.__loginButton.addListener("execute", () => this._handleLoginLogout());
      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
      topPanel.add(this.__loginButton);
      
      //var btnLogin = this._createBtn("Facture", "#AAAAFF70", 100, function ( ) { alert("FACTURE!"); }, this);
      //topPanel.add(btnLogin);

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
   
      let chatInput = new qx.ui.form.TextField();
      chatInput.setPlaceholder("Type a message...");
      chatInputContainer.add(chatInput, { flex: 1 });

      let sendButton = new qx.ui.form.Button("Send");
      sendButton.addListener("execute", () => this._sendMessage(chatPanel, chatInput));
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

      //let quillEditor = new myapp.QuillEditor();
      //rightPanel.add(quillEditor, { edge: 0 });

      await this._attemptLogin("matts", "yo"); //TODO: remove autologin before release
      await this._changeSol(this, 0);

    },

    sleep(ms) { return new Promise((resolve) => { setTimeout(resolve, ms); }); },

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

    async _sendReport(name, content)
    {
      const body = 
      {
        reportName: name,
        content: content, // fileContent,
        username: "matts",
        token: "Boken"
      };
      this._doPOST('reports/update', body);
    },

    async _recvSol(solNum) { return await this._doGET('sols/' + solNum); },

    async _recvReports()   { return await this._doGET('reports'); },

    async _recvCommsDelay()   { return (await this._doGET('comms-delay')).commsDelay; },

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
            //mode: 'no-cors', // this fixes CORS problems but introduces other problems -- DON'T USE
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

    _sendMessage(chatPanel, chatInput) 
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
        this.setBGColor ( this.__loginButton, "#ccccff" );
        if (loginDialog) loginDialog.close();
      } else {
        alert("Invalid username or password");
      }

      /*
      // Simulate a REST API call
      setTimeout(() => {
        if (username === "user" && password === "password") {
          this.__isLoggedIn = true;
          this.__username = username;
          this.__loginButton.setLabel(username);
          this.__loginButton.setBackgroundColor("#ccccff");
          loginDialog.close();
        } else {
          alert("Invalid username or password");
        }
      }, 1000);
      */
    },

    _logout() 
    {
      this.__isLoggedIn = false;
      this.__username = null;
      this.__loginButton.setLabel("Login");
      this.__loginButton.setBackgroundColor("#ffcccc");
      // Add any additional logout logic here
    },

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
    setBGColor : function ( btn, clr1, clr2 ) {
       var elem = btn.getContentElement ( );
       var dom  = elem.getDomElement ( );
       if (!clr2) clr2 = clr1;
       var img  = "linear-gradient(" + clr1 + " 35%, " + clr2 + " 100%)";
       if ( dom.style.setProperty )
            dom.style.setProperty ( "background-image", img, null );
       else
            dom.style.setAttribute ( "backgroundImage", img );
    },

      /*
      -------------------------------------------------------------------------
        Below is your actual application code...
      -------------------------------------------------------------------------
      

      // Create a button
      const button1 = new qx.ui.form.Button("Click me", "myapp/test.png");

      // Document is the application root
      const doc = this.getRoot();

      // Add button to document at fixed coordinates
      doc.add(button1, {left: 100, top: 50});

      // Add an event listener
      button1.addListener("execute", function() {
        // eslint no-alert: "off"
        alert("Hello World!");
      });
      */
  }
    
});

function commsDelayPassed(sentTime, commsDelay)
{
  const now = new Date();
  return (now - sentTime) * 1000 >= commsDelay;
}

qx.Class.define("myapp.ReportUI", 
{ extend: qx.core.Object, 
  construct: function(name, parentContainer, commsDelay, network) 
  {
    this.base(arguments); // Call superclass constructor
    this.name = name;
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
          let content = reader.result; 
          console.log("The first 4 chrs are: " + content); 
          network._sendReport(name, content);
        });
        reader.readAsText(file.slice(0,4));
      }
    }, this);
    container.add(fsb);
    //fsb.setEnabled(false); // disabling the FileSelectorButton somehow prevents it working properly even after it's re-enabled -- FARUK
    this.fsButton = fsb;

    let editButton = new qx.ui.form.Button("Edit");
    const that = this;
    editButton.addListener("execute", function () { that.openReportEditor(); that.realizeState(); } );
    container.add(editButton);
    this.editButton = editButton;
    
    let txButton = new qx.ui.form.Button("Transmit");
    txButton.addListener("execute", function () { that.transmitted = true; that.realizeState(); } );
    txButton.setEnabled(false);
    container.add(txButton);
    this.txButton = txButton;

    let label = new qx.ui.basic.Label(name);
    container.add(label);
    this.label = label;
  },
  
  members: 
  {
    name: null,
    commsDelay: 0,

    container: null,
    icon: null,
    fsButton: null,
    editButton: null,
    txButton: null,
    label: null,

    state: "Unused", // ReportUI states: Unused, Empty, Populated, Transmitted, Received
    content: null,
    txTime: new Date(),

    reset() { this.state = "Unused"; this.realizeState(); },

    update(report)
    {
      this.state = this.computeState(report);
      this.content = report.content;
      this.txTime = report.time;
      this.realizeState();
    },

    computeState(report)
    {
      if (report.transmitted) 
        if ( commsDelayPassed(this.time, this.commsDelay) ) return "Received";
        else return "Transmitted";

      if (report.content) return "Populated";
      else return "Empty";
    },

    realizeState()
    {
      if (this.fsButton) this.fsButton.setEnabled(this.state !== "Unused");
      if (this.txButton) this.txButton.setEnabled(this.state !== "Unused" && this.state !== "Empty");
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
      let ckEditorWindow = new myapp.CKEditorWindow(this, this.content);
      ckEditorWindow.open();
      //doc.add(ckEditorWindow);      
    },

    setContent(content)
    {
      this.content = content;
      this.realizeState();
    }
  }
});



qx.Class.define("myapp.CKEditor", 
{ extend: qx.ui.core.Widget,
  construct: function() 
  {
    this.base(arguments);
    this._setLayout(new qx.ui.layout.Grow());
    this.addListenerOnce("appear", this.__initCKEditor, this); // Add an appear listener to initialize CKEditor
    this.addListener("resize", this.__onResize, this); // Add a resize listener to adjust CKEditor height
  },

  members: 
  {
    __editor: null,
    __editorId: null,

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
      let editorElement = document.getElementById(this.__editorId);
      this.__editor = CKEDITOR.replace(editorElement, { height: '100%' } );

      // Explicitly focus the editor after initialization
      qx.event.Timer.once(() => { this.__editor.focus(); }, this, 300);
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
    // Add the CKEditor to the window
    this.ckEditor = new myapp.CKEditor();
    this.add(this.ckEditor);

    // Enable focus for the window
    this.setModal(true);
    this.setAllowClose(true);
    this.setAllowMinimize(false);

    this.ckEditor.setContent(content);

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
      this.parent.setContent(content);
      this.close();
    },

    __onCancel: function() { this.close(); }
  }

});

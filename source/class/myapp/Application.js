/* ************************************************************************

   Copyright: 2024 undefined

   License: MIT license

   Authors: undefined

************************************************************************ */

/**
 * This is the main application class of "myapp"
 *
 * @asset(myapp/*)
 */
qx.Class.define("myapp.Application",
{
  extend : qx.application.Standalone,



  /*
  *****************************************************************************
     MEMBERS
  *****************************************************************************
  */

  members :
  {
    /**
     * This method contains the initial application code and gets called
     * during startup of the application
     *
     * @lint ignoreDeprecated(alert)
     */
    main()
    {
      // Call super class
      super.main();

      // Enable logging in debug variant
      if (qx.core.Environment.get("qx.debug"))
      {
        // support native logging capabilities, e.g. Firebug for Firefox
        qx.log.appender.Native;
        // support additional cross-browser console. Press F7 to toggle visibility
        qx.log.appender.Console;
      }

      // Create the main layout
      let doc = this.getRoot();
      let mainContainer = new qx.ui.container.Composite(new qx.ui.layout.VBox());
      doc.add(mainContainer, { edge: 0 });

      // Top panel
      let topPanel = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
      topPanel.setPadding(10);
      topPanel.setDecorator("main");
      mainContainer.add(topPanel);

      let numberLabel = new qx.ui.basic.Label("Choose a number, foo 01:");
      topPanel.add(numberLabel);

      let numberInput = new qx.ui.form.Spinner();
      topPanel.add(numberInput);

      let addButton = new qx.ui.form.Button("Add to Chat");
      addButton.addListener("execute", () => this._addContent(chatPanel, numberInput));
      topPanel.add(addButton);

      
      // Container for the middle section
      let middleContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox());
      middleContainer.setDecorator("main");
      mainContainer.add(middleContainer, { flex: 1 });

      //const button1 = new qx.ui.form.Button("Click me", "myapp/test.png");
      //middleContainer.add(button1, { flex: 2 });
      //button1.addListener("execute", function() { alert("Hello World!"); });


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

      //const button2 = new qx.ui.form.Button("Clack me", "myapp/test.png");
      //chatContainer.add(button2);
      //button2.addListener("execute", function() { alert("Hello Douche!"); });

      //const button3 = new qx.ui.form.Button("Clonck me", "myapp/test.png");
      //chatInputContainer.add(button3);
      //button3.addListener("execute", function() { alert("Hello Baag!"); });

      
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

      let items = ["Item 1 description", "Item 2 description", "Item 3 description"];
      items.forEach((itemText, index) => {
        let itemContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
        rightPanel.add(itemContainer);

        let icon = new qx.ui.basic.Image("icon/22/actions/document-open.png");
        itemContainer.add(icon);

        let uploadButton = new qx.ui.form.Button("Upload");
        itemContainer.add(uploadButton);

        let itemLabel = new qx.ui.basic.Label(itemText);
        itemContainer.add(itemLabel);
      });
      
    },

    _addContent(chatPanel, numberInput) 
    {
      let number = numberInput.getValue();
      for (let i = 0; i < number; i++) {
        let newMessage = new qx.ui.basic.Label(`New message ${i + 1}`);
        chatPanel.add(newMessage);
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
    }

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

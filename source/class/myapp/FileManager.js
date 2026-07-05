/* Copyright © 2024 by Matthew F. Storch.  Usage is subject to the license included in the MarsComm client repo. */

qx.Class.define("myapp.FileManager",
{
  extend: qx.ui.window.Window,

  construct: function(app, folders, files)
  {
    this.base(arguments, "File Manager");
    this.setLayout(new qx.ui.layout.VBox(5));
    this.setWidth(720);
    this.setHeight(500);
    this.setModal(true);
    this.setShowMinimize(false);
    this.setPadding(8);

    this.__app     = app;
    this.__folders = folders;
    this.__files   = files;

    // Main area: tree | file list
    const mainRow = new qx.ui.container.Composite(new qx.ui.layout.HBox(8));
    this.add(mainRow, { flex: 1 });

    // Left: folder tree
    this.__tree = new qx.ui.tree.Tree();
    this.__tree.setWidth(180);
    this.__tree.setAllowGrowX(false);
    this.__tree.setAllowGrowY(true);

    const root = new qx.ui.tree.TreeFolder("Folders");
    root.setOpen(true);
    this.__tree.setRoot(root);
    const treeItems = [];
    folders.forEach(function(f) {
      const item = new qx.ui.tree.TreeFolder(f.path);
      item.setUserData("folderPath", f.path);
      root.add(item);
      treeItems.push(item);
    });
    mainRow.add(this.__tree);

    // Vertical divider
    const vsep = new qx.ui.core.Widget();
    vsep.setWidth(1);
    vsep.setBackgroundColor(themeInactiveColor());
    mainRow.add(vsep);

    // Right: scrollable file list
    this.__filePanel = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
    this.__filePanel.setPadding(4);
    const fileScroll = new qx.ui.container.Scroll();
    fileScroll.add(this.__filePanel);
    mainRow.add(fileScroll, { flex: 1 });

    // Bottom bar
    const bbar = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    this.__uploadBtn = new qx.ui.form.FileSelectorButton("Upload to folder...");
    this.__uploadBtn.setMultiple(true);
    this.__uploadBtn.addListener("changeFileSelection", this.__onUpload, this);
    bbar.add(this.__uploadBtn);
    bbar.add(new qx.ui.core.Spacer(), { flex: 1 });
    makeButton(bbar, "Close", this.close, themeButtonColor(), 14, this);
    this.add(bbar);

    // Tree selection handler
    this.__tree.addListener("changeSelection", function(e) {
      const sel = e.getData();
      if (sel && sel.length > 0) {
        const fp = sel[0].getUserData("folderPath");
        if (fp) this.__showFolder(fp);
      }
    }, this);

    // Select first folder by default
    if (treeItems.length > 0) this.__tree.setSelection([treeItems[0]]);
  },

  members:
  {
    __app:           null,
    __folders:       null,
    __files:         null,
    __tree:          null,
    __filePanel:     null,
    __uploadBtn:     null,
    __currentFolder: null,

    updateFiles: function(files)
    {
      this.__files = files;
      if (this.__currentFolder) this.__showFolder(this.__currentFolder);
    },

    // Returns the state of a file as seen from the current viewer's planet,
    // accounting for prevOp delays on mutations from the other planet.
    __effectiveFile: function(file)
    {
      if (!file.prevOp) return file;
      const po = file.prevOp;
      if (po.planet === planet || commsDelayPassed(new Date(po.xmitTime))) return file;
      // Operation from other planet is still in transit — show the pre-operation state
      const eff = Object.assign({}, file);
      if (po.op === "rename") eff.name   = po.prevName;
      else if (po.op === "move")   eff.folder = po.prevFolder;
      else if (po.op === "delete") eff.deleted = false;
      return eff;
    },

    __showFolder: function(folderPath)
    {
      this.__currentFolder = folderPath;
      this.__filePanel.removeAll();

      const that = this;
      const folderFiles = this.__files
        .map(function(f) { return that.__effectiveFile(f); })
        .filter(function(f) { return !f.deleted && f.folder === folderPath; });

      if (folderFiles.length === 0)
      {
        const empty = new qx.ui.basic.Label("(no files in this folder)");
        empty.setTextColor(themeInactiveColor());
        this.__filePanel.add(empty);
        return;
      }

      folderFiles.forEach(function(f) { that.__addFileRow(f); });
    },

    __addFileRow: function(file)
    {
      const that = this;
      const row = new qx.ui.container.Composite(new qx.ui.layout.HBox(6));
      row.setPadding([2, 4]);

      const nameLabel = new qx.ui.basic.Label(file.name);
      nameLabel.setToolTipText(file.name);
      row.add(nameLabel, { flex: 3 });

      const uploader = allUsers.find(function(u) { return u.name === file.uploadedBy; });
      row.add(new qx.ui.basic.Label(uploader ? uploader.role : file.uploadedBy), { flex: 2 });

      row.add(new qx.ui.basic.Label(this.__fmtSize(file.size)), { flex: 1 });

      const badge = this.__statusBadge(file);
      const badgeLabel = new qx.ui.basic.Label(badge);
      if (badge) badgeLabel.setTextColor(badge.indexOf("transit") >= 0 ? "#ff8800" : "#44aa44");
      row.add(badgeLabel, { flex: 2 });

      const btns = new qx.ui.container.Composite(new qx.ui.layout.HBox(3));
      makeButton(btns, "⬇", function() { that.__onDownload(file); }, themeButtonColor(), 11, that);
      makeButton(btns, "✎", function() { that.__onRename(file);   }, themeButtonColor(), 11, that);
      makeButton(btns, "⇒", function() { that.__onMove(file);     }, themeButtonColor(), 11, that);
      makeButton(btns, "✕", function() { that.__onDelete(file);   }, themeButtonColor(), 11, that);
      row.add(btns);

      this.__filePanel.add(row);
    },

    __statusBadge: function(file)
    {
      if (file.planet !== planet && !commsDelayPassed(new Date(file.xmitTime)))
        return "\u23f3 In transit";
      if (file.planet !== planet)
        return "\u2713 Received";
      return "";
    },

    __fmtSize: function(bytes)
    {
      if (!bytes) return "0 B";
      if (bytes < 1024)    return bytes + " B";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1048576).toFixed(1) + " MB";
    },

    __onDownload: function(file)
    {
      doDownload("files/download?id=" + file.id, file.name);
    },

    __onRename: function(file)
    {
      const newName = window.prompt("New filename:", file.name);
      if (!newName || newName === file.name) return;
      const that = this;
      this.__app.doPOST("files/rename", { id: file.id, name: newName })
        .then(function(r) { if (r) { file.name = newName; that.__showFolder(that.__currentFolder); } });
    },

    __onMove: function(file)
    {
      const that = this;
      const dlg = new qx.ui.window.Window("Move to folder");
      dlg.setLayout(new qx.ui.layout.VBox(10));
      dlg.setWidth(260);
      dlg.setModal(true);
      dlg.setShowMinimize(false);
      dlg.setPadding(10);

      const sel = new qx.ui.form.SelectBox();
      const selItems = [];
      this.__folders.forEach(function(f) {
        const item = new qx.ui.form.ListItem(f.path);
        item.setModel(f.path);
        sel.add(item);
        selItems.push(item);
      });
      selItems.forEach(function(item) {
        if (item.getModel() === file.folder) sel.setSelection([item]);
      });
      dlg.add(sel);

      const btnRow = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
      makeButton(btnRow, "Move", function() {
        const selArr = sel.getSelection();
        const newFolder = selArr && selArr.length ? selArr[0].getModel() : null;
        if (newFolder && newFolder !== file.folder) {
          that.__app.doPOST("files/move", { id: file.id, folder: newFolder })
            .then(function(r) {
              if (r) { file.folder = newFolder; that.__showFolder(that.__currentFolder); }
            });
        }
        dlg.close();
      }, themeButtonColor(), 14, that);
      makeButton(btnRow, "Cancel", dlg.close, themeButtonColor(), 14, dlg);
      dlg.add(btnRow);

      dlg.open();
      dlg.center();
    },

    __onDelete: function(file)
    {
      if (!window.confirm("Delete '" + file.name + "'?")) return;
      const that = this;
      this.__app.doPOST("files/delete", { id: file.id })
        .then(function(r) {
          if (r) { file.deleted = true; that.__showFolder(that.__currentFolder); }
        });
    },

    __onUpload: function(e)
    {
      const folderPath = this.__currentFolder;
      if (!folderPath) { alert("Select a folder first."); return; }
      const files = e.getData();
      if (!files || !files.length) return;

      const formData = new FormData();
      for (let i = 0; i < files.length; i++)
        formData.append("files", files[i]);
      formData.append("folder", folderPath);
      formData.append("username", username);
      formData.append("token", this.__app.token);

      const req = new qx.io.request.Xhr(urlPrefix + "files/upload");
      req.setMethod("POST");
      req.setRequestData(formData);
      req.addListener("success", function() { log("File upload success"); });
      req.addListener("fail",    function() { alert("File upload failed"); });
      req.send();
    }
  }
});

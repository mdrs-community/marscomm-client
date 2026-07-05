/* TODO
*/

/* Copyright © 2024 by Matthew F. Storch.  Usage is subject to the license included in the MarsComm client repo. */

let urlPrefix = 'http://localhost:8081/';
let refDate = null;
let missionStartDate = null; // Date object (local midnight of Sol 1), or null in legacy mode
let solDuration = "Earth";   // "Earth" or "Mars"
const MARS_SOL_MS = 88775244; // one Martian sol in milliseconds (24h 39m 35.244s)
let commsDelay = 0;
let crewNum = 0;
let rotationLength = 0;
let username = null;
let planet = null;
let app = null;
let theme = 0; // 0=dark, 1=light
let allUsers = [];
let allGroups = [];
let allFiles = [];
let fileFolders = [];
let distributionCooldown = 2;
let messageArrivalSoundCooldown = 180;
let testMode = false;
let jokes = [];
let lastIMSoundTime = 0;
let audioCtx = null;
const darkColor = '#222222';
const lightColor = '#eeeeee';
function themeBgColor()       { return theme ? lightColor : darkColor; }
function themeButtonColor()   { return theme ? "#ccccff"  : '#9999dd' }
function themeInactiveColor()        { return theme ? "#cccccc"  : '#999999' }
function themeDisabledButtonColor() { return theme ? "#aaaaaa"  : '#666666' }
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
  if (missionStartDate)
  {
    const solDurationMs = (solDuration === "Mars") ? MARS_SOL_MS : (1000 * 60 * 60 * 24);
    const sol = Math.floor((date.getTime() - missionStartDate.getTime()) / solDurationMs) + 1;
    return Math.max(0, Math.min(sol, rotationLength + 1));
  }
  // legacy: use refDate (today at server start = Sol 0)
  let solNum = Math.floor((date.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
  if (solNum > rotationLength - 1) solNum = rotationLength - 1;
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

function makeButton(container, str, onExecute, color, fontSize, that, image, tooltip)
{
  if (!fontSize) fontSize = 14;
  if (!color) color = "gray";
  const button = str ? new qx.ui.form.Button(str) : new qx.ui.form.Button(null, image);
  if (str) button.addListenerOnce("appear", function () { setBGColor(button, color); }, that);
  if (tooltip) button.setToolTipText(tooltip);
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

async function doDownload(urlPath, filename)
{
  const url = urlPrefix + urlPath;
  log("attempting download of " + url);
  try
  {
    const response = await fetch(url);
    if (!response.ok) { alert("Download failed: " + response.statusText); return; }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  }
  catch (e) { log("doDownload error: " + e.message); alert("Download failed"); }
}

function getAudioContext()
{
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Short hi-tech chirp: frequency sweeps up rapidly. Subject to cooldown.
function playIMArrivedSound()
{
  const now = Date.now();
  if (now - lastIMSoundTime < messageArrivalSoundCooldown * 1000) return;
  lastIMSoundTime = now;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.35);
  } catch(e) { log("IM sound error: " + e); }
}

// Two-note ascending chime for report arrival. No cooldown.
function playReportArrivedSound()
{
  try {
    const ctx = getAudioContext();
    [523, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.25;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch(e) { log("report sound error: " + e); }
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
      const organization = await this.recvOrganization();
      const version      = await this.recvVersion();
      const refDateInfo = await this.recvRefDate();
      refDate = new Date(refDateInfo.refDate);
      this.refDate = refDate;
      if (refDateInfo.missionStartDate)
      {
        const [y, m, d] = refDateInfo.missionStartDate.split('-').map(Number);
        missionStartDate = new Date(y, m-1, d);
      }
      solDuration = refDateInfo.solDuration || "Earth";
      log("commsDelay=" + commsDelay + ", refDate=" + this.refDate + ", missionStartDate=" + missionStartDate + ", solDuration=" + solDuration);
      const usersData = await this.recvUsers();
      allUsers = usersData.users || [];
      allGroups = usersData.groups || [];
      distributionCooldown       = (await this.recvDistributionCooldown()).distributionCooldown || 2;
      messageArrivalSoundCooldown = (await this.recvMessageArrivalSoundCooldown()).messageArrivalSoundCooldown ?? 180;
      testMode = (await this.recvTestMode()).testMode ?? false;
      fileFolders = (await this.recvFileFolders()) || [];
      if (testMode) {
        try {
          const resp = await fetch('resource/myapp/jokes.json');
          jokes = await resp.json();
        } catch(e) { log('jokes load failed: ' + e); }
      }

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

      const logoFile = (organization === "LunAres") ? "myapp/LunAreslogo.png" : "myapp/MDRSlogo.jpg";
      let logo = new qx.ui.basic.Image(logoFile);
      logo.setWidth(30);
      logo.setHeight(30);
      logo.setScale(true);
      topPanel.add(logo);
      const mcLabel = makeLabel(topPanel, organization + " MarsComm", themeBlueText(), 24);
      const versionBox = new qx.ui.container.Composite(new qx.ui.layout.VBox(0));
      versionBox.setPaddingTop(4);
      const fmtVer = function(info) { return info.tag + ' (' + info.hash + ') ' + info.date; };
      makeLabel(versionBox, 'server: ' + fmtVer(version.server), themeInactiveColor(), 10);
      makeLabel(versionBox, 'client: ' + fmtVer(version.client), themeInactiveColor(), 10);
      topPanel.add(versionBox);
      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
      makeLabel(topPanel, "Crew: " + crewNum, themeBlueText(), 24);
      topPanel.add(new qx.ui.core.Spacer(), { flex: 0 });
      makeLabel(topPanel, "Sol", solDuration === "Mars" ? "red" : themeBlueText(), 24);
      let numberInput = new qx.ui.form.Spinner();
      numberInput.set({ minimum: 0, maximum: getSolNum() });
      numberInput.addListener("changeValue", async function(event) 
      {
        const solNum = event.getData(); // proper event is not available inside the setTimeout callback
        if (this.timerId) { clearTimeout(this.timerId); } // Clear any existing timer       
        this.timerId = setTimeout(async function() { that.changeSol(that, solNum); }, 900);
      }, this);
      topPanel.add(numberInput);
      numberInput.setBackgroundColor(themeBgColor()); // TODO: find different way since this somehow doesn't seem to work :(
      this.numberInput = numberInput;
      let todayButton = new qx.ui.form.Button("Today");
      todayButton.addListener("execute", function() { numberInput.setValue(getSolNum()); });
      topPanel.add(todayButton);

      if (missionStartDate)
      {
        const phaseBox = new qx.ui.container.Composite(new qx.ui.layout.HBox(4));
        phaseBox.setPaddingLeft(8);
        const phaseLabel = makeLabel(phaseBox, "", "orange", 17);
        const timeBox = new qx.ui.container.Composite(new qx.ui.layout.VBox(0));
        const earthTimeLabel = makeLabel(timeBox, "", themeBlueText(), 13);
        const solTimeLabel   = makeLabel(timeBox, "", "red", 13);
        phaseBox.add(timeBox);
        topPanel.add(phaseBox);

        function updatePhaseDisplay()
        {
          const now = new Date();
          const sol = getSolNum(now);
          numberInput.setMaximum(sol);
          const pad = n => n.toString().padStart(2, '0');
          if (sol === 0)
          {
            phaseLabel.setValue("PREFLIGHT");
            phaseLabel.setTextColor("orange");
            earthTimeLabel.setValue("");
            solTimeLabel.setValue("");
          }
          else if (sol === rotationLength + 1)
          {
            phaseLabel.setValue("POSTFLIGHT");
            phaseLabel.setTextColor("orange");
            earthTimeLabel.setValue("");
            solTimeLabel.setValue("");
          }
          else
          {
            const earthDate = now.getFullYear() + "-" + pad(now.getMonth()+1) + "-" + pad(now.getDate());
            phaseLabel.setValue(earthDate);
            phaseLabel.setTextColor(themeStdText());
            earthTimeLabel.setValue(pad(now.getHours()) + ":" + pad(now.getMinutes()));
            // Sol time: elapsed Earth-duration hours/minutes since start of the current Sol,
            // where Sol length is determined by solDuration config ("Earth" = 24h, "Mars" = 24h39m35s)
            const solDurMs = (solDuration === "Mars") ? MARS_SOL_MS : (1000 * 60 * 60 * 24);
            const elapsed = (now.getTime() - missionStartDate.getTime()) % solDurMs;
            const solH = Math.floor(elapsed / 3600000);
            const solM = Math.floor((elapsed % 3600000) / 60000);
            solTimeLabel.setValue(solH + ":" + pad(solM));
          }
        }
        updatePhaseDisplay();
        setInterval(updatePhaseDisplay, 60000);
      }

      topPanel.add(new qx.ui.core.Spacer(), { flex: 1 });
         
      let middleContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox());
      middleContainer.setDecorator("main");
      mainContainer.add(middleContainer, { flex: 1 });
      this.chatUI = new myapp.ChatUI(middleContainer, this, organization);

      let rightPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox(10));
      rightPanel.setPadding(10);
      rightPanel.setWidth(300);
      rightPanel.setDecorator("main");
      middleContainer.add(rightPanel);

      makeLabel(rightPanel, "Reports", themeBlueText(), 18);
      let reportNames = await this.recvReports();
      let reportUIs = [];
      log(reportNames);
      reportNames.forEach((meta, index) =>
      {
        let reportUI = new myapp.ReportUI(meta.name, rightPanel, this);
        reportUI.meta = meta; // store access metadata for post-login filtering
        reportUIs.push(reportUI);
      });
      this.reportUIs = reportUIs;

      // --- Files panel ---
      const filesSep = new qx.ui.core.Widget();
      filesSep.setHeight(1);
      filesSep.setBackgroundColor(themeInactiveColor());
      rightPanel.add(filesSep);
      const filesRow = new qx.ui.container.Composite(new qx.ui.layout.HBox(8));
      this.filesCountLabel = new qx.ui.basic.Label("Files");
      this.filesCountLabel.setFont(qx.bom.Font.fromString("16px sans-serif"));
      this.filesCountLabel.setTextColor(themeBlueText());
      filesRow.add(this.filesCountLabel, { flex: 1 });
      makeButton(filesRow, "Files\u2026", () => this.openFileManager(), themeButtonColor(), 14, this, null, "Browse and manage shared mission files");
      rightPanel.add(filesRow);

      // --- Distribution panel ---
      const sep = new qx.ui.core.Widget();
      sep.setHeight(1);
      sep.setBackgroundColor(themeInactiveColor());
      rightPanel.add(sep);

      makeLabel(rightPanel, "Distribution", themeBlueText(), 18);

      const groupRow = new qx.ui.container.Composite(new qx.ui.layout.HBox(5));
      groupRow.setAlignY("middle");
      makeLabel(groupRow, "Group:", themeStdText(), 14);
      const groupSelect = new qx.ui.form.SelectBox();
      groupSelect.setWidth(140);
      groupRow.add(groupSelect);
      rightPanel.add(groupRow);

      const distScroll = new qx.ui.container.Scroll();
      const colBox    = new qx.ui.container.Composite(new qx.ui.layout.HBox(12));
      const chatsCol  = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
      const mcCol     = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
      const crewCol   = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
      makeLabel(chatsCol, "Chats",           themeBlueText(), 13);
      makeLabel(mcCol,    "Mission Control", themeBlueText(), 13);
      makeLabel(crewCol,  "Crew",            themeBlueText(), 13);
      colBox.add(chatsCol);
      colBox.add(mcCol);
      colBox.add(crewCol);
      distScroll.add(colBox);
      rightPanel.add(distScroll, { flex: 1 });

      const earthUsers = allUsers.filter(u => u.planet === "Earth");
      const marsUsers  = allUsers.filter(u => u.planet === "Mars");
      const checkboxes = {}; // username -> CheckBox
      let updatingCheckboxes = false;
      let selectingFromChat = false;
      let distTimer = null;
      let chatItemsByKey = {}; // chatKey -> { label, unread }
      let selectedChatKey = null;

      function distChatKey(users) { return users.slice().sort().join('\t'); }

      function findMatchingGroupName(chatUsers) {
        const others = chatUsers.filter(n => n !== username).sort().join('\t');
        const allNames   = allUsers.map(u => u.name).filter(n => n !== username).sort().join('\t');
        const earthNames = earthUsers.map(u => u.name).filter(n => n !== username).sort().join('\t');
        const marsNames  = marsUsers.map(u => u.name).filter(n => n !== username).sort().join('\t');
        if (others === allNames)   return "All";
        if (others === earthNames) return "Mission Control";
        if (others === marsNames)  return "Crew";
        for (let i = 0; i < allGroups.length; i++) {
          const g = allGroups[i];
          const gNames = allUsers.filter(u => g.roles.includes(u.role)).map(u => u.name).filter(n => n !== username).sort().join('\t');
          if (others === gNames) return g.name;
        }
        return null;
      }

      function getChatName(chat) {
        const gname = findMatchingGroupName(chat.users);
        if (gname) return gname;
        const others = chat.users.filter(n => n !== username);
        if (others.length === 1) {
          const u = allUsers.find(u => u.name === others[0]);
          return u ? u.role : others[0];
        }
        return others.map(n => { const u = allUsers.find(u => u.name === n); return (u && u.abbr) ? u.abbr : n; }).sort().join(',');
      }

      function getChatTooltip(chat) {
        const others = chat.users.filter(n => n !== username);
        return others.map(n => { const u = allUsers.find(u => u.name === n); return u ? u.role : n; }).join(', ');
      }

      function getSelectedUsernames() {
        return allUsers.filter(u => checkboxes[u.name] && checkboxes[u.name].getValue()).map(u => u.name);
      }
      function scheduleDistUpdate() {
        if (distTimer) clearTimeout(distTimer);
        distTimer = setTimeout(function() { that.chatUI.setDistribution(getSelectedUsernames()); }, distributionCooldown * 1000);
      }
      app.getCheckboxSelection  = function() { return getSelectedUsernames(); };
      app.cancelDistCooldown    = function() { if (distTimer) { clearTimeout(distTimer); distTimer = null; } };
      app.getChatDisplayName    = function(users) { return getChatName({ users: users }); };
      function setCheckboxes(names) {
        updatingCheckboxes = true;
        allUsers.forEach(u => { if (checkboxes[u.name]) checkboxes[u.name].setValue(names.includes(u.name)); });
        updatingCheckboxes = false;
      }
      function addUserCheckbox(col, u) {
        const cb = new qx.ui.form.CheckBox(u.role + " (" + u.name + ")");
        cb.setFont(new qx.bom.Font(14, ["Arial"]));
        cb.setValue(true);
        cb.setTextColor(themeStdText());
        cb.addListener("changeValue", function() {
          if (!updatingCheckboxes) { groupSelect.setSelection([customItem]); scheduleDistUpdate(); }
        });
        checkboxes[u.name] = cb;
        col.add(cb);
      }
      earthUsers.forEach(u => addUserCheckbox(mcCol,   u));
      marsUsers.forEach( u => addUserCheckbox(crewCol, u));

      const allItem    = new qx.ui.form.ListItem("All");
      const mcItem     = new qx.ui.form.ListItem("Mission Control");
      const crewItem   = new qx.ui.form.ListItem("Crew");
      const customItem = new qx.ui.form.ListItem("Custom");
      const groupItems = [allItem, mcItem, crewItem];
      groupSelect.add(allItem);
      groupSelect.add(mcItem);
      groupSelect.add(crewItem);
      allGroups.forEach(g => {
        const item = new qx.ui.form.ListItem(g.name);
        item.setUserData("groupDef", g);
        groupSelect.add(item);
        groupItems.push(item);
      });
      groupSelect.add(customItem);
      groupItems.push(customItem);

      function setGroupDropdown(users) {
        const gname = findMatchingGroupName(users);
        const item = gname ? groupItems.find(i => i.getLabel() === gname) : null;
        groupSelect.setSelection([item || customItem]);
      }

      function chatSelectColor() { return theme ? "#b0d0f8" : "#1e3a60"; }

      function onChatClick(chat, lbl) {
        selectingFromChat = true;
        const key = distChatKey(chat.users);
        // Clear previous selection highlight
        if (selectedChatKey && chatItemsByKey[selectedChatKey])
          chatItemsByKey[selectedChatKey].label.setBackgroundColor(null);
        // Set new selection highlight
        lbl.setBackgroundColor(chatSelectColor());
        selectedChatKey = key;
        // Clear unread state
        const entry = chatItemsByKey[key];
        if (entry) { entry.unread = false; lbl.setTextColor(themeStdText()); lbl.setFont(new qx.bom.Font(17, ["Arial"])); }
        setCheckboxes(chat.users);
        setGroupDropdown(chat.users);
        that.chatUI.setDistribution(chat.users);
        selectingFromChat = false;
      }

      groupSelect.addListener("changeSelection", function(e) {
        if (selectingFromChat) return;
        const item = e.getData()[0];
        if (!item || item === customItem) return;
        const label = item.getLabel();
        let names;
        if      (label === "All")             names = allUsers.map(u => u.name);
        else if (label === "Mission Control") names = earthUsers.map(u => u.name);
        else if (label === "Crew")            names = marsUsers.map(u => u.name);
        else { const g = item.getUserData("groupDef"); names = g ? allUsers.filter(u => g.roles.includes(u.role)).map(u => u.name) : []; }
        setCheckboxes(names);
        scheduleDistUpdate();
      });

      app.rebuildChatList = function(chats) {
        const children = chatsCol.getChildren();
        for (let i = children.length - 1; i >= 1; i--) chatsCol.remove(children[i]);
        chatItemsByKey = {};
        selectedChatKey = null;
        if (!username) return;
        const currentDistKey = that.chatUI.distribution ? distChatKey(that.chatUI.distribution) : null;
        chats.filter(c => c.users.includes(username)).forEach(function(chat) {
          const key = distChatKey(chat.users);
          const name = getChatName(chat);
          const lbl = new qx.ui.basic.Label(name);
          lbl.setFont(new qx.bom.Font(17, ["Arial"]));
          lbl.setTextColor(themeStdText());
          lbl.setCursor("pointer");
          const tip = getChatTooltip(chat);
          if (tip) lbl.setToolTipText(tip);
          lbl.addListener("tap", function() { onChatClick(chat, lbl); });
          if (key === currentDistKey) { lbl.setBackgroundColor(chatSelectColor()); selectedChatKey = key; }
          chatsCol.add(lbl);
          chatItemsByKey[key] = { label: lbl, unread: false };
        });
      };

      app.markChatUnread = function(chatUsers) {
        const key = distChatKey(chatUsers);
        const entry = chatItemsByKey[key];
        if (entry && !entry.unread) {
          entry.unread = true;
          entry.label.setTextColor("red");
          entry.label.setFont(new qx.bom.Font(17, ["Arial"]).set({ bold: true }));
        }
      };

      app.syncChatSelection = function() {
        const currentKey = that.chatUI.distribution ? distChatKey(that.chatUI.distribution) : null;
        if (selectedChatKey && chatItemsByKey[selectedChatKey])
          chatItemsByKey[selectedChatKey].label.setBackgroundColor(null);
        selectedChatKey = null;
        if (currentKey && chatItemsByKey[currentKey]) {
          chatItemsByKey[currentKey].label.setBackgroundColor(chatSelectColor());
          selectedChatKey = currentKey;
        }
      };

      // Initialize distribution to "All"
      that.chatUI.distribution = allUsers.map(u => u.name).sort();

      this.templates = await this.recvReportTemplates();

      makeButton(topPanel, "⬇ Attachments...", () => this.downloadAttachments(),           themeButtonColor(), 16, this, null, "Download all report attachments as a zip file");
      makeButton(topPanel, "⬇ Reports...",     () => this.createZipFromReports(reportUIs), themeButtonColor(), 16, this, null, "Download all reports as a zip file");
      makeButton(topPanel, " ", () => this.toggleTheme(), themeButtonColor(), 16, this, null, "Switch between light and dark theme");

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
      this.chatUI.changeSol(sol.chats || []);
      if (app.rebuildChatList) app.rebuildChatList(sol.chats || []);

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

      // Turn bare URLs into clickable links (applied last so markdown runs first)
      message = message.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

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

    async sendIM(im, users)
    {
      const body = { message: im.content, users: users || [] };
      if (im.replyTo) body.replyTo = im.replyTo;
      return await this.doPOST('ims', body);
    },

    async sendIMEdit(id, content, users)
    {
      return await this.doPOST('ims/edit', { id, message: content, users: users || [] });
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

    resetReport(report)
    {
      this.doPOST('reports/reset/' + report.name, {});
    },

    async recvSol(solNum)
    {
      const sol = await this.doGET('sols/' + solNum);
      sol.reports = (planet === "Earth") ? sol.reportsEarth : sol.reportsMars;
      for (let i = 0; i < (sol.chats || []).length; i++)
        for (let j = 0; j < sol.chats[i].ims.length; j++)
          sol.chats[i].ims[j].xmitTime = new Date(sol.chats[i].ims[j].xmitTime);
      for (let i = 0; i < sol.reports.length; i++)
        sol.reports[i].xmitTime = new Date(sol.reports[i].xmitTime);
      return sol;
    },

    async recvReports()         { return  await this.doGET('reports'); },
    async recvCommsDelay()      { return (await this.doGET('comms-delay')).commsDelay; },
    async recvCrewNum()         { return (await this.doGET('crew-num')).crewNum; },
    async recvRotationLength()  { return (await this.doGET('rotation-length')).rotationLength; },
    async recvOrganization()    { return (await this.doGET('organization')).organization; },
    async recvVersion()         { return  await this.doGET('version'); },
    async recvRefDate()         { return  await this.doGET('ref-date'); },
    async recvReportTemplates() { return  await this.doGET('reports/templates'); },
    async recvAttachments()          { return  await this.doGET('attachments/' + planet + '/' + getSolNum()); },
    async recvUsers()                { return  await this.doGET('users'); },
    async recvDistributionCooldown()        { return  await this.doGET('distribution-cooldown'); },
    async recvMessageArrivalSoundCooldown() { return  await this.doGET('message-arrival-sound-cooldown'); },
    async recvTestMode()                    { return  await this.doGET('test-mode'); },
    async recvFiles()                       { return  await this.doGET('files'); },
    async recvFileFolders()                 { return  await this.doGET('files/folders'); },
    

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

        const btnColor = planet === "Mars" ? (theme ? "#ffaaaa" : "#dd9999") : (theme ? "#aaaaff" : "#9999dd");
        setBGColor(this.loginButton, btnColor);

        // set up server-sent events
        // eventSource is tied to login because the planet can change
        this.setupSSE();
        this.applyReportAccess();
        this.loadFiles();
      } 
      else if (result && result.message)
        alert(result.message);
      else 
        alert("Login failure for " + usernameIn);
    },

    applyReportAccess()
    {
      if (!this.reportUIs) return;
      for (const rui of this.reportUIs)
        rui.container.setVisibility(this.canAccessReport(rui.meta) ? "visible" : "excluded");
    },

    canAccessReport(meta)
    {
      if (!meta || !meta.access || !meta.access.length) return true;
      const user = allUsers.find(u => u.name === username);
      if (!user) return false;
      for (const entry of meta.access) {
        if (entry === "All") return true;
        if (entry === user.role) return true;
        if (entry === "Mission Control" && user.planet === "Earth") return true;
        if (entry === "Crew" && user.planet === "Mars") return true;
        const group = allGroups.find(g => g.name === entry);
        if (group && group.roles.includes(user.role)) return true;
      }
      return false;
    },

    canAccessFolder(folder)
    {
      if (!folder || !folder.access || !folder.access.length) return true;
      const user = allUsers.find(u => u.name === username);
      if (!user) return false;
      for (const entry of folder.access) {
        if (entry === "All") return true;
        if (entry === user.role) return true;
        if (entry === "Mission Control" && user.planet === "Earth") return true;
        if (entry === "Crew" && user.planet === "Mars") return true;
        const group = allGroups.find(g => g.name === entry);
        if (group && group.roles.includes(user.role)) return true;
      }
      return false;
    },

    async loadFiles()
    {
      allFiles = (await this.recvFiles()) || [];
      // Restore date objects after JSON deserialization
      allFiles.forEach(f => {
        f.xmitTime = new Date(f.xmitTime);
        if (f.prevOp) f.prevOp.xmitTime = new Date(f.prevOp.xmitTime);
      });
      this.updateFilesDisplay();
    },

    updateFilesDisplay()
    {
      const count = allFiles.filter(f => {
        if (f.deleted) {
          // Still visible if prevOp "delete" from other planet is still in transit
          if (!f.prevOp || f.prevOp.op !== 'delete' || f.prevOp.planet === planet || commsDelayPassed(f.prevOp.xmitTime)) return false;
        }
        const folder = fileFolders.find(fd => fd.path === f.folder);
        return this.canAccessFolder(folder);
      }).length;
      if (this.filesCountLabel) this.filesCountLabel.setValue("Files (" + count + ")");
      if (this.fileManager && !this.fileManager.isDisposed() && this.fileManager.getVisibility() === "visible")
        this.fileManager.updateFiles(allFiles);
    },

    openFileManager()
    {
      if (!this.isLoggedIn) { alert("Please log in first."); return; }
      const accessible = fileFolders.filter(fd => this.canAccessFolder(fd));
      if (this.fileManager && !this.fileManager.isDisposed()) this.fileManager.destroy();
      this.fileManager = makeFileManagerWindow(this, accessible, allFiles.slice());
      this.fileManager.center();
      this.fileManager.open();
    },

    applyFileUpdate(event)
    {
      const f = event.file;
      const idx = allFiles.findIndex(x => x.id === f.id);
      if (idx >= 0) allFiles[idx] = f;
      else allFiles.push(f);
      this.updateFilesDisplay();
      // Schedule a deferred refresh when the transit delay expires
      let delayedTime = null;
      if (event.op === 'add' && f.planet !== planet) delayedTime = f.xmitTime;
      else if (f.prevOp && f.prevOp.planet !== planet) delayedTime = f.prevOp.xmitTime;
      if (delayedTime && commsDelay > 0)
      {
        const remaining = commsDelay - (Date.now() - delayedTime.getTime()) / 1000;
        if (remaining > 0) setTimeout(() => this.updateFilesDisplay(), remaining * 1000);
      }
    },

    logout()
    {
      if (this.reportUIs) this.reportUIs.forEach(rui => rui.container.setVisibility("visible"));
      allFiles = [];
      this.updateFilesDisplay();
      this.eventSource.close();
      this.eventSource = null;
      this.isLoggedIn = false;
      username = null;
      planet = null;
      this.loginButton.setLabel("Login");
      setBGColor(this.loginButton, "#ffcccc");
      this.openLoginDialog();
    },

    setupSSE()
    {
      const that = this;
      if (this.eventSource) this.eventSource.close();
      this.eventSource = new EventSource(urlPrefix + 'events/' + planet);
      this.eventSource.onmessage = function(event)
      {
        log("SSE received!!!!");
        log(event.data);
        const obj = JSON.parse(event.data);
        if (obj.type === "FileUpdate")
        {
          obj.file.xmitTime = new Date(obj.file.xmitTime);
          if (obj.file.prevOp) obj.file.prevOp.xmitTime = new Date(obj.file.prevOp.xmitTime);
          app.applyFileUpdate(obj);
        }
        else if (app.isCurrentSol()) // ignore sol-specific messages if not on current Sol
        {
          if (obj.type === "IM")
          {
            obj.xmitTime = new Date(obj.xmitTime); // ALWAYS have to fix the date.  ALWAYS
            if (obj.chatUsers && obj.chatUsers.includes(username))
              app.chatUI.addIMFromSSE(obj);
          }
          else if (obj.type === "Report")
          {
            obj.xmitTime = new Date(obj.xmitTime); // ALWAYS have to fix the date.  ALWAYS
            app.getReportUIbyName(obj.name).update(obj);
            if (obj.transmitted && obj.authorPlanet !== planet) playReportArrivedSound();
          }
          else if (obj.type === "IMEdit")
          {
            const xmitTime = new Date(obj.xmitTime);
            const apply = () => app.chatUI.applyIMEdit(obj);
            if (obj.planet !== planet && commsDelay > 0)
            {
              const remaining = commsDelay - (Date.now() - xmitTime.getTime()) / 1000;
              if (remaining > 0) { setTimeout(apply, remaining * 1000); return; }
            }
            apply();
          }
        }
      };
      this.eventSource.onerror = function(e)
      {
        log("SSE connection lost, reconnecting in 5s...");
        that.eventSource.close();
        setTimeout(() => { if (that.isLoggedIn) that.setupSSE(); }, 5000);
      };
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
  construct: function(parentContainer, app, organization)
  {
    const that = this;

    let chatContainer = new qx.ui.container.Composite(new qx.ui.layout.VBox());
    chatContainer.setDecorator("main");
    chatContainer.setWidth(400);
    parentContainer.add(chatContainer, { flex: 3 });

    let chatTitle = new qx.ui.basic.Label("");
    chatTitle.setFont(new qx.bom.Font(18, ["Arial"]));
    chatTitle.setTextColor(themeBlueText());
    chatTitle.setPaddingLeft(5);
    this.chatTitle = chatTitle;
    chatContainer.add(chatTitle);

    let chatPanel = new qx.ui.container.Composite(new qx.ui.layout.VBox());
    chatPanel.setPadding(10);
    this.chatPanel = chatPanel;
    // decorator moved to chatScroll so the border stays fixed and does not scroll

    // Set background image based on organization via CSS pseudo-element (see index.html)
    chatPanel.getContentElement().addClass(organization === "LunAres" ? "bg-lunares" : "bg-mdrs");

    let chatScroll = new qx.ui.container.Scroll();
    chatScroll.add(chatPanel);
    chatScroll.setDecorator("main");
    chatContainer.add(chatScroll, { flex: 1 });
    this.chatScroll = chatScroll;

    // Level 2B: emoji quick-insert bar above the input row
    const QUICK_EMOJIS = ['👍', '😊', '😉', '😞'];
    let emojiInsertBar = new qx.ui.container.Composite(new qx.ui.layout.HBox(6));
    emojiInsertBar.setPaddingLeft(10);
    emojiInsertBar.setPaddingBottom(2);
    chatContainer.add(emojiInsertBar);

    // Reply strip (hidden until user clicks ↩ on a message)
    let replyStrip = new qx.ui.container.Composite(new qx.ui.layout.HBox(6));
    replyStrip.setPaddingLeft(10);
    replyStrip.setPaddingBottom(2);
    replyStrip.setVisibility("excluded");
    this.replyStrip = replyStrip;
    const replyStripLabel = new qx.ui.basic.Label("");
    replyStripLabel.setTextColor("#888888");
    replyStripLabel.setFont(new qx.bom.Font(12, ["Arial"]));
    this.replyStripLabel = replyStripLabel;
    replyStrip.add(replyStripLabel);
    const replyStripCancel = new qx.ui.basic.Label("✕");
    replyStripCancel.set({ cursor: "pointer", selectable: false });
    replyStripCancel.setTextColor("#888888");
    replyStripCancel.setFont(new qx.bom.Font(12, ["Arial"]));
    replyStripCancel.addListener("click", () => that.clearReplyMode());
    replyStrip.add(replyStripCancel);
    chatContainer.add(replyStrip);

    // Joke mode toggle row — only shown when testMode is enabled in server config
    if (testMode) {
      this.jokeBtn = makeButton(chatContainer, "Joke Mode: OFF", () => that.toggleJokeMode(), themeDisabledButtonColor(), 12, null, null, "Toggle AI-assisted humorous replies (test mode only)");
    }

    let chatInputContainer = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
    chatInputContainer.setPadding(10);
    chatInputContainer.setPaddingTop(2);
    chatContainer.add(chatInputContainer);

    let chatInput = new qx.ui.form.TextField();
    this.chatInput = chatInput;
    chatInput.setBackgroundColor(themeBgColor());
    chatInput.setTextColor(themeStdText());
    chatInput.setPlaceholder("Type a message...");
    chatInput.addListener("keypress", function(e)
    {
      if (e.getKeyIdentifier() === "Enter") { that.doMessage(that); }
      else if (e.getKeyIdentifier() === "Up" && !chatInput.getValue() && that.lastSentMessage)
      {
        chatInput.setValue(that.lastSentMessage);
        if (that.lastSentIMId) { that.isEditMode = true; that.sendBtn.setLabel("Update"); }
      }
    });
    chatInputContainer.add(chatInput, { flex: 1 });

    this.sendBtn = makeButton(chatInputContainer, "Send", () => this.doMessage(this), themeButtonColor(), 14, this);

    // Populate Level 2B emoji bar after chatInput exists
    for (const emoji of QUICK_EMOJIS)
    {
      const lbl = new qx.ui.basic.Label(emoji);
      lbl.set({ cursor: "pointer", selectable: false });
      lbl.setFont(new qx.bom.Font(18, ["Arial"]));
      lbl.addListener("click", () => { chatInput.setValue((chatInput.getValue() || '') + emoji); chatInput.focus(); });
      emojiInsertBar.add(lbl);
    }
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
    chatTitle: null,
    chats: null,
    distribution: null,
    lastSentMessage: null,
    replyMode: null,       // null or { id, user, snippet } when replying to a message
    imContainers: null,    // map from im.id to Qooxdoo container widget, for scroll-to-anchor
    reactionRows: null,    // map from im.id to Label widget showing accumulated emoji reactions
    imLabels: null,        // map from im.id to { label, user, time } for in-place edit rendering
    lastSentIMId: null,    // server-assigned id of the last IM the current user sent in this chat
    isEditMode: false,     // true when up-arrow recalled the last message for editing
    jokeMode: false,
    jokeTimerId: null,
    jokeBtn: null,
    activeTimers: null,

    reset()
    {
      if (this.activeTimers) this.activeTimers.forEach(t => { try { t.stop(); } catch(e) {} });
      this.activeTimers = [];
      try { this.chatPanel.removeAll(); } catch (e) { log("clean et up"); }
      this.ims = [];
      this.imContainers = {};
      this.reactionRows = {};
      this.imLabels = {};
      this.lastSentIMId = null;
      this.isEditMode = false;
      if (this.sendBtn) this.sendBtn.setLabel("Send");
    },

    updateChatTitle()
    {
      if (!this.chatTitle) return;
      const name = (app.getChatDisplayName && this.distribution) ? app.getChatDisplayName(this.distribution) : "";
      this.chatTitle.setValue(name || "");
    },

    findChat(users)
    {
      if (!users || !this.chats) return null;
      const key = users.slice().sort().join('\t');
      for (let i = 0; i < this.chats.length; i++)
        if (this.chats[i].users.slice().sort().join('\t') === key) return this.chats[i];
      return null;
    },

    changeSol(chats)
    {
      log("changing Sol to " + app.getUiSolNum() + "; " + chats.length + " chats");
      log("currentSolNum is " + getSolNum());
      this.chats = chats;
      this.reset();
      const isCurrentSol = getSolNum() === app.getUiSolNum();
      this.chatInput.setEnabled(isCurrentSol);
      const chat = this.findChat(this.distribution);
      this.ims = chat ? chat.ims : [];
      for (let i = 0; i < this.ims.length; i++)
        this.addIM(this.ims[i], chat ? chat.users : null);
      this.updateChatTitle();
      this.scrollToBottom();
    },

    setDistribution(users)
    {
      this.distribution = users.slice().sort();
      this.reset();
      const isCurrentSol = getSolNum() === app.getUiSolNum();
      this.chatInput.setEnabled(isCurrentSol);
      const chat = this.findChat(this.distribution);
      this.ims = chat ? chat.ims : [];
      for (let i = 0; i < this.ims.length; i++)
        this.addIM(this.ims[i], chat ? chat.users : null);
      this.updateChatTitle();
      this.scrollToBottom();
    },

    addIMFromSSE(obj)
    {
      // find or create the chat in the local model
      let chat = this.findChat(obj.chatUsers);
      const isNewChat = !chat;
      if (!chat)
      {
        chat = { users: obj.chatUsers.slice().sort(), ims: [] };
        if (this.chats) this.chats.push(chat);
      }
      // Avoid model duplication: doMessage() pushes a local placeholder (no id) before the
      // server echo arrives via SSE. Merge the server fields into that placeholder instead of
      // pushing a second copy. Match on the first id-less entry from the same user (FIFO).
      if (obj.id && obj.user === username)
      {
        const placeholder = chat.ims.find(m => !m.id && m.user === username);
        if (placeholder) Object.assign(placeholder, obj);
        else chat.ims.push(obj);
      }
      else chat.ims.push(obj);
      // display or mark unread based on whether this matches current distribution
      const distKey = this.distribution ? this.distribution.slice().sort().join('\t') : '';
      const chatKey = obj.chatUsers.slice().sort().join('\t');
      if (distKey === chatKey)
      {
        this.ims = chat.ims;
        this.addIM(obj, obj.chatUsers);
        if (isNewChat && app.rebuildChatList) app.rebuildChatList(this.chats);
      }
      else
      {
        const doUnread = () => {
          if (obj.user !== username) playIMArrivedSound();
          if (isNewChat && app.rebuildChatList) app.rebuildChatList(this.chats);
          if (app.markChatUnread) app.markChatUnread(obj.chatUsers);
        };
        const timeRemaining = commsDelay - timeInTransit(obj);
        if (inTransit(obj) && obj.planet !== planet) setTimeout(doUnread, timeRemaining * 1000);
        else doUnread();
      }
    },

    addIM(im, chatUsers)
    {
      log("addIM: " + im.content + " from planet " + im.planet + " (we are on " + planet + ")");
      if (!im.content) return;
      if (im.id && this.imContainers && this.imContainers[im.id]) return; // already rendered

      // Cross-planet: any recipient is on a different planet than the sender
      const crossPlanet = !chatUsers || chatUsers.some(n => { const u = allUsers.find(u => u.name === n); return u && u.planet !== im.planet; });

      log("  commsDelay=" + commsDelay + ", tit=" + timeInTransit(im));
      const timeRemaining = commsDelay - timeInTransit(im);
      if (im.planet === planet || !inTransit(im))
      {
        if (im.user !== username) playIMArrivedSound();

        // Emoji reactions: annotate the target message rather than adding a timeline entry
        if (im.replyTo && im.replyTo.isReaction)
        {
          const targetOuter = this.imContainers && this.imContainers[im.replyTo.id];
          if (targetOuter)
          {
            if (!this.reactionRows[im.replyTo.id])
            {
              const rl = new qx.ui.basic.Label('');
              rl.setTextColor('#aaaaaa');
              rl.setFont(new qx.bom.Font(12, ['Arial']));
              rl.setPaddingLeft(4);
              targetOuter.add(rl);
              this.reactionRows[im.replyTo.id] = rl;
            }
            const rl = this.reactionRows[im.replyTo.id];
            const cur = rl.getValue() || '';
            rl.setValue(cur + (cur ? '  ' : '') + im.content + '\u2009' + im.user);
            return;
          }
          // target not in view — fall through to normal rendering
        }

        // Outer VBox holds optional reply header + inner row
        const outer = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
        outer.setPaddingBottom(4);

        // Reply header: shown for typed replies (not for emoji reactions)
        if (im.replyTo && !im.replyTo.isReaction)
        {
          const snippet = im.replyTo.snippet || '';
          const headerLabel = new qx.ui.basic.Label('↩ ' + im.replyTo.user + ': ' + snippet);
          headerLabel.set({ rich: false, selectable: false, cursor: "pointer" });
          headerLabel.setTextColor("#888888");
          headerLabel.setFont(new qx.bom.Font(11, ["Arial"]));
          headerLabel.addListener("click", () => this.scrollToIM(im.replyTo.id));
          outer.add(headerLabel);
        }

        // Inner row: message label + emoji/reply bar
        const inner = new qx.ui.container.Composite(new qx.ui.layout.HBox(6));

        const displayTime = new Date();
        const str = '<b>' + im.user + '</b> <font size="-2">' + displayTime.toString() + ':</font><br>' + im.content + '<br> <br>';
        const label = new qx.ui.basic.Label().set({ value: str, rich: true, selectable: true });
        const color = theme ? ((im.user === username) ? "#0000bb" : "black") : (im.user === username) ? "#9999ff" : "white";
        label.setTextColor(color);
        label.setFont(new qx.bom.Font(19, ["Arial"]));
        inner.add(label, { flex: 1 });
        if (im.id)
        {
          this.imLabels[im.id] = { label, user: im.user, time: displayTime };
          if (im.user === username) this.lastSentIMId = im.id;
        }

        // Per-message emoji bar + reply button (Level 2A)
        const actionBar = new qx.ui.container.Composite(new qx.ui.layout.HBox(3));
        actionBar.setPaddingTop(4);
        for (const emoji of ['👍', '😊', '😉', '😞'])
        {
          const btn = new qx.ui.basic.Label(emoji);
          btn.set({ cursor: "pointer", selectable: false });
          btn.setFont(new qx.bom.Font(14, ["Arial"]));
          btn.addListener("click", () => this.doQuickEmoji(emoji, im, this));
          actionBar.add(btn);
        }
        const replyBtn = new qx.ui.basic.Label(' ↩');
        replyBtn.set({ cursor: "pointer", selectable: false });
        replyBtn.setTextColor("#888888");
        replyBtn.setFont(new qx.bom.Font(13, ["Arial"]));
        replyBtn.addListener("click", () => this.enterReplyMode(im));
        actionBar.add(replyBtn);
        inner.add(actionBar);

        outer.add(inner);

        log("time since sent is " + timeSinceSent(im.xmitTime));
        if (inTransit(im) && crossPlanet) {
          const startProgress = commsDelay > 0 ? Math.min((commsDelay - timeRemaining) / commsDelay, 0.99) : 0;
          const pw = startXmitProgressDisplay(timeRemaining, inner, 40, null, startProgress);
          if (pw && pw.timer && this.activeTimers) this.activeTimers.push(pw.timer);
        }

        this.chatPanel.add(outer);
        if (im.id) this.imContainers[im.id] = outer;
        this.scrollToBottom();
      }
      else // IM is NOT from this planet and has not yet arrived, so wait for it
      {
        log("scheduling IM arrival in " + timeRemaining);
        setTimeout(() => this.addIM(im, chatUsers), timeRemaining*1000);
      }
    },

    async doMessage(that)
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

      // Use the current checkbox state as the target distribution
      let targetUsers = app.getCheckboxSelection ? app.getCheckboxSelection() : that.distribution;
      if (!targetUsers.includes(username)) targetUsers = targetUsers.concat([username]);

      // Edit mode: update an existing IM in-place rather than sending a new one
      if (that.isEditMode && that.lastSentIMId)
      {
        const editId = that.lastSentIMId;
        that.isEditMode = false;
        that.sendBtn.setLabel("Send");
        that.lastSentMessage = message;
        that.chatInput.setValue("");
        that.clearReplyMode();
        const result = await app.sendIMEdit(editId, that.parseMessage(message), targetUsers);
        if (!result) { that.chatInput.setValue(message); alert("Edit failed. Please try again."); }
        return;
      }

      if (app.cancelDistCooldown) app.cancelDistCooldown();
      that.setDistribution(targetUsers);
      if (app.syncChatSelection) app.syncChatSelection();

      const replyTo = that.replyMode;
      that.lastSentMessage = message;
      that.chatInput.setValue("");
      that.clearReplyMode();
      let formattedMessage = that.parseMessage(message);
      const im = newIM(formattedMessage);
      if (replyTo) im.replyTo = replyTo;

      log(im);
      //that.addIM(im);    // don't need to add locally as we'll add it on the SSE
      that.ims.push(im);   // add IM to local model
      const result = await app.sendIM(im, targetUsers);
      if (!result)
      {
        that.ims.pop(); // remove from local model since server didn't receive it
        that.chatInput.setValue(message); // restore message so user can retry
        alert("Message failed to send. Please try again.");
      }
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

      // Turn bare URLs into clickable links (applied last so markdown runs first)
      message = message.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

      return message;
    },

    // Enter reply mode targeting the given IM; shows the reply strip above the input.
    enterReplyMode(im)
    {
      const snippet = im.content.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').slice(0, 60);
      this.replyMode = { id: im.id, user: im.user, snippet };
      this.replyStripLabel.setValue('↩ ' + im.user + ': ' + snippet + (snippet.length >= 60 ? '…' : ''));
      this.replyStrip.setVisibility("visible");
      this.chatInput.focus();
    },

    clearReplyMode()
    {
      this.replyMode = null;
      this.replyStrip.setVisibility("excluded");
    },


    toggleJokeMode()
    {
      this.jokeMode = !this.jokeMode;
      if (this.jokeBtn) {
        this.jokeBtn.setLabel(this.jokeMode ? 'Joke Mode: ON' : 'Joke Mode: OFF');
        setBGColor(this.jokeBtn, this.jokeMode ? themeButtonColor() : themeDisabledButtonColor());
      }
      this.chatInput.setEnabled(!this.jokeMode);
      if (this.jokeMode) this.scheduleNextJoke();
      else { clearTimeout(this.jokeTimerId); this.jokeTimerId = null; }
    },

    scheduleNextJoke()
    {
      const delay = (commsDelay / 3 + Math.random() * commsDelay) * 1000;
      this.jokeTimerId = setTimeout(() => this.sendJoke(), Math.max(delay, 2000));
    },

    sendJoke()
    {
      if (!this.jokeMode || !jokes.length) return;
      const joke = jokes[Math.floor(Math.random() * jokes.length)];
      this.chatInput.setValue(joke);
      this.doMessage(this);
      this.scheduleNextJoke();
    },

    scrollToBottom()
    {
      // Double-rAF ensures Qooxdoo's async layout queue has flushed before we read scrollMaxY
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { this.chatScroll.scrollToY(this.chatScroll.getScrollMaxY()); } catch(e) {}
      }));
    },

    // Send a single emoji as a reaction to targetIM (Level 2A quick-response).
    // Renders as an annotation on the target message rather than a new timeline entry.
    doQuickEmoji(emoji, targetIM, that)
    {
      const snippet = targetIM.content.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').slice(0, 60);
      that.replyMode = { id: targetIM.id, user: targetIM.user, snippet, isReaction: true };
      that.chatInput.setValue(emoji);
      that.doMessage(that);
    },

    // Apply an in-place edit received via SSE.
    applyIMEdit(obj)
    {
      // Update local model
      if (this.chats)
        for (const chat of this.chats)
        {
          const im = chat.ims.find(m => m.id === obj.id);
          if (im) { im.content = obj.content; im.edited = true; break; }
        }
      // Update rendered label if the message is currently displayed
      const entry = this.imLabels && this.imLabels[obj.id];
      if (entry)
      {
        const str = '<b>' + entry.user + '</b> <font size="-2">' + entry.time.toString() + ' (edited):</font><br>' + obj.content + '<br> <br>';
        entry.label.setValue(str);
      }
    },

    // Scroll to and briefly highlight the message with the given id.
    scrollToIM(id)
    {
      if (!id || !this.imContainers) return;
      const container = this.imContainers[id];
      if (!container) return;
      const domEl = container.getContentElement().getDomElement();
      if (!domEl) return;
      domEl.scrollIntoView({ behavior: "smooth", block: "center" });
      domEl.style.transition = "background-color 0.3s";
      domEl.style.backgroundColor = "#ccaa00";
      setTimeout(() => { domEl.style.backgroundColor = ""; }, 1200);
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
      if (!that.isCurrentSol()) return; // file dialog can open even when button is visually disabled
      let files = e.getData();
      log("there are actually " + files.length + " attachments");
      app.sendAttachments(that.report, files);
    }, this);
    container.add(fsb);
    //fsb.setEnabled(false); // disabling the FileSelectorButton somehow prevents it working properly even after it's re-enabled
    this.fsButton = fsb;

    this.amanButton = makeButton(container, "00", () => that.openAttachManager(), themeButtonColor(), 14, this, null, "Manage report attachments");
    const cimage = "myapp/copyIcon.png";
    const pimage = "myapp/pasteIcon.png";
    this.copyButton = makeButton(container, null, () => navigator.clipboard.writeText(that.report.content), themeButtonColor(), 14, this, cimage, "Copy report content to clipboard");
    this.pasteButton = makeButton(container, null, () => that.setContentFromBored(), "gray", 14, this, pimage, "Paste from MDRS/LunAres field report template");

    this.editButton = makeButton(container, "Edit", () => that.openReportEditor(), "gray", 14, this, null, "Open report editor");

    this.approveButton = new qx.ui.form.CheckBox("Approve");
    this.approveButton.addListener("execute", () => { this.report.approved = this.approveButton.getValue() ? true : false; this.onChange(); })
    container.add(this.approveButton);

    this.resetButton = makeButton(container, "Reset", () => that.onReset(), themeDisabledButtonColor(), 14, this, null, "Reset report to default template");

    function onXmit()
    { 
      that.report.transmitted = true;
      that.report.xmitTime = new Date();
      app.transmitReport(that.report); // tell server to send report to other planet
      //that.realizeState("Transmitted"); // SSE will cause UI to be updated
    }
    this.txButton = makeButton(container, "Transmit", onXmit, "gray", 14, this, null, "Transmit this report to the other planet");
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
    resetButton: null,
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
      const aprvBgColor = aprvEnabled ? themeButtonColor() : themeDisabledButtonColor();
      const editBgColor = editEnabled ? themeButtonColor() : themeDisabledButtonColor();
      const txEnabled = isCurrentSol && editEnabled && this.state !== "Empty";
      const txBgColor = txEnabled ? themeButtonColor() : themeDisabledButtonColor();
      const resetEnabled = isCurrentSol && this.state !== "Unused";
      const resetBgColor = resetEnabled ? themeButtonColor() : themeDisabledButtonColor();
      if (this.fsButton)      {      this.fsButton.setEnabled(editEnabled);  setBGColor(this.fsButton,      editBgColor);  }
      if (this.editButton)    {    this.editButton.setEnabled(viewEnabled);  setBGColor(this.editButton,    editBgColor);  }
      if (this.approveButton) { this.approveButton.setEnabled(aprvEnabled); setBGColor(this.approveButton, aprvBgColor);  }
      if (this.resetButton)   {   this.resetButton.setEnabled(resetEnabled); setBGColor(this.resetButton,  resetBgColor); }
      if (this.txButton)      {      this.txButton.setEnabled(txEnabled);    setBGColor(this.txButton,      txBgColor);    }

      if (planet === "Earth") { this.approveButton.setVisibility("visible"); this.resetButton.setVisibility("visible"); }
      else                    { this.approveButton.setVisibility("excluded"); this.resetButton.setVisibility("excluded"); }

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

    onReset()
    {
      if (!confirm("Reset \"" + this.name + "\"?\nThis will clear all content and attachments on both planets.")) return;
      app.resetReport(this.report);
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

function startXmitProgressDisplay(commsDelay, parentContainer, size, onDone, startProgress)
{
  startProgress = startProgress || 0;
  log("starting Xmit display for " + commsDelay + " (startProgress=" + startProgress + ")");
  let circularProgress = new myapp.CircularProgress();
  circularProgress.setWidth(size);
  circularProgress.setHeight(size);
  circularProgress.setMaxHeight(size);
  parentContainer.add(circularProgress);

  const totalUpdates = 100;
  let progress = startProgress;
  if (startProgress > 0) circularProgress.progress = startProgress; // set before appear so draw() uses correct initial fill
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
  circularProgress.timer = timer;

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
        const href = 'attachments/download?file=' + encodeURIComponent(attachment.content) + '&name=' + encodeURIComponent(attachment.filename);
        doDownload(href, attachment.filename);
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


//////////////////////////////////////////////////////////////////////////////////////////////////
// File Manager window — factory function (not a qx class, to share module-level helpers)

function makeFileManagerWindow(app, folders, files)
{
  const win = new qx.ui.window.Window("File Manager");
  win.setLayout(new qx.ui.layout.VBox(5));
  win.setWidth(720);
  win.setHeight(500);
  win.setModal(true);
  win.setShowMinimize(false);
  win.setPadding(8);

  let currentFolder = null;
  let currentFiles  = files;

  // Main area: tree | file list
  const mainRow = new qx.ui.container.Composite(new qx.ui.layout.HBox(8));
  win.add(mainRow, { flex: 1 });

  // Left: folder tree
  const tree = new qx.ui.tree.Tree();
  tree.setWidth(180);
  tree.setAllowGrowX(false);
  tree.setAllowGrowY(true);
  const root = new qx.ui.tree.TreeFolder("Folders");
  root.setOpen(true);
  tree.setRoot(root);
  const treeItems = [];
  const nodeMap = {};
  function getOrCreateNode(parent, label, pathKey) {
    if (!nodeMap[pathKey]) {
      const n = new qx.ui.tree.TreeFolder(label);
      n.setOpen(true);
      nodeMap[pathKey] = n;
      parent.add(n);
    }
    return nodeMap[pathKey];
  }
  folders.forEach(function(f) {
    const parts = f.path.split("/");
    let parentNode = root;
    let cur = "";
    parts.forEach(function(part, i) {
      cur = cur ? cur + "/" + part : part;
      const node = getOrCreateNode(parentNode, part, cur);
      if (i === parts.length - 1) {
        node.setUserData("folderPath", f.path);
        treeItems.push(node);
      }
      parentNode = node;
    });
  });
  mainRow.add(tree);

  // Vertical divider
  const vsep = new qx.ui.core.Widget();
  vsep.setWidth(1);
  vsep.setBackgroundColor(themeInactiveColor());
  mainRow.add(vsep);

  // Right: scrollable file list
  const filePanel = new qx.ui.container.Composite(new qx.ui.layout.VBox(2));
  filePanel.setPadding(4);
  const fileScroll = new qx.ui.container.Scroll();
  fileScroll.add(filePanel);
  mainRow.add(fileScroll, { flex: 1 });

  // Bottom bar
  const bbar = new qx.ui.container.Composite(new qx.ui.layout.HBox(10));
  const fsb = new qx.ui.form.FileSelectorButton("Upload to folder...");
  fsb.setMultiple(true);
  fsb.addListener("changeFileSelection", onUpload);
  bbar.add(fsb);
  bbar.add(new qx.ui.core.Spacer(), { flex: 1 });
  makeButton(bbar, "Close", win.close, themeButtonColor(), 14, win);
  win.add(bbar);

  // ---- helpers ----

  function fmtSize(bytes)
  {
    if (!bytes) return "0 B";
    if (bytes < 1024)    return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function effectiveFile(file)
  {
    if (!file.prevOp) return file;
    const po = file.prevOp;
    if (po.planet === planet || commsDelayPassed(new Date(po.xmitTime))) return file;
    const eff = Object.assign({}, file);
    if      (po.op === "rename") eff.name   = po.prevName;
    else if (po.op === "move")   eff.folder = po.prevFolder;
    else if (po.op === "delete") eff.deleted = false;
    return eff;
  }

  function statusBadge(file)
  {
    if (file.planet !== planet && !commsDelayPassed(new Date(file.xmitTime)))
      return "\u23f3 In transit";
    if (file.planet !== planet) return "\u2713 Received";
    return "";
  }

  function showFolder(folderPath)
  {
    currentFolder = folderPath;
    filePanel.removeAll();

    const folderFiles = currentFiles
      .map(effectiveFile)
      .filter(function(f) { return !f.deleted && f.folder === folderPath; });

    if (folderFiles.length === 0)
    {
      const empty = new qx.ui.basic.Label("(no files in this folder)");
      empty.setTextColor(themeInactiveColor());
      filePanel.add(empty);
      return;
    }
    folderFiles.forEach(addFileRow);
  }

  function addFileRow(file)
  {
    const row = new qx.ui.container.Composite(new qx.ui.layout.HBox(6));
    row.setPadding([2, 4]);

    const nameLabel = new qx.ui.basic.Label(file.name);
    nameLabel.setToolTipText(file.name);
    row.add(nameLabel, { flex: 3 });

    const uploader = allUsers.find(function(u) { return u.name === file.uploadedBy; });
    row.add(new qx.ui.basic.Label(uploader ? uploader.role : file.uploadedBy), { flex: 2 });
    row.add(new qx.ui.basic.Label(fmtSize(file.size)), { flex: 1 });

    const badge = statusBadge(file);
    const badgeLabel = new qx.ui.basic.Label(badge);
    if (badge) badgeLabel.setTextColor(badge.indexOf("transit") >= 0 ? "#ff8800" : "#44aa44");
    row.add(badgeLabel, { flex: 2 });

    const btns = new qx.ui.container.Composite(new qx.ui.layout.HBox(3));
    makeButton(btns, "\u2b07", function() { doDownload("files/download?id=" + file.id, file.name); }, themeButtonColor(), 11, null, null, "Download");
    makeButton(btns, "\u270e", function() { onRename(file); }, themeButtonColor(), 11, null, null, "Rename");
    makeButton(btns, "\u21d2", function() { onMove(file);   }, themeButtonColor(), 11, null, null, "Move to another folder");
    makeButton(btns, "\u2715", function() { onDelete(file); }, themeButtonColor(), 11, null, null, "Delete");
    row.add(btns);

    filePanel.add(row);
  }

  function onRename(file)
  {
    const newName = window.prompt("New filename:", file.name);
    if (!newName || newName === file.name) return;
    app.doPOST("files/rename", { id: file.id, name: newName })
      .then(function(r) { if (r) { file.name = newName; showFolder(currentFolder); } });
  }

  function onMove(file)
  {
    const dlg = new qx.ui.window.Window("Move to folder");
    dlg.setLayout(new qx.ui.layout.VBox(10));
    dlg.setWidth(260);
    dlg.setModal(true);
    dlg.setShowMinimize(false);
    dlg.setPadding(10);

    const sel = new qx.ui.form.SelectBox();
    const selItems = [];
    folders.forEach(function(f) {
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
      if (newFolder && newFolder !== file.folder)
        app.doPOST("files/move", { id: file.id, folder: newFolder })
          .then(function(r) { if (r) { file.folder = newFolder; showFolder(currentFolder); } });
      dlg.close();
    }, themeButtonColor(), 14);
    makeButton(btnRow, "Cancel", dlg.close, themeButtonColor(), 14, dlg);
    dlg.add(btnRow);
    dlg.open();
    dlg.center();
  }

  function onDelete(file)
  {
    if (!window.confirm("Delete '" + file.name + "'?")) return;
    app.doPOST("files/delete", { id: file.id })
      .then(function(r) { if (r) { file.deleted = true; showFolder(currentFolder); } });
  }

  function onUpload(e)
  {
    if (!currentFolder) { alert("Select a folder first."); return; }
    const uploadFiles = e.getData();
    if (!uploadFiles || !uploadFiles.length) return;

    const formData = new FormData();
    for (let i = 0; i < uploadFiles.length; i++)
      formData.append("files", uploadFiles[i]);
    formData.append("folder", currentFolder);
    formData.append("username", username);
    formData.append("token", app.token);

    const req = new qx.io.request.Xhr(urlPrefix + "files/upload");
    req.setMethod("POST");
    req.setRequestData(formData);
    req.addListener("success", function() { log("File upload success"); });
    req.addListener("fail",    function() { alert("File upload failed"); });
    req.send();
  }

  // Tree selection handler
  tree.addListener("changeSelection", function(e) {
    const sel = e.getData();
    if (sel && sel.length > 0) {
      const fp = sel[0].getUserData("folderPath");
      if (fp) showFolder(fp);
    }
  });

  // Expose public update method on the window object
  win.updateFiles = function(f) {
    currentFiles = f;
    if (currentFolder) showFolder(currentFolder);
  };

  // Select first folder by default
  if (treeItems.length > 0) tree.setSelection([treeItems[0]]);

  return win;
}

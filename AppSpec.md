# MarsComm Application Specification

## Overview

MarsComm is a web-based communications system that simulates the experience of communicating between Earth and a remote analog research outpost (Mars or equivalent). All messages and reports are subject to a configurable one-way communications delay, replicating the speed-of-light lag of real deep-space communication.

The system is designed for use at analog astronaut research facilities. It currently supports two organizations:
- **MDRS** — Mars Desert Research Station (Utah, USA)
- **LunAres** — LunAres Research Station (Piła, Poland)

The application consists of two repos:
- **Client** (this repo): Qooxdoo-based single-page web application
- **Server** (`a:/prog/MarsComm`): Node.js/Express REST + SSE backend

---

## Functional Requirements

### 1. Time-Delayed Chat (Instant Messages)

- Users on Mars and Earth can send short text messages (IMs).
- IMs are transmitted automatically when sent (no manual transmit step).
- An IM sent from one planet is not visible on the other planet until the communications delay has elapsed.
- While an IM is in transit to recipients on the other planet, a circular progress indicator is shown to the sender. No progress indicator is shown for IMs sent within a single planet (all recipients on the same planet as the sender).
- When the user is viewing a past Sol (not the current one), the chat input is disabled.
- The chat panel auto-scrolls to the bottom when a new message is rendered and when switching chats or Sols (most recent messages are shown).
- Basic text formatting is supported: `**bold**`, `__italic__`, backtick code, and emoticons `:)` / `:(`
- URLs in messages are automatically linkified (rendered as clickable `<a>` tags opening in a new tab).
- IM text is selectable and copyable with the mouse.
- Pressing the up-arrow key in an empty chat input recalls the last message the current user sent in the current chat session (pre-formatted raw text). If the original message's server-assigned ID is known, this enters **edit mode**: the Send button label changes to "Update" and sending will replace the original message in-place rather than creating a new one. The edit propagates to the other planet after the same comms delay as a new IM. Edited messages display "(edited)" in their timestamp. Switching chats or Sols clears edit mode.

**Emoji quick-responses:**

- A row of four emoji buttons — 👍 😊 😉 😞 — appears in the chat input area (above the text field). Clicking one appends the emoji to the text input (Level 2B).
- Each rendered message shows a small always-visible emoji bar to its right with the same four emoji plus a ↩ reply button. Clicking an emoji immediately sends it as a reaction to that specific message (Level 2A). Reactions are rendered as a small grey annotation line below the target message body (`👍 Alice  😊 Bob`) rather than as a separate timeline entry, keeping the chat list in strict chronological order.

**Replies:**

- Each rendered message shows a **↩** button alongside its emoji bar. Clicking it enters *reply mode*: a dismissible strip appears above the chat input showing `↩ [user]: [snippet…]` with an ✕ to cancel. While in reply mode the strip remains visible across distribution changes.
- When a message is sent in reply mode, the outgoing IM includes a `replyTo: { id, user, snippet }` field (where `id` is the server-assigned message ID, `snippet` is the first ~60 characters of the original message's plain text). Reply mode is cleared after sending.
- IMs that have a `replyTo` field render a small grey italic header line above the message body: `↩ [user]: [snippet…]`. This header is a clickable link that scrolls to and briefly highlights (yellow flash) the original message in the current chat panel, identified by its `id`.
- Message IDs are assigned by the server: each IM within a Chat receives a sequential integer `id` (1, 2, 3, …), scoped to that Chat. IDs are stable across server restarts (stored in `db.json`). The server includes `id` in both the stored IM and the SSE push payload.

**Distribution (targeted messaging):**

Each message is addressed to a specific set of users — its *distribution*. Messages with the same distribution belong to the same *Chat*. The Distribution panel lets the user choose a distribution and see existing Chats they are part of.

The **Distribution panel** occupies the lower portion of the right-hand panel (below a horizontal separator). It is wrapped in a scroll container and has three columns side by side:

**Column 1 — Chat list:**
- Lists all Chats for the current Sol in which the current user is a member.
- Items are singly selectable; no item is selected by default.
- When a new IM arrives via SSE for a Chat that is not currently selected, that Chat's list item is shown in **bold red** (unread indicator). The indicator is cleared when the item is clicked.
- Unread state is session-only and applies only to the current Sol (SSE only delivers messages for the current Sol).
- When a Chat item is clicked, its messages are displayed immediately in the chat panel, and the Group dropdown and checkboxes are updated to reflect the Chat's user set (no cooldown).

**Chat naming** (all logic is client-side, relative to the current user):
1. If `Set(chat.users) \ {currentUser}` equals `Set(group_users) \ {currentUser}` for a built-in group (All / Mission Control / Crew) or a config-defined custom group, the Chat is named after that group.
2. If the Chat has exactly one other user, the Chat is named that user's role.
3. Otherwise, the Chat is named by a comma-separated list of abbreviated roles for all users except the current user, e.g. `"C,EO,MCM"`. A tooltip on the item shows the full unabbreviated role list. Abbreviations are defined by the optional `"abbr"` field on each user entry in `config.json`.

Because naming is client-side and relative to the current user, each user sees at most one Chat per group name — no duplicates can arise from a single user's perspective.

**Column 2 — Mission Control checkboxes:**
- One checkbox per Earth user, labelled `"<role> (<name>)"`.

**Column 3 — Crew checkboxes:**
- One checkbox per Mars user, labelled `"<role> (<name>)"`.

A **"Group"** dropdown above the columns contains: `All`, `Mission Control`, `Crew`, plus any custom groups defined in `config.json`, plus `Custom`.

Selecting a Group from the dropdown is UI sugar that checks/unchecks the corresponding boxes:
- **All** — checks all boxes
- **Mission Control** — checks Earth users, unchecks Mars users
- **Crew** — checks Mars users, unchecks Earth users
- **Custom groups** — checks exactly the users whose role is listed in the group's `roles` array, unchecks the rest

Clicking any checkbox directly sets the Group dropdown to **"Custom"**.

After any checkbox/group change made via the dropdown or checkboxes (not via a Chat list click), a **2-second cooldown** starts. When it expires, the chat panel is refreshed to show the Chat (if any) for the selected user set. If no such Chat exists yet, the panel is empty. The cooldown duration is configurable in `config.json` as `distributionCooldown` (seconds).

When sending a message, the target Chat is determined by the currently checked users plus the sender (who is always implicitly included). If a Chat with exactly that user set already exists for the current Sol, the message is added to it; otherwise a new Chat is created.

### 2. Mission Reports

Each Sol (mission day) has a set of daily reports and optionally one or more special reports due on specific Sols. Report types are configured server-side in `config.json`.

**Report lifecycle / states:**
| State | Meaning |
|---|---|
| Unused | No report data for this Sol |
| Empty | Report exists but has no content |
| Populated | Content has been written (blue) |
| Transmitted | Sent to the other planet, in transit (purple) |
| Received | Arrived at the other planet (teal, or red if rejected) |
| Approved | Approved by Mission Control on Earth (green) |

**Report operations:**
- **Edit/View**: Opens a CKEditor 5 rich-text editor. Only editable on the current Sol and the user's own planet.
- **Paste**: Paste clipboard text directly into the report content (bypassing the editor).
- **Copy**: Copy report content to clipboard.
- **Upload attachments**: Upload one or more files to attach to a report (multipart form upload).
- **Attachment Manager**: View, download, or delete attachments on a report.
- **Approve**: Earth-side users can approve received reports (checkbox).
- **Reset** (Earth users only): Clears all content, attachments, and state on both planets, returning the report to Empty/TODO. Requires confirmation. Only available on the current Sol. Intended for training and debugging.
- **Transmit**: Sends the current version of the report to the other planet. A circular progress indicator is shown during transit. On arrival, the other planet's copy is updated and all clients on that planet are notified via SSE.

**Report templates** are loaded from the server. When opening an empty report, the editor is pre-populated with the template for that report type. Templates support placeholders: `{crewNum}`, `{date}`, `{solNum}`.

### 3. Download

- **⬇ Reports ZIP**: Downloads a ZIP archive containing all reports for the current Sol as `.txt` files, plus all attachments grouped by report name.
- **⬇ Attachments ZIP**: Downloads a server-side ZIP of all raw attachment files for the current Sol and planet.

The top-bar buttons for these actions use the Unicode downward-arrow character ⬇ (U+2B07) in place of the word "Download" to save space.

### 4. Sol Navigation

- A spinner in the top bar allows the user to navigate to any Sol (0 to rotationLength+1).
- A "Today" button next to the spinner sets the spinner to the Sol number corresponding to today's date.
- The current Sol is computed from the server-provided reference date and `missionStartDate`.
- When the Sol changes, the chat and report panels are refreshed with data for that Sol.

**Pre-flight and post-flight phases:**

The server config may include a `missionStartDate` (YYYY-MM-DD) that defines when Sol 1 begins. This enables MarsComm to be used before and after the formal mission:

- **Before `missionStartDate`** — `getSolNum()` returns 0 for all dates. All pre-mission messages accumulate in Sol 0. The client shows an orange **PREFLIGHT** badge next to the Today button (same orange as the TODO report name color).
- **Sol 1 through Sol `rotationLength`** — normal mission operation. Sol 1 = `missionStartDate`, Sol 2 = the next calendar day (or Mars sol), etc.
- **`rotationLength` or more days after `missionStartDate`** — `getSolNum()` returns `rotationLength+1`. All post-mission messages accumulate in Sol `rotationLength+1`. The client shows a **POSTFLIGHT** badge in the same location as the PREFLIGHT badge.

The badge reflects the real-time mission phase (based on today's date), independent of which Sol the user has navigated to in the spinner.

**Sol duration:**

The server config `solDuration` field (`"Earth"` or `"Mars"`, default `"Earth"`) controls the length of one Sol. This is used for both Sol number computation and Sol time display. It only applies when `missionStartDate` is set.

- **`"Earth"`** (default): each Sol is one Earth calendar day (86,400,000 ms). Sol 1 = `missionStartDate`, Sol 2 = the next Earth calendar day, etc. Sol time equals Earth local time.
- **`"Mars"`**: each Sol is one Martian day (88,775,244 ms — 24 h 39 m 35.244 s). By definition, Sol 1 begins at exactly midnight (browser local time) on `missionStartDate`; subsequent Sols drift from Earth calendar dates by ~39 minutes per Sol.

The term "Sol" is used here in a generalised sense: it refers to whatever day length is configured, not strictly to a Martian day. Analog missions (such as MDRS) routinely use "Sol" as an alias for "day" regardless of the actual duration, to reinforce the mission atmosphere. In both modes the pre/post-flight clamping to Sol 0 and Sol `rotationLength+1` is unchanged.

**Earth date and time display (mission phase only):**

During the mission (Sol 1 through Sol `rotationLength`), the area next to the Today button shows:
- The current Earth calendar date in **YYYY-MM-DD** format.
- To the right of the date, stacked vertically: Earth local time on top (blue, HH:MM) and Sol time below (red, HH:MM). Sol time is the elapsed Earth-duration hours and minutes since the start of the current Sol, computed as `(now − missionStartDate_midnight) mod solDurationMs`. When `solDuration = "Earth"`, Sol time equals Earth local time (both read 24h cycles). When `solDuration = "Mars"`, Sol time drifts ~39 min/sol behind Earth time. Both times update every minute via `setInterval`; no server contact is needed.

During PREFLIGHT and POSTFLIGHT phases the PREFLIGHT/POSTFLIGHT badge is shown in this area instead (no date/time clock).

**"Sol" label color:**

When `solDuration = "Mars"`, the **Sol** label in the top bar is red (matching the Sol time display). When `solDuration = "Earth"` it retains its current color.

### 5. Authentication

- Users log in with username and password. The server returns a session token and the user's planet assignment.
- The login button shows the current user and planet when logged in; clicking it offers a logout option.
- Planet-appropriate coloring is applied to the top panel after login (reddish for Mars, bluish for Earth).
- A planet icon (Earth or Mars image) is shown in the top bar.
- The query parameter `?user=<name>` can be used for auto-login during development.
- Server-Sent Events (SSE) are established per-planet after login to receive real-time push updates. If the SSE connection drops, the client automatically reconnects after 5 seconds (as long as the user is still logged in).

### 6. Real-Time Updates (SSE)

After login, the client subscribes to `GET /events/:planet`. The server pushes two event types:
- **IM**: A new instant message. The pushed object includes the Chat's `users[]` array. If the current user is not in `chatUsers`, the IM is ignored entirely. If the Chat's user set matches the currently-selected distribution, the IM is displayed in the chat panel (comms-delay logic applies). If it matches a different Chat the user is on, that Chat's list item is marked unread (bold red) in the Chat list. Either way the IM is added to the appropriate Chat in the local model.
- **Report**: A report update — the matching ReportUI is refreshed.

**Sound effects (Web Audio API):**
- When an IM from another user is displayed (either in the current chat or when marking a chat unread), a short hi-tech chirp plays. This is subject to a cooldown: it plays at most once per `messageArrivalSoundCooldown` seconds (fetched from `GET /message-arrival-sound-cooldown`; default 180). The AudioContext is created lazily on first use.
- When a transmitted report arrives from the other planet (SSE `Report` event with `transmitted=true` and `authorPlanet !== planet`), a two-note ascending chime plays. No cooldown applies to report sounds.

### 7. Branding / Multi-Organization Support

The server's `config.json` contains an `organization` field (`"MDRS"` or `"LunAres"`). At startup the client fetches this value and uses it to:
- Set the app title label: `"<Organization> MarsComm"`
- Show the organization logo (30x30px, scaled):
  - MDRS: `myapp/MDRSlogo.jpg`
  - LunAres: `myapp/LunAreslogo.png`
- Set the chat panel background image (20% opacity overlay):
  - MDRS: `resource/myapp/MDRS-2017.jpg`
  - LunAres: `resource/myapp/LunAres-facility.png`

### 8. Theme

- Dark mode (default) and light mode are supported.
- Toggled via the " " button in the top bar; the theme preference is preserved in the URL query parameter `?theme=0` (dark) or `?theme=1` (light).
- All color-producing functions (`themeBgColor`, `themeButtonColor`, etc.) check the global `theme` variable.

---

## Technical Design — Client

### Technology Stack

- **Framework**: Qooxdoo 7.7.2 (`@qooxdoo/framework`)
- **Rich text editor**: CKEditor 5 (loaded externally via `index.html`)
- **ZIP creation**: JSZip (loaded externally via `index.html`)
- **Build tool**: Qooxdoo compiler (`npx qx compile`)

### Source Layout

```
source/
  class/myapp/
    Application.js        -- all application code (single file)
    theme/
      Theme.js / Color.js / Appearance.js / Decoration.js / Font.js
  resource/myapp/
    MDRSlogo.jpg          -- MDRS logo (30x30 display)
    LunAreslogo.png       -- LunAres logo (175x175, scaled to 30x30)
    MDRS-2017.jpg         -- MDRS chat background
    LunAres-facility.png  -- LunAres chat background
    Earth.png / Mars.png  -- planet icons
    Earth.webp            -- alternate Earth image
    copyIcon.png / pasteIcon.png  -- report toolbar icons
  boot/
    index.html            -- HTML entry point; loads CKEditor 5 and JSZip CDN scripts
compile.json              -- Qooxdoo build config; defines app class and theme
```

### Classes (all in Application.js)

| Class | Description |
|---|---|
| `myapp.Application` | Main app class. Entry point is `main()`. Manages layout, login, sol navigation, server comms, downloads. |
| `myapp.ChatUI` | Chat panel. Manages IM display, input, sending, and sol switching. |
| `myapp.ReportUI` | One report widget. Manages report state machine, editing, transmit, attachments. |
| `myapp.CKEditor` | Qooxdoo wrapper around CKEditor 5 `ClassicEditor`. Handles init, resize, placeholder substitution. |
| `myapp.CKEditorWindow` | Modal Qooxdoo window containing a `CKEditor`. OK saves content back to `ReportUI`. |
| `myapp.CircularProgress` | Canvas-based circular progress widget. Used during IM/report transit. |
| `myapp.AttachmentManager` | Modal window to list, download, and delete report attachments. |

### Server Communication

All server calls go to `urlPrefix`, which defaults to `http://localhost:8081/` but is configurable via query parameters:
- `?protocol=https`
- `?serverHost=<hostname>`
- `?serverPort=<port>`

**GET endpoints used:**

| Endpoint | Purpose |
|---|---|
| `GET /comms-delay` | One-way comms delay in seconds |
| `GET /crew-num` | Crew number |
| `GET /rotation-length` | Number of Sols in rotation |
| `GET /organization` | Organization name (`MDRS` or `LunAres`) |
| `GET /ref-date` | `{ refDate, missionStartDate, solDuration }` — `refDate` is one Earth day before `missionStartDate`; `missionStartDate` is YYYY-MM-DD of Sol 1 (null if not configured); `solDuration` is `"Earth"` or `"Mars"` |
| `GET /users` | List of all users `[{role, name, planet, abbr?}]` (no passwords) |
| `GET /distribution-cooldown` | `{ distributionCooldown }` in seconds |
| `GET /message-arrival-sound-cooldown` | `{ messageArrivalSoundCooldown }` in seconds |
| `GET /sols/:solNum` | Sol data (chats + reports for both planets) |
| `GET /reports` | List of report names |
| `GET /reports/templates` | Map of report name -> template HTML |
| `GET /attachments/:planet/:solNum` | All attachments for a Sol/planet (base64 content) |
| `GET /attachments/zip/:planet/:solNum` | Server-generated ZIP of attachments |
| `GET /attachments/download?file=<opaque>&name=<orig>` | Download a single attachment file by its server-side opaque name, served with the original filename |
| `GET /events/:planet` | SSE stream for real-time push |

**POST endpoints used:**

| Endpoint | Purpose |
|---|---|
| `POST /login` | Login with username/password |
| `POST /ims` | Send an instant message to a targeted distribution |
| `POST /reports/update` | Update report content/approval |
| `POST /reports/transmit/:name` | Transmit report to other planet |
| `POST /attachments` | Upload attachment files (multipart) |

### Sol Data Model (client-side)

Each Sol object (received from server) contains:
- `chats[]`: array of Chat objects (see below)
- `reportsEarth[]` / `reportsMars[]`: arrays of Report objects
- Client selects `sol.reportsEarth` or `sol.reportsMars` based on `planet` after login.

### Chat and IM Data Model (client-side)

Each **Chat** object:
- `users[]`: sorted array of usernames who are members of this chat (includes sender)
- `ims[]`: array of IM objects (see below)

Each **IM** object:
```
{
  type: "IM",
  id: number,               // server-assigned sequential integer, scoped to this Chat
  content: string,          // HTML-formatted message body
  user: string,             // sender username
  planet: "Earth"|"Mars",
  xmitTime: Date,
  transmitted: true,
  replyTo?: {               // present only if this IM is a reply or emoji reaction
    id: number,             // id of the original IM within this Chat
    user: string,           // sender of the original IM
    snippet: string,        // first ~60 chars of original IM plain text (HTML stripped)
    isReaction?: true       // set when sent via emoji quick-response; renders as annotation, not timeline entry
  }
}
```

The client finds the Chat to display by comparing `chat.users` (sorted) against the currently-selected distribution (sorted, with current user always included).

### IM Transit Logic

- `inTransit(im)`: true if `im.transmitted` and comms delay has NOT elapsed since `xmitTime`
- If from the same planet or already arrived: display immediately
- If from other planet and still in transit: `setTimeout` to display after remaining delay
- A `CircularProgress` spinner is shown during transit

---

## Test / Debug Features

When the server's `config.json` contains `"testMode": true`, additional features are enabled:

### Joke Mode

A **Joke Mode** toggle button appears just above the Send button in the chat input area. Clicking it toggles joke mode on/off. While on:
- The IM input field is disabled to prevent accidental user typing.
- The client automatically composes and sends a random space-related joke at a random interval: `max(commsDelay/3 + rand(0, commsDelay), 2)` seconds.
- After each joke is sent, the next is scheduled with a freshly randomized delay.
- Jokes are loaded at startup from `source/resource/myapp/jokes.json` (65 entries).

The button label shows `Joke Mode: OFF` (grey) or `Joke Mode: ON` (blue) to indicate the current state.

---

## Configuration (query parameters)

| Parameter | Default | Description |
|---|---|---|
| `theme` | `0` | `0`=dark, `1`=light |
| `protocol` | `http` | Server protocol |
| `serverHost` | `window.location.hostname` | Server hostname |
| `serverPort` | `8081` | Server port |
| `user` | (none) | Auto-login username (dev only) |

---

## Build & Run

```bash
# Install dependencies
npm install

# Compile (development/source mode)
npx qx compile

# Serve (Qooxdoo dev server)
npx qx serve
```

The compiled output is in `compiled/`. The client must be served from a web server; it connects to the MarsComm server (default port 8081).

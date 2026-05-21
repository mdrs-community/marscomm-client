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
- While an IM is in transit, a circular progress indicator is shown to the sender.
- When the user is viewing a past Sol (not the current one), the chat input is disabled.
- Basic text formatting is supported: `**bold**`, `__italic__`, backtick code, and emoticons `:)` / `:(`.

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
- **Transmit**: Sends the current version of the report to the other planet. A circular progress indicator is shown during transit. On arrival, the other planet's copy is updated and all clients on that planet are notified via SSE.

**Report templates** are loaded from the server. When opening an empty report, the editor is pre-populated with the template for that report type. Templates support placeholders: `{crewNum}`, `{date}`, `{solNum}`.

### 3. Download

- **Download Reports ZIP**: Downloads a ZIP archive containing all reports for the current Sol as `.txt` files, plus all attachments grouped by report name.
- **Download Attachments ZIP**: Downloads a server-side ZIP of all raw attachment files for the current Sol and planet.

### 4. Sol Navigation

- A spinner in the top bar allows the user to navigate to any Sol in the rotation (0 to rotationLength-1).
- The current Sol is computed from the server-provided reference date.
- When the Sol changes, the chat and report panels are refreshed with data for that Sol.

### 5. Authentication

- Users log in with username and password. The server returns a session token and the user's planet assignment.
- The login button shows the current user and planet when logged in; clicking it offers a logout option.
- Planet-appropriate coloring is applied to the top panel after login (reddish for Mars, bluish for Earth).
- A planet icon (Earth or Mars image) is shown in the top bar.
- The query parameter `?user=<name>` can be used for auto-login during development.
- Server-Sent Events (SSE) are established per-planet after login to receive real-time push updates. If the SSE connection drops, the client automatically reconnects after 5 seconds (as long as the user is still logged in).

### 6. Real-Time Updates (SSE)

After login, the client subscribes to `GET /events/:planet`. The server pushes two event types:
- **IM**: A new instant message — displayed immediately if from the same planet, or after delay if from the other planet.
- **Report**: A report update — the matching ReportUI is refreshed.

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
| `GET /ref-date` | Reference date (Sol 0 start date) |
| `GET /sols/:solNum` | Sol data (IMs + reports for both planets) |
| `GET /reports` | List of report names |
| `GET /reports/templates` | Map of report name -> template HTML |
| `GET /attachments/:planet/:solNum` | All attachments for a Sol/planet (base64 content) |
| `GET /attachments/zip/:planet/:solNum` | Server-generated ZIP of attachments |
| `GET /events/:planet` | SSE stream for real-time push |

**POST endpoints used:**

| Endpoint | Purpose |
|---|---|
| `POST /login` | Login with username/password |
| `POST /ims` | Send an instant message |
| `POST /reports/update` | Update report content/approval |
| `POST /reports/transmit/:name` | Transmit report to other planet |
| `POST /attachments` | Upload attachment files (multipart) |

### Sol Data Model (client-side)

Each Sol object (received from server) contains:
- `ims[]`: array of IM objects `{ type, content, user, planet, xmitTime, transmitted }`
- `reportsEarth[]` / `reportsMars[]`: arrays of Report objects
- Client selects `sol.reportsEarth` or `sol.reportsMars` based on `planet` after login.

### IM Transit Logic

- `inTransit(im)`: true if `im.transmitted` and comms delay has NOT elapsed since `xmitTime`
- If from the same planet or already arrived: display immediately
- If from other planet and still in transit: `setTimeout` to display after remaining delay
- A `CircularProgress` spinner is shown during transit

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

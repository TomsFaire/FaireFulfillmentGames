# Faire Fulfillment Games — Broadcast Overlays

OBS-ready browser-source overlays for the four-team fulfillment livestream. Cardboard / kraft-paper aesthetic, 1920×1080, transparent backgrounds so video composites cleanly underneath.

---

## Files

```
/
├── Faire Fulfillment Games Overlays.html   ← Design canvas (preview all layouts in iframes)
├── overlays.jsx                             ← Source for the canvas previews
├── design-canvas.jsx                        ← Pan/zoom canvas component
└── obs/                                     ← THE FILES OBS LOADS
    ├── admin.html                           ← Admin: set team names, H2H matchups, URL guide
    ├── control.html                         ← Tablet score controller (served by server.js)
    ├── overlay-1-single-pip.html            ← Wide cam + POV PiP + score chip (?team=0–3)
    ├── overlay-1-wide-only.html             ← Wide cam only + score chip (?team=0–3)
    ├── overlay-2-four-portrait.html         ← Title / open — four portraits
    ├── overlay-3-four-up.html               ← Live four-up grid w/ order counters
    ├── overlay-4-head-to-head.html          ← Two-team matchup (?slot=a|b from admin config)
    ├── overlay-5-champion.html              ← Winner reveal — single hero cam (?winner=0–3)
    ├── server.js                            ← Relay server: serves obs/, score+team API, SSE, timer proxy
    ├── start.sh                             ← Convenience launcher: `bash obs/start.sh`
    ├── .env.example                         ← Stagetimer credential template (copy → .env, never commit)
    ├── cardboard.css                        ← Shared styles
    ├── overlay-kit.js                       ← Shared markup helpers, dynamic team loader
    └── stagetimer.js                        ← Live SHIP-BY clock binding
```

**Team names, cities, codes, and presenter handles** are configured via `obs/admin.html` and stored in `localStorage['ffg.teams']`. The admin page broadcasts changes to all open overlays via SSE (server) or BroadcastChannel (same-machine), causing them to reload instantly with the new names. Teams are referenced by index (0–3), not by name — Team 1 always shows Score 1.

---

## Deploy to production machine (Mac mini)

### What you need
- The project folder (copy via AirDrop, USB, or download the ZIP from GitHub)
- [Node.js LTS](https://nodejs.org) installed on the Mac mini (one-time)

### Steps

**1. Copy the project folder onto the Mac mini** — anywhere is fine, e.g. `~/ffg-overlays/`.

**2. Install Node.js** if it isn't already:
- Download the macOS ARM64 installer from [nodejs.org](https://nodejs.org) and run it.

**3. Run the install script once** from Terminal:
```bash
bash ~/ffg-overlays/install.sh
```
This will:
- Confirm Node.js is found
- Copy `obs/.env.example` → `obs/.env` if it doesn't exist yet
- Write a `launchd` service plist to `~/Library/LaunchAgents/`
- Start the server immediately

**4. Fill in your Stagetimer credentials** in `obs/.env` (the install script creates it):
```
STAGETIMER_ROOM_ID=your-room-id
STAGETIMER_TIMER_ID=your-timer-id
STAGETIMER_API_KEY=your-api-key
```
Then reload the service:
```bash
launchctl unload ~/Library/LaunchAgents/com.faire.ffg-server.plist
launchctl load  ~/Library/LaunchAgents/com.faire.ffg-server.plist
```

**5. The server now starts automatically at every login.** Toggle it any time in:
**System Settings → General → Login Items → Allow in Background**

### Useful commands
```bash
tail -f /tmp/ffg-server.log                                        # live log
launchctl unload ~/Library/LaunchAgents/com.faire.ffg-server.plist # stop
launchctl load   ~/Library/LaunchAgents/com.faire.ffg-server.plist # start
```

---

## Score controller setup

The tablet controller runs through a small Node.js server (`obs/server.js`) on the OBS machine. The server serves the control page over your LAN, relays score changes to the OBS overlay via SSE, and proxies Stagetimer timer controls so credentials never leave the machine.

**1. Add Stagetimer credentials**

```bash
cp obs/.env.example obs/.env
# edit obs/.env and fill in:
#   STAGETIMER_ROOM_ID=
#   STAGETIMER_TIMER_ID=
#   STAGETIMER_API_KEY=
```

**2. Start the server** (on the OBS machine, before opening OBS)

```bash
bash obs/start.sh
# or: node obs/server.js
```

Server starts on port 3000. You'll see the LAN URL printed — open that on the tablet.

**3. Update OBS Browser Sources** to use `http://localhost:3000/…` (see OBS setup below).

**4. Open the controller on your tablet** — navigate to `http://<obs-machine-ip>:3000/control.html`. The status pill shows **LIVE** when connected to the server, **LOCAL** when falling back to same-machine BroadcastChannel.

---

## OBS setup

**Start `obs/server.js` before OBS loads the sources** (see Score controller setup above).

For each overlay add a **Browser Source** in OBS:

| Setting | Value |
|---|---|
| URL | `http://localhost:3000/overlay-1-single-pip.html?obs=1` (etc) |
| Width × Height | **1920 × 1080** |
| FPS | 30 |
| Custom CSS | *(leave blank)* |
| Shutdown source when not visible | **Unchecked** (so the timer keeps polling) |
| Refresh browser when scene becomes active | Optional |

### All layout URLs

| Overlay | Description | URL |
|---|---|---|
| Overlay 1 | Wide cam + PiP + score — Team 1 | `http://localhost:3000/overlay-1-single-pip.html?team=0&obs=1` |
| Overlay 1 | Wide cam + PiP + score — Team 2 | `http://localhost:3000/overlay-1-single-pip.html?team=1&obs=1` |
| Overlay 1 | Wide cam + PiP + score — Team 3 | `http://localhost:3000/overlay-1-single-pip.html?team=2&obs=1` |
| Overlay 1 | Wide cam + PiP + score — Team 4 | `http://localhost:3000/overlay-1-single-pip.html?team=3&obs=1` |
| Overlay 1b | Wide cam only + score — Team 1 | `http://localhost:3000/overlay-1-wide-only.html?team=0&obs=1` |
| Overlay 2 | Title / four portraits | `http://localhost:3000/overlay-2-four-portrait.html?obs=1` |
| Overlay 3 | Live four-up + order counters | `http://localhost:3000/overlay-3-four-up.html?obs=1` |
| Overlay 4A | Head-to-head — Slot A (set in admin) | `http://localhost:3000/overlay-4-head-to-head.html?slot=a&obs=1` |
| Overlay 4B | Head-to-head — Slot B (set in admin) | `http://localhost:3000/overlay-4-head-to-head.html?slot=b&obs=1` |
| Overlay 5 | Champion reveal — Team 1 | `http://localhost:3000/overlay-5-champion.html?winner=0` |
| Overlay 5 | Champion reveal — Team 2 | `http://localhost:3000/overlay-5-champion.html?winner=1` |
| Overlay 5 | Champion reveal — Team 3 | `http://localhost:3000/overlay-5-champion.html?winner=2` |
| Overlay 5 | Champion reveal — Team 4 | `http://localhost:3000/overlay-5-champion.html?winner=3` |

**Tip:** The **Admin page** (`http://localhost:3000/admin.html`) shows a live URL guide with team names pre-filled into the descriptions.

Replace `?obs=1` with any of the chroma-key flags below:

| Flag | Cam windows | Page background | Use when |
|---|---|---|---|
| `?obs=1` | Transparent | Transparent | Compositing video in OBS |
| `?key=1` | Black | Black | Hardware switcher — KEY input (pair with fill URL) |
| `?obs=green` | `#00ff00` | Transparent | Hardware switcher — key cams only |
| `?obs=green2` | `#00ff00` | `#00ff00` | Hardware switcher — full green field |
| `?obs=blue` | `#0000ff` | Transparent | Hardware switcher — key cams only |
| `?obs=blue2` | `#0000ff` | `#0000ff` | Hardware switcher — full blue field |

All flags hide the design-time placeholders and resolution chips.

The design-canvas page (`Faire Fulfillment Games Overlays.html`) has a **COPY** button per overlay that builds the absolute URL with `?obs=1` already appended — update the host to `localhost:3000` after copying.

---

## Overlay 4 — Head-to-Head

Two-team side-by-side layout for semi-finals or head-to-head matchups. Each team gets a full-height camera frame; both live order counts sit in the top header so the score is always visible without covering either feed. A SHIP-BY timer chip and a RUSH stamp round out the header.

### Layout

- Header banner (kraft paper): F mark · title · SHIP-BY timer · two score pills · RUSH stamp
- Left cell: 819×760px cardboard frame, team name / city in the shipping label
- Right cell: mirrored, tape strip on opposite corner

### Teams and score

Teams are assigned via the **Admin page** (`/admin.html`) using Slot A and Slot B. The overlay reads from `localStorage['ffg.h2h']` on load and reloads automatically if the matchup is changed in admin.

| URL param | Default | Description |
|---|---|---|
| `?slot=` | `a` | Slot `a` or `b` — loads the team pair configured in admin |
| `?max=` | `10` | Target / denominator shown in score pills |
| `?l=` | *(slot config)* | Override left team index (0–3) |
| `?r=` | *(slot config)* | Override right team index (0–3) |

Score state is the **same shared `localStorage['ffg.orders']` store as Overlay 3** — bump scores on the tablet controller and both overlays update simultaneously. The SHIP-BY timer is driven by Stagetimer (same as Overlays 1 and 3) and is controlled from `control.html`.

---

## Overlay 5 — Champion

End-of-show winner reveal. Mimics the single-cam layout so the transition feels continuous — same 1760×860 hero cam frame, same position on canvas. The graphic dresses it up with:

- **Top kicker banner** — team name in large serif, city and handle, "· FFG 2026 CHAMPION ·" kicker in red, and a final score chip
- **1st-place Faire postage badge** — rotated stamp in the upper-left of the cam window
- **DELIVERED** — large diagonal rubber stamp over the lower portion of the cam feed

**No SHIP-BY timer chip** — Overlay 5 shows the final score only, not the clock.

### Score

The final score chip shows the winner's live order count from the **same shared store as overlays 3 and 4** — the tablet controller in `control.html` drives it. No separate configuration needed; if the score is right on Overlay 3, it's right here too.

### Winner selection

| URL param | Default | Description |
|---|---|---|
| `?winner=` | `2` | Winning team index `0`–`3` (matches slot in admin) |
| `?final=` | *(live score)* | Optional: seed the winner's score to a specific number on load |
| `?max=` | `10` | Target / denominator |

In OBS, add one Browser Source per team (e.g. `?winner=0`, `?winner=1`, `?winner=2`, `?winner=3`) and toggle scene/source visibility to reveal the winner without touching URLs mid-show. The score and team name update automatically from the shared store.

---

## Key / Fill workflow (hardware switchers)

Traditional downstream keying requires two separate video signals into your switcher:

- **Fill** — the coloured graphic on a black background: `?obs=green2` or `?obs=blue2`
- **Key** — a white-on-black luminance matte of the same layout: `?key=1`

The switcher uses the key signal to cut a hole in program output and drops the fill into it. Both signals must come from the same layout URL so the geometry matches exactly.

**Setup (two display outputs from one machine):**

1. Output A → switcher FILL input: `http://localhost:3000/overlay-3-four-up.html?obs=green2`
2. Output B → switcher KEY input:  `http://localhost:3000/overlay-3-four-up.html?key=1`

In `?key=1` mode every graphic element (frames, banners, timer chip, order counters) renders as **solid white**; cam window areas and the page background are **solid black**. White = show fill, black = show program video through.

---

## Live timer (Stagetimer)

The SHIP-BY clock at the top of overlays 1, 3, and 4 binds to a [Stagetimer](https://stagetimer.io) room.

Credentials live in `obs/.env` (never in the URL). The overlay fetches them from the relay server (`server.js`) on load — **the server must be running before OBS loads the overlay, or the clock falls back to local time-of-day**. Fill in `obs/.env` before starting `server.js`:

```
STAGETIMER_ROOM_ID=abc123
STAGETIMER_TIMER_ID=def456
STAGETIMER_API_KEY=your-key-here
```

Start/stop/reset the timer from the **SHIP-BY TIMER** section of `control.html` — the server proxies the calls so the tablet never sees your credentials.

The chip falls back to `--:--` / `OFFLINE` if the room isn't reachable, so the layout never breaks.

Polls every ~1s with drift correction. Status pill on the chip shows `OFFLINE` / `LOCAL` / `DEMO` when not bound to a real timer.

---

## Score counters (overlays 1, 3, 4, and 5)

All score-bearing overlays share a single source of truth: `localStorage['ffg.orders']` — a four-element array indexed 0–3. Update it in one place and every open overlay reflects it instantly.

- **Overlay 1 (single-pip / wide-only)** — shows the selected team's score as a chip bottom-left (`?team=0|1|2|3`)
- **Overlay 3** — shows all four teams' order counts as large chips in a 2×2 grid
- **Overlay 4** — shows the two competing teams' counts as pills in the header banner; driven by Stagetimer for the clock
- **Overlay 5** — shows the winner's final count in the kicker chip

### Team indices

Teams are numbered 0–3 matching the slots in the Admin page. Names are set in admin and persist in `localStorage['ffg.teams']`.

| Index | Default name |
|---|---|
| `0` | Team 1 |
| `1` | Team 2 |
| `2` | Team 3 |
| `3` | Team 4 |

Counter values persist in `localStorage` — a Companion "refresh page" button doesn't wipe them.

### Method 1 — Tablet controller via relay server (recommended for live shows)

Start `obs/server.js` on the OBS machine (see Score controller setup above), then open `http://<obs-machine-ip>:3000/control.html` on any tablet or phone on the same WiFi. Big +/− buttons per team (showing current team names), RESET ALL, Goal field, and SHIP-BY timer controls. The team names update automatically from the admin page.

Score changes flow: tablet → `POST /api/orders/bump` → server → SSE → all open overlays simultaneously. No page refresh needed. The status pill shows **LIVE** when the server is reachable.

Falls back to **BroadcastChannel** if the server is unreachable and both pages happen to be in the same browser on the same machine.

### Method 2 — URL params + page reload (Companion HTTP GET)

Seed scores via URL params and trigger an OBS "Refresh browser source" action:

```
http://localhost:3000/overlay-3-four-up.html?obs=1&0=8&1=6&2=9&3=7
http://localhost:3000/overlay-5-champion.html?obs=1&winner=0&final=10
```

Optional `&max=12` to change the denominator.

### Method 3 — Companion → OBS "Execute JavaScript on browser source" (cleanest, no reload)

Each Companion button fires one JS expression on the browser source. Works on overlays 3, 4, and 5 — `window.FFG` is exposed on all of them:

```js
FFG.bump(0, 1)     // +1 for Team 1 (index 0)
FFG.bump(0, -1)    // -1 for Team 1
FFG.set(1, 8)      // hard-set Team 2 to 8
FFG.set(2, 0)      // zero Team 3
FFG.reset()        // zero everything
FFG.state()        // returns current state, e.g. [7,5,8,6]
```

### Method 4 — postMessage (for embedding in another page)

If the overlay is in an iframe of a larger control surface:

```js
overlayIframe.contentWindow.postMessage(
  { type: 'ffg.orders', team: 0, delta: 1 }, '*'
);
overlayIframe.contentWindow.postMessage(
  { type: 'ffg.orders', team: 1, value: 8 }, '*'
);
overlayIframe.contentWindow.postMessage(
  { type: 'ffg.orders', reset: true }, '*'
);
```

---

## Admin page

Open `http://localhost:3000/admin.html` (or `http://<obs-machine-ip>:3000/admin.html`) to configure teams and matchups.

### Teams

Fill in Name, City/Location, Short Code, and Presenter/User for each slot. Click **SAVE TEAMS** — all open overlays on the machine reload within a second with the new names applied. The relay server broadcasts the update to tablets and other devices on the LAN too.

### Head-to-Head matchups

Two matchup slots (A and B) can each be assigned any two teams. Overlay 4 loaded with `?slot=a` or `?slot=b` picks up the assigned pair. After changing an assignment, click **SAVE MATCHUPS** — Overlay 4 reloads automatically.

### URL guide

The bottom of the admin page shows every OBS Browser Source URL with the current team names pre-filled in the labels, so you can quickly identify which URL to paste for each scene.

---

## Customization

### Change team names / cities / handles

Use the **Admin page** (`/admin.html`) — changes propagate to all overlays instantly. No file editing required.

For offline/file-based use only, you can also edit `FFG_TEAM_DEFAULTS` at the top of `obs/overlay-kit.js`.

### Change the show name / banner copy

Per overlay — search for "FAIRE FULFILLMENT GAMES" or "FFG 2026" in the relevant HTML file under `obs/`.

### Change the SHIP-BY label

Each overlay calls `makeTimerChip('SHIP-BY')` — change the string. Or change `'GROUND ONLY'` / `'FRAGILE'` / `'PRIORITY'` in the `makeStamp()` calls.

---

## Troubleshooting

**Cam window shows up as a dark rectangle in OBS.** You forgot `?obs=1` in the URL. Without it the page is in design-preview mode and the cam cutouts are filled.

**Timer shows the current time of day instead of a countdown.** `server.js` is not running. The overlay fetches Stagetimer credentials from `/api/timer/config` at load time — if the server is down, the fetch fails silently and the clock falls back to local time. Start the server (`bash obs/start.sh`) and then reload the browser source in OBS.

**Timer shows `--:--  OFFLINE`.** The server is running but the Stagetimer room ID or API key in `obs/.env` is missing or incorrect. Check that `server.js` printed "Stagetimer: configured ✓" on startup.

**Control panel status pill shows OFFLINE.** `server.js` isn't running, or the tablet is on a different network from the OBS machine. Start the server first, then reload the control page.

**Order counter buttons in `control.html` don't update the overlay.** Make sure OBS is loading the overlay from `http://localhost:3000/…`, not a `file://` path. The SSE relay only works when both are served by `server.js`.

**Counters reset on page refresh.** They shouldn't — they're in `localStorage`. If they do, you're probably opening the file via `file://` (no localStorage origin) or the URL has explicit `?sf=…&kw=…` params, which always win on first load. Drop those params from the saved Browser Source URL.

**Fonts look wrong in OBS.** OBS Browser Source needs internet access for Google Fonts (Lora + Inter). If you're offline, swap the `<link>` to a local copy.

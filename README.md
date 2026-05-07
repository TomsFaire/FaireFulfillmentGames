# Faire Fulfillment Games — Broadcast Overlays

OBS-ready browser-source overlays for the four-team fulfillment livestream. Cardboard / kraft-paper aesthetic, 1920×1080, transparent backgrounds so video composites cleanly underneath.

---

## Files

```
/
├── Faire Fulfillment Games Overlays.html   ← Design canvas (preview all 3 in iframes,
│                                             toggle MASK ONLY / TRANSPARENCY GRID,
│                                             copy OBS-ready URLs)
├── overlays.jsx                             ← Source for the canvas previews
├── design-canvas.jsx                        ← Pan/zoom canvas component
└── obs/                                     ← THE FILES OBS LOADS
    ├── overlay-1-single-pip.html            ← Wide cam + POV PiP
    ├── overlay-2-four-portrait.html         ← Title / open — four portraits
    ├── overlay-3-four-up.html               ← Live four-up grid w/ order counters
    ├── control.html                         ← Tablet score controller (served by server.js)
    ├── server.js                            ← Relay server: serves obs/, score API, SSE, timer proxy
    ├── start.sh                             ← Convenience launcher: `bash obs/start.sh`
    ├── .env.example                         ← Stagetimer credential template (copy → .env, never commit)
    ├── cardboard.css                        ← Shared styles
    ├── overlay-kit.js                       ← Shared markup helpers (TEAMS array lives here)
    └── stagetimer.js                        ← Live SHIP-BY clock binding
```

The single source of truth for **team names, cities, codes, handles** is the `TEAMS` constant at the top of `obs/overlay-kit.js`. Edit it there and all three overlays update.

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
| Overlay 1 | Wide cam + POV PiP | `http://localhost:3000/overlay-1-single-pip.html?obs=1` |
| Overlay 1b | Wide cam only (no PiP) | `http://localhost:3000/overlay-1-wide-only.html?obs=1` |
| Overlay 2 | Title / four portraits | `http://localhost:3000/overlay-2-four-portrait.html?obs=1` |
| Overlay 3 | Live four-up + order counters | `http://localhost:3000/overlay-3-four-up.html?obs=1` |

Replace `?obs=1` with any of the chroma-key flags below:

| Flag | Cam windows | Page background | Use when |
|---|---|---|---|
| `?obs=1` | Transparent | Transparent | Compositing video in OBS |
| `?obs=green` | `#00ff00` | Transparent | Hardware switcher — key cams only |
| `?obs=green2` | `#00ff00` | `#00ff00` | Hardware switcher — full green field |
| `?obs=blue` | `#0000ff` | Transparent | Hardware switcher — key cams only |
| `?obs=blue2` | `#0000ff` | `#0000ff` | Hardware switcher — full blue field |

All flags hide the design-time placeholders and resolution chips.

The design-canvas page (`Faire Fulfillment Games Overlays.html`) has a **COPY** button per overlay that builds the absolute URL with `?obs=1` already appended — update the host to `localhost:3000` after copying.

---

## Live timer (Stagetimer)

The SHIP-BY clock at the top of overlays 1 and 3 binds to a [Stagetimer](https://stagetimer.io) room.

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

## Order counters (overlay 3)

The `ORDERS  N / 10` chip on each of the four cells is fully controllable, three ways. Pick the one that fits your control surface.

### Team keys

| Key | Team |
|---|---|
| `sf` (or `0`) | Team SF |
| `kw` (or `1`) | Team KW |
| `tor` (or `2`) | Team TOR |
| `nyc` (or `3`) | Team NYC |

Counter values persist in `localStorage` — a Companion "refresh page" button doesn't wipe them.

### Method 1 — Tablet controller via relay server (recommended for live shows)

Start `obs/server.js` on the OBS machine (see Score controller setup above), then open `http://<obs-machine-ip>:3000/control.html` on any tablet or phone on the same WiFi. Big +/− buttons per team, RESET ALL, Goal field, and SHIP-BY timer controls.

Score changes flow: tablet → `POST /api/orders/bump` → server → SSE → OBS overlay. No page refresh needed. The status pill shows **LIVE** when the server is reachable.

Falls back to **BroadcastChannel** if the server is unreachable and both pages happen to be in the same browser on the same machine.

### Method 2 — Companion HTTP GET (Generic HTTP module)

Set the URL with explicit values and refresh the browser source.

```
http://your-host/obs/overlay-3-four-up.html?obs=1&sf=8&kw=6&tor=9&nyc=7
```

Optional `&max=12` to change the denominator. Pair with an OBS "Refresh browser source" action right after.

### Method 3 — Companion → OBS "Execute JavaScript on browser source" (cleanest, no reload)

Each Companion button fires one JS expression on the browser source:

```js
FFG.bump('sf', 1)      // +1 for Team SF
FFG.bump('sf', -1)     // -1 for Team SF
FFG.set('kw', 8)       // hard-set Team KW to 8
FFG.set('tor', 0)      // zero Team TOR
FFG.reset()            // zero everything
FFG.state()            // returns current state, e.g. [7,5,8,6]
```

This is what we'd recommend for a live show: one row of buttons per team for +/−, plus a RESET in a corner.

### Method 4 — postMessage (for embedding in another page)

If the overlay is in an iframe of a larger control surface:

```js
overlayIframe.contentWindow.postMessage(
  { type: 'ffg.orders', team: 'sf', delta: 1 }, '*'
);
overlayIframe.contentWindow.postMessage(
  { type: 'ffg.orders', team: 'kw', value: 8 }, '*'
);
overlayIframe.contentWindow.postMessage(
  { type: 'ffg.orders', reset: true }, '*'
);
```

---

## Customization

### Change team names / cities / handles

Edit `TEAMS` at the top of `obs/overlay-kit.js`. All three overlays read from it.

```js
window.TEAMS = [
  { name: 'Team SF',  city: 'SAN FRANCISCO',     code: 'SFO-01', user: '@team_sf'  },
  // ...
];
```

### Change the show name / banner copy

Per overlay — search for "FAIRE FULFILLMENT GAMES" in `obs/overlay-1-…html`, `overlay-2-…html`, `overlay-3-…html`.

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

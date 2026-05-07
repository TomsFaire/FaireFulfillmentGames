/* ──────────────────────────────────────────────────────────────────
   Stagetimer.io HTTP polling helper for OBS browser-source overlays.
   No dependencies. Works as a plain <script src="stagetimer.js"></script>.

   USAGE
   -----
   1) In OBS, add Browser Source pointing at one of the overlay HTML files.
   2) Append URL params:
        ?room=YOUR_ROOM_ID&key=YOUR_API_KEY
      Optional:
        &format=mmss      // m:ss (default), hms, or hhmmss
        &mode=remaining   // remaining (default) | elapsed | tod
        &poll=2000        // poll interval ms (default 2000, min 700)
        &fallback=local   // if no creds: 'local' clock (default), 'blank', or 'demo'
        &label=SHIP-BY    // override the label shown next to the time

   The script reads creds from the URL, polls /v1/get_status, and
   computes the countdown locally between polls so the displayed time
   ticks every animation frame even though we only hit the API every
   couple of seconds (well under the 100 req/min rate limit).

   Stagetimer's get_status returns { start, finish, pause, running,
   server_time } as Unix-ms. We adjust for clock drift using
   (Date.now() - server_time) so OBS machines with skewed clocks
   still show the right number.

   PUBLIC API
   ----------
   Stagetimer.init({ room, key, ... })       // optional, autoinits from URL
   Stagetimer.bind(el, { mode, format, label })  // tick a DOM node
   Stagetimer.onTick(fn)                     // raw subscription
   Stagetimer.formatMs(ms, format)           // utility

   ────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ---------- URL param parsing ----------
  function getParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      room:     p.get('room')     || p.get('room_id') || '',
      key:      p.get('key')      || p.get('api_key') || '',
      format:   p.get('format')   || 'mmss',
      mode:     p.get('mode')     || 'remaining',
      poll:     Math.max(700, parseInt(p.get('poll'), 10) || 2000),
      fallback: p.get('fallback') || 'local',
      label:    p.get('label')    || '',
    };
  }

  const cfg = getParams();

  // ---------- State ----------
  let lastStatus = null;   // last get_status payload
  let driftMs    = 0;      // local_now - server_time (subtract from Date.now)
  let lastFetch  = 0;
  let pollTimer  = null;
  let listeners  = [];
  let connected  = false;
  let lastError  = null;

  // ---------- Network ----------
  async function fetchStatus() {
    if (!cfg.room || !cfg.key) return null;
    const url = `https://api.stagetimer.io/v1/get_status?room_id=${encodeURIComponent(cfg.room)}&api_key=${encodeURIComponent(cfg.key)}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'API error');
      lastStatus = json.data;
      driftMs = Date.now() - (lastStatus.server_time || Date.now());
      lastFetch = Date.now();
      connected = true;
      lastError = null;
    } catch (err) {
      connected = false;
      lastError = err.message;
      // Don't blow away lastStatus — keep ticking from last known good
    }
    return lastStatus;
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    fetchStatus();
    pollTimer = setInterval(fetchStatus, cfg.poll);
  }

  // ---------- Time math ----------
  // Adjusted "now" — what the stagetimer server thinks the time is.
  function serverNow() {
    return Date.now() - driftMs;
  }

  function getRemainingMs() {
    if (!lastStatus || !lastStatus.finish) return null;
    if (lastStatus.running) return lastStatus.finish - serverNow();
    return lastStatus.finish - lastStatus.pause;
  }

  function getElapsedMs() {
    if (!lastStatus || !lastStatus.start) return null;
    if (lastStatus.running) return serverNow() - lastStatus.start;
    return lastStatus.pause - lastStatus.start;
  }

  // ---------- Formatting ----------
  function pad(n) { return String(Math.abs(n)).padStart(2, '0'); }

  function formatMs(ms, format) {
    if (ms === null || ms === undefined || isNaN(ms)) return '--:--';
    const neg = ms < 0;
    const abs = Math.abs(ms);
    const totalSec = Math.ceil(abs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    let out;
    switch ((format || 'mmss').toLowerCase()) {
      case 'hms':
      case 'hhmmss':
        out = `${pad(h)}:${pad(m)}:${pad(s)}`;
        break;
      case 'mmss':
      default:
        if (h > 0) out = `${pad(h)}:${pad(m)}:${pad(s)}`;
        else      out = `${pad(m)}:${pad(s)}`;
    }
    return (neg ? '-' : '') + out;
  }

  function formatTOD() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // ---------- Demo / local fallbacks ----------
  let demoStart = Date.now();
  function getDemoMs(mode) {
    const elapsed = (Date.now() - demoStart) % (10 * 60 * 1000); // loop 10 min
    return mode === 'elapsed' ? elapsed : (10 * 60 * 1000 - elapsed);
  }

  // ---------- Tick loop ----------
  let rafId = null;
  function tick() {
    let displayMs = null;
    let label = cfg.label;
    let connectedNow = connected;

    if (cfg.room && cfg.key) {
      // Live mode
      if (cfg.mode === 'elapsed')      displayMs = getElapsedMs();
      else if (cfg.mode === 'remaining') displayMs = getRemainingMs();
    } else {
      // Fallback mode
      connectedNow = false;
      if (cfg.fallback === 'blank') {
        displayMs = null;
      } else if (cfg.fallback === 'demo') {
        displayMs = getDemoMs(cfg.mode);
      }
      // 'local' is handled via formatTOD() below
    }

    let display;
    if (cfg.mode === 'tod' || (!cfg.room && cfg.fallback === 'local')) {
      display = formatTOD();
      label = label || 'TIME';
    } else {
      display = formatMs(displayMs, cfg.format);
      label = label || (cfg.mode === 'elapsed' ? 'ELAPSED' : 'SHIP-BY');
    }

    const payload = {
      display,
      label,
      ms: displayMs,
      mode: cfg.mode,
      connected: connectedNow,
      hasCredentials: !!(cfg.room && cfg.key),
      running: lastStatus ? lastStatus.running : false,
      error: lastError,
    };
    for (const fn of listeners) {
      try { fn(payload); } catch (e) { /* ignore listener errors */ }
    }
    rafId = requestAnimationFrame(tick);
  }

  // ---------- Public API ----------
  const Stagetimer = {
    config: cfg,

    init(overrides = {}) {
      if (overrides.room) cfg.room = overrides.room;
      if (overrides.key)  cfg.key  = overrides.key;
      if (cfg.room && cfg.key) startPolling();
      if (!rafId) tick();
    },

    onTick(fn) {
      listeners.push(fn);
      return () => { listeners = listeners.filter(f => f !== fn); };
    },

    /**
     * Bind a DOM element. Looks for `[data-st-time]` and `[data-st-label]`
     * inside `el`, or treats `el` itself as the time node if neither exists.
     * Also flips `[data-st-status]` between 'connected' / 'offline' / 'demo'
     * for CSS targeting.
     */
    bind(el, opts = {}) {
      if (!el) return;
      const timeNode  = el.querySelector('[data-st-time]')  || el;
      const labelNode = el.querySelector('[data-st-label]');
      const statusNode = el.querySelector('[data-st-status]') || el;
      const overrideLabel = opts.label;

      this.onTick((p) => {
        timeNode.textContent = p.display;
        if (labelNode) labelNode.textContent = overrideLabel || p.label;
        if (statusNode) {
          const s = !p.hasCredentials ? (cfg.fallback === 'demo' ? 'demo' : 'local')
                  : p.connected ? 'live' : 'offline';
          statusNode.setAttribute('data-st-status', s);
        }
      });
    },

    /* Fetch credentials from the relay server and start polling.
       Call this instead of (or after) init() when the overlay is
       served by server.js and credentials live in obs/.env. */
    initFromServer() {
      if (location.protocol === 'file:') return;
      fetch('/api/timer/config')
        .then(r => r.json())
        .then(cfg => { if (cfg.roomId && cfg.apiKey) this.init({ room: cfg.roomId, key: cfg.apiKey }); })
        .catch(() => {});
    },

    formatMs,
    formatTOD,
  };

  window.Stagetimer = Stagetimer;
  // Auto-init on load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Stagetimer.init());
  } else {
    Stagetimer.init();
  }
})();

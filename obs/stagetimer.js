/* ──────────────────────────────────────────────────────────────────
   Stagetimer.io HTTP polling helper for OBS browser-source overlays.
   No dependencies. Works as a plain <script src="stagetimer.js"></script>.

   USAGE
   -----
   1) In OBS, add Browser Source pointing at one of the overlay HTML files.
   2) The overlay calls Stagetimer.initFromServer() — credentials come from
      obs/.env via the relay server, so nothing goes in the URL.

   Optional URL params (mostly for debug / standalone use):
     &format=mmss      // m:ss (default), hms, or hhmmss
     &mode=auto        // auto (default) | remaining | elapsed | tod
                       //   auto = follows whatever mode Stagetimer UI is set to
     &poll=2000        // poll interval ms (default 2000, min 700)
     &fallback=local   // if no creds: 'local' clock (default), 'blank', or 'demo'
     &label=SHIP-BY    // override the label shown next to the time
     &ms=1             // show tenths of a second (e.g. 02:30.4)

   PUBLIC API
   ----------
   Stagetimer.init({ room, key, timerId, showMs, ... })
   Stagetimer.bind(el, { mode, format, label })   // tick a DOM node
   Stagetimer.onTick(fn)                          // raw subscription
   Stagetimer.formatMs(ms, format, showMs)        // utility
   Stagetimer.updateSettings({ timerId, showMs }) // live update from control UI
   Stagetimer.initFromServer()                    // fetch creds + settings from relay

   COUNT UP / COUNT DOWN
   ─────────────────────
   In 'auto' mode (the default) the script reads the timer's direction
   directly from the Stagetimer API response:
     • count_up field (boolean) when present
     • Falls back to: if finish ≈ start (within 2 s) → count up, else countdown
   Switch the mode in the Stagetimer web UI and this clock follows automatically
   within one poll interval (~2 s) — no URL changes needed.

   ────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ---------- URL param parsing ----------
  function getParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      room:     p.get('room')     || p.get('room_id') || '',
      key:      p.get('key')      || p.get('api_key') || '',
      timerId:  p.get('timerId')  || p.get('timer_id') || '',
      format:   p.get('format')   || 'mmss',
      mode:     p.get('mode')     || 'auto',
      poll:     Math.max(700, parseInt(p.get('poll'), 10) || 2000),
      fallback: p.get('fallback') || 'local',
      label:    p.get('label')    || '',
      showMs:   p.get('ms') === '1' || p.get('showMs') === '1',
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
    let url = `https://api.stagetimer.io/v1/get_status?room_id=${encodeURIComponent(cfg.room)}&api_key=${encodeURIComponent(cfg.key)}`;
    if (cfg.timerId) url += `&timer_id=${encodeURIComponent(cfg.timerId)}`;
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

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
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
    return (lastStatus.pause || serverNow()) - lastStatus.start;
  }

  // ---------- Auto mode: detect count-up vs countdown from API response ----------
  //  Stagetimer API returns `count_up: boolean` when available.
  //  Fallback: if finish == start (or within 2 s), the timer has no defined end
  //  → treat it as a count-up timer.
  function isCountUp() {
    if (!lastStatus) return false;
    if (typeof lastStatus.count_up === 'boolean') return lastStatus.count_up;
    // Infer from timestamps
    if (!lastStatus.finish || !lastStatus.start) return false;
    return Math.abs(lastStatus.finish - lastStatus.start) < 2000;
  }

  function getAutoMs() {
    return isCountUp() ? getElapsedMs() : getRemainingMs();
  }

  // ---------- Formatting ----------
  function pad(n) { return String(Math.abs(n)).padStart(2, '0'); }

  /**
   * Format a millisecond value as a human-readable clock string.
   * @param {number|null} ms
   * @param {string} format  'mmss' | 'hms' | 'hhmmss'
   * @param {boolean} showMs  append tenths of a second (.t)
   */
  function formatMs(ms, format, showMs) {
    if (ms === null || ms === undefined || isNaN(ms)) return '--:--';
    const neg = ms < 0;
    const abs = Math.abs(ms);
    // When showing sub-seconds, floor (not ceil) so the digit doesn't jump ahead
    const totalSec = showMs ? Math.floor(abs / 1000) : Math.ceil(abs / 1000);
    const tenths   = showMs ? Math.floor((abs % 1000) / 100) : null;
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
        else       out = `${pad(m)}:${pad(s)}`;
    }
    if (showMs) out += '.' + tenths;
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

    const effectiveMode = cfg.mode === 'auto'
      ? (isCountUp() ? 'elapsed' : 'remaining')
      : cfg.mode;

    if (cfg.room && cfg.key) {
      // Live mode
      if (effectiveMode === 'elapsed')    displayMs = getElapsedMs();
      else if (effectiveMode === 'remaining') displayMs = getRemainingMs();
    } else {
      // Fallback mode
      connectedNow = false;
      if (cfg.fallback === 'blank') {
        displayMs = null;
      } else if (cfg.fallback === 'demo') {
        displayMs = getDemoMs(effectiveMode);
      }
      // 'local' is handled via formatTOD() below
    }

    let display;
    if (effectiveMode === 'tod' || (!cfg.room && cfg.fallback === 'local')) {
      display = formatTOD();
      label = label || 'TIME';
    } else {
      display = formatMs(displayMs, cfg.format, cfg.showMs);
      if (!label) {
        label = effectiveMode === 'elapsed' ? 'ELAPSED' : 'SHIP-BY';
      }
    }

    const payload = {
      display,
      label,
      ms: displayMs,
      mode: effectiveMode,
      countUp: isCountUp(),
      connected: connectedNow,
      hasCredentials: !!(cfg.room && cfg.key),
      running: lastStatus ? lastStatus.running : false,
      error: lastError,
      raw: lastStatus,
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
      if (overrides.room)    cfg.room    = overrides.room;
      if (overrides.key)     cfg.key     = overrides.key;
      if (overrides.timerId !== undefined) cfg.timerId = overrides.timerId;
      if (overrides.showMs  !== undefined) cfg.showMs  = !!overrides.showMs;
      if (overrides.mode    !== undefined) cfg.mode    = overrides.mode;
      if (cfg.room && cfg.key) startPolling();
      if (!rafId) tick();
    },

    /**
     * Update timer settings live — called when control.html changes
     * the selected timer or milliseconds toggle.
     */
    updateSettings({ timerId, showMs } = {}) {
      let restart = false;
      if (timerId !== undefined && timerId !== cfg.timerId) {
        cfg.timerId = timerId;
        restart = true;
      }
      if (showMs !== undefined) cfg.showMs = !!showMs;
      if (restart && cfg.room && cfg.key) startPolling();
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
      const timeNode   = el.querySelector('[data-st-time]')   || el;
      const labelNode  = el.querySelector('[data-st-label]');
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

    /**
     * Fetch credentials AND settings from the relay server, then start polling.
     * Call this instead of (or after) init() when the overlay is served by
     * server.js and credentials live in obs/.env.
     */
    initFromServer() {
      if (location.protocol === 'file:') return;
      fetch('/api/timer/config')
        .then(r => r.json())
        .then(d => {
          if (d.roomId && d.apiKey) {
            this.init({
              room:    d.roomId,
              key:     d.apiKey,
              timerId: d.timerSettings ? (d.timerSettings.timerId || d.timerId || '') : (d.timerId || ''),
              showMs:  d.timerSettings ? !!d.timerSettings.showMs : false,
            });
          }
        })
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

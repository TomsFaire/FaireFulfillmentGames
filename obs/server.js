#!/usr/bin/env node
'use strict';
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── .env parser (no dotenv dependency) ───────────────────────
function loadEnv(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').reduce((acc, line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return acc;
      const eq = t.indexOf('=');
      if (eq < 0) return acc;
      acc[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
      return acc;
    }, {});
  } catch { return {}; }
}

const ENV  = loadEnv(path.join(__dirname, '.env'));
const PORT = +(process.env.PORT || 3000);
const DIR  = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
};

// Safely read a POST body. Calls cb(raw) on success, silently drops on error.
function readBody(req, maxLen, cb) {
  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > maxLen) req.socket.destroy(); });
  req.on('end', () => cb(raw));
  req.on('error', () => {}); // prevent unhandled 'error' crash on connection drop
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ── Score state ───────────────────────────────────────────────
const KEYS = ['t0', 't1', 't2', 't3'];
let state     = [0, 0, 0, 0];
let maxOrders = 10;

// ── Team / H2H config ─────────────────────────────────────────
let teams = [
  { name: 'Team 1', city: 'CITY 1', code: 'T1', user: '' },
  { name: 'Team 2', city: 'CITY 2', code: 'T2', user: '' },
  { name: 'Team 3', city: 'CITY 3', code: 'T3', user: '' },
  { name: 'Team 4', city: 'CITY 4', code: 'T4', user: '' },
];
let h2h = { a: { left: 0, right: 1 }, b: { left: 2, right: 3 } };

// ── SSE clients ───────────────────────────────────────────────
let clients = [];

function broadcast(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  clients = clients.filter(r => {
    try { r.write(line); return true; } catch { return false; }
  });
}

// ── Timer settings (persist in memory; not written to .env) ──
let timerSettings = {
  timerId: ENV.STAGETIMER_TIMER_ID || '',
  showMs:  false,
};

// ── Stagetimer proxy helpers ──────────────────────────────────
// Control API uses GET: /v1/{action}?room_id=...&api_key=...
function stagetimerGet(stPath, callback) {
  const req = https.request(
    { hostname: 'api.stagetimer.io', path: stPath, method: 'GET' },
    (res) => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => callback(null, res.statusCode, body));
    }
  );
  req.setTimeout(10000, () => { req.destroy(new Error('stagetimer timeout')); });
  req.on('error', callback);
  req.end();
}

function stagetimerPost(action, callback) {
  const { STAGETIMER_ROOM_ID, STAGETIMER_API_KEY } = ENV;
  if (!STAGETIMER_ROOM_ID || !STAGETIMER_API_KEY) {
    return callback(new Error('timer not configured — add STAGETIMER_ROOM_ID and STAGETIMER_API_KEY to obs/.env'));
  }
  let stPath = `/v1/${action}?room_id=${encodeURIComponent(STAGETIMER_ROOM_ID)}&api_key=${encodeURIComponent(STAGETIMER_API_KEY)}`;
  if (timerSettings.timerId) stPath += `&timer_id=${encodeURIComponent(timerSettings.timerId)}`;
  stagetimerGet(stPath, callback);
}

// ── HTTP server ───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  // ── SSE ──────────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    clients.push(res);
    // Send full state snapshot on connect so overlay syncs immediately
    res.write(`data: ${JSON.stringify({ type: 'ffg.orders.state', state: state.slice(), max: maxOrders })}\n\n`);
    // NOTE: do NOT send ffg.teams or ffg.h2h here — overlays call location.reload()
    // on those messages, which would cause an infinite reload loop on every SSE connect.
    // Teams/H2H are read from localStorage (set by overlay-kit.js defaults or prior saves).
    // They are only broadcast when actively changed via /api/teams or /api/h2h.
    res.write(`data: ${JSON.stringify({ type: 'ffg.timer.settings', timerSettings })}\n\n`);
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch {
        clearInterval(ping);
        clients = clients.filter(c => c !== res);
      }
    }, 15000);
    req.on('close', () => {
      clearInterval(ping);
      clients = clients.filter(c => c !== res);
    });
    return;
  }

  // ── Timer config ─────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/timer/config') {
    const configured = !!(ENV.STAGETIMER_ROOM_ID && ENV.STAGETIMER_API_KEY);
    return json(res, 200, {
      ok: true, configured,
      roomId:  ENV.STAGETIMER_ROOM_ID  || '',
      apiKey:  ENV.STAGETIMER_API_KEY  || '',
      timerId: timerSettings.timerId,
      state: state.slice(), max: maxOrders,
      teams, h2h,
      timerSettings,
    });
  }

  // ── Teams API ────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/teams') {
    return json(res, 200, { ok: true, teams, h2h });
  }

  if (req.method === 'POST' && url.pathname === '/api/teams') {
    readBody(req, 65536, raw => {
      let data = {};
      try { data = JSON.parse(raw); } catch { /* ignore */ }
      if (Array.isArray(data.teams) && data.teams.length === 4) {
        teams = data.teams.map(t => ({
          name: String(t.name || '').slice(0, 64),
          city: String(t.city || '').slice(0, 64),
          code: String(t.code || '').slice(0, 8),
          user: String(t.user || '').slice(0, 64),
        }));
        broadcast({ type: 'ffg.teams', teams });
      }
      json(res, 200, { ok: true, teams });
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/h2h') {
    readBody(req, 65536, raw => {
      let data = {};
      try { data = JSON.parse(raw); } catch { /* ignore */ }
      if (data.h2h && data.h2h.a && data.h2h.b) {
        const clampIdx = v => Math.max(0, Math.min(3, +v || 0));
        h2h = {
          a: { left: clampIdx(data.h2h.a.left), right: clampIdx(data.h2h.a.right) },
          b: { left: clampIdx(data.h2h.b.left), right: clampIdx(data.h2h.b.right) },
        };
        broadcast({ type: 'ffg.h2h', h2h });
      }
      json(res, 200, { ok: true, h2h });
    });
    return;
  }

  // ── Timer list (proxy Stagetimer room timers) ────────────────
  if (req.method === 'GET' && url.pathname === '/api/timer/list') {
    const { STAGETIMER_ROOM_ID, STAGETIMER_API_KEY } = ENV;
    if (!STAGETIMER_ROOM_ID || !STAGETIMER_API_KEY) {
      return json(res, 200, { ok: true, timers: [], configured: false });
    }
    const stPath = `/v1/rooms/${encodeURIComponent(STAGETIMER_ROOM_ID)}/timers?api_key=${encodeURIComponent(STAGETIMER_API_KEY)}`;
    stagetimerGet(stPath, (err, status, body) => {
      if (err) return json(res, 503, { ok: false, error: err.message });
      try {
        const parsed = JSON.parse(body);
        json(res, 200, { ok: true, timers: parsed.data || parsed.timers || [] });
      } catch {
        json(res, 502, { ok: false, error: 'bad upstream response' });
      }
    });
    return;
  }

  // ── Timer settings (timerId + showMs) ────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/timer/settings') {
    readBody(req, 4096, raw => {
      let data = {};
      try { data = JSON.parse(raw); } catch { /* ignore */ }
      if (typeof data.timerId === 'string') timerSettings.timerId = data.timerId.trim().slice(0, 128);
      if (typeof data.showMs  === 'boolean') timerSettings.showMs = data.showMs;
      broadcast({ type: 'ffg.timer.settings', timerSettings });
      json(res, 200, { ok: true, timerSettings });
    });
    return;
  }

  // ── Timer control (start / stop / reset) ─────────────────────
  if (req.method === 'POST' && url.pathname.startsWith('/api/timer/')) {
    const action = url.pathname.split('/').pop();
    if (!['start', 'stop', 'reset'].includes(action)) {
      return json(res, 400, { ok: false, error: 'unknown timer action' });
    }
    // Respond immediately so the control surface feels instant; Stagetimer
    // round-trips can take 1–4 s and the result is visible on-screen anyway.
    const { STAGETIMER_ROOM_ID, STAGETIMER_API_KEY } = ENV;
    if (!STAGETIMER_ROOM_ID || !STAGETIMER_API_KEY) {
      return json(res, 503, { ok: false, error: 'timer not configured — add STAGETIMER_ROOM_ID and STAGETIMER_API_KEY to obs/.env' });
    }
    json(res, 200, { ok: true });
    // Fire-and-forget — log errors to console but don't block the client
    stagetimerPost(action, (err, status, body) => {
      if (err) { console.error('[timer]', action, err.message); return; }
      if (status >= 300) {
        let errMsg = 'status ' + status;
        try { const p = JSON.parse(body); errMsg = p.message || p.error || errMsg; } catch (_) {}
        console.error('[timer]', action, errMsg);
      }
    });
    return;
  }

  // ── Orders API ───────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname.startsWith('/api/orders/')) {
    readBody(req, 65536, raw => {
      let data = {};
      try { data = JSON.parse(raw); } catch { /* ignore */ }
      const action = url.pathname.split('/').pop();

      if (action === 'bump') {
        // Accept numeric index (0-3) or key string 't0'–'t3'
        let i = -1;
        if (typeof data.team === 'number') i = data.team;
        else i = KEYS.indexOf((data.team || '').toLowerCase());
        if (i < 0 || i > 3) return json(res, 400, { ok: false, error: 'unknown team' });
        state[i] = Math.max(0, Math.min(maxOrders, state[i] + (+(data.delta) || 0)));
        broadcast({ type: 'ffg.orders', team: i, value: state[i] });
        return json(res, 200, { ok: true, state: state.slice() });
      }

      if (action === 'reset') {
        state = [0, 0, 0, 0];
        broadcast({ type: 'ffg.orders', reset: true });
        broadcast({ type: 'ffg.orders.state', state: state.slice(), max: maxOrders });
        return json(res, 200, { ok: true });
      }

      if (action === 'max') {
        maxOrders = Math.max(1, +(data.max) || 10);
        broadcast({ type: 'ffg.orders.state', state: state.slice(), max: maxOrders });
        return json(res, 200, { ok: true });
      }

      json(res, 404, { ok: false, error: 'not found' });
    });
    return;
  }

  // ── Static files ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const rel     = url.pathname === '/' ? '/control.html' : url.pathname;
    const absPath = path.join(DIR, rel);
    // Prevent path traversal outside obs/
    if (!absPath.startsWith(DIR + path.sep) && absPath !== DIR) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.readFile(absPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext  = path.extname(absPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }

  res.writeHead(405); res.end('Method not allowed');
});

server.on('error', err => console.error('[server error]', err.message));

server.listen(PORT, () => {
  const configured = !!(ENV.STAGETIMER_ROOM_ID && ENV.STAGETIMER_API_KEY);
  console.log(`FFG server  →  http://localhost:${PORT}`);
  console.log(`Tablet URL  →  http://<this-machine-ip>:${PORT}/control.html`);
  console.log(`Stagetimer  →  ${configured ? 'configured ✓' : 'NOT configured (add obs/.env)'}`);
});

process.on('uncaughtException',   err => console.error('[uncaught]', err));
process.on('unhandledRejection',  err => console.error('[unhandled rejection]', err));

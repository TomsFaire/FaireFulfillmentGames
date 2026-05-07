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
};

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
const KEYS = ['sf', 'kw', 'tor', 'nyc'];
let state     = [0, 0, 0, 0];
let maxOrders = 10;

// ── SSE clients ───────────────────────────────────────────────
let clients = [];

function broadcast(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  clients = clients.filter(r => {
    try { r.write(line); return true; } catch { return false; }
  });
}

// ── Stagetimer proxy helper ───────────────────────────────────
function stagetimerPost(action, callback) {
  const { STAGETIMER_ROOM_ID, STAGETIMER_TIMER_ID, STAGETIMER_API_KEY } = ENV;
  if (!STAGETIMER_ROOM_ID || !STAGETIMER_TIMER_ID || !STAGETIMER_API_KEY) {
    return callback(new Error('timer not configured'));
  }
  // ⚠ Verify exact endpoint path against https://stagetimer.io/docs/api/ before the show.
  // The pattern below follows the documented v1 REST API; adjust if paths differ.
  const stPath = `/v1/rooms/${STAGETIMER_ROOM_ID}/timers/${STAGETIMER_TIMER_ID}/${action}` +
                 `?api_key=${encodeURIComponent(STAGETIMER_API_KEY)}`;
  const req = https.request(
    { hostname: 'api.stagetimer.io', path: stPath, method: 'POST',
      headers: { 'Content-Length': '0', 'Content-Type': 'application/json' } },
    (res) => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => callback(null, res.statusCode, body));
    }
  );
  req.on('error', callback);
  req.end();
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
    const configured = !!(ENV.STAGETIMER_ROOM_ID && ENV.STAGETIMER_TIMER_ID && ENV.STAGETIMER_API_KEY);
    return json(res, 200, {
      ok: true, configured,
      roomId: ENV.STAGETIMER_ROOM_ID  || '',
      apiKey: ENV.STAGETIMER_API_KEY  || '',
      timerId: ENV.STAGETIMER_TIMER_ID || '',
      state: state.slice(), max: maxOrders,
    });
  }

  // ── Timer proxy ──────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname.startsWith('/api/timer/')) {
    const action = url.pathname.split('/').pop();
    if (!['start', 'stop', 'reset'].includes(action)) {
      return json(res, 400, { ok: false, error: 'unknown timer action' });
    }
    stagetimerPost(action, (err, status, body) => {
      if (err) return json(res, 503, { ok: false, error: err.message });
      json(res, status < 300 ? 200 : 502, { ok: status < 300, upstream: body });
    });
    return;
  }

  // ── Orders API ───────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname.startsWith('/api/orders/')) {
    let raw = '';
    req.on('data', d => {
      raw += d;
      if (raw.length > 65536) { req.socket.destroy(); }
    });
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(raw); } catch { /* ignore */ }
      const action = url.pathname.split('/').pop();

      if (action === 'bump') {
        const i = KEYS.indexOf((data.team || '').toLowerCase());
        if (i < 0) return json(res, 400, { ok: false, error: 'unknown team' });
        state[i] = Math.max(0, Math.min(maxOrders, state[i] + (+(data.delta) || 0)));
        broadcast({ type: 'ffg.orders', team: data.team, value: state[i] });
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

  // ── Static files ─────────────────────────────────────────────
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

server.listen(PORT, () => {
  const configured = !!(ENV.STAGETIMER_ROOM_ID && ENV.STAGETIMER_TIMER_ID && ENV.STAGETIMER_API_KEY);
  console.log(`FFG server  →  http://localhost:${PORT}`);
  console.log(`Tablet URL  →  http://<this-machine-ip>:${PORT}/control.html`);
  console.log(`Stagetimer  →  ${configured ? 'configured ✓' : 'NOT configured (add obs/.env)'}`);
});

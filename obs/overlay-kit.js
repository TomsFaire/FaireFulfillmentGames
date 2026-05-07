/* Shared markup helpers for the standalone OBS overlays.
   Vanilla JS — no React, no build step. Each overlay HTML file calls
   the helpers it needs after DOMContentLoaded.

   The TEAMS array is the single source of truth across all three files. */

window.TEAMS = [
  { name: 'Team SF',  city: 'SAN FRANCISCO',     code: 'SFO-01', user: '@team_sf'  },
  { name: 'Team KW',  city: 'KITCHENER-WATERLOO', code: 'YKF-02', user: '@team_kw'  },
  { name: 'Team TOR', city: 'TORONTO',           code: 'YYZ-03', user: '@team_tor' },
  { name: 'Team NYC', city: 'NEW YORK',          code: 'JFK-04', user: '@team_nyc' },
];

(function () {
  'use strict';

  function el(tag, opts = {}, children = []) {
    const n = document.createElement(tag);
    if (opts.cls)   n.className = opts.cls;
    if (opts.style) Object.assign(n.style, opts.style);
    if (opts.attrs) for (const k in opts.attrs) n.setAttribute(k, opts.attrs[k]);
    if (opts.text !== undefined) n.textContent = opts.text;
    if (opts.html !== undefined) n.innerHTML = opts.html;
    for (const c of children) if (c) n.appendChild(c);
    return n;
  }

  /* Build a cardboard frame with cam cutout + bottom shipping label.
     opts: { width, height, top, side, bottom, title, sub, tape, corner, resW, resH, resLabel, placeholderLabel } */
  function makeFrame(opts) {
    const o = Object.assign({
      top: 36, side: 24, bottom: 140,
      tape: null, corner: null,
      resLabel: 'CAM',
      placeholderLabel: 'CAM',
    }, opts);

    const frame = el('div', {
      cls: 'frame cardboard',
      style: {
        width:  typeof o.width  === 'number' ? o.width  + 'px' : o.width,
        height: typeof o.height === 'number' ? o.height + 'px' : o.height,
      },
    });

    // Corner creases
    ['tl','tr','bl','br'].forEach(p => frame.appendChild(el('div', { cls: 'corner-crease ' + p })));

    // Tape
    if (o.tape === 'tr' || o.tape === 'both') frame.appendChild(el('div', { cls: 'tape tr' }));
    if (o.tape === 'bl' || o.tape === 'both') frame.appendChild(el('div', { cls: 'tape bl' }));

    // Corner label
    if (o.corner) frame.appendChild(el('div', { cls: 'corner-label', text: o.corner }));

    // Cam cutout
    const cam = el('div', {
      cls: 'cam',
      style: {
        top:    o.top + 'px',
        left:   o.side + 'px',
        right:  o.side + 'px',
        bottom: o.bottom + 'px',
      },
    });

    // Placeholder content (hidden in body.obs)
    const ph = el('div', { cls: 'cam-placeholder' });
    ph.appendChild(el('div', { cls: 'icon' }));
    ph.appendChild(el('div', { text: o.placeholderLabel }));
    if (o.resW && o.resH) ph.appendChild(el('div', { cls: 'sub', text: `crop to ${o.resW} × ${o.resH}` }));
    cam.appendChild(ph);

    // Resolution chip (hidden in body.obs)
    if (o.resW && o.resH) {
      const chip = el('div', { cls: 'res-chip', style: { top: '8px', left: '8px' } });
      chip.appendChild(el('span', { cls: 'lab', text: o.resLabel }));
      chip.appendChild(el('span', { cls: 'dim', text: `${o.resW} × ${o.resH}` }));
      chip.appendChild(el('span', { cls: 'ar',  text: '16:9' }));
      cam.appendChild(chip);
    }
    frame.appendChild(cam);

    // Bottom shipping label
    if (o.title || o.sub) {
      const labelH = o.bottom - 48;
      const banner = el('div', {
        cls: 'label-banner',
        style: {
          left:   o.side + 'px',
          right:  o.side + 'px',
          bottom: '24px',
          height: labelH + 'px',
        },
      });

      // Barcode
      const bc = el('div', { cls: 'barcode' });
      [2,1,3,1,2,1,1,3,1,2,1,2,1,3,1,1,2,1,3,1,2,1].forEach(w => {
        bc.appendChild(el('i', { style: { width: w + 'px' } }));
      });
      banner.appendChild(bc);

      // Text block
      const tx = el('div', { style: { flex: '1', minWidth: '0' } });
      const titleSize = Math.min(labelH - 28, 32);
      tx.appendChild(el('div', { cls: 'label-title', style: { fontSize: titleSize + 'px' }, text: o.title || '' }));
      if (o.sub) tx.appendChild(el('div', { cls: 'label-sub', text: o.sub }));
      banner.appendChild(tx);

      // Fragile mini-stamp
      const fs = el('div', {
        cls: 'stamp',
        style: {
          padding: '3px 7px', borderWidth: '1.5px', borderRadius: '2px',
          transform: 'rotate(-4deg)', opacity: '0.85',
        },
      });
      const fsTop = el('div', { style: { fontSize: '9px', letterSpacing: '0.2em', fontWeight: '700' }, text: 'HANDLE WITH CARE' });
      fs.appendChild(fsTop);
      banner.appendChild(fs);

      frame.appendChild(banner);
    }

    return frame;
  }

  /* Title banner across the top of the stage. */
  function makeTitleBanner(primary, secondary, stampVariant) {
    const tb = el('div', { cls: 'title-banner paper' });
    ['tl','tr','bl','br'].forEach(p => tb.appendChild(el('div', { cls: 'corner-dot ' + p })));

    // Left mark
    const left = el('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } });
    left.appendChild(el('div', { cls: 'f-mark', text: 'F' }));
    const txt = el('div', { style: { display: 'flex', flexDirection: 'column' } });
    txt.appendChild(el('div', { cls: 'from-mark', text: 'FROM · FAIRE · WAREHOUSE' }));
    txt.appendChild(el('div', { cls: 'from-sub',  text: 'SHIPMENT №2026-FFG-001' }));
    left.appendChild(txt);
    tb.appendChild(left);

    // Center
    const ct = el('div', { cls: 'center-title' });
    ct.appendChild(el('div', { cls: 'primary', text: primary || 'FAIRE FULFILLMENT GAMES' }));
    ct.appendChild(el('div', { cls: 'secondary', text: secondary || '2026 · PICK · PACK · SHIP' }));
    tb.appendChild(ct);

    // Stamp
    tb.appendChild(makeStamp(stampVariant || 'fragile', 4));
    return tb;
  }

  function makeStamp(variant, rotate, size) {
    const variants = {
      fragile:  { top: '· STAMP ·',    main: 'FRAGILE',     cls: '' },
      ground:   { top: '· SHIP VIA ·', main: 'GROUND ONLY', cls: 'ground' },
      priority: { top: '· SERVICE ·',  main: 'PRIORITY',    cls: '' },
    };
    const v = variants[variant] || variants.fragile;
    const cls = 'stamp ' + (v.cls) + (size === 'sm' ? ' sm' : '');
    const s = el('div', { cls, style: { transform: `rotate(${rotate || 4}deg)` } });
    s.appendChild(el('div', { cls: 'top',  text: v.top }));
    s.appendChild(el('div', { cls: 'main', text: v.main }));
    return s;
  }

  /* Live Stagetimer chip — pairs with stagetimer.js + bind() */
  function makeTimerChip(label) {
    const chip = el('div', { cls: 'timer-chip', attrs: { 'data-st-status': 'local' } });
    chip.appendChild(el('div', { cls: 'label', attrs: { 'data-st-label': '' }, text: label || 'SHIP-BY' }));
    chip.appendChild(el('div', { cls: 'time',  attrs: { 'data-st-time':  '' }, text: '--:--' }));
    return chip;
  }

  /* Auto-scale the .stage element to the viewport (preserves 16:9). */
  function autoScale() {
    const stage = document.querySelector('.stage');
    if (!stage) return;
    function fit() {
      const sx = window.innerWidth  / 1920;
      const sy = window.innerHeight / 1080;
      const s = Math.min(sx, sy);
      stage.style.transform = `scale(${s})`;
      // center
      const left = (window.innerWidth  - 1920 * s) / 2;
      const top  = (window.innerHeight - 1080 * s) / 2;
      stage.style.left = left + 'px';
      stage.style.top  = top + 'px';
      stage.style.position = 'absolute';
    }
    fit();
    window.addEventListener('resize', fit);
  }

  /* OBS mode toggle.
     ?obs=1      → transparent cam windows (composite in OBS)
     ?obs=green  → #00ff00 cam windows (key in hardware switcher) */
  function applyObsMode() {
    const p = new URLSearchParams(window.location.search);
    const obs = p.get('obs');
    if (obs === '1' || obs === 'true' || p.get('preview') === '0') {
      document.body.classList.add('obs');
    } else if (obs === 'green') {
      document.body.classList.add('obs-green');
    }
  }

  window.OverlayKit = {
    el, makeFrame, makeTitleBanner, makeStamp, makeTimerChip, autoScale, applyObsMode,
  };
})();

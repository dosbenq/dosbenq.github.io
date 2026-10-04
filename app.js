/* app.js: the drive. Builds the route from the stop pins, moves the car (a
   plane over the ocean) with scroll, blends the sky from dawn to sunrise,
   draws the city maps and keeps the HUD in sync. */
'use strict';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
};

/* ============ SKY THEMES ============ */
// sun position is in fractions of the viewport; stars is an opacity
const SKIES = {
  dawn:    { label: 'Dawn',        top: '#241d45', bottom: '#a8586a', core: '#ffe2a8', glow: '#ff8a5c', sx: .80, sy: .95, sun: .85, stars: .25 },
  day:     { label: 'Midday',      top: '#6fa8dc', bottom: '#dcebf5', core: '#fffbe6', glow: '#ffe7a3', sx: .84, sy: .12, sun: .90, stars: 0 },
  golden:  { label: 'Golden hour', top: '#e9a964', bottom: '#f8e2bf', core: '#fff1c9', glow: '#ffb35c', sx: .86, sy: .62, sun: .90, stars: 0 },
  dusk:    { label: 'Dusk',        top: '#2a2150', bottom: '#b8506a', core: '#ffcf9a', glow: '#ff6b57', sx: .14, sy: 1.0, sun: .70, stars: .35 },
  night:   { label: 'Night',       top: '#070c18', bottom: '#16223d', core: '#f2f4ff', glow: '#8aa4d6', sx: .80, sy: .18, sun: .30, stars: 1 },
  sunrise: { label: 'Sunrise',     top: '#2c3566', bottom: '#f6b27a', core: '#fff1c2', glow: '#ff9a5a', sx: .50, sy: .98, sun: .95, stars: .1 },
};

/* ============ ROUTE + CAR + HUD + SKY ============ */
(function () {
  const drive = document.getElementById('drive');
  const svg = document.getElementById('route');
  const planned = document.getElementById('route-planned');
  const casing = document.getElementById('route-casing');
  const driven = document.getElementById('route-driven');
  const car = document.getElementById('car');
  const carShape = document.getElementById('car-shape');
  const planeShape = document.getElementById('plane-shape');
  const hud = document.querySelector('.hud-top');
  const hudDist = document.getElementById('hud-dist');
  const hudManeuver = document.getElementById('hud-maneuver');
  const hudArrow = document.getElementById('hud-arrow');
  const odo = document.getElementById('odo');
  const skyLabel = document.getElementById('sky-label');
  const horizon = document.getElementById('horizon-list');
  const sky = document.getElementById('sky');
  const sun = document.getElementById('sun');
  const stars = document.getElementById('stars');

  const allStops = [...document.querySelectorAll('.stop')];
  const hudStops = allStops.filter(s => !s.classList.contains('hero'));
  const flightIdx = allStops.findIndex(s => s.id === 'flight');
  const dukeIdx = allStops.findIndex(s => s.id === 'duke');
  let pts = [];          // pin centre per stop, in drive coordinates
  let bands = [];        // top/bottom of each stop, in drive coordinates
  let totalLen = 0;
  let shownLen = 0;
  let lastKey = '';

  function measure() {
    const box = drive.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    pts = allStops.map(stop => {
      const r = stop.querySelector('.stop__pin').getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    });
    bands = allStops.map(stop => {
      const r = stop.getBoundingClientRect();
      return { top: r.top - box.top, bottom: r.bottom - box.top };
    });
    const narrow = window.innerWidth <= 860;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dy = b.y - a.y;
      let bendA = narrow ? (i % 2 ? 14 : -14) : 0;
      let bendB = -bendA;
      if (i === dukeIdx && i - 1 === flightIdx) { // the flight sweeps wide across the sky
        bendA = bendB = narrow ? 60 : box.width * 0.34;
      }
      d += ` C ${a.x + bendA} ${a.y + dy * 0.5} ${b.x + bendB} ${b.y - dy * 0.5} ${b.x} ${b.y}`;
    }
    [planned, casing, driven].forEach(p => p.setAttribute('d', d));
    totalLen = driven.getTotalLength();
    driven.style.strokeDasharray = casing.style.strokeDasharray = `${totalLen} ${totalLen}`;
    update(true);
  }

  // y along the path only increases, so binary search for the length at a given y
  function lengthAtY(y) {
    if (y <= pts[0].y) return 0;
    if (y >= pts[pts.length - 1].y) return totalLen;
    let lo = 0, hi = totalLen;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (driven.getPointAtLength(mid).y < y) lo = mid; else hi = mid;
    }
    return lo;
  }

  const carY = () => window.innerHeight * 0.55 - drive.getBoundingClientRect().top;

  function fmtDist(px) {
    const m = Math.max(0, Math.round(px / 10) * 10); // 1px = 1m on this map
    return m >= 1000 ? `In ${(m / 1000).toFixed(1)} km` : `In ${m} m`;
  }
  function fmtYear(y) {
    const year = Math.floor(y);
    return `${MONTHS[Math.min(11, Math.floor((y - year) * 12))]} ${year}`;
  }

  /* --- sky: hold each stop's sky, blend across the boundaries --- */
  function paintSky() {
    const y = window.innerHeight * 0.5 - drive.getBoundingClientRect().top;
    const band = window.innerHeight * 0.35;
    let i = bands.findIndex(b => y < b.bottom);
    if (i === -1) i = bands.length - 1;
    let a = i, b = i, w = 0;
    if (i > 0 && y - bands[i].top < band) { a = i - 1; b = i; w = 0.5 + (y - bands[i].top) / (2 * band); }
    else if (i < bands.length - 1 && bands[i].bottom - y < band) { a = i; b = i + 1; w = 0.5 - (bands[i].bottom - y) / (2 * band); }
    w = smooth(clamp(w));
    const A = SKIES[allStops[a].dataset.sky], B = SKIES[allStops[b].dataset.sky];
    sky.style.setProperty('--sky-top', mixHex(A.top, B.top, w));
    sky.style.setProperty('--sky-bottom', mixHex(A.bottom, B.bottom, w));
    sky.style.setProperty('--sun-core', mixHex(A.core, B.core, w));
    sky.style.setProperty('--sun-glow', mixHex(A.glow, B.glow, w));
    sun.style.transform = `translate(${lerp(A.sx, B.sx, w) * window.innerWidth}px, ${lerp(A.sy, B.sy, w) * window.innerHeight}px) translate(-50%, -50%)`;
    sun.style.opacity = lerp(A.sun, B.sun, w);
    stars.style.opacity = lerp(A.stars, B.stars, w);
    skyLabel.textContent = (w < 0.5 ? A : B).label;
  }

  function updateHud(y) {
    const pos = clamp(y, pts[0].y, pts[pts.length - 1].y);
    let nextIdx = -1;
    allStops.forEach((stop, i) => {
      const reached = pos >= pts[i].y - 2;
      stop.classList.toggle('is-reached', reached);
      if (!reached && nextIdx === -1 && i > 0) nextIdx = i;
    });

    let year = parseFloat(allStops[0].dataset.year);
    for (let i = 1; i < pts.length; i++) {
      if (pos <= pts[i].y) {
        const a = parseFloat(allStops[i - 1].dataset.year), b = parseFloat(allStops[i].dataset.year);
        year = a + (b - a) * (pos - pts[i - 1].y) / Math.max(1, pts[i].y - pts[i - 1].y);
        break;
      }
      year = parseFloat(allStops[i].dataset.year);
    }
    odo.textContent = fmtYear(year);

    const key = nextIdx + ':' + Math.round((nextIdx > -1 ? pts[nextIdx].y - pos : 0) / 50);
    if (key === lastKey) return;
    lastKey = key;

    if (nextIdx === -1) {
      hud.classList.add('is-arrived');
      hud.classList.remove('is-reroute');
      hudDist.textContent = 'Arrived';
      hudManeuver.textContent = 'You have arrived';
      hudArrow.style.transform = 'rotate(0deg)';
      horizon.innerHTML = '<li>Nothing ahead</li>';
      return;
    }
    hud.classList.remove('is-arrived');
    const next = allStops[nextIdx];
    hud.classList.toggle('is-reroute', next.id === 'reroute');
    hudDist.textContent = pos <= pts[0].y + 2 && nextIdx === 1 ? 'Start · ' + fmtDist(pts[1].y - pos).toLowerCase() : fmtDist(pts[nextIdx].y - pos);
    hudManeuver.textContent = next.dataset.maneuver;
    const dx = pts[nextIdx].x - pts[nextIdx - 1].x;
    hudArrow.style.transform = `rotate(${Math.abs(dx) < 20 ? 0 : dx > 0 ? 40 : -40}deg)`;

    horizon.innerHTML = hudStops
      .filter(s => !s.classList.contains('is-reached'))
      .slice(1, 3) // the next stop is already in the banner
      .map(s => `<li>${s.dataset.short} <span>${fmtDist(pts[allStops.indexOf(s)].y - pos).replace('In ', '')}</span></li>`)
      .join('') || '<li>Destination</li>';
  }

  function draw(len) {
    const off = String(totalLen - len);
    driven.style.strokeDashoffset = off;
    casing.style.strokeDashoffset = off;
    const p = driven.getPointAtLength(len);
    const q = driven.getPointAtLength(Math.min(totalLen, len + 2));
    const angle = len >= totalLen ? 0 : Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90;
    const flying = flightIdx > -1 && p.y > pts[flightIdx].y + 4 && p.y < pts[dukeIdx].y - 24;
    planeShape.setAttribute('display', flying ? 'inline' : 'none');
    carShape.setAttribute('display', flying ? 'none' : 'inline');
    car.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle}) scale(${flying ? 1.5 : 1})`);
  }

  let raf = 0;
  function update(snap) {
    if (!pts.length) return;
    const y = carY();
    const target = lengthAtY(y);
    if (snap || reduceMotion) shownLen = target;
    else shownLen += (target - shownLen) * 0.18;
    draw(shownLen);
    updateHud(y);
    paintSky();
    if (!snap && !reduceMotion && Math.abs(target - shownLen) > 0.5) raf = requestAnimationFrame(() => update(false));
    else raf = 0;
  }

  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => update(false)); }, { passive: true });
  window.addEventListener('resize', () => update(true));
  new ResizeObserver(() => measure()).observe(drive);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();
})();

/* ============ CITY MAPS ============ */
(function () {
  const rng = seed => () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  function label(ctx, text, x, y, size, color, angle = 0) {
    if (window.innerWidth <= 860) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `600 ${size}px "Overpass Mono", ui-monospace, monospace`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(size * 0.25)}px`;
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // a jittered street grid, rotated, with random gaps so it reads as a city
  function streets(ctx, w, h, r, color, step, angle) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const span = Math.max(w, h) * 1.2;
    for (let dir = 0; dir < 2; dir++) {
      for (let s = -span / 2; s < span / 2; s += step * (0.6 + r() * 0.8)) {
        ctx.beginPath();
        let t = -span / 2;
        while (t < span / 2) {
          const len = 40 + r() * 220;
          if (r() > 0.25) {
            const wob = (r() - 0.5) * 6;
            if (dir) { ctx.moveTo(s, t); ctx.lineTo(s + wob, t + len); }
            else { ctx.moveTo(t, s); ctx.lineTo(t + len, s + wob); }
          }
          t += len + r() * 30;
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function ring(ctx, cx, cy, rx, ry, color, width, wobble, phase) {
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.04) {
      const k = 1 + wobble * Math.sin(3 * a + phase) + wobble * 0.5 * Math.sin(7 * a + phase * 2);
      const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function river(ctx, pts, color, width) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function blob(ctx, cx, cy, rad, color, r) {
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.3) {
      const k = rad * (0.75 + r() * 0.4);
      const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k * 0.8;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  const LIGHT = a => `rgba(236,229,211,${a})`;
  const DARK = a => `rgba(22,33,58,${a})`;
  const WATER = a => `rgba(120,175,230,${a})`;

  const CITIES = {
    delhi(ctx, w, h) {
      const r = rng(28);
      streets(ctx, w, h, r, LIGHT(0.05), 70, 0.12);
      const cx = w * 0.6, cy = h * 0.5;
      [0.18, 0.34, 0.55].forEach((k, i) => ring(ctx, cx, cy, w * k, h * k * 0.9, LIGHT(0.13), 3 - i * 0.5, 0.05, i));
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + 0.2;
        river(ctx, [[cx + Math.cos(a) * w * 0.05, cy + Math.sin(a) * h * 0.05], [cx + Math.cos(a) * w * 0.8, cy + Math.sin(a) * h * 0.8]], LIGHT(0.08), 2);
      }
      const yam = [];
      for (let y = -20; y <= h + 20; y += 20) yam.push([w * 0.9 + Math.sin(y / 260) * 50 + Math.sin(y / 90) * 10, y]);
      river(ctx, yam, WATER(0.16), 38);
      label(ctx, 'NEW DELHI', w * 0.62, h * 0.08 + 40, 26, LIGHT(0.28));
      label(ctx, '28.61°N 77.21°E', w * 0.62, h * 0.08 + 66, 13, LIGHT(0.28));
      label(ctx, 'YAMUNA', w * 0.9 - 24, h * 0.35, 12, LIGHT(0.3), Math.PI / 2);
      label(ctx, 'RING ROAD', cx + w * 0.18 + 10, cy - 20, 11, LIGHT(0.25));
    },
    bengaluru(ctx, w, h) {
      const r = rng(12);
      streets(ctx, w, h, r, DARK(0.06), 60, -0.3);
      const cx = w * 0.45, cy = h * 0.5;
      ring(ctx, cx, cy, w * 0.46, h * 0.44, DARK(0.16), 4, 0.06, 1.7);
      ring(ctx, cx, cy, w * 0.2, h * 0.2, DARK(0.12), 2.5, 0.08, 0.4);
      [['ULSOOR LAKE', 0.55, 0.38, 50], ['HEBBAL LAKE', 0.35, 0.1, 60], ['BELLANDUR LAKE', 0.78, 0.72, 90], ['SANKEY TANK', 0.22, 0.6, 40]].forEach(([n, x, y, s]) => {
        blob(ctx, w * x, h * y, s, WATER(0.25), r);
        label(ctx, n, w * x - s, h * y + s + 18, 11, DARK(0.35));
      });
      label(ctx, 'BENGALURU', w * 0.06, h * 0.04 + 40, 26, DARK(0.3));
      label(ctx, '12.97°N 77.59°E', w * 0.06, h * 0.04 + 66, 13, DARK(0.3));
      label(ctx, 'OUTER RING ROAD', cx + w * 0.3, cy - h * 0.36, 11, DARK(0.3));
    },
    ocean(ctx, w, h) {
      const r = rng(7);
      ctx.strokeStyle = LIGHT(0.08);
      ctx.lineWidth = 1;
      for (let y = 80; y < h; y += 180) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let i = -2; i < 12; i++) {
        ctx.beginPath();
        for (let y = 0; y <= h; y += 20) { const x = w * (i / 10) + Math.sin(y / h * Math.PI) * 60; y ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
      ctx.strokeStyle = LIGHT(0.1);
      for (let i = 0; i < 160; i++) {
        const x = r() * w, y = r() * h;
        ctx.beginPath(); ctx.arc(x, y, 8, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      }
      label(ctx, 'ARABIAN SEA · ATLANTIC', w * 0.06, h * 0.55, 14, LIGHT(0.25));
      label(ctx, 'BLR → RDU · 14,000 KM · 35,000 FT', w * 0.06, h * 0.55 + 24, 12, LIGHT(0.25));
    },
    durham(ctx, w, h) {
      const r = rng(35);
      [[0.12, 0.2, 160], [0.08, 0.35, 120], [0.2, 0.55, 140], [0.9, 0.8, 130]].forEach(([x, y, s]) => blob(ctx, w * x, h * y, s, 'rgba(105,213,174,0.07)', r));
      streets(ctx, w, h, r, LIGHT(0.05), 64, -0.35);
      const eno = [];
      for (let x = -20; x <= w + 20; x += 20) eno.push([x, h * 0.04 + Math.sin(x / 140) * 26 + Math.sin(x / 60) * 6]);
      river(ctx, eno, WATER(0.16), 14);
      river(ctx, [[0, h * 0.3], [w * 0.4, h * 0.22], [w, h * 0.12]], LIGHT(0.14), 5);
      river(ctx, [[w * 0.05, h], [w * 0.35, h * 0.6], [w * 0.62, h * 0.18], [w * 0.7, 0]], LIGHT(0.12), 4);
      label(ctx, 'DURHAM, NC', w * 0.06, h * 0.04 + 90, 26, LIGHT(0.28));
      label(ctx, '35.99°N 78.90°W', w * 0.06, h * 0.04 + 116, 13, LIGHT(0.28));
      label(ctx, 'ENO RIVER', w * 0.3, h * 0.04 - 18 + 40, 11, LIGHT(0.3));
      label(ctx, 'DUKE FOREST', w * 0.06, h * 0.2 + 4, 11, LIGHT(0.3));
      label(ctx, 'I-85', w * 0.8, h * 0.15 - 10, 12, LIGHT(0.3));
      label(ctx, 'DURHAM FWY', w * 0.36, h * 0.5, 11, LIGHT(0.25), -1.1);
    },
  };

  const regions = [...document.querySelectorAll('.region')];
  let lastW = 0;
  function paint() {
    const w = window.innerWidth;
    if (w === lastW) return;
    lastW = w;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    regions.forEach(region => {
      const canvas = region.querySelector('.region__map');
      const draw = CITIES[region.dataset.city];
      if (!canvas || !draw) return;
      const cw = region.clientWidth, ch = region.clientHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      draw(ctx, cw, ch);
    });
  }
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(paint, 200); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lastW = 0; paint(); });
  paint();
})();

/* ============ ROUTE CARD: "calculating" intro ============ */
(function () {
  const card = document.querySelector('.routecard');
  const status = document.getElementById('calc');
  const done = 'Fastest route · 7 stops';
  if (!card || reduceMotion) { if (status) status.textContent = done; return; }
  card.classList.add('is-calculating');
  const legs = [...card.querySelectorAll('.routecard__legs li')];
  setTimeout(() => {
    card.classList.remove('is-calculating');
    legs.forEach((li, i) => { li.style.transitionDelay = `${i * 110}ms`; });
    setTimeout(() => { status.textContent = done; }, legs.length * 110 + 200);
  }, 700);
})();

/* ============ EXPRESS LANE ============ */
(function () {
  const dialog = document.getElementById('express');
  if (!dialog || !dialog.showModal) return;
  document.querySelectorAll('[data-express]').forEach(b => b.addEventListener('click', () => dialog.showModal()));
  dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
})();

/* ============ FILM ============ */
(function () {
  const dialog = document.getElementById('film');
  const video = document.getElementById('film-video');
  if (!dialog || !dialog.showModal) return;
  document.querySelectorAll('[data-film]').forEach(b => b.addEventListener('click', () => {
    dialog.showModal();
    video.play().catch(() => {});
  }));
  dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => video.pause());
})();

/* ============ TRAFFIC SIGN INFORMATION DEMO ============ */
(function () {
  const road = document.getElementById('tsi-road');
  if (!road) return;
  const camBtn = document.getElementById('tsi-camera');
  const featBtn = document.getElementById('tsi-feature');
  const pct = document.getElementById('tsi-pct');
  const caption = document.getElementById('tsi-caption');
  const limits = [50, 80, 30, 60, 80, 50, 70, 30, 90, 60, 50, 80, 60, 30, 70, 50, 90, 60, 80, 50];
  const missingBefore = new Set([2, 7, 11, 14, 18]); // 15 of 20 known = 75%
  const missingAfter = new Set([14]);                // 19 of 20 known = 95%
  road.innerHTML = limits.map(l => `<span class="tsi__sign">${l}</span>`).join('');
  const signs = [...road.children];
  let camera = true, after = true;

  function render() {
    camBtn.setAttribute('aria-pressed', String(camera));
    camBtn.querySelector('b').textContent = camera ? 'ON' : 'OFF';
    featBtn.setAttribute('aria-pressed', String(after));
    featBtn.querySelector('b').textContent = after ? 'AFTER' : 'BEFORE';
    const missing = camera ? new Set() : (after ? missingAfter : missingBefore);
    signs.forEach((s, i) => s.classList.toggle('is-unknown', missing.has(i)));
    pct.textContent = Math.round(((20 - missing.size) / 20) * 100) + '%';
    caption.textContent = camera
      ? 'of signs known · camera sees them all'
      : after
        ? 'of signs known from map data alone, with my feature'
        : 'of signs known from map data alone, before my feature';
  }
  camBtn.addEventListener('click', () => { camera = !camera; render(); });
  featBtn.addEventListener('click', () => { after = !after; render(); });
  render();
})();

/* ============ GAUGE + COUNTERS (final values are in the HTML; these replay them) ============ */
(function () {
  const ARC = 157; // half-circle of radius 50
  const setGauge = (g, v) => {
    g.querySelector('.gauge__fill').style.strokeDashoffset = String(ARC * (1 - v / 50));
    g.querySelector('.gauge__val').textContent = Math.round(v);
  };
  const run = (from, to, onTick) => {
    if (reduceMotion) { onTick(to); return; }
    const start = performance.now(), dur = 1400;
    const tick = now => {
      const t = Math.min(1, (now - start) / dur);
      onTick(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      io.unobserve(el);
      const from = +el.dataset.from, to = +el.dataset.to;
      if (el.classList.contains('gauge')) run(from, to, v => setGauge(el, v));
      else run(from, to, v => { el.textContent = Math.round(v); });
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.gauge, .count').forEach(el => io.observe(el));
})();

/* ============ COPY EMAIL ============ */
(function () {
  const btn = document.getElementById('copy-email');
  const email = document.getElementById('email');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const text = email.textContent.trim();
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy email'; }, 1800); };
    const fallback = () => {
      const range = document.createRange();
      range.selectNodeContents(email);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = 'Selected: press Ctrl+C';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  });
})();

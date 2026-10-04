/* app.js: the drive. Builds the route from the stop pins, moves the car with
   scroll, and keeps the HUD (turn-by-turn, odometer, E-Horizon) in sync. */
'use strict';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* ============ ROUTE + CAR ============ */
(function () {
  const drive = document.getElementById('drive');
  const svg = document.getElementById('route');
  const planned = document.getElementById('route-planned');
  const driven = document.getElementById('route-driven');
  const car = document.getElementById('car');
  const hud = document.querySelector('.hud-top');
  const hudDist = document.getElementById('hud-dist');
  const hudManeuver = document.getElementById('hud-maneuver');
  const hudArrow = document.getElementById('hud-arrow');
  const odo = document.getElementById('odo');
  const horizon = document.getElementById('horizon-list');

  const allStops = [...document.querySelectorAll('.stop')];
  const hudStops = allStops.filter(s => !s.classList.contains('hero'));
  let pts = [];        // pin centre for every stop, in drive coordinates
  let totalLen = 0;
  let shownLen = 0;    // eased length the car is drawn at
  let lastKey = '';

  function measure() {
    const box = drive.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    pts = allStops.map(stop => {
      const r = stop.querySelector('.stop__pin').getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    });
    const narrow = window.innerWidth <= 860;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dy = b.y - a.y;
      const bend = narrow ? (i % 2 ? 14 : -14) : 0; // a little weave on phones
      d += ` C ${a.x + bend} ${a.y + dy * 0.5} ${b.x - bend} ${b.y - dy * 0.5} ${b.x} ${b.y}`;
    }
    planned.setAttribute('d', d);
    driven.setAttribute('d', d);
    totalLen = driven.getTotalLength();
    driven.style.strokeDasharray = `${totalLen} ${totalLen}`;
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

  function carY() {
    const box = drive.getBoundingClientRect();
    return window.innerHeight * 0.55 - box.top;
  }

  function fmtDist(px) {
    const m = Math.max(0, Math.round(px / 10) * 10); // 1px = 1m on this map
    return m >= 1000 ? `In ${(m / 1000).toFixed(1)} km` : `In ${m} m`;
  }

  function fmtYear(y) {
    const year = Math.floor(y);
    const month = Math.min(11, Math.floor((y - year) * 12));
    return `${MONTHS[month]} ${year}`;
  }

  function updateHud(y) {
    const pos = Math.min(Math.max(y, pts[0].y), pts[pts.length - 1].y);
    let nextIdx = -1;
    allStops.forEach((stop, i) => {
      const reached = pos >= pts[i].y - 2;
      stop.classList.toggle('is-reached', reached);
      if (!reached && nextIdx === -1 && i > 0) nextIdx = i;
    });

    // odometer: interpolate the year between the pins either side of the car
    let year = parseFloat(allStops[0].dataset.year);
    for (let i = 1; i < pts.length; i++) {
      if (pos <= pts[i].y) {
        const a = parseFloat(allStops[i - 1].dataset.year), b = parseFloat(allStops[i].dataset.year);
        const t = (pos - pts[i - 1].y) / Math.max(1, pts[i].y - pts[i - 1].y);
        year = a + (b - a) * t;
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
      .map(s => {
        const i = allStops.indexOf(s);
        return `<li>${s.dataset.short} <span>${fmtDist(pts[i].y - pos).replace('In ', '')}</span></li>`;
      }).join('') || '<li>Destination</li>';
  }

  function draw(len) {
    driven.style.strokeDashoffset = String(totalLen - len);
    const p = driven.getPointAtLength(len);
    const q = driven.getPointAtLength(Math.min(totalLen, len + 2));
    const angle = len >= totalLen ? 0 : Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90;
    car.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle})`);
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
    if (!snap && !reduceMotion && Math.abs(target - shownLen) > 0.5) {
      raf = requestAnimationFrame(() => update(false));
    } else {
      raf = 0;
    }
  }

  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => update(false)); }, { passive: true });
  new ResizeObserver(() => measure()).observe(drive);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();
})();

/* ============ ROUTE CARD: "calculating" intro ============ */
(function () {
  const card = document.querySelector('.routecard');
  const status = document.getElementById('calc');
  if (!card || reduceMotion) { if (status) status.textContent = 'Fastest route · 6 stops'; return; }
  card.classList.add('is-calculating');
  const legs = [...card.querySelectorAll('.routecard__legs li')];
  setTimeout(() => {
    card.classList.remove('is-calculating');
    legs.forEach((li, i) => {
      li.style.transitionDelay = `${i * 110}ms`;
    });
    setTimeout(() => { status.textContent = 'Fastest route · 6 stops'; }, legs.length * 110 + 200);
  }, 700);
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
    const known = Math.round(((20 - missing.size) / 20) * 100);
    pct.textContent = known + '%';
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
  const gaugeMax = 50;
  const setGauge = (g, v) => {
    g.querySelector('.gauge__fill').style.strokeDashoffset = String(ARC * (1 - v / gaugeMax));
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

  document.querySelectorAll('.gauge').forEach(g => setGauge(g, +g.dataset.to));
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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  });
})();

/* app.js — Portfolio Interactions */
'use strict';

/* ============================================================
   THEME TOGGLE (dark default, no localStorage)
   ============================================================ */
(function () {
  const html = document.documentElement;
  // Default to dark as spec requires
  let current = 'dark';
  html.setAttribute('data-theme', current);

  function setTheme(t) {
    current = t;
    html.setAttribute('data-theme', t);
    // Update all moon/sun icons
    const moonSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    const sunSVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
    document.querySelectorAll('[data-theme-toggle], [data-theme-toggle-mobile]').forEach(btn => {
      btn.innerHTML = t === 'dark' ? moonSVG : sunSVG;
      btn.setAttribute('aria-label', `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`);
    });
  }

  setTheme('dark');

  document.querySelectorAll('[data-theme-toggle], [data-theme-toggle-mobile]').forEach(btn => {
    btn.addEventListener('click', () => setTheme(current === 'dark' ? 'light' : 'dark'));
  });
})();

/* ============================================================
   CUSTOM CURSOR
   ============================================================ */
(function () {
  const cursor = document.querySelector('.cursor');
  const ring   = document.querySelector('.cursor-ring');
  if (!cursor || !ring) return;

  let mx = -100, my = -100;
  let rx = -100, ry = -100;
  let raf;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    cursor.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
  }, { passive: true });

  function animateRing() {
    const dx = mx - rx;
    const dy = my - ry;
    rx += dx * 0.12;
    ry += dy * 0.12;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    raf = requestAnimationFrame(animateRing);
  }
  animateRing();

  // Hover states
  const interactives = 'a, button, [role="button"], input, textarea, select, label';
  document.addEventListener('mouseover', e => {
    if (e.target.closest(interactives)) {
      cursor.classList.add('is-hovering');
      ring.classList.add('is-hovering');
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(interactives)) {
      cursor.classList.remove('is-hovering');
      ring.classList.remove('is-hovering');
    }
  });

  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
    ring.style.opacity = '1';
  });
})();

/* ============================================================
   SCROLL PROGRESS BAR
   ============================================================ */
(function () {
  const bar = document.querySelector('.progress-bar');
  if (!bar) return;

  function update() {
    const scrollTop  = window.scrollY;
    const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = pct + '%';
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();

/* ============================================================
   NAV SCROLL BEHAVIOR
   ============================================================ */
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > 60) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    lastY = y;
  }, { passive: true });
})();

/* ============================================================
   MOBILE MENU
   ============================================================ */
(function () {
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileToggle = document.querySelector('[data-theme-toggle-mobile]');
  if (!hamburger || !mobileMenu) return;

  // Show mobile theme toggle on small screens
  function checkMobile() {
    if (window.innerWidth <= 768) {
      if (mobileToggle) mobileToggle.style.display = 'flex';
    } else {
      if (mobileToggle) mobileToggle.style.display = 'none';
      mobileMenu.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  }
  checkMobile();
  window.addEventListener('resize', checkMobile);

  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
    mobileMenu.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  // Close on link click
  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
})();

/* ============================================================
   ANIMATED NUMBER COUNTERS
   Triggers when the stat element enters view
   ============================================================ */
(function () {
  const items = document.querySelectorAll('[data-count], [data-count-decimal]');
  if (!items.length) return;

  const easeOutQuart = t => 1 - Math.pow(1 - t, 4);

  function animateCount(el) {
    const isDecimal  = el.hasAttribute('data-count-decimal');
    const target     = isDecimal
      ? parseFloat(el.getAttribute('data-count-decimal'))
      : parseInt(el.getAttribute('data-count'), 10);
    const prefix     = el.getAttribute('data-prefix') || '';
    const suffix     = el.getAttribute('data-suffix') || '';
    const duration   = 1200;
    const startTime  = performance.now();

    function tick(now) {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = easeOutQuart(progress);
      const value    = isDecimal
        ? (target * eased).toFixed(2)
        : Math.round(target * eased);
      el.textContent = prefix + value + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  items.forEach(el => io.observe(el));
})();

/* ============================================================
   SMOOTH SCROLL FOR NAV LINKS
   ============================================================ */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ============================================================
   ACTIVE NAV LINK (Intersection Observer)
   ============================================================ */
(function () {
  const sections = document.querySelectorAll('section[id], div[id]');
  const navLinks = document.querySelectorAll('.nav__links a[href^="#"]');

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          const active = link.getAttribute('href') === `#${id}`;
          link.style.color = active
            ? 'var(--color-text)'
            : 'var(--color-text-muted)';
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(s => io.observe(s));
})();

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  lucide.createIcons();

  // Initialize Splitting.js for hero text
  Splitting();

  // Stagger character animations
  initHeroAnimation();

  // Theme toggle
  initTheme();

  // Navigation
  initNavigation();

  // Scroll progress
  initScrollProgress();

  // Custom cursor (desktop only)
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    initCustomCursor();
  }

  // Active nav link tracking
  initActiveNav();
});

// ============================================
// HERO CHARACTER ANIMATION
// ============================================
function initHeroAnimation() {
  const chars = document.querySelectorAll('.hero__title .char');
  chars.forEach((char, i) => {
    char.style.animationDelay = `${0.3 + i * 0.03}s`;
  });
}

// ============================================
// THEME TOGGLE
// ============================================
function initTheme() {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  updateToggleIcon(toggle, theme);

  if (toggle) {
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
      updateToggleIcon(toggle, theme);
    });
  }
}

function updateToggleIcon(toggle, theme) {
  if (!toggle) return;
  toggle.innerHTML = theme === 'dark'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
  const nav = document.querySelector('.nav');
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const mobileNav = document.querySelector('.mobile-nav');
  let lastScroll = 0;
  let isMenuOpen = false;

  // Scroll behavior: hide/show nav
  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;

    if (currentScroll > 100) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }

    if (currentScroll > lastScroll && currentScroll > 200 && !isMenuOpen) {
      nav.classList.add('nav--hidden');
    } else {
      nav.classList.remove('nav--hidden');
    }

    lastScroll = currentScroll;
  }, { passive: true });

  // Mobile menu toggle
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      isMenuOpen = !isMenuOpen;
      mobileBtn.classList.toggle('active');
      mobileNav.classList.toggle('open');
      mobileBtn.setAttribute('aria-expanded', isMenuOpen);
      document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    });
  }

  // Close mobile menu on link click
  const mobileLinks = mobileNav.querySelectorAll('a');
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      isMenuOpen = false;
      mobileBtn.classList.remove('active');
      mobileNav.classList.remove('open');
      mobileBtn.setAttribute('aria-expanded', false);
      document.body.style.overflow = '';
    });
  });
}

// ============================================
// SCROLL PROGRESS
// ============================================
function initScrollProgress() {
  const progressBar = document.querySelector('.scroll-progress');

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;
    progressBar.style.width = progress + '%';
  }, { passive: true });
}

// ============================================
// CUSTOM CURSOR
// ============================================
function initCustomCursor() {
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');

  if (!dot || !ring) return;

  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = mouseX - 4 + 'px';
    dot.style.top = mouseY - 4 + 'px';
  });

  function animateRing() {
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    ring.style.left = ringX - 16 + 'px';
    ring.style.top = ringY - 16 + 'px';
    requestAnimationFrame(animateRing);
  }
  animateRing();

  // Hover effect on interactive elements
  const interactives = document.querySelectorAll('a, button, [role="button"], .project-card, .blog-card, .highlight, .skill-tag, .contact-link');
  interactives.forEach(el => {
    el.addEventListener('mouseenter', () => {
      dot.classList.add('hovering');
      ring.classList.add('hovering');
    });
    el.addEventListener('mouseleave', () => {
      dot.classList.remove('hovering');
      ring.classList.remove('hovering');
    });
  });
}

// ============================================
// ACTIVE NAV LINK
// ============================================
function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav__links a');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === '#' + id) {
            link.classList.add('active');
          }
        });
      }
    });
  }, {
    rootMargin: '-30% 0px -70% 0px'
  });

  sections.forEach(section => observer.observe(section));
}

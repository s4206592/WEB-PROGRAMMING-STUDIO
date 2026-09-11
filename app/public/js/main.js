// Shared shell utility (nav, toast). Not one of the feature "modules" —
// every page includes it, but no module's own logic depends on it existing;
// each module falls back to console logging if window.showToast is absent.
window.showToast = function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 2600);
};

// Generic "press" feedback: adds a class immediately (synchronously, before
// any network request resolves) and removes it shortly after. Every module
// button uses this so the click always *feels* responsive even if the
// button's underlying feature is unavailable.
window.pressFeedback = function pressFeedback(el) {
  if (!el) return;
  el.classList.add('is-pressed');
  setTimeout(() => el.classList.remove('is-pressed'), 180);
};

// Mobile nav: hamburger toggles the link list as a dropdown. Desktop CSS
// ignores the "open" state entirely (links are always visible there), so
// this only matters below the nav's mobile breakpoint.
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.classList.toggle('open', isOpen);
  });
  // Close the menu after tapping a link/button inside it, so navigating
  // doesn't leave the dropdown open on return (back button, SPA-like feel).
  navLinks.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.classList.remove('open');
    }
  });
}

// Scroll-reveal: fades + rises .card, .carousel-card, and .stat elements
// into place as they enter the viewport. Purely additive — the .reveal
// class (and its opacity:0 starting state) is only added here, in JS, so
// if this script fails to load every element just renders fully visible
// with no animation, never hidden.
if (window.IntersectionObserver) {
  const revealTargets = document.querySelectorAll('.card, .carousel-card, .stat, .empty-state');
  if (revealTargets.length) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    revealTargets.forEach((el, i) => {
      el.classList.add('reveal');
      // Small stagger so a grid of cards doesn't all pop in at once.
      el.style.transitionDelay = `${Math.min(i % 8, 8) * 40}ms`;
      revealObserver.observe(el);
    });
  }
}

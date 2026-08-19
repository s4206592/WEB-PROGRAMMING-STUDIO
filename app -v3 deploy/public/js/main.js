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

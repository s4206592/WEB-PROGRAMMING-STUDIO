// Home page module script — self-contained, only runs on "/". Two pieces:
// an animated count-up for the live stat bar, and a simple auto-rotating
// carousel for the featured-products strip. Both degrade harmlessly if
// their target elements aren't on the page (e.g. stats/carousel removed).

document.addEventListener('DOMContentLoaded', () => {
  // --- Animated stat counters ------------------------------------------
  const statBar = document.getElementById('stat-bar');
  if (statBar) {
    const numbers = statBar.querySelectorAll('[data-count-to]');
    const animate = () => {
      numbers.forEach((el) => {
        const target = Number(el.dataset.countTo) || 0;
        const decimals = Number(el.dataset.decimal) || 0;
        const duration = 900;
        const start = performance.now();
        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          const value = target * eased;
          el.textContent = decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString();
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    };
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { animate(); observer.disconnect(); }
        });
      }, { threshold: 0.4 });
      observer.observe(statBar);
    } else {
      animate(); // fallback for very old browsers with no IntersectionObserver
    }
  }

  // --- Featured products carousel ---------------------------------------
  const track = document.getElementById('featured-track');
  if (track) {
    const cards = Array.from(track.children);
    const dotsWrap = document.getElementById('carousel-dots');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    let index = 0;
    let autoTimer;

    cards.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });
    const dots = Array.from(dotsWrap.children);

    function cardsPerView() {
      const cardWidth = cards[0].getBoundingClientRect().width + 16; // + gap
      return Math.max(1, Math.floor(track.getBoundingClientRect().width / cardWidth));
    }

    function goTo(i) {
      const maxIndex = Math.max(0, cards.length - cardsPerView());
      index = Math.max(0, Math.min(i, maxIndex));
      const cardWidth = cards[0].getBoundingClientRect().width + 16;
      track.scrollTo({ left: index * cardWidth, behavior: 'smooth' });
      dots.forEach((d, di) => d.classList.toggle('active', di === index));
    }

    function next() { goTo(index + 1 >= cards.length - cardsPerView() + 1 ? 0 : index + 1); }
    function prev() { goTo(index - 1 < 0 ? cards.length - cardsPerView() : index - 1); }

    if (prevBtn) prevBtn.addEventListener('click', () => { prev(); resetAuto(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { next(); resetAuto(); });

    function startAuto() { autoTimer = setInterval(next, 4500); }
    function resetAuto() { clearInterval(autoTimer); startAuto(); }
    track.addEventListener('mouseenter', () => clearInterval(autoTimer));
    track.addEventListener('mouseleave', startAuto);
    if (cards.length > 1) startAuto();
  }
});

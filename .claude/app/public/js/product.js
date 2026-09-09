// Product Listing / Individual Product module script.
// IMPORTANT: this file does NOT import cart.js or wishlist.js. The
// "Add to cart" and "Save to wishlist" buttons live here because they
// appear on this page — but they only ever talk to the other modules
// through a plain fetch() call, never through a shared JS object. If the
// Cart or Wishlist module's routes are deleted from server.js, the fetch
// below simply 404s/fails and is caught — the button still visibly
// presses because that part of the code never waits on the network.
// --- Save this search (talks to the Wishlist module's SavedSearch API) --
document.addEventListener('DOMContentLoaded', () => {
  const saveSearchBtn = document.getElementById('save-search-btn');
  if (saveSearchBtn) {
    saveSearchBtn.addEventListener('click', async () => {
      window.pressFeedback(saveSearchBtn);
      const form = document.getElementById('product-filters');
      const data = {};
      new FormData(form).forEach((value, key) => { if (value && key !== 'sort') data[key] = value; });
      try {
        const res = await fetch('/api/wishlist/search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('wishlist module unavailable');
        window.showToast ? window.showToast('Search saved — view it on your Wishlist page') : console.log('Search saved');
      } catch (err) {
        window.showToast ? window.showToast('Could not save this search right now') : console.warn(err);
      }
    });
  }
});

// --- Web Storage API: recently-viewed products + remembered filters ----
// Both are pure client-side convenience state — never worth a database
// round trip, and never sent to the server — so localStorage is the right
// tool rather than a new collection.
const RECENTLY_VIEWED_KEY = 'studiotrade_recently_viewed';
const LAST_FILTERS_KEY = 'studiotrade_last_filters';

document.addEventListener('DOMContentLoaded', () => {
  // On an individual product page: record it as recently viewed.
  const marker = document.getElementById('page-product');
  if (marker) {
    try {
      const entry = {
        id: marker.dataset.id, title: marker.dataset.title,
        price: marker.dataset.price, image: marker.dataset.image
      };
      let list = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]');
      list = list.filter((p) => p.id !== entry.id);
      list.unshift(entry);
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list.slice(0, 6)));
    } catch (err) { /* localStorage unavailable (private mode etc.) — skip silently */ }
  }

  // On the marketplace listing page: render recently-viewed strip, and
  // remember/restore the last filter + sort choice used.
  const grid = document.getElementById('recently-viewed-grid');
  if (grid) {
    try {
      const list = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]');
      if (list.length > 0) {
        document.getElementById('recently-viewed').style.display = '';
        grid.innerHTML = list.map((p) => `
          <a class="card" href="/products/${p.id}" style="text-decoration:none; color:inherit;">
            <div class="card-media">${p.image ? `<img src="${p.image}" alt="">` : 'NO IMAGE'}</div>
            <div class="gear-tag">₫${Number(p.price).toLocaleString()}</div>
            <div class="card-body"><div class="card-title">${p.title}</div></div>
          </a>`).join('');
      }
    } catch (err) { /* skip silently */ }
  }

  const filterForm = document.getElementById('product-filters');
  if (filterForm) {
    const hasQuery = window.location.search.length > 0;
    if (!hasQuery) {
      try {
        const saved = JSON.parse(localStorage.getItem(LAST_FILTERS_KEY) || '{}');
        Object.keys(saved).forEach((name) => {
          const field = filterForm.querySelector(`[name="${name}"]`);
          if (field) field.value = saved[name];
        });
      } catch (err) { /* skip silently */ }
    }
    filterForm.addEventListener('submit', () => {
      try {
        const data = {};
        new FormData(filterForm).forEach((value, key) => { if (value) data[key] = value; });
        localStorage.setItem(LAST_FILTERS_KEY, JSON.stringify(data));
      } catch (err) { /* skip silently */ }
    });
  }
});

// --- Multi-item listing form validation ---------------------------------
const listingForm = document.getElementById('listing-form');
if (listingForm) {
  listingForm.addEventListener('submit', (e) => {
    let valid = true;
    listingForm.querySelectorAll('.listing-row').forEach((row) => {
      row.querySelectorAll('[data-field]').forEach((wrap) => {
        const input = wrap.querySelector('input, textarea');
        const field = wrap.dataset.field;
        let ok = input.value.trim().length > 0;
        if (ok && field === 'listPrice') ok = Number(input.value) >= 0;
        wrap.classList.toggle('has-error', !ok);
        if (!ok) valid = false;
      });
    });
    if (!valid) e.preventDefault();
  });
}

// --- Multi-item listing form (list several pieces of gear at once) -----
const addRowBtn = document.getElementById('add-row');
if (addRowBtn) {
  addRowBtn.addEventListener('click', () => {
    const rows = document.getElementById('listing-rows');
    const rowCount = rows.querySelectorAll('.listing-row').length;
    const template = rows.querySelector('.listing-row').cloneNode(true);

    // Re-index every name="items[N][...]" attribute to the new row number,
    // clear values, and reveal its own "Remove" button.
    template.querySelectorAll('[name]').forEach((el) => {
      el.name = el.name.replace(/items\[\d+\]/, `items[${rowCount}]`);
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else if (el.type === 'checkbox') el.checked = true;
      else el.value = '';
    });
    template.querySelector('.mono').textContent = `ITEM ${rowCount + 1}`;
    const removeBtn = template.querySelector('[data-remove-row]');
    removeBtn.style.display = '';
    rows.appendChild(template);
  });
}

document.addEventListener('click', (e) => {
  const removeRowBtn = e.target.closest('[data-remove-row]');
  if (removeRowBtn) {
    const rows = document.getElementById('listing-rows');
    if (rows.querySelectorAll('.listing-row').length > 1) {
      removeRowBtn.closest('.listing-row').remove();
    }
  }
});

document.addEventListener('click', async (e) => {
  const cartBtn = e.target.closest('[data-add-to-cart]');
  if (cartBtn) {
    window.pressFeedback(cartBtn);
    const productId = cartBtn.dataset.addToCart;
    try {
      const res = await fetch('/api/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: 1 })
      });
      const data = await res.json();
      if (!data.ok) {
        window.showToast ? window.showToast(data.message || 'Could not add to cart') : console.warn(data.message);
        return;
      }
      const badge = document.querySelector('[data-cart-count]');
      if (badge && typeof data.itemCount === 'number') badge.textContent = data.itemCount;
      window.showToast ? window.showToast('Added to cart') : console.log('Added to cart');
    } catch (err) {
      // Module missing/unreachable — fail quietly, button already animated.
      window.showToast ? window.showToast('Cart is unavailable right now') : console.warn(err);
    }
    return;
  }

  const wishlistBtn = e.target.closest('[data-add-to-wishlist]');
  if (wishlistBtn) {
    window.pressFeedback(wishlistBtn);
    const productId = wishlistBtn.dataset.addToWishlist;
    try {
      const res = await fetch('/api/wishlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      });
      if (!res.ok) throw new Error('wishlist module unavailable');
      window.showToast ? window.showToast('Saved to wishlist') : console.log('Saved');
    } catch (err) {
      window.showToast ? window.showToast('Wishlist is unavailable right now') : console.warn(err);
    }
  }
});

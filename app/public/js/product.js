// Product Listing / Individual Product module script.
// IMPORTANT: this file does NOT import cart.js or wishlist.js. The
// "Add to cart" and "Save to wishlist" buttons live here because they
// appear on this page — but they only ever talk to the other modules
// through a plain fetch() call, never through a shared JS object. If the
// Cart or Wishlist module's routes are deleted from server.js, the fetch
// below simply 404s/fails and is caught — the button still visibly
// presses because that part of the code never waits on the network.
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
      if (!res.ok) throw new Error('cart module unavailable');
      const data = await res.json();
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

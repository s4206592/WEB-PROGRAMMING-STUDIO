// Wishlist page script — self-contained, only touches /api/wishlist/*.
document.addEventListener('click', async (e) => {
  const removeBtn = e.target.closest('[data-remove-wishlist]');
  if (removeBtn) {
    window.pressFeedback(removeBtn);
    const productId = removeBtn.dataset.removeWishlist;
    await fetch('/api/wishlist/remove', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId })
    });
    removeBtn.closest('[data-wishlist-row]')?.remove();
  }
});

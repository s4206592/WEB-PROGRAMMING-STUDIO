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
    return;
  }

  const removeSearchBtn = e.target.closest('[data-remove-saved-search]');
  if (removeSearchBtn) {
    window.pressFeedback(removeSearchBtn);
    const id = removeSearchBtn.dataset.removeSavedSearch;
    await fetch(`/api/wishlist/searches/${id}/delete`, { method: 'POST' });
    removeSearchBtn.closest('[data-saved-search-row]')?.remove();
  }
});

// Shopping Cart page script — only runs on /cart, only ever calls
// /api/cart/* endpoints owned by this same module.
document.addEventListener('click', async (e) => {
  const removeBtn = e.target.closest('[data-remove-item]');
  if (removeBtn) {
    window.pressFeedback(removeBtn);
    const productId = removeBtn.dataset.removeItem;
    await fetch('/api/cart/remove', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId })
    });
    removeBtn.closest('[data-cart-row]')?.remove();
  }
});

document.querySelectorAll('[data-qty-input]').forEach((input) => {
  input.addEventListener('change', async () => {
    await fetch('/api/cart/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: input.dataset.qtyInput, quantity: input.value })
    });
    window.showToast && window.showToast('Cart updated');
  });
});

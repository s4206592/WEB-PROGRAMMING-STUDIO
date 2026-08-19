// Shopping Cart page script — only runs on /cart, only ever calls
// /api/cart/* endpoints owned by this same module.
function recalcSubtotal() {
  let total = 0;
  document.querySelectorAll('[data-cart-row]').forEach((row) => {
    const price = Number(row.dataset.price);
    const qty = Number(row.querySelector('[data-qty-input]').value) || 0;
    total += price * qty;
  });
  const el = document.querySelector('[data-cart-subtotal]');
  if (el) el.textContent = total.toLocaleString();
}
recalcSubtotal();

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
    recalcSubtotal();
  }
});

document.querySelectorAll('[data-qty-input]').forEach((input) => {
  input.addEventListener('input', recalcSubtotal);
  input.addEventListener('change', async () => {
    await fetch('/api/cart/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: input.dataset.qtyInput, quantity: input.value })
    });
    window.showToast && window.showToast('Cart updated');
  });
});

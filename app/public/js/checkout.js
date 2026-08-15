// Checkout page validation (delivery + payment fields).
const checkoutForm = document.getElementById('checkout-form');
if (checkoutForm) {
  checkoutForm.addEventListener('submit', (e) => {
    let valid = true;
    ['address', 'contactPhone', 'shippingMethod'].forEach((name) => {
      const field = checkoutForm.querySelector(`[name="${name}"]`);
      const wrap = field.closest('.field');
      if (!field.value.trim()) { wrap.classList.add('has-error'); valid = false; }
      else wrap.classList.remove('has-error');
    });
    if (!valid) e.preventDefault();
  });
}

document.addEventListener('click', async (e) => {
  const advanceBtn = e.target.closest('[data-advance-order]');
  if (advanceBtn) {
    window.pressFeedback(advanceBtn);
    const orderId = advanceBtn.dataset.advanceOrder;
    try {
      const res = await fetch(`/orders/${orderId}/advance`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) window.location.reload();
    } catch (err) {
      window.showToast && window.showToast('Could not update delivery status.');
    }
  }
});

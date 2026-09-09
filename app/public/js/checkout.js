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

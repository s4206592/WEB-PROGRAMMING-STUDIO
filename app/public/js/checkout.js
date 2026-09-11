// Checkout page validation (delivery fields — shipping method is a <select>
// per seller group, so it always has a value and needs no validation).
const checkoutForm = document.getElementById('checkout-form');
if (checkoutForm) {
  checkoutForm.addEventListener('submit', (e) => {
    let valid = true;
    ['address', 'contactPhone'].forEach((name) => {
      const field = checkoutForm.querySelector(`[name="${name}"]`);
      const wrap = field.closest('.field');
      if (!field.value.trim()) { wrap.classList.add('has-error'); valid = false; }
      else wrap.classList.remove('has-error');
    });
    if (!valid) e.preventDefault();
  });
}

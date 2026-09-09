// Studio submit/edit form: field-length validation + a guard against
// submitting without a confirmed address pick (studio-map.js clears the
// hidden lat/lng fields the moment the address text is edited by hand).
const studioForm = document.getElementById('studio-form');
if (studioForm) {
  studioForm.addEventListener('submit', (e) => {
    let valid = true;
    const name = studioForm.querySelector('[name="name"]');
    const description = studioForm.querySelector('[name="description"]');
    const lat = studioForm.querySelector('[name="location[lat]"]');

    if (name.value.trim().length < 2) { name.closest('.field').classList.add('has-error'); valid = false; }
    else name.closest('.field').classList.remove('has-error');

    if (description.value.trim().length < 10) { description.closest('.field').classList.add('has-error'); valid = false; }
    else description.closest('.field').classList.remove('has-error');

    const addressField = document.getElementById('address-field');
    if (!lat.value) {
      if (addressField) addressField.classList.add('has-error');
      valid = false;
    } else if (addressField) addressField.classList.remove('has-error');

    if (!valid) e.preventDefault();
  });
}

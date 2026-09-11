// Client-side validation for register/login/reset forms. Server-side checks
// in auth.routes.js are the source of truth; this just gives instant feedback.

// Show/hide password toggle — works on any page that includes auth.js and
// has a button with data-toggle-password="<input id>".
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-toggle-password]');
  if (!btn) return;
  const input = document.getElementById(btn.dataset.togglePassword);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? 'Show' : 'Hide';
});
function setError(field, message) {
  field.classList.toggle('has-error', Boolean(message));
  const msg = field.querySelector('.field-error');
  if (msg) msg.textContent = message || '';
}

const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener('submit', (e) => {
    let valid = true;
    const username = registerForm.querySelector('#username');
    const email = registerForm.querySelector('#email');
    const phone = registerForm.querySelector('#phone');
    const password = registerForm.querySelector('#password');
    const confirm = registerForm.querySelector('#confirmPassword');

    if (username.value.trim().length < 3) {
      setError(username.closest('.field'), 'Username must be at least 3 characters.'); valid = false;
    } else setError(username.closest('.field'), '');

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    if (!emailOk) { setError(email.closest('.field'), 'Enter a valid email address.'); valid = false; }
    else setError(email.closest('.field'), '');

    const phoneOk = /^[0-9+()\-\s]{7,}$/.test(phone.value.trim());
    if (!phoneOk) { setError(phone.closest('.field'), 'Enter a valid phone number — it\'s required to trade on the platform.'); valid = false; }
    else setError(phone.closest('.field'), '');

    if (password.value.length < 8) {
      setError(password.closest('.field'), 'Password must be at least 8 characters.'); valid = false;
    } else setError(password.closest('.field'), '');

    if (confirm.value !== password.value) {
      setError(confirm.closest('.field'), 'Passwords do not match.'); valid = false;
    } else setError(confirm.closest('.field'), '');

    if (!valid) e.preventDefault();
  });
}

const forgotForm = document.getElementById('forgot-password-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', (e) => {
    const email = forgotForm.querySelector('#email');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    document.getElementById('forgot-email-field').classList.toggle('has-error', !emailOk);
    if (!emailOk) e.preventDefault();
  });
}

const resetForm = document.getElementById('reset-password-form');
if (resetForm) {
  resetForm.addEventListener('submit', (e) => {
    let valid = true;
    const password = resetForm.querySelector('#password');
    const confirm = resetForm.querySelector('#confirmPassword');
    if (password.value.length < 8) {
      setError(password.closest('.field'), 'Password must be at least 8 characters.'); valid = false;
    } else setError(password.closest('.field'), '');
    if (confirm.value !== password.value) {
      setError(confirm.closest('.field'), 'Passwords do not match.'); valid = false;
    } else setError(confirm.closest('.field'), '');
    if (!valid) e.preventDefault();
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    const identifier = loginForm.querySelector('#identifier');
    const password = loginForm.querySelector('#password');
    let valid = true;
    if (!identifier.value.trim()) { setError(identifier.closest('.field'), 'Enter your username or email.'); valid = false; }
    else setError(identifier.closest('.field'), '');
    if (!password.value) { setError(password.closest('.field'), 'Enter your password.'); valid = false; }
    else setError(password.closest('.field'), '');
    if (!valid) e.preventDefault();
  });
}

const changePasswordForm = document.getElementById('change-password-form');
if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', (e) => {
    let valid = true;
    const current = changePasswordForm.querySelector('#currentPassword');
    const next = changePasswordForm.querySelector('#newPassword');
    const confirm = changePasswordForm.querySelector('#confirmNewPassword');

    if (!current.value) {
      setError(current.closest('.field'), 'Enter your current password.'); valid = false;
    } else setError(current.closest('.field'), '');

    if (next.value.length < 8) {
      setError(next.closest('.field'), 'New password must be at least 8 characters.'); valid = false;
    } else setError(next.closest('.field'), '');

    if (confirm.value !== next.value) {
      setError(confirm.closest('.field'), 'New passwords do not match.'); valid = false;
    } else setError(confirm.closest('.field'), '');

    if (!valid) e.preventDefault();
  });
}

// Blog module: submission form validation + comment validation.
const submitForm = document.getElementById('blog-submit-form');
if (submitForm) {
  submitForm.addEventListener('submit', (e) => {
    let valid = true;
    ['title', 'category', 'body'].forEach((name) => {
      const field = submitForm.querySelector(`[name="${name}"]`);
      const wrap = field.closest('.field');
      if (!field.value.trim()) { wrap.classList.add('has-error'); valid = false; }
      else wrap.classList.remove('has-error');
    });
    if (!valid) e.preventDefault();
  });
}

const commentForm = document.getElementById('comment-form');
if (commentForm) {
  commentForm.addEventListener('submit', (e) => {
    const body = commentForm.querySelector('[name="body"]');
    if (body.value.trim().length < 2) {
      body.closest('.field').classList.add('has-error');
      e.preventDefault();
    }
  });
}

// Product Review (PR) page: interactive star picker + validation.
document.addEventListener('DOMContentLoaded', () => {
  const stars = document.querySelectorAll('[data-star]');
  const ratingInput = document.getElementById('rating');
  stars.forEach((star) => {
    star.addEventListener('click', () => {
      const value = Number(star.dataset.star);
      if (ratingInput) ratingInput.value = value;
      stars.forEach((s) => s.classList.toggle('active', Number(s.dataset.star) <= value));
    });
  });

  const form = document.getElementById('review-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      let valid = true;
      const ratingField = document.getElementById('rating-field');
      const commentField = document.getElementById('comment-field');
      if (!ratingInput || !ratingInput.value) {
        ratingField.classList.add('has-error'); valid = false;
      } else ratingField.classList.remove('has-error');

      const comment = commentField.querySelector('textarea');
      if (comment.value.trim().length < 5) {
        commentField.classList.add('has-error'); valid = false;
      } else commentField.classList.remove('has-error');

      if (!valid) e.preventDefault();
    });
  }
});

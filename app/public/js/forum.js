// Forum module: new post + reply validation.
const postForm = document.getElementById('new-post-form');
if (postForm) {
  postForm.addEventListener('submit', (e) => {
    let valid = true;
    const title = postForm.querySelector('[name="title"]');
    const body = postForm.querySelector('[name="body"]');
    if (title.value.trim().length < 4) { title.closest('.field').classList.add('has-error'); valid = false; }
    else title.closest('.field').classList.remove('has-error');
    if (body.value.trim().length < 10) { body.closest('.field').classList.add('has-error'); valid = false; }
    else body.closest('.field').classList.remove('has-error');
    if (!valid) e.preventDefault();
  });
}

const replyForm = document.getElementById('reply-form');
if (replyForm) {
  replyForm.addEventListener('submit', (e) => {
    const body = replyForm.querySelector('[name="body"]');
    if (body.value.trim().length < 2) {
      body.closest('.field').classList.add('has-error');
      e.preventDefault();
    } else body.closest('.field').classList.remove('has-error');
  });
}

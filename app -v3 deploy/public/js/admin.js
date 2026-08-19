// Admin module: just button press feedback for suspend/resolve actions;
// the actual state change happens via normal form POSTs (progressive
// enhancement, works even if this script fails to load).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (btn) window.pressFeedback(btn);
});

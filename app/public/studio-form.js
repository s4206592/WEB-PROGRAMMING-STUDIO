document.addEventListener('DOMContentLoaded', function () {
  setupRepeatingRows({
    rowsId: 'equipment-rows', templateId: 'equipment-row-template', addBtnId: 'add-equipment',
    rowSelector: '.equipment-row', focusSelector: 'input[name="equipName"]'
  });
  setupRepeatingRows({
    rowsId: 'gallery-rows', templateId: 'gallery-row-template', addBtnId: 'add-gallery',
    rowSelector: '.gallery-row', focusSelector: 'input[name="galleryUrl"]', max: 10
  });

  function setupRepeatingRows(opts) {
    var rows = document.getElementById(opts.rowsId);
    var tpl = document.getElementById(opts.templateId);
    var addBtn = document.getElementById(opts.addBtnId);
    if (!rows || !tpl || !addBtn) return;

    function updateAddBtn() {
      if (!opts.max) return;
      var count = rows.querySelectorAll(opts.rowSelector).length;
      addBtn.disabled = count >= opts.max;
    }

    addBtn.addEventListener('click', function () {
      rows.appendChild(tpl.content.cloneNode(true));
      var all = rows.querySelectorAll(opts.rowSelector);
      var last = all[all.length - 1];
      var focusEl = last.querySelector(opts.focusSelector);
      if (focusEl) focusEl.focus();
      updateAddBtn();
    });

    // Keep at least one row — submitting the field with zero entries is
    // treated differently server-side than submitting it with one blank.
    rows.addEventListener('click', function (e) {
      if (!e.target.classList.contains('remove-row')) return;
      if (rows.querySelectorAll(opts.rowSelector).length <= 1) return;
      e.target.closest(opts.rowSelector).remove();
      updateAddBtn();
    });

    updateAddBtn();
  }
});

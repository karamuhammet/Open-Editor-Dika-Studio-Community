/* core/modals.js — shared custom modal utilities (confirm / prompt / alert).
   Moved VERBATIM from js/app.js (Faz 3, cautious core slimming). These are pure DOM
   overlay builders with ZERO dependencies (no canvas / state / fabric); ~45 callers
   across app.js, pages.js and modules use them as globals via direct calls + typeof
   guards. Kept as flat top-level functions (NOT an IIFE) so they stay global exactly as
   before — every existing caller keeps working unchanged. Loaded as a plain <script> in
   index.html (always-loaded core, not a loader module), so there is no load-order risk:
   all callers fire lazily on user actions, well after this script has evaluated.
   Styling: the .cmodal-* classes live in styles.css. */

function showCustomConfirm(msg, onYes, onCancel) {
  var overlay = document.createElement('div');
  overlay.className = 'cmodal-overlay';
  overlay.innerHTML =
    '<div class="cmodal-box">' +
      '<div class="cmodal-msg">' + msg + '</div>' +
      '<div class="cmodal-actions">' +
        '<button class="cmodal-btn cmodal-cancel">Cancel</button>' +
        '<button class="cmodal-btn cmodal-yes">Yes</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector('.cmodal-yes').onclick = function () { overlay.remove(); if (onYes) onYes(); };
  overlay.querySelector('.cmodal-cancel').onclick = function () { overlay.remove(); if (onCancel) onCancel(); };
  overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.remove(); if (onCancel) onCancel(); } });
}

function showCustomPrompt(msg, defaultVal, onSubmit, onCancel) {
  var overlay = document.createElement('div');
  overlay.className = 'cmodal-overlay';
  overlay.innerHTML =
    '<div class="cmodal-box">' +
      '<div class="cmodal-msg">' + msg + '</div>' +
      '<input class="cmodal-input" type="text" value="' + (defaultVal || '') + '">' +
      '<div class="cmodal-actions">' +
        '<button class="cmodal-btn cmodal-cancel">Cancel</button>' +
        '<button class="cmodal-btn cmodal-yes">OK</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var inp = overlay.querySelector('.cmodal-input');
  inp.focus(); inp.select();
  overlay.querySelector('.cmodal-yes').onclick = function () { var v = inp.value; overlay.remove(); if (onSubmit) onSubmit(v); };
  overlay.querySelector('.cmodal-cancel').onclick = function () { overlay.remove(); if (onCancel) onCancel(); };
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var v = inp.value; overlay.remove(); if (onSubmit) onSubmit(v); } });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.remove(); if (onCancel) onCancel(); } });
}

function showCustomAlert(msg, onOk) {
  var overlay = document.createElement('div');
  overlay.className = 'cmodal-overlay';
  overlay.innerHTML =
    '<div class="cmodal-box">' +
      '<div class="cmodal-msg">' + msg + '</div>' +
      '<div class="cmodal-actions">' +
        '<button class="cmodal-btn cmodal-yes">OK</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector('.cmodal-yes').onclick = function () { overlay.remove(); if (onOk) onOk(); };
  overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.remove(); if (onOk) onOk(); } });
}

// Faz 6 — shared loader module (moved from core/). Pure function library, no init;
// runtime callers resolve it once loaded. Register for the module registry + error boundary.
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'modals', parent: 'shared', title: 'Modals', mount: function () {}, unmount: function () {} });
}

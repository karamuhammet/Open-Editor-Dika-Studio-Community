/* ============================================================
   dika studio – Email Verification Module
   Shared by "Get My Card" and "Bulk Export" modals.
   For production, replace sendVerificationCode() with a real
   API call (e.g. Directus, Resend, or custom backend).
   ============================================================ */

(function () {
  'use strict';

  var VERIFY_ENDPOINT = null; // set to your API URL in production
  var CODE_LENGTH = 6;
  var RESEND_COOLDOWN_MS = 60000;
  var _generatedCodes = {};
  var _resendTimers = {};

  function generateCode() {
    var code = '';
    for (var i = 0; i < CODE_LENGTH; i++) code += Math.floor(Math.random() * 10);
    return code;
  }

  /**
   * Send a verification code to the given email.
   * In dev mode (no VERIFY_ENDPOINT), stores code locally and logs it.
   * Returns a Promise that resolves with { success: true }.
   */
  function sendVerificationCode(email) {
    if (!email || !email.includes('@')) {
      return Promise.resolve({ success: false, error: 'Invalid email' });
    }

    if (VERIFY_ENDPOINT) {
      return fetch(VERIFY_ENDPOINT + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      })
        .then(function (r) { return r.json(); })
        .catch(function () { return { success: false, error: 'Network error' }; });
    }

    var code = generateCode();
    _generatedCodes[email.toLowerCase()] = code;
    console.log('[dika studio] Verification code for ' + email + ': ' + code);
    return Promise.resolve({ success: true, _devCode: code });
  }

  /**
   * Verify the code for a given email.
   * In dev mode, checks _generatedCodes. In prod, calls API.
   */
  function verifyCode(email, code) {
    if (!email || !code) return Promise.resolve({ success: false });

    if (VERIFY_ENDPOINT) {
      return fetch(VERIFY_ENDPOINT + '/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, code: code }),
      })
        .then(function (r) { return r.json(); })
        .catch(function () { return { success: false, error: 'Network error' }; });
    }

    var stored = _generatedCodes[email.toLowerCase()];
    if (stored && stored === String(code).trim()) {
      delete _generatedCodes[email.toLowerCase()];
      return Promise.resolve({ success: true });
    }
    return Promise.resolve({ success: false, error: 'Invalid code' });
  }

  /**
   * Build the verification UI inside a container element.
   * @param {HTMLElement} container
   * @param {object} opts - { idPrefix, onVerified(email), emailInputId? }
   */
  function buildVerificationUI(container, opts) {
    var pfx = opts.idPrefix || 'ev';
    var emailInputId = opts.emailInputId || null;

    var sendBtnStyle = 'display:block;width:100%;padding:12px 20px;font-size:14px;font-weight:600;background:var(--gold);color:#111;border:none;border-radius:8px;cursor:pointer;text-align:center';

    container.innerHTML =
      '<div id="' + pfx + '-send-step">' +
        (emailInputId
          ? ''
          : '<input type="email" class="mform-input" id="' + pfx + '-email" placeholder="Email Address *" style="margin-bottom:10px">') +
        '<button type="button" id="' + pfx + '-send-btn" style="' + sendBtnStyle + '">Send Verification Code</button>' +
        '<p id="' + pfx + '-send-hint" style="font-size:11px;color:var(--text-dim);margin-top:6px;display:none"></p>' +
      '</div>' +
      '<div id="' + pfx + '-code-step" style="display:none">' +
        '<p style="font-size:13px;color:var(--text-dim);margin-bottom:12px">Enter the <strong>' + CODE_LENGTH + '-digit code</strong> sent to <span id="' + pfx + '-sent-to" style="color:var(--gold);font-weight:600"></span></p>' +
        '<input type="text" class="mform-input" id="' + pfx + '-code-input" placeholder="000000" maxlength="' + CODE_LENGTH + '" style="text-align:center;letter-spacing:8px;font-size:24px;font-weight:700;margin-bottom:10px" autocomplete="one-time-code">' +
        '<button type="button" id="' + pfx + '-verify-btn" style="' + sendBtnStyle + '">Verify & Download</button>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">' +
          '<p id="' + pfx + '-code-hint" style="font-size:11px;color:var(--text-dim);margin:0"></p>' +
          '<button type="button" id="' + pfx + '-resend-btn" style="background:none;border:none;color:var(--gold);font-size:11px;cursor:pointer;padding:0">Resend code</button>' +
        '</div>' +
        '<p id="' + pfx + '-skip-row" style="margin-top:12px;text-align:center">' +
          '<button type="button" id="' + pfx + '-skip-btn" style="background:none;border:none;color:var(--text-faint);font-size:11px;cursor:pointer;text-decoration:underline">Skip for now (dev)</button>' +
        '</p>' +
      '</div>' +
      '<div id="' + pfx + '-verified-step" style="display:none">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:rgba(46,204,113,0.1);border:1px solid rgba(46,204,113,0.3);border-radius:10px">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          '<span style="font-size:14px;font-weight:600;color:#2ecc71">Email verified</span>' +
          '<span id="' + pfx + '-verified-email" style="font-size:12px;color:var(--text-dim);margin-left:auto"></span>' +
        '</div>' +
      '</div>';

    var sendStep = container.querySelector('#' + pfx + '-send-step');
    var codeStep = container.querySelector('#' + pfx + '-code-step');
    var verifiedStep = container.querySelector('#' + pfx + '-verified-step');

    var emailEl = emailInputId
      ? function () { return document.getElementById(emailInputId); }
      : function () { return container.querySelector('#' + pfx + '-email'); };

    var sendBtn = container.querySelector('#' + pfx + '-send-btn');
    var sendHint = container.querySelector('#' + pfx + '-send-hint');
    var sentTo = container.querySelector('#' + pfx + '-sent-to');
    var codeInput = container.querySelector('#' + pfx + '-code-input');
    var verifyBtn = container.querySelector('#' + pfx + '-verify-btn');
    var codeHint = container.querySelector('#' + pfx + '-code-hint');
    var resendBtn = container.querySelector('#' + pfx + '-resend-btn');
    var skipBtn = container.querySelector('#' + pfx + '-skip-btn');
    var verifiedEmail = container.querySelector('#' + pfx + '-verified-email');

    var _verified = false;
    var _email = '';

    function showStep(n) {
      sendStep.style.display = n === 1 ? '' : 'none';
      codeStep.style.display = n === 2 ? '' : 'none';
      verifiedStep.style.display = n === 3 ? '' : 'none';
    }

    function startResendCooldown() {
      resendBtn.disabled = true;
      resendBtn.style.opacity = '0.4';
      var remaining = RESEND_COOLDOWN_MS / 1000;
      resendBtn.textContent = 'Resend (' + remaining + 's)';
      if (_resendTimers[pfx]) clearInterval(_resendTimers[pfx]);
      _resendTimers[pfx] = setInterval(function () {
        remaining--;
        if (remaining <= 0) {
          clearInterval(_resendTimers[pfx]);
          resendBtn.disabled = false;
          resendBtn.style.opacity = '1';
          resendBtn.textContent = 'Resend code';
        } else {
          resendBtn.textContent = 'Resend (' + remaining + 's)';
        }
      }, 1000);
    }

    function doSend() {
      var el = emailEl();
      var email = el ? el.value.trim() : '';
      if (!email || !email.includes('@') || !email.includes('.')) {
        sendHint.textContent = 'Please enter a valid email address.';
        sendHint.style.display = '';
        sendHint.style.color = 'var(--red, #e74c3c)';
        if (el) el.classList.add('field-error');
        setTimeout(function () { if (el) el.classList.remove('field-error'); }, 2000);
        return;
      }
      _email = email;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
      sendHint.style.display = 'none';

      sendVerificationCode(email).then(function (res) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Code';
        if (res.success) {
          sentTo.textContent = email;
          codeInput.value = '';
          codeHint.textContent = '';
          showStep(2);
          startResendCooldown();
          codeInput.focus();

          if (res._devCode) {
            codeHint.textContent = 'Dev code: ' + res._devCode;
            codeHint.style.color = 'var(--gold)';
          }
        } else {
          sendHint.textContent = res.error || 'Could not send code. Try again.';
          sendHint.style.display = '';
          sendHint.style.color = 'var(--red, #e74c3c)';
        }
      });
    }

    function doVerify() {
      var code = codeInput.value.trim();
      if (code.length < CODE_LENGTH) {
        codeHint.textContent = 'Enter all ' + CODE_LENGTH + ' digits.';
        codeHint.style.color = 'var(--red, #e74c3c)';
        return;
      }
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';

      verifyCode(_email, code).then(function (res) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
        if (res.success) {
          _verified = true;
          verifiedEmail.textContent = _email;
          showStep(3);
          if (typeof opts.onVerified === 'function') opts.onVerified(_email);
        } else {
          codeHint.textContent = res.error || 'Invalid code. Please try again.';
          codeHint.style.color = 'var(--red, #e74c3c)';
          codeInput.value = '';
          codeInput.focus();
        }
      });
    }

    sendBtn.addEventListener('click', doSend);
    verifyBtn.addEventListener('click', doVerify);

    codeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doVerify();
    });

    resendBtn.addEventListener('click', function () {
      doSend();
    });

    skipBtn.addEventListener('click', function () {
      _verified = true;
      var el = emailEl();
      _email = el ? el.value.trim() : 'skipped@dev.local';
      verifiedEmail.textContent = _email + ' (skipped)';
      showStep(3);
      if (typeof opts.onVerified === 'function') opts.onVerified(_email);
    });

    return {
      isVerified: function () { return _verified; },
      getEmail: function () { return _email; },
      reset: function () {
        _verified = false;
        _email = '';
        showStep(1);
        sendHint.style.display = 'none';
        if (!emailInputId) {
          var el = emailEl();
          if (el) el.value = '';
        }
      },
      setEndpoint: function (url) { VERIFY_ENDPOINT = url; },
    };
  }

  window.DikaEmailVerify = {
    buildUI: buildVerificationUI,
    sendCode: sendVerificationCode,
    verifyCode: verifyCode,
  };
})();

// Modular skeleton hook (Faz 8) — email-verify is now a shared loader module (modules/shared/).
if (window.cc && cc.modules) cc.modules.register({ id: 'email-verify', parent: 'shared', title: 'Email verify', mount: function () {}, unmount: function () {} });

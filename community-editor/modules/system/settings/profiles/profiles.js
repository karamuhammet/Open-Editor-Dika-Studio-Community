/* Module: system/settings/profiles — USER PROFILE section.
   Part of the settings group (decomposed from the 2763-line IIFE). Functions hang off the
   shared namespace SS (window.__ccSettings, created by the parent); cross-module refs resolve
   through SS at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  SS.profileIcon = function (name, sz) {
    sz = sz || 16;
    if (typeof ICONS !== 'undefined' && ICONS[name]) {
      return ICONS[name].replace(/width="\d+"/, 'width="' + sz + '"').replace(/height="\d+"/, 'height="' + sz + '"');
    }
    return '';
  };

  SS.buildProfileSection = function () {
    var info = (typeof userInfo !== 'undefined') ? userInfo : {};
    return '<div class="settings-section-title">Profile</div>' +
      '<p style="color:var(--text-dim);font-size:12px;margin-bottom:14px">Your profile data is used in contact presets and bulk export.</p>' +

      /* ─ Personal ─ */
      '<div class="sp-accordion open">' +
        '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
          '<span class="sp-acc-ico">' + SS.profileIcon('user') + '</span>' +
          '<span class="sp-acc-title">Personal</span>' +
          '<span class="sp-acc-arrow">&#9662;</span>' +
        '</div>' +
        '<div class="sp-acc-body">' +
          SS.settingsInput('Name', 'settings-name', info.name || '', 'user') +
          SS.settingsInput('Job Title', 'settings-title', info.title || '', 'briefcase') +
          SS.settingsInput('Company', 'settings-company', info.company || '', 'card') +
        '</div>' +
      '</div>' +

      /* ─ Contact ─ */
      '<div class="sp-accordion open">' +
        '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
          '<span class="sp-acc-ico">' + SS.profileIcon('email') + '</span>' +
          '<span class="sp-acc-title">Contact</span>' +
          '<span class="sp-acc-arrow">&#9662;</span>' +
        '</div>' +
        '<div class="sp-acc-body">' +
          SS.settingsInput('Email', 'settings-email', info.email || '', 'email') +
          SS.settingsInput('Phone', 'settings-phone', info.phone || '', 'phone') +
          SS.settingsInput('Website', 'settings-website', info.website || '', 'globe') +
          SS.settingsInput('Address', 'settings-address', info.address || '', 'mapPin') +
        '</div>' +
      '</div>' +

      /* ─ Social Media ─ */
      '<div class="sp-accordion">' +
        '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
          '<span class="sp-acc-ico">' + SS.profileIcon('social') + '</span>' +
          '<span class="sp-acc-title">Social Media</span>' +
          '<span class="sp-acc-arrow">&#9662;</span>' +
        '</div>' +
        '<div class="sp-acc-body">' +
          SS.settingsInput('LinkedIn', 'settings-linkedin', info.linkedin || '', 'linkedin') +
          SS.settingsInput('Instagram', 'settings-instagram', info.instagram || '', 'instagram') +
          SS.settingsInput('Twitter / X', 'settings-twitter', info.twitter || '', 'twitter') +
          SS.settingsInput('Facebook', 'settings-facebook', info.facebook || '', 'facebook') +
        '</div>' +
      '</div>' +

      '<button class="sbtn" id="settings-save-profile" style="margin-top:16px;width:100%;height:auto;padding:10px 16px;font-size:13px;background:var(--gold);color:#111;font-weight:600;border-radius:8px">Save Profile</button>';
  };

  SS.wireProfileHandlers = function () {
    var saveBtn = document.getElementById('settings-save-profile');
    if (!saveBtn) return;
    saveBtn.onclick = function() {
      var fields = {
        name: 'settings-name', title: 'settings-title', company: 'settings-company',
        email: 'settings-email', phone: 'settings-phone', website: 'settings-website',
        address: 'settings-address', linkedin: 'settings-linkedin', instagram: 'settings-instagram',
        twitter: 'settings-twitter', facebook: 'settings-facebook'
      };
      if (typeof userInfo !== 'undefined') {
        Object.keys(fields).forEach(function(key) {
          var el = document.getElementById(fields[key]);
          userInfo[key] = el ? el.value.trim() : '';
        });
      }
      try { localStorage.setItem('dika_userInfo', JSON.stringify(userInfo)); } catch(ex) {}
      if (typeof renderTemplateCategoryCards === 'function') {
        renderTemplateCategoryCards('flyout-tpl-grid');
      }
      // Visual feedback on save button
      saveBtn.classList.add('save-success');
      saveBtn.textContent = '\u2713 Saved!';
      saveBtn.disabled = true;
      setTimeout(function() {
        saveBtn.classList.remove('save-success');
        saveBtn.textContent = 'Save Profile';
        saveBtn.disabled = false;
      }, 1500);
      if (typeof showToast === 'function') showToast('Profile saved');
    };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'profiles', parent: 'system.settings', title: 'settings: profiles', mount: function () {}, unmount: function () {} });
  }
})();

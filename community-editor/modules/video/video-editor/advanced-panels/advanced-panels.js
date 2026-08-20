/* Module: video/video-editor/advanced-panels — ADVANCED PANELS — LUT browser, plugin manager UIs.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  /* ── LUT BROWSER (rebuilt 2026-07-17, owner: "yeni modern lut browser modalı yap, ayar
     kartlarını baştan değiştir, eskiye dair hiç bir şey kalmasın").

     What the old one was: 180 lines of inline style="..." strings, a header with cursor:move that
     was NOT wired to any drag, card previews of a HUE GRADIENT rather than the user's own frame,
     no search, and a click handler that called VEInspector.show() on every LUT pick, which is why
     the inspector appeared and would not close.

     What this is:
     - THE TARGET IS THE POINT. If a power window is selected, the LUT lands on THAT WINDOW; if not,
       on the whole clip. This is the thing the owner actually asked for: "her özel işleme ayrı lut
       efekti ekliyor". The header always states which, because a grade that silently goes somewhere
       else is worse than one that refuses.
     - Previews are rendered on the CURRENT FRAME, which is how Resolve's browser reads: you compare
       looks on your own picture, not on a rainbow.
     - Draggable through the shared VEFloat helper, position remembered.
     - Search + categories + intensity + .cube import.
     No inline styles: everything is in advanced-panels.css. */
  var _PW_SHAPE_NAMES = { ellipse: 'Circle', rect: 'Square', pen: 'Pen', curve: 'Curve', freeform: 'Free' };

  /* WHICH thing a LUT lands on. 'auto' follows the selected window when there is one, which is what
     you want while you are working on that window.

     But it MUST be overridable, and that was a real defect: with a window selected there was no way
     to grade the whole clip at all. Every LUT went to the window, so the video did not change and
     the panel looked broken (owner: "efekt veremiyordum videoya şekil çizmeden de"). The strip is
     now a SELECTOR, not a label. */
  /* THE SHARED GRADE TARGET (owner 2026-07-17: "hem lut hem color grading'i ortak şekilde çizim
     araçları penceresine bağlayabilir misin? color grading'de vermek isterim çizdiğim yerlere").

     It lives on VE, not in this file's closure, because the LUT Browser and the inspector's Color
     Grading panel are different modules that must agree on ONE answer. Two copies of "which thing
     am I grading" would drift the moment one of them repainted.

     A window's `grade` is deliberately the SAME SHAPE as `clip.colorGrading`, so the whole grader
     (levels, curves, wheels, WB, sat, LUT) applies to a window with no second implementation. */
  VE._veGradeTarget = VE._veGradeTarget || 'auto';   // 'auto' | 'clip' | 'win'

  /* THE ONE PLACE that answers "which grade am I editing", for both the LUT Browser and the
     inspector's Color Grading panel.

     It returns a NODE's grade. It used to return the selected WINDOW's `grade`, which was correct
     until the node chain landed (P12) and then silently wrong: the renderer reads `node.grade`, so
     every LUT and every wheel went into `window.grade`, a field nothing renders. Both panels looked
     completely dead while writing perfectly valid data to a dead address. Measured:
     `WINDOW_RENDER_SEES_LUT: false` with the node still reading {enabled, preset:'none'}. */
  VE._veGradeObj = function (clip) {
    var nodes = VE._veNodes(clip);
    var PW = window.VEPowerWindows;
    if (VE._veGradeTarget !== 'clip' && PW && PW.isOpen() && PW.nodeIndex) {
      var ni = PW.nodeIndex();
      if (nodes[ni] && (nodes[ni].windows || []).length) {
        nodes[ni].grade.enabled = true;
        return nodes[ni].grade;
      }
    }
    // "Tüm klip" = the first FULL-FRAME node in the chain.
    for (var i = 0; i < nodes.length; i++) {
      if (!(nodes[i].windows || []).length) { nodes[i].grade.enabled = true; return nodes[i].grade; }
    }
    // A chain of nothing but windows has no whole-clip step yet. Create it at the FRONT: a base look
    // belongs under the local fixes, not on top of them.
    var n = VE._veNewGradeNode('Basic', { enabled: true, preset: 'none' }, []);
    nodes.unshift(n);
    return n.grade;
  };

  // Replace it wholesale (the CG panel's Reset does this). Same target resolution, so the two cannot
  // disagree about where the grade lives.
  VE._veSetGradeObj = function (clip, obj) {
    var nodes = VE._veNodes(clip);
    var PW = window.VEPowerWindows;
    if (VE._veGradeTarget !== 'clip' && PW && PW.isOpen() && PW.nodeIndex) {
      var ni = PW.nodeIndex();
      if (nodes[ni] && (nodes[ni].windows || []).length) { nodes[ni].grade = obj; return; }
    }
    for (var i = 0; i < nodes.length; i++) {
      if (!(nodes[i].windows || []).length) { nodes[i].grade = obj; return; }
    }
    nodes.unshift(VE._veNewGradeNode('Basic', obj, []));
  };

  // Exposed so the inspector and the toolbar can label the target without each re-deriving it.
  VE._vePwSelected = function () {
    var PW = window.VEPowerWindows;
    if (!PW || !PW.isOpen()) return null;
    var i = PW.selected(), w = PW.windows()[i];
    return w ? { i: i, w: w, label: (_PW_SHAPE_NAMES[w.shape] || 'Square') + ' ' + (i + 1), color: PW.colorOf(i) } : null;
  };

  var _pwSel = function () { return VE._vePwSelected(); };

  var _LUT_TARGET_LABEL = function () {
    var sel = _pwSel();
    if (VE._veGradeTarget !== 'clip' && sel) return { win: sel.i, label: sel.label, color: sel.color };
    return { win: -1, label: 'Entire clip', color: null };
  };

  /* Apply a grade mutation to EVERY selected clip. The LUT Browser and the timeline both allow a
     multi-selection, but the apply used to resolve only _veSelectedClips[0], so a LUT (preset or
     imported .cube) only ever touched the first clip. A whole-clip grade is per-clip independent
     (_veGradeObj -> _veNodes reads/writes clip.gradeNodes), so looping is safe. The ONE exception is
     a Power Window target: its grade lives on a single clip's window node, so that stays single-clip
     (the primary selection), matching _veGradeObj's window branch and _LUT_TARGET_LABEL. */
  VE._veForEachGradeTarget = function (mutate) {
    if (!VE._veSelectedClips || !VE._veSelectedClips.length) {
      if (typeof showToast === 'function') showToast('Select a clip first', 'error');
      return 0;
    }
    var targetsWindow = VE._veGradeTarget !== 'clip' && _pwSel();
    var ids = targetsWindow ? [VE._veSelectedClips[0]] : VE._veSelectedClips.slice();
    var applied = 0;
    for (var i = 0; i < ids.length; i++) {
      var clip = VE._findClipById(ids[i]);
      if (!clip) continue;
      var g = VE._veGradeObj(clip);
      if (!g) continue;
      g.enabled = true;
      mutate(g, clip);
      applied++;
    }
    return applied;
  };

  /* A LUT is just one field of a grade, so this goes through the SAME resolver the Color Grading
     panel uses. It used to hand-roll both branches and, after the node chain landed, both wrote to
     addresses nothing renders. One resolver means one thing to get wrong, and it is now measured. */
  VE._veApplyLut = function (lutId, intensity) {
    var applied = VE._veForEachGradeTarget(function (g) {
      g.lutId = lutId;
      g.lutIntensity = intensity;
      delete g._customLUT;   // a preset and an imported .cube are alternatives, not a stack
    });
    if (!applied) return false;
    VE._veRenderPreviewFrame();
    VE._veRender();
    return true;
  };

  VE._veShowLutBrowser = function () {
    if (!window.VEAdvancedFeatures || !VEAdvancedFeatures.LUT_LIBRARY) {
      if (typeof showToast === 'function') showToast('LUT library could not be loaded', 'error');
      return;
    }
    var old = document.getElementById('ve-lut-browser');
    if (old) { old.remove(); return; }

    var LUT_LIB = VEAdvancedFeatures.LUT_LIBRARY;
    var LUT_CATS = VEAdvancedFeatures.LUT_CATEGORIES || {};
    var _cat = 'all', _q = '', _int = 100;

    var panel = document.createElement('div');
    panel.id = 've-lut-browser';
    panel.className = 've-lb';
    document.body.appendChild(panel);

    function head() {
      var t = _LUT_TARGET_LABEL(), sel = _pwSel();
      var _popped = window.VEFloat && VEFloat.isPopped(panel);
      var h = '<div class="ve-lb-head">' +
          '<span class="ve-lb-title">' + VE._veIcon('palette', 14) + ' LUT Browser</span>' +
          '<button class="ve-lb-x" data-act="popout" title="' + (_popped ? 'Undo' : 'Open in separate window') + '">' +
            VE._veIcon(_popped ? 'minimize-2' : 'external-link', 13) + '</button>' +
          '<button class="ve-lb-x" data-act="close" title="Close">' + VE._veIcon('x', 14) + '</button>' +
        '</div>' +
        '<div class="ve-lb-target">' +
          '<span class="ve-lb-tl">Target</span>' +
          '<button class="ve-lb-chip' + (t.win < 0 ? ' on' : '') + '" data-tgt="clip">Entire clip</button>';
      // The window chip only exists when there IS a window: an option that cannot do anything is
      // worse than no option.
      if (sel) {
        h += '<button class="ve-lb-chip' + (t.win >= 0 ? ' on is-win' : '') + '" data-tgt="win">' +
          '<i class="ve-lb-dot" style="background:' + sel.color + '"></i>' + sel.label + '</button>';
      }
      return h + '</div>';
    }

    function body() {
      var h = '<div class="ve-lb-search">' + VE._veIcon('search', 12) +
        '<input type="text" id="ve-lb-q" placeholder="Search LUT..." value="' + _q + '"></div>';
      h += '<div class="ve-lb-cats"><button class="ve-lb-cat' + (_cat === 'all' ? ' on' : '') +
        '" data-cat="all">All</button>';
      // LUT_CATEGORIES is {key: 'Display Name'}: filter by the KEY, show the NAME. Printing the key
      // would put "bw" and "correction" on the pills.
      Object.keys(LUT_CATS).forEach(function (c) {
        h += '<button class="ve-lb-cat' + (_cat === c ? ' on' : '') + '" data-cat="' + c + '">' +
          (LUT_CATS[c] || c) + '</button>';
      });
      h += '</div><div class="ve-lb-grid" id="ve-lb-grid">';
      var keys = Object.keys(LUT_LIB).filter(function (k) {
        var l = LUT_LIB[k];
        if (_cat !== 'all' && (l.category || '') !== _cat) return false;
        if (_q && (l.name || k).toLowerCase().indexOf(_q.toLowerCase()) === -1) return false;
        return true;
      });
      if (!keys.length) {
        h += '<div class="ve-lb-empty">No matching LUT.</div>';
      } else {
        keys.forEach(function (k) {
          // The canvas is wrapped in a padding-bottom 16:9 box. `aspect-ratio` on the canvas ALONE
          // collapsed inside the grid item (measured: 83px preview clipped to a 24px card = the
          // sliver bars), which is the well-known "aspect-ratio child contributes 0 min-height in
          // grid" trap. A padding-bottom wrapper reserves the height in every layout mode.
          h += '<button class="ve-lb-card" data-lut="' + k + '">' +
            '<div class="ve-lb-pvwrap"><canvas class="ve-lb-pv" data-lut="' + k + '" width="112" height="63"></canvas></div>' +
            '<span class="ve-lb-nm">' + (LUT_LIB[k].name || k) + '</span></button>';
        });
      }
      h += '</div>';
      h += '<div class="ve-lb-foot">' +
        '<label class="ve-lb-int"><span>Intensity</span>' +
          '<input type="range" id="ve-lb-int" min="0" max="100" value="' + _int + '">' +
          '<b id="ve-lb-intv">' + _int + '%</b></label>' +
        '<button class="ve-lb-imp" data-act="import">' + VE._veIcon('upload', 12) + ' Import .cube</button>' +
        '</div>';
      return h;
    }

    /* Preview source = the CURRENT FRAME, downscaled once and reused for every card. The old browser
       previewed a hue ramp, which tells you nothing about what a look does to YOUR footage. Falls
       back to a neutral ramp only when there is no frame to sample (no clip loaded yet). */
    function sampleFrame(w, h) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var x = c.getContext('2d');
      var src = VE._veUi && VE._veUi.previewCanvas;
      if (src && src.width > 0) {
        // COVER, not stretch (owner: "kapak fotoları strech olmuş cover olsun"). Centre-crop the
        // frame to the card's aspect so the footage keeps its proportions instead of being squashed.
        var sr = src.width / src.height, tr = w / h, sx, sy, sw, sh;
        if (sr > tr) { sh = src.height; sw = sh * tr; sx = (src.width - sw) / 2; sy = 0; }
        else { sw = src.width; sh = sw / tr; sx = 0; sy = (src.height - sh) / 2; }
        x.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
        return c;
      }
      for (var i = 0; i < w; i++) {
        var t = i / w;
        x.fillStyle = 'hsl(' + (t * 360) + ',65%,50%)'; x.fillRect(i, 0, 1, h * 0.5);
        x.fillStyle = 'rgb(' + Math.round(t * 255) + ',' + Math.round(t * 255) + ',' + Math.round(t * 255) + ')';
        x.fillRect(i, h * 0.5, 1, h * 0.5);
      }
      return c;
    }

    function paintPreviews() {
      var sample = sampleFrame(112, 63);
      panel.querySelectorAll('.ve-lb-pv').forEach(function (cv) {
        var ctx = cv.getContext('2d');
        ctx.drawImage(sample, 0, 0);
        if (!window.VEColorGrading) return;
        try {
          var d = ctx.getImageData(0, 0, cv.width, cv.height);
          VEColorGrading.processImageData(d, { enabled: true, lutId: cv.getAttribute('data-lut'), lutIntensity: 1 });
          ctx.putImageData(d, 0, 0);
        } catch (e) {}
      });
    }

    function paint() {
      panel.innerHTML = head() + body();
      paintPreviews();
      var hd = panel.querySelector('.ve-lb-head');
      // No drag while popped: it is a full-window static panel, and a drag would write inline
      // coordinates that fight the .is-popped layout.
      if (window.VEFloat && hd && !VEFloat.isPopped(panel)) window.VEFloat.drag(panel, hd, 'lutbrowser');
    }

    if (!(window.VEFloat && window.VEFloat.restorePos(panel, 'lutbrowser'))) {
      panel.style.left = Math.max(12, window.innerWidth - 660) + 'px';
      panel.style.top = '90px';
    }
    paint();

    panel.addEventListener('click', function (e) {
      // [data-tgt] MUST be in this list. It was not, so clicking a target chip resolved to null and
      // returned: the strip looked like a selector and did nothing, and every LUT kept going to the
      // selected window. That is the whole of "efekt veremiyordum videoya".
      var t = e.target.closest ? e.target.closest('[data-act],[data-cat],[data-lut],[data-tgt]') : null;
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'close') { if (window.VEFloat && VEFloat.isPopped(panel)) VEFloat.popIn(panel); panel.remove(); return; }
      if (act === 'popout') {
        if (window.VEFloat) { if (VEFloat.isPopped(panel)) VEFloat.popIn(panel); else VEFloat.popOut(panel, 'LUT Browser'); paint(); }
        return;
      }
      if (act === 'import') { doImport(); return; }
      var tgt = t.getAttribute('data-tgt');
      if (tgt) {
        VE._veGradeTarget = tgt;
        // The inspector's Color Grading panel reads the same target, so it must repaint or it would
        // keep editing the thing you just switched away from.
        if (window.VEInspector && VEInspector.isOpen() && VE._veSelectedClips && VE._veSelectedClips.length) {
          VEInspector.show(VE._veSelectedClips[0]);
        }
        if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
        // Repaint the HEAD only: a full paint() would rebuild the grid and lose the search box the
        // user may have typed into.
        var hd = panel.querySelector('.ve-lb-target');
        if (hd) {
          var tmp = document.createElement('div'); tmp.innerHTML = head();
          hd.innerHTML = tmp.querySelector('.ve-lb-target').innerHTML;
        }
        return;
      }
      var cat = t.getAttribute('data-cat');
      if (cat) { _cat = cat; paint(); return; }
      // Resolve the CARD, not the element clicked. The preview <canvas> also carries data-lut, so
      // clicking the IMAGE landed on the canvas (which is not .ve-lb-card) and the check below failed
      // silently: only clicking the NAME worked. Walk up to the card.
      var card = t.closest ? t.closest('.ve-lb-card') : null;
      if (card) {
        var lut = card.getAttribute('data-lut');
        if (lut && VE._veApplyLut(lut, _int / 100)) {
          panel.querySelectorAll('.ve-lb-card').forEach(function (c) { c.classList.remove('on'); });
          card.classList.add('on');
          if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
        }
      }
    });

    panel.addEventListener('input', function (e) {
      if (e.target.id === 've-lb-q') {
        _q = e.target.value;
        // Repaint the GRID only: a full paint() would replace the <input> the user is typing into
        // and drop focus after every keystroke.
        var g = panel.querySelector('#ve-lb-grid');
        if (!g) return;
        var tmp = document.createElement('div'); tmp.innerHTML = body();
        g.innerHTML = tmp.querySelector('#ve-lb-grid').innerHTML;
        paintPreviews();
        return;
      }
      if (e.target.id === 've-lb-int') {
        _int = +e.target.value;
        var v = panel.querySelector('#ve-lb-intv');
        if (v) v.textContent = _int + '%';
        var on = panel.querySelector('.ve-lb-card.on');
        if (on) VE._veApplyLut(on.getAttribute('data-lut'), _int / 100);
      }
    });

    function doImport() {
      var fi = document.createElement('input');
      fi.type = 'file';
      fi.accept = '.cube,.CUBE';
      fi.addEventListener('change', function () {
        if (!fi.files.length) return;
        var reader = new FileReader();
        reader.onload = function () {
          var lut = VEAdvancedFeatures.parseCubeFile(reader.result);
          if (!lut) { if (typeof showToast === 'function') showToast('Invalid .cube file', 'error'); return; }
          // An imported .cube honours the target too, through the same resolver, and applies to
          // every selected clip (single-clip only in Power Window mode). See _veForEachGradeTarget.
          var applied = VE._veForEachGradeTarget(function (g) {
            g._customLUT = lut;
            delete g.lutId;   // an imported .cube and a preset are alternatives, not a stack
          });
          if (!applied) return;
          if (typeof showToast === 'function') showToast('LUT loaded: ' + (lut.title || fi.files[0].name));
          VE._veRenderPreviewFrame();
        };
        reader.readAsText(fi.files[0]);
      });
      fi.click();
    }
  };

  VE._veShowPluginManager = function () {
    if (!window.VEPluginSystem) {
      if (typeof showToast === 'function') showToast('Plugin system not available', 'error');
      return;
    }
    var old = document.getElementById('ve-plugin-mgr');
    if (old) { old.remove(); return; }

    var panel = document.createElement('div');
    panel.id = 've-plugin-mgr';
    panel.style.cssText = 'position:fixed;right:20px;top:80px;width:340px;max-height:500px;overflow-y:auto;z-index:10005;background:var(--surface,#131316);border:1px solid var(--border,#27272d);border-radius:10px;padding:0;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    var plugins = VEPluginSystem.getRegistered();

    var html = '<div style="padding:12px 16px;border-bottom:1px solid var(--border,#27272d);display:flex;justify-content:space-between;align-items:center;cursor:move;">' +
      '<span style="font-weight:600;font-size:13px;color:var(--text,#ededf0);">' + VE._veIcon('puzzle', 14) + ' Plugin Manager (' + plugins.length + ')</span>' +
      '<button id="ve-pm-close" style="background:none;border:none;color:var(--text-dim);cursor:pointer;">' + VE._veIcon('x', 14) + '</button>' +
    '</div>';
    html += '<div style="padding:12px 16px;">';

    if (!plugins.length) {
      html += '<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:12px;">' +
        VE._veIcon('puzzle', 20) + '<br><br>No plugins registered<br>' +
        '<span style="font-size:11px;opacity:0.7;">Plugins extend the video editor with<br>custom effects and processing hooks.<br>' +
        'Use <code style="background:var(--surface2);padding:1px 4px;border-radius:3px;">VEPluginSystem.registerPlugin()</code><br>to add plugins.</span></div>';
    }

    plugins.forEach(function(p) {
      var isEnabled = VEPluginSystem.isEnabled(p.name);
      html += '<div class="ve-pm-plugin" style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">' +
        '<div style="flex:1;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--text,#ededf0);">' + VE._esc(p.name) + '</div>' +
          '<div style="font-size:10px;color:var(--text-dim);">Instances: ' + (p.instanceCount || 0) + '</div>' +
        '</div>' +
        '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;">' +
          '<input type="checkbox" class="ve-pm-toggle" data-plugin-name="' + VE._esc(p.name) + '"' + (isEnabled ? ' checked' : '') + ' style="cursor:pointer;">' +
          '<span style="font-size:11px;color:' + (isEnabled ? '#81c784' : '#ff6b6b') + ';">' + (isEnabled ? 'ON' : 'OFF') + '</span>' +
        '</label>' +
      '</div>';
    });

    // Hooks info
    var hookNames = VEPluginSystem.HOOK_NAMES || [];
    html += '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px;">' +
      '<div style="font-size:11px;opacity:0.6;margin-bottom:4px;">Available Hooks (' + hookNames.length + '):</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
    hookNames.forEach(function(h) {
      html += '<span style="padding:1px 6px;font-size:9px;border-radius:3px;background:var(--surface2);color:var(--text-dim);">' + h + '</span>';
    });
    html += '</div></div>';

    html += '</div>';
    panel.innerHTML = html;
    document.body.appendChild(panel);

    // Bind events
    document.getElementById('ve-pm-close').addEventListener('click', function() { panel.remove(); });

    panel.querySelectorAll('.ve-pm-toggle').forEach(function(toggle) {
      toggle.addEventListener('change', function() {
        var name = toggle.getAttribute('data-plugin-name');
        if (toggle.checked) {
          VEPluginSystem.enablePlugin(name);
        } else {
          VEPluginSystem.disablePlugin(name);
        }
        // Refresh
        panel.remove();
        VE._veShowPluginManager();
        if (typeof showToast === 'function') showToast('Plugin ' + name + (toggle.checked ? ' enabled' : ' disabled'));
      });
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'advanced-panels', parent: 'video.video-editor', title: 'video-editor: advanced-panels', mount: function () {}, unmount: function () {} });
  }
})();

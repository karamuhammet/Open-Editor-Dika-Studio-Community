/* Module: canvas/tools/brush-tool/myshapes — My Shapes asset DB + save/delete/rename/insert + the My Shapes panel.
   Part of the brush-tool group (decomposed from the 1532-line IIFE). Functions hang off the
   shared namespace BT (window.__ccBrushTool, created by the parent); cross-module refs resolve
   through BT at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var BT = window.__ccBrushTool;
  if (!BT) return;

  /* Saved shapes moved from `CardCraftMyShapes` with the rename; the copy runs before this open
     (docs/dika-rename-plan.md P5). */
  BT._openShapesDB = function (cb) {
    var moved = (window.CCMigrate && window.CCMigrate.db)
      ? window.CCMigrate.db('CardCraftMyShapes', BT.MY_SHAPES_DB) : Promise.resolve(false);
    moved.then(function () { BT._openShapesDBNow(cb); });
  };

  BT._openShapesDBNow = function (cb) {
    var req = indexedDB.open(BT.MY_SHAPES_DB, 2);      // v2 adds the folders store (idempotent upgrade)
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(BT.MY_SHAPES_STORE)) {
        db.createObjectStore(BT.MY_SHAPES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BT.MY_SHAPES_FOLDER_STORE)) {
        db.createObjectStore(BT.MY_SHAPES_FOLDER_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = function (e) { cb(e.target.result); };
    req.onerror = function () { console.error('MyShapes DB error'); };
  };

  BT._isTextLikeMyShape = function (obj) {
    return !!(obj && (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox'));
  };

  BT._isBaseShapeType = function (obj) {
    return !!(obj && (
      obj.type === 'path' ||
      obj.type === 'rect' ||
      obj.type === 'circle' ||
      obj.type === 'ellipse' ||
      obj.type === 'triangle' ||
      obj.type === 'polygon' ||
      obj.type === 'polyline' ||
      obj.type === 'line' ||
      obj.type === 'group'
    ));
  };

  BT._isSavableMyShape = function (obj) {
    return !!(obj && (
      BT._isBaseShapeType(obj) ||
      !!obj._isBrushShape ||
      !!obj._isMyShapeAsset ||
      (!!obj.path && obj.type !== 'text' && obj.type !== 'i-text' && obj.type !== 'textbox')
    ));
  };

  BT._canConvertToShapeAsset = function (obj) {
    return !!(obj && !BT._isSavableMyShape(obj) && !obj._isFrame && !obj._isClippedImage && obj.type !== 'activeSelection' && (
      obj.type === 'image' ||
      BT._isTextLikeMyShape(obj) ||
      !!obj._isBrushShape ||
      !!obj._isMyShapeAsset
    ));
  };

  BT._getMyShapeDefaultName = function (obj) {
    if (!obj) return 'My Shape';
    if (BT._isTextLikeMyShape(obj)) {
      var raw = String(obj.text || '').replace(/\s+/g, ' ').trim();
      if (raw) return raw.slice(0, 32);
      return 'Text Shape';
    }
    return obj._customName || obj._wbName || 'My Shape';
  };

  BT._markObjectAsMyShapeAsset = function (obj, name, sourceType) {
    if (!obj) return;
    obj._isBrushShape = true;
    obj._isMyShapeAsset = true;
    obj._myShapeSourceType = sourceType || obj._myShapeSourceType || obj.type || 'object';
    obj._myShapeDisplayName = name || obj._myShapeDisplayName || obj._customName || BT._getMyShapeDefaultName(obj);
    obj._customName = name || obj._customName || obj._myShapeDisplayName;
    if (BT._isTextLikeMyShape(obj)) {
      if (typeof obj.exitEditing === 'function') {
        try { obj.exitEditing(); } catch (err) {}
      }
      obj.editable = false;
      obj.isEditing = false;
      if (typeof window.ensureTextShapeAssetPadding === 'function') {
        window.ensureTextShapeAssetPadding(obj);
      }
    }
  };

  BT.convertObjectToShapeAsset = function (targetObj, name) {
    var cvs = BT._getCvs();
    var obj = targetObj || (cvs && cvs.getActiveObject ? cvs.getActiveObject() : null);
    if (!BT._canConvertToShapeAsset(obj)) {
      if (typeof showToast === 'function') showToast('This object cannot be converted to a shape.');
      return;
    }

    var shapeName = name || BT._getMyShapeDefaultName(obj);
    BT._markObjectAsMyShapeAsset(obj, shapeName, obj._myShapeSourceType || obj.type || 'object');

    if (obj.canvas) {
      obj.setCoords();
      obj.canvas.setActiveObject(obj);
      obj.canvas.requestRenderAll();
    }
    if (typeof snap === 'function') snap();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
    if (typeof showToast === 'function') showToast('Converted to shape: ' + shapeName);
  };

  BT._showShapeNameModal = function (defaultName, callback) {
    var existing = document.getElementById('shape-name-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'shape-name-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--surface,#131316);border:1px solid var(--border2,#35353c);border-radius:12px;padding:24px 28px;min-width:340px;max-width:420px;box-shadow:0 16px 48px rgba(0,0,0,0.6);';

    var title = document.createElement('div');
    title.textContent = 'Save Shape';
    title.style.cssText = 'font-size:15px;font-weight:600;color:var(--text,#ededf0);margin-bottom:16px;';

    var label = document.createElement('div');
    label.textContent = 'Shape name';
    label.style.cssText = 'font-size:12px;color:var(--text-dim,#8b8b96);margin-bottom:6px;';

    var input = document.createElement('input');
    input.type = 'text';
    input.value = defaultName || '';
    input.style.cssText = 'width:100%;box-sizing:border-box;padding:9px 12px;font-size:13px;font-family:inherit;background:var(--surface2,#1b1b1f);border:1px solid var(--border,#27272d);border-radius:8px;color:var(--text,#ededf0);outline:none;';
    input.addEventListener('focus', function () { input.style.borderColor = 'var(--gold,#f2ff58)'; });
    input.addEventListener('blur', function () { input.style.borderColor = 'var(--border,#27272d)'; });

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:18px;';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:7px 18px;font-size:12px;font-family:inherit;border:1px solid var(--border2,#35353c);border-radius:8px;background:var(--surface2,#1b1b1f);color:var(--text,#ededf0);cursor:pointer;';

    var saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:7px 22px;font-size:12px;font-family:inherit;border:none;border-radius:8px;background:var(--gold,#f2ff58);color:#0b0b0d;font-weight:600;cursor:pointer;';

    function _close(val) {
      overlay.remove();
      if (callback) callback(val);
    }

    cancelBtn.onclick = function () { _close(null); };
    saveBtn.onclick = function () {
      var v = input.value.trim();
      _close(v || null);
    };
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { saveBtn.click(); }
      if (e.key === 'Escape') { cancelBtn.click(); }
    });
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) _close(null);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    box.appendChild(title);
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(function () { input.focus(); input.select(); }, 50);
  };

  BT.saveToMyShapes = function (name) {
    var shape = null;
    var cvs = BT._getCvs();
    if (cvs && cvs.getActiveObject && BT._isSavableMyShape(cvs.getActiveObject())) {
      shape = cvs.getActiveObject();
    } else if (BT._isSavableMyShape(window._lastBrushShape)) {
      shape = window._lastBrushShape;
    }
    if (!shape || !BT._isSavableMyShape(shape)) {
      if (typeof showToast === 'function') showToast('No reusable shape selected.');
      return;
    }

    if (!name) {
      BT._showShapeNameModal(BT._getMyShapeDefaultName(shape), function (enteredName) {
        if (!enteredName) return;
        window.saveToMyShapes(enteredName);
      });
      return;
    }

    /* Generate thumbnail from shape bounding box */
    var bb = shape.getBoundingRect();
    var thumbSize = 80;
    var scale = Math.min(thumbSize / bb.width, thumbSize / bb.height, 1);

    var tmpCvs = document.createElement('canvas');
    tmpCvs.width = thumbSize;
    tmpCvs.height = thumbSize;
    var ctx = tmpCvs.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, thumbSize, thumbSize);

    /* Clone shape to temp Static canvas for thumbnail */
    var tmpFab = new fabric.StaticCanvas(null, { width: thumbSize, height: thumbSize });
    shape.clone(function (cloned) {
      cloned.set({
        left: thumbSize / 2, top: thumbSize / 2,
        originX: 'center', originY: 'center',
        scaleX: scale * 0.8, scaleY: scale * 0.8
      });
      tmpFab.add(cloned);
      tmpFab.setBackgroundColor('#1a1a2e', function () {
        tmpFab.renderAll();
        var thumb = tmpFab.toDataURL({ format: 'png' });
        tmpFab.dispose();

        var sourceType = shape.type || 'object';
        var objectData = shape.toObject((typeof CUSTOM_PROPS !== 'undefined' && CUSTOM_PROPS) ? CUSTOM_PROPS : []);
        objectData._isBrushShape = true;
        objectData._isMyShapeAsset = true;
        objectData._myShapeSourceType = sourceType;
        objectData._myShapeDisplayName = name;
        objectData._customName = name;
        objectData.selectable = true;
        objectData.evented = true;
        if (BT._isTextLikeMyShape(shape)) {
          objectData.editable = false;
          objectData.isEditing = false;
        }
        var pathData = (shape.type === 'path' || shape._isBrushShape || shape.path)
          ? shape.toObject(['path', 'fill', 'stroke', 'strokeWidth', 'width', 'height', 'scaleX', 'scaleY'])
          : null;

        var entry = {
          id: 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name: name,
          thumb: thumb,
          objectData: objectData,
          pathData: pathData,
          sourceType: sourceType,
          shapeSourceType: sourceType,
          isShapeAsset: true,
          // file the new shape into the folder the browser currently has open (null = root)
          folderId: (window._myShapesSaveTarget != null ? window._myShapesSaveTarget : null),
          created: Date.now()
        };

        BT._openShapesDB(function (db) {
          var tx = db.transaction(BT.MY_SHAPES_STORE, 'readwrite');
          tx.objectStore(BT.MY_SHAPES_STORE).put(entry);
          tx.oncomplete = function () {
            BT._markObjectAsMyShapeAsset(shape, name, sourceType);
            if (shape.canvas) {
              shape.setCoords();
              shape.canvas.requestRenderAll();
            }
            if (typeof refreshStructure === 'function') refreshStructure();
            if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
            if (typeof showToast === 'function') showToast('Shape saved: ' + name);
            BT._renderMyShapesPanel();
          };
        });
      });
    });
  };

  BT.deleteMyShape = function (id) {
    BT._openShapesDB(function (db) {
      var tx = db.transaction(BT.MY_SHAPES_STORE, 'readwrite');
      tx.objectStore(BT.MY_SHAPES_STORE).delete(id);
      tx.oncomplete = function () {
        if (typeof showToast === 'function') showToast('Shape deleted');
        BT._renderMyShapesPanel();
      };
    });
  };

  BT.renameMyShape = function (id) {
    BT._openShapesDB(function (db) {
      var tx = db.transaction(BT.MY_SHAPES_STORE, 'readonly');
      var req = tx.objectStore(BT.MY_SHAPES_STORE).get(id);
      req.onsuccess = function () {
        var entry = req.result;
        if (!entry) return;
        var newName = prompt('Rename shape:', entry.name);
        if (!newName) return;
        entry.name = newName;
        var tx2 = db.transaction(BT.MY_SHAPES_STORE, 'readwrite');
        tx2.objectStore(BT.MY_SHAPES_STORE).put(entry);
        tx2.oncomplete = function () { BT._renderMyShapesPanel(); };
      };
    });
  };

  BT.insertMyShape = function (id) {
    BT._openShapesDB(function (db) {
      var tx = db.transaction(BT.MY_SHAPES_STORE, 'readonly');
      var req = tx.objectStore(BT.MY_SHAPES_STORE).get(id);
      req.onsuccess = function () {
        var entry = req.result;
        if (!entry || (!entry.objectData && !entry.pathData)) return;
        var cvs = BT._getCvs();
        if (!cvs) return;

        fabric.util.enlivenObjects([entry.objectData || entry.pathData], function (objects) {
          if (objects[0]) {
            var restored = objects[0];
            restored.set({ selectable: true, evented: true, _customName: entry.name });
            BT._markObjectAsMyShapeAsset(restored, entry.name, entry.shapeSourceType || entry.sourceType);
            if (typeof addToCenter === 'function') {
              addToCenter(restored);
            } else {
              cvs.add(restored);
              cvs.setActiveObject(restored);
              cvs.renderAll();
            }
            if (typeof refreshStructure === 'function') refreshStructure();
            if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
            if (typeof showToast === 'function') showToast('Shape inserted: ' + entry.name);
          }
        });
      };
    });
  };

  BT._renderMyShapesPanel = function () {
    // Keep the dedicated enterprise browser in sync on every shape mutation.
    if (window.MyShapesBrowser && typeof window.MyShapesBrowser.refresh === 'function') window.MyShapesBrowser.refresh();
    var container = document.getElementById('my-shapes-grid');
    if (!container) return;

    BT._openShapesDB(function (db) {
      var tx = db.transaction(BT.MY_SHAPES_STORE, 'readonly');
      var store = tx.objectStore(BT.MY_SHAPES_STORE);
      var all = [];
      store.openCursor().onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) {
          all.push(cursor.value);
          cursor.continue();
        } else {
          BT._buildMyShapesGrid(container, all);
        }
      };
    });
  };

  BT._buildMyShapesGrid = function (container, shapes) {
    container.innerHTML = '';
    if (shapes.length === 0) {
      container.innerHTML = '<div style="color:var(--text-faint);font-size:11px;padding:12px;text-align:center;">No saved shapes yet.<br>Save a path, brush shape, or text object</div>';
      return;
    }

    /* Sort newest first */
    shapes.sort(function (a, b) { return b.created - a.created; });

    shapes.forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'my-shape-card';
      card.title = s.name;

      var img = document.createElement('img');
      img.src = s.thumb;
      img.alt = s.name;
      img.className = 'my-shape-thumb';
      card.appendChild(img);

      var label = document.createElement('div');
      label.className = 'my-shape-label';
      label.textContent = s.name;
      card.appendChild(label);

      /* Click to insert */
      card.addEventListener('click', function (e) {
        if (e.target.closest('.my-shape-actions')) return;
        BT.insertMyShape(s.id);
      });

      /* Actions */
      var actions = document.createElement('div');
      actions.className = 'my-shape-actions';

      var btnRen = document.createElement('button');
      btnRen.className = 'my-shape-action-btn';
      btnRen.title = 'Rename';
      btnRen.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      btnRen.onclick = function (e) { e.stopPropagation(); BT.renameMyShape(s.id); };
      actions.appendChild(btnRen);

      var btnDel = document.createElement('button');
      btnDel.className = 'my-shape-action-btn danger';
      btnDel.title = 'Delete';
      btnDel.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      btnDel.onclick = function (e) { e.stopPropagation(); BT.deleteMyShape(s.id); };
      actions.appendChild(btnDel);

      card.appendChild(actions);
      container.appendChild(card);
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'myshapes', parent: 'canvas.tools.brush-tool', title: 'brush-tool: myshapes', mount: function () {}, unmount: function () {} });
  }
})();

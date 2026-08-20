/* ===== Structure / Layers Panel ===== */

let structureVisible = false;

function initStructurePanel() {
  const panel = document.createElement('div');
  panel.id = 'structure-panel';
  panel.className = 'structure-panel';
  panel.innerHTML = `
    <div class="structure-header" id="structure-drag-handle">
      <div class="sh-icons">
        <button onclick="collapseStructure()" title="Collapse">${getIcon('minus', 14)}</button>
        <button onclick="expandStructure()" title="Expand">${getIcon('plus', 14)}</button>
      </div>
      <span class="sh-title">Structure</span>
      <button onclick="toggleStructurePanel()" title="Close">${getIcon('close', 14)}</button>
    </div>
    <div class="structure-body" id="structure-body"></div>
    <div class="structure-footer">
      <button title="More options">···</button>
    </div>
  `;
  document.body.appendChild(panel);

  panel.style.right = '270px';
  panel.style.bottom = '80px';

  makeDraggable(panel, document.getElementById('structure-drag-handle'));

  canvas.on('object:added', refreshStructure);
  canvas.on('object:removed', refreshStructure);
  canvas.on('object:modified', refreshStructure);
  canvas.on('selection:created', highlightActiveLayer);
  canvas.on('selection:updated', highlightActiveLayer);
  canvas.on('selection:cleared', clearLayerHighlight);
}

function getLayerDisplayInfo(obj) {
  let name = 'Object';
  let typeIcon = 'rectangle';

  // ── Frame checks FIRST (before type checks, since frames may be rect/path) ──
  if (obj._isFrame && obj._isClippedImage) {
    name = obj._imageName || 'Framed Image';
    typeIcon = 'frame';
  } else if (obj._isFrame && !obj._isClippedImage && obj._boundImageUid) {
    name = 'Linked Frame';
    typeIcon = 'frame';
  } else if (obj._isFrame && !obj._isClippedImage) {
    name = 'Frame';
    typeIcon = 'frame';
  } else if (obj._isMyShapeAsset || obj._isBrushShape) {
    name = obj._customName || obj._myShapeDisplayName || obj._iconName || 'Shape';
    typeIcon = 'shape';
  } else if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
    name = (obj.text || '').substring(0, 20) || 'Text';
    typeIcon = 'text';
  } else if (obj.isQR) {
    name = 'QR Code';
    typeIcon = 'qr';
  } else if (obj._ccType === 'barcode' || obj._barcodeType || obj._barcodeValue) {
    name = obj._barcodeValue ? ('Barcode: ' + String(obj._barcodeValue).substring(0, 18)) : 'Barcode';
    typeIcon = 'barcode';
  } else if (obj.type === 'image') {
    if (obj._isVideoMedia) {
      name = obj._videoName || obj._imageName || 'Video';
      typeIcon = 'video';
    } else if (obj._isAnimatedGif || obj._isGif) {
      name = obj._gifTitle || 'GIF';
      typeIcon = 'film';
    } else if (obj._isSticker) {
      name = obj._stickerTitle || 'Sticker';
      typeIcon = 'smile';
    } else if (obj._isEmoji) {
      name = 'Emoji';
      typeIcon = 'smile';
    } else {
      name = obj._imageName || 'Image';
      typeIcon = 'image';
    }
  } else if (obj.type === 'rect') {
    name = 'Rectangle';
    typeIcon = 'rectangle';
  } else if (obj.type === 'circle') {
    name = 'Circle';
    typeIcon = 'circle';
  } else if (obj.type === 'triangle') {
    name = 'Triangle';
    typeIcon = 'triangle';
  } else if (obj.type === 'polygon') {
    name = 'Polygon';
    typeIcon = 'star';
  } else if (obj.type === 'line') {
    name = 'Line';
    typeIcon = 'line';
  } else if (obj.type === 'path') {
    name = obj._iconName || 'Shape';
    typeIcon = 'shape';
  } else if (obj.type === 'gridLayout' || (obj.type === 'group' && obj._isGridLayout)) {
    name = obj._customName || ('Grid ' + (obj._gridCols || '?') + '\u00d7' + (obj._gridRows || '?'));
    typeIcon = 'grid';
  } else if (obj._isEmoji && obj.type === 'group') {
    name = 'Emoji';
    typeIcon = 'smile';
  } else if (obj.type === 'ccframe') {
    // scene frame container — distinct from the generic GROUP feature (own label + frame icon)
    name = obj.label || obj._groupName || 'Frame';
    typeIcon = (typeof getIcon === 'function' && getIcon('frame', 14)) ? 'frame' : 'group';
  } else if (obj.type === 'group') {
    name = obj._iconName || obj._groupName || ('Group (' + obj.getObjects().length + ')');
    typeIcon = typeof getIcon === 'function' && getIcon('group', 14) ? 'group' : 'shape';
  }

  return { name, typeIcon };
}

function selectStructureObject(obj) {
  if (!obj) return;
  canvas.setActiveObject(obj);
  canvas.renderAll();
}

function attachRootLayerDragAndDrop(item, realIdx) {
  item.ondragstart = function (e) {
    e.dataTransfer.setData('text/plain', item.dataset.idx);
    item.classList.add('dragging');
  };
  item.ondragend = function () {
    item.classList.remove('dragging');
  };
  item.ondragover = function (e) {
    e.preventDefault();
    item.classList.add('drag-over');
  };
  item.ondragleave = function () {
    item.classList.remove('drag-over');
  };
  item.ondrop = function (e) {
    e.preventDefault();
    item.classList.remove('drag-over');
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const toIdx = parseInt(item.dataset.idx, 10);
    if (fromIdx !== toIdx && !isNaN(fromIdx) && !isNaN(toIdx)) {
      const movedObj = canvas.getObjects()[fromIdx];
      if (movedObj) {
        // The list renders topmost-first, so the UPPER half of a row means
        // "place above the target in z" and the lower half "place below".
        // Fabric's moveTo removes the object first, shifting indices above
        // fromIdx down by one; both cases must compensate for that. Without
        // the upper-half case the top slot was unreachable (max index N-2).
        const rect = item.getBoundingClientRect();
        const dropAbove = e.clientY < rect.top + rect.height / 2;
        let destIdx = dropAbove
          ? (fromIdx < toIdx ? toIdx : toIdx + 1)
          : (fromIdx < toIdx ? toIdx - 1 : toIdx);
        destIdx = Math.max(0, Math.min(canvas.getObjects().length - 1, destIdx));
        canvas.moveTo(movedObj, destIdx);
        canvas.renderAll();
        snap();
        refreshStructure();
      }
    }
  };
}

function refreshStructure() {
  const body = document.getElementById('structure-body');
  if (!body) return;
  const objects = canvas.getObjects().slice().reverse();
  body.innerHTML = '';

  if (typeof pages !== 'undefined' && pages.length > 1) {
    var pageLabel = document.createElement('div');
    pageLabel.className = 'structure-page-indicator';
    var idx = typeof currentPageIndex !== 'undefined' ? currentPageIndex : 0;
    var label = pages[idx] && pages[idx].label ? pages[idx].label : ('Page ' + (idx + 1));
    if (pages[idx] && typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(pages[idx])) {
      var deck = pages[idx]._slideDeck;
      var slideIdx = deck && typeof deck.activeSlideIndex === 'number' ? deck.activeSlideIndex : 0;
      var slideCount = deck && deck.slides ? deck.slides.length : 0;
      label += ' • Slide ' + (slideIdx + 1) + '/' + slideCount;
    }
    pageLabel.textContent = label + ' (' + (idx + 1) + '/' + pages.length + ')';
    body.appendChild(pageLabel);
  }

  /* ── Build frame↔image link map (using direct object references) ── */
  var allObjs = canvas.getObjects();
  var skipObjs = new Set();           // objects to skip in main loop
  var imageFrameChildren = new Map(); // imageObj → [frameObj, ...]

  // Pass 1: find all bound frames, match them to their source image
  allObjs.forEach(function (o) {
    if (o._isFrame && !o._isClippedImage && o._boundImageUid) {
      // Find source image by scanning all objects for matching _uid
      for (var i = 0; i < allObjs.length; i++) {
        if (allObjs[i]._uid === o._boundImageUid && allObjs[i] !== o) {
          if (!imageFrameChildren.has(allObjs[i])) imageFrameChildren.set(allObjs[i], []);
          imageFrameChildren.get(allObjs[i]).push(o);
          skipObjs.add(o);
          break;
        }
      }
    }
  });

  objects.forEach((obj, idx) => {
    const realIdx = canvas.getObjects().length - 1 - idx;

    // Skip frames already rendered as children under their source image
    if (skipObjs.has(obj)) return;

    if (obj.isSmartGuide || obj._isGridLine || obj._isGuide || obj._isPattern || obj._isWbLabel || obj.excludeFromExport || obj._isPerspHandle || obj._isPerspOutline || obj._isPerspWarp || obj._isPeHandle || obj._isPeOutline || obj._isPenPreview || obj._isPenHandle) return;

    /* ── Grid Layout — render cells as children ── */
    if (obj._isGridLayout) {
      var block = document.createElement('div');
      block.className = 'layer-group-block';

      var header = document.createElement('div');
      header.className = 'layer-item layer-group-header';
      header.draggable = true;
      header.dataset.idx = String(realIdx);

      var gInfo = getLayerDisplayInfo(obj);
      var visIcon2 = obj.visible !== false ? getIcon('eye', 12) : getIcon('eyeOff', 12);
      var lockIcon2 = obj.lockMovementX ? getIcon('lock', 12) : getIcon('unlock', 12);

      var toggle = document.createElement('span');
      toggle.className = 'layer-group-toggle';
      toggle.setAttribute('role', 'button');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.title = 'Expand / collapse';
      toggle.textContent = '\u25be';

      var childrenWrap = document.createElement('div');
      childrenWrap.className = 'layer-group-children';

      header.innerHTML =
        '<span class="layer-grip" title="Drag to reorder">' + getIcon('grip', 12) + '</span>' +
        '<span class="layer-icon">' + getIcon(gInfo.typeIcon, 14) + '</span>' +
        '<span class="layer-name">' + gInfo.name + '</span>' +
        '<span class="layer-actions">' +
          '<button onclick="toggleLayerVisibility(' + realIdx + ')" title="Visibility">' + visIcon2 + '</button>' +
          '<button onclick="toggleLayerLock(' + realIdx + ')" title="Lock">' + lockIcon2 + '</button>' +
        '</span>';
      header.insertBefore(toggle, header.firstChild);

      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var collapsed = childrenWrap.style.display === 'none';
        childrenWrap.style.display = collapsed ? '' : 'none';
        toggle.textContent = collapsed ? '\u25be' : '\u25b8';
        toggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      });

      var active2 = canvas.getActiveObject();
      if (active2 === obj) header.classList.add('active');

      header.onclick = function (e) {
        if (e.target.closest('.layer-actions') || e.target.closest('.layer-group-toggle')) return;
        selectStructureObject(obj);
      };

      attachRootLayerDragAndDrop(header, realIdx);

      // Render cells
      var cells = obj._cells || [];
      var gridObjs = typeof obj.getObjects === 'function' ? obj.getObjects() : [];
      for (var ci = 0; ci < cells.length; ci++) {
        (function (cellMeta) {
          var cellRow = cellMeta.row, cellCol = cellMeta.col;
          var cellLabel = 'Cell (' + (cellRow + 1) + ',' + (cellCol + 1) + ')';

          // Find child image for this cell
          var cellImg = null;
          for (var gi = 0; gi < gridObjs.length; gi++) {
            if (gridObjs[gi]._isGridCellImage &&
                gridObjs[gi]._gridCellRow === cellRow &&
                gridObjs[gi]._gridCellCol === cellCol) {
              cellImg = gridObjs[gi];
              break;
            }
          }

          var cellItem = document.createElement('div');
          cellItem.className = 'layer-item layer-child layer-grid-cell';
          cellItem.dataset.gridIdx = String(realIdx);
          cellItem.dataset.cellRow = String(cellRow);
          cellItem.dataset.cellCol = String(cellCol);
          cellItem.style.paddingLeft = '28px';
          cellItem.style.fontSize = '12px';

          var cellIcon = cellImg ? getIcon('image', 12) : getIcon('rectangle', 12);
          var cellName = cellImg ? (cellLabel + ' \u2014 Image') : cellLabel;

          cellItem.innerHTML =
            '<span class="layer-grip" style="visibility:hidden" aria-hidden="true">' + getIcon('grip', 12) + '</span>' +
            '<span class="layer-icon">' + cellIcon + '</span>' +
            '<span class="layer-name">' + cellName + '</span>' +
            (cellImg ? '<span class="layer-actions"><button class="layer-cell-remove" title="Remove from cell" style="color:#e55;font-size:10px">' + getIcon('close', 10) + '</button></span>' : '');

          cellItem.onclick = function (e) {
            if (e.target.closest('.layer-actions')) return;
            // Select the grid, then show toolbar for this cell
            selectStructureObject(obj);
            if (typeof _glUpdateToolbar === 'function') {
              if (typeof _glShowGridToolbar === 'function' && !document.getElementById('grid-cell-toolbar')) {
                _glShowGridToolbar(obj);
              }
              _glUpdateToolbar(obj, cellMeta);
            }
          };

          // Right-click → cell context menu
          cellItem.addEventListener('contextmenu', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            _showCellLayerContextMenu(ev, obj, cellMeta, cellImg);
          });

          // Remove from cell shortcut button
          var rmBtn = cellItem.querySelector('.layer-cell-remove');
          if (rmBtn) {
            rmBtn.onclick = function (ev) {
              ev.stopPropagation();
              _removeCellContent(obj, cellMeta);
            };
          }

          childrenWrap.appendChild(cellItem);
        })(cells[ci]);
      }

      block.appendChild(header);
      block.appendChild(childrenWrap);
      body.appendChild(block);
      return;
    }

    if (obj.type === 'group' || obj.type === 'ccframe') {
      const isCcFrame = obj.type === 'ccframe';
      const block = document.createElement('div');
      block.className = 'layer-group-block' + (isCcFrame ? ' layer-frame-block' : '');

      const header = document.createElement('div');
      header.className = 'layer-item layer-group-header' + (isCcFrame ? ' layer-frame-header' : '');
      header.draggable = true;
      header.dataset.idx = String(realIdx);

      const gInfo = getLayerDisplayInfo(obj);
      const visIcon = obj.visible !== false ? getIcon('eye', 12) : getIcon('eyeOff', 12);
      const lockIcon = obj.lockMovementX ? getIcon('lock', 12) : getIcon('unlock', 12);

      const toggle = document.createElement('span');
      toggle.className = 'layer-group-toggle';
      toggle.setAttribute('role', 'button');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.title = 'Expand / collapse';
      toggle.textContent = '▾';

      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'layer-group-children';

      header.innerHTML = `
        <span class="layer-grip" title="Drag to reorder">${getIcon('grip', 12)}</span>
        <span class="layer-icon">${getIcon(gInfo.typeIcon, 14)}</span>
        <span class="layer-name">${gInfo.name}</span>
        <span class="layer-actions">
          <button onclick="toggleLayerVisibility(${realIdx})" title="Visibility">${visIcon}</button>
          <button onclick="toggleLayerLock(${realIdx})" title="Lock">${lockIcon}</button>
        </span>
      `;
      const grip = header.querySelector('.layer-grip');
      if (grip && grip.parentNode === header) {
        header.insertBefore(toggle, grip);
      } else {
        header.insertBefore(toggle, header.firstChild);
      }

      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        const collapsed = childrenWrap.style.display === 'none';
        childrenWrap.style.display = collapsed ? '' : 'none';
        toggle.textContent = collapsed ? '▾' : '▸';
        toggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      });

      const active = canvas.getActiveObject();
      if (active === obj) header.classList.add('active');

      header.onclick = function (e) {
        if (e.target.closest('.layer-actions') || e.target.closest('.layer-group-toggle')) return;
        selectStructureObject(obj);
      };

      var nameSpan = header.querySelector('.layer-name');
      if (nameSpan) {
        nameSpan.ondblclick = function (e) {
          e.stopPropagation();
          var current = obj._groupName || nameSpan.textContent;
          var input = document.createElement('input');
          input.type = 'text';
          input.value = current;
          input.style.cssText = 'width:80px;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:2px 4px;border-radius:3px;font-size:11px';
          nameSpan.textContent = '';
          nameSpan.appendChild(input);
          input.focus();
          input.select();
          function save() {
            var val = input.value.trim();
            if (isCcFrame) {
              obj.label = val || obj.label || 'Frame';
              nameSpan.textContent = obj.label;
              var SCe = window.__ccSceneEditor;   // sync the model frame's label
              if (obj._frameId && SCe && SCe._curScene && SCe._findFrame) {
                var f = SCe._findFrame(SCe._curScene(), obj._frameId); if (f) f.label = obj.label;
              }
            } else {
              obj._groupName = val || '';
              nameSpan.textContent = val || ('Group (' + obj.getObjects().length + ')');
            }
            if (typeof snap === 'function') snap();
          }
          input.onblur = save;
          input.onkeydown = function (ev) {
            if (ev.key === 'Enter') { save(); }
            if (ev.key === 'Escape') { nameSpan.textContent = current; }
          };
        };
      }

      attachRootLayerDragAndDrop(header, realIdx);

      obj.getObjects().forEach(function (child, cIdx) {
        if (child._isFrameBg) return;   // CCFrame artboard backdrop — not a user layer
        const info = getLayerDisplayInfo(child);
        const childItem = document.createElement('div');
        childItem.className = 'layer-item layer-child';
        childItem.draggable = false;
        childItem.dataset.groupIdx = String(realIdx);
        childItem.dataset.childIdx = String(cIdx);
        childItem.style.paddingLeft = '28px';
        childItem.style.fontSize = '12px';

        const cVis = child.visible !== false ? getIcon('eye', 12) : getIcon('eyeOff', 12);
        const cLock = child.lockMovementX ? getIcon('lock', 12) : getIcon('unlock', 12);

        childItem.innerHTML = `
          <span class="layer-grip" style="visibility:hidden" aria-hidden="true">${getIcon('grip', 12)}</span>
          <span class="layer-icon">${getIcon(info.typeIcon, 12)}</span>
          <span class="layer-name">${info.name}</span>
          <span class="layer-actions">
            <button onclick="toggleGroupChildVisibility(${realIdx},${cIdx})" title="Visibility">${cVis}</button>
            <button onclick="toggleGroupChildLock(${realIdx},${cIdx})" title="Lock">${cLock}</button>
          </span>
        `;

        const cActive = canvas.getActiveObject();
        if (cActive === child) childItem.classList.add('active');

        childItem.onclick = function (e) {
          if (e.target.closest('.layer-actions')) return;
          selectStructureObject(child);
        };

        childrenWrap.appendChild(childItem);
      });

      block.appendChild(header);
      block.appendChild(childrenWrap);
      body.appendChild(block);
      return;
    }

    const item = document.createElement('div');
    item.className = 'layer-item';
    item.draggable = true;
    item.dataset.idx = String(realIdx);

    const isActive = canvas.getActiveObject() === obj;
    if (isActive) item.classList.add('active');

    const { name, typeIcon } = getLayerDisplayInfo(obj);

    const visIcon = obj.visible !== false ? getIcon('eye', 12) : getIcon('eyeOff', 12);
    const lockIcon = obj.lockMovementX ? getIcon('lock', 12) : getIcon('unlock', 12);

    // ── Check if this object has bound frames → render Photoshop-style: SINGLE ROW with link icon ──
    var linkedFrames = imageFrameChildren.has(obj) ? imageFrameChildren.get(obj) : null;

    if (linkedFrames && linkedFrames.length > 0) {
      // One row per frame-image pair, showing both icons + chain link on same line
      linkedFrames.forEach(function (fObj) {
        var fRealIdx = allObjs.indexOf(fObj);
        var fInfo = getLayerDisplayInfo(fObj);

        var row = document.createElement('div');
        row.className = 'layer-item layer-linked-row';
        row.draggable = true;
        row.dataset.idx = String(realIdx);

        var isAnyActive = canvas.getActiveObject() === obj || canvas.getActiveObject() === fObj;
        if (isAnyActive) row.classList.add('active');

        var fVis = fObj.visible !== false && obj.visible !== false;
        var rowVisIcon = fVis ? getIcon('eye', 12) : getIcon('eyeOff', 12);

        // [frame icon] 🔗 [image icon] name  |  actions
        row.innerHTML =
          '<span class="layer-grip" title="Drag to reorder">' + getIcon('grip', 12) + '</span>' +
          '<span class="layer-icon layer-linked-frame-icon" title="Frame">' + getIcon(fInfo.typeIcon, 14) + '</span>' +
          '<span class="layer-chain-icon" title="Linked">🔗</span>' +
          '<span class="layer-icon" title="Image">' + getIcon(typeIcon, 14) + '</span>' +
          '<span class="layer-name">' + name + '</span>' +
          '<span class="layer-actions">' +
            '<button onclick="toggleLayerVisibility(' + realIdx + ')" title="Visibility">' + rowVisIcon + '</button>' +
            '<button onclick="toggleLayerLock(' + realIdx + ')" title="Lock">' + lockIcon + '</button>' +
          '</span>';

        row.onclick = function (e) {
          if (e.target.closest('.layer-actions')) return;
          // Click selects image; hold Ctrl to select frame
          if (e.ctrlKey || e.metaKey) {
            selectStructureObject(fObj);
          } else {
            selectStructureObject(obj);
          }
        };

        attachRootLayerDragAndDrop(row, realIdx);
        body.appendChild(row);
      });
      return;
    }

    item.innerHTML = `
      <span class="layer-grip" title="Drag to reorder">${getIcon('grip', 12)}</span>
      <span class="layer-icon">${getIcon(typeIcon, 14)}</span>
      <span class="layer-name">${name}</span>
      <span class="layer-actions">
        <button onclick="toggleLayerVisibility(${realIdx})" title="Visibility">${visIcon}</button>
        <button onclick="toggleLayerLock(${realIdx})" title="Lock">${lockIcon}</button>
      </span>
    `;

    item.onclick = function (e) {
      if (e.target.closest('.layer-actions')) return;
      selectStructureObject(obj);
    };

    attachRootLayerDragAndDrop(item, realIdx);

    body.appendChild(item);
  });

  // ── Background Image Layer (always at bottom) ──
  if (canvas.backgroundImage) {
    var bgBlock = document.createElement('div');
    bgBlock.className = 'layer-item layer-bg-image';
    bgBlock.style.cssText = 'border-top:1px solid var(--border);margin-top:4px;padding-top:6px;opacity:0.85';
    bgBlock.draggable = false;
    var bgIcon = typeof getIcon === 'function' ? getIcon('image', 14) : '🖼️';

    bgBlock.innerHTML =
      '<span class="layer-grip" style="visibility:hidden" aria-hidden="true">' + (typeof getIcon === 'function' ? getIcon('grip', 12) : '') + '</span>' +
      '<span class="layer-icon">' + bgIcon + '</span>' +
      '<span class="layer-name" style="font-style:italic">Background Image</span>' +
      '<span class="layer-actions">' +
        '<select id="bg-img-pos-select" title="Position" style="font-size:10px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:3px;padding:1px 2px;cursor:pointer">' +
          '<option value="cover">Cover</option>' +
          '<option value="contain">Contain</option>' +
          '<option value="stretch">Stretch</option>' +
          '<option value="top-left">Top Left</option>' +
          '<option value="top-center">Top Center</option>' +
          '<option value="top-right">Top Right</option>' +
          '<option value="center">Center</option>' +
          '<option value="bottom-left">Bottom Left</option>' +
          '<option value="bottom-center">Bottom Center</option>' +
          '<option value="bottom-right">Bottom Right</option>' +
        '</select>' +
        '<button onclick="ctxAction(\'removeBg\')" title="Remove Background" style="color:var(--red)">' + (typeof getIcon === 'function' ? getIcon('close', 12) : '×') + '</button>' +
      '</span>';

    body.appendChild(bgBlock);

    // Sync dropdown value
    var posSelect = document.getElementById('bg-img-pos-select');
    if (posSelect) {
      posSelect.value = window._bgImagePosition || 'cover';
      posSelect.onchange = function() {
        if (typeof _applyBgImagePosition === 'function') {
          _applyBgImagePosition(canvas, posSelect.value);
          if (typeof snap === 'function') snap();
        }
      };
    }
  }
}

function toggleLayerVisibility(idx) {
  const obj = canvas.getObjects()[idx];
  if (!obj) return;
  obj.visible = !obj.visible;
  canvas.renderAll();
  refreshStructure();
}

function toggleLayerLock(idx) {
  const obj = canvas.getObjects()[idx];
  if (!obj) return;
  const locked = !obj.lockMovementX;
  obj.set({
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    hasControls: !locked,
    selectable: !locked
  });
  canvas.renderAll();
  refreshStructure();
}

function toggleGroupChildVisibility(groupIdx, childIdx) {
  const g = canvas.getObjects()[groupIdx];
  if (!g || g.type !== 'group') return;
  const children = g.getObjects();
  const c = children[childIdx];
  if (!c) return;
  c.visible = !c.visible;
  g.set('dirty', true);
  canvas.renderAll();
  refreshStructure();
}

function toggleGroupChildLock(groupIdx, childIdx) {
  const g = canvas.getObjects()[groupIdx];
  if (!g || g.type !== 'group') return;
  const children = g.getObjects();
  const c = children[childIdx];
  if (!c) return;
  const locked = !c.lockMovementX;
  c.set({
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    hasControls: !locked,
    selectable: !locked
  });
  g.set('dirty', true);
  canvas.renderAll();
  refreshStructure();
}

function highlightActiveLayer() {
  document.querySelectorAll('.layer-item').forEach(function (item) {
    item.classList.remove('active');
  });
  const active = canvas.getActiveObject();
  if (!active) return;
  if (active.group) {
    const g = active.group;
    const groupIdx = canvas.getObjects().indexOf(g);
    if (groupIdx < 0) return;
    const childIdx = g.getObjects().indexOf(active);
    if (childIdx < 0) return;
    const childEl = document.querySelector(
      '.layer-item.layer-child[data-group-idx="' + groupIdx + '"][data-child-idx="' + childIdx + '"]'
    );
    if (childEl) childEl.classList.add('active');
    return;
  }
  const idx = canvas.getObjects().indexOf(active);
  if (idx < 0) return;
  const rootEl = document.querySelector('.layer-item:not(.layer-child)[data-idx="' + idx + '"]');
  if (rootEl) rootEl.classList.add('active');
}

function clearLayerHighlight() {
  document.querySelectorAll('.layer-item').forEach(function (item) {
    item.classList.remove('active');
  });
}

function collapseStructure() {
  const body = document.getElementById('structure-body');
  if (body) body.style.display = 'none';
  const panel = document.getElementById('structure-panel');
  if (panel) panel.classList.add('collapsed');
}

function expandStructure() {
  const body = document.getElementById('structure-body');
  if (body) body.style.display = '';
  const panel = document.getElementById('structure-panel');
  if (panel) panel.classList.remove('collapsed');
}

/* ── Grid cell layer context menu ── */
function _showCellLayerContextMenu(ev, grid, cellMeta, cellImg) {
  var old = document.getElementById('grid-layer-ctx');
  if (old) old.remove();

  var menu = document.createElement('div');
  menu.id = 'grid-layer-ctx';
  menu.className = 'grid-cell-context-menu';
  menu.style.left = ev.clientX + 'px';
  menu.style.top = ev.clientY + 'px';

  var label = 'Cell (' + (cellMeta.row + 1) + ',' + (cellMeta.col + 1) + ')';
  var html = '<div class="grid-ctx-title">' + label + '</div>';

  if (cellImg) {
    html += '<div class="grid-ctx-item" data-action="select-img">Select Image</div>';
    html += '<div class="grid-ctx-item" data-action="replace-img">Replace Image</div>';
    html += '<div class="grid-ctx-sep"></div>';

    // Fit mode submenu
    var curFit = cellMeta.fit || 'cover';
    html += '<div class="grid-ctx-section">Fit Mode</div>';
    html += '<div class="grid-ctx-item' + (curFit === 'cover' ? ' active' : '') + '" data-action="fit-cover">Cover</div>';
    html += '<div class="grid-ctx-item' + (curFit === 'contain' ? ' active' : '') + '" data-action="fit-contain">Contain</div>';
    html += '<div class="grid-ctx-item' + (curFit === 'stretch' ? ' active' : '') + '" data-action="fit-stretch">Stretch</div>';
    html += '<div class="grid-ctx-sep"></div>';

    html += '<div class="grid-ctx-item" style="color:#e55" data-action="remove-img">Remove from Cell</div>';
  } else {
    html += '<div class="grid-ctx-item" data-action="add-img">Add Image</div>';
    html += '<div class="grid-ctx-item" data-action="upload-img">Upload File</div>';
  }

  menu.innerHTML = html;
  document.body.appendChild(menu);

  menu.addEventListener('click', function (clickEv) {
    var action = clickEv.target.dataset.action;
    if (!action) return;
    menu.remove();

    if (action === 'select-img') {
      selectStructureObject(grid);
      if (typeof _glShowGridToolbar === 'function') _glShowGridToolbar(grid);
      if (typeof _glUpdateToolbar === 'function') _glUpdateToolbar(grid, cellMeta);
    } else if (action === 'replace-img' || action === 'add-img') {
      if (typeof _glEnterSelectMode === 'function') {
        selectStructureObject(grid);
        _glEnterSelectMode(grid, cellMeta);
      }
    } else if (action === 'upload-img') {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*,video/*';
      inp.onchange = function () {
        if (!inp.files || !inp.files[0]) return;
        var file = inp.files[0];
        if (file.type.indexOf('video/') === 0) {
          if (typeof _glPlaceVideoFileInCell === 'function') _glPlaceVideoFileInCell(grid, cellMeta, file);
        } else {
          var fr = new FileReader();
          fr.onload = function (e2) {
            if (typeof _glPlaceImageInCell === 'function') _glPlaceImageInCell(grid, cellMeta, e2.target.result);
          };
          fr.readAsDataURL(file);
        }
      };
      inp.click();
    } else if (action === 'fit-cover' || action === 'fit-contain' || action === 'fit-stretch') {
      var newFit = action.replace('fit-', '');
      cellMeta.fit = newFit;
      if (cellMeta.imgSrc && typeof _glPlaceImageInCell === 'function') {
        _glPlaceImageInCell(grid, cellMeta, cellMeta.imgSrc, newFit, cellMeta.position);
      }
    } else if (action === 'remove-img') {
      _removeCellContent(grid, cellMeta);
    }
  });

  function closeMenu(e2) {
    if (!menu.contains(e2.target)) { menu.remove(); document.removeEventListener('mousedown', closeMenu, true); }
  }
  setTimeout(function () { document.addEventListener('mousedown', closeMenu, true); }, 50);
}

function _removeCellContent(grid, cellMeta) {
  var detachSrc = cellMeta.imgSrc || '';
  var detachElement = null;
  // Grab the actual image element src before removal
  if (detachSrc && grid && typeof grid.getObjects === 'function') {
    var objs = grid.getObjects();
    for (var di = objs.length - 1; di >= 0; di--) {
      if (objs[di]._isGridCellImage && objs[di]._gridCellRow === cellMeta.row && objs[di]._gridCellCol === cellMeta.col) {
        if (objs[di]._element && objs[di]._element.src) detachElement = objs[di]._element.src;
        break;
      }
    }
  }
  if (typeof _glRemoveCellImage === 'function') _glRemoveCellImage(grid, cellMeta);
  if (typeof _glRemoveCellVideo === 'function') _glRemoveCellVideo(cellMeta);
  cellMeta.imgSrc = '';
  cellMeta.videoUrl = '';
  var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  if (typeof _glRenderPlusOverlays === 'function') _glRenderPlusOverlays(grid);
  cvs.renderAll();
  if (typeof snap === 'function') snap();
  refreshStructure();
  // Extract image to canvas as standalone object
  var src = detachElement || detachSrc;
  if (src) {
    fabric.Image.fromURL(src, function (img) {
      if (!img || !img.width) return;
      var scale = Math.min(200 / img.width, 200 / img.height, 1);
      img.set({ left: 50, top: 50, scaleX: scale, scaleY: scale, clipPath: null, _isGridCellImage: false, selectable: true, evented: true });
      cvs.add(img);
      cvs.setActiveObject(img);
      cvs.renderAll();
      if (typeof snap === 'function') snap();
      refreshStructure();
      if (typeof showToast === 'function') showToast('Image extracted to canvas');
    });
  }
}

function toggleStructurePanel() {
  structureVisible = !structureVisible;
  const panel = document.getElementById('structure-panel');
  if (panel) {
    panel.classList.toggle('show', structureVisible);
    if (structureVisible) refreshStructure();
  }
}

function makeDraggable(element, handle) {
  let offsetX = 0;
  let offsetY = 0;

  handle.onmousedown = function (e) {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    e.preventDefault();
    offsetX = e.clientX - element.offsetLeft;
    offsetY = e.clientY - element.offsetTop;

    document.onmousemove = function (e) {
      let newLeft = e.clientX - offsetX;
      let newTop = e.clientY - offsetY;
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - element.offsetWidth));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - element.offsetHeight));
      element.style.left = newLeft + 'px';
      element.style.top = newTop + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    };

    document.onmouseup = function () {
      document.onmousemove = null;
      document.onmouseup = null;
    };
  };
}

/* shared/bulk-builder/engine: the HEADLESS bulk merge engine (P0.2, 2026-07-18).
   Pure data logic moved VERBATIM from the wizard (bulk-builder.js): field collection,
   CSV/XLSX parsing, per-row value application. NO DOM, no modal state. Exposed as
   window.CCBulk so every merge surface (wizard, barcode bulk, AI variations, portal)
   can converge on ONE engine instead of hand-mirroring the walk/match/apply logic.
   Only deliberate change from the wizard original: applyFieldMappingsToJson took the
   wizard's closure `state.fileUploads`; here it is `opts.fileUploads` (caller-passed).
   Reads globals at CALL time only (canvas, JSZip, Papa, bwipjs, generateQRImage), so
   load order vs the parent wizard module does not matter. */
(function () {
  function walkCanvasObjects(list, fn) {
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var obj = list[i];
      if (!obj) continue;
      fn(obj);
      if (obj.type === 'group' && obj._objects && obj._objects.length) walkCanvasObjects(obj._objects, fn);
    }
  }

  function walkJsonObjects(list, fn) {
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var obj = list[i];
      if (!obj) continue;
      fn(obj);
      if (obj.objects && obj.objects.length) walkJsonObjects(obj.objects, fn);
    }
  }

  function collectFields() {
    if (typeof canvas === 'undefined' || !canvas) return [];
    var fields = [];
    var seen = {};
    walkCanvasObjects(canvas.getObjects(), function (obj) {
      var key = obj._dfField || obj._fieldRole || '';   // _fieldRole = legacy tag (D6 fix: the other three engines honor it)
      if (!key || seen[key]) return;
      seen[key] = true;
      var info = {
        field: key,
        note: obj._dfNote || '',
        type: obj.type || '',
        kind: 'other',   // 'text' | 'image' | 'qr' | 'barcode' | 'color' | 'grid-cell' | 'other' (P1 validation)
        current: ''
      };
      if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') { info.kind = 'text'; info.current = obj.text || ''; }
      else if (obj.isQR) { info.kind = 'qr'; info.current = obj.qrUrl || ''; }
      else if (obj._ccType === 'barcode' || obj._barcodeValue) { info.kind = 'barcode'; info.current = obj._barcodeValue || ''; }
      else if (obj.type === 'image') { info.kind = 'image'; if (obj._element && obj._element.src) info.current = obj._element.src.indexOf('data:') === 0 ? 'Embedded image' : 'Remote image'; }
      else if (typeof obj.fill === 'string') { info.kind = 'color'; info.current = obj.fill; }
      fields.push(info);
    });
    // Collect per-cell design fields from grid layouts
    var objs = canvas.getObjects();
    for (var gi = 0; gi < objs.length; gi++) {
      var gObj = objs[gi];
      if (!gObj._isGridLayout || !gObj._cells) continue;
      for (var ci = 0; ci < gObj._cells.length; ci++) {
        var cell = gObj._cells[ci];
        var cellDf = cell.dfField || '';
        if (!cellDf) continue;
        // Composite key: unique per cell even if same dfField value
        var cellKey = cellDf + '::cell(' + (cell.row + 1) + ',' + (cell.col + 1) + ')';
        if (seen[cellKey]) continue;
        seen[cellKey] = true;
        fields.push({
          field: cellKey,
          note: 'Grid Cell (' + (cell.row + 1) + ',' + (cell.col + 1) + ')',
          type: 'grid-cell',
          kind: 'grid-cell',
          current: cell.imgSrc ? 'Has image' : 'Empty'
        });
      }
    }
    fields.sort(function (a, b) { return a.field.localeCompare(b.field); });
    return fields;
  }

  /* Field inventory from SERIALIZED json (a page json, a slide json, or a CCFrame json)
     instead of the live canvas : needed for scene frames, whose live canvas holds EVERY
     frame at once (P2 S10). Accepts {objects:[...]} or a single object with children. */
  function collectFieldsFromJson(json) {
    var fields = [];
    var seen = {};
    var rootList = json ? (json.objects || (json.type ? [json] : [])) : [];
    walkJsonObjects(rootList, function (obj) {
      var key = obj._dfField || obj._fieldRole || '';
      if (key && !seen[key]) {
        seen[key] = true;
        var info = { field: key, note: obj._dfNote || '', type: obj.type || '', kind: 'other', current: '' };
        if (isTextObjectType(obj.type)) { info.kind = 'text'; info.current = obj.text || ''; }
        else if (obj.isQR) { info.kind = 'qr'; info.current = obj.qrUrl || ''; }
        else if (obj._ccType === 'barcode' || obj._barcodeValue) { info.kind = 'barcode'; info.current = obj._barcodeValue || ''; }
        else if (obj.type === 'image') { info.kind = 'image'; info.current = obj.src ? (String(obj.src).indexOf('data:') === 0 ? 'Embedded image' : 'Remote image') : ''; }
        else if (typeof obj.fill === 'string') { info.kind = 'color'; info.current = obj.fill; }
        fields.push(info);
      }
      if (obj._isGridLayout && obj._cells) {
        for (var ci = 0; ci < obj._cells.length; ci++) {
          var cell = obj._cells[ci];
          var cd = cell.dfField || '';
          if (!cd) continue;
          var ck = cd + '::cell(' + (cell.row + 1) + ',' + (cell.col + 1) + ')';
          if (seen[ck]) continue;
          seen[ck] = true;
          fields.push({ field: ck, note: 'Grid Cell (' + (cell.row + 1) + ',' + (cell.col + 1) + ')', type: 'grid-cell', kind: 'grid-cell', current: cell.imgSrc ? 'Has image' : 'Empty' });
        }
      }
    });
    fields.sort(function (a, b) { return a.field.localeCompare(b.field); });
    return fields;
  }

  function defaultMapping(fields, headers) {
    var mapping = {};
    var lookup = {};
    headers.forEach(function (header) {
      lookup[String(header || '').trim().toLowerCase()] = header;
    });
    fields.forEach(function (field) {
      var name = String(field.field || '').trim().toLowerCase();
      mapping[field.field] = lookup[name] || '';
    });
    return mapping;
  }

  function isXlsxFile(file) {
    var name = String(file.name || '').toLowerCase();
    return name.endsWith('.xlsx') || name.endsWith('.xls') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel';
  }

  function parseXlsxFile(file, done) {
    if (typeof JSZip === 'undefined') return done(new Error('JSZip not loaded.'));
    var reader = new FileReader();
    reader.onerror = function () { done(new Error('Could not read xlsx.')); };
    reader.onload = function () {
      JSZip.loadAsync(reader.result).then(function (zip) {
        // 1) Parse shared strings
        var ssFile = zip.file('xl/sharedStrings.xml');
        var ssPromise = ssFile ? ssFile.async('text') : Promise.resolve('');

        // 2) Parse sheet1
        var sheetFile = zip.file('xl/worksheets/sheet1.xml');
        if (!sheetFile) return done(new Error('No sheet1 found in xlsx.'));
        var sheetPromise = sheetFile.async('text');

        // 3) Find drawing rels for sheet1
        var sheetRelsFile = zip.file('xl/worksheets/_rels/sheet1.xml.rels');
        var sheetRelsPromise = sheetRelsFile ? sheetRelsFile.async('text') : Promise.resolve('');

        Promise.all([ssPromise, sheetPromise, sheetRelsPromise]).then(function (results) {
          var ssXml = results[0];
          var sheetXml = results[1];
          var sheetRelsXml = results[2];

          // Parse shared strings
          var sharedStrings = [];
          if (ssXml) {
            var siRe = /<si[^>]*>(.*?)<\/si>/gs;
            var siMatch;
            while ((siMatch = siRe.exec(ssXml)) !== null) {
              var inner = siMatch[1];
              var textParts = [];
              var tRe = /<t[^>]*>([^<]*)<\/t>/g;
              var tMatch;
              while ((tMatch = tRe.exec(inner)) !== null) {
                textParts.push(tMatch[1]);
              }
              sharedStrings.push(textParts.join(''));
            }
          }

          // Parse sheet cells
          var cellData = {}; // 'A1' -> value
          // Extract all <c> elements: lazy [^>]*? ensures self-closing /> is found before greedy consumption
          var cellElRe = /<c\s(?:[^>]*?\/>|[^>]*?>.*?<\/c>)/gs;
          var cellEl;
          while ((cellEl = cellElRe.exec(sheetXml)) !== null) {
            var tag = cellEl[0];
            var refM = /r="([A-Z]+)(\d+)"/.exec(tag);
            if (!refM) continue;
            var colLetter = refM[1];
            var rowNum = parseInt(refM[2], 10);
            var typeM = /\bt="([^"]*)"/.exec(tag);
            var cellType = typeM ? typeM[1] : '';
            var vMatch = /<v>([^<]*)<\/v>/.exec(tag);
            var cellVal = vMatch ? vMatch[1] : '';
            if (cellType === 's' && cellVal) {
              var idx = parseInt(cellVal, 10);
              cellVal = sharedStrings[idx] || '';
            } else if (cellType === 'inlineStr') {
              // P1 (D3 partial): inline strings live in <is><t>..</t></is>, not <v> (common in generated xlsx)
              var inlineParts = [];
              var inlineRe = /<t[^>]*>([^<]*)<\/t>/g;
              var inlineM;
              while ((inlineM = inlineRe.exec(tag)) !== null) inlineParts.push(inlineM[1]);
              if (inlineParts.length) cellVal = inlineParts.join('');
            }
            if (cellVal) cellData[colLetter + rowNum] = cellVal;
          }

          // Determine dimensions from cell data + sheet row definitions
          var allRefs = Object.keys(cellData);
          var maxRow = 0;
          var colSet = {};
          allRefs.forEach(function (ref) {
            var m = ref.match(/^([A-Z]+)(\d+)$/);
            if (m) {
              colSet[m[1]] = true;
              var r = parseInt(m[2], 10);
              if (r > maxRow) maxRow = r;
            }
          });
          // Also check row elements in sheet XML for max row
          var rowAttrRe = /<row[^>]+r="(\d+)"/g;
          var rowAttr;
          while ((rowAttr = rowAttrRe.exec(sheetXml)) !== null) {
            var rn = parseInt(rowAttr[1], 10);
            if (rn > maxRow) maxRow = rn;
          }
          // Also detect all cols used in cell refs (including empty styled cells)
          var allCellRefs = sheetXml.match(/r="([A-Z]+\d+)"/g) || [];
          allCellRefs.forEach(function (m) {
            var mc = m.match(/r="([A-Z]+)/);
            if (mc) colSet[mc[1]] = true;
          });
          if (!maxRow) return done(new Error('xlsx sheet is empty.'));

          function colLetterToIndex(letters) {
            var n = 0;
            for (var i = 0; i < letters.length; i++) {
              n = n * 26 + (letters.charCodeAt(i) - 64);
            }
            return n;
          }
          function indexToColLetter(idx) {
            var s = '';
            while (idx > 0) {
              idx--;
              s = String.fromCharCode(65 + (idx % 26)) + s;
              idx = Math.floor(idx / 26);
            }
            return s;
          }

          var colIndices = Object.keys(colSet).map(colLetterToIndex).sort(function (a, b) { return a - b; });
          var maxCol = colIndices.length ? colIndices[colIndices.length - 1] : 1;

          // Row 1 = headers
          var headers = [];
          for (var ci = 1; ci <= maxCol; ci++) {
            var colL = indexToColLetter(ci);
            headers.push(cellData[colL + '1'] || ('Column ' + colL));
          }

          var rows = [];
          for (var ri = 2; ri <= maxRow; ri++) {
            var row = {};
            var hasData = false;
            for (var cj = 1; cj <= maxCol; cj++) {
              var cl = indexToColLetter(cj);
              var val = cellData[cl + ri] || '';
              row[headers[cj - 1]] = val;
              if (val) hasData = true;
            }
            if (hasData) rows.push(row);
          }

          // 4) Extract embedded images
          // Find drawing file path from sheet rels
          var drawingPath = '';
          if (sheetRelsXml) {
            var drawRel = /Relationship[^>]*Target="([^"]*drawing[^"]*)"/i.exec(sheetRelsXml);
            if (drawRel) {
              drawingPath = 'xl/' + drawRel[1].replace(/^\.\.\//, '').replace(/^\//, '');
            }
          }

          if (!drawingPath) {
            // No drawings: return text-only data
            if (!headers.length || !rows.length) return done(new Error('xlsx looks empty.'));
            return done(null, { headers: headers, rows: rows });
          }

          var drawingFile = zip.file(drawingPath);
          if (!drawingFile) {
            return done(null, { headers: headers, rows: rows });
          }

          // Find drawing rels
          var drawingDir = drawingPath.replace(/\/[^\/]+$/, '');
          var drawingName = drawingPath.replace(/^.*\//, '');
          var drawingRelsPath = drawingDir + '/_rels/' + drawingName + '.rels';
          var drawingRelsFile = zip.file(drawingRelsPath);

          var drawPromise = drawingFile.async('text');
          var drawRelsPromise = drawingRelsFile ? drawingRelsFile.async('text') : Promise.resolve('');

          Promise.all([drawPromise, drawRelsPromise]).then(function (drawResults) {
            var drawXml = drawResults[0];
            var drawRelsXml = drawResults[1];

            // Parse drawing rels: rId -> media path
            var rIdToMedia = {};
            if (drawRelsXml) {
              var relRe = /Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]*)"/g;
              var relMatch;
              while ((relMatch = relRe.exec(drawRelsXml)) !== null) {
                var mediaTarget = relMatch[2].replace(/^\.\.\//, '');
                rIdToMedia[relMatch[1]] = 'xl/' + mediaTarget;
              }
            }

            // Parse drawing anchors: find col/row -> rId
            var imageAnchors = [];
            var anchorRe = /<xdr:(twoCellAnchor|oneCellAnchor)[^>]*>(.*?)<\/xdr:\1>/gs;
            var anchorMatch;
            while ((anchorMatch = anchorRe.exec(drawXml)) !== null) {
              var anchorContent = anchorMatch[2];
              var fromCol = -1, fromRow = -1, embedId = '';
              var fromBlock = /<xdr:from>(.*?)<\/xdr:from>/s.exec(anchorContent);
              if (fromBlock) {
                var colM = /<xdr:col>(\d+)<\/xdr:col>/.exec(fromBlock[1]);
                var rowM = /<xdr:row>(\d+)<\/xdr:row>/.exec(fromBlock[1]);
                if (colM) fromCol = parseInt(colM[1], 10);
                if (rowM) fromRow = parseInt(rowM[1], 10);
              }
              var embedM = /r:embed="(rId\d+)"/.exec(anchorContent);
              if (embedM) embedId = embedM[1];
              if (fromCol >= 0 && fromRow >= 0 && embedId) {
                imageAnchors.push({ col: fromCol, row: fromRow, rId: embedId });
              }
            }

            if (!imageAnchors.length) {
              return done(null, { headers: headers, rows: rows });
            }

            // Load all referenced media files
            var mediaToLoad = {};
            imageAnchors.forEach(function (a) {
              var path = rIdToMedia[a.rId];
              if (path) mediaToLoad[path] = true;
            });
            var mediaPaths = Object.keys(mediaToLoad);
            var mediaPromises = mediaPaths.map(function (mp) {
              var mf = zip.file(mp);
              return mf ? mf.async('base64') : Promise.resolve('');
            });

            Promise.all(mediaPromises).then(function (mediaB64s) {
              var mediaMap = {};
              mediaPaths.forEach(function (mp, idx) {
                if (!mediaB64s[idx]) return;
                var ext = mp.replace(/^.*\./, '').toLowerCase();
                var mime = ext === 'png' ? 'image/png' : (ext === 'gif' ? 'image/gif' : (ext === 'webp' ? 'image/webp' : 'image/jpeg'));
                mediaMap[mp] = 'data:' + mime + ';base64,' + mediaB64s[idx];
              });

              // Place images into rows
              // Row 0 in drawing = row 1 in sheet (header), so image at row N = data row N-1
              imageAnchors.forEach(function (a) {
                var dataUrl = mediaMap[rIdToMedia[a.rId]] || '';
                if (!dataUrl) return;
                var dataRowIdx = a.row - 1; // row 0 = header row in drawings
                if (dataRowIdx < 0 || dataRowIdx >= rows.length) return;
                var headerIdx = a.col;
                if (headerIdx < 0 || headerIdx >= headers.length) return;
                var h = headers[headerIdx];
                rows[dataRowIdx][h] = dataUrl;
              });

              done(null, { headers: headers, rows: rows });
            }).catch(function (e) { done(e); });
          }).catch(function (e) { done(e); });
        }).catch(function (e) { done(e); });
      }).catch(function (e) { done(new Error('Could not read xlsx: ' + (e.message || e))); });
    };
    reader.readAsArrayBuffer(file);
  }

  function parseCsvFile(file, done) {
    if (!file) return done(new Error('Choose a CSV file first.'));
    if (typeof Papa !== 'undefined' && Papa && typeof Papa.parse === 'function') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: 'greedy',
        delimitersToGuess: [',', ';', '\t'],
        complete: function (res) {
          var rawFields = (res && res.meta && res.meta.fields) ? res.meta.fields : [];
          var headerMap = [];
          var headers = rawFields.map(function (f) {
            var raw = String(f || '');
            var trimmed = raw.trim();
            headerMap.push({ raw: raw, key: trimmed });
            return trimmed;
          }).filter(Boolean);
          var rows = (res && res.data ? res.data : []).map(function (row) {
            var normalized = {};
            headerMap.forEach(function (entry) {
              if (!entry.key) return;
              normalized[entry.key] = row ? row[entry.raw] : '';
            });
            return normalized;
          }).filter(function (row) {
            var keys = Object.keys(row || {});
            for (var i = 0; i < keys.length; i++) {
              if (String(row[keys[i]] == null ? '' : row[keys[i]]).trim()) return true;
            }
            return false;
          });
          if (!headers.length || !rows.length) return done(new Error('CSV looks empty.'));
          done(null, { headers: headers, rows: rows });
        },
        error: function (err) { done(err || new Error('Could not parse CSV.')); }
      });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = typeof parseCSV === 'function' ? parseCSV(String(reader.result || '')) : [];
        var rows = parsed.map(function (row) {
          var normalized = {};
          Object.keys(row || {}).forEach(function (key) {
            normalized[String(key || '').trim()] = row[key];
          });
          return normalized;
        });
        var headers = rows.length ? Object.keys(rows[0]) : [];
        if (!headers.length || !parsed.length) return done(new Error('CSV looks empty.'));
        done(null, { headers: headers, rows: rows });
      } catch (e) {
        done(e);
      }
    };
    reader.onerror = function () { done(new Error('Could not read CSV.')); };
    reader.readAsText(file);
  }

  function parseFile(file, done) {
    if (!file) return done(new Error('Choose a CSV file first.'));
    return isXlsxFile(file) ? parseXlsxFile(file, done) : parseCsvFile(file, done);
  }

  function normalizeTextValue(value) {
    return value == null ? '' : String(value);
  }

  function containsCurrencySymbol(value) {
    return /[₺$€£¥₹₽₩₴₫₪₦₱฿₡₭₨]/.test(String(value || ''));
  }

  function stripCurrencyAndSpaces(value) {
    return String(value == null ? '' : value)
      .replace(/[₺$€£¥₹₽₩₴₫₪₦₱฿₡₭₨\s]/g, '')
      .trim();
  }

  function isNumericText(value) {
    return /^[-+]?[\d.,]+$/.test(stripCurrencyAndSpaces(value));
  }

  function formatMappedTextValue(currentText, nextValue) {
    var current = String(currentText == null ? '' : currentText);
    var next = normalizeTextValue(nextValue);
    if (!current) return next;
    if (!next) return next;

    var currentHasCurrency = containsCurrencySymbol(current);
    var nextHasCurrency = containsCurrencySymbol(next);
    if (!currentHasCurrency) return next;
    if (nextHasCurrency) return next;
    if (!isNumericText(next)) return next;

    var numericOnly = stripCurrencyAndSpaces(next);
    if (!numericOnly) return next;

    var replaced = current.replace(/[-+]?[\d.,]+/, numericOnly);
    return replaced !== current ? replaced : (numericOnly + current.replace(/[-+]?[\d.,]*/g, ''));
  }

  function isTextObjectType(type) {
    return type === 'textbox' || type === 'i-text' || type === 'text';
  }

  function hasChildObjects(obj) {
    return !!(obj && obj.objects && obj.objects.length);
  }

  function collectDescendantsByMatcher(obj, matcher, field) {
    var out = [];
    if (!hasChildObjects(obj)) return out;
    walkJsonObjects(obj.objects, function (child) {
      if (!child || !matcher(child)) return;
      var childField = child._dfField || child._fieldRole || '';   // D6: legacy _fieldRole fallback
      if (!childField || childField === field) out.push(child);
    });
    return out;
  }

  function escapeRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function pickPrimaryTextTarget(list) {
    if (!list || !list.length) return null;
    return list.slice().sort(function (a, b) {
      var aScore = (parseFloat(a.fontSize) || 0) * ((parseFloat(a.width) || 0) + 1);
      var bScore = (parseFloat(b.fontSize) || 0) * ((parseFloat(b.width) || 0) + 1);
      return bScore - aScore;
    })[0];
  }

  function applyTextValueToObject(obj, value, field) {
    if (!obj) return false;
    if (isTextObjectType(obj.type)) {
      obj.text = formatMappedTextValue(obj.text, value);
      return true;
    }
    var textTargets = collectDescendantsByMatcher(obj, function (child) {
      return isTextObjectType(child.type);
    }, field);
    if (!textTargets.length) return false;
    if (textTargets.length === 1) {
      textTargets[0].text = formatMappedTextValue(textTargets[0].text, value);
      return true;
    }

    var currencyTargets = textTargets.filter(function (child) {
      return /^[\s€$£¥₺₹₽₩₴₫₦₱₲₵฿₪₡₭₨₸₼]+$/.test(String(child.text || '').trim());
    });
    if (currencyTargets.length === 1 && textTargets.length >= 2) {
      var currencyText = String(currencyTargets[0].text || '').trim();
      var primary = pickPrimaryTextTarget(textTargets.filter(function (child) { return child !== currencyTargets[0]; }));
      var stripped = String(value || '').replace(new RegExp(escapeRegex(currencyText), 'g'), '').trim();
      if (primary && stripped) {
        primary.text = stripped;
        return true;
      }
    }

    var target = pickPrimaryTextTarget(textTargets);
    if (!target) return false;
    target.text = formatMappedTextValue(target.text, value);
    return true;
  }

  function applyImageValueToObject(obj, value, field) {
    if (!obj) return false;
    if (obj.type === 'image' && isImageUrl(value)) {
      obj.src = value;
      return true;
    }
    var imageTargets = collectDescendantsByMatcher(obj, function (child) {
      return child.type === 'image' && !child.isQR && !child._barcodeValue && child._ccType !== 'barcode';
    }, field);
    if (!imageTargets.length || !isImageUrl(value)) return false;
    imageTargets[0].src = value;
    return true;
  }

  function applyQrValueToObject(obj, value, field) {
    if (!obj || typeof generateQRImage !== 'function') return false;
    if (obj.type === 'image' && obj.isQR) {
      obj.qrUrl = value;
      obj.src = generateQRImage(value, obj.qrFg || '#111111', obj.qrBg || '#ffffff');
      return true;
    }
    var qrTargets = collectDescendantsByMatcher(obj, function (child) {
      return child.type === 'image' && child.isQR;
    }, field);
    if (!qrTargets.length) return false;
    qrTargets[0].qrUrl = value;
    qrTargets[0].src = generateQRImage(value, qrTargets[0].qrFg || '#111111', qrTargets[0].qrBg || '#ffffff');
    return true;
  }

  function applyBarcodeValueToObject(obj, value, field) {
    if (!obj) return false;
    if (obj._ccType === 'barcode' || obj._barcodeValue) {
      obj._barcodeValue = value;
      var barcodeSrc = renderBarcodeDataUrlFromValue(obj, value);
      if (barcodeSrc) obj.src = barcodeSrc;
      return true;
    }
    var barcodeTargets = collectDescendantsByMatcher(obj, function (child) {
      return child._ccType === 'barcode' || child._barcodeValue;
    }, field);
    if (!barcodeTargets.length) return false;
    barcodeTargets[0]._barcodeValue = value;
    var barcodeChildSrc = renderBarcodeDataUrlFromValue(barcodeTargets[0], value);
    if (barcodeChildSrc) barcodeTargets[0].src = barcodeChildSrc;
    return true;
  }

  function applyColorValueToObject(obj, value, field) {
    if (!obj || !isColorValue(value)) return false;
    if (typeof obj.fill === 'string' || obj.fill == null) {
      obj.fill = value;
      return true;
    }
    if (typeof obj.stroke === 'string' || obj.stroke == null) {
      obj.stroke = value;
      return true;
    }
    var colorTargets = collectDescendantsByMatcher(obj, function (child) {
      return typeof child.fill === 'string' || typeof child.stroke === 'string' || child.fill == null || child.stroke == null;
    }, field);
    if (!colorTargets.length) return false;
    var target = colorTargets[0];
    if (typeof target.fill === 'string' || target.fill == null) target.fill = value;
    else if (typeof target.stroke === 'string' || target.stroke == null) target.stroke = value;
    return true;
  }

  function applyMappedValueToObject(obj, value, field) {
    if (!obj) return;
    if (applyTextValueToObject(obj, value, field)) return;
    if (applyQrValueToObject(obj, value, field)) return;
    if (applyBarcodeValueToObject(obj, value, field)) return;
    if (applyImageValueToObject(obj, value, field)) return;
    applyColorValueToObject(obj, value, field);
  }

  function isImageUrl(value) {
    // http(s), data:image, OR a same-origin relative asset path (Plan B upload returns
    // /api/assets/blob/... , 2026-07-18) or any leading-slash path (image fields hold URLs).
    return /^(https?:\/\/|data:image\/|\/)/i.test(String(value || '').trim());
  }

  function isColorValue(value) {
    return /^#([0-9a-f]{3,8})$/i.test(String(value || '').trim());
  }

  function normalizeBarcodeType(type) {
    var v = String(type || '').trim().toLowerCase();
    return v || 'code128';
  }

  function renderBarcodeDataUrlFromValue(obj, value) {
    if (typeof document === 'undefined' || typeof bwipjs === 'undefined' || !bwipjs || typeof bwipjs.toCanvas !== 'function') return '';
    var c = document.createElement('canvas');
    try {
      bwipjs.toCanvas(c, {
        bcid: normalizeBarcodeType(obj._barcodeType || 'code128'),
        text: String(value || ''),
        scale: 2,
        height: Math.max(2, parseInt(obj._barcodeHeight, 10) || 10),
        includetext: obj._barcodeHumanReadable !== false,
        textxalign: 'center',
        paddingwidth: 8,
        paddingheight: 8,
        backgroundcolor: String(obj._barcodeBackgroundColor || '#ffffff').replace('#', ''),
        barcolor: String(obj._barcodeLineColor || '#111111').replace('#', '')
      });
      return c.toDataURL('image/png');
    } catch (e) {
      return '';
    }
  }

  /* ── Clip frames: the GEOMETRY has to follow the new image ──────────────────────────────
     A clipped image is a GROUP (`_isClipFrame`) holding [shape, image]; the image child carries
     fabric's own crop (cropX/cropY/width/height) plus a scale, and every one of those numbers was
     computed from the PREVIOUS image's natural size (core/context-menu.js `_ccFitImageInBox`).
     Swapping only `src` therefore keeps the old geometry, so the new picture lands stretched,
     cropped wrong or off-centre whatever the frame's cover/contain/stretch says. Measured on the
     owner's design 2026-08-06.

     This recomputes it with the SAME math, from natural sizes the caller measured beforehand
     (`opts.imageSizes = { <url>: {w,h} }`). No map, no refit: a merge that never measured behaves
     exactly as it did before. */
  function _clipSizeOf(sizes, src) {
    var s = src ? sizes[String(src)] : null;
    return (s && s.w && s.h) ? s : null;
  }

  /* contain also shrinks the image until it fits the SHAPE's silhouette, not just its box
     (`_ccInscribeFactor`, which rasterises the shape and binary-searches). That cannot run on
     plain json, so the factor is READ BACK from the template's own geometry: the template image
     was fitted by the real code, so oldScale / oldBoxFit IS that factor. A rectangle gives 1. */
  function _inscribeFactorFromTemplate(img, boxW, boxH) {
    var ow = img.width, oh = img.height, os = img.scaleX;
    if (!ow || !oh || !os) return 1;
    var base = Math.min(boxW / ow, boxH / oh);
    if (!base) return 1;
    var f = os / base;
    return (f > 0.02 && f <= 1.02) ? Math.min(f, 1) : 1;
  }

  function _fitClipImage(img, position, boxW, boxH, size, allowInscribe) {
    var iw = size.w, ih = size.h;
    if (!iw || !ih || !boxW || !boxH) return false;
    if (position === 'cover') {
      var boxAspect = boxW / boxH, srcAspect = iw / ih, cw, ch;
      if (srcAspect > boxAspect) { ch = ih; cw = ih * boxAspect; }
      else { cw = iw; ch = iw / boxAspect; }
      img.cropX = (iw - cw) / 2; img.cropY = (ih - ch) / 2;
      img.width = cw; img.height = ch;
      img.scaleX = boxW / cw; img.scaleY = boxH / ch;
      return true;
    }
    var factor = allowInscribe ? _inscribeFactorFromTemplate(img, boxW, boxH) : 1;
    img.cropX = 0; img.cropY = 0; img.width = iw; img.height = ih;
    if (position === 'stretch' || position === 'fill') {
      img.scaleX = boxW / iw; img.scaleY = boxH / ih;
    } else {
      var s = Math.min(boxW / iw, boxH / ih) * factor;
      img.scaleX = s; img.scaleY = s;
    }
    return true;
  }

  function refitClipFrames(json, sizes) {
    if (!sizes || !json || !json.objects) return;
    walkJsonObjects(json.objects, function (obj) {
      if (!obj) return;
      // NEW model: the frame is the GROUP; the shape child carries the true scale the clipPath
      // silhouette is derived from (`_ccApplySilhouette`).
      if (obj._isClipFrame && obj.objects && obj.objects.length) {
        var img = null, shape = null;
        for (var i = 0; i < obj.objects.length; i++) {
          var ch = obj.objects[i];
          if (!ch) continue;
          if (ch.type === 'image' && !img) img = ch;
          else if (ch.type !== 'image' && !shape) shape = ch;
        }
        var size = img ? _clipSizeOf(sizes, img.src) : null;
        if (!img || !size) return;
        var boxW = obj._clipShapeW || (shape ? (shape.width || 0) * (shape.scaleX || 1) : 0);
        var boxH = obj._clipShapeH || (shape ? (shape.height || 0) * (shape.scaleY || 1) : 0);
        if (!_fitClipImage(img, obj._clipPosition || 'cover', boxW, boxH, size, true)) return;
        if (img.clipPath) {
          img.clipPath.scaleX = (shape ? (shape.scaleX || 1) : 1) / (img.scaleX || 1);
          img.clipPath.scaleY = (shape ? (shape.scaleY || 1) : 1) / (img.scaleY || 1);
        }
        return;
      }
      // LEGACY model: the clip lives on a lone image (`_applyClipImagePosition`, no crop, and the
      // silhouette scale is nudged by the ratio of the old and new image scale).
      if (obj._isClippedImage && obj.type === 'image') {
        var sz = _clipSizeOf(sizes, obj.src);
        if (!sz) return;
        var cw2 = obj._clipShapeW || (obj.width || 0) * (obj.scaleX || 1);
        var chh = obj._clipShapeH || (obj.height || 0) * (obj.scaleY || 1);
        var oldSX = obj.scaleX || 1, oldSY = obj.scaleY || 1;
        var pos = obj._clipPosition || 'cover';
        obj.cropX = 0; obj.cropY = 0; obj.width = sz.w; obj.height = sz.h;
        if (pos === 'stretch' || pos === 'fill') { obj.scaleX = cw2 / sz.w; obj.scaleY = chh / sz.h; }
        else if (pos === 'contain') { var s2 = Math.min(cw2 / sz.w, chh / sz.h); obj.scaleX = s2; obj.scaleY = s2; }
        else { var s3 = Math.max(cw2 / sz.w, chh / sz.h); obj.scaleX = s3; obj.scaleY = s3; }
        if (obj.clipPath) {
          obj.clipPath.scaleX = (obj.clipPath.scaleX || 1) * oldSX / (obj.scaleX || 1);
          obj.clipPath.scaleY = (obj.clipPath.scaleY || 1) * oldSY / (obj.scaleY || 1);
        }
      }
    });
  }

  /* opts.fileUploads: { '<field::cell(r,c)>': dataUrl } single images applied to every row
     (was the wizard's closure state.fileUploads; the ONLY signature change in the move).
     opts.imageSizes: { url: {w,h} } natural sizes, so a clip frame can be re-fitted (above). */
  function applyFieldMappingsToJson(json, row, mapping, opts) {
    var fileUploads = (opts && opts.fileUploads) || {};
    var stats = { gridEmpty: 0, gridFilled: 0 };
    if (!json || !json.objects) return stats;
    walkJsonObjects(json.objects, function (obj) {
      var field = obj._dfField || obj._fieldRole || '';   // D6: legacy _fieldRole fallback
      var header = field ? mapping[field] : '';
      if (!header) return;
      var rawValue = row[header];
      if (rawValue == null || String(rawValue).trim() === '') return;
      var value = normalizeTextValue(rawValue);
      applyMappedValueToObject(obj, value, field);
    });
    // Apply grid cell design field mappings
    walkJsonObjects(json.objects, function (obj) {
      if (!obj._isGridLayout || !obj._cells) return;
      for (var ci = 0; ci < obj._cells.length; ci++) {
        var cell = obj._cells[ci];
        var cellDf = cell.dfField || '';
        if (!cellDf) continue;
        var cellKey = cellDf + '::cell(' + (cell.row + 1) + ',' + (cell.col + 1) + ')';
        // Check file uploads first (single image applied to all rows)
        var uploadedImg = fileUploads[cellKey] || null;
        if (uploadedImg) {
          cell.imgSrc = uploadedImg;
          if (!cell.fit) cell.fit = 'cover';
          stats.gridFilled++;
          continue;
        }
        // Fall back to CSV column mapping
        var cellHeader = mapping[cellKey] || '';
        if (!cellHeader) {
          stats.gridEmpty++;
          continue;
        }
        var cellValue = row[cellHeader];
        if (cellValue == null || String(cellValue).trim() === '') {
          stats.gridEmpty++;
          continue;
        }
        var url = String(cellValue).trim();
        cell.imgSrc = url;
        if (!cell.fit) cell.fit = 'cover';
        stats.gridFilled++;
      }
    });
    // Last: a swapped image inside a clip frame carries the PREVIOUS image's crop and scale.
    refitClipFrames(json, (opts && opts.imageSizes) || null);
    return stats;
  }

  window.CCBulk = {
    collectFields: collectFields,
    collectFieldsFromJson: collectFieldsFromJson,
    defaultMapping: defaultMapping,
    parseFile: parseFile,
    parseCsvFile: parseCsvFile,
    parseXlsxFile: parseXlsxFile,
    isXlsxFile: isXlsxFile,
    applyRow: applyFieldMappingsToJson,
    refitClipFrames: refitClipFrames,
    applyMappedValueToObject: applyMappedValueToObject,
    normalizeTextValue: normalizeTextValue,
    isImageUrl: isImageUrl,
    isColorValue: isColorValue,
    walkJsonObjects: walkJsonObjects
  };

  if (window.cc && cc.modules && cc.modules.register) {
    cc.modules.register({ id: 'shared.bulk-builder.engine', parent: 'shared.bulk-builder' });
  }
})();

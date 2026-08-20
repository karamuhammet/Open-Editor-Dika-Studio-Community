/* ============================================================
   dika studio – Video Editor Persistence (IndexedDB)
   Robust save/load with IndexedDB for project data & media.
   Public API: window.VEPersistence
   ============================================================ */
(function() {
  'use strict';

  var DB_NAME = 'dika_ve_projects';
  var DB_VERSION = 1;
  var STORE_PROJECTS = 'projects';
  var STORE_MEDIA = 'media';
  var _db = null;
  var _autoSaveTimer = null;
  var AUTO_SAVE_INTERVAL = 30000; // 30 seconds

  // ── Open database ─────────────────────────────────────────
  function _openDB() {
    return new Promise(function(resolve, reject) {
      if (_db) return resolve(_db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          var ps = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
          ps.createIndex('updatedAt', 'updatedAt', { unique: false });
          ps.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        }
      };
      req.onsuccess = function(e) {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = function(e) {
        console.warn('[VEPersistence] DB open error:', e);
        reject(e);
      };
    });
  }

  // ── Generate project ID ───────────────────────────────────
  function _genId() {
    return 'vep-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  }

  // ── Save project ──────────────────────────────────────────
  function saveProject(projectData, name) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var id = projectData._persistId || _genId();
        projectData._persistId = id;

        var record = {
          id: id,
          name: name || projectData.name || 'Untitled Project',
          createdAt: projectData._createdAt || Date.now(),
          updatedAt: Date.now(),
          data: _serializeProject(projectData)
        };

        var tx = db.transaction(STORE_PROJECTS, 'readwrite');
        var store = tx.objectStore(STORE_PROJECTS);
        var req = store.put(record);
        req.onsuccess = function() { resolve(id); };
        req.onerror = function(e) { reject(e); };
      });
    });
  }

  // ── Load project ──────────────────────────────────────────
  function loadProject(id) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_PROJECTS, 'readonly');
        var store = tx.objectStore(STORE_PROJECTS);
        var req = store.get(id);
        req.onsuccess = function() {
          if (req.result) resolve(req.result);
          else reject(new Error('Project not found: ' + id));
        };
        req.onerror = function(e) { reject(e); };
      });
    });
  }

  // ── List projects ─────────────────────────────────────────
  function listProjects() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_PROJECTS, 'readonly');
        var store = tx.objectStore(STORE_PROJECTS);
        var req = store.getAll();
        req.onsuccess = function() {
          var list = (req.result || []).map(function(r) {
            return {
              id: r.id,
              name: r.name,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
              trackCount: r.data ? (r.data.tracks || []).length : 0
            };
          });
          list.sort(function(a, b) { return b.updatedAt - a.updatedAt; });
          resolve(list);
        };
        req.onerror = function(e) { reject(e); };
      });
    });
  }

  // ── Delete project ────────────────────────────────────────
  function deleteProject(id) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction([STORE_PROJECTS, STORE_MEDIA], 'readwrite');
        tx.objectStore(STORE_PROJECTS).delete(id);
        // Also clean up media blobs for this project
        var mediaStore = tx.objectStore(STORE_MEDIA);
        var mReq = mediaStore.getAll();
        mReq.onsuccess = function() {
          (mReq.result || []).forEach(function(m) {
            if (m.projectId === id) mediaStore.delete(m.id);
          });
        };
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e); };
      });
    });
  }

  // ── Rename project ────────────────────────────────────────
  function renameProject(id, newName) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_PROJECTS, 'readwrite');
        var store = tx.objectStore(STORE_PROJECTS);
        var req = store.get(id);
        req.onsuccess = function() {
          if (!req.result) return reject(new Error('Not found'));
          var rec = req.result;
          rec.name = newName;
          rec.updatedAt = Date.now();
          store.put(rec);
          tx.oncomplete = function() { resolve(); };
        };
        req.onerror = function(e) { reject(e); };
      });
    });
  }

  // ── Save media blob ───────────────────────────────────────
  function saveMedia(mediaId, blob, projectId) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_MEDIA, 'readwrite');
        var store = tx.objectStore(STORE_MEDIA);
        store.put({ id: mediaId, blob: blob, projectId: projectId });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e); };
      });
    });
  }

  // ── Load media blob ─────────────────────────────────────  
  function loadMedia(mediaId) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_MEDIA, 'readonly');
        var store = tx.objectStore(STORE_MEDIA);
        var req = store.get(mediaId);
        req.onsuccess = function() {
          resolve(req.result ? req.result.blob : null);
        };
        req.onerror = function(e) { reject(e); };
      });
    });
  }

  // ── Serialize project (strip non-serializable) ────────────
  function _serializeProject(proj) {
    var data = {
      name: proj.name || 'Untitled',
      bgColor: proj.bgColor,
      bgGradient: proj.bgGradient || null,
      bgImage: proj.bgImage || null,
      /* `_bgClipId` names the clip the compositor draws as the video BACKGROUND (preview-render.js
         ~:798) and `bgFit` is how it frames it (~:913). Both were missing here while the heavy
         serializer carried them, and `_veRestoreProject` reads them straight off the saved project
         (project.js ~:252) - so any restore through THIS serializer nulled the background clip and the
         picture went BLACK while the clip still played its audio. That hit .ccve import and the
         IndexedDB autosave too, not only co-editing. kb/editor §8.7 warns that these two serializers
         drift and that bg* fields must exist in both; this is that drift, found 2026-07-29. */
      _bgClipId: proj._bgClipId || null,
      bgFit: proj.bgFit || 'cover',
      playheadTime: proj.playheadTime,
      duration: proj.duration,
      zoom: proj.zoom,
      aspectRatio: proj.aspectRatio || '16:9',
      customW: proj.customW || null,
      customH: proj.customH || null,
      markers: (proj.markers || []).slice(),
      tracks: []
    };
    (proj.tracks || []).forEach(function(track) {
      var t = {
        id: track.id,
        label: track.label,
        type: track.type,
        role: track.role,
        speakerId: track.speakerId,
        speakerOrdinal: track.speakerOrdinal,
        speakerLane: track.speakerLane,
        cueDubJob: track.cueDubJob ? JSON.parse(JSON.stringify(track.cueDubJob)) : null,
        _color: track._color,
        muted: track.muted,
        solo: track.solo,
        locked: track.locked,
        clips: []
      };
      // Any track carrying cues (subtitles now live on NORMAL tracks, not a
      // dedicated 'subtitle' track): keep the FULL subtitle-element schema
      // (styleId, animationId, textProps, position, lang, sourceTrackId), not
      // just cues, so IndexedDB autosave + .ccve export/import round-trip the
      // styling (M1). Keying off `cues` not the type is what keeps subtitles from
      // vanishing on reload once they sit on a normal track.
      if (track.type === 'subtitle' || (track.cues && track.cues.length)) {
        t.cues = track.cues;
        t.subtitleStyle = track.subtitleStyle;
        t.styleId = track.styleId;
        t.animationId = track.animationId;
        t.textProps = track.textProps;
        t.position = track.position;
        t.lang = track.lang;
        t.sourceTrackId = track.sourceTrackId;
        t.sourceSubtitleSetId = track.sourceSubtitleSetId;
        t.subtitleSetId = track.subtitleSetId;
        t.speakerId = track.speakerId;
        t.speakerOrdinal = track.speakerOrdinal;
        t.sourceProvider = track.sourceProvider;
        t.speechProvider = track.speechProvider;
        t.translationTarget = track.translationTarget;
        t.translationJobId = track.translationJobId;
        t.translationProvider = track.translationProvider;
        t.translationModel = track.translationModel;
        t.translationPurpose = track.translationPurpose;
        t.captionVisible = track.captionVisible !== false;
        t.autoSubtitleGenerated = track.autoSubtitleGenerated;
        t._color = track._color;
      }
      (track.clips || []).forEach(function(clip) {
        var c = {};
        var skip = { _thumbCache: 1, _waveformUrl: 1, _filmstripCache: 1, _filmstripPending: 1, _filmstripOrder: 1, _filmstripRequestToken: 1 };
        for (var k in clip) {
          if (clip.hasOwnProperty(k) && !skip[k]) {
            // Skip blob URLs (non-serializable), store fileName instead
            if (k === 'src') {
              c._mediaRef = clip.id; // reference for media store
            } else {
              c[k] = clip[k];
            }
          }
        }
        t.clips.push(c);
      });
      data.tracks.push(t);
    });
    // Plugin data
    if (window.VEPluginSystem) {
      data.pluginData = VEPluginSystem.getPluginData();
    }
    return data;
  }

  // ── Auto-save ─────────────────────────────────────────────
  function startAutoSave(getProjectFn) {
    stopAutoSave();
    _autoSaveTimer = setInterval(function() {
      var proj = getProjectFn();
      if (proj && proj.tracks && proj.tracks.length) {
        saveProject(proj, proj.name).catch(function(e) {
          console.warn('[VEPersistence] Auto-save failed:', e);
        });
      }
    }, AUTO_SAVE_INTERVAL);
  }

  function stopAutoSave() {
    if (_autoSaveTimer) {
      clearInterval(_autoSaveTimer);
      _autoSaveTimer = null;
    }
  }

  // ── Export as .ccve (JSON project without media blobs) ─────
  function exportProjectFile(projectData) {
    var serialized = _serializeProject(projectData);
    var json = JSON.stringify(serialized, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (projectData.name || 'project') + '.ccve';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ── Import .ccve ──────────────────────────────────────────
  function importProjectFile() {
    return new Promise(function(resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ccve,.json';
      input.addEventListener('change', function() {
        if (!input.files || !input.files.length) return resolve(null);
        var reader = new FileReader();
        reader.onload = function() {
          try {
            var data = JSON.parse(reader.result);
            resolve(data);
          } catch (e) {
            console.warn('[VEPersistence] Import parse error:', e);
            resolve(null);
          }
        };
        reader.readAsText(input.files[0]);
      });
      input.click();
    });
  }

  // ── Cleanup ───────────────────────────────────────────────
  function dispose() {
    stopAutoSave();
    if (_db) _db.close();
    _db = null;
  }

  // ── Public API ────────────────────────────────────────────
  window.VEPersistence = {
    saveProject:       saveProject,
    loadProject:       loadProject,
    /* Exposed for system/coedit (video co-editing). This is the PURE serializer: it reads a project and
       returns plain data, with no IndexedDB write and no media upload. `VE._veSerializeProject` is the
       heavy one and must never be put on a timer - it persists blobs and can upload media as a side
       effect. A third hand-written copy is what we are avoiding here; kb/editor §8.7 already warns that
       the two existing serializers drift. */
    serializeProject:  _serializeProject,
    listProjects:      listProjects,
    deleteProject:     deleteProject,
    renameProject:     renameProject,
    saveMedia:         saveMedia,
    loadMedia:         loadMedia,
    startAutoSave:     startAutoSave,
    stopAutoSave:      stopAutoSave,
    exportProjectFile: exportProjectFile,
    importProjectFile: importProjectFile,
    dispose:           dispose
  };

})();

// Modular skeleton hook (Faz 8) — ve-persistence is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-persistence', parent: 'video', title: 've-persistence', mount: function () {}, unmount: function () {} });

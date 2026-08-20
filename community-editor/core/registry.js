/* ============================================================
   dika studio core — module registry + ERROR BOUNDARY.
   Modules plug in with:
     cc.modules.register({ id, title, icon, mount, unmount })
   Every module callback runs inside try/catch: a module that throws
   is marked "failed" and ISOLATED — the app and all OTHER modules
   keep running (a broken tab just stays closed).
   ============================================================ */
(function (global) {
  'use strict';
  var cc = global.cc || (global.cc = {});
  var _mods = {};
  var _order = [];

  // A panel module is the parent; its tabs/features are sub-modules that pass
  // `parent: '<panelId>'`. Sub-modules are keyed "<parent>.<id>" so two panels
  // can both have e.g. a "styles" sub-module without colliding.
  function _key(parent, id) { return parent ? parent + '.' + id : id; }

  function register(def) {
    if (!def || !def.id) { console.warn('[cc.modules] register() needs an id'); return null; }
    var key = _key(def.parent, def.id);
    if (_mods[key]) { console.warn('[cc.modules] duplicate module id ignored:', key); return _mods[key]; }
    var rec = { id: def.id, fullId: key, parent: def.parent || null, def: def, status: 'registered', error: null, mounted: false };
    _mods[key] = rec; _order.push(key);
    if (cc.emit) cc.emit('module:registered', rec);
    return rec;
  }

  function _safe(rec, fnName, args) {
    var fn = (rec && rec.def) ? rec.def[fnName] : null;
    if (typeof fn !== 'function') return undefined;
    try { return fn.apply(rec.def, args || []); }
    catch (e) {
      rec.status = 'failed'; rec.error = e;
      console.error('[cc.modules] "' + rec.id + '".' + fnName + '() failed — isolated, app continues:', e);
      if (cc.emit) cc.emit('module:failed', rec);
      return undefined;
    }
  }

  function mount(id, root) {
    var rec = _mods[id];
    if (!rec || rec.status === 'failed' || rec.mounted) return;
    _safe(rec, 'mount', [root]);
    if (rec.status !== 'failed') { rec.mounted = true; rec.status = 'mounted'; }
  }
  function unmount(id) {
    var rec = _mods[id];
    if (!rec || !rec.mounted) return;
    _safe(rec, 'unmount', []);
    rec.mounted = false;
    if (rec.status !== 'failed') rec.status = 'registered';
  }

  function get(id) { return _mods[id] || null; }
  function all() { return _order.map(function (id) { return _mods[id]; }); }
  function children(parentId) {
    return _order.map(function (k) { return _mods[k]; }).filter(function (r) { return r.parent === parentId; });
  }
  function failed() { return all().filter(function (r) { return r && r.status === 'failed'; }); }

  // ── Generic fault isolation (Faz 6) — "a broken part must not break the whole." ──
  // Wrap ANY init/render/event-handler so a throw is logged + contained (returns `fallback`)
  // instead of bubbling up and taking down sibling sub-modules or the parent. Sub-modules use
  // these to wrap their own slice of work so one broken section (e.g. appearance) never kills
  // its neighbours (typography/effects). Emits 'safe:error' for the health view / telemetry.
  function safe(label, fn, fallback) {
    if (typeof fn !== 'function') return fallback;
    try { return fn(); }
    catch (e) {
      console.error('[cc.safe] "' + label + '" threw (isolated):', e);
      if (cc.emit) cc.emit('safe:error', { label: label, error: e });
      return fallback;
    }
  }
  // Returns a wrapped function whose every call is fault-isolated (for event listeners).
  function safeWrap(label, fn, fallback) {
    return function () {
      var self = this, args = arguments;
      return safe(label, function () { return fn.apply(self, args); }, fallback);
    };
  }

  cc.modules = { register: register, mount: mount, unmount: unmount, get: get, all: all, children: children, failed: failed };
  cc.safe = safe;
  cc.safeWrap = safeWrap;
  global.cc = cc;
})(window);

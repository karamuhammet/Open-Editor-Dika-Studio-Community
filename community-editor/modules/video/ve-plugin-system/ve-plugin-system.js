/* ============================================================
   dika studio – Video Editor Plugin System
   Extensible plugin architecture (VideoJS-inspired).
   Public API: window.VEPluginSystem
   ============================================================ */
(function() {
  'use strict';

  // ── Plugin registry ───────────────────────────────────────
  var _plugins = {};       // name → { factory, instances: [] }
  var _hooks = {};         // hookName → [ { pluginName, fn, priority } ]
  var _globalState = {};   // per-plugin global state

  // ── Hook names ────────────────────────────────────────────
  var HOOK_NAMES = [
    'beforeRender', 'afterRender',
    'beforeExport', 'afterExport',
    'onClipAdd', 'onClipRemove',
    'onPlay', 'onPause', 'onSeek',
    'onProjectLoad', 'onProjectSave'
  ];

  // Initialize hook arrays
  HOOK_NAMES.forEach(function(h) { _hooks[h] = []; });

  // ── Register a plugin ─────────────────────────────────────
  // factoryFn receives (pluginApi) and returns plugin instance:
  //   { init, dispose, onPlay, onPause, onSeek, onRender, getState, setState }
  function registerPlugin(name, factoryFn) {
    if (!name || typeof factoryFn !== 'function') return;
    if (_plugins[name]) {
      console.warn('[VEPluginSystem] Plugin already registered:', name);
      return;
    }
    _plugins[name] = {
      factory: factoryFn,
      instances: [],
      enabled: true
    };
    _globalState[name] = {};
  }

  // ── Create a plugin instance (per-clip or global) ─────────
  function createInstance(name, clipId) {
    var reg = _plugins[name];
    if (!reg || !reg.enabled) return null;

    var api = {
      pluginName: name,
      clipId: clipId || null,
      getState: function() {
        if (clipId) {
          var key = name + ':' + clipId;
          return _globalState[key] || {};
        }
        return _globalState[name] || {};
      },
      setState: function(newState) {
        var key = clipId ? (name + ':' + clipId) : name;
        _globalState[key] = Object.assign(_globalState[key] || {}, newState);
      },
      on: function(hookName, fn, priority) {
        addHook(hookName, name, fn, priority);
      },
      off: function(hookName) {
        removeHook(hookName, name);
      }
    };

    try {
      var instance = reg.factory(api);
      if (instance) {
        instance._pluginName = name;
        instance._clipId = clipId || null;
        reg.instances.push(instance);
        if (typeof instance.init === 'function') instance.init();
      }
      return instance;
    } catch (e) {
      console.warn('[VEPluginSystem] Error creating instance of', name, e);
      return null;
    }
  }

  // ── Dispose a plugin instance ─────────────────────────────
  function disposeInstance(name, clipId) {
    var reg = _plugins[name];
    if (!reg) return;
    reg.instances = reg.instances.filter(function(inst) {
      if (clipId && inst._clipId !== clipId) return true;
      if (!clipId && inst._clipId) return true;
      try {
        if (typeof inst.dispose === 'function') inst.dispose();
      } catch (e) {}
      return false;
    });
    if (clipId) delete _globalState[name + ':' + clipId];
  }

  // ── Dispose all instances of a plugin ─────────────────────
  function disposeAll(name) {
    var reg = _plugins[name];
    if (!reg) return;
    reg.instances.forEach(function(inst) {
      try {
        if (typeof inst.dispose === 'function') inst.dispose();
      } catch (e) {}
    });
    reg.instances = [];
  }

  // ── Hook management ───────────────────────────────────────
  function addHook(hookName, pluginName, fn, priority) {
    if (!_hooks[hookName]) _hooks[hookName] = [];
    _hooks[hookName].push({
      pluginName: pluginName,
      fn: fn,
      priority: priority || 0
    });
    _hooks[hookName].sort(function(a, b) { return b.priority - a.priority; });
  }

  function removeHook(hookName, pluginName) {
    if (!_hooks[hookName]) return;
    _hooks[hookName] = _hooks[hookName].filter(function(h) {
      return h.pluginName !== pluginName;
    });
  }

  // ── Execute hooks ─────────────────────────────────────────
  function runHook(hookName, data) {
    var hooks = _hooks[hookName];
    if (!hooks || !hooks.length) return data;
    for (var i = 0; i < hooks.length; i++) {
      try {
        var result = hooks[i].fn(data);
        if (result !== undefined) data = result;
      } catch (e) {
        console.warn('[VEPluginSystem] Hook error in', hookName, hooks[i].pluginName, e);
      }
    }
    return data;
  }

  // ── Enable/disable plugin ─────────────────────────────────
  function enablePlugin(name) {
    if (_plugins[name]) _plugins[name].enabled = true;
  }

  function disablePlugin(name) {
    if (_plugins[name]) {
      _plugins[name].enabled = false;
      disposeAll(name);
    }
  }

  function isEnabled(name) {
    return _plugins[name] ? _plugins[name].enabled : false;
  }

  // ── Get registered plugins ────────────────────────────────
  function getRegistered() {
    var list = [];
    var names = Object.keys(_plugins);
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      list.push({
        name: n,
        enabled: _plugins[n].enabled,
        instanceCount: _plugins[n].instances.length
      });
    }
    return list;
  }

  // ── Get plugin state (for serialization) ──────────────────
  function getPluginData() {
    var data = {};
    var names = Object.keys(_plugins);
    for (var i = 0; i < names.length; i++) {
      data[names[i]] = {
        enabled: _plugins[names[i]].enabled
      };
    }
    return data;
  }

  function loadPluginData(data) {
    if (!data) return;
    var names = Object.keys(data);
    for (var i = 0; i < names.length; i++) {
      if (_plugins[names[i]] && data[names[i]]) {
        _plugins[names[i]].enabled = data[names[i]].enabled !== false;
      }
    }
  }

  // ── Cleanup ───────────────────────────────────────────────
  function dispose() {
    var names = Object.keys(_plugins);
    for (var i = 0; i < names.length; i++) {
      disposeAll(names[i]);
    }
    HOOK_NAMES.forEach(function(h) { _hooks[h] = []; });
    _globalState = {};
  }

  // ── Public API ────────────────────────────────────────────
  window.VEPluginSystem = {
    registerPlugin:   registerPlugin,
    createInstance:    createInstance,
    disposeInstance:   disposeInstance,
    disposeAll:        disposeAll,
    addHook:          addHook,
    removeHook:       removeHook,
    runHook:          runHook,
    enablePlugin:     enablePlugin,
    disablePlugin:    disablePlugin,
    isEnabled:        isEnabled,
    getRegistered:    getRegistered,
    getPluginData:    getPluginData,
    loadPluginData:   loadPluginData,
    dispose:          dispose,
    HOOK_NAMES:       HOOK_NAMES
  };

})();

// Modular skeleton hook (Faz 8) — ve-plugin-system is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-plugin-system', parent: 'video', title: 've-plugin-system', mount: function () {}, unmount: function () {} });

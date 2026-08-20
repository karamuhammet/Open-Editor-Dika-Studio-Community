/* Module: video/ve-advanced-features/plugin-sandbox — Plugin Sandbox — iframe-isolated 3rd-party plugin host
   Part of the ve-advanced-features group (decomposed from the 2015-line IIFE). Functions hang off the
   shared namespace VEA (window.__ccVEAdvanced, created by the parent); cross-module refs resolve
   through VEA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEA = window.__ccVEAdvanced;
  if (!VEA) return;
  var MAX_MESSAGE_BYTES = 65536;
  var MAX_PENDING_REQUESTS = 64;

  function _messageBytes(value) {
    try { return JSON.stringify(value).length; } catch (e) { return MAX_MESSAGE_BYTES + 1; }
  }

  function _capabilityToken() {
    var bytes = new Uint32Array(4);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (n) { return n.toString(16).padStart(8, '0'); }).join('');
    }
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  VEA.PluginSandbox = function (manifest) {
    this.manifest = manifest || {};
    this.id = this.manifest.id || ('plugin_' + Date.now());
    this.permissions = Array.isArray(this.manifest.permissions) ? this.manifest.permissions.slice(0, 32) : [];
    this._iframe = null;
    this._capability = _capabilityToken();
    this._disposed = false;
  };

  VEA.PluginSandbox.prototype.init = function(container) {
    var self = this;
    this._iframe = document.createElement('iframe');
    this._iframe.sandbox = 'allow-scripts';
    this._iframe.style.cssText = 'display:none;width:0;height:0;border:none;';

    // Build sandboxed HTML
    var sandboxHTML = '<!DOCTYPE html><html><head><script>' +
      'var _pluginId = ' + JSON.stringify(this.id) + ';' +
      'var _capability = ' + JSON.stringify(this._capability) + ';' +
      'var _maxBytes = ' + MAX_MESSAGE_BYTES + ';' +
      'var _maxPending = ' + MAX_PENDING_REQUESTS + ';' +
      'var dika = {' +
      '  _req: function(method, args, cb) {' +
      '    var encoded = ""; try { encoded = JSON.stringify(args || {}); } catch (e) { throw new Error("Plugin args must be JSON serializable"); }' +
      '    if (typeof method !== "string" || method.length > 64 || encoded.length > _maxBytes) throw new Error("Plugin request rejected");' +
      '    if (Object.keys(dika._callbacks).length >= _maxPending) throw new Error("Plugin request limit reached");' +
      '    var id = ++dika._reqId;' +
      '    if (typeof cb === "function") dika._callbacks[id] = cb;' +
      '    parent.postMessage({plugin: _pluginId, capability: _capability, method: method, args: args || {}, requestId: id}, "*");' +
      '  },' +
      '  _reqId: 0,' +
      '  _callbacks: {},' +
      '  timeline: {' +
      '    getClips: function(cb) { dika._req("timeline.getClips", {}, cb); },' +
      '    addClip: function(clip, cb) { dika._req("timeline.addClip", clip, cb); }' +
      '  },' +
      '  canvas: {' +
      '    getFrame: function(time, cb) { dika._req("canvas.getFrame", {time: time}, cb); }' +
      '  },' +
      '  ui: {' +
      '    showToast: function(msg) { dika._req("ui.showToast", {message: msg}); }' +
      '  },' +
      '  storage: {' +
      '    get: function(key, cb) { dika._req("storage.get", {key: key}, cb); },' +
      '    set: function(key, val, cb) { dika._req("storage.set", {key: key, value: val}, cb); }' +
      '  }' +
      '};' +
      'window.addEventListener("message", function(e) {' +
      '  if (e.source !== parent || !e.data || e.data.capability !== _capability) return;' +
      '  var encoded = ""; try { encoded = JSON.stringify(e.data); } catch (err) { return; }' +
      '  if (encoded.length > _maxBytes) return;' +
      '  if (Number.isSafeInteger(e.data.responseId) && dika._callbacks[e.data.responseId]) {' +
      '    dika._callbacks[e.data.responseId](e.data.result);' +
      '    delete dika._callbacks[e.data.responseId];' +
      '  }' +
      '});' +
      '<\/script></head><body></body></html>';

    this._iframe.srcdoc = sandboxHTML;

    // Listen for messages from sandbox.
    // The `e.source` check is the real gate, not the plugin id. The id is just a value the sender
    // chooses, so without this ANY frame on the page could address another plugin's handler by
    // sending that plugin's id and drive its privileged API (timeline.addClip, storage.set,
    // canvas.getFrame) under that plugin's permissions, bypassing its own.
    // `e.origin` is deliberately NOT used: this iframe is sandbox="allow-scripts", so its origin is
    // the opaque string "null" and comparing it proves nothing. Identity here is the window itself.
    this._messageHandler = function(e) {
      if (self._disposed) return;
      if (!self._iframe || e.source !== self._iframe.contentWindow) return;
      if (!e.data || e.data.plugin !== self.id || e.data.capability !== self._capability) return;
      if (_messageBytes(e.data) > MAX_MESSAGE_BYTES) return;
      self._handleMessage(e.data);
    };
    window.addEventListener('message', this._messageHandler);

    (container || document.body).appendChild(this._iframe);
    VEA._pluginSandboxes[this.id] = this;
  };

  VEA.PluginSandbox.prototype._hasPermission = function(method) {
    // Map method → required permission
    var permMap = {
      'timeline.getClips': 'timeline.read',
      'timeline.addClip': 'timeline.write',
      'canvas.getFrame': 'canvas.read',
      'ui.showToast': 'ui.basic',
      'storage.get': 'storage.read',
      'storage.set': 'storage.write'
    };
    if (!Object.prototype.hasOwnProperty.call(permMap, method)) return false;
    var needed = permMap[method];
    return this.permissions.indexOf(needed) !== -1 || this.permissions.indexOf('*') !== -1;
  };

  VEA.PluginSandbox.prototype._handleMessage = function(msg) {
    if (!msg || typeof msg.method !== 'string' || msg.method.length > 64) return;
    if (!Number.isSafeInteger(msg.requestId) || msg.requestId < 1 || msg.requestId > 1000000000) return;
    if (!msg.args || typeof msg.args !== 'object' || Array.isArray(msg.args)) {
      this._respond(msg.requestId, { error: 'Invalid arguments' });
      return;
    }
    if (!this._hasPermission(msg.method)) {
      this._respond(msg.requestId, { error: 'Permission denied: ' + msg.method });
      return;
    }

    var result = null;

    switch (msg.method) {
      case 'timeline.getClips':
        if (window.VideoEditor) {
          var proj = VideoEditor.getProject();
          var clips = [];
          if (proj && proj.tracks) {
            for (var t = 0; t < proj.tracks.length; t++) {
              for (var c = 0; c < proj.tracks[t].clips.length; c++) {
                clips.push({
                  id: proj.tracks[t].clips[c].id,
                  name: proj.tracks[t].clips[c].name,
                  start: proj.tracks[t].clips[c].start,
                  duration: proj.tracks[t].clips[c].duration
                });
              }
            }
          }
          result = clips;
        }
        break;

      case 'ui.showToast':
        if (msg.args && msg.args.message && typeof showToast === 'function') {
          showToast(String(msg.args.message).substring(0, 200));
        }
        result = true;
        break;

      case 'storage.get':
        if (msg.args && msg.args.key) {
          var storageKey = 'dika_plugin_' + this.id + '_' + String(msg.args.key).substring(0, 100);
          try { result = JSON.parse(localStorage.getItem(storageKey)); } catch(e) { result = null; }
        }
        break;

      case 'storage.set':
        if (msg.args && msg.args.key) {
          var sKey = 'dika_plugin_' + this.id + '_' + String(msg.args.key).substring(0, 100);
          try {
            var stored = JSON.stringify(msg.args.value);
            if (stored.length > 32768) result = { error: 'Storage value too large' };
            else { localStorage.setItem(sKey, stored); result = true; }
          } catch(e) { result = false; }
        }
        break;

      default:
        result = { error: 'Unknown method: ' + msg.method };
    }

    this._respond(msg.requestId, result);
  };

  VEA.PluginSandbox.prototype._respond = function(requestId, result) {
    if (!Number.isSafeInteger(requestId) || !this._iframe || !this._iframe.contentWindow) return;
    var payload = { capability: this._capability, responseId: requestId, result: result };
    if (_messageBytes(payload) > MAX_MESSAGE_BYTES) payload.result = { error: 'Response too large' };
    this._iframe.contentWindow.postMessage(payload, '*');
  };

  VEA.PluginSandbox.prototype.executeCode = function(code) {
    if (!this._iframe || !this._iframe.contentWindow) return;
    // Inject and execute code inside sandbox
    this._iframe.contentWindow.postMessage({ capability: this._capability, type: 'exec', code: String(code).substring(0, 50000) }, '*');
  };

  VEA.PluginSandbox.prototype.dispose = function() {
    this._disposed = true;
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
    }
    if (this._iframe && this._iframe.parentNode) {
      this._iframe.parentNode.removeChild(this._iframe);
    }
    this._iframe = null;
    this._capability = '';
    delete VEA._pluginSandboxes[this.id];
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'plugin-sandbox', parent: 'video.ve-advanced-features', title: 've-advanced-features: plugin-sandbox', mount: function () {}, unmount: function () {} });
  }
})();

/* ============================================================
   dika studio core — ACTION / TOOL REGISTRY (Faz 7, enterprise backbone).

   ONE schema'd catalog of operations that THREE consumers all drive:
     • the UI  (buttons/shortcuts bind to an action id)
     • the AI  (picks an action from the catalog + fills its params)
     • an MCP server (exposes cc.actions.list() as MCP tools, calls run())

   Modules opt in by registering their operations:
     cc.actions.register({ id, title, description, category, schema, run })
   where `schema` is a JSON Schema for the params (MCP "inputSchema").

   cc.actions.list()  → [{id,title,description,category,schema}]  (the tool catalog)
   cc.actions.run(id, params) → { ok, result } | { ok:false, error }  (validated + isolated)

   This is the bridge that makes the editor AI/MCP-drivable without a second code path:
   the AI calls the SAME actions the UI does. Additive — nothing else changes until an
   operation is registered here.
   ============================================================ */
(function (global) {
  'use strict';
  var cc = global.cc || (global.cc = {});
  var _actions = {};
  var _order = [];

  function register(def) {
    if (!def || !def.id) { console.warn('[cc.actions] register() needs an id'); return null; }
    if (typeof def.run !== 'function') { console.warn('[cc.actions] action "' + def.id + '" needs a run() fn'); return null; }
    if (_actions[def.id]) { console.warn('[cc.actions] duplicate action id ignored:', def.id); return _actions[def.id]; }
    var rec = {
      id: def.id,
      title: def.title || def.id,
      description: def.description || '',
      category: def.category || 'general',
      schema: def.schema || { type: 'object', properties: {} },
      run: def.run
    };
    _actions[def.id] = rec;
    _order.push(def.id);
    if (cc.emit) cc.emit('action:registered', rec);
    return rec;
  }

  function get(id) { return _actions[id] || null; }
  function has(id) { return !!_actions[id]; }

  // The catalog (no run fn) — exactly what an MCP server / the AI consumes.
  function list(category) {
    return _order
      .map(function (id) { return _actions[id]; })
      .filter(function (a) { return !category || a.category === category; })
      .map(function (a) { return { id: a.id, title: a.title, description: a.description, category: a.category, schema: a.schema }; });
  }

  // Minimal JSON-Schema-ish param validation (required present + primitive types + enum).
  // Deliberately small (no bundler); full validation can be layered later.
  function validate(schema, params) {
    params = params || {};
    var errors = [];
    var props = (schema && schema.properties) || {};
    var required = (schema && schema.required) || [];
    required.forEach(function (k) {
      if (params[k] === undefined || params[k] === null) errors.push('missing required param: ' + k);
    });
    Object.keys(props).forEach(function (k) {
      if (params[k] === undefined || params[k] === null) return;
      var p = props[k], v = params[k];
      if (p.type === 'number' && typeof v !== 'number') errors.push('"' + k + '" must be a number');
      else if (p.type === 'integer' && (typeof v !== 'number' || v % 1 !== 0)) errors.push('"' + k + '" must be an integer');
      else if (p.type === 'string' && typeof v !== 'string') errors.push('"' + k + '" must be a string');
      else if (p.type === 'boolean' && typeof v !== 'boolean') errors.push('"' + k + '" must be a boolean');
      if (p['enum'] && p['enum'].indexOf(v) === -1) errors.push('"' + k + '" must be one of: ' + p['enum'].join(', '));
      if (p.type === 'number' || p.type === 'integer') {
        if (p.minimum !== undefined && v < p.minimum) errors.push('"' + k + '" must be >= ' + p.minimum);
        if (p.maximum !== undefined && v > p.maximum) errors.push('"' + k + '" must be <= ' + p.maximum);
      }
    });
    return errors;
  }

  function run(id, params) {
    var a = _actions[id];
    if (!a) return { ok: false, error: 'unknown action: ' + id };
    var errs = validate(a.schema, params);
    if (errs.length) return { ok: false, error: 'invalid params for "' + id + '": ' + errs.join('; ') };
    // Run inside the error boundary so a throwing action can't crash the caller (UI/AI/MCP).
    var threw = null;
    var result = cc.safe
      ? cc.safe('action.' + id, function () { return a.run(params || {}); }, undefined)
      : (function () { try { return a.run(params || {}); } catch (e) { threw = e; } })();
    if (threw) return { ok: false, error: 'action "' + id + '" threw: ' + (threw && threw.message || threw) };
    if (cc.emit) cc.emit('action:ran', { id: id, params: params, result: result });
    return { ok: true, result: result };
  }

  cc.actions = { register: register, get: get, has: has, list: list, run: run, validate: validate };
  global.cc = cc;
})(window);

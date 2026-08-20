/* ============================================================
   dika studio core — tiny event bus (cc.on / cc.off / cc.emit).
   Lets modules signal each other WITHOUT direct coupling (no module
   ever calls another module's code). A throwing handler is isolated
   so it can't break the emitter or the other handlers.
   ============================================================ */
(function (global) {
  'use strict';
  var cc = global.cc || (global.cc = {});
  var _handlers = {};
  var _sticky = {};   // evt -> last args, for replay to LATE subscribers (lifecycle events)

  // Sticky/lifecycle events (Faz 6): modules load AFTER DOMContentLoaded, so a module that
  // subscribes after a one-shot lifecycle event already fired would miss it. emitSticky()
  // remembers the event so a later cc.on() replays it immediately. Lets modules self-init on
  // `cc:canvas-ready` / `cc:modules-ready` etc. regardless of load order — no reliance on
  // app.js calling them. Canonical events: cc:boot → cc:canvas-ready → cc:modules-ready.
  cc.on = function (evt, fn) {
    if (!_handlers[evt]) _handlers[evt] = [];
    _handlers[evt].push(fn);
    if (Object.prototype.hasOwnProperty.call(_sticky, evt)) {   // replay a past sticky emit
      try { fn.apply(null, _sticky[evt]); }
      catch (e) { console.error('[cc.bus] sticky replay of "' + evt + '" threw (isolated):', e); }
    }
    return function () { cc.off(evt, fn); };   // returns an unsubscribe fn
  };
  cc.off = function (evt, fn) {
    var a = _handlers[evt]; if (!a) return;
    var i = a.indexOf(fn); if (i !== -1) a.splice(i, 1);
  };
  cc.emit = function (evt) {
    var a = _handlers[evt]; if (!a || !a.length) return;
    var args = Array.prototype.slice.call(arguments, 1);
    var list = a.slice();   // snapshot so handlers may subscribe/unsubscribe safely
    for (var i = 0; i < list.length; i++) {
      try { list[i].apply(null, args); }
      catch (e) { console.error('[cc.bus] handler for "' + evt + '" threw (isolated):', e); }
    }
  };

  // Emit AND remember, so a module that subscribes later still gets it (see cc.on replay).
  cc.emitSticky = function (evt) {
    _sticky[evt] = Array.prototype.slice.call(arguments, 1);
    cc.emit.apply(cc, arguments);
  };
  cc.clearSticky = function (evt) { delete _sticky[evt]; };          // e.g. selection cleared
  cc.isSticky = function (evt) { return Object.prototype.hasOwnProperty.call(_sticky, evt); };

  global.cc = cc;
})(window);

/* Sub-module: canvas/actions — registers canvas operations in the cc.actions tool registry
   (Faz 7). These are the first AI/MCP-drivable actions. Each wraps EXISTING globals (fabric,
   addToCenter, getActiveCanvas, snap, delSelected) so the AI/MCP calls the exact same code the
   UI does — no second path. Invoked via cc.actions.run(id, params); the catalog is cc.actions.list().
   Runs at runtime (after cc:canvas-ready), so addToCenter etc. are defined by call time. */
(function () {
  'use strict';
  if (!window.cc || !cc.actions) { console.warn('[canvas.actions] cc.actions missing'); return; }

  function activeCanvas() { return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : window.canvas; }
  function addObj(o) {
    if (typeof addToCenter === 'function') addToCenter(o);
    else { var c = activeCanvas(); if (c) { c.add(o); c.setActiveObject(o); c.renderAll(); if (typeof snap === 'function') snap(); } }
  }
  function active() { var c = activeCanvas(); return c && c.getActiveObject(); }

  cc.actions.register({
    id: 'add-text', title: 'Add text', category: 'create',
    description: 'Add a text box to the centre of the canvas.',
    schema: { type: 'object', required: ['text'], properties: {
      text: { type: 'string', description: 'The text content' },
      fontSize: { type: 'number', minimum: 4, maximum: 400, description: 'Font size (px)' },
      fill: { type: 'string', description: 'Text colour, hex e.g. #ffffff' },
      fontWeight: { type: 'string', enum: ['normal', 'bold'], description: 'Font weight' } } },
    run: function (p) {
      var t = new fabric.Textbox(p.text, { fontSize: p.fontSize || 40, fill: p.fill || '#ffffff',
        fontWeight: p.fontWeight || 'normal', fontFamily: 'DM Sans' });
      addObj(t); return { added: 'text', text: p.text };
    }
  });

  cc.actions.register({
    id: 'add-rect', title: 'Add rectangle', category: 'create',
    description: 'Add a rectangle to the centre of the canvas.',
    schema: { type: 'object', properties: {
      width: { type: 'number', minimum: 1 }, height: { type: 'number', minimum: 1 },
      fill: { type: 'string', description: 'Fill colour, hex' } } },
    run: function (p) { var r = new fabric.Rect({ width: p.width || 200, height: p.height || 120, fill: p.fill || '#f2ff58' }); addObj(r); return { added: 'rect' }; }
  });

  cc.actions.register({
    id: 'add-circle', title: 'Add circle', category: 'create',
    description: 'Add a circle to the centre of the canvas.',
    schema: { type: 'object', properties: { radius: { type: 'number', minimum: 1 }, fill: { type: 'string' } } },
    run: function (p) { var c = new fabric.Circle({ radius: p.radius || 80, fill: p.fill || '#f2ff58' }); addObj(c); return { added: 'circle' }; }
  });

  cc.actions.register({
    id: 'set-opacity', title: 'Set opacity', category: 'edit',
    description: 'Set the opacity of the selected object (0 to 1).',
    schema: { type: 'object', required: ['opacity'], properties: { opacity: { type: 'number', minimum: 0, maximum: 1 } } },
    run: function (p) {
      var o = active(); if (!o) return { error: 'no object selected' };
      o.set('opacity', p.opacity); activeCanvas().renderAll(); if (typeof snap === 'function') snap();
      return { opacity: p.opacity };
    }
  });

  cc.actions.register({
    id: 'set-fill', title: 'Set fill colour', category: 'edit',
    description: 'Set the fill colour of the selected object (group-aware).',
    schema: { type: 'object', required: ['color'], properties: { color: { type: 'string', description: 'Hex colour' } } },
    run: function (p) {
      var o = active(); if (!o) return { error: 'no object selected' };
      if (o.type === 'group' && o._objects) o._objects.forEach(function (ch) { ch.set('fill', p.color); });
      else o.set('fill', p.color);
      o.dirty = true; activeCanvas().renderAll(); if (typeof snap === 'function') snap();
      return { fill: p.color };
    }
  });

  cc.actions.register({
    id: 'delete-selected', title: 'Delete selected', category: 'edit',
    description: 'Delete the currently selected object(s).',
    schema: { type: 'object', properties: {} },
    run: function () {
      if (typeof delSelected === 'function') { delSelected(); return { deleted: true }; }
      var o = active(); if (o) { activeCanvas().remove(o); return { deleted: true }; }
      return { deleted: false, error: 'no object selected' };
    }
  });

  if (cc.modules) cc.modules.register({ id: 'actions', parent: 'canvas', title: 'Canvas actions', mount: function () {}, unmount: function () {} });
})();

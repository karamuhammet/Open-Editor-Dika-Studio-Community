# dika studio skeleton — `core/`

The stable kernel every module plugs into. **Modules depend on `cc.*` only**, never raw globals, never another module's code. Core changes are serialized on `main`.

## Files (load order in index.html)
1. **`services.js`** — the `cc.*` facade over the app globals (lazy; nothing renamed/removed):
   `cc.canvas()` · `cc.rawCanvas()` · `cc.snap()` · `cc.addToCenter(o)` · `cc.scale()` · `cc.center()` · `cc.pages()` · `cc.pageIndex()` · `cc.customProps()` · `cc.registerProps([...])` · `cc.toast(msg,type)` · `cc.confirm(msg,ok,cancel)` · `cc.loadFont(family)`
2. **`bus.js`** — `cc.on(evt,fn)` (returns unsubscribe) · `cc.off(evt,fn)` · `cc.emit(evt,…)`. Handlers are isolated.
3. **`registry.js`** — `cc.modules.register({ id, title, icon, mount, unmount })` + error boundary. A throwing module is marked `failed` and isolated; the app and other modules keep running. Also `cc.modules.mount/unmount/get/all`.
4. **`panel-system.js`** — `cc.panels.register/get/all`. **PASSIVE in Faz 0** (old app.js rail/flyout still drives the UI).
5. **`loader.js`** — reads `modules/manifest.json`, loads each `modules/<name>/<name>.{css,js}`, failures skipped. `cc.loader.init()` auto-runs on DOMContentLoaded. Emits `modules:ready`.

## Module hierarchy — panel → sub-modules
A panel (e.g. `text`) is a **parent module**; its tabs/features are **sub-modules**, each in its own folder with its own JS+CSS, independently failable (a broken tab just stays closed, the rest work).
```
modules/text/                 # parent panel module
  text.js  text.css  module.json   (module.json.submodules = ["styles","pairings",...] — auto-maintained)
  styles/    styles.js  styles.css     # sub-module (a tab)
  pairings/  pairings.js  pairings.css  # sub-module
  ...
```
- Sub-modules register with a `parent`: `cc.modules.register({ id:'styles', parent:'text', mount, unmount })` → keyed `text.styles`.
- The parent finds them via `cc.modules.children('text')` and mounts each through the registry's error boundary (one failing doesn't break the others).
- The loader loads the parent first, then each sub-module listed in `module.json.submodules`.

## Add a module / sub-module — never edit index.html
```
node tools/new-module.mjs <name>            # scaffolds modules/<name>/ (a panel) + rebuilds manifest
node tools/new-submodule.mjs <name> <sub>   # scaffolds modules/<name>/<sub>/ (a tab) + rebuilds manifest
# code ONLY inside that folder (ideally in its own git worktree)
node tools/build-manifest.mjs               # if you add/remove folders manually
```

## Hard rules (excerpt — full list in the plan)
- Modules touch only their own folder; core is off-limits from a module worktree.
- Every module CSS selector is prefixed `.<id>-`; only theme tokens are global.
- New serialized object props MUST go through `cc.registerProps([...])` (CUSTOM_PROPS is sacred).
- `mount()` must be idempotent; modules must not assume load order (use `cc.on/emit`).

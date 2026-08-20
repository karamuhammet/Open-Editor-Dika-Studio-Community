/* One-off MODULE-PATTERN split of modules/export/export-manager/export-manager.js (1653 lines).
   Two independent top-level `var X = (function(){…return{…}})();` modules: ExportService (the export
   engine) and ExportManager (the modal UI). Cut by content markers (not line numbers):
     • child  service/service.js = the "Reusable Export Services" comment → just before the Manager
       comment. This carries the ExportService IIFE AND the two load-time window exports that read
       `ExportService.importProject` (they must stay in the same script as the definition).
     • parent export-manager.js = the file banner + the "Export / Import Manager Modal" comment
       through EOF (the ExportManager IIFE + its register). ExportManager calls ExportService only
       inside its methods (user-action time) → sibling load order is irrelevant. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const FILE = 'modules/export/export-manager/export-manager.js';
const lines = readFileSync(FILE, 'utf8').split(/\r?\n/);
const idx = (needle) => { const i = lines.findIndex(l => l.indexOf(needle) >= 0); if (i < 0) throw new Error('marker not found: ' + needle); return i; };
const iSvc = idx('── Reusable Export Services');
const iMgr = idx('── Export / Import Manager Modal');
// child = service comment .. line before Manager comment (trim trailing blanks)
let svcEnd = iMgr - 1; while (svcEnd > iSvc && lines[svcEnd].trim() === '') svcEnd--;
const childBody = lines.slice(iSvc, svcEnd + 1).join('\n');
mkdirSync('modules/export/export-manager/service', { recursive: true });
const child =
  '/* Module: export/export-manager/service — ExportService: the reusable export engine (render page →\n' +
  '   dataURL, PNG/SVG/PDF/ZIP/PSD/project export + import). MODULE-PATTERN: `var ExportService =\n' +
  '   (function(){…return{…}})();` — a global object; siblings (the Manager UI, import-export) call it at\n' +
  "   runtime so load order is irrelevant. Split from the 1653-line export-manager.js. */\n\n" +
  childBody + '\n\n' +
  "if (window.cc && cc.modules) cc.modules.register({ id: 'service', parent: 'export.export-manager', title: 'export-manager: service', mount: function () {}, unmount: function () {} });\n";
writeFileSync('modules/export/export-manager/service/service.js', child);
// parent = banner (everything before the service comment) + Manager comment .. EOF
let bannerEnd = iSvc - 1; while (bannerEnd > 0 && lines[bannerEnd].trim() === '') bannerEnd--;
const parent = lines.slice(0, bannerEnd + 1).join('\n') + '\n\n' + lines.slice(iMgr).join('\n');
writeFileSync(FILE, parent.endsWith('\n') ? parent : parent + '\n');
console.log('service child: ' + (svcEnd - iSvc + 1) + ' lines (ExportService + 2 window exports)');
console.log('parent: ' + parent.split('\n').length + ' lines (banner + ExportManager), was ' + lines.length);

/* core/right-panel.js — the right-side PROPERTY EDITOR engine. Moved VERBATIM from js/app.js
   sections 15 (Property Editor) + 16 (Property Bindings), Faz 3. syncRightPanel reads the
   active object and fills the ~78 #p-* inputs (called on every selection change + by a module);
   initPropertyBindings wires those inputs back onto the object (called at init); plus panel
   collapse/expand/toggle, the whiteboard variants (syncBoardPanel/initBoardPropertyBindings)
   and setAlign (alignment buttons, index.html onclick + modules). Always-needed engine (NOT a
   disable-able feature) → core/, loaded BEFORE app.js so everything stays global and app.js
   keeps calling it (selection handlers → syncRightPanel; initApp → initPropertyBindings +
   initRpanelToggle). The #p-* HTML stays in index.html. Deps (canvas/getActiveCanvas/
   getActiveObject/snap/wbActive/CUSTOM_PROPS) are app.js globals resolved at call time. */
// ── 15. Right Panel (Property Editor) ────────────────────────

/* Right-panel copy is partly emitted by the canvas/layout sibling modules at runtime. Keep the
   missing panel vocabulary here so the allowed right-panel seam can register it with CCI18n before
   those controls mount. This intentionally leaves technical identifiers (X/Y/W/H, degrees, icon
   names) untouched. */
var _RP_I18N_COPY = {
  zh: {
    'Layout': '布局', 'Position & size': '位置与大小', 'Arrange': '排列', 'Distribute': '分布',
    'Translate': '翻译', 'Align selection': '对齐所选对象', 'Align left': '左对齐',
    'Align center (H)': '水平居中', 'Align right': '右对齐', 'Align top': '顶部对齐',
    'Align middle (V)': '垂直居中', 'Align bottom': '底部对齐', 'Flip': '翻转',
    'Horizontal': '水平', 'Vertical': '垂直', 'Rotation': '旋转',
    'Constrain proportions': '锁定比例', 'Distribute (3+ selected)': '分布（至少选择 3 个）',
    'New Folder': '新建文件夹', 'Wireframe Settings': '线框设置', 'Detach Frame': '分离框架',
    'Duplicate': '复制', 'Delete': '删除', 'Rename': '重命名', 'Hide': '隐藏', 'Show': '显示',
    'Move to Folder': '移动到文件夹', 'COLOR LABEL': '颜色标签', 'Search folders...': '搜索文件夹…',
    'No Folder (Root)': '无文件夹（根目录）', 'Folder': '文件夹', 'None (static)': '无（静态）',
    'No results': '无结果', 'Search field...': '搜索字段…'
  },
  fr: {
    'Layout': 'Mise en page', 'Position & size': 'Position et taille', 'Arrange': 'Organiser', 'Distribute': 'Distribuer',
    'Translate': 'Traduire', 'Align selection': 'Aligner la sélection', 'Align left': 'Aligner à gauche',
    'Align center (H)': 'Centrer horizontalement', 'Align right': 'Aligner à droite', 'Align top': 'Aligner en haut',
    'Align middle (V)': 'Centrer verticalement', 'Align bottom': 'Aligner en bas', 'Flip': 'Retourner',
    'Horizontal': 'Horizontal', 'Vertical': 'Vertical', 'Rotation': 'Rotation', 'Constrain proportions': 'Conserver les proportions',
    'Distribute (3+ selected)': 'Distribuer (3 sélections ou plus)', 'New Folder': 'Nouveau dossier',
    'Wireframe Settings': 'Paramètres du wireframe', 'Detach Frame': 'Détacher le cadre', 'Duplicate': 'Dupliquer',
    'Delete': 'Supprimer', 'Rename': 'Renommer', 'Hide': 'Masquer', 'Show': 'Afficher', 'Move to Folder': 'Déplacer vers le dossier',
    'COLOR LABEL': 'ÉTIQUETTE DE COULEUR', 'Search folders...': 'Rechercher des dossiers…', 'No Folder (Root)': 'Aucun dossier (racine)',
    'Folder': 'Dossier', 'None (static)': 'Aucun (statique)', 'No results': 'Aucun résultat', 'Search field...': 'Rechercher un champ…'
  },
  de: {
    'Layout': 'Layout', 'Position & size': 'Position und Größe', 'Arrange': 'Anordnen', 'Distribute': 'Verteilen',
    'Translate': 'Übersetzen', 'Align selection': 'Auswahl ausrichten', 'Align left': 'Links ausrichten',
    'Align center (H)': 'Horizontal zentrieren', 'Align right': 'Rechts ausrichten', 'Align top': 'Oben ausrichten',
    'Align middle (V)': 'Vertikal zentrieren', 'Align bottom': 'Unten ausrichten', 'Flip': 'Spiegeln',
    'Horizontal': 'Horizontal', 'Vertical': 'Vertikal', 'Rotation': 'Drehung', 'Constrain proportions': 'Proportionen beibehalten',
    'Distribute (3+ selected)': 'Verteilen (mindestens 3 ausgewählt)', 'New Folder': 'Neuer Ordner',
    'Wireframe Settings': 'Wireframe-Einstellungen', 'Detach Frame': 'Rahmen lösen', 'Duplicate': 'Duplizieren',
    'Delete': 'Löschen', 'Rename': 'Umbenennen', 'Hide': 'Ausblenden', 'Show': 'Einblenden', 'Move to Folder': 'In Ordner verschieben',
    'COLOR LABEL': 'FARBKENNZEICHNUNG', 'Search folders...': 'Ordner suchen…', 'No Folder (Root)': 'Kein Ordner (Stammverzeichnis)',
    'Folder': 'Ordner', 'None (static)': 'Keine (statisch)', 'No results': 'Keine Ergebnisse', 'Search field...': 'Feld suchen…'
  },
  tr: {
    'Layout': 'Düzen', 'Position & size': 'Konum ve boyut', 'Arrange': 'Düzenle', 'Distribute': 'Dağıt',
    'Translate': 'Çevir', 'Align selection': 'Seçimi hizala', 'Align left': 'Sola hizala',
    'Align center (H)': 'Yatay ortala', 'Align right': 'Sağa hizala', 'Align top': 'Üste hizala',
    'Align middle (V)': 'Dikey ortala', 'Align bottom': 'Alta hizala', 'Flip': 'Çevir',
    'Horizontal': 'Yatay', 'Vertical': 'Dikey', 'Rotation': 'Döndürme', 'Constrain proportions': 'Oranları koru',
    'Distribute (3+ selected)': 'Dağıt (en az 3 seçim)', 'New Folder': 'Yeni klasör',
    'Wireframe Settings': 'Wireframe ayarları', 'Detach Frame': 'Çerçeveyi ayır', 'Duplicate': 'Çoğalt',
    'Delete': 'Sil', 'Rename': 'Yeniden adlandır', 'Hide': 'Gizle', 'Show': 'Göster', 'Move to Folder': 'Klasöre taşı',
    'COLOR LABEL': 'RENK ETİKETİ', 'Search folders...': 'Klasörlerde ara…', 'No Folder (Root)': 'Klasör yok (kök)',
    'Folder': 'Klasör', 'None (static)': 'Yok (statik)', 'No results': 'Sonuç yok', 'Search field...': 'Alan ara…'
  },
  es: {
    'Layout': 'Diseño', 'Position & size': 'Posición y tamaño', 'Arrange': 'Organizar', 'Distribute': 'Distribuir',
    'Translate': 'Traducir', 'Align selection': 'Alinear selección', 'Align left': 'Alinear a la izquierda',
    'Align center (H)': 'Centrar horizontalmente', 'Align right': 'Alinear a la derecha', 'Align top': 'Alinear arriba',
    'Align middle (V)': 'Centrar verticalmente', 'Align bottom': 'Alinear abajo', 'Flip': 'Voltear',
    'Horizontal': 'Horizontal', 'Vertical': 'Vertical', 'Rotation': 'Rotación', 'Constrain proportions': 'Mantener proporciones',
    'Distribute (3+ selected)': 'Distribuir (3 o más seleccionados)', 'New Folder': 'Nueva carpeta',
    'Wireframe Settings': 'Configuración del wireframe', 'Detach Frame': 'Separar marco', 'Duplicate': 'Duplicar',
    'Delete': 'Eliminar', 'Rename': 'Cambiar nombre', 'Hide': 'Ocultar', 'Show': 'Mostrar', 'Move to Folder': 'Mover a la carpeta',
    'COLOR LABEL': 'ETIQUETA DE COLOR', 'Search folders...': 'Buscar carpetas…', 'No Folder (Root)': 'Sin carpeta (raíz)',
    'Folder': 'Carpeta', 'None (static)': 'Ninguno (estático)', 'No results': 'Sin resultados', 'Search field...': 'Buscar campo…'
  },
  pt: {
    'Layout': 'Layout', 'Position & size': 'Posição e tamanho', 'Arrange': 'Organizar', 'Distribute': 'Distribuir',
    'Translate': 'Traduzir', 'Align selection': 'Alinhar seleção', 'Align left': 'Alinhar à esquerda',
    'Align center (H)': 'Centralizar horizontalmente', 'Align right': 'Alinhar à direita', 'Align top': 'Alinhar ao topo',
    'Align middle (V)': 'Centralizar verticalmente', 'Align bottom': 'Alinhar à base', 'Flip': 'Inverter',
    'Horizontal': 'Horizontal', 'Vertical': 'Vertical', 'Rotation': 'Rotação', 'Constrain proportions': 'Manter proporções',
    'Distribute (3+ selected)': 'Distribuir (3 ou mais selecionados)', 'New Folder': 'Nova pasta',
    'Wireframe Settings': 'Configurações do wireframe', 'Detach Frame': 'Desanexar moldura', 'Duplicate': 'Duplicar',
    'Delete': 'Excluir', 'Rename': 'Renomear', 'Hide': 'Ocultar', 'Show': 'Mostrar', 'Move to Folder': 'Mover para a pasta',
    'COLOR LABEL': 'RÓTULO DE COR', 'Search folders...': 'Pesquisar pastas…', 'No Folder (Root)': 'Sem pasta (raiz)',
    'Folder': 'Pasta', 'None (static)': 'Nenhum (estático)', 'No results': 'Nenhum resultado', 'Search field...': 'Pesquisar campo…'
  },
  ja: {
    'Layout': 'レイアウト', 'Position & size': '位置とサイズ', 'Arrange': '配置', 'Distribute': '分散', 'Translate': '翻訳',
    'Align selection': '選択範囲を整列', 'Align left': '左揃え', 'Align center (H)': '左右中央揃え', 'Align right': '右揃え',
    'Align top': '上揃え', 'Align middle (V)': '上下中央揃え', 'Align bottom': '下揃え', 'Flip': '反転',
    'Horizontal': '水平', 'Vertical': '垂直', 'Rotation': '回転', 'Constrain proportions': '縦横比を固定',
    'Distribute (3+ selected)': '分散（3つ以上選択）', 'New Folder': '新しいフォルダー', 'Wireframe Settings': 'ワイヤーフレーム設定',
    'Detach Frame': 'フレームを分離', 'Duplicate': '複製', 'Delete': '削除', 'Rename': '名前を変更', 'Hide': '非表示',
    'Show': '表示', 'Move to Folder': 'フォルダーに移動', 'COLOR LABEL': 'カラーラベル', 'Search folders...': 'フォルダーを検索…',
    'No Folder (Root)': 'フォルダーなし（ルート）', 'Folder': 'フォルダー', 'None (static)': 'なし（静的）',
    'No results': '結果なし', 'Search field...': 'フィールドを検索…'
  },
  pl: {
    'Layout': 'Układ', 'Position & size': 'Pozycja i rozmiar', 'Arrange': 'Układ', 'Distribute': 'Rozmieść', 'Translate': 'Przetłumacz',
    'Align selection': 'Wyrównaj zaznaczenie', 'Align left': 'Wyrównaj do lewej', 'Align center (H)': 'Wyśrodkuj poziomo',
    'Align right': 'Wyrównaj do prawej', 'Align top': 'Wyrównaj do góry', 'Align middle (V)': 'Wyśrodkuj pionowo',
    'Align bottom': 'Wyrównaj do dołu', 'Flip': 'Odwróć', 'Horizontal': 'Poziomo', 'Vertical': 'Pionowo', 'Rotation': 'Obrót',
    'Constrain proportions': 'Zachowaj proporcje', 'Distribute (3+ selected)': 'Rozmieść (wybierz co najmniej 3)',
    'New Folder': 'Nowy folder', 'Wireframe Settings': 'Ustawienia wireframe', 'Detach Frame': 'Odłącz ramkę',
    'Duplicate': 'Duplikuj', 'Delete': 'Usuń', 'Rename': 'Zmień nazwę', 'Hide': 'Ukryj', 'Show': 'Pokaż', 'Move to Folder': 'Przenieś do folderu',
    'COLOR LABEL': 'ETYKIETA KOLORU', 'Search folders...': 'Szukaj folderów…', 'No Folder (Root)': 'Brak folderu (katalog główny)',
    'Folder': 'Folder', 'None (static)': 'Brak (statyczne)', 'No results': 'Brak wyników', 'Search field...': 'Szukaj pola…'
  },
  ru: {
    'Layout': 'Макет', 'Position & size': 'Положение и размер', 'Arrange': 'Упорядочить', 'Distribute': 'Распределить', 'Translate': 'Перевести',
    'Align selection': 'Выровнять выделение', 'Align left': 'По левому краю', 'Align center (H)': 'По центру по горизонтали',
    'Align right': 'По правому краю', 'Align top': 'По верхнему краю', 'Align middle (V)': 'По центру по вертикали',
    'Align bottom': 'По нижнему краю', 'Flip': 'Отразить', 'Horizontal': 'Горизонтально', 'Vertical': 'Вертикально',
    'Rotation': 'Поворот', 'Constrain proportions': 'Сохранять пропорции', 'Distribute (3+ selected)': 'Распределить (выберите 3 и более)',
    'New Folder': 'Новая папка', 'Wireframe Settings': 'Настройки wireframe', 'Detach Frame': 'Отсоединить рамку',
    'Duplicate': 'Дублировать', 'Delete': 'Удалить', 'Rename': 'Переименовать', 'Hide': 'Скрыть', 'Show': 'Показать',
    'Move to Folder': 'Переместить в папку', 'COLOR LABEL': 'ЦВЕТОВАЯ МЕТКА', 'Search folders...': 'Поиск папок…',
    'No Folder (Root)': 'Без папки (корень)', 'Folder': 'Папка', 'None (static)': 'Нет (статически)', 'No results': 'Нет результатов',
    'Search field...': 'Поиск поля…'
  },
  hi: {
    'Layout': 'लेआउट', 'Position & size': 'स्थिति और आकार', 'Arrange': 'व्यवस्थित करें', 'Distribute': 'वितरित करें', 'Translate': 'अनुवाद करें',
    'Align selection': 'चयन संरेखित करें', 'Align left': 'बाएँ संरेखित करें', 'Align center (H)': 'क्षैतिज मध्य में',
    'Align right': 'दाएँ संरेखित करें', 'Align top': 'ऊपर संरेखित करें', 'Align middle (V)': 'लंबवत मध्य में',
    'Align bottom': 'नीचे संरेखित करें', 'Flip': 'पलटें', 'Horizontal': 'क्षैतिज', 'Vertical': 'लंबवत', 'Rotation': 'घुमाव',
    'Constrain proportions': 'अनुपात बनाए रखें', 'Distribute (3+ selected)': 'वितरित करें (3 या अधिक चयन)', 'New Folder': 'नया फ़ोल्डर',
    'Wireframe Settings': 'वायरफ्रेम सेटिंग्स', 'Detach Frame': 'फ़्रेम अलग करें', 'Duplicate': 'डुप्लिकेट', 'Delete': 'हटाएँ',
    'Rename': 'नाम बदलें', 'Hide': 'छिपाएँ', 'Show': 'दिखाएँ', 'Move to Folder': 'फ़ोल्डर में ले जाएँ', 'COLOR LABEL': 'रंग लेबल',
    'Search folders...': 'फ़ोल्डर खोजें…', 'No Folder (Root)': 'कोई फ़ोल्डर नहीं (रूट)', 'Folder': 'फ़ोल्डर', 'None (static)': 'कोई नहीं (स्थिर)',
    'No results': 'कोई परिणाम नहीं', 'Search field...': 'फ़ील्ड खोजें…'
  }
};

function _rpInstallI18nCopy() {
  if (!window.CCI18n || typeof CCI18n.add !== 'function') return;
  Object.keys(_RP_I18N_COPY).forEach(function (code) { CCI18n.add(code, _RP_I18N_COPY[code]); });
  if (typeof CCI18n.apply === 'function') CCI18n.apply(document);
}
_rpInstallI18nCopy();
if (window.cc && cc.on) cc.on('cc:canvas-ready', _rpInstallI18nCopy);

/* ── Right panel collapse/expand toggle ── */
var _rpCollapsed = false;

function initRpanelToggle(rpEl) {
  var btn = document.createElement('button');
  btn.className = 'rp-toggle-btn';
  btn.id = 'rp-toggle-btn';
  btn.title = 'Toggle panel';
  // Clean Lucide chevron (collapse/expand); CSS flips it for collapsed state.
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="15 18 9 12 15 6"/>' +
    '</svg>';
  // Insert BEFORE rpanel in the workspace so it's not clipped by overflow
  rpEl.parentNode.insertBefore(btn, rpEl);

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleRpanel();
  });

  // Auto-collapse if canvas is empty on init
  setTimeout(function () {
    var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
    if (c && c.getObjects().length === 0) {
      collapseRpanel();
    }
  }, 300);
}

function collapseRpanel() {
  var rp = document.getElementById('rpanel');
  if (!rp) return;
  _rpCollapsed = true;
  rp.classList.add('rp-collapsed');
  document.body.classList.add('rp-panel-collapsed');
}

function expandRpanel() {
  var rp = document.getElementById('rpanel');
  if (!rp) return;
  _rpCollapsed = false;
  rp.classList.remove('rp-collapsed');
  document.body.classList.remove('rp-panel-collapsed');
}

function toggleRpanel() {
  if (_rpCollapsed) expandRpanel(); else collapseRpanel();
}

// Collapse the settings body (colour + width/blur rows) of a Fill / Shadow / Border / Text-Effects
// section when its seg's "None" (—) option is active (owner 2026-07-13). Hides every element sibling
// after the .rpf-seg inside the section; shows them again for any non-none option.
function _rpfToggleNoneBody(segEl) {
  if (!segEl) return;
  var active = segEl.querySelector('button.on');
  var v = active ? (active.getAttribute('data-shadow') || active.getAttribute('data-txfx') || active.getAttribute('data-dash') || active.getAttribute('data-filltype') || active.getAttribute('data-case') || active.getAttribute('data-spacing') || '') : '';
  var isNone = (v === 'none');
  // Use setProperty(..., 'important') — some bodies (e.g. the Fill .rpf-field) carry a `display:flex !important`
  // rule that a plain inline style can't beat; removeProperty restores the natural (flex) when shown.
  var sib = segEl.nextElementSibling;
  while (sib) {
    if (isNone) sib.style.setProperty('display', 'none', 'important');
    else sib.style.removeProperty('display');
    sib = sib.nextElementSibling;
  }
}

function syncRightPanel() {
  var cvs = getActiveCanvas();
  var obj = cvs.getActiveObject();

  // Auto-expand when an object is selected
  if (obj && _rpCollapsed) expandRpanel();

  // Subtitle element: its Fabric proxy is the active object. Delegate to the
  // dedicated 3-tab subtitle properties (Metin/Stiller/Animasyon) and bypass the
  // generic object sections. Hide it again for any other selection.
  if (window.VESubtitleProps && VESubtitleProps.hide) VESubtitleProps.hide();
  if (window.VEInspector && VEInspector.hideDocked) VEInspector.hideDocked(); // docked media-clip props: restore normal panel when a fabric object is selected
  if (typeof _veHideBgSection === 'function') _veHideBgSection(); // shown only in video no-selection (below)
  /* Subtitle proxy: it is a REAL fabric.Textbox, so DON'T fork the panel - the native text modules
     (rp-text / rp-uni-fill colour picker + gradient / rp-uni-appearance) render + work on the proxy
     1:1 (owner: use the real modules, no clone). Its subtitle-only Style/Animation used to be
     PINNED above them by VESubtitleProps; both now live as tabs of the one docked item panel, which
     `VEItemProps.sync` builds at the END of this function - after every per-type section below has
     decided what is visible, because that decision is exactly what it borrows. */

  var rpanel = document.querySelector('.rpanel');
  var rpToggle = document.getElementById('rp-toggle-btn');
  if (window.wbActive) {
    if (rpanel) {
      if (obj) { rpanel.classList.remove('wb-hidden'); } else { rpanel.classList.add('wb-hidden'); }
    }
    if (rpToggle) rpToggle.style.display = obj ? '' : 'none';
  } else {
    if (rpToggle) rpToggle.style.display = '';
  }
  if (!obj) {
    ['rp-fig-bar', 'rp-uni-appearance', 'rp-selcolors', 'rp-shadow', 'rp-text-fx'].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = 'none'; });
    var _bgP = document.getElementById('rp-bg-panel'); if (_bgP) { _bgP.style.display = ''; if (typeof rpfSyncBgPanel === 'function') rpfSyncBgPanel(); }
    // Video mode owns the Fabric background (the live preview image), so
    // rpfSyncBgPanel hides the page bg-panel. Surface Canvas size + the video
    // backdrop colour instead so the no-selection Properties is not empty (owner).
    if (window.__ccVideoEditor && window.__ccVideoEditor._veActive) {
      var _cs = document.getElementById('rp-canvas-size'); if (_cs) _cs.style.display = '';
      if (typeof _veSyncBgSection === 'function') _veSyncBgSection();
    } else if (typeof _veHideBgSection === 'function') { _veHideBgSection(); }
    return;
  }

  var rpCanvasSize = document.getElementById('rp-canvas-size');
  if (rpCanvasSize) rpCanvasSize.style.display = 'none';

  // Hide BG effects when an object is selected
  var rpBgFx = document.getElementById('rp-bg-effects');
  if (rpBgFx) rpBgFx.style.display = 'none';

  // Hide page-level design note when an object is selected
  var rpPageNote = document.getElementById('rp-page-design-note');
  if (rpPageNote) rpPageNote.style.display = 'none';

  var isText  = obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox';
  // An all-text multi-selection gets the TEXT SECTION only (font/size/style/align/spacing).
  // Deliberately NOT folded into isText: that flag also gates fill / selection-colours /
  // shadow / text-effects, whose apply paths still write to getActiveObject() and would
  // therefore write to the throwaway wrapper. Showing them here would add exactly the
  // dead-but-visible controls this panel is not allowed to have.
  var isTextSel = obj.type === 'activeSelection' && rpTextTargets().length > 0;
  var isPath  = obj.type === 'path';
  var isGroup = obj.type === 'group';
  // A clip frame is a group [shape, image], but it must NOT get the generic shape controls:
  // fill/stroke there would write to the GROUP, which paints nothing. Its background is the
  // SHAPE CHILD's fill and is owned by the Clip block instead.
  var isClipFrame = obj._isClipFrame === true;
  var isShape = (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'ellipse' || obj.type === 'triangle' || obj.type === 'polygon' || isPath || isGroup) && !isClipFrame;
  // A blur object IS a fabric image (procedurally painted), so it has to be
  // excluded here the same way a chart is - otherwise selecting one also opens
  // the image section (crop / filters), which would fight its own parameters.
  var isImage = obj.type === 'image' && !obj.isQR && !obj._isChart && !obj._isEffect;
  var isQR    = obj.isQR === true;
  var isChart = obj._isChart === true;
  var isEffect  = obj._isEffect === true;

  // Auto-open structure panel when a group is selected
  if (isGroup && typeof structureVisible !== 'undefined' && !structureVisible) {
    if (typeof toggleStructurePanel === 'function') toggleStructurePanel();
  }

  var rpEmpty = document.getElementById('rp-empty');
  if (rpEmpty) rpEmpty.style.display = 'none';
  var rpText  = document.getElementById('rp-text');
  var rpShape = document.getElementById('rp-shape');
  var rpImage = document.getElementById('rp-image');
  var rpQR    = document.getElementById('rp-qr');
  var rpBoard = document.getElementById('rp-board');
  var rpChart = document.getElementById('rp-chart');
  var rpEffect  = document.getElementById('rp-effect');

  if (window.wbActive) {
    var _figWb = document.getElementById('rp-fig-bar'); if (_figWb) _figWb.style.display = 'none';
    var _selWb = document.getElementById('rp-selcolors'); if (_selWb) _selWb.style.display = 'none';
    var _shWb = document.getElementById('rp-shadow'); if (_shWb) _shWb.style.display = 'none';
    var _tfxWb = document.getElementById('rp-text-fx'); if (_tfxWb) _tfxWb.style.display = 'none';
    if (rpText)  rpText.style.display  = 'none';
    if (rpShape) rpShape.style.display = 'none';
    if (rpImage) rpImage.style.display = 'none';
    if (rpQR)    rpQR.style.display    = 'none';
    if (rpChart) rpChart.style.display = 'none';
    if (rpEffect)  rpEffect.style.display  = 'none';
    if (rpBoard) rpBoard.style.display = '';
    if (window.cc && cc.safe) cc.safe('right-panel.board.sync', function () { if (typeof syncBoardPanel === 'function') syncBoardPanel(obj); });
    else if (typeof syncBoardPanel === 'function') syncBoardPanel(obj);
    if (typeof refreshStructure === 'function') refreshStructure();
    return;
  }

  if (rpBoard) rpBoard.style.display = 'none';
  // Hide perspective panel unless perspective mode is active
  var rpPersp = document.getElementById('rp-perspective');
  if (rpPersp && !(typeof isPerspectiveActive === 'function' && isPerspectiveActive())) rpPersp.style.display = 'none';
  if (rpChart) rpChart.style.display = isChart ? '' : 'none';
  if (rpEffect)  rpEffect.style.display  = isEffect ? '' : 'none';
  if (isEffect && window.cc && cc.safe) cc.safe('left-panel.background.effects.sync', function () { if (typeof syncEffectPanel === 'function') syncEffectPanel(obj); });
  else if (isEffect && typeof syncEffectPanel === 'function') syncEffectPanel(obj);
  if (rpText)  rpText.style.display  = (isText || isTextSel) && !isChart  ? '' : 'none';
  if (rpShape) rpShape.style.display = isShape && !isChart ? '' : 'none';
  // A clip frame is a group, not an image, but its Clip block (fit + background + release)
  // lives inside #rp-image. Without this the frame's only controls are unreachable.
  if (rpImage) rpImage.style.display = (isImage || isClipFrame) ? '' : 'none';
  if (rpQR)    rpQR.style.display    = isQR    ? '' : 'none';

  // Unified appearance (ONE opacity control) — shown + synced for ANY selected object (Faz 6b).
  var rpUniApp = document.getElementById('rp-uni-appearance');
  if (rpUniApp) rpUniApp.style.display = obj ? '' : 'none';
  if (window.cc && cc.safe) cc.safe('right-panel.appearance.uni', function () { if (typeof syncUniAppearance === 'function') syncUniAppearance(obj); });
  /* Unified fill — text + shapes (group-aware); image has no fill, QR keeps its own colour.
     An all-text MULTI-selection gets it too now (owner 2026-08-07: "renk değiştirme aracı
     gelmiyor"). It was withheld because every fill writer aimed at getActiveObject(), i.e. at the
     throwaway wrapper; they all resolve through rpFillTargets() now, so the control is real here.
     The inputs display the first member, exactly like the typography block above. */
  var _fillRep = (isText || isShape) ? obj : rpFillSelRep();
  var rpUniFill = document.getElementById('rp-uni-fill');
  if (rpUniFill) rpUniFill.style.display = _fillRep ? '' : 'none';
  if (_fillRep && window.cc && cc.safe) cc.safe('right-panel.appearance.fill', function () { if (typeof syncFill === 'function') syncFill(_fillRep); });

  // ── Figma-style: toolbar (name) + selection colours + shadow + hex readouts (redesign) ──
  var rpFigBar = document.getElementById('rp-fig-bar');
  if (rpFigBar) rpFigBar.style.display = '';
  var _bgHide = document.getElementById('rp-bg-panel'); if (_bgHide) _bgHide.style.display = 'none';
  var rpfName = document.getElementById('rpf-obj-name');
  if (rpfName) rpfName.textContent = _rpfTypeName(obj, isText, isShape, isImage, isQR, isChart);
  var rpSelC = document.getElementById('rp-selcolors');
  if (rpSelC) { var _showSel = (isText || isShape) && !isChart; rpSelC.style.display = _showSel ? '' : 'none'; if (_showSel) rpfRenderSelColors(obj); }
  if (typeof rpfSyncHex === 'function') rpfSyncHex(obj);
  // Shadow section — shared by shapes AND text (owner: text needs shadow too). Moved out of #rp-shape
  // into standalone #rp-shadow; show + sync for both, hide for image/qr/chart.
  var rpShadow = document.getElementById('rp-shadow');
  var _showShadow = (isText || isShape) && !isChart;
  if (rpShadow) rpShadow.style.display = _showShadow ? '' : 'none';
  if (_showShadow && typeof syncShadow === 'function' && window.cc && cc.safe) cc.safe('right-panel.shadow.sync', function () { syncShadow(obj); });

  // Text Effects (outline/stroke) — TEXT only (owner 2026-07-13), styled like Shadow.
  var rpTextFx = document.getElementById('rp-text-fx');
  var _showTextFx = isText && !isChart;
  if (rpTextFx) rpTextFx.style.display = _showTextFx ? '' : 'none';
  if (_showTextFx && typeof syncTextFx === 'function' && window.cc && cc.safe) cc.safe('right-panel.textfx.sync', function () { syncTextFx(obj); });
  // Letter case lives in the same section (shared/text-effects owns the engine).
  if (_showTextFx && typeof syncTextCase === 'function' && window.cc && cc.safe) cc.safe('right-panel.textcase.sync', function () { syncTextCase(obj); });
  var _dfBtn = document.getElementById('p-df-note-btn');
  if (_dfBtn) _dfBtn.classList.toggle('has', !!obj._dfNote);

  // Design Fields — show for ANY selected object
  var rpDf = document.getElementById('rp-design-fields');
  if (rpDf) {
    rpDf.style.display = obj ? '' : 'none';
    var pDfField = document.getElementById('p-df-field');
    var pDfNote = document.getElementById('p-df-note');
    var pDfStatus = document.getElementById('p-df-status');
    // Per-cell design field for grid layouts
    var _activeCell = obj._isGridLayout && typeof _glGetActiveCell === 'function' ? _glGetActiveCell() : null;
    if (_activeCell) {
      var cellLabel = 'Cell (' + (_activeCell.row + 1) + ',' + (_activeCell.col + 1) + ')';
      if (pDfField && !_dfFieldUpdating) pDfField.value = _activeCell.dfField || '';
      if (pDfNote) pDfNote.style.display = 'none';
      if (pDfStatus) pDfStatus.textContent = _activeCell.dfField ? '✓ ' + cellLabel + ': ' + _activeCell.dfField : cellLabel;
    } else {
      if (pDfField && !_dfFieldUpdating) pDfField.value = obj._dfField || '';
      if (pDfNote && !_dfFieldUpdating) pDfNote.value = obj._dfNote || '';
      if (pDfNote) pDfNote.style.display = '';
      if (pDfStatus) pDfStatus.textContent = obj._dfField ? '✓ Field: ' + obj._dfField : '';
    }
  }

  if (isChart && typeof syncChartPanel === 'function') {
    syncChartPanel(obj);
  }

  // Wireframe custom CSS panel
  var rpWfCss = document.getElementById('rp-wf-css');
  if (rpWfCss) {
    var isWfObj = obj._isWireframe && (typeof activeProduct !== 'undefined') && activeProduct === 'wireframe';
    rpWfCss.style.display = isWfObj ? '' : 'none';
    if (isWfObj && typeof loadWfCustomCss === 'function') loadWfCustomCss(obj);
  }

  if (isText || isTextSel) {
    // A multi-selection wrapper carries no font/size/spacing of its own, so the inputs display
    // the first member. The apply paths still fan out to ALL of them via rpApplyToTexts.
    var _txtRep = isTextSel ? rpTextRep() : obj;
    // Typography (font/size/bold/italic) → modules/right-panel/typography/ sub-module (cc.safe).
    if (window.cc && cc.safe) cc.safe('right-panel.typography.sync', function () { if (typeof syncTypography === 'function') syncTypography(_txtRep); });
    else if (typeof syncTypography === 'function') syncTypography(_txtRep);
    // Appearance (color/opacity/spacing/padding) — still parent until the appearance sub-module.
    if (window.cc && cc.safe) cc.safe('right-panel.appearance.sync', function () { if (typeof syncAppearance === 'function') syncAppearance(_txtRep); });
    var pFieldRole = document.getElementById('p-field-role');
    if (pFieldRole && !_fieldRoleUpdating) pFieldRole.value = obj._fieldRole || '';
  }




  // Per-type property sections → sub-modules (Faz 6b-2), each delegated via cc.safe so a
  // failing section can't take down the parent or its siblings.
  if (isShape && window.cc && cc.safe) cc.safe('right-panel.shape.sync', function () { if (typeof syncShape === 'function') syncShape(obj); });
  if ((isImage || isClipFrame) && window.cc && cc.safe) cc.safe('right-panel.image.sync', function () { if (typeof syncImage === 'function') syncImage(obj); });
  /* Tabbed image inspector (Basic / Color / Effect / AI). A CLIP FRAME shows #rp-image too (its
     Clip block lives there), so it must get the sync as well - otherwise the panel renders its
     tabs while the name + align + opacity blocks stay stranded ABOVE them, un-adopted. Anything
     else passes null, which puts those blocks back where they came from. */
  if (window.cc && cc.safe) cc.safe('right-panel.image-inspector.sync', function () {
    if (typeof syncImageInspector === 'function') syncImageInspector((isImage || isClipFrame) ? obj : null);
  });
  if (isQR && window.cc && cc.safe) cc.safe('right-panel.qr.sync', function () { if (typeof syncQrProps === 'function') syncQrProps(obj); });

  // Collapse each Fill/Shadow/Border/Text-Effects body when its "None" (—) option is active (owner 2026-07-13).
  ['p-fill-type', 'p-shadow-seg', 'p-txfx-seg', 'p-border-style', 'p-case-seg', 'p-spacing-seg'].forEach(function (sid) {
    var s = document.getElementById(sid); if (s) _rpfToggleNoneBody(s);
  });

  /* ── The selected object is ALSO a timeline item (video mode) ──────────────────────────────────
     An overlay clip and a subtitle get the SAME docked, tabbed panel a media clip already had, with
     the sections above MOVED into its tabs (never cloned). It runs LAST on purpose: it borrows the
     blocks this function just decided to show, so anything that changes that decision - the image
     inspector's own adoption included - has to have happened first. Returns false outside video mode
     or for any object that is not on the timeline, and then nothing above is touched. */
  if (window.VEItemProps && VEItemProps.sync && window.cc && cc.safe) {
    cc.safe('right-panel.item-props.sync', function () { VEItemProps.sync(obj); });
  } else if (window.VEItemProps && VEItemProps.sync) {
    VEItemProps.sync(obj);
  }

  if (typeof refreshStructure === 'function') refreshStructure();

  // Keep layout panel in sync when visible
  var lpWrap = document.getElementById('rp-layout-wrap');
  if (lpWrap && lpWrap.style.display !== 'none' && typeof syncLayoutPanel === 'function') syncLayoutPanel();

  // Keep layers panel in sync when visible
  var lyWrap = document.getElementById('rp-layers-wrap');
  if (lyWrap && lyWrap.style.display !== 'none' && typeof refreshInlineLayers === 'function') refreshInlineLayers();

  // Sync color picker swatch buttons
  if (typeof syncColorSwatches === 'function') syncColorSwatches();
}

// syncBoardPanel → modules/right-panel/board/ (Faz 6b-2)

function toHex(c) {
  if (!c || typeof c !== 'string') return '#000000';
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) return c;
  if (c.startsWith('rgb')) {
    var m = c.match(/\d+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(function (n) {
      return parseInt(n).toString(16).padStart(2, '0');
    }).join('');
  }
  return '#000000';
}

// ── 16. Right Panel Property Bindings ────────────────────────
function initPropertyBindings() {
  // Typography bindings (p-font / p-size / p-bold / p-italic) → modules/right-panel/typography/
  // (self-inits on cc:canvas-ready). The generic appearance bindings below stay in the parent.

  // appearance bindings (color/opacity/spacing/padding) → modules/right-panel/appearance/
  // p-bold / p-italic bindings → modules/right-panel/typography/ (Faz 6b-2)

  // shape/image bindings → modules/right-panel/{shape,image}/ (Faz 6b-2)

  // Clip position controls
  var pClipPos = document.getElementById('p-clip-position');
  if (pClipPos) {
    pClipPos.onchange = function () {
      var c = getActiveCanvas(), o = c.getActiveObject();
      if (!o) return;
      // NEW frame model: refit the image inside the SHAPE's box; the frame keeps its size.
      if (o._isClipFrame) {
        if (typeof _ccSetFrameFit === 'function' && _ccSetFrameFit(o, pClipPos.value)) { c.renderAll(); snap(); }
        return;
      }
      // LEGACY clipped image (saved before the frame rebuild).
      if (o._isClippedImage && o._clipShapeW) {
        _applyClipImagePosition(o, pClipPos.value, o._clipShapeW, o._clipShapeH);
        o.dirty = true;
        c.renderAll();
        snap();
      }
    };
  }
  var pUnclipBtn = document.getElementById('p-unclip-btn');
  if (pUnclipBtn) {
    pUnclipBtn.onclick = function () {
      if (typeof unclipImage === 'function') unclipImage();
      syncRightPanel();
    };
  }

  var pFieldRole = document.getElementById('p-field-role');
  if (pFieldRole) {
    var fieldRoleHandler = function () {
      var cvs = getActiveCanvas();
      var obj = cvs.getActiveObject();
      if (obj && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox')) {
        _fieldRoleUpdating = true;
        obj._fieldRole = pFieldRole.value || '';
        cvs.renderAll();
        snap();
        _fieldRoleUpdating = false;
      }
    };
    pFieldRole.addEventListener('change', fieldRoleHandler);
    pFieldRole.addEventListener('input', fieldRoleHandler);
  }

  // ── Design Fields handler ──
  var pDfField = document.getElementById('p-df-field');
  var pDfNote = document.getElementById('p-df-note');
  var _dfLastObj = null; // cache active object before dropdown steals focus
  if (pDfField) {
    pDfField.addEventListener('mousedown', function () {
      var cvs = getActiveCanvas();
      _dfLastObj = cvs.getActiveObject() || null;
    });
    pDfField.addEventListener('focus', function () {
      var cvs = getActiveCanvas();
      _dfLastObj = cvs.getActiveObject() || _dfLastObj || null;
    });
    var dfHandler = function () {
      var cvs = getActiveCanvas();
      var obj = cvs.getActiveObject() || _dfLastObj;
      if (!obj) return;
      _dfFieldUpdating = true;
      // Per-cell design field for grid layouts
      var _activeCell = obj._isGridLayout && typeof _glGetActiveCell === 'function' ? _glGetActiveCell() : null;
      if (_activeCell) {
        _activeCell.dfField = pDfField.value || '';
        var cellLabel = 'Cell (' + (_activeCell.row + 1) + ',' + (_activeCell.col + 1) + ')';
        var st = document.getElementById('p-df-status');
        if (st) st.textContent = _activeCell.dfField ? '\u2713 ' + cellLabel + ': ' + _activeCell.dfField : cellLabel;
        // Refresh toolbar label to show dfField
        if (typeof _glUpdateToolbar === 'function' && typeof _glGetActiveGrid === 'function') {
          var activeGrid = _glGetActiveGrid();
          if (activeGrid) _glUpdateToolbar(activeGrid, _activeCell);
        }
      } else {
        obj._dfField = pDfField.value || '';
        if (pDfNote) obj._dfNote = pDfNote.value || '';
        var st = document.getElementById('p-df-status');
        if (st) st.textContent = obj._dfField ? '\u2713 Field: ' + obj._dfField : '';
        // Re-select the object on canvas if it was deselected
        if (!cvs.getActiveObject() && obj) {
          cvs.setActiveObject(obj);
        }
      }
      cvs.renderAll();
      snap();
      _dfFieldUpdating = false;
    };
    pDfField.addEventListener('change', dfHandler);
  }
  if (pDfNote) {
    pDfNote.addEventListener('focus', function () {
      var cvs = getActiveCanvas();
      _dfLastObj = cvs.getActiveObject() || _dfLastObj || null;
    });
    pDfNote.addEventListener('input', function () {
      var cvs = getActiveCanvas();
      var obj = cvs.getActiveObject() || _dfLastObj;
      if (!obj) return;
      obj._dfNote = pDfNote.value || '';
    });
    pDfNote.addEventListener('change', function () {
      snap();
    });
  }

  // ── Page-level Design Note handler ──
  var pPageNote = document.getElementById('p-page-note');
  if (pPageNote) {
    pPageNote.addEventListener('input', function () {
      if (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined') {
        pages[currentPageIndex]._pageDesignNote = pPageNote.value || '';
      }
    });
    pPageNote.addEventListener('change', function () {
      var st = document.getElementById('p-page-note-status');
      if (st) st.textContent = pPageNote.value ? '\u2713 Saved' : '';
    });
  }

  // initBoardPropertyBindings() → modules/right-panel/board/ self-inits on cc:canvas-ready (Faz 6b-2)
}

// initBoardPropertyBindings / updateWbNameLabel → modules/right-panel/board/ (Faz 6b-2)

/* ── Multi-text selection ───────────────────────────────────────────────────────────────────
   Selecting several texts together makes fabric wrap them in a THROWAWAY activeSelection.
   Writing a text property to that wrapper changes nothing on the real texts and is dropped on
   deselect (measured: with 2 texts selected, the members stayed at lineHeight 1.16 while the
   wrapper happily took 2.5). On top of that #rp-text was hidden for a multi-selection
   altogether, so several stacked texts offered no font/size/style/align/spacing at all. That
   is the owner's "I cannot give line height to texts stacked under each other": the control
   exists and works for ONE text, and silently does nothing for several.

   Every text apply path resolves through rpTextTargets() and writes to the MEMBERS. */

function rpIsTextObj(o) {
  return !!o && (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox');
}

/* The texts the panel edits: the one selected text, or EVERY member of an all-text selection.
   A MIXED selection returns [] on purpose, so the text section stays hidden instead of
   half-applying to the texts inside it. */
function rpTextTargets() {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
  var o = c && c.getActiveObject();
  if (!o) return [];
  if (o.type === 'activeSelection') {
    var objs = (typeof o.getObjects === 'function') ? (o.getObjects() || []) : [];
    if (!objs.length) return [];
    for (var i = 0; i < objs.length; i++) if (!rpIsTextObj(objs[i])) return [];
    return objs;
  }
  return rpIsTextObj(o) ? [o] : [];
}

/* Apply fn to every text target, then render once. Callers keep their own snap() on change, so
   one interaction stays ONE undo step no matter how many texts it touched. */
function rpApplyToTexts(fn) {
  var targets = rpTextTargets();
  for (var i = 0; i < targets.length; i++) fn(targets[i], i);
  if (targets.length) {
    var c = getActiveCanvas();
    if (c) c.renderAll();
  }
  return targets.length;
}

/* The member whose values the inputs display. Fabric gives an activeSelection no fontFamily /
   fontSize / lineHeight of its own, so the first member stands in for the set. */
function rpTextRep() {
  return rpTextTargets()[0] || null;
}

/* ── Appearance targets (fill + opacity) ────────────────────────────────────────────────────────
   The same trap rpTextTargets solves for text, one level up. Fabric's activeSelection is a
   THROWAWAY wrapper and Group._set does not fan out to members, so an appearance write aimed at
   getActiveObject() lands on nothing and is dropped on deselect. Measured 2026-08-07 with two
   texts selected: opacity 40% left both members at 100% and only the wrapper at 0.4.

   TWO resolvers on purpose, because they answer different questions:
   - FILL: a real group paints through its CHILDREN, so a fill must reach them (that is what every
     `o.type === 'group'` branch in this panel was already hand-rolling).
   - OPACITY: a real group's own opacity is a genuine, persisted property of the group, so it stays
     on the group. Only the throwaway activeSelection has to be unwrapped. */
function rpFillTargets() {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
  var o = c && c.getActiveObject();
  if (!o) return [];
  if (o.type === 'activeSelection' && typeof o.getObjects === 'function') return o.getObjects() || [];
  if (o.type === 'group' && o._objects && o._objects.length) return o._objects;
  return [o];
}

function rpOpacityTargets() {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
  var o = c && c.getActiveObject();
  if (!o) return [];
  if (o.type === 'activeSelection' && typeof o.getObjects === 'function') return o.getObjects() || [];
  return [o];
}

/* Can this object hold a fill of its own? A clip frame is excluded for the same reason it is
   excluded from isShape: its background is the SHAPE CHILD's fill and belongs to the Clip block. */
function rpIsFillable(o) {
  if (!o) return false;
  if (rpIsTextObj(o)) return true;
  if (o._isClipFrame) return false;
  if (o.isQR || o._isChart || o._isEffect) return false;   // each owns its own colour controls
  return o.type === 'rect' || o.type === 'circle' || o.type === 'ellipse' || o.type === 'triangle' ||
         o.type === 'polygon' || o.type === 'path' || o.type === 'group';
}

/* The member whose fill the panel displays for a MULTI-selection, or null when the section must
   stay hidden. Every member has to be fillable: two texts and two rectangles are the same question,
   so restricting this to text would leave the identical dead control one type over, while a mixed
   bag containing an image would show a control that cannot honour half the selection. */
function rpFillSelRep() {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
  var o = c && c.getActiveObject();
  if (!o || o.type !== 'activeSelection') return null;
  var list = rpFillTargets();
  if (!list.length) return null;
  for (var i = 0; i < list.length; i++) if (!rpIsFillable(list[i])) return null;
  return list[0];
}

/* Apply to every target, then render ONCE and mark the live selection dirty (a cached wrapper
   would otherwise keep painting the old pixels). Callers keep their own snap(), so one interaction
   stays one undo step however many objects it touched. */
function rpApplyToTargets(targets, fn) {
  for (var i = 0; i < targets.length; i++) fn(targets[i], i);
  if (targets.length) {
    var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
    if (c) {
      var act = c.getActiveObject();
      if (act) act.dirty = true;
      c.renderAll();
    }
  }
  return targets.length;
}

function setAlign(a) {
  if (rpApplyToTexts(function (o) { o.set('textAlign', a); })) snap();
}

// ── Figma-style panel helpers (right-panel redesign) ──────────────
function _rpfEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
function _rpfHex(c) { var h = (typeof toHex === 'function') ? toHex(c) : c; return String(h || '#000000').replace('#', '').toUpperCase(); }

function _rpfTypeName(obj, isText, isShape, isImage, isQR, isChart) {
  if (!obj) return 'Element';
  if (isText) return 'Text';
  if (isChart) return 'Chart';
  if (isQR) return 'QR';
  if (isImage) return 'Image';
  if (obj.type === 'group') return 'Group';
  if (obj.type === 'circle' || obj.type === 'ellipse') return 'Ellipse';
  if (obj.type === 'triangle') return 'Triangle';
  if (obj.type === 'path' || obj.type === 'polygon') return 'Path';
  if (obj.type === 'rect') return 'Rectangle';
  return obj.type ? (obj.type.charAt(0).toUpperCase() + obj.type.slice(1)) : 'Element';
}

// fill + stroke hex readouts in the Figma fields
function rpfSyncHex(obj) {
  if (!obj) return;
  var src = (obj.type === 'group' && obj._objects && obj._objects.length) ? obj._objects[0] : obj;
  var fillC = typeof src.fill === 'string' ? src.fill : '#000000';
  var fh = document.getElementById('p-fill-hex'); if (fh) fh.textContent = _rpfHex(fillC);
  var fsw = document.getElementById('p-fill-sw'); if (fsw) fsw.style.background = toHex(fillC);
  var strokeC = obj.stroke || '#000000';
  var sh = document.getElementById('p-stroke-hex'); if (sh) sh.textContent = _rpfHex(strokeC);
  var ssw = document.getElementById('p-stroke-sw'); if (ssw) ssw.style.background = toHex(strokeC);
}

// "Selection colors" list — the object's fill + stroke
function rpfRenderSelColors(obj) {
  var list = document.getElementById('p-selcolors-list');
  if (!list || !obj) return;
  var src = (obj.type === 'group' && obj._objects && obj._objects.length) ? obj._objects[0] : obj;
  var rows = [];
  if (typeof src.fill === 'string' && src.fill && src.fill !== 'transparent') rows.push({ c: src.fill, n: 'Fill' });
  if (obj.stroke && (obj.strokeWidth || 0) > 0) rows.push({ c: obj.stroke, n: 'Stroke' });
  var html = '';
  rows.forEach(function (r) {
    html += '<div class="rpf-field" style="margin-bottom:6px"><span class="rpf-swatch" style="background:' + _rpfEsc(toHex(r.c)) + '"></span>' +
      '<span class="rpf-val">' + _rpfHex(r.c) + '</span><span class="rpf-pct" style="margin-left:auto">' + r.n + '</span></div>';
  });
  list.innerHTML = html || '<div class="rpf-field" style="justify-content:center;color:var(--text-faint)">—</div>';
}

// canvas-relative alignment for the toolbar (uses logical CW/CH + object aCoords, viewport-independent)
function rpfAlign(mode) {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
  var o = c && c.getActiveObject();
  if (!o) return;
  var cw = (typeof CW !== 'undefined' && CW) ? CW : c.getWidth();
  var ch = (typeof CH !== 'undefined' && CH) ? CH : c.getHeight();
  o.setCoords();
  var ac = o.aCoords || o.calcACoords();
  var minX = Math.min(ac.tl.x, ac.bl.x, ac.tr.x, ac.br.x);
  var maxX = Math.max(ac.tl.x, ac.bl.x, ac.tr.x, ac.br.x);
  var minY = Math.min(ac.tl.y, ac.bl.y, ac.tr.y, ac.br.y);
  var maxY = Math.max(ac.tl.y, ac.bl.y, ac.tr.y, ac.br.y);
  var bw = maxX - minX, bh = maxY - minY, dx = 0, dy = 0;
  if (mode === 'left') dx = -minX;
  else if (mode === 'right') dx = cw - maxX;
  else if (mode === 'center-h') dx = (cw - bw) / 2 - minX;
  else if (mode === 'top') dy = -minY;
  else if (mode === 'bottom') dy = ch - maxY;
  else if (mode === 'center-v') dy = (ch - bh) / 2 - minY;
  o.set({ left: o.left + dx, top: o.top + dy });
  o.setCoords();
  c.renderAll();
  if (typeof snap === 'function') snap();
}

// design-field AI-note popover
function rpfToggleNote(ev) {
  if (ev) ev.stopPropagation();
  var pop = document.getElementById('p-df-pop');
  if (!pop) return;
  if (pop.classList.toggle('show')) {
    var btn = document.getElementById('p-df-note-btn');
    var r = btn ? btn.getBoundingClientRect() : { left: 200, bottom: 200 };
    pop.style.left = Math.max(8, Math.min(r.left - 210, window.innerWidth - 252)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    var ta = document.getElementById('p-df-note'); if (ta) ta.focus();
    setTimeout(function () { document.addEventListener('mousedown', _rpfNoteOutside, true); }, 0);
  } else {
    document.removeEventListener('mousedown', _rpfNoteOutside, true);
  }
}
function _rpfNoteOutside(e) {
  var pop = document.getElementById('p-df-pop'), btn = document.getElementById('p-df-note-btn');
  if (pop && !pop.contains(e.target) && (!btn || !btn.contains(e.target))) {
    pop.classList.remove('show');
    document.removeEventListener('mousedown', _rpfNoteOutside, true);
  }
}

// ── Quick colour palette (recent + page colours + wheel → full picker) ──
function rpfGetRecent() { try { return JSON.parse(localStorage.getItem('cc_recent_colors') || '[]'); } catch (e) { return []; } }
function rpfAddRecent(hex) {
  if (!hex) return; hex = String(hex).toLowerCase();
  var r = rpfGetRecent().filter(function (c) { return String(c).toLowerCase() !== hex; });
  r.unshift(hex); if (r.length > 14) r = r.slice(0, 14);
  try { localStorage.setItem('cc_recent_colors', JSON.stringify(r)); } catch (e) {}
}
// apply a colour by driving the hidden #p-* input (reuses its binding) + update swatch + recent
function rpfApplyColor(inputId, hex) {
  var inp = document.getElementById(inputId); if (!inp || !hex) return;
  inp.value = hex;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  var sw = document.getElementById(inputId + '-sw'); if (sw) sw.style.background = hex;
  rpfAddRecent(hex);
}
function rpfClosePopovers() {
  ['rpf-pal', 'p-df-pop', 'rpf-menu'].forEach(function (id) { var e = document.getElementById(id); if (e) e.classList.remove('show'); });
  document.removeEventListener('mousedown', _rpfPalOutside, true);
  document.removeEventListener('mousedown', _rpfMenuOutside, true);
}
function rpfOpenPalette(anchor, inputId, fullTarget) {
  rpfClosePopovers();
  var pal = document.getElementById('rpf-pal');
  if (!pal) { pal = document.createElement('div'); pal.id = 'rpf-pal'; pal.className = 'rpf-pal'; document.body.appendChild(pal); }
  var inp = document.getElementById(inputId);
  var cur = (inp && inp.value) || '#000000';
  var recent = rpfGetRecent(), page = [], brand = [];
  try { if (window.__ccColorPicker && window.__ccColorPicker.scanDocumentColors) page = window.__ccColorPicker.scanDocumentColors() || []; } catch (e) {}
  try { if (typeof getActiveBrandSet === 'function') { var _bs = getActiveBrandSet(); if (_bs && _bs.colors) brand = Object.keys(_bs.colors).map(function (k) { return _bs.colors[k]; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }); } } catch (e) {}
  function grid(label, arr) {
    if (!arr || !arr.length) return '';
    var g = '<div class="rpf-pal-sec">' + label + '</div><div class="rpf-pal-grid">';
    arr.slice(0, 24).forEach(function (c) { g += '<button type="button" class="rpf-pal-sw" style="background:' + _rpfEsc(c) + '" data-c="' + _rpfEsc(c) + '" title="' + _rpfEsc(c) + '"></button>'; });
    return g + '</div>';
  }
  var html = '<div class="rpf-pal-head"><span class="t">Color</span><button type="button" class="rpf-pal-wheel" title="Full color panel" aria-label="Full color panel"></button></div>';
  html += grid('Brand', brand) + grid('Recently used', recent) + grid('On page', page);
  if (!brand.length && !recent.length && !page.length) html += '<div class="rpf-pal-empty">No colors yet — select with circle from full panel.</div>';
  html += '<div class="rpf-pal-hex"><span class="sw" id="rpf-pal-cur" style="background:' + _rpfEsc(cur) + '"></span><input type="text" id="rpf-pal-hexin" value="' + _rpfHex(cur) + '" maxlength="7"></div>';
  pal.innerHTML = html;
  var r = anchor.getBoundingClientRect();
  pal.classList.add('show');   // show first so offsetWidth/Height are measurable for placement
  var pw = pal.offsetWidth || 220, ph = pal.offsetHeight || 260;
  var palLeft, palTop;
  if (r.bottom + 6 + ph <= window.innerHeight - 8) {
    palTop = r.bottom + 6; palLeft = r.left - 10;              // room below → open beneath the anchor
  } else {
    // No room below (e.g. a swatch low in the tall gradient/effects popup) → open BESIDE,
    // preferring the LEFT (these anchors sit inside a right-edge popup), clamped in-viewport.
    palTop = Math.max(8, Math.min(r.top, window.innerHeight - ph - 8));
    palLeft = r.left - pw - 8;
    if (palLeft < 8) palLeft = r.right + 8;
  }
  pal.style.left = Math.max(8, Math.min(palLeft, window.innerWidth - pw - 8)) + 'px';
  pal.style.top = palTop + 'px';
  pal.querySelectorAll('.rpf-pal-sw').forEach(function (b) {
    b.addEventListener('click', function () {
      rpfApplyColor(inputId, b.getAttribute('data-c'));
      pal.classList.remove('show'); document.removeEventListener('mousedown', _rpfPalOutside, true);
    });
  });
  var wheel = pal.querySelector('.rpf-pal-wheel');
  if (wheel) wheel.addEventListener('click', function () {
    pal.classList.remove('show'); document.removeEventListener('mousedown', _rpfPalOutside, true);
    var c2 = (document.getElementById(inputId) || {}).value || '#000000';
    if (fullTarget && typeof openColorPanel === 'function') openColorPanel(fullTarget, c2);
    /* No full-panel target named: open OUR panel writing back into the hidden input, instead of
       clicking it. `input.click()` on a display:none <input type="color"> opens CHROME's own
       picker pinned to the top-left of the screen - our panel never appeared at all. That hit
       every '' call site: shadow colour, text-effect stroke, background overlay, remove-colour,
       duotone. */
    else if (typeof openColorPanel === 'function') openColorPanel('input', c2, { inputId: inputId });
    else if (inp) inp.click();
  });
  var hexin = pal.querySelector('#rpf-pal-hexin');
  if (hexin) hexin.addEventListener('change', function () {
    var v = hexin.value.trim(); if (v[0] !== '#') v = '#' + v;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) rpfApplyColor(inputId, v);
  });
  setTimeout(function () { document.addEventListener('mousedown', _rpfPalOutside, true); }, 0);
}
function _rpfPalOutside(e) {
  var pal = document.getElementById('rpf-pal');
  if (pal && !pal.contains(e.target) && !(e.target.classList && e.target.classList.contains('rpf-swatch'))) {
    pal.classList.remove('show'); document.removeEventListener('mousedown', _rpfPalOutside, true);
  }
}

// ── Preset dropdowns (opacity / corners) ──
function rpfOpenPreset(anchor, kind) {
  rpfClosePopovers();
  var menu = document.getElementById('rpf-menu');
  if (!menu) { menu = document.createElement('div'); menu.id = 'rpf-menu'; menu.className = 'rpf-menu'; document.body.appendChild(menu); }
  if (kind === 'opacity') {
    var oc = parseInt((document.getElementById('p-opacity') || {}).value) || 100;
    menu.innerHTML = [10, 30, 50, 80, 100].map(function (v) { return '<button type="button" class="' + (v === oc ? 'on' : '') + '" data-v="' + v + '">' + v + '%</button>'; }).join('');
  } else if (kind === 'strokew') {
    var wc = parseInt((document.getElementById('p-strokew') || {}).value) || 0;
    menu.innerHTML = [0, 1, 2, 3, 4, 6, 8, 12].map(function (v) { return '<button type="button" class="' + (v === wc ? 'on' : '') + '" data-v="' + v + '">' + v + '</button>'; }).join('');
  } else {
    var rc = parseInt((document.getElementById('p-radius') || {}).value) || 0;
    menu.innerHTML = [0, 8, 16, 24, 32, 64, 96].map(function (v) { return '<button type="button" class="' + (v === rc ? 'on' : '') + '" data-v="' + v + '">' + v + '</button>'; }).join('') + '<button type="button" data-v="circular">Circular</button>';
  }
  menu.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-v');
      if (kind === 'opacity') rpfSetOpacity(parseInt(v));
      else if (kind === 'strokew') rpfApplyNum('p-strokew', parseInt(v));
      else if (v === 'circular') rpfCornerCircular();
      else rpfApplyNum('p-radius', parseInt(v));
      menu.classList.remove('show'); document.removeEventListener('mousedown', _rpfMenuOutside, true);
    });
  });
  var r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.right - 132, window.innerWidth - 142)) + 'px';
  menu.style.top = (r.bottom + 5) + 'px';
  menu.classList.add('show');
  setTimeout(function () { document.addEventListener('mousedown', _rpfMenuOutside, true); }, 0);
}
function _rpfMenuOutside(e) {
  var menu = document.getElementById('rpf-menu');
  if (menu && !menu.contains(e.target)) { menu.classList.remove('show'); document.removeEventListener('mousedown', _rpfMenuOutside, true); }
}
function rpfApplyNum(inputId, v) {
  var inp = document.getElementById(inputId); if (!inp) return;
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
}
function rpfSetOpacity(v) {
  var rng = document.getElementById('p-opacity'); if (!rng) return;
  rng.value = v;
  rng.dispatchEvent(new Event('input', { bubbles: true }));
  rng.dispatchEvent(new Event('change', { bubbles: true }));
}
function rpfCornerCircular() {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
  var o = c && c.getActiveObject(); if (!o) return;
  rpfApplyNum('p-radius', Math.round(Math.min(o.width || 0, o.height || 0) / 2));
}

// ── Page BACKGROUND panel (Figma parity, shown when nothing is selected) ──
function _rpfBgCanvas() { return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null); }
function rpfSetCanvasBg(hex) {
  var c = _rpfBgCanvas(); if (!c) return;
  // Video mode: don't touch the fabric background (that is the live video
  // preview) - drive the compositor backdrop instead.
  var _VE = window.__ccVideoEditor;
  if (_VE && _VE._veActive && _VE._veProject) {
    _VE._veProject.bgColor = hex; _VE._veProject.bgGradient = null; _VE._veProject.bgImage = null;
    var _sw = document.getElementById('p-bg-color-sw'); if (_sw) _sw.style.background = hex;
    var _hx = document.getElementById('p-bg-color-hex'); if (_hx) _hx.textContent = _rpfHex(hex);
    rpfAddRecent(hex);
    if (typeof _VE._veRenderPreviewFrame === 'function') _VE._veRenderPreviewFrame();
    return;
  }
  if (c.backgroundImage) c.setBackgroundImage(null, function () {});
  c.setBackgroundColor(hex, c.renderAll.bind(c));
  if (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined' && pages[currentPageIndex]) pages[currentPageIndex].bg = hex;
  var sw = document.getElementById('p-bg-color-sw'); if (sw) sw.style.background = hex;
  var hx = document.getElementById('p-bg-color-hex'); if (hx) hx.textContent = _rpfHex(hex);
  rpfAddRecent(hex);
  if (typeof snap === 'function') snap();
}
var _rpfGradState = { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 100, color: '#6c63ff' }] };
var _rpfGradSel = 0;
function _rpfGradStopsSorted() { return _rpfGradState.stops.slice().sort(function (a, b) { return a.offset - b.offset; }); }
function _rpfGradBarCss() { return 'linear-gradient(90deg,' + _rpfGradStopsSorted().map(function (s) { return s.color + ' ' + s.offset + '%'; }).join(',') + ')'; }
function _rpfGradPreview() {
  var stopsCss = _rpfGradStopsSorted().map(function (s) { return s.color + ' ' + s.offset + '%'; }).join(',');
  var full = _rpfGradState.type === 'radial' ? ('radial-gradient(circle,' + stopsCss + ')') : ('linear-gradient(' + _rpfGradState.angle + 'deg,' + stopsCss + ')');
  var p = document.getElementById('p-bg-grad-prev'); if (p) p.style.background = full;
  var bar = document.getElementById('rpf-grad-bar'); if (bar) bar.style.background = _rpfGradBarCss();
}
function rpfBgApplyGradient() {
  var c = _rpfBgCanvas(); if (!c || typeof fabric === 'undefined') return;
  // Video mode: store the gradient definition on the project; the compositor
  // paints it as the backdrop (fabric background stays the video preview).
  var _VEg = window.__ccVideoEditor;
  if (_VEg && _VEg._veActive && _VEg._veProject) {
    _VEg._veProject.bgGradient = { type: _rpfGradState.type, angle: _rpfGradState.angle, stops: _rpfGradStopsSorted().map(function (s) { return { offset: s.offset, color: s.color }; }) };
    _VEg._veProject.bgImage = null;
    if (typeof _rpfGradPreview === 'function') _rpfGradPreview();
    if (typeof _VEg._veRenderPreviewFrame === 'function') _VEg._veRenderPreviewFrame();
    return;
  }
  var w = c.getWidth(), h = c.getHeight();
  var stops = _rpfGradStopsSorted().map(function (s) { return { offset: Math.max(0, Math.min(1, s.offset / 100)), color: s.color }; });
  var grad;
  if (_rpfGradState.type === 'radial') {
    grad = new fabric.Gradient({ type: 'radial', gradientUnits: 'pixels', coords: { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 }, colorStops: stops });
  } else {
    var rad = (_rpfGradState.angle - 90) * Math.PI / 180, cx = w / 2, cy = h / 2, len = Math.max(w, h) / 2;
    grad = new fabric.Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: cx - Math.cos(rad) * len, y1: cy - Math.sin(rad) * len, x2: cx + Math.cos(rad) * len, y2: cy + Math.sin(rad) * len }, colorStops: stops });
  }
  if (c.backgroundImage) c.setBackgroundImage(null, function () {});
  c.setBackgroundColor(grad, c.renderAll.bind(c));
  _rpfGradPreview();
  if (typeof snap === 'function') snap();
}
function rpfBgGradPop(anchor) {
  var pop = _rpfPop2('rpf-bg-grad-pop', 'Gradient', anchor); pop.style.width = '244px';
  _rpfGradRenderBody(pop.querySelector('.rpf-pop2-body'));
}
function _rpfGradRenderBody(body) {
  if (!body) return;
  var st = _rpfGradState;
  var seg = '<div class="rpf-seg" style="margin-bottom:9px"><button type="button" class="' + (st.type === 'linear' ? 'on' : '') + '" data-gtype="linear" title="Linear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 14l16-8" stroke-width="1.4"/></svg></button><button type="button" class="' + (st.type === 'radial' ? 'on' : '') + '" data-gtype="radial" title="Radyal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg></button></div>';
  var bar = '<div class="rpf-grad-bar" id="rpf-grad-bar"></div>';
  var rows = _rpfGradState.stops.map(function (s, i) {
    return '<div class="rpf-grad-stoprow' + (i === _rpfGradSel ? ' sel' : '') + '">' +
      '<button type="button" class="rpf-swatch rpf-grad-stopsw" style="background:' + s.color + '" data-si="' + i + '"></button>' +
      '<input type="number" class="rpf-grad-stoppos" data-si="' + i + '" min="0" max="100" value="' + Math.round(s.offset) + '"><span class="rpf-grad-pct">%</span>' +
      '<button type="button" class="rpf-grad-stopdel" data-si="' + i + '"' + (st.stops.length <= 2 ? ' disabled' : '') + '>&#8722;</button></div>';
  }).join('');
  var angle = st.type === 'linear' ? '<div class="rpf-pop2-row" style="margin-top:9px"><span class="rpf-mini" style="width:30px;margin:0">Angle</span><input type="range" id="rpf-grad-angle" min="0" max="360" value="' + st.angle + '"><span class="rpf-pct" id="rpf-grad-angle-val">' + st.angle + '°</span></div>' : '';
  body.innerHTML = seg + bar + '<div class="rpf-grad-stops">' + rows + '</div><button type="button" class="rpf-grad-add" id="rpf-grad-add">+ Add stop</button>' + angle;
  body.querySelectorAll('[data-gtype]').forEach(function (b) { b.addEventListener('click', function () { _rpfGradState.type = b.getAttribute('data-gtype'); rpfBgApplyGradient(); _rpfGradRenderBody(body); }); });
  body.querySelectorAll('.rpf-grad-stopsw').forEach(function (b) { b.addEventListener('click', function () { _rpfGradSel = parseInt(b.getAttribute('data-si')); var inp = document.getElementById('p-bg-grad-stopcolor'); if (inp) inp.value = _rpfGradState.stops[_rpfGradSel].color; rpfOpenPalette(b, 'p-bg-grad-stopcolor', ''); }); });
  body.querySelectorAll('.rpf-grad-stoppos').forEach(function (inp) { inp.addEventListener('input', function () { var si = parseInt(inp.getAttribute('data-si')); _rpfGradState.stops[si].offset = Math.max(0, Math.min(100, parseInt(inp.value) || 0)); rpfBgApplyGradient(); }); });
  body.querySelectorAll('.rpf-grad-stopdel').forEach(function (b) { b.addEventListener('click', function () { if (_rpfGradState.stops.length <= 2) return; _rpfGradState.stops.splice(parseInt(b.getAttribute('data-si')), 1); _rpfGradSel = 0; rpfBgApplyGradient(); _rpfGradRenderBody(body); }); });
  var addB = document.getElementById('rpf-grad-add'); if (addB) addB.addEventListener('click', function () { var ss = _rpfGradState.stops; ss.push({ offset: 50, color: '#ffffff' }); _rpfGradSel = ss.length - 1; rpfBgApplyGradient(); _rpfGradRenderBody(body); });
  var ang = document.getElementById('rpf-grad-angle'); if (ang) ang.addEventListener('input', function () { _rpfGradState.angle = parseInt(ang.value) || 0; var v = document.getElementById('rpf-grad-angle-val'); if (v) v.textContent = ang.value + '°'; rpfBgApplyGradient(); });
  _rpfGradPreview();
}
var _rpfBgType = 'solid';
function rpfBgType(type) {
  _rpfBgType = type;
  var map = { solid: 'p-bg-solid', gradient: 'p-bg-gradient', image: 'p-bg-image' };
  for (var k in map) { var e = document.getElementById(map[k]); if (e) e.style.display = (k === type) ? '' : 'none'; }
  var seg = document.getElementById('p-bgtype'); if (seg) { var b = seg.querySelectorAll('button'); for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-bgtype') === type); }
  var c = _rpfBgCanvas();
  if (type === 'solid') {
    var sc = (document.getElementById('p-bg-color') || {}).value || '#000000';
    rpfSetCanvasBg(sc);                 // revert gradient/image → last solid colour (fix 1)
    _rpfBgChecker(false);
  } else if (type === 'gradient') {
    _rpfBgChecker(false);
    rpfBgApplyGradient();               // apply current gradient state so the canvas isn't blank
    var gb = document.getElementById('p-bg-grad-open'); if (gb) rpfBgGradPop(gb);  // open the inline editor dropdown (was: openColorPanel side-panel)
  } else if (type === 'image') {
    if (c && !c.backgroundImage) {
      // Switching to solid cleared the fabric backgroundImage but kept _rpfBgLastImgSrc — restore it
      // so coming back to "image" shows the chosen picture again instead of an empty checker. (bug fix)
      if (_rpfBgLastImgSrc) { c.setBackgroundColor('', function () {}); _rpfBgSetImage(_rpfBgLastImgSrc); }
      else { c.setBackgroundColor('', c.renderAll.bind(c)); _rpfBgChecker(true); }
    }
  }
}
// open the existing color-picker gradient editor, targeting the canvas background
function rpfBgOpenGradient() {
  _rpfBgType = 'gradient';
  var c = _rpfBgCanvas();
  var cur = (c && typeof c.backgroundColor === 'string' && c.backgroundColor) || (document.getElementById('p-bg-color') || {}).value || '#6c63ff';
  if (typeof openColorPanel === 'function') {
    openColorPanel('pageBg', cur);
    setTimeout(function () { var gt = document.querySelector('.cp-tab[data-cp-tab="gradient"]'); if (gt) gt.click(); if (window.__ccColorPicker && window.__ccColorPicker.applyGradient) window.__ccColorPicker.applyGradient(); }, 14);
  } else if (typeof showToast === 'function') showToast('Failed to load color panel');
}
// modern canvas-size preset menu (grouped platform sizes; reuses PRESET_GROUPS + setCustomCanvasSize)
function rpfSizeMenu(anchor) {
  rpfClosePopovers();
  var menu = document.getElementById('rpf-menu');
  if (!menu) { menu = document.createElement('div'); menu.id = 'rpf-menu'; menu.className = 'rpf-menu'; document.body.appendChild(menu); }
  menu.className = 'rpf-menu rpf-menu-presets';
  // Mode-aware catalog: video-format sizes (group/preset `video: true`) only in
  // video mode, print sizes hidden there (owner: image mode was showing 4K/Reel/etc).
  var _isVideoMode = (typeof activeProduct !== 'undefined' && activeProduct === 'video');
  var groups = (typeof PRESET_GROUPS !== 'undefined') ? PRESET_GROUPS : [];
  var html = '';
  groups.forEach(function (g) {
    if (g.video && !_isVideoMode) return;
    if (g.print && _isVideoMode) return;
    var ps = g.presets.filter(function (p) { return !(p.video && !_isVideoMode); });
    if (!ps.length) return;
    html += '<div class="rpf-menu-grp">' + _rpfEsc(g.group) + '</div>';
    ps.forEach(function (p) { html += '<button type="button" data-w="' + p.w + '" data-h="' + p.h + '" data-nm="' + _rpfEsc(p.name) + '"><span>' + _rpfEsc(p.name) + '</span><span class="rpf-menu-dim">' + p.w + '×' + p.h + '</span></button>'; });
  });
  menu.innerHTML = html || '<div class="rpf-menu-grp">No preset size</div>';
  menu.querySelectorAll('button[data-w]').forEach(function (b) { b.addEventListener('click', function () { rpfApplyCanvasSize(parseInt(b.getAttribute('data-w')), parseInt(b.getAttribute('data-h')), b.getAttribute('data-nm')); menu.classList.remove('show'); document.removeEventListener('mousedown', _rpfMenuOutside, true); }); });
  var r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, r.left) + 'px';
  menu.style.minWidth = Math.round(r.width) + 'px';
  /* OPEN UPWARDS WHEN THERE IS NO ROOM BELOW. The anchor used to be a field near the top of the
     right panel and dropping down was always right; the AI chat's copy of this control sits on the
     composer at the very bottom of the window, where dropping down runs the list off the screen
     (owner, 2026-08-05: "asagi dogru geliyor, kesiliyor"). Measured against the viewport rather
     than assumed from which panel called it, so any future anchor gets the same courtesy. */
  var room = window.innerHeight - r.bottom - 12;
  var want = Math.min(340, Math.max(160, room));
  /* Flip when the list does not FIT below, not when the gap is small by some arbitrary number: the
     menu wants 340px and the composer sits at the bottom of the window, so "there is 210px, that
     will do" is exactly how it came out cut off. Compared against what it needs, and only flipped
     when there is genuinely more room above. */
  if (room < 340 && r.top > room) {
    var above = Math.max(160, Math.min(340, r.top - 12));
    menu.style.maxHeight = above + 'px';
    menu.style.top = Math.max(8, r.top - above - 5) + 'px';
  } else {
    menu.style.maxHeight = want + 'px';
    menu.style.top = (r.bottom + 5) + 'px';
  }
  menu.classList.add('show');
  setTimeout(function () { document.addEventListener('mousedown', _rpfMenuOutside, true); }, 0);
}
function rpfApplyCanvasSize(w, h, label) {
  // Video mode: route through VideoCanvas, else enforceDimensions reverts the
  // plain setCustomCanvasSize on the next applyView (owner: preset menu did nothing).
  if (typeof activeProduct !== 'undefined' && activeProduct === 'video' && window.VideoCanvas && VideoCanvas.setCustomSize) {
    VideoCanvas.setCustomSize(w, h);
  } else {
    if (typeof setCustomCanvasSize === 'function') setCustomCanvasSize(w, h);
    if (typeof updateCanvasSizePanel === 'function') updateCanvasSizePanel();
  }
  var lbl = document.getElementById('rp-size-preset-label'); if (lbl && label) lbl.textContent = label;
}
// unit dropdown (px/mm/cm/inch) — drives the hidden page-tabs select so its logic stays intact
var _RPF_UNITS = [{ v: 'px', t: 'px' }, { v: 'mm', t: 'mm' }, { v: 'cm', t: 'cm' }, { v: 'in', t: 'inch' }];
function rpfUnitMenu(anchor) {
  rpfClosePopovers();
  var menu = document.getElementById('rpf-menu');
  if (!menu) { menu = document.createElement('div'); menu.id = 'rpf-menu'; menu.className = 'rpf-menu'; document.body.appendChild(menu); }
  menu.className = 'rpf-menu';
  var cur = (document.getElementById('rp-canvas-unit') || {}).value || (typeof _canvasUnit !== 'undefined' ? _canvasUnit : 'px');
  menu.innerHTML = _RPF_UNITS.map(function (u) { return '<button type="button" class="' + (u.v === cur ? 'on' : '') + '" data-u="' + u.v + '">' + u.t + '</button>'; }).join('');
  menu.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { rpfSetUnit(b.getAttribute('data-u'), b.textContent); menu.classList.remove('show'); document.removeEventListener('mousedown', _rpfMenuOutside, true); }); });
  var r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, r.left) + 'px'; menu.style.top = (r.bottom + 5) + 'px'; menu.style.minWidth = Math.round(r.width) + 'px';
  menu.classList.add('show');
  setTimeout(function () { document.addEventListener('mousedown', _rpfMenuOutside, true); }, 0);
}
function rpfSetUnit(u, label) {
  var sel = document.getElementById('rp-canvas-unit');
  if (sel) { sel.value = u; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  else if (typeof _canvasUnit !== 'undefined') { _canvasUnit = u; if (typeof _refreshUnitInputs === 'function') _refreshUnitInputs(); }
  var lbl = document.getElementById('rp-unit-label'); if (lbl) lbl.textContent = label || u;
}
function _rpfSyncUnitLabel() {
  var sel = document.getElementById('rp-canvas-unit'), lbl = document.getElementById('rp-unit-label');
  if (!sel || !lbl) return;
  var m = { px: 'px', mm: 'mm', cm: 'cm', 'in': 'inch' };
  lbl.textContent = m[sel.value] || sel.value || 'px';
}
// canvas transparency checkerboard (image bg type, no image yet) — the white/grey checker
function _rpfBgChecker(on) {
  ['card-stage', 'card-stage-container'].forEach(function (id) { var e = document.getElementById(id); if (e) e.classList.toggle('bg-checker', !!on); });
}
function rpfBgMakeImage() {
  if (typeof openAiPanel === 'function') openAiPanel();
  else if (typeof showToast === 'function') showToast('Use AI panel to generate images');
}
// Fill / Fit / Crop / Tile dropdown menu
var _RPF_FIT = [{ v: 'cover', t: 'Fill' }, { v: 'contain', t: 'Fit' }, { v: 'crop', t: 'Crop' }, { v: 'tile', t: 'Tile' }];
function rpfBgFillMenu(anchor) {
  rpfClosePopovers();
  var menu = document.getElementById('rpf-menu');
  if (!menu) { menu = document.createElement('div'); menu.id = 'rpf-menu'; menu.className = 'rpf-menu'; document.body.appendChild(menu); }
  menu.className = 'rpf-menu rpf-menu-fill';
  var cur = (document.getElementById('p-bg-fit') || {}).value || 'cover';
  menu.innerHTML = _RPF_FIT.map(function (o) { return '<button type="button" class="' + (o.v === cur ? 'sel' : '') + '" data-v="' + o.v + '"><span class="rpf-fillcheck">' + (o.v === cur ? '✓' : '') + '</span>' + o.t + '</button>'; }).join('');
  menu.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { rpfBgSetFit(b.getAttribute('data-v')); menu.classList.remove('show'); document.removeEventListener('mousedown', _rpfMenuOutside, true); }); });
  var r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, r.left) + 'px'; menu.style.top = (r.bottom + 5) + 'px'; menu.style.minWidth = Math.round(r.width) + 'px';
  menu.classList.add('show');
  setTimeout(function () { document.addEventListener('mousedown', _rpfMenuOutside, true); }, 0);
}
function rpfBgSetFit(v) {
  var inp = document.getElementById('p-bg-fit'); if (inp) inp.value = v;
  var found = _RPF_FIT.filter(function (o) { return o.v === v; })[0];
  var lbl = document.getElementById('p-bg-fit-label'); if (lbl && found) lbl.textContent = found.t;
  var c = _rpfBgCanvas(); if (!c) return;
  if (v === 'tile') {
    if (_rpfBgLastImgEl && typeof fabric !== 'undefined') {
      c.setBackgroundImage(null, function () {});
      c.setBackgroundColor(new fabric.Pattern({ source: _rpfBgLastImgEl, repeat: 'repeat' }), c.renderAll.bind(c));
    }
  } else {
    if (!c.backgroundImage && _rpfBgLastImgSrc) { _rpfBgSetImage(_rpfBgLastImgSrc, v); return; }
    if (c.backgroundImage && typeof _applyBgImagePosition === 'function') { _applyBgImagePosition(c, v === 'crop' ? 'center' : v); c.renderAll(); }
  }
  if (typeof snap === 'function') snap();
}
// Unified bg-image effects: brightness/contrast/saturation + preset + blur + overlay tint.
// (Before, the top overlay/blur and the bottom "Background Image Effects" section BOTH set
// backgroundImage.filters and clobbered each other — now this single applier owns the chain,
// reusing image-filters.js's proven buildFilters + appending the overlay BlendColor.)
var _rpfBgFx = { brightness: 0, contrast: 0, saturation: 0, preset: 'none' };
function rpfBgApplyImageFilters() {
  var c = _rpfBgCanvas();
  if (!c || !c.backgroundImage || typeof fabric === 'undefined' || !fabric.Image || !fabric.Image.filters) return;
  var bi = c.backgroundImage, F = fabric.Image.filters;
  var blur = parseInt((document.getElementById('p-bg-blur') || {}).value) || 0;      // 0..100
  var ovOp = parseInt((document.getElementById('p-bg-overlay-op') || {}).value) || 0; // 0..100
  var ovCol = (document.getElementById('p-bg-overlay-color') || {}).value || '#000000';
  var filters = (typeof window._ccBuildImgFilters === 'function')
    ? window._ccBuildImgFilters(_rpfBgFx.brightness, _rpfBgFx.contrast, _rpfBgFx.saturation, blur / 100, _rpfBgFx.preset)
    : [];
  if (ovOp > 0 && F.BlendColor) filters.push(new F.BlendColor({ color: ovCol, mode: 'tint', alpha: ovOp / 100 }));
  bi.filters = filters;
  if (!bi._originalElement && bi._element) bi._originalElement = bi._element;
  try { if (bi.applyFilters) bi.applyFilters(); }
  catch (e) { try { fabric.filterBackend = new fabric.Canvas2dFilterBackend(); bi.applyFilters(); } catch (e2) { /* silent */ } }
  c.requestRenderAll();
}
// Pull the currently-applied filters back into _rpfBgFx + hidden inputs, so the Effects popup
// opens showing the image's real state (e.g. after loading a saved project).
function _rpfBgFxSync() {
  var c = _rpfBgCanvas(); var bi = c && c.backgroundImage;
  if (!bi || !bi.filters) return;
  function f(t) { for (var i = 0; i < bi.filters.length; i++) { if (bi.filters[i] && bi.filters[i].type === t) return bi.filters[i]; } return null; }
  var b = f('Brightness'), ct = f('Contrast'), s = f('Saturation'), bl = f('Blur'), ov = f('BlendColor');
  _rpfBgFx.brightness = b && b.brightness != null ? Math.round(b.brightness * 100) : 0;
  _rpfBgFx.contrast = ct && ct.contrast != null ? Math.round(ct.contrast * 100) : 0;
  _rpfBgFx.saturation = s && s.saturation != null ? Math.round(s.saturation * 100) : 0;
  _rpfBgFx.preset = f('Grayscale') ? 'grayscale' : (f('Sepia') ? 'sepia' : (f('Invert') ? 'invert' : 'none'));
  var bE = document.getElementById('p-bg-blur'); if (bE) bE.value = bl && bl.blur != null ? Math.round(bl.blur * 100) : 0;
  var oE = document.getElementById('p-bg-overlay-op'); if (oE && ov && ov.alpha != null) oE.value = Math.round(ov.alpha * 100);
  var cE = document.getElementById('p-bg-overlay-color'); if (cE && ov && ov.color) cE.value = ov.color;
}
// generic popup shell (Overlay / Layer blur)
function _rpfPop2(id, title, anchor) {
  rpfClosePopovers();
  var pop = document.getElementById(id);
  if (!pop) { pop = document.createElement('div'); pop.id = id; pop.className = 'rpf-pop2'; document.body.appendChild(pop); }
  pop.innerHTML = '<div class="rpf-pop2-head"><span class="rpf-pop2-title">' + title + '</span><button type="button" class="rpf-pop2-x" onclick="this.closest(\'.rpf-pop2\').classList.remove(\'show\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div class="rpf-pop2-body"></div>';
  var r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left - 40, window.innerWidth - 244)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  pop.classList.add('show');
  setTimeout(function () { document.addEventListener('mousedown', function _o(e) { if (pop && !pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { pop.classList.remove('show'); document.removeEventListener('mousedown', _o, true); } }, true); }, 0);
  return pop;
}
function rpfBgBlurPop(anchor) {
  var pop = _rpfPop2('rpf-bg-blur-pop', 'Layer blur', anchor);
  var v = (document.getElementById('p-bg-blur') || {}).value || 0;
  pop.querySelector('.rpf-pop2-body').innerHTML = '<div class="rpf-pop2-row"><input type="range" id="rpf-blur-slider" min="0" max="100" value="' + v + '"><span class="rpf-pct" id="rpf-blur-val">' + v + ' %</span></div>';
  var sl = pop.querySelector('#rpf-blur-slider');
  sl.addEventListener('input', function () { var hv = document.getElementById('p-bg-blur'); if (hv) hv.value = sl.value; var vl = document.getElementById('rpf-blur-val'); if (vl) vl.textContent = sl.value + ' %'; rpfBgApplyImageFilters(); });
  sl.addEventListener('change', function () { if (typeof snap === 'function') snap(); });
}
// "Effects" dropdown — one popup owning ALL background-image effects: overlay tint,
// brightness/contrast/saturation, blur and the Grayscale/Sepia/Invert presets. Same
// _rpfPop2 dropdown style as the rest of the panel (replaces the flat bottom section).
function rpfBgEffectsPop(anchor) {
  _rpfBgFxSync();
  var pop = _rpfPop2('rpf-bg-fx-pop', 'Effects', anchor); pop.style.width = '250px';
  var op = (document.getElementById('p-bg-overlay-op') || {}).value || 0;
  var col = (document.getElementById('p-bg-overlay-color') || {}).value || '#000000';
  var blur = (document.getElementById('p-bg-blur') || {}).value || 0;
  var fx = _rpfBgFx;
  function adj(id, label, val) {
    return '<div class="rpf-pop2-row"><span class="rpf-mini rpf-fx-k">' + label + '</span>' +
      '<input type="range" id="' + id + '" min="-100" max="100" value="' + val + '"><span class="rpf-pct" id="' + id + '-v">' + val + '</span></div>';
  }
  pop.querySelector('.rpf-pop2-body').innerHTML =
    '<div class="rpf-fx-h">Overlay</div>' +
    '<div class="rpf-pop2-row"><span class="rpf-mini rpf-fx-k">Opak.</span><input type="range" id="rpf-ov-slider" min="0" max="100" value="' + op + '"><span class="rpf-pct" id="rpf-ov-val">' + op + '%</span></div>' +
    '<div class="rpf-field"><button type="button" class="rpf-swatch" id="p-bg-overlay-color-sw" style="background:' + col + '" onclick="rpfOpenPalette(this,\'p-bg-overlay-color\',\'\')"></button><span class="rpf-val" id="rpf-ov-hex">' + _rpfHex(col) + '</span><button type="button" class="rpf-ddbtn" onclick="rpfOpenPalette(document.getElementById(\'p-bg-overlay-color-sw\'),\'p-bg-overlay-color\',\'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button></div>' +
    '<div class="rpf-fx-h">Adjust</div>' +
    adj('rpf-fx-bri', 'Bright.', fx.brightness) + adj('rpf-fx-con', 'Contrast', fx.contrast) + adj('rpf-fx-sat', 'Satur.', fx.saturation) +
    '<div class="rpf-pop2-row"><span class="rpf-mini rpf-fx-k">Blur</span><input type="range" id="rpf-fx-blur" min="0" max="100" value="' + blur + '"><span class="rpf-pct" id="rpf-fx-blur-v">' + blur + '%</span></div>' +
    '<div class="rpf-fx-h">Filter</div>' +
    '<div class="rpf-fx-presets">' +
      '<button type="button" class="sbtn' + (fx.preset === 'grayscale' ? ' on' : '') + '" data-fx="grayscale">Grayscale</button>' +
      '<button type="button" class="sbtn' + (fx.preset === 'sepia' ? ' on' : '') + '" data-fx="sepia">Sepia</button>' +
      '<button type="button" class="sbtn' + (fx.preset === 'invert' ? ' on' : '') + '" data-fx="invert">Invert</button>' +
    '</div>' +
    '<button type="button" class="sbtn rpf-fx-reset" id="rpf-fx-reset">Reset all</button>';
  var ov = pop.querySelector('#rpf-ov-slider');
  ov.addEventListener('input', function () { var hv = document.getElementById('p-bg-overlay-op'); if (hv) hv.value = ov.value; var vl = document.getElementById('rpf-ov-val'); if (vl) vl.textContent = ov.value + '%'; rpfBgApplyImageFilters(); });
  ov.addEventListener('change', function () { if (typeof snap === 'function') snap(); });
  function wireAdj(id, key) { var el = pop.querySelector('#' + id); if (!el) return; el.addEventListener('input', function () { _rpfBgFx[key] = parseInt(el.value) || 0; var v = document.getElementById(id + '-v'); if (v) v.textContent = el.value; rpfBgApplyImageFilters(); }); el.addEventListener('change', function () { if (typeof snap === 'function') snap(); }); }
  wireAdj('rpf-fx-bri', 'brightness'); wireAdj('rpf-fx-con', 'contrast'); wireAdj('rpf-fx-sat', 'saturation');
  var bl = pop.querySelector('#rpf-fx-blur');
  bl.addEventListener('input', function () { var hv = document.getElementById('p-bg-blur'); if (hv) hv.value = bl.value; var v = document.getElementById('rpf-fx-blur-v'); if (v) v.textContent = bl.value + '%'; rpfBgApplyImageFilters(); });
  bl.addEventListener('change', function () { if (typeof snap === 'function') snap(); });
  pop.querySelectorAll('.rpf-fx-presets button').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-fx');
      _rpfBgFx.preset = (_rpfBgFx.preset === v) ? 'none' : v;   // click the active one → turn it off
      pop.querySelectorAll('.rpf-fx-presets button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-fx') === _rpfBgFx.preset); });
      rpfBgApplyImageFilters(); if (typeof snap === 'function') snap();
    });
  });
  pop.querySelector('#rpf-fx-reset').addEventListener('click', function () {
    _rpfBgFx.brightness = 0; _rpfBgFx.contrast = 0; _rpfBgFx.saturation = 0; _rpfBgFx.preset = 'none';
    var oo = document.getElementById('p-bg-overlay-op'); if (oo) oo.value = 0;
    var bb = document.getElementById('p-bg-blur'); if (bb) bb.value = 0;
    rpfBgApplyImageFilters(); if (typeof snap === 'function') snap();
    rpfBgEffectsPop(anchor);   // re-render popup at reset values
  });
}
function rpfBgChooseMedia() { var f = document.getElementById('p-bg-file'); if (f) f.click(); }
var _rpfBgLastImgEl = null, _rpfBgLastImgSrc = null;
function rpfBgRemoveImage() {
  var c = _rpfBgCanvas(); if (!c) return;
  c.setBackgroundImage(null, function () {});
  c.setBackgroundColor('', c.renderAll.bind(c));
  _rpfBgLastImgEl = null; _rpfBgLastImgSrc = null;
  _rpfBgChecker(true);
  if (typeof snap === 'function') snap();
  rpfSyncBgPanel();
}
function _rpfBgSetImage(dataUrl, fit) {
  var c = _rpfBgCanvas(); if (!c || typeof fabric === 'undefined') return;
  _rpfBgLastImgSrc = dataUrl;
  // Video mode: keep the image on the project backdrop (the fabric background is
  // the video preview), let the compositor draw it behind the video.
  var _VEi = window.__ccVideoEditor;
  if (_VEi && _VEi._veActive && _VEi._veProject) {
    _VEi._veProject.bgImage = dataUrl; _VEi._veProject.bgGradient = null;
    var _drop = document.getElementById('p-bg-drop'); if (_drop) { _drop.classList.add('has-img'); _drop.style.backgroundImage = 'url("' + dataUrl + '")'; }
    if (typeof _VEi._veRenderPreviewFrame === 'function') _VEi._veRenderPreviewFrame();
    return;
  }
  fabric.Image.fromURL(dataUrl, function (img) {
    if (!img || !img.width) return;
    _rpfBgLastImgEl = img._element || (img.getElement && img.getElement());
    c.setBackgroundImage(img, function () {
      var f = fit || (document.getElementById('p-bg-fit') || {}).value || 'cover';
      if (typeof _applyBgImagePosition === 'function') _applyBgImagePosition(c, f === 'crop' ? 'center' : (f === 'tile' ? 'cover' : f));
      rpfBgApplyImageFilters();
      _rpfBgChecker(false);
      c.requestRenderAll(); if (typeof snap === 'function') snap(); rpfSyncBgPanel();
    });
  });
}
function rpfSyncBgPanel() {
  var c = _rpfBgCanvas(); if (!c) return;
  // Video mode owns the background through the timeline compositor: the live
  // video preview IS the Fabric canvas.backgroundImage. The page-background
  // controls would replace that image with a solid/gradient/picture (their
  // "solid" path nulls backgroundImage), which permanently hides the video and
  // does not come back on switch-back or replay. So in video mode we hide the
  // page-background controls, drop any solid colour they painted, and re-attach
  // the video preview image if it was clobbered. Background here is managed via
  // the timeline clip menu ("Set as Background" / "Remove from Background").
  if (window.__ccVideoEditor && window.__ccVideoEditor._veActive) {
    var _VE = window.__ccVideoEditor;
    var _hasSel = c.getActiveObject();
    var _veBgP = document.getElementById('rp-bg-panel');
    // Show the real Background panel when nothing is selected; hide it for a
    // selected object (that object owns the panel space).
    if (_veBgP) _veBgP.style.display = _hasSel ? 'none' : '';
    // Keep the live video preview attached (a bg edit routed through the panel
    // must never leave the fabric background pointing away from the compositor).
    if (_VE._veUi && _VE._veUi.previewFabricImg && c.backgroundImage !== _VE._veUi.previewFabricImg
        && typeof _VE._veAttachPreviewBg === 'function') {
      _VE._veAttachPreviewBg();
      if (typeof _VE._veRenderPreviewFrame === 'function') _VE._veRenderPreviewFrame();
    }
    // Reflect the compositor backdrop (project bgColor/bgGradient/bgImage) into
    // the panel controls so the swatch/mode match what is drawn.
    if (!_hasSel) _veSyncBgPanelFromProject(_VE._veProject);
    c.renderAll();
    _rpfBgChecker(false);
    return;
  }
  var hasImg = !!c.backgroundImage, bg = c.backgroundColor;
  var isGrad = bg && typeof bg === 'object' && bg.colorStops;
  var isPattern = bg && typeof bg === 'object' && bg.source && bg.repeat;
  if (typeof bg === 'string' && bg) {
    var sw = document.getElementById('p-bg-color-sw'); if (sw) sw.style.background = bg;
    var hx = document.getElementById('p-bg-color-hex'); if (hx) hx.textContent = _rpfHex(bg);
    var bi = document.getElementById('p-bg-color'); if (bi) bi.value = toHex(bg);
  }
  var drop = document.getElementById('p-bg-drop');
  if (drop) {
    var src = hasImg && c.backgroundImage._element && c.backgroundImage._element.src;
    if (src) { drop.classList.add('has-img'); drop.style.backgroundImage = 'url("' + src + '")'; }
    else { drop.classList.remove('has-img'); drop.style.backgroundImage = ''; }
  }
  var type;
  if (hasImg || isPattern) type = 'image';
  else if (isGrad) type = 'gradient';
  else if ((!bg || bg === '') && _rpfBgType === 'image') type = 'image';   // image mode, image not chosen yet → keep the checker (fix 2)
  else type = 'solid';
  var map = { solid: 'p-bg-solid', gradient: 'p-bg-gradient', image: 'p-bg-image' };
  for (var k in map) { var e = document.getElementById(map[k]); if (e) e.style.display = (k === type) ? '' : 'none'; }
  var seg = document.getElementById('p-bgtype'); if (seg) { var b = seg.querySelectorAll('button'); for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-bgtype') === type); }
  var fitInp = document.getElementById('p-bg-fit'), fitLbl = document.getElementById('p-bg-fit-label');
  if (fitInp && fitLbl && typeof _RPF_FIT !== 'undefined') { var ff = _RPF_FIT.filter(function (o) { return o.v === fitInp.value; })[0]; fitLbl.textContent = ff ? ff.t : 'Fill'; }
  var ovSw = document.getElementById('p-bg-overlay-sw'), ovCol = document.getElementById('p-bg-overlay-color');
  if (ovSw && ovCol) ovSw.style.background = ovCol.value;
  if (hasImg && typeof _rpfBgFxSync === 'function') _rpfBgFxSync();
  _rpfBgChecker(type === 'image' && !hasImg && !isPattern);
  if (typeof _rpfSyncUnitLabel === 'function') _rpfSyncUnitLabel();
}
function _rpfInitBgPanel() {
  var bgColor = document.getElementById('p-bg-color');
  if (bgColor) bgColor.oninput = function (e) { rpfSetCanvasBg(e.target.value); };
  var stopColor = document.getElementById('p-bg-grad-stopcolor');
  if (stopColor) stopColor.oninput = function (e) {
    if (_rpfGradState.stops[_rpfGradSel]) _rpfGradState.stops[_rpfGradSel].color = e.target.value;
    rpfBgApplyGradient();
    var body = document.querySelector('#rpf-bg-grad-pop .rpf-pop2-body'); if (body && typeof _rpfGradRenderBody === 'function') _rpfGradRenderBody(body);
  };
  var seg = document.getElementById('p-bgtype');
  if (seg) seg.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('button[data-bgtype]') : null; if (b) rpfBgType(b.getAttribute('data-bgtype')); });
  var file = document.getElementById('p-bg-file');
  if (file) file.onchange = function (e) { var f = e.target.files && e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function (ev) { _rpfBgSetImage(ev.target.result); }; r.readAsDataURL(f); e.target.value = ''; };
  var ovColor = document.getElementById('p-bg-overlay-color');
  if (ovColor) ovColor.oninput = function (e) { var sw = document.getElementById('p-bg-overlay-sw'); if (sw) sw.style.background = e.target.value; rpfBgApplyImageFilters(); };
  // fit (Fill/Fit/Crop/Tile menu), overlay + blur popups are wired via their onclick handlers
  // initial reveal: nothing selected on load → show + populate the bg panel (selection:cleared won't fire on first load)
  var c0 = _rpfBgCanvas();
  if (!c0 || !c0.getActiveObject()) {
    var bgP0 = document.getElementById('rp-bg-panel'); if (bgP0) bgP0.style.display = '';
    rpfSyncBgPanel();
  }
}
function _rpfRevealBgIfEmpty() {
  var c = _rpfBgCanvas();
  if (c && c.getActiveObject()) return;
  var p = document.getElementById('rp-bg-panel'); if (p) p.style.display = '';
  if (typeof rpfSyncBgPanel === 'function') rpfSyncBgPanel();
}

// ── Video-mode background: show the REAL page Background panel (solid / gradient
// / image, the 3-button module) in video mode with nothing selected (owner: use
// the real module, not a bespoke control). The panel must NOT touch
// canvas.backgroundImage here - that IS the live video preview - so in video mode
// its edits are bridged to the compositor backdrop fields (VE._veProject.bgColor
// / bgGradient / bgImage, drawn by _veRenderPreviewFrame) inside rpfSetCanvasBg /
// rpfBgApplyGradient / _rpfBgSetImage. This function reflects those fields back
// into the panel controls.
function _veSyncBgPanelFromProject(proj) {
  if (!proj) return;
  var type = proj.bgImage ? 'image' : (proj.bgGradient ? 'gradient' : 'solid');
  var map = { solid: 'p-bg-solid', gradient: 'p-bg-gradient', image: 'p-bg-image' };
  for (var k in map) { var e = document.getElementById(map[k]); if (e) e.style.display = (k === type) ? '' : 'none'; }
  var seg = document.getElementById('p-bgtype');
  if (seg) { var b = seg.querySelectorAll('button'); for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-bgtype') === type); }
  if (type === 'solid') {
    var col = proj.bgColor || '#000000';
    var sw = document.getElementById('p-bg-color-sw'); if (sw) sw.style.background = col;
    var hx = document.getElementById('p-bg-color-hex'); if (hx) hx.textContent = _rpfHex(col);
    var bi = document.getElementById('p-bg-color'); if (bi && /^#[0-9a-fA-F]{6}$/.test(col)) bi.value = col;
  } else if (type === 'gradient' && proj.bgGradient) {
    var g = proj.bgGradient;
    _rpfGradState.type = g.type || 'linear';
    _rpfGradState.angle = (g.angle != null ? g.angle : 90);
    if (g.stops && g.stops.length) _rpfGradState.stops = g.stops.map(function (s) { return { offset: s.offset, color: s.color }; });
    if (typeof _rpfGradPreview === 'function') _rpfGradPreview();
  } else if (type === 'image' && proj.bgImage) {
    var drop = document.getElementById('p-bg-drop'); if (drop) { drop.classList.add('has-img'); drop.style.backgroundImage = 'url("' + proj.bgImage + '")'; }
  }
}
// Show the real Canvas size + Background panel for video mode with nothing selected.
function _veSyncBgSection() {
  var cs = document.getElementById('rp-canvas-size'); if (cs) cs.style.display = '';
  var bgP = document.getElementById('rp-bg-panel'); if (bgP) bgP.style.display = '';
  if (typeof rpfSyncBgPanel === 'function') rpfSyncBgPanel();
}
// No-op: the real bg-panel's visibility is driven by the normal selected-object
// flow (hidden when an object is selected) and single-mode logic.
function _veHideBgSection() {}
if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () { if (window.cc && cc.safe) cc.safe('right-panel.bg.init', _rpfInitBgPanel); else _rpfInitBgPanel(); });
  // also reveal after modules settle (wireframe tab-wrap, page load) — covers fresh load + page switches
  cc.on('modules:ready', function () { setTimeout(_rpfRevealBgIfEmpty, 60); });
}

// ── Modular skeleton hook (Faz 6b): right-panel is now a loader MODULE (modules/right-panel/).
// It self-inits its bindings + toggle on the sticky 'cc:canvas-ready' lifecycle event (app.js
// emits it during init), so it no longer depends on app.js calling initPropertyBindings /
// initRpanelToggle. Sticky → fires even if this module loads after the event. Each init runs in
// cc.safe so a failure here can't take down the app or sibling modules. syncRightPanel / setAlign
// stay global (script-scope) for the canvas selection handlers + index.html align buttons.
// Step 1 keeps the engine in ONE file; Faz 6b-2 splits it into typography/appearance/… sub-modules.
if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('right-panel.init', function () {
      if (typeof initPropertyBindings === 'function') initPropertyBindings();
      var rp = document.getElementById('rpanel');
      if (rp && typeof initRpanelToggle === 'function') initRpanelToggle(rp);
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'right-panel', title: 'Properties', icon: 'sliders', mount: function () {}, unmount: function () {} });
}

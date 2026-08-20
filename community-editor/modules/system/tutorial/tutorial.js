var tutorialStep = 0;

function getProductLabel() {
  if (typeof getProductConfig === 'function') {
    var cfg = getProductConfig();
    if (cfg && cfg.label) return cfg.label.toLowerCase();
  }
  return 'design';
}

function buildTutorialSteps() {
  var label = getProductLabel();
  var exportLabel = 'Share';

  var steps = [
    {
      target: '#icon-rail',
      title: 'Tool Panel',
      desc: 'Click any icon to open the corresponding tool — templates, text, shapes, backgrounds, QR codes, and more.',
      position: 'right'
    },
    {
      target: '#flyout-panel',
      title: 'Flyout Panel',
      desc: 'When you click a tool icon, this panel slides open with all the options. Close it by clicking the same icon again.',
      position: 'right',
      preAction: function() { if (typeof openFlyout === 'function') openFlyout('templates'); }
    },
    {
      target: '#card-stage',
      title: 'Your Canvas',
      desc: 'This is where you design your ' + label + '. Click elements to select them, double-click text to edit, and right-click for more options.',
      position: 'bottom'
    },
    {
      target: '#rpanel',
      title: 'Properties Panel',
      desc: 'Select any element on the canvas to see its properties here — font, color, size, opacity, and more.',
      position: 'left'
    },
    {
      target: '#rp-canvas-size',
      title: 'Canvas Size',
      desc: 'Adjust canvas dimensions in the right panel for your product type.',
      position: 'left'
    },
    {
      target: '#page-tabs-bar',
      title: 'Page Tabs',
      desc: 'Use the page tabs at the bottom to switch between pages or add new ones.',
      position: 'top'
    },
    {
      target: '#topbar',
      title: 'Toolbar',
      desc: 'Undo/Redo, settings, import/export, and the "' + exportLabel + '" button are all up here. Use the gear icon for shortcuts and layers.',
      position: 'bottom'
    }
  ];

  return steps;
}

var tutorialSteps = [];

function startTutorial() {
  tutorialSteps = buildTutorialSteps();
  tutorialStep = 0;
  var overlay = document.getElementById('tutorial-overlay');
  if (overlay) {
    overlay.classList.add('show');
    showTutorialStep();
  }
}

function closeTutorial() {
  var overlay = document.getElementById('tutorial-overlay');
  if (overlay) overlay.classList.remove('show');
  if (typeof closeFlyout === 'function') closeFlyout();
  sessionStorage.setItem('dika_tutorial_done', '1');
}

function isElementVisible(el) {
  if (!el) return false;
  var style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  var rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function nextTutorialStep() {
  tutorialStep++;
  while (tutorialStep < tutorialSteps.length) {
    var step = tutorialSteps[tutorialStep];
    var target = step ? document.querySelector(step.target) : null;
    if (target && isElementVisible(target)) break;
    tutorialStep++;
  }
  if (tutorialStep >= tutorialSteps.length) {
    closeTutorial();
    return;
  }
  showTutorialStep();
}

function showTutorialStep() {
  var step = tutorialSteps[tutorialStep];
  if (!step) return;

  if (step.preAction) step.preAction();

  var visibleCount = 0;
  for (var i = 0; i < tutorialSteps.length; i++) {
    var s = tutorialSteps[i];
    var el = document.querySelector(s.target);
    if (el && isElementVisible(el)) visibleCount++;
  }

  setTimeout(function() {
    var target = document.querySelector(step.target);
    if (!target || !isElementVisible(target)) { nextTutorialStep(); return; }

    var rect = target.getBoundingClientRect();
    var highlight = document.getElementById('tutorial-highlight');
    var tooltip = document.getElementById('tutorial-tooltip');
    var badge = document.getElementById('tutorial-step-badge');
    var title = document.getElementById('tutorial-title');
    var desc = document.getElementById('tutorial-desc');
    var nextBtn = document.getElementById('tutorial-next-btn');

    var currentVisible = 0;
    for (var j = 0; j <= tutorialStep; j++) {
      var sj = tutorialSteps[j];
      var elj = document.querySelector(sj.target);
      if (elj && isElementVisible(elj)) currentVisible++;
    }

    if (highlight) {
      highlight.style.left = (rect.left - 4) + 'px';
      highlight.style.top = (rect.top - 4) + 'px';
      highlight.style.width = (rect.width + 8) + 'px';
      highlight.style.height = (rect.height + 8) + 'px';
    }

    if (badge) badge.textContent = currentVisible + '/' + visibleCount;
    if (title) title.textContent = step.title;
    if (desc) desc.textContent = step.desc;

    var isLast = true;
    for (var k = tutorialStep + 1; k < tutorialSteps.length; k++) {
      var sk = tutorialSteps[k];
      var elk = document.querySelector(sk.target);
      if (elk && isElementVisible(elk)) { isLast = false; break; }
    }
    if (nextBtn) nextBtn.textContent = isLast ? 'Got It!' : 'Next →';

    if (tooltip) {
      var tLeft, tTop;
      if (step.position === 'right') {
        tLeft = rect.right + 16;
        tTop = rect.top + rect.height / 2 - 60;
      } else if (step.position === 'left') {
        tLeft = rect.left - 340;
        tTop = rect.top + rect.height / 2 - 60;
      } else if (step.position === 'bottom') {
        tLeft = rect.left + rect.width / 2 - 160;
        tTop = rect.bottom + 16;
      } else {
        tLeft = rect.left + rect.width / 2 - 160;
        tTop = rect.top - 140;
      }
      tLeft = Math.max(10, Math.min(window.innerWidth - 340, tLeft));
      tTop = Math.max(10, Math.min(window.innerHeight - 160, tTop));
      tooltip.style.left = tLeft + 'px';
      tooltip.style.top = tTop + 'px';
    }
  }, step.preAction ? 400 : 50);
}

// Modular skeleton hook (Faz 8) — tutorial is now a system loader module (modules/system/).
if (window.cc && cc.modules) cc.modules.register({ id: 'tutorial', parent: 'system', title: 'Tutorial', mount: function () {}, unmount: function () {} });

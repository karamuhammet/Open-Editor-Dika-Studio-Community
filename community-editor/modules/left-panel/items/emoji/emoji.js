/* Sub-module: left-panel/items/emoji — Twemoji slider + drill-in grid
   (7 categories, search). Adds emoji to canvas via ItemsCore.addEmoji. */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[items.emoji] cc skeleton missing'); return; }

  /* VENDORED, one directory, SVG only. These used to be two CDN bases - an SVG set for the canvas and
     a 72x72 PNG set for the grid - which meant the emoji panel was 222 network requests and drew
     nothing at all offline. An SVG renders identically in a 32px cell, so shipping a second raster
     copy of the same 222 glyphs would have doubled the bytes to look the same. The PNG base is kept
     as a name only so the two call sites stay readable; both resolve to the same .svg file.
     Attribution travels in js/vendor/twemoji/LICENSE.txt, which CC-BY 4.0 requires. */
  var TWEMOJI_SVG_BASE = 'js/vendor/twemoji/';
  var TWEMOJI_PNG_BASE = TWEMOJI_SVG_BASE;
  var TWEMOJI_EXT = '.svg';
  var _activeEmojiCat = 'smileys';

  var EMOJI_DATA = {
    smileys: { label: 'Smileys & People', items: [
      {cp:'1f600',n:'grinning'},{cp:'1f603',n:'smiley'},{cp:'1f604',n:'smile'},{cp:'1f601',n:'grin'},
      {cp:'1f606',n:'laughing'},{cp:'1f605',n:'sweat smile'},{cp:'1f923',n:'rofl'},{cp:'1f602',n:'joy'},
      {cp:'1f642',n:'slightly smiling'},{cp:'1f643',n:'upside down'},{cp:'1f609',n:'wink'},{cp:'1f60a',n:'blush'},
      {cp:'1f607',n:'innocent'},{cp:'1f970',n:'smiling hearts'},{cp:'1f60d',n:'heart eyes'},{cp:'1f929',n:'star struck'},
      {cp:'1f618',n:'kissing heart'},{cp:'1f617',n:'kissing'},{cp:'1f61a',n:'kissing closed eyes'},
      {cp:'1f619',n:'kissing smiling eyes'},{cp:'1f60b',n:'yum'},{cp:'1f61b',n:'tongue out'},
      {cp:'1f61c',n:'winking tongue'},{cp:'1f92a',n:'zany'},{cp:'1f61d',n:'squinting tongue'},
      {cp:'1f911',n:'money mouth'},{cp:'1f917',n:'hugging'},{cp:'1f92d',n:'hand over mouth'},
      {cp:'1f92b',n:'shushing'},{cp:'1f914',n:'thinking'},{cp:'1f910',n:'zipper mouth'},
      {cp:'1f928',n:'raised eyebrow'},{cp:'1f610',n:'neutral'},{cp:'1f611',n:'expressionless'},
      {cp:'1f636',n:'no mouth'},{cp:'1f60f',n:'smirk'},{cp:'1f612',n:'unamused'},
      {cp:'1f644',n:'rolling eyes'},{cp:'1f62c',n:'grimacing'},{cp:'1f925',n:'lying'},
      {cp:'1f60c',n:'relieved'},{cp:'1f614',n:'pensive'},{cp:'1f62a',n:'sleepy'},
      {cp:'1f924',n:'drooling'},{cp:'1f634',n:'sleeping'},{cp:'1f637',n:'mask'},
      {cp:'1f912',n:'thermometer'},{cp:'1f915',n:'head bandage'},{cp:'1f922',n:'nauseated'},
      {cp:'1f92e',n:'vomiting'},{cp:'1f927',n:'sneezing'}
    ]},
    animals: { label: 'Animals & Nature', items: [
      {cp:'1f436',n:'dog'},{cp:'1f431',n:'cat'},{cp:'1f42d',n:'mouse'},{cp:'1f439',n:'hamster'},
      {cp:'1f430',n:'rabbit'},{cp:'1f98a',n:'fox'},{cp:'1f43b',n:'bear'},{cp:'1f43c',n:'panda'},
      {cp:'1f428',n:'koala'},{cp:'1f42f',n:'tiger'},{cp:'1f981',n:'lion'},{cp:'1f42e',n:'cow'},
      {cp:'1f437',n:'pig'},{cp:'1f438',n:'frog'},{cp:'1f435',n:'monkey face'},
      {cp:'1f648',n:'see no evil'},{cp:'1f649',n:'hear no evil'},{cp:'1f64a',n:'speak no evil'},
      {cp:'1f414',n:'chicken'},{cp:'1f427',n:'penguin'},{cp:'1f426',n:'bird'},{cp:'1f424',n:'baby chick'},
      {cp:'1f986',n:'duck'},{cp:'1f985',n:'eagle'},{cp:'1f989',n:'owl'},{cp:'1f987',n:'bat'},
      {cp:'1f43a',n:'wolf'},{cp:'1f417',n:'boar'},{cp:'1f434',n:'horse'},{cp:'1f984',n:'unicorn'},
      {cp:'1f33b',n:'sunflower'},{cp:'1f339',n:'rose'},{cp:'1f33a',n:'hibiscus'},
      {cp:'1f337',n:'tulip'},{cp:'1f332',n:'evergreen'},{cp:'1f333',n:'deciduous tree'}
    ]},
    food: { label: 'Food & Drink', items: [
      {cp:'1f34e',n:'apple'},{cp:'1f350',n:'pear'},{cp:'1f34a',n:'tangerine'},{cp:'1f34b',n:'lemon'},
      {cp:'1f34c',n:'banana'},{cp:'1f349',n:'watermelon'},{cp:'1f347',n:'grapes'},{cp:'1f353',n:'strawberry'},
      {cp:'1f348',n:'melon'},{cp:'1f352',n:'cherries'},{cp:'1f351',n:'peach'},
      {cp:'1f96d',n:'mango'},{cp:'1f34d',n:'pineapple'},{cp:'1f965',n:'coconut'},{cp:'1f95d',n:'kiwi'},
      {cp:'1f345',n:'tomato'},{cp:'1f951',n:'avocado'},{cp:'1f355',n:'pizza'},{cp:'1f354',n:'hamburger'},
      {cp:'1f35f',n:'fries'},{cp:'1f32e',n:'taco'},{cp:'1f32f',n:'burrito'},{cp:'1f370',n:'cake'},
      {cp:'1f369',n:'donut'},{cp:'1f36a',n:'cookie'},{cp:'1f382',n:'birthday cake'},
      {cp:'2615',n:'coffee'},{cp:'1f375',n:'tea'},{cp:'1f37a',n:'beer'},{cp:'1f377',n:'wine'}
    ]},
    activities: { label: 'Activities', items: [
      {cp:'26bd',n:'soccer'},{cp:'1f3c0',n:'basketball'},{cp:'1f3c8',n:'football'},{cp:'26be',n:'baseball'},
      {cp:'1f3be',n:'tennis'},{cp:'1f3d0',n:'volleyball'},{cp:'1f3c9',n:'rugby'},
      {cp:'1f3b1',n:'pool'},{cp:'1f3d3',n:'ping pong'},{cp:'1f3f8',n:'badminton'},
      {cp:'1f3bf',n:'skiing'},{cp:'1f3c4',n:'surfing'},{cp:'1f3ca',n:'swimming'},
      {cp:'1f6b4',n:'biking'},{cp:'1f3ae',n:'video game'},{cp:'1f3af',n:'direct hit'},
      {cp:'1f3a8',n:'art palette'},{cp:'1f3ad',n:'performing arts'},
      {cp:'1f3b5',n:'musical note'},{cp:'1f3b6',n:'notes'},{cp:'1f3a4',n:'microphone'},
      {cp:'1f3ac',n:'clapper board'},{cp:'1f3a2',n:'roller coaster'},{cp:'1f3aa',n:'circus'}
    ]},
    travel: { label: 'Travel & Places', items: [
      {cp:'1f697',n:'car'},{cp:'1f695',n:'taxi'},{cp:'1f699',n:'suv'},{cp:'1f68c',n:'bus'},
      {cp:'1f3ce',n:'racing car'},{cp:'1f693',n:'police car'},{cp:'1f691',n:'ambulance'},
      {cp:'1f692',n:'fire engine'},{cp:'1f6f5',n:'motor scooter'},{cp:'1f6b2',n:'bicycle'},
      {cp:'2708',n:'airplane'},{cp:'1f680',n:'rocket'},{cp:'1f6f8',n:'flying saucer'},
      {cp:'1f30d',n:'earth globe'},{cp:'1f30e',n:'americas globe'},{cp:'1f30f',n:'asia globe'},
      {cp:'1f3d6',n:'beach'},{cp:'1f3d4',n:'mountain'},{cp:'1f3d5',n:'camping'},
      {cp:'1f3e0',n:'house'},{cp:'1f3e2',n:'office'},{cp:'1f3eb',n:'school'},
      {cp:'1f3e5',n:'hospital'},{cp:'26ea',n:'church'}
    ]},
    objects: { label: 'Objects', items: [
      {cp:'231a',n:'watch'},{cp:'1f4f1',n:'phone'},{cp:'1f4bb',n:'laptop'},{cp:'2328',n:'keyboard'},
      {cp:'1f5a5',n:'desktop'},{cp:'1f5a8',n:'printer'},{cp:'1f4f7',n:'camera'},{cp:'1f4f9',n:'video camera'},
      {cp:'1f4fa',n:'tv'},{cp:'1f50d',n:'magnifying glass'},{cp:'1f4a1',n:'lightbulb'},
      {cp:'1f526',n:'flashlight'},{cp:'1f4d4',n:'notebook'},{cp:'1f4d5',n:'closed book'},
      {cp:'1f4d6',n:'open book'},{cp:'1f4da',n:'books'},{cp:'270f',n:'pencil'},
      {cp:'1f4e7',n:'email'},{cp:'1f4e6',n:'package'},{cp:'1f511',n:'key'},{cp:'1f512',n:'lock'},
      {cp:'1f527',n:'wrench'},{cp:'1f528',n:'hammer'},{cp:'2699',n:'gear'},
      {cp:'1f4b0',n:'money bag'},{cp:'1f4b3',n:'credit card'},{cp:'1f4bc',n:'briefcase'},
      {cp:'1f392',n:'backpack'}
    ]},
    symbols: { label: 'Symbols & Hearts', items: [
      {cp:'2764',n:'red heart'},{cp:'1f9e1',n:'orange heart'},{cp:'1f49b',n:'yellow heart'},
      {cp:'1f49a',n:'green heart'},{cp:'1f499',n:'blue heart'},{cp:'1f49c',n:'purple heart'},
      {cp:'1f5a4',n:'black heart'},{cp:'1f90d',n:'white heart'},{cp:'1f90e',n:'brown heart'},
      {cp:'1f498',n:'cupid'},{cp:'1f49d',n:'gift heart'},{cp:'1f496',n:'sparkling heart'},
      {cp:'1f497',n:'growing heart'},{cp:'1f493',n:'beating heart'},{cp:'1f49e',n:'revolving hearts'},
      {cp:'1f495',n:'two hearts'},{cp:'2b50',n:'star'},{cp:'1f31f',n:'glowing star'},
      {cp:'2728',n:'sparkles'},{cp:'1f4ab',n:'dizzy'},{cp:'1f4a5',n:'collision'},
      {cp:'1f525',n:'fire'},{cp:'1f4af',n:'hundred'},{cp:'2705',n:'check mark'},
      {cp:'274c',n:'cross mark'},{cp:'2753',n:'question'},{cp:'2757',n:'exclamation'},
      {cp:'267b',n:'recycle'},{cp:'269b',n:'atom'}
    ]}
  };
  var EMOJI_CATS = ['smileys', 'animals', 'food', 'activities', 'travel', 'objects', 'symbols'];
  var EMOJI_POPULAR = ['1f600','1f602','1f60d','1f929','1f618','1f917','1f914','1f60e','1f60a','1f609','1f970','1f92a','1f525','2764','2b50','1f4af'];

  function _addEmoji(cp) { if (window.ItemsCore) ItemsCore.addEmoji(cp); }

  function fillSlider(slider) {
    EMOJI_POPULAR.forEach(function (cp) {
      var cell = document.createElement('div');
      cell.className = 'items-slider-cell items-emoji-cell';
      cell.innerHTML = '<img src="' + TWEMOJI_PNG_BASE + cp + TWEMOJI_EXT + '" alt="" width="32" height="32" loading="lazy">';
      cell.addEventListener('click', function () { _addEmoji(cp); });
      slider.appendChild(cell);
    });
  }

  function _fillEmojiGrid(grid, catKey, query) {
    grid.innerHTML = '';
    var items = [];
    if (catKey) items = (EMOJI_DATA[catKey] || {}).items || [];
    else if (query) EMOJI_CATS.forEach(function (k) { (EMOJI_DATA[k].items || []).forEach(function (e) { if (e.n.indexOf(query) !== -1) items.push(e); }); });
    items.forEach(function (e) {
      var cell = document.createElement('div');
      cell.className = 'items-emoji-grid-cell';
      cell.title = e.n;
      cell.innerHTML = '<img src="' + TWEMOJI_SVG_BASE + e.cp + '.svg" alt="' + e.n + '" width="36" height="36" loading="lazy">';
      cell.addEventListener('click', function () { _addEmoji(e.cp); });
      grid.appendChild(cell);
    });
    if (!items.length) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-dim);padding:20px;font-size:12px;">No emoji found</div>';
  }

  function renderDrill() {
    var view = document.getElementById('items-emoji-view');
    if (!view) return;
    var tabs = view.querySelector('.items-emoji-tabs');
    var grid = view.querySelector('.items-emoji-grid');
    var search = view.querySelector('.items-emoji-search');
    if (!tabs || !grid) return;
    if (!tabs.children.length) {
      EMOJI_CATS.forEach(function (key) {
        var btn = document.createElement('button');
        btn.className = 'items-emoji-tab' + (key === _activeEmojiCat ? ' active' : '');
        btn.textContent = EMOJI_DATA[key].label;
        btn.dataset.cat = key;
        btn.addEventListener('click', function () {
          _activeEmojiCat = key;
          tabs.querySelectorAll('.items-emoji-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.cat === key); });
          _fillEmojiGrid(grid, key, '');
          if (search) search.value = '';
        });
        tabs.appendChild(btn);
      });
    }
    if (search && !search._wired) {
      search._wired = true;
      search.addEventListener('input', function () { var q = search.value.toLowerCase().trim(); _fillEmojiGrid(grid, q ? null : _activeEmojiCat, q); });
    }
    _fillEmojiGrid(grid, _activeEmojiCat, '');
  }

  var _reg = false;
  function mount() { if (_reg) return; _reg = true; if (window.ItemsCore) ItemsCore.registerTab({ key: 'emoji', label: 'Emoji', order: 2, fillSlider: fillSlider, renderDrill: renderDrill }); }

  cc.modules.register({ id: 'emoji', parent: 'left-panel.items', title: 'Emoji', mount: mount, unmount: function () {} });
})();

import fs from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE_DIR = resolve(APP_ROOT, 'locales');
const CODES = ['zh', 'fr', 'de', 'tr', 'pt', 'ja', 'pl', 'ru', 'hi'];

const EXPECTED = {
  zh: {
    'Search stock': '搜索素材', 'Gallery: stock': '图库：素材', 'Search free stock media': '搜索免费素材',
    Unsplash: 'Unsplash', 'Unsplash Access Key': undefined, 'Gallery: browser': '图库：浏览', 'Upload queue': undefined,
    'Lock, shield, alerts, scans, safety': '锁、盾牌、提醒、扫描、安全', 'Story / Reel': '故事 / 短视频',
    'Facebook Reel': 'Facebook 短视频', Reel: '短视频', 'Templates: apply': '模板：应用', Wheels: '色轮',
    Original: '原始', Typewriter: '打字机', 'Arrow Label': '箭头标签', 'Iris Close': '虹膜关闭', Ease: '缓动',
    'Blank Deck': '空白演示文稿', 'Selection Tools': '选择工具', 'Pen Tools': '钢笔工具',
    'Deselect / Close': '取消选择 / 关闭', 'Lock / Unlock Selected': '锁定 / 解锁所选对象',
    'Gaussian Blur': '高斯模糊', 'B&W High Contrast': '黑白高对比度', 'Blur/Sharpen': '模糊/锐化',
    'Source Sans Pro': 'Source Sans Pro', 'Plus Jakarta Sans': 'Plus Jakarta Sans'
  },
  fr: {
    'Search stock': 'Rechercher des médias libres de droits', 'Gallery: stock': 'Galerie : médias libres de droits',
    'Search free stock media': 'Rechercher des médias libres de droits', Unsplash: 'Unsplash',
    'Gallery: browser': 'Galerie : parcourir', Track: 'Piste', Cues: 'Repères', Ease: 'Lissage',
    'Story / Reel': 'Story / vidéo courte', 'Instagram Reel': 'Vidéo courte Instagram',
    'Instagram Reels': 'Vidéos courtes Instagram', 'Facebook Reel': 'Vidéo courte Facebook', Reel: 'Vidéo courte',
    'YouTube Shorts': 'Vidéos courtes YouTube', 'Blank Deck': 'Présentation vierge',
    'Gaussian Blur': 'Flou gaussien', Sharpen: 'Netteté', 'Blur/Sharpen': 'Flou/Netteté',
    'Iris Open': 'Ouverture en iris', 'Iris Close': 'Fermeture en iris',
    'Ease In': 'Lissage entrant', 'Ease Out': 'Lissage sortant', 'Ease In-Out': 'Lissage entrant-sortant',
    'Ease Out Strong': 'Lissage sortant renforcé',
    'Video: Through Cut (All Tracks)': 'Vidéo : coupe directe (toutes les pistes)'
  },
  de: {
    'Search stock': 'Stockmedien durchsuchen', 'Gallery: stock': 'Galerie: Stockmedien',
    'Search free stock media': 'Kostenlose Stockmedien suchen', Unsplash: 'Unsplash',
    'Gallery: browser': 'Galerie: Durchsuchen', 'Upload Settings': 'Upload-Einstellungen', Track: 'Spur', Cues: 'Hinweise', Ease: 'Glättung',
    'Story / Reel': 'Story / Kurzvideo', Reel: 'Kurzvideo', 'Blank Deck': 'Leere Präsentation',
    'Gaussian Blur': 'Gaußscher Weichzeichner', 'Blur/Sharpen': 'Weichzeichnen/Schärfen', Wheels: 'Farbräder',
    'Ease In': 'Sanft ein', 'Ease Out': 'Sanft aus', 'Ease In-Out': 'Sanft ein-/ausblenden', 'Ease Out Strong': 'Sanft aus (stark)',
    'Iris Open': 'Irisblende öffnen', 'Iris Close': 'Irisblende schließen',
    'Video: Through Cut (All Tracks)': 'Video: Direktschnitt (alle Spuren)', 'Video: Selection Tool': 'Video: Auswahlwerkzeug'
  },
  tr: {
    'Search stock': 'Stok medya ara', 'Gallery: stock': 'Galeri: stok medya',
    'Search free stock media': 'Ücretsiz stok medya ara', Unsplash: 'Unsplash',
    'Unsplash Access Key': 'Unsplash erişim anahtarı', 'Gallery: browser': 'Galeri: göz at', Track: 'İz', Cues: 'İşaretler', Ease: 'Yumuşatma',
    'Story / Reel': 'Hikâye / Kısa video', 'Instagram Reel': 'Instagram kısa videosu',
    'Instagram Reels': 'Instagram kısa videoları', 'Facebook Reel': 'Facebook kısa videosu', Reel: 'Kısa video',
    'Blank Canvas': 'Boş tuval', 'Blank Deck': 'Boş sunum', 'Gaussian Blur': 'Gauss bulanıklığı',
    'Blur/Sharpen': 'Bulanıklaştırma/Keskinleştirme', Wheels: 'Renk tekerlekleri',
    'Ease In': 'Yumuşak giriş', 'Ease Out': 'Yumuşak çıkış', 'Ease In-Out': 'Yumuşak giriş-çıkış', 'Ease Out Strong': 'Güçlü yumuşak çıkış',
    'Arrow (Q)': 'Ok (Q)', 'Arrow Label': 'Ok etiketi', 'Iris Open': 'İris açılışı', 'Iris Close': 'İris kapanışı',
    'Video: Through Cut (All Tracks)': 'Video: Doğrudan kesme (tüm izler)', 'Video: Selection Tool': 'Video: Seçim aracı'
  },
  pt: {
    'Search stock': 'Buscar mídias de banco', 'Gallery: stock': 'Galeria: mídia de banco',
    'Search free stock media': 'Buscar mídias gratuitas de banco', Unsplash: 'Unsplash',
    'Gallery: browser': 'Galeria: navegar', 'Upload Settings': 'Configurações de upload', Track: 'Faixa', Cues: 'Marcadores', Ease: 'Suavização',
    'Story / Reel': 'Story / vídeo curto', 'Instagram Reel': 'Vídeo curto do Instagram',
    'Instagram Reels': 'Vídeos curtos do Instagram', 'Facebook Reel': 'Vídeo curto do Facebook', Reel: 'Vídeo curto',
    'Blank Canvas': 'Tela em branco', 'Blank Deck': 'Apresentação em branco', 'Gaussian Blur': 'Desfoque gaussiano',
    'Blur/Sharpen': 'Desfoque/Nitidez', Wheels: 'Rodas de cor', 'Ease In': 'Suavização de entrada',
    'Ease Out': 'Suavização de saída', 'Ease In-Out': 'Suavização de entrada e saída', 'Ease Out Strong': 'Suavização de saída forte',
    'Arrow (Q)': 'Seta (Q)', 'Arrow Label': 'Rótulo da seta', 'Iris Open': 'Abertura em íris', 'Iris Close': 'Fechamento em íris',
    '9:16 Story': 'Story 9:16', 'Video: Through Cut (All Tracks)': 'Vídeo: corte direto (todas as faixas)'
  },
  ja: {
    'Search stock': 'ストック素材を検索', 'Gallery: stock': 'ギャラリー: ストック素材',
    'Search free stock media': '無料のストック素材を検索', Unsplash: 'Unsplash',
    'Unsplash Access Key': 'Unsplash アクセスキー', 'Gallery: browser': 'ギャラリー: 参照', Track: 'トラック', Cues: 'キューポイント', Ease: 'イージング',
    'Story / Reel': 'ストーリー / ショート動画', 'Instagram Reel': 'Instagram ショート動画',
    'Instagram Reels': 'Instagram ショート動画', 'Facebook Reel': 'Facebook ショート動画', Reel: 'ショート動画',
    'PowerPoint deck': 'PowerPoint プレゼンテーション', Duration: '再生時間', 'Total duration': '合計時間', 'Blank Deck': '空白のプレゼンテーション',
    Story: 'ストーリー', Sharpen: 'シャープ', 'Gaussian Blur': 'ガウスぼかし', 'Blur/Sharpen': 'ぼかし/シャープ', Wheels: 'カラーホイール',
    'Ease In': 'イーズイン', 'Ease Out': 'イーズアウト', 'Ease In-Out': 'イーズイン・アウト', 'Ease Out Strong': '強いイーズアウト',
    'Iris Open': 'アイリス開き', 'Iris Close': 'アイリス閉じ', 'Video: Through Cut (All Tracks)': 'ビデオ: 直接カット (全トラック)'
  },
  pl: {
    'Search stock': 'Szukaj mediów stockowych', 'Gallery: stock': 'Galeria: media stockowe',
    'Search free stock media': 'Szukaj bezpłatnych mediów stockowych', Unsplash: 'Unsplash',
    'Gallery: browser': 'Galeria: przeglądanie', 'Upload Settings': 'Ustawienia przesyłania', Track: 'Ścieżka', Cues: 'Znaczniki', Ease: 'Wygładzanie',
    'Story / Reel': 'Relacja / rolka', 'Instagram Story': 'Relacja na Instagramie', 'Instagram Reel': 'Rolka na Instagramie',
    'Instagram Reels': 'Rolki na Instagramie', 'Facebook Reel': 'Rolka na Facebooku', Reel: 'Rolka', Story: 'Relacja',
    'PowerPoint deck': 'Prezentacja PowerPoint', 'Blank Canvas': 'Puste płótno', 'Blank Deck': 'Pusta prezentacja', Apply: 'Zastosuj',
    Sharpen: 'Wyostrzenie', 'Gaussian Blur': 'Rozmycie gaussowskie', 'Blur/Sharpen': 'Rozmycie/Wyostrzenie', Wheels: 'Koła kolorów',
    'Ease In': 'Wygładzanie wejścia', 'Ease Out': 'Wygładzanie wyjścia', 'Ease In-Out': 'Wygładzanie wejścia i wyjścia', 'Ease Out Strong': 'Silne wygładzanie wyjścia',
    '9:16 Story': 'Relacja 9:16', 'Iris Open': 'Otwarcie irysowe', 'Iris Close': 'Zamknięcie irysowe', 'Credits Roll': 'Napisy końcowe',
    'Video: Through Cut (All Tracks)': 'Wideo: cięcie bezpośrednie (wszystkie ścieżki)', 'Video: Selection Tool': 'Wideo: narzędzie zaznaczania'
  },
  ru: {
    'Search stock': 'Поиск стоковых медиа', 'Gallery: stock': 'Галерея: стоковые медиа',
    'Search free stock media': 'Поиск бесплатных стоковых материалов', Unsplash: 'Unsplash',
    'Gallery: browser': 'Галерея: просмотр', 'Upload queue': 'Очередь загрузки', Track: 'Дорожка', Cues: 'Маркеры', Ease: 'Плавность',
    'Story / Reel': 'История / короткое видео', 'Instagram Story': 'История в Instagram', 'Instagram Reel': 'Короткое видео Instagram',
    'Instagram Reels': 'Короткие видео Instagram', 'Facebook Reel': 'Короткое видео Facebook', Reel: 'Короткое видео',
    'Blank Canvas': 'Пустой холст', 'Blank Deck': 'Пустая презентация', 'PowerPoint deck': 'Презентация PowerPoint', Apply: 'Применить',
    Sharpen: 'Резкость', 'Gaussian Blur': 'Размытие по Гауссу', 'Blur/Sharpen': 'Размытие/резкость', Wheels: 'Цветовые колёса',
    'Ease In': 'Плавный вход', 'Ease Out': 'Плавный выход', 'Ease In-Out': 'Плавный вход и выход', 'Ease Out Strong': 'Сильный плавный выход',
    '9:16 Story': 'История 9:16', 'Iris Open': 'Ирисовое открытие', 'Iris Close': 'Ирисовое закрытие',
    'Video: Through Cut (All Tracks)': 'Видео: прямой монтаж (все дорожки)', 'Video: Selection Tool': 'Видео: инструмент выделения'
  },
  hi: {
    'Search stock': 'स्टॉक मीडिया खोजें', 'Gallery: stock': 'गैलरी: स्टॉक मीडिया',
    'Search free stock media': 'मुफ़्त स्टॉक मीडिया खोजें', Unsplash: 'Unsplash',
    'Unsplash Access Key': 'Unsplash एक्सेस कुंजी', 'Gallery: browser': 'गैलरी: ब्राउज़ करें',
    'Upload queue': 'अपलोड कतार', Track: 'ट्रैक', Cues: 'क्यू पॉइंट', Ease: 'ईज़िंग',
    'Story / Reel': 'स्टोरी / शॉर्ट वीडियो', 'Instagram Story': 'Instagram स्टोरी', 'Instagram Reel': 'Instagram शॉर्ट वीडियो',
    'Instagram Reels': 'Instagram शॉर्ट वीडियो', 'Facebook Reel': 'Facebook शॉर्ट वीडियो', Reel: 'शॉर्ट वीडियो', Story: 'स्टोरी',
    'Blank Canvas': 'खाली कैनवास', 'Blank Deck': 'खाली प्रस्तुति', 'PowerPoint deck': 'PowerPoint प्रस्तुति', Apply: 'लागू करें',
    Sharpen: 'शार्प करें', 'Gaussian Blur': 'गॉसियन ब्लर', 'Blur/Sharpen': 'ब्लर/शार्प करें', Wheels: 'कलर व्हील्स',
    'Ease In': 'ईज़-इन', 'Ease Out': 'ईज़-आउट', 'Ease In-Out': 'ईज़-इन-आउट', 'Ease Out Strong': 'मज़बूत ईज़-आउट',
    '9:16 Story': 'स्टोरी 9:16', 'Iris Open': 'आइरिस ओपन', 'Iris Close': 'आइरिस क्लोज़',
    'Video: Through Cut (All Tracks)': 'वीडियो: सीधा कट (सभी ट्रैक)', 'Video: Selection Tool': 'वीडियो: चयन उपकरण'
  }
};

const FORBIDDEN = {
  zh: [/搜索股票/, /画廊：库存/, /未飞溅/, /声音的/, /<\s*(?:按钮|输入|画布)/, /\b(?:shield|alerts|scans|safety|Selection|Deselect|Unlock|Gaussian|Sharpen|Arrow|Youtube)\b/, /卷轴/, /申请/, /原来的/],
  fr: [/Rechercher des actions/, /Galerie.{0,8}actions/, /Galerie.{0,8}télécharger/, /section Stock/, /Bobine/, /Gaussian Flou/, /Flou\/Sharpen/, /Vide Deck/, /Facilité/, /Iris Fermer/],
  de: [/Bestand durchsuchen/, /Galerie: Lager/, /Galerie: hochladen/, /Stock section/, /Geschichte \/ Rolle/, /Leer Deck/, /Gaussian Weichzeichnen/, /Weichzeichnen\/Sharpen/, /Entspannen Sie sich/, /Einfach <select/, /Iris schließen/],
  tr: [/Hisse senedi ara/, /Sıçratmayı kaldır/, /Erişim Anahtarını Kaldır/, /Hikaye \/ Makara/, /Instagram makarası/, /Facebook Makarası/, /Boş Canvas/, /Boş Deck/, /Gaussian Bulanıklık/, /Bulanıklık\/Sharpen/, /Kolaylık/, /Güçlü Bir Şekilde Rahatlayın/, /OkSağ/, /OkSol/, /İris Açık/, /İris Kapat/, /Parçalar:/],
  pt: [/Pesquisar estoque/, /Remover respingo/, /seção Estoque/, /História \/ Rolo/, /Carretel/, /Vazio Canvas/, /Vazio Deck/, /Gaussian Desfoque/, /Desfoque\/Sharpen/, /Facilidade/, /Facilite Forte/, /Íris Fechar/, /Inscrever-se/, /Through Cut/],
  ja: [/在庫を検索/, /ギャラリー: 在庫/, /アンスプラッシュ/, /ストックセクション/, /空白 Deck/, /Gaussian ぼかし/, /ぼかし\/Sharpen/, /アイリス・クローズ/, /掛け合わせてもらいます/, /合計期間/, /<label>期間/, /長さ：/],
  pl: [/Wyszukaj akcje/, /media giełdowe/, /Usuń rozpryski/, /Sekcja Stock/, /Historia \/ Rolka/, /Puste Canvas/, /Puste Deck/, /Gaussian Rozmycie/, /Rozmycie\/Sharpen/, /Ułatw sobie/, /Odpręż się mocno/, /Łatwość/, /Irys Otwarty/, /Irys blisko/, /Przecięcie \(wszystkie/, /Rolka kredytów/],
  ru: [/Поиск акций/, /Галерея: сток$/, /раздел Stock/, /Загрузить очередь/, /Сюжет \/ Ролик/, /Пусто Canvas/, /Пусто Deck/, /Gaussian Размытие/, /Размытие\/Sharpen/, /Легкость/, /Легкость Сильная/, /Ирис Опен/, /Ирис Клоуз/, /сквозная версия/, /Колода PowerPoint/],
  hi: [/स्टॉक खोजें/, /गैलरी: स्टॉक$/, /अनप्लैश/, /कतार अपलोड करें/, /कहानी\/रील/, /खाली Canvas/, /खाली Deck/, /Gaussian ब्लर/, /ब्लर\/Sharpen/, /आराम करो/, /आसानी से मजबूत/, /आईरिस खुला/, /आईरिस बंद करें/, /थ्रू कट/]
};

function loadDictionary(code) {
  let entries = {};
  const CCI18n = { add: (_code, value) => { entries = value; } };
  const file = resolve(LOCALE_DIR, code + '.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { CCI18n, window: { CCI18n } });
  return entries;
}

const result = {};
let failures = 0;
for (const code of CODES) {
  const dictionary = loadDictionary(code);
  const missing = [];
  const mismatched = [];
  for (const [key, expected] of Object.entries(EXPECTED[code])) {
    if (!(key in dictionary)) missing.push(key);
    else if (expected !== undefined && dictionary[key] !== expected) mismatched.push({ key, actual: dictionary[key], expected });
  }
  const forbidden = [];
  for (const [key, value] of Object.entries(dictionary)) {
    for (const pattern of FORBIDDEN[code]) if (pattern.test(String(value))) forbidden.push({ key, value, pattern: String(pattern) });
  }
  result[code] = { entries: Object.keys(dictionary).length, missing, mismatched, forbidden };
  failures += missing.length + mismatched.length + forbidden.length;
}

console.log(JSON.stringify({ ok: failures === 0, failures, locales: result }, null, 2));
if (failures) process.exitCode = 1;

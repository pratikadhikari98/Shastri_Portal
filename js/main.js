/* ================================================
   शास्त्री पोर्टल v3 — main.js
   Night mode FIXED · 7 Themes · Chapter read-only
   ================================================ */
'use strict';

/* ── State ── */
const App = {
  page: 'home',
  yearId: null,
  subjectId: null,
  _booting: true, // boot/restore सकिने बित्तिकै false हुन्छ — यो हुँदासम्म nav indicator कुनै animation बिना सिधै सही ठाउँमा बस्छ
  theme: 'white',
  fontSize: 14,   // १४px मा लक
  lang: localStorage.getItem('sp_lang') || 'ne',
  notes: JSON.parse(localStorage.getItem('sp_notes') || '[]'),
  bookmarks: JSON.parse(localStorage.getItem('sp_bookmarks') || '[]'),
  chapterBookmarks: JSON.parse(localStorage.getItem('sp_chapter_bookmarks') || '[]'),
  history: JSON.parse(localStorage.getItem('sp_history') || '[]'),
  chaptersCache: {},
  feedPosts: [], // "समाचार" पेजको छुट्टै feed (home board को notices भन्दा फरक)
  editNoteId: null,
  newsIdx: 0,
  data: null,
};

/* ── Subject config ──
   क्रम: व्याकरण, अंग्रेजी, नेपाली (साहित्य), संस्कृत (साहित्य), ज्योतिष */
const SUBJ = {
  // iconSvg (ऐच्छिक): SVG/PNG icon path राख्न मिल्छ — नराखे 'short' अक्षर देखिन्छ
  vyakaran: { label:'व्याकरण',           short:'व्या', g:'#BBDEFB,#1565C0' },
  english:  { label:'English Literature', short:'अ',  g:'#C8E6C9,#43A047' },
  nepali:   { label:'नेपाली साहित्य',    short:'ने',  g:'#FFE0B2,#FF8A65' },
  sanskrit: { label:'संस्कृत साहित्य',   short:'सं', g:'#D1C4E9,#7B1FA2' },
  jyotish:  { label:'ज्योतिष शास्त्र',  short:'ज्यो', g:'#FFF9C4,#F57F17' },
};
// माथिको क्रम अनुसार नै जताततै (year page, admin tabs) विषय देखिने — नयाँ थपिएका विषय अन्त्यमा थपिन्छन्
const SUBJECT_ORDER = Object.keys(SUBJ);
function orderedSubjectEntries(subjectsObj) {
  const keys = Object.keys(subjectsObj || {});
  keys.sort((a, b) => {
    const ia = SUBJECT_ORDER.indexOf(a), ib = SUBJECT_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map(k => [k, subjectsObj[k]]);
}
window.orderedSubjectEntries = orderedSubjectEntries;

const THEMES = [
  { id:'light',  label:'Warm Saffron',  dot:'td-saffron', emoji:'🟠' },
  { id:'green',  label:'Forest Green',  dot:'td-green',   emoji:'🟢' },
  { id:'blue',   label:'Ocean Blue',    dot:'td-blue',    emoji:'🔵' },
  { id:'purple', label:'Royal Purple',  dot:'td-purple',  emoji:'🟣' },
  { id:'rose',   label:'Rose Gold',     dot:'td-rose',    emoji:'🌸' },
];

/* ── App version — कोड अपडेट गर्दा यी दुई लाइन बदल्नुहोस् ── */
const APP_VERSION    = 'V13';
const APP_BUILD_DATE  = '2026-10-27'; // YYYY-MM-DD — कोड जहिले अपडेट भयो त्यो मिति

/* ════════════════════════════════════
   BOOT
   ════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  initLogoAnimation();          // सबैभन्दा पहिले — ताकि पछिको भारी काम (data render, canvas) ले यसलाई jank नगरोस्
  applyTheme(App.theme, false);
  applyFontSize(App.fontSize, false);
  applyFont();
  // Pre-load profile name in header if needed
  // (full load happens when profile page opens)
  const _hadCache = await loadData();   // cache भए तुरुन्तै फर्कन्छ (network कुर्दैन)
  renderHome();
  renderContributors();
  startClock();
  initSearch();
  initNews();
  initNav();
  initNavScrollHide();
  initNotes();
  initDotsMenu();
  initLanguage();
  initAppInfo();
  initBackgroundCanvas();
  initHistoryNav();
  initSheetDragGestures();
  initChapterProgress();
  applyLanguage(App.lang);
  await restoreLastLocation();
  App._booting = false;
  if (_hadCache) refreshDataInBackground();   // ताजा डाटा चुपचाप तानेर फरक भए मात्र पुनः देखाउने
});

/* ════════════════════════════════════
   DATA
   ════════════════════════════════════ */
async function _fetchWithTimeout(url, ms = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r;
  } finally { clearTimeout(t); }
}

let _forceFresh = false;   // तल तानेर ताजा गर्दा — ब्राउजरको cache छलेर सिधै सर्भरबाट
async function fetchJson(path, ms = 6000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(path, { signal: ctrl.signal, cache: _forceFresh ? 'reload' : 'default' });
      return r.ok ? await r.json() : null;
    } finally { clearTimeout(t); }
  } catch { return null; }
}

/* सबै डाटा GitHub repo का static फाइलबाट: data/books.json, subjects.json, news.json, feed.json
   ⚡ Cache-first: दोस्रो पटकदेखि localStorage को डाटाले सिधै screen बनाउँछ (network कुर्नै पर्दैन),
   ताजा डाटा पछाडि तानिन्छ। पहिलो पटक मात्र network कुर्नुपर्छ। */
const DATA_CACHE_KEY = 'sp_data_cache_v1';

async function fetchAllData() {
  const [books, subjects, newsJson, feedJson, contribs] = await Promise.all([
    fetchJson('data/books.json'),
    fetchJson('data/subjects.json'),
    fetchJson('data/news.json'),
    fetchJson('data/feed.json'),
    fetchJsData('data/contributors.js'),
  ]);
  let news = Array.isArray(newsJson) ? newsJson : null;
  if (!news) { const legacy = await fetchJsData('data/news.js'); news = Array.isArray(legacy) ? legacy : null; }
  return { books, subjects, news, feed: Array.isArray(feedJson) ? feedJson : null, contribs: Array.isArray(contribs) ? contribs : null };
}

function applyRawData(raw) {
  const validBooks = raw.books && typeof raw.books === 'object' && Array.isArray(raw.books.years) && raw.books.years.length;
  App.data = validBooks ? Object.assign({}, raw.books) : makeFallback();   // कपी — cache को raw.books नबिगारियोस्
  if (raw.subjects && typeof raw.subjects === 'object') Object.assign(SUBJ, raw.subjects);
  App.data.news = Array.isArray(raw.news) ? raw.news : [];
  App.feedPosts = Array.isArray(raw.feed) ? raw.feed : [];
  App.contributors = Array.isArray(raw.contribs) ? raw.contribs : [];
}

function readDataCache() {
  try { const r = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || 'null'); return (r && r.books) ? r : null; } catch (e) { return null; }
}
function writeDataCache(raw) {
  try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(raw)); } catch (e) {}
}

async function loadData() {
  const cached = readDataCache();
  if (cached) { applyRawData(cached); return true; }
  const raw = await fetchAllData();
  applyRawData(raw);
  if (raw.books) writeDataCache(raw);
  return false;
}

async function refreshDataInBackground(force) {
  // फर्काउँछ: 'updated' (नयाँ डाटा आयो) | 'same' (पहिल्यै नयाँ) | 'fail' (नेटवर्क/सर्भर समस्या) | 'admin'
  try {
    if (App.isAdmin) return 'admin';               // Admin ले GitHub API बाट आफ्नै ताजा डाटा लिन्छ
    const cached = readDataCache() || {};
    _forceFresh = !!force;
    let fresh; try { fresh = await fetchAllData(); } finally { _forceFresh = false; }
    if (!fresh.books) return 'fail';               // network समस्या — cache मै रहन दिने
    // नयाँ नआएको भाग पुरानै राख्ने
    const merged = {
      books: fresh.books, subjects: fresh.subjects || cached.subjects || null,
      news: fresh.news || cached.news || null, feed: fresh.feed || cached.feed || null,
      contribs: fresh.contribs || cached.contribs || null
    };
    if (JSON.stringify(merged) === JSON.stringify(cached)) return 'same';   // केही फरक छैन → केही नगर्ने
    writeDataCache(merged);
    applyRawData(merged);
    if (typeof refreshBookViews === 'function') refreshBookViews(); else renderHome();
    if (typeof refreshNoticeViews === 'function') refreshNoticeViews();
    if (typeof renderContributors === 'function') renderContributors();
    return 'updated';
  } catch (e) { return 'fail'; }                    // चुपचाप — cache ले काम चलाइरहेको छ
}

function makeFallback() {
  const mk = (pre, lbl, n) => Array.from({length:n},(_,i)=>({
    id:`${pre}_${i+1}`, title:`${lbl} ${['१','२','३'][i]}`,
    author:'लेखकको नाम', cover:'', description:`${lbl} — विवरण`, pdf:''
  }));
  const yr = (id,t,s,c) => ({id,title:t,subtitle:s,color:c,subjects:{
    nepali:  mk(`nep${id}`,'नेपाली साहित्य',3),
    english: mk(`eng${id}`,'English Literature',3),
    sanskrit:mk(`san${id}`,'संस्कृत साहित्य',3),
    vyakaran:mk(`vya${id}`,'व्याकरण',2),
    jyotish: mk(`jyo${id}`,'ज्योतिष शास्त्र',2),
  }});
  return {
    years:[yr(1,'प्रथमः खण्डः','','o'),yr(2,'द्वितीयः खण्डः','','g'),
           yr(3,'तृतीयः खण्डः','','b'),yr(4,'चतुर्थः खण्डः','','p')],
    news:[]
  };
}

/* ════════════════════════════════════
   THEME  ← KEY FIX
   ════════════════════════════════════ */
function applyTheme(t, save=true) {
  t = 'white'; save = false;   // एउटै सेतो थिम — बदल्न मिल्दैन
  if (save) {   // प्रयोगकर्ताले थीम बदल्दा मात्र नरम रङ-परिवर्तन (सधैं होइन)
    const root = document.documentElement;
    root.classList.add('theme-switching');
    clearTimeout(applyTheme._t);
    applyTheme._t = setTimeout(() => root.classList.remove('theme-switching'), 650);
  }
  App.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  document.body.setAttribute('data-theme', t);
  const isDark = (t === 'dark');
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  if (save) localStorage.setItem('sp_theme', t);

  // Sync theme dots in 3-dots menu
  document.querySelectorAll('.theme-dot').forEach(d =>
    d.classList.toggle('active', d.dataset.theme === t)
  );

  // Sync 3-dots dark toggle
  const menuTog = document.getElementById('darkMenuTog');
  if (menuTog) menuTog.classList.toggle('on', isDark);

  // Sync SETTINGS PAGE dark toggle (FIX 4)
  const profTog = document.getElementById('profileDarkTog');
  if (profTog) {
    profTog.classList.toggle('on', isDark);
    profTog.onclick = () => applyTheme(isDark ? 'light' : 'dark');
  }

  // Redraw canvas background
  if (window._bgCanvas) drawBg();
}

function applyFontSize(sz, save=true) {
  sz = 14;   // अक्षर आकार १४px मा लक — बढाउन/घटाउन मिल्दैन
  save = false;
  App.fontSize = sz;
  document.documentElement.style.fontSize = sz + 'px';
  if (save) localStorage.setItem('sp_fontsize', sz);
  const lbl = document.getElementById('fontSizeLbl');
  if (lbl) {
    lbl.textContent = sz + 'px';
    lbl.classList.remove('fontsize-pulse');
    void lbl.offsetWidth; // reflow — ताकि pulse फेरि सुरुदेखि चल्छ
    lbl.classList.add('fontsize-pulse');
  }
  const sl = document.getElementById('fontSizeSlider');
  if (sl) sl.value = sz;
  const profLbl = document.getElementById('profFontLbl');
  if (profLbl) profLbl.textContent = sz + 'px';
  const profSl = document.getElementById('profFontSlider');
  if (profSl) profSl.value = sz;
}

/* ════════════════════════════════════
   FONT SYSTEM — Noto Serif Devanagari मात्र
   ════════════════════════════════════ */
function applyFont() {
  // नेपाली/देवनागरी टेक्स्ट Siddhanta मा, अङ्ग्रेजी टेक्स्ट Chakra Petch मा — auto per-character
  document.documentElement.style.setProperty('--font', "'Siddhanta', 'Chakra Petch', 'Noto Serif Devanagari', serif");
  document.documentElement.style.setProperty('--font-s', "'Siddhanta', 'Chakra Petch', 'Noto Serif Devanagari', serif");
}
window.applyFont = applyFont;

/* ════════════════════════════════════
   ANIMATED CANVAS BACKGROUND
   ════════════════════════════════════ */
/* पृष्ठभूमि अब CSS (body::before/after) को स्थिर gradient हो — JS animation/canvas छैन, त्यसैले frame drop हुँदैन */
function initBackgroundCanvas() {}
function drawBg() {}

/* ════════════════════════════════════
   CLOCK
   ════════════════════════════════════ */
function startClock() { tick(); setInterval(tick, 1000); }
function tick() {
  const now = new Date();
  const te = document.getElementById('dtTime');
  const de = document.getElementById('dtDate');
  const be = document.getElementById('dtBS');

  // FIX 7a: 12-hour format with AM/PM in Nepali
  if (te) {
    let h = now.getHours();
    const ampm = h >= 12 ? 'बेलुका' : 'बिहान';
    h = h % 12 || 12; // convert 0 → 12
    te.textContent = p(h) + ':' + p(now.getMinutes()) + ':' + p(now.getSeconds()) + ' ' + ampm;
  }

  if (de) {
    const days = ['आइत','सोम','मङ्गल','बुध','बिही','शुक्र','शनि'];
    const mons = ['जनवरी','फेब्रुअरी','मार्च','अप्रिल','मई','जुन','जुलाई','अगस्ट','सेप्टेम्बर','अक्टोबर','नोभेम्बर','डिसेम्बर'];
    de.textContent = days[now.getDay()] + ', ' + now.getDate() + ' ' + mons[now.getMonth()];
  }
  if (be) be.textContent = adToBs(now);
}
function p(n) { return String(n).padStart(2,'0'); }

// FIX 7b: Correct BS month — proper lookup table
// Maps Gregorian month start (approx) → BS month that begins
function adToBs(d) {
  const m = d.getMonth() + 1; // 1-based
  const day = d.getDate();
  const adY = d.getFullYear();

  // Approximate BS year
  let bsY = adY + 56;
  if (m < 4 || (m === 4 && day < 14)) bsY = adY + 56;
  else bsY = adY + 57;

  // Correct month mapping:
  // Baisakh (बैशाख) starts mid-April (month 4, ~day 14)
  // Each BS month starts ~mid Gregorian month
  const bsMonths = ['बैशाख','जेठ','असार','श्रावण','भाद्र','आश्विन','कार्तिक','मंसिर','पुष','माघ','फागुन','चैत्र'];
  // Approximate cutoff dates for each BS month start (Gregorian month, approx day)
  const cuts = [
    [4,14],[5,15],[6,15],[7,16],[8,17],[9,17],
    [10,18],[11,17],[12,16],[1,15],[2,13],[3,14]
  ];
  let bsMIdx = 0;
  for (let i = 0; i < cuts.length; i++) {
    const [cm, cd] = cuts[i];
    // Handle year wrap for Jan/Feb/Mar (month < 4)
    const gm = cm;
    if (m === gm && day >= cd) { bsMIdx = i; }
    else if (m > gm && (gm >= 4)) { bsMIdx = i; }
    else if (gm < 4 && m >= gm && !(m === gm && day < cd)) { bsMIdx = i; }
  }
  // Simpler correct approach:
  const simpleMap = {1:'माघ',2:'फागुन',3:'चैत्र',4:'बैशाख',5:'जेठ',6:'असार',7:'श्रावण',8:'भाद्र',9:'आश्विन',10:'कार्तिक',11:'मंसिर',12:'पुष'};
  // Adjust: if mid-month or later, shift to next BS month
  const midShift = {
    1:'माघ',2:'फागुन',3:(day>=14?'बैशाख':'चैत्र'),4:(day>=14?'बैशाख':'चैत्र'),
    5:(day>=15?'जेठ':'बैशाख'),6:(day>=15?'असार':'जेठ'),
    7:(day>=16?'श्रावण':'असार'),8:(day>=17?'भाद्र':'श्रावण'),
    9:(day>=17?'आश्विन':'भाद्र'),10:(day>=18?'कार्तिक':'आश्विन'),
    11:(day>=17?'मंसिर':'कार्तिक'),12:(day>=16?'पुष':'मंसिर')
  };
  const bsMonth = midShift[m] || simpleMap[m] || 'बैशाख';
  return toN(bsY) + ' ' + bsMonth;
}
function toN(n){ return String(n).replace(/[0-9]/g,d=>'०१२३४५६७८९'[d]); }

/* ════════════════════════════════════
   3-DOTS MENU
   ════════════════════════════════════ */
/* थिम विकल्प: छुँदा खुल्ने, फेरि छुँदा बन्द हुने */
function setThemeOpts(open) {
  const box = document.getElementById('themeOpts'), row = document.getElementById('themeToggleRow');
  if (!box || !row) return;
  box.classList.toggle('open', !!open);
  row.classList.toggle('open', !!open);
  row.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function toggleThemeOpts() { setThemeOpts(!document.getElementById('themeOpts')?.classList.contains('open')); }
window.toggleThemeOpts = toggleThemeOpts;
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.id === 'themeToggleRow') { e.preventDefault(); toggleThemeOpts(); }
});

function initDotsMenu() {
  const btn = document.getElementById('dotsBtn');
  const menu = document.getElementById('dotsMenu');
  if (!btn||!menu) return;

  /* मेनु खुल्दा ⋮ को ठाउँमा ✕ देखिने; ✕ छुँदा मेनु बन्द भई होममा फर्किने */
  new MutationObserver(() => { const o = menu.classList.contains('open'); btn.classList.toggle('x-on', o); document.querySelector('.np-scene')?.classList.toggle('menu-open', o); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); })
    .observe(menu, { attributes: true, attributeFilter: ['class'] });
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.classList.contains('open')) { menu.classList.remove('open'); go('home'); return; }
    menu.classList.toggle('open');
    if (menu.classList.contains('open')) setThemeOpts(false);      // हरेक पटक मेनु खुल्दा थिम बन्द अवस्थामा
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.dots-menu-wrap')) menu.classList.remove('open');
  });

  // Build theme dots
  const dotsWrap = document.getElementById('themeDots');
  if (dotsWrap) {
    dotsWrap.innerHTML = THEMES.map(th => `
      <div class="theme-dot ${th.dot} ${App.theme===th.id?'active':''}"
           data-theme="${th.id}" title="${th.label}"
           onclick="applyTheme('${th.id}')">
        ${App.theme===th.id?'✓':''}
      </div>`).join('');
  }

  // Dark toggle in menu
  const darkTog = document.getElementById('darkMenuTog');
  if (darkTog) {
    darkTog.classList.toggle('on', App.theme==='dark');
    darkTog.addEventListener('click', () => applyTheme(App.theme==='dark'?'light':'dark'));
  }

  // Font slider
  const sl = document.getElementById('fontSizeSlider');
  const lb = document.getElementById('fontSizeLbl');
  if (sl) {
    sl.value = App.fontSize;
    sl.addEventListener('input', () => {
      applyFontSize(+sl.value);
      if (lb) lb.textContent = sl.value+'px';
    });
  }

  // Share
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) shareBtn.addEventListener('click', () => {
    if (navigator.share) navigator.share({ title:'शास्त्री पोर्टल', url:location.href });
    else { navigator.clipboard.writeText(location.href); toast('Link copied! ✓'); }
    menu.classList.remove('open');
  });
}

/* ════════════════════════════════════
   HEADER LOGO — खोल्दा एक पटक मात्र animation
   (एप पूर्ण close भई फेरि खोलेपछि मात्र फेरि देखिने,
    किनकि sessionStorage ट्याब/एप बन्द हुँदा आफै हराउँछ)
   ════════════════════════════════════ */
function initLogoAnimation() {
  const ico  = document.getElementById('logoIco');
  const text = document.getElementById('logoText');
  if (!ico || !text) return;

  const already = sessionStorage.getItem('sp_logo_anim_played');
  if (already) return; // यो session मा पहिले नै देखिसक्यो

  ico.classList.add('la-play');
  text.classList.add('la-play');
  sessionStorage.setItem('sp_logo_anim_played', '1');

  const clean = () => { ico.classList.remove('la-play'); text.classList.remove('la-play'); };
  text.addEventListener('animationend', clean, { once: true });
  // fallback यदि animationend नआए पनि
  setTimeout(clean, 1500);
}

/* ════════════════════════════════════
   APP VERSION / UPDATE
   ════════════════════════════════════ */
function initAppInfo() {
  const vLbl = document.getElementById('appVersionLbl');
  const dLbl = document.getElementById('appUpdateDateLbl');
  if (vLbl) vLbl.textContent = APP_VERSION;
  if (dLbl) dLbl.textContent = formatUpdateDate(APP_BUILD_DATE);
  // वास्तविक चलिरहेको cache (Service Worker) को भर्जन नम्बर र अपडेट मिति — जस्तै: shastri-app-v171-20261027 → v171 · २७ अक्टोबर २०२६
  if (window.caches && caches.keys) {
    caches.keys().then(keys => {
      const hits = keys.map(k => /^shastri-app-v(\d+)(?:-(\d{4})(\d{2})(\d{2}))?$/.exec(k)).filter(Boolean)
        .sort((a, b) => +b[1] - +a[1]);
      if (!hits.length) return;
      const m = hits[0];
      if (vLbl) vLbl.textContent = 'v' + m[1];
      if (dLbl && m[2]) dLbl.textContent = formatUpdateDate(`${m[2]}-${m[3]}-${m[4]}`);
    }).catch(() => {});
  }
}

function formatUpdateDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const monthsNe = ['जनवरी','फेब्रुअरी','मार्च','अप्रिल','मे','जुन','जुलाई','अगस्ट','सेप्टेम्बर','अक्टोबर','नोभेम्बर','डिसेम्बर'];
  const monthsEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (App.lang === 'en') return `${monthsEn[m-1]} ${d}, ${y}`;
  // ne / sa दुवैमा नेपाली अंकसहित मिति
  return `${toN(d)} ${monthsNe[m-1]} ${toN(y)}`;
}

async function updateApp() {
  toast('अपडेट खोजिँदैछ… ⏳');
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) { try { await reg.update(); } catch {} }
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    toast('✓ नयाँ भर्जन लोड हुँदैछ…');
    setTimeout(() => location.reload(), 500);
  } catch {
    toast('अपडेट जाँच गर्न सकिएन, फेरि प्रयास गर्नुस्');
  }
}
window.updateApp = updateApp;

/* ════════════════════════════════════
   LANGUAGE — नेपाली / संस्कृत / English
   ════════════════════════════════════ */
const LANGS = [
  { id:'ne', label:'नेपाली'  },
  { id:'sa', label:'संस्कृत' },
  { id:'en', label:'English' },
];

const I18N = {
  ne: {
    app_name:'शास्त्री पोर्टल', search:'खोज्नुस्', more_options:'थप विकल्प',
    dm_theme:'Theme छान्नुस्', dm_dark_mode:'रात्रि मोड', dm_dark_sub:'Midnight Dark theme',
    dm_fontsize:'अक्षर आकार', dm_language:'भाषा छान्नुस्', dm_share:'Website Share गर्नुस्',
    my_notes:'मेरा नोटहरू', dm_settings_profile:'सेटिङ र Profile', backup_export:'Backup Export',
    dm_offline:'अफलाइन', dm_offline_save:'अफलाइनको लागि Save गर्नुस्', dm_offline_save_sub:'सबै अध्याय फोनमै राख्नुस्',
    dm_offline_delete:'अफलाइन डाटा हटाउनुस्', dm_app_info:'एप जानकारी', dm_update:'एप अपडेट गर्नुस्',
    dm_version:'भर्जन', dm_theme:'थिम', dm_theme_sub:'बोर्डर र रङ छान्नुस्', dm_follow:'हामीलाई फलो गर्नुस्',
    search_ph:'किताब वा विषय खोज्नुस्…', years:'वर्षहरू',
    edit:'सम्पादन', contact_social:'सम्पर्क / Social', stats:'तथ्याङ्क', settings:'सेटिङहरू',
    display:'प्रदर्शन', data:'Data', json_download:'JSON download', backup_import:'Backup Import',
    json_restore:'JSON restore', reading_history:'पढ्ने इतिहास', clear:'सफा',
    creator:'निर्माता', contributors:'सहयोगी', nav_home:'होम', nav_notes:'नोट', nav_settings:'सेटिङ',
    close:'बन्द गर्नुस्', new_note:'नयाँ नोट', note_title:'शीर्षक *', note_title_ph:'नोटको शीर्षक…',
    note_content:'सामग्री *', note_content_ph:'यहाँ लेख्नुस्…', note_subject:'विषय (ऐच्छिक)',
    cancel:'रद्द', save:'सुरक्षित', edit_profile:'👤 Profile सम्पादन', profile_photo:'प्रोफाइल फोटो',
    choose_photo:'📷 फोटो छान्नुस्', remove:'हटाउनुस्', name:'नाम *', role:'भूमिका / पद',
    contact_social_full:'🔗 सम्पर्क / Social Links', save_settings:'सुरक्षित गर्नुस्',
  },
  sa: {
    app_name:'शास्त्रीपोर्टलः', search:'अन्वेषणम्', more_options:'अधिकविकल्पाः',
    dm_theme:'रूपं चिनोतु', dm_dark_mode:'रात्रिविधा', dm_dark_sub:'Midnight Dark theme',
    dm_fontsize:'अक्षरमानम्', dm_language:'भाषां चिनोतु', dm_share:'वेबसाइट-अंशनम्',
    my_notes:'मम टिप्पण्यः', dm_settings_profile:'सेटिंग् / परिचयः', backup_export:'बैकअप-निर्यातः',
    dm_offline:'ऑफलाइन', dm_offline_save:'ऑफलाइनार्थं रक्षतु', dm_offline_save_sub:'सर्वे पाठाः दूरभाषे स्थाप्यन्ताम्',
    dm_offline_delete:'ऑफलाइन-दत्तांशं निष्कासयतु', dm_app_info:'अनुप्रयोग-सूचना', dm_update:'अनुप्रयोगं अद्यतनं करोतु',
    dm_version:'संस्करणम्', dm_theme:'वर्णविन्यासः', dm_theme_sub:'सीमा-वर्णं चिनुत', dm_follow:'अस्मान् अनुसरतु',
    search_ph:'पुस्तकं विषयं वा अन्विष्यताम्…', years:'वर्षाणि',
    edit:'सम्पादनम्', contact_social:'सम्पर्कः / Social', stats:'तथ्याङ्काः', settings:'सेटिंग्स्',
    display:'प्रदर्शनम्', data:'दत्तांशः', json_download:'JSON अवाहनम्', backup_import:'बैकअप-आयातः',
    json_restore:'JSON पुनःस्थापनम्', reading_history:'पठन-इतिहासः', clear:'शोधयतु',
    creator:'निर्माता', contributors:'सहयोगिनः', nav_home:'गृहम्', nav_notes:'टिप्पणी', nav_settings:'सेटिंग्',
    close:'पिधीयताम्', new_note:'नूतना टिप्पणी', note_title:'शीर्षकम् *', note_title_ph:'टिप्पणी-शीर्षकम्…',
    note_content:'सामग्री *', note_content_ph:'अत्र लिखतु…', note_subject:'विषयः (ऐच्छिकः)',
    cancel:'रद्दम्', save:'सुरक्षितम्', edit_profile:'👤 परिचय-सम्पादनम्', profile_photo:'परिचय-चित्रम्',
    choose_photo:'📷 चित्रं चिनोतु', remove:'निष्कासयतु', name:'नाम *', role:'पदम्',
    contact_social_full:'🔗 सम्पर्कः / Social Links', save_settings:'सुरक्षितं करोतु',
  },
  en: {
    app_name:'Shastri Portal', search:'Search', more_options:'More options',
    dm_theme:'Choose Theme', dm_dark_mode:'Night Mode', dm_dark_sub:'Midnight Dark theme',
    dm_fontsize:'Font Size', dm_language:'Choose Language', dm_share:'Share Website',
    my_notes:'My Notes', dm_settings_profile:'Settings & Profile', backup_export:'Backup Export',
    dm_offline:'Offline', dm_offline_save:'Save for Offline', dm_offline_save_sub:'Keep all chapters on your phone',
    dm_offline_delete:'Delete Offline Data', dm_app_info:'App Info', dm_update:'Update App',
    dm_version:'Version', dm_theme:'Theme', dm_theme_sub:'Choose border & colors', dm_follow:'Follow Us',
    search_ph:'Search books or subjects…', years:'Years',
    edit:'Edit', contact_social:'Contact / Social', stats:'Stats', settings:'Settings',
    display:'Display', data:'Data', json_download:'JSON download', backup_import:'Backup Import',
    json_restore:'JSON restore', reading_history:'Reading History', clear:'Clear',
    creator:'Creator', contributors:'Contributors', nav_home:'Home', nav_notes:'Notes', nav_settings:'Settings',
    close:'Close', new_note:'New Note', note_title:'Title *', note_title_ph:'Note title…',
    note_content:'Content *', note_content_ph:'Write here…', note_subject:'Subject (optional)',
    cancel:'Cancel', save:'Save', edit_profile:'👤 Edit Profile', profile_photo:'Profile Photo',
    choose_photo:'📷 Choose Photo', remove:'Remove', name:'Name *', role:'Role / Position',
    contact_social_full:'🔗 Contact / Social Links', save_settings:'Save Settings',
  },
};

function initLanguage() {
  const wrap = document.getElementById('langChips');
  if (!wrap) return;
  wrap.innerHTML = LANGS.map(l => `
    <div class="lang-chip ${App.lang===l.id?'active':''}" data-lang="${l.id}" onclick="applyLanguage('${l.id}')">
      ${l.label}
    </div>`).join('');
}

function applyLanguage(lang) {
  if (!I18N[lang]) lang = 'ne';
  App.lang = lang;
  localStorage.setItem('sp_lang', lang);
  document.documentElement.lang = (lang === 'en') ? 'en' : (lang === 'sa' ? 'sa' : 'ne');

  const dict = I18N[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] != null) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key] != null) el.setAttribute('placeholder', dict[key]);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (dict[key] != null) el.setAttribute('title', dict[key]);
  });

  // Highlight active chip
  document.querySelectorAll('.lang-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.lang === lang)
  );

  // App-info date भाषा अनुसार पुनः देखाउने
  const dLbl = document.getElementById('appUpdateDateLbl');
  if (dLbl) dLbl.textContent = formatUpdateDate(APP_BUILD_DATE);
}
window.applyLanguage = applyLanguage;

/* ════════════════════════════════════
   NAVIGATION
   ════════════════════════════════════ */
function initNav() {
  document.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', e => {
      e.preventDefault();
      if (navigator.vibrate) navigator.vibrate(12); // हलुका haptic feedback
      if (el.id === 'navSearchBtn') {
        toggleSearchBar();
        return;
      }
      go(el.dataset.page);
    })
  );
}

/* सुरुमा देखिने, तल स्क्रोल गर्दा लुक्ने, माथि स्क्रोल गर्दा फेरि देखिने */
function initNavScrollHide() {
  const nav = document.getElementById('botNav');
  if (!nav) return;
  let lastY = window.scrollY, ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = Math.max(0, window.scrollY);
      if (y > lastY + 4 && y > 60) nav.classList.add('nav-hidden');
      else if (y < lastY - 4 || y < 60) nav.classList.remove('nav-hidden');
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
}

function go(page, data={}, fromHistory=false) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('on'));
  const pg = document.getElementById('p-'+page);
  if (pg) { pg.classList.add('on'); App.page = page; }
  // वर्ष/किताब हेर्ने पेजहरू (year, subject) सिधै bottom-nav को कुनै ट्याबसँग मिल्दैनन् —
  // यी सबै "होम" खण्डकै भाग मानेर pill लाई त्यहीँ राख्ने (नत्र pill stale/गलत ठाउँमा रहन्छ)
  const navPage = ['year', 'subject'].includes(page) ? 'home' : page;
  const nav = document.querySelector(`.nav-item[data-page="${navPage}"]`);
  if (nav) {
    nav.classList.add('on');
  }

  if (page==='year'&&data.yearId)       { App.yearId=data.yearId; renderYearPage(data.yearId); }
  else if (page==='subject'&&data.subjectId) { App.subjectId=data.subjectId; App.yearId=data.yearId; renderSubjectPage(data.subjectId,data.yearId); }
  else if (page==='bookmarks') renderBookmarksPage();
  else if (page==='profile') renderProfile();
  else if (page==='news') renderNewsListPage();
  if (page !== 'home') {
    document.getElementById('searchWrap')?.classList.remove('open');
    document.getElementById('sDrop')?.classList.remove('open');
  }
  window.scrollTo(0,0);
  saveLastLocation();
  if (typeof window._updateChProgress === 'function') window._updateChProgress();

  // ── Browser/स्वाइप Back Button Fix ──
  // पेज बदलिँदा history मा नयाँ entry थपिन्छ, ताकि back गर्दा
  // सिधै website बन्द नभई अघिल्लो पेजमा फर्कियोस्।
  if (!fromHistory) {
    history.pushState({ page, data }, '', '#' + page);
  }
}
window.go = go;

/* ════════════════════════════════════
   रिफ्रेस भए पनि जहाँ पढ्दै थियो त्यहीं फर्कने
   ════════════════════════════════════ */
function saveLastLocation() {
  try {
    let chapterIdx = null;
    const openItem = document.querySelector('.chapter-item.open');
    if (openItem && openItem.id) {
      const parts = openItem.id.split('-'); // chi-{bookId}-{idx}
      chapterIdx = parseInt(parts[parts.length - 1], 10);
    }
    const loc = { page: App.page, yearId: App.yearId, subjectId: App.subjectId, chapterIdx };
    localStorage.setItem('sp_last_loc', JSON.stringify(loc));
  } catch (e) { /* ignore */ }
}
window.saveLastLocation = saveLastLocation;

async function restoreLastLocation() {
  try {
    const raw = localStorage.getItem('sp_last_loc');
    if (!raw) return;
    const loc = JSON.parse(raw);
    if (!loc || !loc.page || loc.page === 'home') return; // home अगाडि नै देखिन्छ

    if (loc.page === 'year' && loc.yearId) {
      go('year', { yearId: loc.yearId });
    } else if (loc.page === 'subject' && loc.subjectId && loc.yearId) {
      // पहिले वर्ष र सही विषय-ट्याबको history state पनि बनाउने, ताकि पछि back
      // गर्दा एकैचोटि home मा नफर्किई, अध्याय → किताब → विषय-ट्याब → वर्ष क्रमैसँग फर्कियोस्
      const bookLoc = findBookLocation(loc.subjectId);
      go('year', { yearId: loc.yearId });
      if (bookLoc && bookLoc.subjectKey) setYearSubjectTab(loc.yearId, bookLoc.subjectKey);
      go('subject', { subjectId: loc.subjectId, yearId: loc.yearId });
      if (typeof loc.chapterIdx === 'number' && loc.chapterIdx >= 0) {
        // अध्याय load हुन थोरै पर्खने
        for (let i = 0; i < 20; i++) {
          if (App.chaptersCache[loc.subjectId]) break;
          await new Promise(r => setTimeout(r, 150));
        }
        const el = document.getElementById(`chi-${loc.subjectId}-${loc.chapterIdx}`);
        if (el) {
          toggleCh(loc.subjectId, loc.chapterIdx);
          setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
        }
      }
    } else if (['profile', 'news', 'bookmarks'].includes(loc.page)) {
      go(loc.page);
    }
  } catch (e) { console.warn('अघिल्लो स्थान फर्काउन सकिएन:', e); }
}
window.restoreLastLocation = restoreLastLocation;

/* ════════════════════════════════════
   BACK BUTTON / SWIPE — HISTORY HANDLING
   ════════════════════════════════════ */
let App_navigatingFromPopstate = false;
let App_closingModalId = null; // closeOv() ले नै history.back() ल्याएको हो भने त्यो modal को id यहाँ राखिन्छ

function initHistoryNav() {
  // सुरुमा 'home' लाई आधार history entry को रूपमा राख्ने
  history.replaceState({ page: 'home', data: {} }, '', '#home');

  window.addEventListener('popstate', (e) => {
    App_navigatingFromPopstate = true;

    if (App_closingModalId) {
      // यो popstate हाम्रै closeOv() कलले नै ल्याएको हो — त्यो एउटा modal
      // (जस्तै रंग छान्ने box) माथि नै सिधै बन्द भइसकेको छ, त्यसैले तलको
      // parent modal (जस्तै अध्याय/किताब/सूचना form) लाई नछोई यहीँ रोक्ने
      App_closingModalId = null;
    } else {
      // भौतिक/gesture back button ले नै ल्याएको हो — सबै खुला overlay/menu बन्द गर्ने
      document.querySelectorAll('.overlay.open').forEach(el => el.classList.remove('open'));
      document.getElementById('dotsMenu')?.classList.remove('open');
      document.getElementById('sDrop')?.classList.remove('open');
      document.getElementById('searchWrap')?.classList.remove('open');

      const st = e.state;
      if (st && st.chOpen) {
        // forward फेरि यही राज्यमा आइपुग्दा (rare), त्यही अध्याय खोल्ने
        document.querySelectorAll('.chapter-item.open').forEach(el => el.classList.remove('open'));
        const item = document.getElementById(`chi-${st.chOpen.bookId}-${st.chOpen.idx}`);
        if (item) item.classList.add('open');
      } else if (st && st.subTab) {
        // अध्याय/किताब पेजले वर्ष-पेजको DOM नै हटाइसकेको हुनसक्छ — त्यसैले पहिले वर्ष-पेज पुनः बनाउने, अनि सही ट्याब देखाउने
        go('year', { yearId: st.subTab.yearId }, true);
        setYearSubjectTab(st.subTab.yearId, st.subTab.key, true);
      } else if (st && st.page) {
        document.querySelectorAll('.chapter-item.open').forEach(el => el.classList.remove('open'));
        go(st.page, st.data || {}, true);
      } else if (!(st && st.modal)) {
        go('home', {}, true);
      }
    }

    App_navigatingFromPopstate = false;
  });
}

/* ════════════════════════════════════
   HOME
   ════════════════════════════════════ */
/* ════════════════════════════════════
   वर्षको शीर्षकमा "Ananda Devanagari Round" फन्ट
   यो पुरानो (Preeti ढाँचाको) फन्ट हो — Unicode अक्षर सिधै देखाउँदैन, त्यसैले यहाँ तयार शब्दहरूको मात्र
   बराबरी (key) दिइएको छ। सूचीमा नभएको शब्द भए सामान्य फन्टमै देखिन्छ (केही बिग्रँदैन)।
   फन्ट लोड हुनुअघि र लोड नभए Unicode पाठ देखिन्छ (html.an-ready आएपछि मात्र फन्ट देखिन्छ)।
   ════════════════════════════════════ */
const ANANDA_MAP = { 'प्रथम': 'k|yd', 'द्वितीय': 'låtLo', 'तृतीय': 't[tLo', 'चतुर्थ': "rt'y{", 'वर्ष': 'jif{',
  'प्रथमः': 'k|ydM', 'द्वितीयः': 'låtLoM', 'तृतीयः': 't[tLoM', 'चतुर्थः': "rt'y{M", 'खण्डः': 'v08M' };   // ष को पूरा रूप: i (आधा) + f
function anandaHtml(text) {
  const words = String(text == null ? '' : text).trim().split(/\s+/);
  if (!words[0] || !words.every(w => ANANDA_MAP[w])) return text;
  return `<span class="an-uni">${text}</span><span class="an-leg" aria-hidden="true">${words.map(w => ANANDA_MAP[w]).join(' ')}</span>`;
}

function renderHome() {
  if (!App.data) return;
  const grid = document.getElementById('yearsGrid');
  if (!grid) return;
  const yClr = ['o','g','b','p'];
  grid.innerHTML = App.data.years.map((yr,i) => {
    const total = Object.values(yr.subjects).reduce((a,b)=>a+b.length,0);
    return `
    <a class="year-card s${i+1}" onclick="go('year',{yearId:${yr.id}});return false;" href="#">
      <div class="yc-bg yc-${yClr[i]||'o'}"></div>
      <div class="yc-shine"></div><div class="yc-glare"></div>
      <div class="yc-blob yc-blob-1"></div><div class="yc-blob yc-blob-2"></div>
      <div class="yc-body">
        <div class="yc-title">${anandaHtml(yr.title)}</div>
        ${yr.subtitle ? `<div class="yc-sub">${yr.subtitle}</div>` : ''}
        <div class="yc-badges">
          <span class="yc-badge">📚 ${total}</span>
          <span class="yc-badge">🕉️ संस्कृत</span>
          <span class="yc-badge">⭐ ज्योतिष</span>
        </div>
      </div>
      <div class="yc-arrow">›</div>
    </a>`;
  }).join('');
  renderNewsCards();
}

/* ════════════════════════════════════
   सहयोगी (Contributors) — data/contributors.js बाट
   ════════════════════════════════════ */
function renderContributors() {
  const el = document.getElementById('contribList');
  if (!el) return;
  const list = App.contributors || [];
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = list.map(c => {
    const name = typeof c === 'string' ? c : (c.name || '');
    const role = (typeof c === 'object' && c.role) ? `<div class="contrib-role">${c.role}</div>` : '';
    return `<div class="contrib-item">${name}${role}</div>`;
  }).join('');
}

/* ════════════════════════════════════
   NEWS BOARD (chalkboard photo माथि समाचार) — data/news.js बाट
   ════════════════════════════════════ */
function renderNewsCards() {
  const el = document.getElementById('newsBoardTitle');
  if (!el || !App.data?.news?.length) return;
  renderNewsBoardDots();
  setNews(0);
}

function renderNewsBoardDots() {
  const dots = document.getElementById('newsBoardDots');
  if (!dots || !App.data?.news?.length) return;
  dots.innerHTML = App.data.news.map((_,i)=>
    `<div class="nb-dot${i===App.newsIdx?' on':''}" onclick="manualSetNews(${i})"></div>`
  ).join('');
}

let newsTimer = null;
function startNewsTimer() {
  if (newsTimer) clearInterval(newsTimer);
  newsTimer = setInterval(() => {
    if (App.data?.news?.length) setNews((App.newsIdx+1)%App.data.news.length);
  }, 4500);
}
function initNews() {
  startNewsTimer();

  // Manual स्वाइप — औंलाले तानेर अर्को/अघिल्लो समाचार
  const board = document.getElementById('newsBoard');
  if (!board) return;
  let sx = 0, sy = 0;
  board.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  board.addEventListener('touchend', e => {
    const dx = sx - e.changedTouches[0].clientX;
    const dy = sy - e.changedTouches[0].clientY;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) && App.data?.news?.length) {
      const t = App.data.news.length;
      manualSetNews(dx > 0 ? (App.newsIdx+1)%t : (App.newsIdx-1+t)%t);
    }
  }, { passive: true });
}

// Manual navigation (dot/swipe) — auto-timer लाई पनि रिसेट गर्छ
function manualSetNews(idx) {
  setNews(idx);
  startNewsTimer();
}
window.manualSetNews = manualSetNews;

function setNews(idx) {
  if (!App.data?.news?.length) return;
  App.newsIdx = idx;
  const n = App.data.news[idx];
  const elT = document.getElementById('newsBoardTitle');
  const elD = document.getElementById('newsBoardDesc');
  const elDt = document.getElementById('newsBoardDate');
  if (!elT || !n) return;
  [elT, elD, elDt].forEach(e => { if (e) e.style.opacity = '0'; });
  setTimeout(() => {
    elT.textContent = n.title;
    if (elD) {
      elD.innerHTML = typeof renderMd === 'function' ? renderMd(n.content || '') : (n.content || '');
      elD.style.fontFamily = (n.font && typeof fontCssFor==='function') ? fontCssFor(n.font) : '';
    }
    if (elDt) elDt.textContent = n.date ? `मिति :- ${n.date}` : '';
    [elT, elD, elDt].forEach(e => { if (e) e.style.opacity = '1'; });
  }, 220);
  document.querySelectorAll('.nb-dot').forEach((d,i)=>d.classList.toggle('on', i===idx));
}
window.setNews = setNews;

function openNews(id) {
  const n = App.data?.news?.find(x=>x.id===id);
  if (!n) return;
  document.getElementById('newsMTitle').textContent = n.title;
  document.getElementById('newsMDate').textContent  = n.date;
  const bodyEl = document.getElementById('newsMBody');
  bodyEl.innerHTML = renderMd(n.content || '');
  bodyEl.style.fontFamily = (n.font && typeof fontCssFor==='function') ? fontCssFor(n.font) : '';
  const img = document.getElementById('newsMImg');
  if (img) { img.src = n.image||''; img.style.display = n.image?'block':'none'; }
  openOv('newsModal');
}
window.openNews = openNews;

/* समाचार बोर्ड (chalkboard) मा तापेको बित्तिकै हाल देखिँदै गरेको समाचार पूरै खोल्ने */
function openNewsCurrent() {
  const n = App.data?.news?.[App.newsIdx];
  if (!n) return;
  document.getElementById('newsMTitle').textContent = n.title;
  document.getElementById('newsMDate').textContent  = n.date || '';
  const bodyEl = document.getElementById('newsMBody');
  bodyEl.innerHTML = renderMd(n.content || '');
  bodyEl.style.fontFamily = (n.font && typeof fontCssFor==='function') ? fontCssFor(n.font) : '';
  const img = document.getElementById('newsMImg');
  if (img) { img.src = n.image||''; img.style.display = n.image?'block':'none'; }
  openOv('newsModal');
}
window.openNewsCurrent = openNewsCurrent;

/* ════════════════════════════════════
   YEAR PAGE
   ════════════════════════════════════ */
function renderYearPage(yearId) {
  const yr = App.data.years.find(y=>y.id===yearId);
  if (!yr) return;
  const yClr = ['o','g','b','p'];
  const ci = yearId-1;
  const el = document.getElementById('p-year');
  const subjEntries = orderedSubjectEntries(yr.subjects);
  const firstKey = subjEntries[0]?.[0];
  el.innerHTML = `
  <div class="content">
    <div class="subj-tabs" id="subjTabs"><span class="subj-hl" aria-hidden="true"></span>
      ${subjEntries.map(([key,books])=>{
        const s=SUBJ[key]||{label:key,short:'क',g:'#EEE,#CCC'};
        const [gc1,gc2]=s.g.split(',');
        return `
        <button class="subj-tab ${key===firstKey?'active':''}" data-key="${key}" title="${s.label}" aria-label="${s.label}" onclick="setYearSubjectTab(${yr.id},'${key}')">
          <span class="subj-tab-ico" style="background:linear-gradient(135deg,${gc1},${gc2})">${s.short}</span>
        </button>`;
      }).join('')}
    </div>

    <div class="books-list" id="yearBooksList">
      ${(yr.subjects[firstKey]||[]).map(b=>bookCardHtml(b,yr.id,firstKey)).join('') || '<div class="empty"><div class="empty-ico">📚</div><div class="empty-t">कुनै किताब छैन</div></div>'}
    </div>
  </div>`;
  setTimeout(prefetchVisibleBooks, 0);
}

/* विषय ट्याबको पछाडि सर्ने उठेको पट्टी (Neuromorphic Navbar शैली) */
function positionSubjHl() {
  const box = document.getElementById('subjTabs'); if (!box) return;
  const _h = document.querySelector('.site-header'); if (_h) document.documentElement.style.setProperty('--hdr-h', _h.offsetHeight + 'px');
  const hl = box.querySelector('.subj-hl'), at = box.querySelector('.subj-tab.active');
  if (!hl || !at || !at.offsetWidth) return;
  hl.style.width = at.offsetWidth + 'px'; hl.style.height = at.offsetHeight + 'px';
  hl.style.top = at.offsetTop + 'px';
  hl.style.transform = `translateX(${at.offsetLeft}px)`;
  if (!box.classList.contains('ready')) requestAnimationFrame(() => box.classList.add('ready'));
}
window.positionSubjHl = positionSubjHl;
window.addEventListener('resize', positionSubjHl);
document.addEventListener('DOMContentLoaded', () => {
  const py = document.getElementById('p-year');
  if (py) new MutationObserver(() => requestAnimationFrame(positionSubjHl)).observe(py, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
});
function setYearSubjectTab(yearId, key, fromHistory=false) {
  const yr = App.data.years.find(y=>y.id===yearId);
  if (!yr) return;
  document.querySelectorAll('#subjTabs .subj-tab').forEach(b=>b.classList.toggle('active', b.dataset.key===key));
  positionSubjHl();
  const _at = document.querySelector('#subjTabs .subj-tab.active');
  if (_at && _at.scrollIntoView) _at.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  const books = yr.subjects[key] || [];
  const el = document.getElementById('yearBooksList');
  if (!el) return;
  el.classList.remove('subj-anim-in');
  void el.offsetWidth; // reflow — ताकि animation फेरि सुरुदेखि चल्छ
  el.innerHTML = books.map(b=>bookCardHtml(b,yearId,key)).join('') || '<div class="empty"><div class="empty-ico">📚</div><div class="empty-t">कुनै किताब छैन</div></div>';
  el.classList.add('subj-anim-in');
  prefetchVisibleBooks();
  // विषय ट्याब बदलिँदा history मा थप्ने — ताकि back गर्दा एकैचोटि वर्षको default ट्याबमा नफर्किई यही ट्याबबाट क्रमशः फर्कियोस्
  if (!fromHistory) history.pushState({ subTab: { yearId, key } }, '');
}
window.setYearSubjectTab = setYearSubjectTab;

function getYrPct(yid) {
  const yr=App.data.years.find(y=>y.id===yid); if(!yr) return 0;
  let r=0,t=0;
  Object.values(yr.subjects).forEach(books=>books.forEach(b=>{t++;if(App.bookmarks.includes(b.id)||App.history.find(h=>h.id===b.id))r++;}));
  return t?Math.round((r/t)*100):0;
}

function bookCardHtml(b, yearId, key) {
  const s    = SUBJ[key] || { short:'क', g:'#EEE,#CCC' };
  const [c1,c2] = s.g.split(',');
  const isBm = App.bookmarks.includes(b.id);
  const bmPin = isBm ? '<span class="book-row-bm">🔖</span>' : '';

  // कभर फोटो (SVG/PNG/JPG जे पनि मिल्छ) भए त्यही देखिन्छ,
  // नभए विषयको पहिलो अक्षर (जस्तै नेपाली→ने, English→अ) letter-avatar को रूपमा देखिन्छ
  const coverHtml = b.cover
    ? `<!-- has cover photo -->
       <img
         src="${b.cover}" loading="lazy" decoding="async"
         alt="${b.title}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
       >
       <!-- fallback letter देखिने photo लोड नभए मात्र -->
       <span class="book-row-ico" style="display:none">${s.short}</span>`
    : `<!-- no cover → gradient + letter-avatar -->
       <span class="book-row-ico">${s.short}</span>`;

  return `
  <div class="book-item" data-bid="${b.id}">
   <div class="book-item-top">
    <a class="book-row" onclick="${b.id === 'pv' ? `go('subject',{subjectId:'${b.id}',yearId:${yearId}})` : `toggleBookChapters('${b.id}',${yearId},this)`};return false;" href="#">
      <div class="book-row-cover" style="background:linear-gradient(135deg,${c1},${c2})">
        ${coverHtml}
      </div>
      <div class="book-row-info">
        <span class="book-row-title">${b.title}</span><span class="book-row-sep">·</span><span class="book-row-author">${b.author}</span>
      </div>
      ${bmPin}
      <span class="book-row-chevron">›</span>
    </a>
   </div>
   <div class="book-ch-panel" hidden></div>
  </div>`;
}

/* ☰ — किताबको अध्यायहरू बाहिरै (सूचीमै) खोल्ने/बन्द गर्ने; अध्यायमा थिचे सिधै त्यही अध्याय खुल्छ */
/* अध्याय-सूची एकै पटक मात्र लोड (साझा promise) — prefetch र क्लिक दुवैले एउटै प्रयोग गर्छन् */
function loadBookChaptersOnce(bookId) {
  App.chaptersCache = App.chaptersCache || {};
  if (App.chaptersCache[bookId]) return Promise.resolve(App.chaptersCache[bookId]);
  App._chPromises = App._chPromises || {};
  if (!App._chPromises[bookId]) {
    // खाली/असफल नतिजा कहिल्यै cache नगर्ने (ढिलो नेटले ६ सेकेन्डमा abort भए "अध्याय छैन" नदेखियोस्) — null फर्काउँछ
    App._chPromises[bookId] = loadChaptersForBook(bookId).then(r => {
      delete App._chPromises[bookId];
      if (Array.isArray(r) && r.length) { App.chaptersCache[bookId] = r; try { r.forEach(_chIdx); } catch (e) {} return r; }
      return null;
    }).catch(() => { delete App._chPromises[bookId]; return null; });
  }
  return App._chPromises[bookId];
}
window.loadBookChaptersOnce = loadBookChaptersOnce;

/* सूचीमा देखिएका किताबहरूको अध्याय पहिल्यै (खाली समयमा) लोड गरिराख्ने — ताकि छुँदा लोडर नघुमोस् */
function prefetchVisibleBooks() {
  if (navigator.connection && navigator.connection.saveData) return;
  clearTimeout(App._pfT);
  App._pfT = setTimeout(() => {
    const ids = [...document.querySelectorAll('.book-item[data-bid]')].map(e => e.dataset.bid).filter(id => id && id !== 'pv' && !(App.chaptersCache && App.chaptersCache[id]));
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 150));
    let k = 0;
    const next = () => { if (k >= ids.length) return; const id = ids[k++]; loadBookChaptersOnce(id).then(() => idle(next)); };   // एक-एक गरी (नेट नदबाउन)
    idle(next);
  }, 1200);
}
window.prefetchVisibleBooks = prefetchVisibleBooks;
// छुन थाल्नेबित्तिकै (टच/माउस तल) त्यो किताबको अध्याय लोड सुरु
document.addEventListener('pointerdown', e => {
  const it = e.target.closest && e.target.closest('.book-item[data-bid]');
  if (it && it.dataset.bid !== 'pv') loadBookChaptersOnce(it.dataset.bid);
}, { passive: true });

async function toggleBookChapters(bookId, yearId, btn) {
  const item = btn.closest('.book-item'); if (!item) return;
  const panel = item.querySelector('.book-ch-panel');
  const opening = !item.classList.contains('ch-open');
  document.querySelectorAll('.book-item.ch-open').forEach(el => {          // अरू खुलेका बन्द गर्ने
    if (el !== item) { el.classList.remove('ch-open'); el.querySelector('.book-ch-panel').hidden = true; }
  });
  if (!opening) { panel.hidden = true; item.classList.remove('ch-open'); btn.setAttribute('aria-expanded', 'false'); return; }
  item.classList.add('ch-open'); btn.setAttribute('aria-expanded', 'true');
  const render = () => {
    const chs = App.chaptersCache[bookId] || [];
    panel.innerHTML = chs.length
      ? chs.map((ch, i) => `<button type="button" class="bcp-item" onclick="openBookChapter('${bookId}',${yearId},${i})"><span class="bcp-num">${toN(i + 1)}</span><span class="bcp-title">${(ch.title || ('अध्याय ' + (i + 1))).toString().replace(/<[^>]*>/g, '')}</span><span class="bcp-go">›</span></button>`).join('')
      : '<div class="bcp-empty">अध्याय छैन</div>';
    panel.hidden = false;
  };
  if (App.chaptersCache && App.chaptersCache[bookId]) { render(); return; }     // तयार छ भने तुरुन्तै, लोडर बिना
  // ढिलो मात्र भए (>०.५ सेकेन्ड) लोडर देखाउने
  const spin = setTimeout(() => {
    if (item.classList.contains('ch-open') && !App.chaptersCache[bookId]) { panel.innerHTML = '<div class="bcp-load"><div class="spinner"></div></div>'; panel.hidden = false; }
  }, 500);
  let got = await loadBookChaptersOnce(bookId);
  if (!got && item.classList.contains('ch-open')) got = await loadBookChaptersOnce(bookId);   // एकपटक फेरि प्रयास
  clearTimeout(spin);
  if (!item.classList.contains('ch-open')) return;                           // बीचमा बन्द गरिएछ भने केही नगर्ने
  render();
}
window.toggleBookChapters = toggleBookChapters;

function openBookChapter(bookId, yearId, idx) {
  App._pendingChapter = { bookId, idx };
  go('subject', { subjectId: bookId, yearId });
}
window.openBookChapter = openBookChapter;

/* ════════════════════════════════════
   SUBJECT PAGE
   ════════════════════════════════════ */
function renderSubjectPage(subjectId, yearId) {
  const yr=App.data.years.find(y=>y.id===yearId); if(!yr) return;
  let book=null,key=null;
  for(const[k,books]of Object.entries(yr.subjects)){const f=books.find(b=>b.id===subjectId);if(f){book=f;key=k;break;}}
  if(!book) return;
  addHistory(book,yr);
  const s=SUBJ[key]||{short:'क',g:'#EEE,#CCC',label:key};
  const [c1,c2]=s.g.split(',');
  const isBm=App.bookmarks.includes(book.id);

  document.getElementById('p-subject').innerHTML = `
  <div class="content">
    <div id="tab-ch" class="tab-pane on">
      <div id="chList"><div class="spin-wrap"><div class="spinner"></div></div></div>
    </div>

    <div id="tab-ov" class="tab-pane">
      <div class="info-card">
        <h3>📖 किताबको बारेमा</h3>
        <div style="${book.font && typeof fontCssFor==='function' ? `font-family:${fontCssFor(book.font)}` : ''}">${renderMd(book.description||'विवरण यहाँ राख्नुस्।')}</div>
      </div>
      <div class="info-card">
        <h3>👨‍🏫 लेखक</h3><p>${book.author}</p>
      </div>
    </div>
  </div>`;

  loadAndRenderChapters(book.id);
  renderBookNotes(book.title);
}

function setTab(btn, tabId) {
  const p=btn.closest('.content');
  p.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('on'));
  p.querySelectorAll('.tab-pane').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on');
  const pane=document.getElementById(tabId);
  if(pane) pane.classList.add('on');
}
window.setTab = setTab;

/* ════════════════════════════════════
   CHAPTERS — READ-ONLY VIEW
   Files: data/chapters/{bookId}/1.js, 2.js, 3.js …
   (JSON झन्झट हटाइयो — अब सामान्य JS फाइलमा लेख्ने,
    template literal (backtick) प्रयोग गरेकाले real Enter/
    real " " दुवै त्यसै लेख्न मिल्छ, कुनै escape चाहिँदैन)
   ════════════════════════════════════ */
/* सबैतिर प्रयोग हुने साझा helper — कुनै पनि "बोइलरप्लेटरहित" .js डाटा फाइल
   (chapters, news, contributors...) लाई fetch गरेर JS मानको रूपमा पढ्ने */
async function fetchJsData(path) {
  try {
    const r = await fetch(path, _forceFresh ? { cache: 'reload' } : undefined);
    if (!r.ok) return null;
    const text = await r.text();
    return new Function('"use strict"; return (' + text + ');')();
  } catch {
    return null;
  }
}

async function loadChapterScript(bookId, i) {
  const ch = await fetchJsData(`data/chapters/${bookId}/${i}.js`);
  return (ch && ch.title != null) ? ch : null;
}

async function loadChaptersForBook(bookId) {
  // Admin: GitHub API बाट सिधै ताजा (Pages को cache/ढिलाइ बाट बच्न)
  if (App.isAdmin && window.GH) {
    try { const f = await GH.readJson(`data/chapters/${bookId}.json`); if (Array.isArray(f)) return f; } catch (e) {}
  }
  // नयाँ ढाँचा: data/chapters/{bookId}.json
  const j = await fetchJson(`data/chapters/${bookId}.json`);
  if (Array.isArray(j)) return j;
  // पुरानो ढाँचा: data/chapters/{bookId}/1.js, 2.js ...
  const chapters = [];
  let i = 1;
  while (true) {
    const ch = await loadChapterScript(bookId, i);
    if (!ch) break;
    chapters.push(ch);
    i++;
  }
  return chapters;
}
window.loadChaptersForBook = loadChaptersForBook;

async function loadAndRenderChapters(bookId) {
  const el = document.getElementById('chList');
  if (!el) return;
  App.currentChapterBookId = bookId;
  if (!App.chaptersCache[bookId]) {
    App.chaptersCache[bookId] = await loadChaptersForBook(bookId);
  }
  renderChapterListHtml(bookId);
}

/* अध्यायको list HTML render गर्ने — cache बाटै,
   ताकि admin ले अध्याय थप्ने/सम्पादन गरेपछि तुरुन्तै (फेरि नतानिकनै) देखियोस् */
function _renderChapterListHtmlRaw(bookId) {
  const el = document.getElementById('chList');
  if (!el) return;
  const chs = App.chaptersCache[bookId] || [];

  const canAdd = App.isAdmin;
  const adminAddBar = canAdd
    ? `<div style="display:flex;justify-content:flex-end;margin-bottom:10px">
         <button class="tb-btn" onclick="adminInlineChapterAdd('${bookId}')">➕ नयाँ अध्याय</button>
       </div>`
    : '';

  if (!chs.length) {
    el.innerHTML = `
      ${adminAddBar}
      <div class="empty">
        <div class="empty-ico">📖</div>
        <div class="empty-t">अध्याय छैन</div>
        <div class="empty-s">${canAdd ? '"➕ नयाँ अध्याय" थिचेर अध्याय थप्नुस्' : 'चाँडै अध्याय थपिनेछ'}</div>
      </div>`;
    return;
  }

  el.innerHTML = `${adminAddBar}<div class="ch-list">${chs.map((ch,i)=>{
    const chBmKey = bookId+'::'+i;
    const chIsBm = App.chapterBookmarks.includes(chBmKey);
    const canEdit = App.isAdmin;
    return `
    <div class="chapter-item" id="chi-${bookId}-${i}">
      <div class="ch-head" onclick="toggleCh('${bookId}',${i})">
        <div class="ch-num">${toN(i+1)}</div>
        <div class="ch-title-txt">${ch.title||('अध्याय '+(i+1))}</div>
        <button id="chbm-${bookId}-${i}" onclick="event.stopPropagation();toggleChapterBm('${bookId}',${i})" title="Bookmark" style="background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 6px;flex-shrink:0">${chIsBm?'🔖':'🏷️'}</button>
        <button onclick="event.stopPropagation();openPrintOptions('${bookId}',${i})" title="Print" style="background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 6px;flex-shrink:0">🖨️</button>
        ${canEdit ? `<button onclick="event.stopPropagation();adminInlineChapterEdit('${bookId}',${i})" style="background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 6px;flex-shrink:0">✏️</button>` : ''}
        ${canEdit ? `<button onclick="event.stopPropagation();adminInlineChapterDelete('${bookId}',${i})" style="background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 6px;flex-shrink:0">🗑️</button>` : ''}
        <span class="ch-chevron">›</span>
      </div>
      <div class="ch-read-body">
        <div class="ch-jump" id="chj-${bookId}-${i}" onclick="event.stopPropagation()">
          <button class="neu-btn neu-btn--round" title="अघिल्लो अध्याय" ${i===0?'disabled':''} onclick="chJump('${bookId}',${i},'prev')">⏮</button>
          <button class="neu-btn" title="अघिल्लो प्रश्न / भाग" onclick="chJump('${bookId}',${i},'top')">▲</button>
          <input type="range" class="ch-zip" min="0" max="100" step="0.1" value="0" aria-label="अध्यायको कुनै पनि भागमा जानुहोस्"
            oninput="chZipTo('${bookId}',${i},this.value)" onpointerdown="this.dataset.d=1" onpointerup="this.dataset.d=''" onpointercancel="this.dataset.d=''">
          <button class="neu-btn neu-btn--round" title="भाग / शीर्षक सूची" onclick="chJump('${bookId}',${i},'menu')">☰</button>
          <button class="neu-btn" title="अर्को प्रश्न / भाग" onclick="chJump('${bookId}',${i},'end')">▼</button>
          <button class="neu-btn neu-btn--round" title="अर्को अध्याय" ${i>=chs.length-1?'disabled':''} onclick="chJump('${bookId}',${i},'next')">⏭</button>
          <div class="ch-jump-menu" hidden></div>
        </div>
        <div class="ch-read-content" lang="hi" ondblclick="if(!String(getSelection()).trim())toggleCh('${bookId}',${i})" style="${ch.font && typeof fontCssFor==='function' ? `font-family:${fontCssFor(ch.font)}` : ''}">${renderMd(ch.content||'')}</div>
      </div>
    </div>`;}).join('')}</div>`;
}
function renderChapterListHtml(bookId) {
  const prev = document.querySelector('.chapter-item.open');
  let idx = null;
  if (prev && prev.id.startsWith(`chi-${bookId}-`)) idx = parseInt(prev.id.slice(prev.id.lastIndexOf('-') + 1), 10);
  _renderChapterListHtmlRaw(bookId);
  const chs = App.chaptersCache[bookId] || [];
  if (!chs.length) return;
  let _jump = false;
  if (App._pendingChapter && App._pendingChapter.bookId === bookId) { idx = App._pendingChapter.idx; App._pendingChapter = null; _jump = true; }
  if (idx === null || isNaN(idx) || idx >= chs.length) {
    idx = 0;
    try {
      const loc = JSON.parse(localStorage.getItem('sp_last_loc') || 'null');
      if (loc && loc.subjectId === bookId && typeof loc.chapterIdx === 'number' && loc.chapterIdx >= 0 && loc.chapterIdx < chs.length) idx = loc.chapterIdx;
    } catch (e) {}
  }
  const it = document.getElementById(`chi-${bookId}-${idx}`);
  if (it) { it.classList.add('open'); window.spApplyFixes && spApplyFixes(it); }
  if (_jump && it) {
    try { saveLastLocation(); } catch (e) {}
    // अध्यायको सुरुमै पुर्‍याउने: टाँसिने हेडर (र जम्प-बार) मुनि नलुकोस्; smooth scroll र ढिलो layout ले बीचमै नरोकियोस्
    const goStart = () => {
      const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || (document.querySelector('.site-header')?.offsetHeight || 0);
      const y = it.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop || 0) - h - 6;
      window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
    };
    goStart(); requestAnimationFrame(goStart); setTimeout(goStart, 120); setTimeout(goStart, 450);
  }
  setTimeout(() => window._updateChProgress && window._updateChProgress(), 60);
  if (window.PDFV) PDFV.scan();
}
window.renderChapterListHtml = renderChapterListHtml;

function toggleCh(bookId, idx, fromHistory=false) {
  const item = document.getElementById(`chi-${bookId}-${idx}`);
  if (!item) return;
  const wasOpen = item.classList.contains('open');
  if (wasOpen) return;   // एउटा अध्याय सधैं खुला रहन्छ — अरू अध्यायमा ☰ बाट जाने
  // Close all first
  document.querySelectorAll('.chapter-item.open').forEach(el => el.classList.remove('open'));
  if (!wasOpen) {
    item.classList.add('open'); window.spApplyFixes && spApplyFixes(item);
    // अध्याय खोल्दा history मा थप्ने — ताकि back गर्दा पहिले यो बन्द होस्, अनि मात्र माथिको ट्याब/पेजमा जाओस्
    if (!fromHistory) history.pushState({ chOpen: { bookId, idx } }, '');
  }
  saveLastLocation();
  setTimeout(() => window._updateChProgress && window._updateChProgress(), 60);
}
window.toggleCh = toggleCh;

function nextCh(bookId, idx) {
  const chs = App.chaptersCache[bookId]||[];
  if (idx+1 >= chs.length) return;
  _chSwitch(bookId, idx+1);
}
window.nextCh = nextCh;

function prevCh(bookId, idx) {
  if (idx <= 0) return;
  _chSwitch(bookId, idx-1);
}
window.prevCh = prevCh;

/* अध्यायभित्र जुनसुकै भागमा जाने (zipper slider + बटन) */
function _chOff() {
  const h = document.querySelector('.site-header');
  const hh = h ? h.offsetHeight : 56;
  document.documentElement.style.setProperty('--hdr-h', hh + 'px');
  const bar = document.querySelector('.chapter-item.open .ch-jump');
  return hh + (bar ? bar.offsetHeight : 0) + 8;
}
function _chContent(bookId, idx) { return document.querySelector(`#chi-${bookId}-${idx} .ch-read-content`); }
function _chScrollTo(y, smooth) { window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' }); }
/* लामो छलाङपछि (zipper) कहिले काहीँ मोबाइल Chrome ले sticky हेडर/पट्टी गलत ठाउँमा देखाउँछ (हेडर हराएर बीचमा पट्टी तैरिने) —
   स्क्रोल रोकिएपछि एकपटक सानो instant स्क्रोल-चलाइ गरी compositor लाई sticky स्थिति फेरि गणना गर्न लगाउने */
let _chStickyT = 0;
function _chStickyFix() {
  clearTimeout(_chStickyT);
  _chStickyT = setTimeout(() => {
    const y = window.scrollY;
    if (y < 2) return;
    window.scrollTo({ top: y + 1, behavior: 'instant' });
    window.scrollTo({ top: y, behavior: 'instant' });
    const h = document.querySelector('.site-header');
    if (h) { h.style.willChange = 'transform'; requestAnimationFrame(() => { h.style.willChange = ''; }); }
  }, 140);
}
function chZipTo(bookId, idx, val) {
  const c = _chContent(bookId, idx); if (!c) return;
  _chStickyFix();
  _chRevealAll(c);
  const top = c.getBoundingClientRect().top + window.scrollY - _chOff();
  const max = Math.max(0, c.offsetHeight - window.innerHeight + _chOff());
  _chScrollTo(top + (parseFloat(val) / 100) * max, false);
}
window.chZipTo = chZipTo;
function chJump(bookId, idx, what) {
  if (what === 'prev') return prevCh(bookId, idx);
  if (what === 'next') return nextCh(bookId, idx);
  const c = _chContent(bookId, idx); if (!c) return;
  _chStickyFix();
  _chRevealAll(c);
  const r = c.getBoundingClientRect();
  if (what === 'top' || what === 'end') {
    /* '---' (<hr>) ले छुट्ट्याएको हरेक प्रश्न/भागको सुरु: ▼ अर्को भागमा, ▲ अघिल्लो भागमा */
    const off = _chOff(), y0 = window.scrollY, cur = y0 + off;
    const starts = [r.top + y0, ...[...c.querySelectorAll('hr')].map(h => h.getBoundingClientRect().bottom + y0)];
    if (what === 'end') {
      const nx = starts.find(y => y > cur + 6);
      return _chScrollTo(nx !== undefined ? nx - off : r.bottom + y0 - window.innerHeight + 40, true);
    }
    const pv = [...starts].reverse().find(y => y < cur - 6);
    return _chScrollTo((pv !== undefined ? pv : starts[0]) - off, true);
  }
  if (what === 'menu') {
    const menu = document.querySelector(`#chj-${bookId}-${idx} .ch-jump-menu`); if (!menu) return;
    if (!menu.hidden) { menu.hidden = true; return; }
    chShowMenu(bookId, idx, -1);
  }
}
window.chJump = chJump;
function _chHeads(bookId, k) {
  const c = _chContent(bookId, k);
  return c ? [...c.querySelectorAll('h1,h2,h3,h4,h5')] : [];
}
/* ☰ मेनु: अध्यायहरू (हरेकमा 🔖 🖨️ ✏️ 🗑️); अध्यायमा छुँदा मात्र त्यसका भाग खुल्छन् */
function chShowMenu(bookId, idx, expK) {
  const menu = document.querySelector(`#chj-${bookId}-${idx} .ch-jump-menu`); if (!menu) return;
  const chs = App.chaptersCache[bookId] || [];
  const adm = !!App.isAdmin;
  let html = `<div class="ch-jump-top"><span class="ch-jump-lbl">अध्यायहरू</span><button type="button" class="m-x" aria-label="बन्द" onclick="chCloseMenu('${bookId}',${idx})">✕</button></div>`;
  chs.forEach((ch, k) => {
    const bm = App.chapterBookmarks.includes(bookId + '::' + k);
    html += `<div class="ch-jm-row${k === idx ? ' cur' : ''}${k === expK ? ' exp' : ''}">
      <button class="ch-jump-item ch-jump-c" onclick="chMenuTap('${bookId}',${idx},${k})"></button>
      <button class="ch-jm-act" title="Bookmark" onclick="chMenuBm('${bookId}',${k},this)">${bm ? '🔖' : '🏷️'}</button>
      <button class="ch-jm-act" title="Print" onclick="openPrintOptions('${bookId}',${k})">🖨️</button>
      ${adm ? `<button class="ch-jm-act" title="Edit" onclick="adminInlineChapterEdit('${bookId}',${k})">✏️</button>
      <button class="ch-jm-act" title="Delete" onclick="adminInlineChapterDelete('${bookId}',${k})">🗑️</button>` : ''}
    </div>`;
    if (k === expK) {
      const hs = _chHeads(bookId, k);
      html += '<div class="ch-jm-parts">' + (hs.length
        ? hs.map((h, n) => `<button class="ch-jump-item ch-jump-h" style="padding-left:${10 + (parseInt(h.tagName[1]) - 1) * 10}px" onclick="chGoHead('${bookId}',${idx},${n})"></button>`).join('')
        : '<div class="ch-jump-empty">यो अध्यायमा भाग (शीर्षक) छैन।</div>') + '</div>';
    }
  });
  menu.innerHTML = html;
  menu.dataset.exp = expK;
  menu.querySelectorAll('.ch-jump-c').forEach((b, k) => { b.textContent = toN(k + 1) + '. ' + ((chs[k] && chs[k].title) || ('अध्याय ' + (k + 1))).trim().slice(0, 80); });
  if (expK >= 0) {
    const hs = _chHeads(bookId, expK);
    menu.querySelectorAll('.ch-jump-h').forEach((b, n) => { b.textContent = hs[n].textContent.trim().slice(0, 80) || ('भाग ' + (n + 1)); });
  }
  menu.hidden = false;
  menu._cur = null;
  chMarkCurPart(menu.closest('.chapter-item'));   // अहिले पढिरहेको भाग दबिएको देखिने
  if (!menu._lock) {   // मेनु स्क्रोल गर्दा पछाडिको अध्याय नसर्ने
    menu._lock = true;
    menu.addEventListener('touchmove', ev => { if (menu.scrollHeight <= menu.clientHeight + 1) ev.preventDefault(); }, { passive: false });
    menu.addEventListener('wheel', ev => { if (menu.scrollHeight <= menu.clientHeight + 1) ev.preventDefault(); }, { passive: false });
  }
}
/* ठूलो अध्याय: पहिलो पटक पहिलो भाग (~एक स्क्रिन) मात्र देखाएर बाँकी थोरै-थोरै गर्दै खोल्ने —
   ताकि अध्याय छान्नासाथ कार्ड + पाठ तुरुन्तै देखियोस् (भाग छान्दा जस्तै), भारी layout पछाडि चुपचाप हुने */
const CH_FIRST = 40, CH_STEP = 60;
function _chLimit(c) {
  if (!c || c._hi !== undefined) return;
  const kids = c.children;
  if (kids.length <= CH_FIRST + 30) return;
  c._kids = Array.prototype.slice.call(kids); c._hi = CH_FIRST;
  for (let i = CH_FIRST; i < c._kids.length; i++) c._kids[i].style.display = 'none';
}
function _chRevealAll(c) {
  if (!c || c._hi === undefined) return;
  const ks = c._kids; for (let i = c._hi; i < ks.length; i++) ks[i].style.display = '';
  c._hi = undefined; c._kids = null; clearTimeout(c._rt);
  const it = c.closest('.chapter-item'); if (it) { chMarkCurPart(it); window._updateChProgress && window._updateChProgress(); }
}
function _chRevealMore(c) {
  if (!c || c._hi === undefined) return;
  const ks = c._kids, end = Math.min(ks.length, c._hi + CH_STEP);
  for (let i = c._hi; i < end; i++) ks[i].style.display = '';
  c._hi = end;
  if (end >= ks.length) { c._hi = undefined; c._kids = null; const it = c.closest('.chapter-item'); if (it) { chMarkCurPart(it); window._updateChProgress && window._updateChProgress(); } return; }
  c._rt = setTimeout(() => requestAnimationFrame(() => _chRevealMore(c)), 0);
}
function _chSwitch(bookId, k) {
  const it = document.getElementById(`chi-${bookId}-${k}`); if (!it) return false;
  const c = it.querySelector('.ch-read-content');
  document.querySelectorAll('.chapter-item.open').forEach(el => el.classList.remove('open'));
  _chLimit(c);                                                       // पहिलो भाग मात्र layout हुन्छ
  it.classList.add('open'); window.spApplyFixes && spApplyFixes(it);
  const h = document.querySelector('.site-header');
  const y = it.getBoundingClientRect().top + window.scrollY - (h ? h.offsetHeight : 56);   // ठ्याक्कै हेडरमुनि — टाँसिएको जम्प-बार/मेनु उही ठाउँमा रहोस् (९px सर्ने झिलमिल नहोस्)
  window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });   // 'auto' ले html{scroll-behavior:smooth} अनुसार सर्थ्यो
  history.pushState({ chOpen: { bookId, idx: k } }, '');
  saveLastLocation();
  if (c && c._hi !== undefined) requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => _chRevealMore(c), 0)));
  window._updateChProgress && requestAnimationFrame(() => window._updateChProgress());
  return true;
}
function chMenuTap(bookId, idx, k) {
  if (k === idx) {
    const menu = document.querySelector(`#chj-${bookId}-${idx} .ch-jump-menu`);
    chShowMenu(bookId, idx, menu && menu.dataset.exp === String(k) ? -1 : k);
  } else {
    const om = document.querySelector(`#chj-${bookId}-${idx} .ch-jump-menu`), st = om ? om.scrollTop : 0;
    if (_chSwitch(bookId, k)) {
      chShowMenu(bookId, k, k);   // नयाँ अध्यायमा गएर त्यसका भाग खोल्ने — उही frame मा, मेनु हराउँदै-आउँदै नगरी
      const nm = document.querySelector(`#chj-${bookId}-${k} .ch-jump-menu`);
      if (nm) nm.scrollTop = st;  // मेनु जहाँ स्क्रोल गरेको थियो त्यहीँ रहोस्
    }
  }
}
function chMenuBm(bookId, k, btn) {
  toggleChapterBm(bookId, k);
  btn.textContent = App.chapterBookmarks.includes(bookId + '::' + k) ? '🔖' : '🏷️';
}
window.chShowMenu = chShowMenu; window.chMenuTap = chMenuTap; window.chMenuBm = chMenuBm;
function chGoChapter(bookId, idx, k) { chMenuTap(bookId, idx, k); }
window.chGoChapter = chGoChapter;
function chGoHead(bookId, idx, k) {
  const c = _chContent(bookId, idx); if (!c) return;
  _chRevealAll(c);
  const h = c.querySelectorAll('h1,h2,h3,h4,h5')[k]; if (!h) return;
  _chScrollTo(h.getBoundingClientRect().top + window.scrollY - _chOff(), true);
  /* मेनु बन्द हुँदैन — छोएको भाग तुरुन्तै दबिएको देखिन्छ; बन्द गर्न माथिको ✕ थिच्ने */
  const menu = document.querySelector(`#chj-${bookId}-${idx} .ch-jump-menu`);
  if (menu) {
    menu._cur = k; menu._hold = Date.now() + 900;   // स्क्रोल हुँदा बीचका भाग झिलमिल नहोस्
    menu.querySelectorAll('.ch-jump-h').forEach((b, n) => b.classList.toggle('on', n === k));
  }
}
window.chGoHead = chGoHead;
function chCloseMenu(bookId, idx) {
  const menu = document.querySelector(`#chj-${bookId}-${idx} .ch-jump-menu`); if (menu) menu.hidden = true;
}
window.chCloseMenu = chCloseMenu;
/* ☰ मेनुमा अहिले पढिरहेको भाग (शीर्षक) दबिएको (inset) देखाउने — अर्को भाग पढ्दा त्यो दबिन्छ, अघिल्लो उठ्छ */
function chMarkCurPart(item) {
  const menu = item && item.querySelector('.ch-jump-menu');
  if (item && item.querySelector('.ch-read-content')?._hi !== undefined) return;   // अझै थोरै-थोरै खुल्दैछ
  if (!menu || menu.hidden) return;
  if (menu._hold && Date.now() < menu._hold) return;
  const p = item.id.lastIndexOf('-');
  const idx = parseInt(item.id.slice(p + 1), 10);
  if (menu.dataset.exp !== String(idx)) return;   // यही अध्यायका भाग देखिएका बेला मात्र
  const hs = _chHeads(item.id.slice(4, p), idx);
  const items = menu.querySelectorAll('.ch-jump-h');
  if (!hs.length || items.length !== hs.length) return;
  const off = _chOff();
  let cur = -1;
  hs.forEach((h, n) => { if (h.getBoundingClientRect().top <= off + 8) cur = n; });
  if (menu._cur === cur) return;
  menu._cur = cur;
  items.forEach((b, n) => b.classList.toggle('on', n === cur));
  if (cur >= 0) {   // दबिएको भाग मेनुभित्र देखिने ठाउँमा ल्याउने
    const mb = menu.getBoundingClientRect(), bb = items[cur].getBoundingClientRect();
    if (bb.top < mb.top + 60 || bb.bottom > mb.bottom) menu.scrollTop += bb.top - mb.top - 70;
  }
}
window.chMarkCurPart = chMarkCurPart;

/* ════════════════════════════════════
   अध्याय पढ्दा कति बाँकी छ — पातलो progress bar
   ════════════════════════════════════ */
function initChapterProgress() {
  const bar = document.getElementById('chProgressBar');
  const fill = document.getElementById('chProgressFill');
  if (!bar || !fill) return;

  function update() {
    const openItem = document.querySelector('.chapter-item.open');
    const openContent = openItem?.querySelector('.ch-read-content');
    if (!openItem || !openContent) { bar.classList.remove('show'); return; }
    const rect = openContent.getBoundingClientRect();
    const total = rect.height + window.innerHeight;
    let progress = total > 0 ? (window.innerHeight - rect.top) / total : 0;
    progress = Math.max(0, Math.min(1, progress));
    fill.style.width = (progress * 100) + '%';
    bar.classList.add('show');
    const zip = openItem.querySelector('.ch-zip');
    if (zip && !zip.dataset.d) {
      const mx = rect.height - window.innerHeight + _chOff();
      zip.value = mx > 0 ? Math.max(0, Math.min(1, (_chOff() - rect.top) / mx)) * 100 : 0;
    }
    docHiliteSync();
    chMarkCurPart(openItem);
    const pctEl = openItem.querySelector('.ch-rd-pct');
    if (pctEl) pctEl.textContent = '· ' + Math.round(progress * 100) + '% पढियो';
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => { update(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });

  window._updateChProgress = update;
}
window.initChapterProgress = initChapterProgress;

/* ════════════════════════════════════
   MARKDOWN RENDERER
   ════════════════════════════════════ */
/* रंगीन highlight — ==रातो:शब्द== जस्तै लेख्दा त्यही रङमा highlight हुन्छ
   (रङ नदिए ==शब्द== ले सधैंको पहेंलो highlight दिन्छ) */
const HL_COLOR_MAP = {
  'रातो':'#F44336', 'लाल':'#F44336', 'red':'#F44336',
  'निलो':'#2196F3', 'blue':'#2196F3',
  'हरियो':'#4CAF50', 'green':'#4CAF50',
  'पहेंलो':'#FBC02D', 'पहेलो':'#FBC02D', 'yellow':'#FBC02D',
  'सुन्तला':'#FB8C00', 'orange':'#FB8C00',
  'बैजनी':'#9C27B0', 'purple':'#9C27B0',
  'गुलाबी':'#EC407A', 'pink':'#EC407A',
  'खैरो':'#8D6E63', 'brown':'#8D6E63',
  'आकाशे':'#00BCD4', 'cyan':'#00BCD4',
};
function resolveHlColor(word) {
  if (!word) return null;
  const w = word.trim();
  if (HL_COLOR_MAP[w]) return HL_COLOR_MAP[w];
  if (HL_COLOR_MAP[w.toLowerCase()]) return HL_COLOR_MAP[w.toLowerCase()];
  if (/^#[0-9a-fA-F]{3,8}$/.test(w)) return w;
  return null;
}

/* ![|50|left](फोटो) → <img> — alt पछि | राखेर आकार (%) र स्थिति (left/right/center); बक्स/तालिका भित्र पनि चल्छ */
function mdImgTag(alt, src) {
  const parts = alt.split('|');
  let w = 0, al = 'center';
  parts.slice(1).forEach(tk => {
    tk = tk.trim().toLowerCase();
    if (/^\d{1,3}%?$/.test(tk)) w = Math.max(10, Math.min(100, parseInt(tk, 10)));
    else if (tk === 'left' || tk === 'right' || tk === 'center') al = tk;
  });
  const st = [];
  if (w) st.push('width:' + w + '%');
  if (al === 'left') st.push('float:left;margin:4px 14px 8px 0');
  else if (al === 'right') st.push('float:right;margin:4px 0 8px 14px');
  else if (w) st.push('margin-left:auto;margin-right:auto');
  return '<img src="' + src + '" alt="' + parts[0].trim() + '" loading="lazy" decoding="async"' + (st.length ? ' style="' + st.join(';') + '"' : '') + '>';
}

/* {{रातो:शब्द}} रंगीन अक्षर; {{150%:शब्द}} अक्षरको आकार; {{रातो 150%:शब्द}} दुवै */
function parseFcWord(word) {
  const toks = String(word || '').trim().split(/\s+/).filter(Boolean);
  let s = 0; const rest = [];
  toks.forEach(t => { const m = t.match(/^(\d{2,3})%$/); if (m) s = Math.max(50, Math.min(300, parseInt(m[1], 10))); else rest.push(t); });
  const cw = rest.join(' ');
  const c = cw ? resolveHlColor(cw) : null;
  return { cw, c, s, ok: (!cw || !!c) && (!!c || !!s) };
}
function mdFcSpan(word, txt) {
  const p = parseFcWord(word);
  if (!p.ok) return word + ':' + txt;
  const st = [];
  if (p.c) st.push('color:' + p.c + ';font-weight:600');
  if (p.s) st.push('font-size:' + p.s + '%');
  return `<span style="${st.join(';')}">${txt}</span>`;
}

/* इनलाइन मात्र (heading/paragraph/list जस्ता block-level चिज नछुने) —
   box र table भित्र पनि यही प्रयोग हुन्छ */
function applyInline(str) {
  return str
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => mdImgTag(alt, src))
    .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/__([^_\s](?:[^_]*?[^_\s])?)__/g,'<u>$1</u>')
    .replace(/~~(.+?)~~/g,'<s>$1</s>')
    .replace(/==(?:([^=\n]{1,16}):)?([^=]+?)==/g, (m, colorWord, txt) => {
      const c = resolveHlColor(colorWord);
      if (c) return `<span class="highlight" style="background:${c}33;color:${c};box-shadow:inset 0 -2px 0 ${c}">${txt}</span>`;
      const full = colorWord ? colorWord + ':' + txt : txt;
      return `<span class="highlight">${full}</span>`;
    })
    .replace(/\{\{([^:{}\n]{1,24}):([^{}]+?)\}\}/g, (m, w, txt) => mdFcSpan(w, txt));
}

/* ── थप बक्स feature — :::type:शीर्षक ... ::: ── */
const BOX_TYPES = {
  question: { icon:'❓', color:'#2196F3', label:'सोच्नुहोस्' },
  tip:      { icon:'💡', color:'#F5A623', label:'सुझाव' },
  note:     { icon:'📝', color:'#4CAF50', label:'याद राख्नुहोस्' },
  warning:  { icon:'⚠️', color:'#F44336', label:'ध्यान दिनुहोस्' },
  info:     { icon:'📖', color:'#9C27B0', label:'जानकारी' },
  example:  { icon:'✏️', color:'#FF7A3D', label:'उदाहरण' },
};
function renderBox(type, label, inner) {
  const meta = BOX_TYPES[type.toLowerCase()] || BOX_TYPES.note;
  const title = label || meta.label;
  const body = applyInline(inner).replace(/\n/g,'<br>');
  return `<div class="content-box" style="background:${meta.color}14;border-color:${meta.color}40;border-left-color:${meta.color}">
    <div class="content-box-head" style="color:${meta.color}"><span class="content-box-ico">${meta.icon}</span><span class="content-box-title">${title}</span></div>
    <div class="content-box-body">${body}</div>
  </div>`;
}

/* ── तालिका feature — | कलम | कलम |  हेडर पछि |---|---| लाइन चाहिन्छ ── */
function renderTable(headerLine, bodyBlock) {
  const cellHtml = s => applyInline(s).replace(/&lt;br\s*\/?&gt;/gi, '<br>');   // कक्षभित्रको नयाँ लाइन
  const headers = headerLine.split('|').map(s=>s.trim()).filter(Boolean);
  const rows = bodyBlock.trim().split('\n').filter(Boolean).map(r =>
    r.replace(/^\||\|$/g,'').split('|').map(c=>cellHtml(c.trim()))
  );
  const thead = `<tr>${headers.map(h=>`<th>${cellHtml(h)}</th>`).join('')}</tr>`;
  const tbody = rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="content-table-wrap"><table class="content-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

function renderMd(text) {
  if (!text) return '<span style="color:var(--text-4)">सामग्री छैन</span>';

  let escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // \* \= \{ \} \\ — चिन्हलाई ढाँचा नमानी अक्षरकै रूपमा देखाउने (लेख्ने एडिटरले यसरी सुरक्षित गर्छ)
  escaped = escaped.replace(/\\([\\*={}:_~])/g, (m, c) => '&#' + c.charCodeAt(0) + ';');

  // Box/Table लाई paragraph-wrapping ले नबिगारोस् भनेर छुट्टै निकालेर placeholder राख्ने
  const blocks = [];
  const stash = html => { blocks.push(html); return `@@BLOCK${blocks.length-1}@@`; };

  escaped = escaped.replace(/:::(\w+)(?::([^\n]*))?\n([\s\S]*?):::/g,
    (m, type, label, inner) => stash(renderBox(type, (label||'').trim(), inner.trim()))
  );
  escaped = escaped.replace(/^\|(.+)\|\n\|[ \t]*[:\-][ \t:\-|]*\|\n((?:\|.*\|\n?)+)/gm,
    (m, headerLine, bodyBlock) => stash(renderTable(headerLine, bodyBlock))
  );

  let html = escaped
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => mdImgTag(alt, src))
    .replace(/^(#{1,5}) (?:\{:(left|center|right|justify)\})?(.+)$/gm, (m, h, al, t) => `<h${h.length}${al && al !== 'left' ? ` style="text-align:${al}"` : ''}>${t}</h${h.length}>`)
    .replace(/^---$/gm,'<hr>')
    .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/__([^_\s](?:[^_]*?[^_\s])?)__/g,'<u>$1</u>')
    .replace(/~~(.+?)~~/g,'<s>$1</s>')
    .replace(/==(?:([^=\n]{1,16}):)?([^=]+?)==/g, (m, colorWord, txt) => {
      const c = resolveHlColor(colorWord);
      if (c) return `<span class="highlight" style="background:${c}33;color:${c};box-shadow:inset 0 -2px 0 ${c}">${txt}</span>`;
      const full = colorWord ? colorWord + ':' + txt : txt;
      return `<span class="highlight">${full}</span>`;
    })
    .replace(/\{\{([^:{}\n]{1,24}):([^{}]+?)\}\}/g, (m, w, txt) => mdFcSpan(w, txt))
    .replace(/^(?:>|&gt;) (?:\{:(left|center|right|justify)\})?(.+)$/gm, (m, al, t) => `<blockquote${al && al !== 'left' ? ` style="text-align:${al}"` : ''}>${t}</blockquote>`)
    .replace(/^- (?:\{:(left|center|right|justify)\})?(.+)$/gm, (m, al, t) => `<li${al && al !== 'left' ? ` style="text-align:${al}"` : ''}>${t}</li>`)
    .replace(/^\{:(left|center|right|justify)\}(.*)(?:\n|$)/gm, (m, al, t) => `<div style="text-align:${al}">${t}</div>`)
    // बुँदाहरू (- ...) बीच खाली लाइन वा खाली ठाउँ भए पनि एउटै सूचीमा जोड्ने र वरपरका अनावश्यक लाइन-ब्रेक हटाउने
    // (पहिले हरेक बुँदा छुट्टै <ul> बन्थ्यो र बीचमा </p><p>, <br> थपिएर ठूलो ग्याप आउँथ्यो)
    .replace(/<li[^>]*>[^\n]*?<\/li>(?:\s*<li[^>]*>[^\n]*?<\/li>)*\s*/g, m => '<ul>' + m.replace(/<\/li>\s+<li/g, '</li><li').replace(/\s+$/, '') + '</ul>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>')
    // शीर्षक (###) पछिको अतिरिक्त <br> / खाली अनुच्छेदले ठूलो ग्याप बनाउँथ्यो — हटाउने
    .replace(/(<\/h[1-5]>)(?:<br>|<\/p><p>)+/g,'$1')
    // [[pdf:data/pdf/x.pdf]] → PDF को पृष्ठहरू चित्र जस्तै देखाउने ठाउँ (PDFV ले भर्छ)
    .replace(/\[\[pdf:([A-Za-z0-9_\-./]+?\.pdf)\]\]/g, '<div class="pdf-embed" data-src="$1"><div class="pdf-ph">📄 PDF लोड हुँदैछ…</div></div>');

  html = html.replace(/@@BLOCK(\d+)@@/g, (m, idx) => blocks[+idx]);
  return html;
}

/* ════════════════════════════════════
   BOOKMARK
   ════════════════════════════════════ */
function toggleBm(bookId) {
  const idx=App.bookmarks.indexOf(bookId);
  if(idx>-1) App.bookmarks.splice(idx,1);
  else App.bookmarks.push(bookId);
  localStorage.setItem('sp_bookmarks',JSON.stringify(App.bookmarks));
  const btn=document.querySelector('.bm-btn');
  if(btn) btn.textContent=App.bookmarks.includes(bookId)?'🔖':'🏷️';
  toast(idx>-1?'Bookmark हटाइयो':'Bookmark गरियो 🔖');
}
window.toggleBm = toggleBm;

/* अध्याय-अध्यायको आफ्नै Bookmark — जो कोहीले पनि गर्न मिल्ने */
function toggleChapterBm(bookId, idx) {
  const key = `${bookId}::${idx}`;
  const i = App.chapterBookmarks.indexOf(key);
  if (i > -1) App.chapterBookmarks.splice(i, 1);
  else App.chapterBookmarks.push(key);
  localStorage.setItem('sp_chapter_bookmarks', JSON.stringify(App.chapterBookmarks));
  const btn = document.getElementById(`chbm-${bookId}-${idx}`);
  if (btn) btn.textContent = App.chapterBookmarks.includes(key) ? '🔖' : '🏷️';
  toast(i > -1 ? 'अध्याय Bookmark हटाइयो' : 'अध्याय Bookmark गरियो 🔖');
}
window.toggleChapterBm = toggleChapterBm;

/* ════════════════════════════════════
   HISTORY
   ════════════════════════════════════ */
function addHistory(book,yr){
  App.history=App.history.filter(h=>h.id!==book.id);
  App.history.unshift({id:book.id,title:book.title,year:yr.title,time:new Date().toLocaleString('ne-NP'),yearId:yr.id});
  if(App.history.length>20) App.history=App.history.slice(0,20);
  localStorage.setItem('sp_history',JSON.stringify(App.history));
}

/* ════════════════════════════════════
   SEARCH
   ════════════════════════════════════ */
function toggleSearchBar() {
  const wrap = document.getElementById('searchWrap');
  const inp  = document.getElementById('sInp');
  const drop = document.getElementById('sDrop');
  if (!wrap) return;
  const willOpen = !wrap.classList.contains('open');
  wrap.classList.toggle('open', willOpen);
  if (willOpen) {
    window.scrollTo({ top: 0, behavior: 'smooth' }); // टाढा scroll भएको बेला पनि search bar देखियोस्
    setTimeout(() => inp?.focus(), 180);
    setTimeout(() => ensureAllChaptersLoaded(), 600);   // खोज्ने तयारी: सबै अध्याय पृष्ठभूमिमा लोड
  } else { drop?.classList.remove('open'); inp?.blur(); }
}
window.toggleSearchBar = toggleSearchBar;

function initSearch() {
  const inp=document.getElementById('sInp');
  const clr=document.getElementById('sClr');
  const drop=document.getElementById('sDrop');
  const wrap=document.getElementById('searchWrap');
  const btn=document.getElementById('searchBtn');

  // सर्च बटन थिचेपछि मात्र सर्च बार देखिने
  if (btn && wrap) {
    btn.addEventListener('click', () => toggleSearchBar());
    document.addEventListener('click', e => {
      if (wrap.classList.contains('open') && !e.target.closest('.search-wrap') && !e.target.closest('#searchBtn') && !e.target.closest('#navSearchBtn') && !e.target.closest('#navFab')) {   // #navFab: तल तैरिने आइकनको खोज थिच्दा खुलेको बार आफैं नबन्द होस्
        wrap.classList.remove('open');
        drop?.classList.remove('open');
      }
    });
  }

  if(!inp) return;
  let _searchDebounce;
  inp.addEventListener('input',()=>{
    const q=inp.value.trim();
    clr.classList.toggle('show',q.length>0);
    if(q.length<2){drop.classList.remove('open'); App.docQ=''; docHiliteSync(); return;}
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => {
      App.docQ = q; docHiliteSync();                                   // खुला अध्यायमा पनि शब्द रङ्गिन
      const run = () => { if (inp.value.trim() !== q) return; renderDrop(doSearch(q), q); drop.classList.add('open'); };
      run();
      ensureAllChaptersLoaded(() => { clearTimeout(App._sRef); App._sRef = setTimeout(run, 250); });   // बाँकी किताबका अध्याय आउँदै गर्दा नतिजा ताजा हुँदै जाने
    }, 140);
  });
  clr.addEventListener('click',()=>{inp.value='';clr.classList.remove('show');drop.classList.remove('open');App.docQ='';docHiliteSync();inp.focus();});
  document.addEventListener('click',e=>{if(!e.target.closest('.search-glass')) drop.classList.remove('open');});
}

/* ── हल्का fuzzy-match (typo सहने) — Levenshtein distance मा आधारित ── */
function _editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = [];
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
function _fuzzyContains(haystack, needle) {
  if (!needle) return false;
  if (haystack.includes(needle)) return true; // सबैभन्दा पहिले सिधा substring जाँच्ने — छिटो र सबैभन्दा सही
  if (needle.length < 3) return false; // धेरै छोटो शब्दमा fuzzy लगाउँदा अनावश्यक/गलत match बढ्छ
  const maxDist = needle.length <= 5 ? 1 : needle.length <= 9 ? 2 : 3;
  return _fuzzyWords(haystack.split(/\s+/), needle, maxDist);
}
/* edit-distance ≤ max? (छिटो: लम्बाइ फरक र पङ्क्ति-न्यूनतम हेरेर बीचमै छोड्ने) */
const _dpA = new Int32Array(80), _dpB = new Int32Array(80);
function _withinDist(a, b, max) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max || n > 70) return false;
  let prev = _dpA, cur = _dpB;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i; let mn = i; const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const c = ai === b.charCodeAt(j - 1) ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
      cur[j] = c; if (c < mn) mn = c;
    }
    if (mn > max) return false;
    const t = prev; prev = cur; cur = t;
  }
  return prev[n] <= max;
}
function _fuzzyWords(words, needle, maxDist) {
  for (let i = 0; i < words.length; i++) { const w = words[i]; if (Math.abs(w.length - needle.length) <= maxDist && _withinDist(w, needle, maxDist)) return true; }
  return false;
}

/* ── खोज: सबै तिरबाट — किताब, सबै किताबका अध्याय (पाठसहित), समाचार, फिड, मेरा नोट ── */
const _sIdx = new WeakMap();   // अध्याय → खोज्न सजिलो पाठ (अध्यायको असली डाटा नबिगार्न अलग राखिएको)
function _plainMd(s) {         // markdown/रङ चिन्ह हटाएर सादा पाठ (रङको नाम "रातो" जस्ता चिन्ह खोजमा नमिलोस्)
  return String(s || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\{\{[^:{}\n]{1,24}:/g, ' ').replace(/\}\}/g, ' ')
    .replace(/==(?:[^:=\n]{1,16}:)?/g, ' ')
    .replace(/^\{:\w+\}/gm, '')
    .replace(/[#*_`>\-\[\]()|~]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function _chIdx(ch) {
  let r = _sIdx.get(ch);
  if (!r) { const plain = _plainMd(ch.content), title = _plainMd(ch.title); r = { plain, low: plain.toLowerCase(), tl: title.toLowerCase() }; _sIdx.set(ch, r); }
  return r;
}
function _fuzzyIdx(ix, ql) {                                  // अध्यायको अनौठा शब्दहरूमा मात्र (एकपटक बनाएर राख्ने)
  if (ql.length < 3) return false;
  const maxDist = ql.length <= 5 ? 1 : ql.length <= 9 ? 2 : 3;
  if (!ix.uw) ix.uw = [...new Set((ix.tl + ' ' + ix.low).split(' '))];
  return _fuzzyWords(ix.uw, ql, maxDist);
}
const _hit = (h, ql, words) => h.includes(ql) || (words.length > 1 && words.every(w => h.includes(w)));
function _snip(plain, low, ql, words) {                        // मिलेको ठाउँको वरिपरिको अंश
  let pi = low.indexOf(ql), len = ql.length;
  if (pi < 0) for (const w of words) { pi = low.indexOf(w); if (pi >= 0) { len = w.length; break; } }
  if (pi < 0) return '';
  return (pi > 28 ? '… ' : '') + plain.slice(Math.max(0, pi - 28), pi + len + 56) + (plain.length > pi + len + 56 ? ' …' : '');
}
function doSearch(q) {
  const empty = { books: [], chapters: [], news: [], feed: [], notes: [], loading: null };
  if (!App.data) return empty;
  const ql = q.toLowerCase().trim(); if (!ql) return empty;
  const words = ql.split(/\s+/).filter(Boolean);
  const books = [];
  App.data.years.forEach(yr => Object.entries(yr.subjects).forEach(([key, arr]) =>
    (arr||[]).forEach(b => {
      const hay = `${b.title||''} ${b.author||''} ${yr.title||''} ${(SUBJ[key]||{}).label||''}`.toLowerCase();
      if (_hit(hay, ql, words) || _fuzzyContains(hay, ql)) books.push({ b, yr, key });
    })
  ));

  // अध्यायभित्रको पाठ — सबै किताबका (पृष्ठभूमिमा लोड भएपछि सबै)। पहिले ठ्याक्कै मिल्ने, थोरै भए typo-सहने पनि
  const chapters = [];
  if (ql.length >= 2) {
    const scan = fuzzy => {
      for (const bookId in (App.chaptersCache || {})) {
        const loc = findBookLocation(bookId); if (!loc) continue;
        (App.chaptersCache[bookId] || []).forEach((ch, idx) => {
          const ix = _chIdx(ch);
          const tHit = _hit(ix.tl, ql, words), bHit = _hit(ix.low, ql, words);
          if (!(tHit || bHit || (fuzzy && _fuzzyIdx(ix, ql)))) return;
          if (chapters.some(c => c.bookId === bookId && c.chapterIdx === idx)) return;
          chapters.push({ bookId, bookTitle: loc.book.title, yearId: loc.yearId, chapterIdx: idx, chapterTitle: ch.title || `अध्याय ${idx+1}`, rank: tHit ? 0 : 1, snip: _snip(ix.plain, ix.low, ql, words) });
        });
      }
    };
    scan(false);
    if (chapters.length < 3 && ql.length >= 3) scan(true);
    chapters.sort((x, y) => x.rank - y.rank);
  }

  const side = (list, mk) => {
    const out = [];
    (list || []).forEach((n, i) => {
      const t = _plainMd(n.title), c = _plainMd(n.content), low = (t + ' ' + c).toLowerCase();
      if (_hit(low, ql, words) || (ql.length >= 3 && _fuzzyContains(low, ql))) out.push(mk(n, i, t, c));
    });
    return out;
  };
  const news  = side(App.data.news,  (n, i, t, c) => ({ i, title: t, date: n.date || '', snip: _snip(c, c.toLowerCase(), ql, words) }));
  const feed  = side(App.feedPosts,  (n, i, t, c) => ({ i, title: t, date: n.date || '', snip: _snip(c, c.toLowerCase(), ql, words) }));
  const notes = side(App.notes,      (n, i, t, c) => ({ id: n.id, title: t || 'नोट', date: n.date || '', snip: _snip(c, c.toLowerCase(), ql, words) }));

  const st = App._chLoad;
  return { books: books.slice(0, 6), chapters: chapters.slice(0, 12), news: news.slice(0, 4), feed: feed.slice(0, 4), notes: notes.slice(0, 4),
           loading: st && st.running ? { done: st.done, total: st.total } : null };
}

/* सबै किताबका अध्याय पृष्ठभूमिमा लोड (एकपटक मात्र; लोड भएपछि App.chaptersCache मै रहन्छ) */
function ensureAllChaptersLoaded(onProgress) {
  if (!App.data) return Promise.resolve();
  const st = App._chLoad = App._chLoad || { running: false, done: 0, total: 0, promise: null };
  if (st.running) return st.promise;
  const ids = [];
  App.data.years.forEach(yr => Object.values(yr.subjects || {}).forEach(arr => (arr || []).forEach(b => { if (b && b.id) ids.push(b.id); })));
  App.chaptersCache = App.chaptersCache || {};
  const todo = ids.filter(id => !App.chaptersCache[id]);
  if (!todo.length) return Promise.resolve();
  st.running = true; st.total = ids.length; st.done = ids.length - todo.length;
  let k = 0;
  const worker = async () => {
    while (k < todo.length) {
      const id = todo[k++];
      try { if (!App.chaptersCache[id]) { const r = await loadChaptersForBook(id); if (Array.isArray(r)) { App.chaptersCache[id] = r; r.forEach(_chIdx); } } } catch (e) { /* यो किताब छोडेर अगाडि */ }   // खोज्ने सूची अहिल्यै बनाउने (पहिलो खोज नअड्कियोस्)
      st.done++; if (onProgress) onProgress();
    }
  };
  st.promise = Promise.all([worker(), worker(), worker(), worker()]).then(() => { st.running = false; if (onProgress) onProgress(); });
  return st.promise;
}
window.ensureAllChaptersLoaded = ensureAllChaptersLoaded;

/* खोजेका शब्द नतिजामा बोल्ड र रङ्गीन देखाउने (HTML सुरक्षित) */
function hlQ(text, q) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = String(text == null ? '' : text);
  const words = [...new Set(String(q || '').trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!words.length) return esc(t);
  const re = new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return t.split(re).map((p, i) => i % 2 ? '<mark class="s-hit">' + esc(p) + '</mark>' : esc(p)).join('');
}

/* ── अध्यायभित्र: खोजेका शब्द पाठमै बोल्ड + रङ्गीन (DOM को text node मात्र चिरेर — अरू कुरा नबिग्रने) ── */
function _qRegex(q) {
  const words = [...new Set(String(q || '').trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  return words.length ? new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi') : null;
}
function docHiliteClear(root) {
  root.querySelectorAll('mark.s-hit-doc').forEach(m => m.replaceWith(...m.childNodes));
  root.normalize();
}
function docHilite(root, q) {
  const re = _qRegex(q); if (!re) return 0;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement && n.parentElement.closest('mark.s-hit-doc,script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = []; let n;
  while ((n = w.nextNode())) { re.lastIndex = 0; if (re.test(n.nodeValue)) nodes.push(n); }
  let count = 0;
  nodes.forEach(nd => {
    const frag = document.createDocumentFragment();
    nd.nodeValue.split(re).forEach((p, i) => {
      if (!p) return;
      if (i % 2) { const m = document.createElement('mark'); m.className = 's-hit s-hit-doc'; m.textContent = p; frag.appendChild(m); count++; }
      else frag.appendChild(document.createTextNode(p));
    });
    nd.replaceWith(frag);
  });
  return count;
}
/* खुला अध्यायमा App.docQ को शब्द देखाउने/हटाउने (अध्याय फेरिँदा पनि मिलाउँछ) */
function docHiliteSync() {
  const q = String(App.docQ || '').trim();
  const el = document.querySelector('.chapter-item.open .ch-read-content');
  document.querySelectorAll('.ch-read-content[data-hq]').forEach(x => { if (x !== el || x.dataset.hq !== q) { docHiliteClear(x); delete x.dataset.hq; } });
  if (!el || q.length < 2 || el.dataset.hq === q) return 0;
  const n = docHilite(el, q); el.dataset.hq = q; return n;
}
window.docHiliteSync = docHiliteSync;

function renderDrop(res,q) {
  const el=document.getElementById('sDrop');
  const books = res.books || [], chapters = res.chapters || [], news = res.news || [], feed = res.feed || [], notes = res.notes || [];
  const close = "document.getElementById('sDrop').classList.remove('open')";
  const load = res.loading ? `<div class="s-load">⏳ सबै किताबका अध्यायमा खोज्दैछ… ${res.loading.done}/${res.loading.total}</div>` : '';
  const total = books.length + chapters.length + news.length + feed.length + notes.length;
  if (!total) { el.innerHTML = load + `<div class="s-empty">🔍 "${hlQ(q, '')}" ${res.loading ? 'अहिलेसम्म भेटिएन' : 'भेटिएन'}</div>`; return; }
  const row = (onclick, ico, name, sub, snip, bg) => `<div class="s-row" onclick="${onclick};${close}">
      <div class="s-ico2" style="background:${bg || 'linear-gradient(135deg,#CCC,#AAA)'}">${ico}</div>
      <div style="min-width:0"><div class="s-name">${hlQ(name, q)}</div>${sub ? `<div class="s-sub">${sub}</div>` : ''}${snip ? `<div class="s-snip">${hlQ(snip, q)}</div>` : ''}</div>
    </div>`;
  let html = load;
  if (books.length) html += '<div class="s-sec">📚 किताब</div>' + books.map(({b,yr,key})=>{
    const s=SUBJ[key]||{short:'क',g:'#EEE,#CCC'}; const[c1,c2]=s.g.split(',');
    return row(`openBookWithBreadcrumb('${b.id}',${yr.id})`, s.short, b.title, `${hlQ(yr.title, q)} · ${hlQ(b.author, q)}`, '', `linear-gradient(135deg,${c1},${c2})`);
  }).join('');
  if (chapters.length) html += '<div class="s-sec">📖 अध्याय</div>' + chapters.map(c =>
    row(`openBookWithBreadcrumb('${c.bookId}',${c.yearId},${c.chapterIdx})`, '📖', c.chapterTitle, '📘 ' + hlQ(c.bookTitle, q), c.snip)).join('');
  if (news.length) html += '<div class="s-sec">📰 सूचना पाटी</div>' + news.map(n =>
    row(`App.newsIdx=${n.i};openNewsCurrent()`, '📰', n.title || 'समाचार', n.date ? hlQ(n.date, q) : '', n.snip)).join('');
  if (feed.length) html += '<div class="s-sec">🗞️ समाचार / फिड</div>' + feed.map(n =>
    row(`go('news')`, '🗞️', n.title || 'पोस्ट', n.date ? hlQ(n.date, q) : '', n.snip)).join('');
  if (notes.length) html += '<div class="s-sec">📝 मेरा नोट</div>' + notes.map(n =>
    row(`editNote('${String(n.id).replace(/'/g, '')}')`, '📝', n.title, n.date ? hlQ(n.date, q) : '', n.snip)).join('');
  el.innerHTML = html;
}

/* ════════════════════════════════════
   NOTES
   ════════════════════════════════════ */
function initNotes() {
  const fab=document.getElementById('notesFab');
  if(fab) fab.addEventListener('click',()=>openNoteModal());
  document.getElementById('closeNoteModal')?.addEventListener('click',()=>closeOv('noteModal'));
  document.getElementById('noteForm')?.addEventListener('submit',e=>{e.preventDefault();saveNote();});
}

/* ════════════════════════════════════
   BOOKMARKS PAGE — किताब + अध्याय दुवैका bookmark एकै ठाउँमा
   ════════════════════════════════════ */
/* ════════════════════════════════════
   PRINT — अध्याय (screen मा जस्तै style मा, orientation/column छानेर)
   ════════════════════════════════════ */
App._printTarget = null;
function openPrintOptions(bookId, idx) {
  App._printTarget = { bookId, idx };
  openOv('printOptionsModal');
}
window.openPrintOptions = openPrintOptions;

function doPrintChapter() {
  if (!App._printTarget) return;
  const { bookId, idx } = App._printTarget;
  const ch = (App.chaptersCache[bookId] || [])[idx];
  if (!ch) { closeOv('printOptionsModal'); return; }

  const orientation = document.querySelector('input[name="printOrient"]:checked')?.value || 'portrait';
  const cols = parseInt(document.getElementById('printColsSelect').value || '1', 10);
  const fontFamily = ch.font && typeof fontCssFor === 'function' ? `font-family:${fontCssFor(ch.font)}` : '';
  const titleHtml = `<div class="print-title">${ch.title || ('अध्याय ' + (idx + 1))}</div>`;
  // हरेक भाग (--- रेखाले छुट्याएको) एउटै पानामा पुरा आओस् — बीचमा काटिएर अर्को पानामा नजाओस्
  const bodyHtml = renderMd(ch.content || '').split('<hr>').map(sec => `<div class="print-sec">${sec}</div>`).join('<hr>');

  let styleTag = document.getElementById('printPageStyle');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'printPageStyle';
    document.head.appendChild(styleTag);
  }

  const area = document.getElementById('printArea');
  const pageW = orientation === 'landscape' ? 297 : 210;
  const pageH = orientation === 'landscape' ? 210 : 297;

  styleTag.textContent = `
    @page { size: ${pageW}mm ${pageH}mm; margin: 14mm; }
    @media print {
      #printArea .print-body {
        column-count: ${cols};
        column-gap: 24px;
        ${cols > 1 ? 'column-rule: 1px solid var(--divider);' : ''}
      }
    }
  `;
  area.innerHTML = `${titleHtml}<div class="print-body ch-read-content" lang="hi" style="${fontFamily}">${bodyHtml}</div>`;

  closeOv('printOptionsModal');
  setTimeout(() => window.print(), 200); // sheet बन्द हुने animation सकिएपछि print dialog खोल्ने
}
window.doPrintChapter = doPrintChapter;

function findBookLocation(bookId) {
  for (const yr of (App.data?.years || [])) {
    for (const [key, books] of orderedSubjectEntries(yr.subjects || {})) {
      const b = (books || []).find(x => x.id === bookId);
      if (b) return { book: b, yearId: yr.id, yearTitle: yr.title, subjectKey: key };
    }
  }
  return null;
}
window.findBookLocation = findBookLocation;

/* किताबमा जाँदा बीचका सबै चरण (वर्ष → विषय-ट्याब → किताब) history मा राख्ने,
   ताकि जहाँबाट पनि (recent history, bookmark, search) पुगे पनि back ले क्रमैसँग फर्काओस् */
function openBookWithBreadcrumb(bookId, yearId, chapterIdx) {
  const bookLoc = findBookLocation(bookId);
  go('year', { yearId });
  if (bookLoc && bookLoc.subjectKey) setYearSubjectTab(yearId, bookLoc.subjectKey);
  go('subject', { subjectId: bookId, yearId });
  if (typeof chapterIdx === 'number' && chapterIdx >= 0) {
    setTimeout(() => {
      const el = document.getElementById(`chi-${bookId}-${chapterIdx}`);
      if (el) {
        toggleCh(bookId, chapterIdx); el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {                                              // खोजेको शब्द रङ्गिन बनाएर पहिलो शब्दमा पुर्‍याउने
          if (docHiliteSync() || el.querySelector('mark.s-hit-doc')) { const m = el.querySelector('mark.s-hit-doc'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }, 350);
      }
    }, 450);
  }
}
window.openBookWithBreadcrumb = openBookWithBreadcrumb;

function renderBookmarksPage() {
  const el = document.getElementById('bookmarksList');
  if (!el) return;

  const bookRows = (App.bookmarks || []).map(bookId => {
    const loc = findBookLocation(bookId);
    if (!loc) return null;
    const s = SUBJ[loc.subjectKey] || { label: loc.subjectKey };
    return { type: 'book', bookId, title: loc.book.title, sub: `${s.label} · ${loc.yearTitle}`, yearId: loc.yearId };
  }).filter(Boolean);

  const chapterRows = (App.chapterBookmarks || []).map(key => {
    const sep = key.lastIndexOf('::');
    const bookId = key.slice(0, sep);
    const idx = parseInt(key.slice(sep + 2), 10);
    const loc = findBookLocation(bookId);
    if (!loc) return null;
    const chs = App.chaptersCache[bookId];
    const chTitle = (chs && chs[idx] && chs[idx].title) || `अध्याय ${idx + 1}`;
    return { type: 'chapter', bookId, idx, title: chTitle, sub: `📘 ${loc.book.title}`, yearId: loc.yearId };
  }).filter(Boolean);

  const rows = [...bookRows, ...chapterRows];

  if (!rows.length) {
    el.innerHTML = '<div class="empty"><div class="empty-ico">🔖</div><div class="empty-t">कुनै Bookmark छैन</div><div class="empty-s">किताब वा अध्यायमा 🏷️ थिचेर bookmark गर्नुस्</div></div>';
    return;
  }

  el.innerHTML = rows.map(r => {
    const action = r.type === 'book'
      ? `openBookWithBreadcrumb('${r.bookId}',${r.yearId})`
      : `openBookWithBreadcrumb('${r.bookId}',${r.yearId},${r.idx})`;
    return `
    <div class="note-card" style="cursor:pointer" onclick="${action}">
      <div class="nc2-head">
        <div class="nc2-title">${r.type === 'chapter' ? '📖 ' : '📘 '}${r.title}</div>
      </div>
      <div class="nc2-foot"><span class="nc2-date">${r.sub}</span></div>
    </div>`;
  }).join('');
}
window.renderBookmarksPage = renderBookmarksPage;

function renderNotes() {
  const el=document.getElementById('notesList');
  if(!el) return;
  if(!App.notes.length){
    el.innerHTML='<div class="empty"><div class="empty-ico">📝</div><div class="empty-t">कुनै नोट छैन</div></div>';
    return;
  }
  el.innerHTML=App.notes.map(n=>`
    <div class="note-card">
      <div class="nc2-head">
        <div class="nc2-title">${n.title}</div>
        <div class="nc2-actions">
          <button class="nc2-btn" onclick="editNote('${n.id}')">✏️</button>
          <button class="nc2-btn del" onclick="delNote('${n.id}')">🗑️</button>
        </div>
      </div>
      <div class="nc2-body">${n.content}</div>
      <div class="nc2-foot">
        <span class="nc2-date">${n.date}</span>
        ${n.subject?`<span class="nc2-tag">${n.subject}</span>`:''}
      </div>
    </div>`).join('');
}

function renderBookNotes(subj) {
  const el=document.getElementById('bookNotes');
  if(!el) return;
  const notes=App.notes.filter(n=>n.subject===subj);
  if(!notes.length){el.innerHTML='<div class="empty"><div class="empty-ico">📝</div><div class="empty-t">यो किताबको नोट छैन</div></div>';return;}
  el.innerHTML=notes.map(n=>`<div class="note-card"><div class="nc2-title">${n.title}</div><div class="nc2-body">${n.content}</div><div class="nc2-foot"><span class="nc2-date">${n.date}</span></div></div>`).join('');
}

function openNoteModal(subj='') {
  App.editNoteId=null;
  document.getElementById('noteMT').textContent='नयाँ नोट';
  document.getElementById('nTitle').value='';
  document.getElementById('nContent').value='';
  document.getElementById('nSubject').value=subj;
  openOv('noteModal');
}
window.openNoteModal = openNoteModal;

function saveNote() {
  const t=document.getElementById('nTitle').value.trim();
  const c=document.getElementById('nContent').value.trim();
  const s=document.getElementById('nSubject').value.trim();
  if(!t||!c){toast('शीर्षक र सामग्री आवश्यक!');return;}
  if(App.editNoteId){const n=App.notes.find(x=>x.id===App.editNoteId);if(n) Object.assign(n,{title:t,content:c,subject:s});}
  else App.notes.unshift({id:Date.now().toString(),title:t,content:c,subject:s,date:new Date().toLocaleDateString('ne-NP')});
  localStorage.setItem('sp_notes',JSON.stringify(App.notes));
  closeOv('noteModal');
  renderNotes();
  toast('नोट सुरक्षित ✓');
}

function editNote(id){
  const n=App.notes.find(x=>x.id===id);if(!n) return;
  App.editNoteId=id;
  document.getElementById('noteMT').textContent='नोट सम्पादन';
  document.getElementById('nTitle').value=n.title;
  document.getElementById('nContent').value=n.content;
  document.getElementById('nSubject').value=n.subject||'';
  openOv('noteModal');
}
window.editNote=editNote;

function delNote(id){App.notes=App.notes.filter(n=>n.id!==id);localStorage.setItem('sp_notes',JSON.stringify(App.notes));renderNotes();toast('नोट मेटियो');}
window.delNote=delNote;

/* ════════════════════════════════════
   COURSES
   ════════════════════════════════════ */
/* समाचार पेजको एउटा card — वास्तविक पेज र Admin को पूर्वावलोकन (preview=true) दुवैमा उही markup */
function feedCardHtml(n, i, preview) {
    const bodyHtml = renderMd(n.content || '');
    const isAuthored = !!n.authorName;
    const avatarHtml = isAuthored
      ? `<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;flex-shrink:0">${(n.authorName||'?').trim().charAt(0)}</div>`
      : `<div style="width:38px;height:38px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;box-shadow:0 1px 3px var(--shadow)"><img src="images/icons/logo.svg" alt="शास्त्री पोर्टल" style="width:24px;height:24px;display:block"></div>`;
    return `
    <div ondblclick="if(!String(getSelection()).trim())toggleFeedBody(${i})" style="background:var(--surface);border:1px solid var(--surface-b);border-radius:var(--r-md);margin-bottom:14px;overflow:hidden;box-shadow:0 3px 12px var(--shadow)">
      <div style="padding:12px 14px 8px;display:flex;align-items:center;gap:9px">
        ${avatarHtml}
        <div style="flex:1;min-width:0">
          <div style="font-size:0.8rem;font-weight:700;color:var(--text-1)">${isAuthored ? n.authorName : 'शास्त्री पोर्टल'}</div>
          <div style="font-size:0.68rem;color:var(--text-3)">${n.date||''}${n.category?' · '+n.category:''}</div>
        </div>
        ${App.isAdmin && !preview ? `<div style="display:flex;gap:8px;flex-shrink:0">
          <button onclick="event.stopPropagation();editFeedPostByIdx(${i})" style="background:none;border:none;font-size:1rem;cursor:pointer">✏️</button>
          <button onclick="event.stopPropagation();deleteFeedPostAt(${i})" style="background:none;border:none;font-size:1rem;cursor:pointer">🗑️</button>
        </div>` : ''}
      </div>
      ${n.image ? `<img src="${n.image}" style="width:100%;height:220px;object-fit:cover;display:block;background:var(--surface-b)" loading="lazy">` : ''}
      <div style="padding:10px 14px 14px">
        <div style="font-size:0.88rem;font-weight:700;color:var(--text-1);margin-bottom:4px">${n.title||''}</div>
        <div class="feed-body ch-read-content" id="feedBody${i}" style="padding:0;font-size:0.8rem;line-height:1.6;max-height:5.2em;overflow:hidden;transition:max-height 0.32s var(--ease-out)">${bodyHtml}</div>
      </div>
    </div>`;
}
window.feedCardHtml = feedCardHtml;

async function renderNewsListPage() {
  const el = document.getElementById('newsListPage');
  if (!el) return;
  el.innerHTML = '<div class="spin-wrap"><div class="spinner"></div></div>';
  const items = App.feedPosts || [];

  const addBtn = !App.isAdmin ? '' : `<button onclick="openNoticeForm(null,'feed')" style="width:100%;padding:12px;margin-bottom:14px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border:none;border-radius:var(--r-md);font-weight:700;font-size:0.86rem;cursor:pointer;box-shadow:0 4px 14px var(--accent-glow)">➕ नयाँ पोस्ट लेख्नुस्</button>`;

  if (!items.length) {
    el.innerHTML = addBtn + '<div class="empty"><div class="empty-ico">📭</div><div class="empty-t">अझै कुनै समाचार छैन</div></div>';
    return;
  }

  el.innerHTML = addBtn + items.map((n, i) => feedCardHtml(n, i, false)).join('');
}
window.renderNewsListPage = renderNewsListPage;

function toggleFeedBody(i) {
  const body = document.getElementById('feedBody'+i);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  body.style.maxHeight = isOpen ? body.scrollHeight + 'px' : '5.2em';
}
window.toggleFeedBody = toggleFeedBody;

/* ════════════════════════════════════
   PROFILE
   ════════════════════════════════════ */
function renderProfile() {
  renderHistory();

  // Night mode toggle - sync with current theme
  const tog = document.getElementById('profileDarkTog');
  if (tog) {
    tog.classList.toggle('on', App.theme === 'dark');
    tog.onclick = () => {
      const isDark = App.theme === 'dark';
      applyTheme(isDark ? 'light' : 'dark');
    };
  }

  // Font size slider
  const sl = document.getElementById('profFontSlider');
  const lb = document.getElementById('profFontLbl');
  if (sl) {
    sl.value = App.fontSize;
    if (lb) lb.textContent = App.fontSize + 'px';
    sl.oninput = () => {
      applyFontSize(+sl.value);
      if (lb) lb.textContent = sl.value + 'px';
    };
  }

}


function renderHistory() {
  const el=document.getElementById('histList');
  if(!el) return;
  if(!App.history.length){el.innerHTML='<div class="empty"><div class="empty-ico">🕐</div><div class="empty-t">इतिहास छैन</div></div>';return;}
  el.innerHTML=App.history.slice(0,8).map(h=>`
    <div class="hist-item" onclick="openBookWithBreadcrumb('${h.id}',${h.yearId})">
      <span class="hi-ico">📖</span>
      <div><div class="hi-name">${h.title}</div><div class="hi-sub">${h.year}</div></div>
      <span class="hi-time">${h.time}</span>
    </div>`).join('');
}

function exportData() {
  const d={notes:App.notes,bookmarks:App.bookmarks,chapterBookmarks:App.chapterBookmarks,history:App.history};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
  a.download='shastri-backup-'+Date.now()+'.json';
  a.click();
  toast('Backup download भयो ✓');
}
window.exportData=exportData;

/* ════════════════════════════════════
   OFFLINE — सबै अध्याय/फोटो फोनमै Save/Delete
   ════════════════════════════════════ */
async function saveOfflineData() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    toast('Offline सुविधा उपलब्ध छैन (Service Worker तयार छैन)');
    return;
  }
  if (!App.data) { toast('डाटा अझै लोड भइरहेको छ, फेरि प्रयास गर्नुस्'); return; }

  const btn = document.getElementById('offlineSaveBtn');
  if (btn) btn.style.opacity = '0.55';
  toast('अफलाइनको लागि तयार हुँदैछ… (केही सेकेन्ड लाग्न सक्छ)');

  const urls = new Set([
    './','index.html','css/style.css','js/main.js','js/admin.js','js/github-api.js','js/editor-toolbar.js',
    'data/books.json','data/subjects.json','data/news.json','data/feed.json','manifest.json',
    'images/news/board.jpg','images/icons/logo.svg',
  ]);
  const bookIds = [];
  App.data.years.forEach(yr => Object.values(yr.subjects).forEach(books => books.forEach(b => {
    bookIds.push(b.id);
    if (b.cover) urls.add(b.cover);
  })));
  if (App.data.news) App.data.news.forEach(n => { if (n.image) urls.add(n.image); });
  (App.feedPosts || []).forEach(n => { if (n.image) urls.add(n.image); });

  // हरेक किताबको अध्याय फाइल — नयाँ data/chapters/{bookId}.json, नभए पुरानो {bookId}/1.js, 2.js...
  for (const bookId of bookIds) {
    const jsonUrl = `data/chapters/${bookId}.json`;
    let found = false;
    try {
      const r = await fetch(jsonUrl, { cache: 'no-cache' });
      if (r.ok) {
        urls.add(jsonUrl); found = true;
        // अध्याय भित्रका फोटो पनि offline मा राख्ने
        try { const txt = await r.clone().text(); txt.replace(/\]\((images\/[^)\s"\\]+)\)/g, (m, u) => { urls.add(u); return m; }); } catch (e) {}
      }
    } catch (e) {}
    if (!found) {
      let i = 1;
      while (true) {
        const url = `data/chapters/${bookId}/${i}.js`;
        try {
          const r = await fetch(url);
          if (!r.ok) break;
          urls.add(url);
          i++;
        } catch { break; }
      }
    }
  }

  navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls: [...urls] });
}
window.saveOfflineData = saveOfflineData;

function deleteOfflineData() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    toast('Offline सुविधा उपलब्ध छैन');
    return;
  }
  navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_OFFLINE' });
  // पुराना cache गरिएको localStorage डाटा पनि सँगै हटाउने
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sp_cache_')) localStorage.removeItem(k);
    });
  } catch (e) {}
}
window.deleteOfflineData = deleteOfflineData;

/* अनलाइन हुँदा सबै अध्यायहरू पृष्ठभूमिमा आफैं सेभ (offline मा देखिनका लागि; Data Saver खुल्लै भए छोड्ने) */
async function prefetchChaptersForOffline() {
  try {
    if (!navigator.onLine || !App.data || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    if (navigator.connection && navigator.connection.saveData) return;
    const ids = [];
    App.data.years.forEach(yr => Object.values(yr.subjects).forEach(bs => bs.forEach(b => ids.push(b.id))));
    for (const id of ids) {
      try { const r = await fetch(`data/chapters/${id}.json`); if (r.ok) await r.text(); } catch (e) {}
    }
  } catch (e) {}
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(() => setTimeout(prefetchChaptersForOffline, 6000));
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    const btn = document.getElementById('offlineSaveBtn');
    if (d.type === 'CACHE_DONE') {
      if (btn) btn.style.opacity = '1';
      toast(`✓ अफलाइनको लागि सुरक्षित भयो (${d.done}/${d.total})`);
    }
    if (d.type === 'CLEAR_DONE') {
      toast('🗑️ अफलाइन डाटा हटाइयो');
    }
  });
}

function importData(e) {
  const file=e.target.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(d.notes){App.notes=d.notes;localStorage.setItem('sp_notes',JSON.stringify(d.notes));}
      if(d.bookmarks){App.bookmarks=d.bookmarks;localStorage.setItem('sp_bookmarks',JSON.stringify(d.bookmarks));}
      if(d.chapterBookmarks){App.chapterBookmarks=d.chapterBookmarks;localStorage.setItem('sp_chapter_bookmarks',JSON.stringify(d.chapterBookmarks));}
      if(d.history){App.history=d.history;localStorage.setItem('sp_history',JSON.stringify(d.history));}
      toast('Import भयो ✓'); renderProfile();
    }catch{toast('File गलत छ!');}
  };
  r.readAsText(file);
}
window.importData=importData;

/* ════════════════════════════════════
   OVERLAY HELPERS
   ════════════════════════════════════ */
/* Admin Panel को पङ्क्ति थिच्दा तलबाट कार्ड नआई, किताबको अध्याय जस्तै त्यही पङ्क्तिको ठीक तल खुल्ने (inline) */
const INLINE_OV = { adminNoticesModal: 'adminNoticesModal', adminBooksModal: 'adminBooksModal', adminSuggestModal: 'adminSuggestModal', adminSubjectsModal: 'adminSubjectsModal', zipUploadModal: 'zipUploadModal' };
function initAdminInline() {
  const box = document.getElementById('adminPanelBox'); if (!box || box.dataset.inl) return;
  box.dataset.inl = '1';
  box.querySelectorAll('.sett-row').forEach(row => {
    const m = /(?:openOv\('(\w+)'\)|(adminBooksOpen|adminSuggestOpen|adminSubjectsOpen|zipUploadOpen)\(\))/.exec(row.getAttribute('onclick') || '');
    if (!m) return;
    const ovId = m[1] || { adminBooksOpen: 'adminBooksModal', adminSuggestOpen: 'adminSuggestModal', adminSubjectsOpen: 'adminSubjectsModal', zipUploadOpen: 'zipUploadModal' }[m[2]];
    const ov = document.getElementById(ovId); if (!ov || !INLINE_OV[ovId]) return;
    const open = row.getAttribute('onclick'); row.removeAttribute('onclick');
    ov.classList.add('ov-inline'); ov.removeAttribute('onclick');
    row.after(ov); row.classList.add('sett-row-exp');
    row.addEventListener('click', () => {
      if (ov.classList.contains('open')) { closeOv(ovId); row.classList.remove('exp'); return; }
      row.classList.add('exp');
      requestAnimationFrame(() => requestAnimationFrame(() => (new Function(open))()));   // पहिले दबेको स्थिति देखाएर मात्र सामग्री बनाउने — छुँदा अड्किँदैन
    });
  });
}
window.initAdminInline = initAdminInline;
function openOv(id){
  document.getElementById(id)?.classList.add('open');
  if (INLINE_OV[id]) return;                                  // inline पङ्क्तिले history entry थप्दैन
  // Modal खुल्दा एउटा छुट्टै history entry थपिन्छ, ताकि back/swipe गर्दा
  // सिधै पेज नबदलिई पहिले modal मात्र बन्द होस्।
  if (!App_navigatingFromPopstate) history.pushState({ modal: id }, '');
}
function closeOv(id){
  const ov = document.getElementById(id);
  ov?.classList.remove('open');
  ov?.querySelector('.modal-sheet')?.classList.remove('sheet-expanded'); // अर्को पटक सामान्य आकारमै खुल्ने
  if (INLINE_OV[id]) { document.querySelectorAll('#adminPanelBox .sett-row-exp').forEach(r => { if (r.nextElementSibling === ov) r.classList.remove('exp'); }); return; }
  // यदि यो modal ले नै history मा entry थपेको हो भने, त्यो entry हटाउने
  if (!App_navigatingFromPopstate && history.state && history.state.modal === id) {
    App_closingModalId = id;
    history.back();
  }
}
window.openOv=openOv; window.closeOv=closeOv;

/* ════════════════════════════════════
   सामान्य Confirm/Prompt — browser को confirm()/prompt() को ठाउँमा
   ════════════════════════════════════ */
let _confirmResolve = null;
function showConfirm(message, okLabel = 'मेटाउनुस्', title = 'पक्का हो?') {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    const t = document.getElementById('confirmTitle'); if (t) t.textContent = title;
    const m = document.getElementById('confirmMsg');   if (m) m.textContent = message;
    const b = document.getElementById('confirmOkBtn'); if (b) b.textContent = okLabel;
    openOv('confirmModal');
  });
}
window.showConfirm = showConfirm;
function _confirmOk() { closeOv('confirmModal'); if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; } }
function _confirmCancel() { closeOv('confirmModal'); if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; } }
window._confirmOk = _confirmOk; window._confirmCancel = _confirmCancel;

let _textPromptResolve = null;
function showTextPrompt(title, placeholder = '', defaultValue = '') {
  return new Promise(resolve => {
    _textPromptResolve = resolve;
    const t = document.getElementById('textPromptTitle'); if (t) t.textContent = title;
    const inp = document.getElementById('textPromptInput');
    if (inp) { inp.placeholder = placeholder; inp.value = defaultValue; }
    openOv('textPromptModal');
    setTimeout(() => inp?.focus(), 320);
  });
}
window.showTextPrompt = showTextPrompt;
function _textPromptOk() {
  const inp = document.getElementById('textPromptInput');
  const val = inp ? inp.value.trim() : '';
  closeOv('textPromptModal');
  if (_textPromptResolve) { _textPromptResolve(val || null); _textPromptResolve = null; }
}
function _textPromptCancel() {
  closeOv('textPromptModal');
  if (_textPromptResolve) { _textPromptResolve(null); _textPromptResolve = null; }
}
window._textPromptOk = _textPromptOk; window._textPromptCancel = _textPromptCancel;

/* माथि तानेर पूरा-स्क्रिन बनाउने, तल तानेर बन्द गर्ने — modal sheet को handle बाट */
function initSheetDragGestures() {
  document.querySelectorAll('.modal-sheet').forEach(sheet => {
    const handle = sheet.querySelector('.m-handle');
    if (!handle || handle._dragBound) return;
    handle._dragBound = true;

    let startY = 0, curY = 0, dragging = false;

    const onStart = (e) => {
      dragging = true;
      startY = curY = (e.touches ? e.touches[0].clientY : e.clientY);
      sheet.style.transition = 'none';
    };
    const onMove = (e) => {
      if (!dragging) return;
      curY = (e.touches ? e.touches[0].clientY : e.clientY);
      const dy = curY - startY; // धनात्मक = तल, ऋणात्मक = माथि
      if (dy > 0) {
        sheet.style.transform = `translateY(${dy}px)`;
      } else {
        const pull = Math.min(-dy, 100);
        sheet.style.transform = `translateY(${-pull * 0.25}px)`;
      }
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = '';
      sheet.style.transform = '';
      const dy = curY - startY;
      const ov = sheet.closest('.overlay');
      if (dy > 85 && ov) {
        closeOv(ov.id);           // पर्याप्त तल तानेपछि — बन्द
      } else if (dy < -55) {
        sheet.classList.add('sheet-expanded'); // पर्याप्त माथि तानेपछि — पूरा स्क्रिन
      }
    };

    handle.addEventListener('touchstart', onStart, { passive: true });
    handle.addEventListener('touchmove', onMove, { passive: true });
    handle.addEventListener('touchend', onEnd);
    handle.addEventListener('touchcancel', onEnd);
  });
}
window.initSheetDragGestures = initSheetDragGestures;

/* ════════════════════════════════════
   TOAST
   ════════════════════════════════════ */
function toast(msg) {
  const t=document.getElementById('toastEl');
  if(!t) return;
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2400);
}
window.toast=toast;


/* ═══════════════════════════════════
   PDF दर्शक: PDF का पृष्ठहरू अध्यायभित्र चित्र जस्तै (PDF.js, पृष्ठ देखिन लाग्दा मात्र बनाउने)
   ═══════════════════════════════════ */
const PDFV = (() => {
  const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let libP = null, mountIO = null;
  const lib = () => window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  function loadLib() {
    if (lib()) return Promise.resolve();
    if (libP) return libP;
    libP = (async () => {
      const [js, wk] = await Promise.all([
        fetch(BASE + 'pdf.min.js', { mode: 'cors' }).then(r => { if (!r.ok) throw new Error('pdf.js लोड भएन'); return r.text(); }),
        fetch(BASE + 'pdf.worker.min.js', { mode: 'cors' }).then(r => { if (!r.ok) throw new Error('pdf worker लोड भएन'); return r.blob(); }),
      ]);
      const sc = document.createElement('script'); sc.textContent = js; document.head.appendChild(sc);
      lib().GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([wk], { type: 'text/javascript' }));
    })().catch(e => { libP = null; throw e; });
    return libP;
  }
  /* ── पृष्ठ बनाउने व्यवस्थापक: नजिकको पृष्ठ पहिले, पहिले छिटो हल्का चित्र (low-res) अनि स्पष्ट (hi-res), एकैपटक २ वटा मात्र ── */
  const ST = { wanted: new Set(), running: 0, max: 2, done: [] };
  const dist = w => { const r = w.getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - innerHeight / 2); };
  function setImg(w, blob, ratio, hi) {
    const old = w.querySelector('img');
    const url = URL.createObjectURL(blob);
    if (old) { const u = old.src; old.src = url; if (u.startsWith('blob:')) URL.revokeObjectURL(u); }
    else { const img = new Image(); img.alt = 'PDF पृष्ठ ' + w.dataset.n; img.decoding = 'async'; img.src = url; w.innerHTML = ''; w.appendChild(img); }
    w.style.aspectRatio = String(ratio); w.classList.add('done'); w._state = hi ? 2 : 1;
  }
  async function renderStage(w, hi) {
    const n = +w.dataset.n;
    try {
      const page = await (w._pg || (w._pg = w._pdf.getPage(n)));
      const base = page.getViewport({ scale: 1 });
      const cssW = w.clientWidth || 360, dpr = window.devicePixelRatio || 1;
      // स्क्रिनकै पिक्सेल (devicePixelRatio) जति — दोब्बर होइन। ठूलो गर्दा zoom ले PDF बाट नै फेरि स्पष्ट बनाउँछ
      const targetW = Math.min(1500, Math.max(900, cssW * dpr));
      let scale = targetW / base.width;
      if (base.width * scale * base.height * scale > 4e6) scale = Math.sqrt(4e6 / (base.width * base.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      c.width = c.height = 0;
      setImg(w, blob, base.width / base.height, hi);
      if (hi) { page.cleanup(); }
      const k = ST.done.indexOf(w); if (k >= 0) ST.done.splice(k, 1); ST.done.push(w);
      while (ST.done.length > 36) {          // दूरका पुराना पृष्ठ मेमोरीबाट हटाउने (फेरि चाहिँदा बन्छ)
        const o = ST.done.shift();
        if (o._want || o === w) { ST.done.push(o); break; }
        const im = o.querySelector('img'); if (im && im.src.startsWith('blob:')) URL.revokeObjectURL(im.src);
        o.innerHTML = ''; o.classList.remove('done'); o._state = 0; o._pg = null;
      }
    } catch (e) { if (!w.querySelector('img')) w.innerHTML = '<div class="pdf-ph">⚠️ पृष्ठ ' + n + ' देखाउन सकिएन</div>'; w._state = Math.max(w._state || 0, 2); }
  }
  function pump() {
    while (ST.running < ST.max) {
      let best = null, bk = 0, bd = 0;
      ST.wanted.forEach(w => {
        if (w._busy || (w._state || 0) >= 2 || !w.isConnected) return;
        const key = 0, d = dist(w);                            // सबैभन्दा नजिकको पृष्ठ पहिले
        if (!best || key < bk || (key === bk && d < bd)) { best = w; bk = key; bd = d; }
      });
      if (!best) break;
      best._busy = true; ST.running++;
      renderStage(best, true).finally(() => { best._busy = false; ST.running--; pump(); });   // नापजाँचमा हल्का चरणले समय बचाएन — सिधै स्पष्ट
    }
  }
  function want(w, on) {
    w._want = on;
    if (on) { ST.wanted.add(w); pump(); } else ST.wanted.delete(w);
  }
  /* PDF को सुरुका बाइट मात्र जाँच्ने: साइटले PDF को सट्टा HTML दियो कि? (पूरै फाइल तान्दैन) */
  async function sniff(src) {
    const r = await fetch(src, { headers: { Range: 'bytes=0-15' }, cache: 'no-store' });
    if (!r.ok && r.status !== 206) throw new Error('PDF फाइल भेटिएन (' + r.status + ')');
    let head;
    if (r.body && r.body.getReader) { const rd = r.body.getReader(); const { value } = await rd.read(); try { rd.cancel(); } catch (e) {} head = value || new Uint8Array(0); }
    else head = new Uint8Array(await r.arrayBuffer());
    if (String.fromCharCode.apply(null, head.subarray(0, 5)) !== '%PDF-') throw new Error('PDF फाइल अझै साइटमा पुगेको छैन — Commit पछि १-२ मिनेट पर्खेर फेरि प्रयास गर्नुहोस्');
  }
  async function mount(el) {
    if (el.dataset.ready) return;
    el.dataset.ready = '1';
    const src = el.dataset.src;
    el.innerHTML = '<div class="pdf-ph">📄 PDF लोड हुँदैछ…</div>';
    try {
      await loadLib();
      let docSrc, cached = false;
      const hit = window.caches ? await caches.match(src).catch(() => null) : null;
      if (hit && !/text\/html/i.test(hit.headers.get('content-type') || '')) {      // फोनमा सेभ भएको छ भने तुरुन्तै (नेट नचाहिने)
        const buf = new Uint8Array(await hit.arrayBuffer());
        if (String.fromCharCode.apply(null, buf.subarray(0, 5)) === '%PDF-') { docSrc = { data: buf }; cached = true; }
      }
      if (!docSrc) {                                                                    // नत्र: पूरै तान्न नपर्ने (range/stream) — पहिलो पृष्ठ छिटो आउँछ
        await sniff(src);
        docSrc = { url: src, rangeChunkSize: 1 << 17, disableAutoFetch: true };
      }
      const pdf = await lib().getDocument(docSrc).promise;
      if (!cached && !(navigator.connection && navigator.connection.saveData)) {
        setTimeout(() => { fetch(src).then(r => r.ok ? r.arrayBuffer() : null).catch(() => {}); }, 3000);   // पछि पृष्ठभूमिमा पूरै सेभ (अफलाइन/अर्को पटक छिटो)
      }
      const p1 = await pdf.getPage(1); const v1 = p1.getViewport({ scale: 1 });
      el.innerHTML = '';
      const io = new IntersectionObserver(es => es.forEach(en => want(en.target, en.isIntersecting)), { rootMargin: '700px 0px' });
      for (let n = 1; n <= pdf.numPages; n++) {
        const w = document.createElement('div');
        w.className = 'pdf-page'; w.dataset.n = n; w.style.aspectRatio = String(v1.width / v1.height);
        w._pdf = pdf;
        el.appendChild(w); io.observe(w);
      }
    } catch (e) {
      el.dataset.ready = '';
      el.innerHTML = '<div class="pdf-ph">⚠️ <span class="pdf-err"></span> — <a href="#" class="pdf-retry">फेरि प्रयास</a> · <a href="' + src + '" target="_blank" rel="noopener">PDF खोल्नुहोस्</a></div>';
      el.querySelector('.pdf-err').textContent = 'PDF देखाउन सकिएन (' + (e && e.message ? e.message : 'त्रुटि') + ')';
      el.querySelector('.pdf-retry').onclick = ev => { ev.preventDefault(); el.dataset.ready = ''; mount(el); };
    }
  }
  function scan() {
    const els = document.querySelectorAll('.pdf-embed:not([data-obs])');
    if (!els.length) return;
    if (!mountIO) mountIO = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { mountIO.unobserve(en.target); mount(en.target); }
    }), { rootMargin: '500px 0px' });
    els.forEach(el => { el.dataset.obs = '1'; mountIO.observe(el); });
  }
  /* पृष्ठमा थिचेर ठूलो गरेर हेर्ने — ठूलो गर्दा PDF बाट नै फेरि स्पष्ट (हाई-रिजोल्युसन) बनाउने, त्यसैले गुणस्तर घट्दैन */
  function openZoom(src, pageEl) {
    const ov = document.createElement('div');
    ov.className = 'pdf-zoom';
    ov.innerHTML = '<div class="pdf-zoom-bar"><button type="button" data-a="out" aria-label="सानो">−</button><button type="button" data-a="in" aria-label="ठूलो">+</button><button type="button" data-a="x" aria-label="बन्द">✕</button></div><div class="pdf-zoom-sc"><div class="pdf-zoom-pg"><img alt="PDF पृष्ठ"></div></div>';
    const sc = ov.querySelector('.pdf-zoom-sc'), box = ov.querySelector('.pdf-zoom-pg'), img = box.querySelector('img');
    img.src = src;
    let z = 2.2, cv = null, tmr = 0, token = 0;
    const apply = () => { box.style.width = (z * 100) + '%'; };
    const hi = async () => {                         // हाई-रिजोल्युसन क्यानभास
      if (!pageEl || !pageEl._pdf) return;
      const my = ++token;
      try {
        const page = await pageEl._pdf.getPage(+pageEl.dataset.n);
        const base = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        let pxW = Math.max(sc.clientWidth, 300) * z * dpr;
        const maxArea = 12e6;                          // फोनको क्यानभास सीमा भित्र
        let scale = pxW / base.width;
        if (base.width * scale * base.height * scale > maxArea) scale = Math.sqrt(maxArea / (base.width * base.height));
        const vp = page.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        if (my !== token || !ov.isConnected) return;   // बीचमा zoom फेरिएको वा बन्द भएको
        c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
        if (cv) cv.remove();
        cv = c; box.appendChild(c);
      } catch (e) {}
    };
    apply(); hi();
    ov.addEventListener('click', e => {
      const a = e.target.closest('button'); if (!a) return;
      const cx = (sc.scrollLeft + sc.clientWidth / 2) / sc.scrollWidth, cy = (sc.scrollTop + sc.clientHeight / 2) / sc.scrollHeight;
      if (a.dataset.a === 'x') { token++; ov.remove(); document.body.style.overflow = ''; return; }
      z = Math.max(1, Math.min(5, z + (a.dataset.a === 'in' ? 0.6 : -0.6))); apply();
      sc.scrollLeft = cx * sc.scrollWidth - sc.clientWidth / 2; sc.scrollTop = cy * sc.scrollHeight - sc.clientHeight / 2;
      clearTimeout(tmr); tmr = setTimeout(hi, 220);
    });
    document.body.style.overflow = 'hidden';
    document.body.appendChild(ov);
  }
  document.addEventListener('click', e => {
    const im = e.target.closest && e.target.closest('.pdf-page img');
    if (im) { e.preventDefault(); openZoom(im.src, im.closest('.pdf-page')); }
  });
  return { scan, mount };
})();
window.PDFV = PDFV;

/* ═══════════════════════════════════
   तैरिने नेभिगेसन बटन (SVG) — कुनै पनि कुनामा सार्न मिल्ने
   बटन थिच्दा: गृह · सूचना · खोज · बुकमार्क · सेटिङ
   ═══════════════════════════════════ */
function initNavFab() {
  if (document.getElementById('navFab')) return;
  const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    menu: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    home: svg('<path d="M3 11l9-7.5L21 11"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>'),
    back: svg('<path d="M10 6l-6 6 6 6"/><path d="M4 12h16"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    bm: svg('<path d="M6.5 3.5h11v17L12 16.5l-5.5 4z"/>'),
    set: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  };
  const ITEMS = [
    ['home',   'गृह',     'home'],
    ['back',   'पछाडि',   null],
    ['search', 'खोज',     'search'],
    ['bm',     'बुकमार्क', 'bookmarks'],
    ['set',    'सेटिङ',   'profile'],
  ];
  const root = document.createElement('div');
  root.id = 'navFab'; root.className = 'nav-fab';
  let corner = 'br'; try { corner = localStorage.getItem('sp_fab_corner') || 'br'; } catch (e) {}
  if (!/^(tl|tr|bl|br)$/.test(corner)) corner = 'br';
  root.dataset.corner = corner;
  root.innerHTML = `<div class="nav-fab-menu" hidden>${ITEMS.map(([k, lbl]) =>
      `<button type="button" class="nav-fab-item" data-k="${k}"><span class="nav-fab-ico">${ICON[k]}</span><span class="nav-fab-lbl">${lbl}</span></button>`).join('')}</div>
    <button type="button" class="nav-fab-btn" aria-label="मेनु" aria-expanded="false"><span class="nav-fab-i nav-fab-i-menu">${ICON.menu}</span><span class="nav-fab-i nav-fab-i-close">${ICON.close}</span></button>`;
  document.body.appendChild(root);
  const btn = root.querySelector('.nav-fab-btn'), menu = root.querySelector('.nav-fab-menu');

  const setOpen = on => {
    root.classList.toggle('open', on); menu.hidden = !on;
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  };
  menu.addEventListener('click', e => {
    const it = e.target.closest('.nav-fab-item'); if (!it) return;
    setOpen(false);
    const k = it.dataset.k, page = (ITEMS.find(x => x[0] === k) || [])[2];
    if (k === 'back') { history.back(); return; }
    const target = k === 'search' ? document.getElementById('navSearchBtn') : document.querySelector(`.nav-item[data-page="${page}"]`);
    if (target) target.click();
  });
  document.addEventListener('pointerdown', e => { if (root.classList.contains('open') && !root.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  window.addEventListener('scroll', () => { if (root.classList.contains('open')) setOpen(false); }, { passive: true });

  /* सार्न (drag) र छोड्दा नजिकको कुनामा बस्ने */
  const hdrH = () => { const h = document.querySelector('.site-header'); return (h ? h.offsetHeight : 60) + 10; };
  const M = 14;
  const posFor = c => {
    const w = btn.offsetWidth, h = btn.offsetHeight;
    const left = c[1] === 'l' ? M : innerWidth - w - M;
    const top = c[0] === 't' ? hdrH() : innerHeight - h - M - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0);
    return { left, top };
  };
  let drag = null;
  btn.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;
    const r = root.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
    try { btn.setPointerCapture(e.pointerId); } catch (er) {}
  });
  btn.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      drag.moved = true; setOpen(false);
      root.classList.add('dragging'); root.classList.remove('snapping');
      root.style.right = 'auto'; root.style.bottom = 'auto';
    }
    const w = btn.offsetWidth, h = btn.offsetHeight;
    root.style.left = Math.max(4, Math.min(innerWidth - w - 4, e.clientX - drag.ox)) + 'px';
    root.style.top = Math.max(4, Math.min(innerHeight - h - 4, e.clientY - drag.oy)) + 'px';
    e.preventDefault();
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { setOpen(!root.classList.contains('open')); return; }
    root.classList.remove('dragging');
    const r = root.getBoundingClientRect();
    const c = (r.top + r.height / 2 < innerHeight / 2 ? 't' : 'b') + (r.left + r.width / 2 < innerWidth / 2 ? 'l' : 'r');
    const p = posFor(c);
    root.classList.add('snapping');
    root.style.left = p.left + 'px'; root.style.top = p.top + 'px';
    setTimeout(() => {
      root.classList.remove('snapping');
      root.style.left = root.style.top = root.style.right = root.style.bottom = '';
      root.dataset.corner = c;
      try { localStorage.setItem('sp_fab_corner', c); } catch (er) {}
    }, 300);
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
window.initNavFab = initNavFab;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNavFab); else initNavFab();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminInline); else initAdminInline();

/* हेडरको उचाइ CSS मा (--hdr-h): ३ डट्स मेनु, टाँसिने पट्टी आदिका लागि */
(function () {
  const upd = () => { const h = document.querySelector('.site-header'); if (h) document.documentElement.style.setProperty('--hdr-h', h.offsetHeight + 'px'); };
  window.addEventListener('resize', upd);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', upd); else upd();
  setTimeout(upd, 600);
})();

/* ═══ सबै पप-अपको माथि ✕ (बन्द) बटन ═══ */
function initModalCloseButtons() {
  document.querySelectorAll('.overlay > .modal-sheet:not([data-x])').forEach(sh => {
    sh.dataset.x = '1';
    const bar = document.createElement('div');
    bar.className = 'm-x-bar';
    bar.innerHTML = '<button type="button" class="m-x" aria-label="बन्द">✕</button>';
    bar.firstChild.addEventListener('click', e => {
      e.stopPropagation();
      const ov = sh.closest('.overlay'); if (!ov) return;
      if (ov.id === 'confirmModal' && window._confirmCancel) return _confirmCancel();
      if (ov.id === 'textPromptModal' && window._textPromptCancel) return _textPromptCancel();
      closeOv(ov.id);
    });
    sh.insertBefore(bar, sh.firstChild);
  });
}
window.initModalCloseButtons = initModalCloseButtons;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initModalCloseButtons); else initModalCloseButtons();
setTimeout(initModalCloseButtons, 800);

/* ═══ नीलो बोर्डर (कार्ड र आइकन) — ३ डट्स मेनुबाट चालु/बन्द ═══ */
function applyBorders(on, save) {
  document.documentElement.classList.toggle('borders-on', !!on);
  if (save) { try { localStorage.setItem('sp_borders', on ? '1' : '0'); } catch (e) {} }
  const sub = document.getElementById('borderToggleSub'), sw = document.getElementById('borderSwitch');
  if (sub) sub.textContent = on ? 'चालु' : 'बन्द';
  if (sw) sw.classList.toggle('on', !!on);
}
function toggleBorders() { applyBorders(!document.documentElement.classList.contains('borders-on'), true); }
window.toggleBorders = toggleBorders;
(function () {
  let on = true; try { on = localStorage.getItem('sp_borders') !== '0'; } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyBorders(on, false)); else applyBorders(on, false);
})();

/* ═══ बोर्डरको रङ — ३ डट्स मेनुबाट (तयार रङ, इन्द्रेणी, वा कुनै पनि रङ) ═══ */
const BORDER_COLORS = [
  ['नीलो (सामान्य)', ''], ['आकाशी', '#29A8E0'], ['हरियो', '#2E9E5A'], ['सुन्तला', '#F08A24'], ['रातो', '#E5484D'],
  ['गुलाबी', '#D9468F'], ['बैजनी', '#7B4FD6'], ['खैरो', '#8A5A3A'], ['इन्द्रेणी (विभिन्न रङ)', 'rainbow'],
];
/* एउटै बोर्डरमा धेरै रङ (gradient) */
const BORDER_GRADS = [
  ['इन्द्रेणी', 'linear-gradient(135deg,#FF3B30,#FF9500,#FFCC00,#34C759,#00C7BE,#007AFF,#AF52DE)'],
  ['सूर्यास्त', 'linear-gradient(135deg,#FF512F,#F09819,#DD2476)'],
  ['समुद्र', 'linear-gradient(135deg,#2193B0,#6DD5ED,#2193B0)'],
  ['जङ्गल', 'linear-gradient(135deg,#11998E,#38EF7D,#11998E)'],
  ['अरोरा', 'linear-gradient(135deg,#4776E6,#8E54E9,#E96443)'],
  ['आगो', 'linear-gradient(135deg,#F12711,#F5AF19,#F12711)'],
  ['नीयन', 'linear-gradient(135deg,#00F5A0,#00D9F5,#8E2DE2,#FF2D95)'],
  ['चक्र (conic)', 'conic-gradient(from 0deg,#FF3B30,#FF9500,#FFCC00,#34C759,#00C7BE,#007AFF,#AF52DE,#FF3B30)'],
];
function applyBorderColor(val, save) {
  const html = document.documentElement;
  const gm = /^grad:(\d+)$/.exec(val || ''), gi = gm ? +gm[1] : -1, gOk = gi >= 0 && gi < BORDER_GRADS.length;
  const rb = val === 'rainbow', ok = /^#[0-9a-fA-F]{6}$/.test(val || '');
  html.classList.toggle('bd-rainbow', rb);
  html.classList.toggle('bd-grad-on', gOk);
  if (gOk) html.style.setProperty('--bd-grad', BORDER_GRADS[gi][1]); else html.style.removeProperty('--bd-grad');
  if (ok) html.style.setProperty('--bd-color', val); else html.style.removeProperty('--bd-color');
  if (save) { try { if (rb || gOk) localStorage.setItem('sp_bdcolor', gOk ? 'grad:' + gi : 'rainbow'); else if (ok) localStorage.setItem('sp_bdcolor', val); else localStorage.removeItem('sp_bdcolor'); } catch (e) {} }
  const cur = gOk ? 'grad:' + gi : rb ? 'rainbow' : ok ? val.toUpperCase() : '';
  document.querySelectorAll('#borderChips .bc-chip[data-c], #borderGradChips .bc-chip[data-c]').forEach(el => el.classList.toggle('on', (el.dataset.c || '') === cur));
  const cu = document.getElementById('borderCustom'); if (cu && ok) cu.value = val;
}
window.applyBorderColor = applyBorderColor;
function initBorderChips() {
  const box = document.getElementById('borderChips'); if (!box || box.dataset.ready) return;
  box.dataset.ready = '1';
  box.innerHTML = BORDER_COLORS.map(([n, c]) =>
    `<button type="button" class="bc-chip${c === 'rainbow' ? ' bc-rainbow' : ''}" data-c="${c}" title="${n}" style="${c && c !== 'rainbow' ? 'background:' + c : (c === '' ? 'background:#2878D8' : '')}"></button>`).join('') +
    '<label class="bc-chip bc-custom" title="अर्को रङ">＋<input type="color" id="borderCustom" value="#2878D8"></label>';
  box.addEventListener('click', e => { const b = e.target.closest('.bc-chip[data-c]'); if (b) applyBorderColor(b.dataset.c, true); });
  const cu = document.getElementById('borderCustom');
  cu.addEventListener('input', () => applyBorderColor(cu.value, true));
  const gb = document.getElementById('borderGradChips');
  if (gb && !gb.dataset.ready) {
    gb.dataset.ready = '1';
    gb.innerHTML = BORDER_GRADS.map(([n, g], i) => `<button type="button" class="bc-chip" data-c="grad:${i}" title="${n}" style="background:${g}"></button>`).join('');
    gb.addEventListener('click', e => { const b = e.target.closest('.bc-chip[data-c]'); if (b) applyBorderColor(b.dataset.c, true); });
  }
}
(function () {
  let c = ''; try { c = localStorage.getItem('sp_bdcolor') || ''; } catch (e) {}
  const run = () => { initBorderChips(); applyBorderColor(c, false); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();

// Expose App
window.App=App;
window.applyTheme=applyTheme;


/* नेपाल silhouette: स्क्रिनमा नदेखिँदा एनिमेसन रोक्ने (ब्याट्री बचत) */
(function () {
  const go = () => {
    const el = document.querySelector('.np-scene'); if (!el || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(es => es.forEach(e => { el.classList.toggle('np-paused', !e.isIntersecting); const sv = el.querySelector('svg'); if (sv && sv.pauseAnimations) { e.isIntersecting ? sv.unpauseAnimations() : sv.pauseAnimations(); } }), { threshold: 0 }).observe(el);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

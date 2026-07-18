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
  theme: localStorage.getItem('sp_theme') || 'light',
  fontSize: +(localStorage.getItem('sp_fontsize') || 15),
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
  profile: JSON.parse(localStorage.getItem('sp_profile') || JSON.stringify({
    name: 'विद्यार्थी',
    role: 'शास्त्री कक्षा पोर्टल',
    avatar: '',
    email: '',
    facebook: '',
    instagram: '',
    youtube: '',
    github: '',
    website: '',
  })),
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
const APP_BUILD_DATE  = '2026-07-04'; // YYYY-MM-DD — कोड जहिले अपडेट भयो त्यो मिति

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
  await loadData();
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

async function loadData() {
  // पहिला localStorage cache (अघिल्लो पटक अनलाइन हुँदा Firestore बाट आएर बचाइएको
  // वास्तविक admin डाटा) जाँच्ने — offline हुँदा वा नेटवर्क ढिलो हुँदा पनि admin ले
  // लेखेको डाटा तुरुन्तै देखियोस् भनेर (पुरानो data/books.json fallback भन्दा पहिले नै)
  let cachedBooks = null, cachedNews = null, cachedSubjects = null;
  try { const c = localStorage.getItem('sp_cache_books');    if (c) cachedBooks    = JSON.parse(c); } catch (e) {}
  try { const c = localStorage.getItem('sp_cache_notices');  if (c) cachedNews     = JSON.parse(c); } catch (e) {}
  try { const c = localStorage.getItem('sp_cache_subjects'); if (c) cachedSubjects = JSON.parse(c); } catch (e) {}

  // यी तीनवटा static फाइल एक-अर्कासँग सम्बन्धित छैनन् — क्रमैसँग (sequential) होइन,
  // सँगै (parallel) fetch गर्दा सुरुको लोडिङ धेरै छिटो हुन्छ (ढिलो नेटवर्कमा विशेष गरी)।
  // timeout पनि राखियो ताकि कमजोर/अड्किएको नेटवर्कले पूरै boot नै रोकिदिन नसकोस्।
  const [booksRes, staticNews, contribs] = await Promise.all([
    _fetchWithTimeout('data/books.json').then(r => r.ok ? r.json() : null).catch(() => null),
    fetchJsData('data/news.js'),
    fetchJsData('data/contributors.js'),
  ]);

  App.data = (booksRes && typeof booksRes === 'object') ? booksRes : { years: [] };
  // Cache भएको admin डाटा भए, पुरानो static/demo भन्दा त्यसैलाई प्राथमिकता दिने
  if (Array.isArray(cachedBooks) && cachedBooks.length) App.data.years = cachedBooks;
  if (cachedSubjects && Object.keys(cachedSubjects).length) Object.assign(SUBJ, cachedSubjects);

  // समाचार — data/news.js भए तुरुन्तै देखाउने (नभए खाली), अनि cache भए त्यसैले override गर्ने
  App.data.news = Array.isArray(staticNews) ? staticNews : (App.data?.news || []);
  if (Array.isArray(cachedNews) && cachedNews.length) App.data.news = cachedNews;

  if (typeof loadNoticesFromFirestore === 'function') {
    loadNoticesFromFirestore().then(fsNews => {
      if (Array.isArray(fsNews) && fsNews.length) App.data.news = fsNews;
      if (typeof setNews === 'function') setNews(0);
      if (typeof renderNewsBoardDots === 'function') renderNewsBoardDots();
      if (typeof renderTicker === 'function') renderTicker();
      if (typeof renderNewsCards === 'function') renderNewsCards();
      if (typeof renderAdminNoticeList === 'function') renderAdminNoticeList();
    }).catch(err => console.warn('Firestore समाचार background load असफल:', err.message));
  }

  // सहयोगी लिस्ट — छुट्टै data/contributors.js बाट (माथि नै parallel मा fetch भइसकियो)
  App.contributors = Array.isArray(contribs) ? contribs : [];

  // किताब — data/books.json भए तुरुन्तै देखाउने (माथि गरिसकियो),
  // Firestore बाट वास्तविक डाटा background मा (non-blocking) आएर override हुन्छ।
  // दुवैतिर (books.json र Firestore दुवै) डाटा नभेटिए मात्र demo/placeholder देखाउने,
  // ताकि पूरा GitHub डाटा हटाए पनि साइट खाली/बिग्रिएको नदेखियोस्।
  if (typeof loadBooksFromFirestore === 'function') {
    loadBooksFromFirestore().then(fsYears => {
      if (Array.isArray(fsYears) && fsYears.length) {
        App.data.years = fsYears;
      } else if (!App.data.years || !App.data.years.length) {
        App.data.years = makeFallback().years;
      }
      if (typeof refreshBookViews === 'function') refreshBookViews();
    }).catch(err => {
      console.warn('Firestore किताब background load असफल:', err.message);
      if (!App.data.years || !App.data.years.length) {
        App.data.years = makeFallback().years;
        if (typeof refreshBookViews === 'function') refreshBookViews();
      }
    });
  } else if (!App.data.years || !App.data.years.length) {
    App.data.years = makeFallback().years;
  }

  // विषय (Subject) नाम/नयाँ विषय — Admin ले थपेको/edit गरेको भए SUBJ लाई override/extend गर्ने
  if (typeof loadSubjectsFromFirestore === 'function') {
    loadSubjectsFromFirestore().then(fsSubj => {
      if (fsSubj && typeof fsSubj === 'object' && Object.keys(fsSubj).length) {
        Object.assign(SUBJ, fsSubj);
        if (typeof refreshBookViews === 'function') refreshBookViews();
        if (typeof renderAdminBooksSubjectTabs === 'function') renderAdminBooksSubjectTabs();
      }
    }).catch(err => console.warn('Firestore विषय background load असफल:', err.message));
  }
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
    years:[yr(1,'प्रथम वर्ष','पहिलो वर्ष','o'),yr(2,'द्वितीय वर्ष','दोस्रो वर्ष','g'),
           yr(3,'तृतीय वर्ष','तेस्रो वर्ष','b'),yr(4,'चतुर्थ वर्ष','चौथो वर्ष','p')],
    news:[]
  };
}

/* ════════════════════════════════════
   THEME  ← KEY FIX
   ════════════════════════════════════ */
function applyTheme(t, save=true) {
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
function initBackgroundCanvas() {
  const c = document.getElementById('bgCanvas');
  if (!c) return;
  window._bgCanvas = c;
  window._bgCtx = c.getContext('2d');
  resizeBg();
  window.addEventListener('resize', resizeBg);
  animateBg();
}

function resizeBg() {
  const c = window._bgCanvas;
  if (!c) return;
  c.width = window.innerWidth;
  c.height = window.innerHeight;
}

let _bgT = 0;
let _bgLastDraw = 0;
const _BG_FRAME_MS = 80; // ~12fps — bistara chalne blob को लागि यति नै पर्याप्त, 60/120Hz मा हरेक frame कोर्दा अनावश्यक heavy हुन्थ्यो
function animateBg(ts) {
  requestAnimationFrame(animateBg);
  if (document.hidden) return; // ट्याब/एप पृष्ठभूमिमा हुँदा नकोर्ने — ब्याट्री/CPU बचत
  if (ts && ts - _bgLastDraw < _BG_FRAME_MS) return; // display refresh जति भए पनि थ्रोटल गर्ने
  _bgLastDraw = ts || 0;
  _bgT += 0.02;
  drawBg();
}

function drawBg() {
  const c = window._bgCanvas;
  const ctx = window._bgCtx;
  if (!c || !ctx) return;
  const W = c.width, H = c.height;
  const t = App.theme;

  // Theme color maps
  const colors = {
    light:  { bg:'#EAE6DE', a:'rgba(245,192,122,0.55)', b:'rgba(168,216,176,0.45)', c:'rgba(144,196,232,0.40)', d:'rgba(196,168,224,0.40)' },
    green:  { bg:'#E2EDE6', a:'rgba(168,228,184,0.55)', b:'rgba(212,240,168,0.45)', c:'rgba(136,200,168,0.40)', d:'rgba(184,232,200,0.40)' },
    blue:   { bg:'#DDE8F4', a:'rgba(144,200,248,0.55)', b:'rgba(168,216,255,0.45)', c:'rgba(200,232,255,0.40)', d:'rgba(136,184,232,0.40)' },
    purple: { bg:'#EAE2F5', a:'rgba(200,168,240,0.55)', b:'rgba(224,200,255,0.45)', c:'rgba(184,136,232,0.40)', d:'rgba(216,184,255,0.40)' },
    rose:   { bg:'#F2E8EC', a:'rgba(248,184,200,0.55)', b:'rgba(255,216,224,0.45)', c:'rgba(240,168,184,0.40)', d:'rgba(232,200,216,0.40)' },
    slate:  { bg:'#E0E6EC', a:'rgba(184,200,216,0.55)', b:'rgba(200,216,232,0.45)', c:'rgba(168,184,200,0.40)', d:'rgba(208,220,232,0.40)' },
    autumn: { bg:'#F0E8DC', a:'rgba(245,192,138,0.60)', b:'rgba(232,160,96,0.50)',  c:'rgba(240,208,160,0.45)', d:'rgba(216,144,96,0.45)' },
    teal:   { bg:'#DCF0EC', a:'rgba(136,221,208,0.55)', b:'rgba(168,237,224,0.50)', c:'rgba(200,245,236,0.45)', d:'rgba(104,204,192,0.45)' },
    coral:  { bg:'#FBEAE2', a:'rgba(255,200,184,0.55)', b:'rgba(255,224,208,0.50)', c:'rgba(255,176,160,0.45)', d:'rgba(255,216,192,0.45)' },
    dark:   { bg:'#0C0A07', a:'rgba(180,90,20,0.45)',   b:'rgba(40,110,60,0.38)',  c:'rgba(30,80,160,0.38)',  d:'rgba(90,50,160,0.32)' },
  };
  const col = colors[t] || colors.light;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = col.bg;
  ctx.fillRect(0, 0, W, H);

  const blobs = [
    { x: 0.15 + Math.sin(_bgT*0.7)*0.08, y: 0.18 + Math.cos(_bgT*0.5)*0.06, r:0.55, col:col.a },
    { x: 0.82 + Math.cos(_bgT*0.6)*0.08, y: 0.15 + Math.sin(_bgT*0.8)*0.07, r:0.48, col:col.b },
    { x: 0.12 + Math.sin(_bgT*0.9)*0.07, y: 0.82 + Math.cos(_bgT*0.4)*0.06, r:0.52, col:col.c },
    { x: 0.80 + Math.cos(_bgT*0.5)*0.07, y: 0.80 + Math.sin(_bgT*0.7)*0.06, r:0.46, col:col.d },
  ];

  blobs.forEach(b => {
    const grd = ctx.createRadialGradient(b.x*W, b.y*H, 0, b.x*W, b.y*H, b.r * Math.min(W,H));
    grd.addColorStop(0, b.col);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  });

  // Dark overlay for dark theme
  if (t === 'dark') {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, W, H);
  }
}

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
function initDotsMenu() {
  const btn = document.getElementById('dotsBtn');
  const menu = document.getElementById('dotsMenu');
  if (!btn||!menu) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('open');
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
    dm_version:'भर्जन', dm_follow:'हामीलाई फलो गर्नुस्',
    ticker_news:'समाचार', search_ph:'किताब वा विषय खोज्नुस्…', years:'वर्षहरू',
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
    dm_version:'संस्करणम्', dm_follow:'अस्मान् अनुसरतु',
    ticker_news:'समाचारः', search_ph:'पुस्तकं विषयं वा अन्विष्यताम्…', years:'वर्षाणि',
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
    dm_version:'Version', dm_follow:'Follow Us',
    ticker_news:'News', search_ph:'Search books or subjects…', years:'Years',
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
  // समाचार ticker केवल होम पेजमा मात्र देखिने
  document.getElementById('tickerBar')?.classList.toggle('hide', page !== 'home');
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
        // अध्याय (Firestore/legacy फाइलबाट) load हुन थोरै पर्खने
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
        <div class="yc-title">${yr.title}</div>
        <div class="yc-sub">${yr.subtitle}</div>
        <div class="yc-badges">
          <span class="yc-badge">📚 ${total}</span>
          <span class="yc-badge">🕉️ संस्कृत</span>
          <span class="yc-badge">⭐ ज्योतिष</span>
        </div>
      </div>
      <div class="yc-arrow">›</div>
    </a>`;
  }).join('');
  renderTicker();
  renderNewsCards();
}

/* ════════════════════════════════════
   TICKER
   ════════════════════════════════════ */
function renderTicker() {
  const el = document.getElementById('tickerInner');
  if (!el||!App.data?.news?.length) return;
  // ४ पटक दोहोर्याउने — समाचार थोरै भए पनि loop बीचमा खाली ठाउँ नआओस् भनेर
  const dbl = [...App.data.news,...App.data.news,...App.data.news,...App.data.news];
  el.innerHTML = dbl.map(n=>`<span class="t-item">${n.title}</span>`).join('');
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
    <a class="back-btn" onclick="go('home');return false;" href="#">← फिर्ता</a>
    <div class="yr-head yc-bg yc-${yClr[ci]||'o'} s${ci+1}" style="position:relative;overflow:hidden">
      <div class="yc-shine" style="position:absolute;inset:0"></div>
      <div class="yc-glare" style="position:absolute;top:0;left:0;right:0;height:48%"></div>
      <div class="yc-blob yc-blob-1"></div><div class="yc-blob yc-blob-2"></div>
      <div style="position:relative;z-index:2">
        <div class="yr-head-title" style="color:${['#5A2800','#0A3010','#082050','#280650'][ci]||'#1A1209'};${ci===3&&App.theme==='dark'?'color:white':''}">${yr.title}</div>
        <div class="yr-head-sub" style="color:${['#5A2800','#0A3010','#082050','#280650'][ci]||'#5C4A2A'}">${yr.subtitle}</div>
      </div>
    </div>

    <div class="subj-tabs" id="subjTabs">
      ${subjEntries.map(([key,books])=>{
        const s=SUBJ[key]||{label:key,short:'क',g:'#EEE,#CCC'};
        const [gc1,gc2]=s.g.split(',');
        return `
        <button class="subj-tab ${key===firstKey?'active':''}" data-key="${key}" onclick="setYearSubjectTab(${yr.id},'${key}')">
          <span class="subj-tab-ico" style="background:linear-gradient(135deg,${gc1},${gc2})">${s.short}</span>
          <span class="subj-tab-lbl">${s.label}</span>
        </button>`;
      }).join('')}
    </div>

    <div class="books-list" id="yearBooksList">
      ${(yr.subjects[firstKey]||[]).map(b=>bookCardHtml(b,yr.id,firstKey)).join('') || '<div class="empty"><div class="empty-ico">📚</div><div class="empty-t">कुनै किताब छैन</div></div>'}
    </div>
  </div>`;
}

function setYearSubjectTab(yearId, key, fromHistory=false) {
  const yr = App.data.years.find(y=>y.id===yearId);
  if (!yr) return;
  document.querySelectorAll('#subjTabs .subj-tab').forEach(b=>b.classList.toggle('active', b.dataset.key===key));
  const books = yr.subjects[key] || [];
  const el = document.getElementById('yearBooksList');
  if (!el) return;
  el.classList.remove('subj-anim-in');
  void el.offsetWidth; // reflow — ताकि animation फेरि सुरुदेखि चल्छ
  el.innerHTML = books.map(b=>bookCardHtml(b,yearId,key)).join('') || '<div class="empty"><div class="empty-ico">📚</div><div class="empty-t">कुनै किताब छैन</div></div>';
  el.classList.add('subj-anim-in');
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
         src="${b.cover}"
         alt="${b.title}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
       >
       <!-- fallback letter देखिने photo लोड नभए मात्र -->
       <span class="book-row-ico" style="display:none">${s.short}</span>`
    : `<!-- no cover → gradient + letter-avatar -->
       <span class="book-row-ico">${s.short}</span>`;

  return `
  <a class="book-row" onclick="go('subject',{subjectId:'${b.id}',yearId:${yearId}});return false;" href="#">
    <div class="book-row-cover" style="background:linear-gradient(135deg,${c1},${c2})">
      ${coverHtml}
    </div>
    <div class="book-row-info">
      <span class="book-row-title">${b.title}</span><span class="book-row-sep">·</span><span class="book-row-author">${b.author}</span>
    </div>
    ${bmPin}
    <span class="book-row-chevron">›</span>
  </a>`;
}

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
    <a class="back-btn" onclick="go('year',{yearId:${yearId}});return false;" href="#">← ${yr.title}</a>
    <div class="subj-hero" style="background:linear-gradient(135deg,${c1},${c2})">
      ${book.cover
        ? `<img src="${book.cover}" alt="${book.title}"
               style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top;z-index:0"
               onerror="this.style.display='none';document.getElementById('hero-emoji-${book.id}').style.display='flex'">`
        : ''}
      <!-- letter-avatar देखिने कभर फोटो नभएमा मात्र -->
      <span class="subj-hero-emoji" id="hero-emoji-${book.id}"
            style="${book.cover ? 'display:none' : 'display:flex'}">${s.short}</span>
      <div class="subj-hero-overlay" style="z-index:2">
        <!-- कभर फोटोमा पहिल्यै शीर्षक लेखिएको हुनसक्ने भएकोले, फोटो भएमा दोहोरो नआउन यो text लुकाइन्छ -->
        ${book.cover ? '<div></div>' : `<div><div class="sh-title">${book.title}</div><div class="sh-meta">${s.label} · ${yr.title}</div></div>`}
        <span class="bm-btn" onclick="toggleBm('${book.id}')">${isBm?'🔖':'🏷️'}</span>
      </div>
    </div>

    <div class="tabs-pill">
      <button class="tab-btn on"  onclick="setTab(this,'tab-ch')">अध्यायहरू</button>
      <button class="tab-btn"     onclick="setTab(this,'tab-ov')">विवरण</button>
    </div>

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
    const r = await fetch(path);
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

async function loadAndRenderChapters(bookId) {
  const el = document.getElementById('chList');
  if (!el) return;
  App.currentChapterBookId = bookId;

  // Cache check
  if (!App.chaptersCache[bookId]) {
    // पहिला Firestore बाट (Admin ले app भित्रैबाट लेखेको अध्याय) हेर्ने
    let chapters = null;
    if (typeof loadChaptersFromFirestore === 'function') {
      chapters = await loadChaptersFromFirestore(bookId);
    }
    // Firestore मा त्यो किताबको लागि कुनै doc नै नभए (null), पुरानो
    // data/chapters/{bookId}/1.js, 2.js... फाइलहरूबाट पढ्ने (legacy fallback)
    if (!chapters) {
      chapters = [];
      let i = 1;
      while (true) {
        const ch = await loadChapterScript(bookId, i);
        if (!ch) break;
        chapters.push(ch);
        i++;
      }
    }
    App.chaptersCache[bookId] = chapters;
  }

  renderChapterListHtml(bookId);
}

/* अध्यायको list HTML render गर्ने — cache बाटै (कुनै नयाँ Firestore call नगरी),
   ताकि admin ले अध्याय थप्ने/सम्पादन गरेपछि तुरुन्तै (Firestore बाट फेरि नतानिकनै) देखियोस् */
function renderChapterListHtml(bookId) {
  const el = document.getElementById('chList');
  if (!el) return;
  const chs = App.chaptersCache[bookId] || [];

  const adminAddBar = App.isAdmin
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
        <div class="empty-s">${App.isAdmin ? '"➕ नयाँ अध्याय" थिचेर अध्याय थप्नुस्' : 'चाँडै अध्याय थपिनेछ'}</div>
      </div>`;
    return;
  }

  el.innerHTML = `${adminAddBar}<div class="ch-list">${chs.map((ch,i)=>{
    const chBmKey = bookId+'::'+i;
    const chIsBm = App.chapterBookmarks.includes(chBmKey);
    return `
    <div class="chapter-item" id="chi-${bookId}-${i}">
      <div class="ch-head" onclick="toggleCh('${bookId}',${i})">
        <div class="ch-num">${toN(i+1)}</div>
        <div class="ch-title-txt">${ch.title||('अध्याय '+(i+1))}</div>
        <button id="chbm-${bookId}-${i}" onclick="event.stopPropagation();toggleChapterBm('${bookId}',${i})" title="Bookmark" style="background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 6px;flex-shrink:0">${chIsBm?'🔖':'🏷️'}</button>
        ${App.isAdmin ? `<button onclick="event.stopPropagation();adminInlineChapterEdit('${bookId}',${i})" style="background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 6px;flex-shrink:0">✏️</button>` : ''}
        ${App.isAdmin ? `<button onclick="event.stopPropagation();adminInlineChapterDelete('${bookId}',${i})" style="background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 6px;flex-shrink:0">🗑️</button>` : ''}
        <span class="ch-chevron">›</span>
      </div>
      <div class="ch-read-body">
        <div class="ch-read-content" style="${ch.font && typeof fontCssFor==='function' ? `font-family:${fontCssFor(ch.font)}` : ''}">${renderMd(ch.content||'')}</div>
        <div class="ch-read-foot">
          <span class="ch-rd-lbl">अध्याय ${toN(i+1)} / ${toN(chs.length)} <span class="ch-rd-pct" id="chPct-${bookId}-${i}"></span></span>
          ${i<chs.length-1?`<button class="ch-rd-btn" onclick="event.stopPropagation();nextCh('${bookId}',${i})">अर्को →</button>`:'<span class="ch-rd-lbl" style="color:var(--accent);font-weight:700">✓ सकियो</span>'}
        </div>
      </div>
    </div>`;}).join('')}</div>`;
}
window.renderChapterListHtml = renderChapterListHtml;

function toggleCh(bookId, idx, fromHistory=false) {
  const item = document.getElementById(`chi-${bookId}-${idx}`);
  if (!item) return;
  const wasOpen = item.classList.contains('open');
  // Close all first
  document.querySelectorAll('.chapter-item.open').forEach(el => el.classList.remove('open'));
  if (!wasOpen) {
    item.classList.add('open');
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
  // Close current, open next
  document.querySelectorAll('.chapter-item.open').forEach(el=>el.classList.remove('open'));
  const next = document.getElementById(`chi-${bookId}-${idx+1}`);
  if (next) {
    next.classList.add('open');
    next.scrollIntoView({behavior:'smooth',block:'start'});
    history.pushState({ chOpen: { bookId, idx: idx+1 } }, '');
  }
  saveLastLocation();
  setTimeout(() => window._updateChProgress && window._updateChProgress(), 60);
}
window.nextCh = nextCh;

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

/* इनलाइन मात्र (heading/paragraph/list जस्ता block-level चिज नछुने) —
   box र table भित्र पनि यही प्रयोग हुन्छ */
function applyInline(str) {
  return str
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/==(?:([^=\n]{1,16}):)?([^=]+?)==/g, (m, colorWord, txt) => {
      const c = resolveHlColor(colorWord);
      if (c) return `<span class="highlight" style="background:${c}33;color:${c};box-shadow:inset 0 -2px 0 ${c}">${txt}</span>`;
      const full = colorWord ? colorWord + ':' + txt : txt;
      return `<span class="highlight">${full}</span>`;
    })
    .replace(/\{\{([^:{}\n]{1,16}):([^{}]+?)\}\}/g, (m, colorWord, txt) => {
      const c = resolveHlColor(colorWord);
      if (c) return `<span style="color:${c};font-weight:600">${txt}</span>`;
      return colorWord + ':' + txt;
    });
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
  const headers = headerLine.split('|').map(s=>s.trim()).filter(Boolean);
  const rows = bodyBlock.trim().split('\n').filter(Boolean).map(r =>
    r.replace(/^\||\|$/g,'').split('|').map(c=>applyInline(c.trim()))
  );
  const thead = `<tr>${headers.map(h=>`<th>${applyInline(h)}</th>`).join('')}</tr>`;
  const tbody = rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="content-table-wrap"><table class="content-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

function renderMd(text) {
  if (!text) return '<span style="color:var(--text-4)">सामग्री छैन</span>';

  let escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

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
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1">')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^---$/gm,'<hr>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/==(?:([^=\n]{1,16}):)?([^=]+?)==/g, (m, colorWord, txt) => {
      const c = resolveHlColor(colorWord);
      if (c) return `<span class="highlight" style="background:${c}33;color:${c};box-shadow:inset 0 -2px 0 ${c}">${txt}</span>`;
      const full = colorWord ? colorWord + ':' + txt : txt;
      return `<span class="highlight">${full}</span>`;
    })
    .replace(/\{\{([^:{}\n]{1,16}):([^{}]+?)\}\}/g, (m, colorWord, txt) => {
      const c = resolveHlColor(colorWord);
      if (c) return `<span style="color:${c};font-weight:600">${txt}</span>`;
      return colorWord + ':' + txt;
    })
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>.*?<\/li>\n?)+/gs,m=>`<ul>${m}</ul>`)
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>');

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
      if (wrap.classList.contains('open') && !e.target.closest('.search-wrap') && !e.target.closest('#searchBtn') && !e.target.closest('#navSearchBtn')) {
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
    if(q.length<2){drop.classList.remove('open');return;}
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => {
      const res=doSearch(q);
      renderDrop(res,q);
      drop.classList.add('open');
    }, 140);
  });
  clr.addEventListener('click',()=>{inp.value='';clr.classList.remove('show');drop.classList.remove('open');inp.focus();});
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
  const words = haystack.split(/\s+/);
  for (const w of words) {
    if (Math.abs(w.length - needle.length) > maxDist + 2) continue;
    if (_editDistance(w, needle) <= maxDist) return true;
  }
  return false;
}

function doSearch(q) {
  if (!App.data) return { books: [], chapters: [] };
  const ql = q.toLowerCase().trim();
  const books = [];

  App.data.years.forEach(yr => Object.entries(yr.subjects).forEach(([key, arr]) =>
    (arr||[]).forEach(b => {
      const hay = `${b.title||''} ${b.author||''} ${yr.title||''}`.toLowerCase();
      if (_fuzzyContains(hay, ql)) books.push({ b, yr, key });
    })
  ));

  // अध्याय भित्रको टेक्स्ट — यो session मा पहिले नै खोलिएका (cache भएका) किताबहरूमा खोजिन्छ
  const chapters = [];
  if (ql.length >= 2) {
    for (const bookId in (App.chaptersCache || {})) {
      const loc = findBookLocation(bookId);
      if (!loc) continue;
      const chs = App.chaptersCache[bookId] || [];
      chs.forEach((ch, idx) => {
        const plain = (ch.content || '').replace(/[#*_`>\-\[\]()]/g, ' ');
        const hay = `${ch.title||''} ${plain}`.toLowerCase();
        if (_fuzzyContains(hay, ql)) {
          chapters.push({ bookId, bookTitle: loc.book.title, yearId: loc.yearId, chapterIdx: idx, chapterTitle: ch.title || `अध्याय ${idx+1}` });
        }
      });
    }
  }

  return { books: books.slice(0,6), chapters: chapters.slice(0,5) };
}

function renderDrop(res,q) {
  const el=document.getElementById('sDrop');
  const books = res.books || [];
  const chapters = res.chapters || [];
  if(!books.length && !chapters.length){el.innerHTML=`<div class="s-empty">🔍 "${q}" भेटिएन</div>`;return;}
  let html = books.map(({b,yr,key})=>{
    const s=SUBJ[key]||{short:'क',g:'#EEE,#CCC'};
    const[c1,c2]=s.g.split(',');
    return `<div class="s-row" onclick="openBookWithBreadcrumb('${b.id}',${yr.id});document.getElementById('sDrop').classList.remove('open')">
      <div class="s-ico2" style="background:linear-gradient(135deg,${c1},${c2})">${s.short}</div>
      <div><div class="s-name">${b.title}</div><div class="s-sub">${yr.title} · ${b.author}</div></div>
    </div>`;
  }).join('');
  if (chapters.length) {
    html += chapters.map(c => `<div class="s-row" onclick="openBookWithBreadcrumb('${c.bookId}',${c.yearId},${c.chapterIdx});document.getElementById('sDrop').classList.remove('open')">
      <div class="s-ico2" style="background:linear-gradient(135deg,#CCC,#AAA)">📖</div>
      <div><div class="s-name">${c.chapterTitle}</div><div class="s-sub">📘 ${c.bookTitle}</div></div>
    </div>`).join('');
  }
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
      if (el) { toggleCh(bookId, chapterIdx); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
async function renderNewsListPage() {
  const el = document.getElementById('newsListPage');
  if (!el) return;
  el.innerHTML = '<div class="spin-wrap"><div class="spinner"></div></div>';
  if (!App.feedPosts.length) App.feedPosts = await loadFeedPostsFromFirestore();
  const items = App.feedPosts;

  const addBtn = App.isAdmin
    ? `<button onclick="openNoticeForm(null,'feed')" style="width:100%;padding:12px;margin-bottom:14px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border:none;border-radius:var(--r-md);font-weight:700;font-size:0.86rem;cursor:pointer;box-shadow:0 4px 14px var(--accent-glow)">➕ नयाँ पोस्ट लेख्नुस्</button>`
    : '';

  if (!items.length) {
    el.innerHTML = addBtn + '<div class="empty"><div class="empty-ico">📭</div><div class="empty-t">अझै कुनै समाचार छैन</div></div>';
    return;
  }

  el.innerHTML = addBtn + items.map((n, i) => {
    const bodyHtml = renderMd(n.content || '');
    return `
    <div style="background:var(--surface);border:1px solid var(--surface-b);border-radius:var(--r-md);margin-bottom:14px;overflow:hidden;box-shadow:0 3px 12px var(--shadow)">
      <div style="padding:12px 14px 8px;display:flex;align-items:center;gap:9px">
        <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🎓</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.8rem;font-weight:700;color:var(--text-1)">शास्त्री पोर्टल</div>
          <div style="font-size:0.68rem;color:var(--text-3)">${n.date||''}${n.category?' · '+n.category:''}</div>
        </div>
        ${App.isAdmin ? `<div style="display:flex;gap:8px;flex-shrink:0">
          <button onclick="editFeedPostByIndex(${i})" style="background:none;border:none;font-size:1rem;cursor:pointer">✏️</button>
          <button onclick="deleteFeedPost('${n.id}')" style="background:none;border:none;font-size:1rem;cursor:pointer">🗑️</button>
        </div>` : ''}
      </div>
      ${n.image ? `<img src="${n.image}" style="width:100%;max-height:280px;object-fit:cover;display:block" loading="lazy">` : ''}
      <div style="padding:10px 14px 4px">
        <div style="font-size:0.88rem;font-weight:700;color:var(--text-1);margin-bottom:4px">${n.title||''}</div>
        <div class="feed-body" id="feedBody${i}" style="font-size:0.8rem;color:var(--text-2);line-height:1.6;max-height:5.2em;overflow:hidden;transition:max-height 0.32s var(--ease-out)">${bodyHtml}</div>
      </div>
      <div onclick="toggleFeedBody(${i})" id="feedToggle${i}" style="padding:6px 14px 12px;color:var(--accent);font-size:0.78rem;font-weight:700;cursor:pointer">थप पढ्नुस् ⌄</div>
    </div>`;
  }).join('');

  // छोटो पोस्ट (जसलाई expand गर्नु नै नपर्ने) मा "थप पढ्नुस्" लुकाउने
  items.forEach((n, i) => {
    const body = document.getElementById('feedBody'+i);
    const toggle = document.getElementById('feedToggle'+i);
    if (body && toggle && body.scrollHeight <= body.clientHeight + 2) {
      toggle.style.display = 'none';
    }
  });
}
window.renderNewsListPage = renderNewsListPage;

function toggleFeedBody(i) {
  const body = document.getElementById('feedBody'+i);
  const toggle = document.getElementById('feedToggle'+i);
  if (!body || !toggle) return;
  const isOpen = body.classList.toggle('open');
  body.style.maxHeight = isOpen ? body.scrollHeight + 'px' : '5.2em';
  toggle.textContent = isOpen ? 'कम देखाउनुस् ⌃' : 'थप पढ्नुस् ⌄';
}
window.toggleFeedBody = toggleFeedBody;

/* ════════════════════════════════════
   PROFILE
   ════════════════════════════════════ */
function renderProfile() {
  renderStats();
  renderHistory();
  loadProfile();

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

function renderStats() {
  let books=0,chs=0;
  if(App.data) App.data.years.forEach(yr=>Object.values(yr.subjects).forEach(bs=>{books+=bs.length;bs.forEach(b=>{chs+=(App.chaptersCache[b.id]||[]).length;});}));
  const el=document.getElementById('statsGrid');
  if(el) el.innerHTML=`
    <div class="stat-card"><div class="stat-num">${books}</div><div class="stat-lbl">📚 किताबहरू</div></div>
    <div class="stat-card"><div class="stat-num">${chs}</div><div class="stat-lbl">📖 अध्यायहरू</div></div>
    <div class="stat-card"><div class="stat-num">${App.notes.length}</div><div class="stat-lbl">📝 नोटहरू</div></div>
    <div class="stat-card"><div class="stat-num">${App.bookmarks.length}</div><div class="stat-lbl">🔖 Bookmarks</div></div>`;
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

  // १. Admin ले Firestore मा लेखेको वास्तविक डाटा (किताब, सूचना, विषय, हरेक किताबको
  //    अध्याय) पहिले नै localStorage मा तान्ने — यही ले offline हुँदा देखिने कुरा हो
  if (typeof loadBooksFromFirestore === 'function') {
    try { await loadBooksFromFirestore(); } catch (e) {}
  }
  if (typeof loadNoticesFromFirestore === 'function') {
    try { await loadNoticesFromFirestore(); } catch (e) {}
  }
  if (typeof loadSubjectsFromFirestore === 'function') {
    try { await loadSubjectsFromFirestore(); } catch (e) {}
  }

  const urls = new Set([
    './','index.html','css/style.css','js/main.js','js/admin.js','js/editor-toolbar.js','js/firebase-config.js',
    'data/books.json','manifest.json',
    'images/news/board.jpg','images/icons/logo.svg',
  ]);
  const bookIds = [];
  App.data.years.forEach(yr => Object.values(yr.subjects).forEach(books => books.forEach(b => {
    bookIds.push(b.id);
    if (b.cover) urls.add(b.cover);
  })));
  if (App.data.news) App.data.news.forEach(n => { if (n.image) urls.add(n.image); });

  // २. हरेक किताबको अध्याय — पहिले Firestore बाट (localStorage मा cache हुन्छ),
  //    त्यहाँ नभेटिए मात्र पुरानो data/chapters/{bookId}/1.js, 2.js... फाइलहरू खोज्ने
  for (const bookId of bookIds) {
    let gotFromFirestore = false;
    if (typeof loadChaptersFromFirestore === 'function') {
      try {
        const chs = await loadChaptersFromFirestore(bookId);
        if (Array.isArray(chs) && chs.length) gotFromFirestore = true;
      } catch (e) {}
    }
    if (!gotFromFirestore) {
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
  // Firestore बाट cache गरिएको localStorage डाटा पनि सँगै हटाउने
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sp_cache_')) localStorage.removeItem(k);
    });
  } catch (e) {}
}
window.deleteOfflineData = deleteOfflineData;

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
function openOv(id){
  document.getElementById(id)?.classList.add('open');
  // Modal खुल्दा एउटा छुट्टै history entry थपिन्छ, ताकि back/swipe गर्दा
  // सिधै पेज नबदलिई पहिले modal मात्र बन्द होस्।
  if (!App_navigatingFromPopstate) history.pushState({ modal: id }, '');
}
function closeOv(id){
  const ov = document.getElementById(id);
  ov?.classList.remove('open');
  ov?.querySelector('.modal-sheet')?.classList.remove('sheet-expanded'); // अर्को पटक सामान्य आकारमै खुल्ने
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

/* ════════════════════════════════════
   PROFILE EDIT SYSTEM
   ════════════════════════════════════ */

function loadProfile() {
  const p = App.profile;

  // Update hero display
  const nameEl = document.getElementById('profNameDisp');
  const roleEl = document.getElementById('profRoleDisp');
  if (nameEl) nameEl.textContent = p.name || 'विद्यार्थी';
  if (roleEl) roleEl.textContent = p.role || 'शास्त्री कक्षा पोर्टल';

  // Avatar
  const avImg  = document.getElementById('profAvImg');
  const avEmoji= document.getElementById('profAvEmoji');
  if (avImg && avEmoji) {
    if (p.avatar) {
      avImg.src = p.avatar;
      avImg.style.display = 'block';
      avEmoji.style.display = 'none';
    } else {
      avImg.style.display = 'none';
      avEmoji.style.display = 'block';
    }
  }

  // Social links
  renderSocialLinks(p);
}

function renderSocialLinks(p) {
  const wrap = document.getElementById('socialLinks');
  const body = document.getElementById('socialLinksBody');
  if (!wrap || !body) return;

  const links = [
    { key:'email',     ico:'📧', label:'Email',     bg:'#e3f2fd', href: p.email     ? 'mailto:'+p.email : '' },
    { key:'facebook',  ico:'📘', label:'Facebook',  bg:'#e8f0fe', href: p.facebook  || '' },
    { key:'instagram', ico:'📸', label:'Instagram', bg:'#fce4ec', href: p.instagram || '' },
    { key:'youtube',   ico:'▶️', label:'YouTube',   bg:'#ffebee', href: p.youtube   || '' },
    { key:'github',    ico:'🐙', label:'GitHub',    bg:'#f3e5f5', href: p.github    || '' },
    { key:'website',   ico:'🌐', label:'Website',   bg:'#e0f7fa', href: p.website   || '' },
  ].filter(l => l.href);

  if (!links.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  body.innerHTML = links.map(l => `
    <a class="social-link-row" href="${l.href}" target="_blank" rel="noopener">
      <div class="social-ico" style="background:${l.bg}">${l.ico}</div>
      <div>
        <div class="social-name">${l.label}</div>
        <div class="social-val">${l.href.replace('mailto:','')}</div>
      </div>
      <span class="social-arr">↗</span>
    </a>`).join('');
}

function openProfileEdit() {
  const p = App.profile;
  document.getElementById('editName').value      = p.name      || '';
  document.getElementById('editRole').value      = p.role      || '';
  document.getElementById('editEmail').value     = p.email     || '';
  document.getElementById('editFacebook').value  = p.facebook  || '';
  document.getElementById('editInstagram').value = p.instagram || '';
  document.getElementById('editYoutube').value   = p.youtube   || '';
  document.getElementById('editGithub').value    = p.github    || '';
  document.getElementById('editWebsite').value   = p.website   || '';

  // Sync edit avatar preview
  const eImg   = document.getElementById('editAvImg');
  const eEmoji = document.getElementById('editAvEmoji');
  if (eImg && eEmoji) {
    if (p.avatar) { eImg.src=p.avatar; eImg.style.display='block'; eEmoji.style.display='none'; }
    else          { eImg.style.display='none'; eEmoji.style.display='block'; }
  }
  openOv('profileEditModal');
}

function saveProfileEdit() {
  App.profile.name      = document.getElementById('editName').value.trim()      || 'विद्यार्थी';
  App.profile.role      = document.getElementById('editRole').value.trim()      || 'शास्त्री कक्षा पोर्टल';
  App.profile.email     = document.getElementById('editEmail').value.trim();
  App.profile.facebook  = document.getElementById('editFacebook').value.trim();
  App.profile.instagram = document.getElementById('editInstagram').value.trim();
  App.profile.youtube   = document.getElementById('editYoutube').value.trim();
  App.profile.github    = document.getElementById('editGithub').value.trim();
  App.profile.website   = document.getElementById('editWebsite').value.trim();

  localStorage.setItem('sp_profile', JSON.stringify(App.profile));
  closeOv('profileEditModal');
  loadProfile();
  toast('Profile सुरक्षित भयो ✓');
}
window.saveProfileEdit = saveProfileEdit;

function triggerAvatarPick() {
  document.getElementById('avatarInput').click();
}
window.triggerAvatarPick = triggerAvatarPick;

function handleAvatarChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  // Check size < 2MB
  if (file.size > 2 * 1024 * 1024) { toast('फोटो 2MB भन्दा सानो हुनु पर्छ!'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    App.profile.avatar = ev.target.result;
    localStorage.setItem('sp_profile', JSON.stringify(App.profile));
    loadProfile();
    // Also update edit modal preview
    const eImg   = document.getElementById('editAvImg');
    const eEmoji = document.getElementById('editAvEmoji');
    if (eImg) { eImg.src = ev.target.result; eImg.style.display='block'; }
    if (eEmoji) eEmoji.style.display = 'none';
    toast('फोटो सुरक्षित भयो ✓');
  };
  reader.readAsDataURL(file);
}
window.handleAvatarChange = handleAvatarChange;

function removeAvatar() {
  App.profile.avatar = '';
  localStorage.setItem('sp_profile', JSON.stringify(App.profile));
  loadProfile();
  const eImg   = document.getElementById('editAvImg');
  const eEmoji = document.getElementById('editAvEmoji');
  if (eImg) eImg.style.display = 'none';
  if (eEmoji) eEmoji.style.display = 'block';
  toast('फोटो हटाइयो');
}
window.removeAvatar = removeAvatar;

// Expose App
window.App=App;
window.applyTheme=applyTheme;

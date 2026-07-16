/* ================================================
   शास्त्री पोर्टल — Admin Login + सूचना (Notice) व्यवस्थापन
   ================================================
   - Google Sign-In (Firebase Auth) ले Admin लाई पहिचान गर्छ
   - ADMIN_UIDS (firebase-config.js मा) भित्रको list सँग मिले मात्र Admin Panel देखिन्छ
   - सूचनाहरू Firestore को "notices" collection मा राखिन्छ
   - यो UI-level जाँच मात्र हो — वास्तविक सुरक्षा Firestore
     Security Rules ले गर्छ (SETUP_GUIDE.md हेर्नुस्)
   ================================================ */
'use strict';

const auth = firebase.auth();
const db   = firebase.firestore();

App.isAdmin      = false;
App.adminUser    = null;
App.editingNoticeId = null;

/* ── Google Sign-In / Sign-Out ── */
function adminLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    console.error(err);
    toast('❌ Login असफल: ' + (err.message || err.code));
  });
}
window.adminLogin = adminLogin;

function adminLogout() {
  auth.signOut();
  toast('👋 Logout भयो');
}
window.adminLogout = adminLogout;

auth.onAuthStateChanged(user => {
  if (user && Array.isArray(ADMIN_UIDS) && ADMIN_UIDS.includes(user.uid)) {
    App.isAdmin   = true;
    App.adminUser = user;
    toast('✅ Admin लगइन भयो — ' + (user.displayName || user.email));
  } else {
    if (user) {
      // ठीक Google account होइन — सुरक्षाको लागि सिधै sign out
      toast('⚠️ यो Google account Admin होइन');
      auth.signOut();
    }
    App.isAdmin   = false;
    App.adminUser = null;
  }
  renderAdminUI();
});

function renderAdminUI() {
  const loginBox = document.getElementById('adminLoginBox');
  const panelBox = document.getElementById('adminPanelBox');
  if (loginBox && panelBox) {
    loginBox.style.display = App.isAdmin ? 'none'  : 'block';
    panelBox.style.display = App.isAdmin ? 'block' : 'none';
    const nameEl = document.getElementById('adminNameDisp');
    if (nameEl) nameEl.textContent = App.adminUser?.displayName || App.adminUser?.email || '';
  }
  document.body.classList.toggle('is-admin', App.isAdmin);
  renderAdminNoticeList();
}

/* ════════════════════════════════════
   सूचना (Notices) — Firestore
   collection: notices  { title, content, date, category, image, createdAt }
   ════════════════════════════════════ */
async function loadNoticesFromFirestore() {
  try {
    const snap = await db.collection('notices').orderBy('createdAt', 'desc').get();
    if (snap.empty) return null;
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    try { localStorage.setItem('sp_cache_notices', JSON.stringify(data)); } catch (e) {}
    return data;
  } catch (err) {
    console.warn('Firestore बाट सूचना लोड हुन सकेन, offline cache हेर्दैछ:', err.message);
    try {
      const cached = localStorage.getItem('sp_cache_notices');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  }
}

function openNoticeForm(notice = null) {
  if (!App.isAdmin) return;
  if (typeof renderMdToolbar === 'function') {
    const tb = document.getElementById('noticeContentToolbar');
    if (tb) tb.innerHTML = renderMdToolbar('noticeFormContent', { title: '📢 सूचना लेख्नुस्' });
  }
  document.getElementById('noticeFormTitle').value    = notice?.title    || '';
  document.getElementById('noticeFormContent').value  = notice?.content  || '';
  document.getElementById('noticeFormDate').value     = notice?.date     || '';
  document.getElementById('noticeFormCategory').value = notice?.category || '';
  document.getElementById('noticeFormImage').value    = notice?.image    || '';
  document.getElementById('noticeFormContent').dataset.fontKey = notice?.font || 'siddhanta';
  App.editingNoticeId = notice?.id || null;
  document.getElementById('noticeFormHeading').textContent = notice ? '✏️ सूचना सम्पादन' : '➕ नयाँ सूचना';
  openOv('noticeFormModal');
}
window.openNoticeForm = openNoticeForm;

async function saveNoticeForm() {
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const contentEl = document.getElementById('noticeFormContent');
  const data = {
    title:    document.getElementById('noticeFormTitle').value.trim(),
    content:  contentEl.value.trim(),
    date:     document.getElementById('noticeFormDate').value.trim(),
    category: document.getElementById('noticeFormCategory').value.trim(),
    image:    document.getElementById('noticeFormImage').value.trim(),
    font:     contentEl.dataset.fontKey || 'siddhanta',
  };
  if (!data.title || !data.content) { toast('⚠️ शीर्षक र विवरण आवश्यक छ'); return; }
  try {
    if (App.editingNoticeId) {
      await db.collection('notices').doc(App.editingNoticeId).update(data);
      toast('✅ सूचना अपडेट भयो');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('notices').add(data);
      toast('✅ नयाँ सूचना थपियो');
    }
    closeOv('noticeFormModal');
    await refreshNotices();
  } catch (err) {
    toast('❌ सुरक्षित गर्न सकिएन: ' + err.message);
  }
}
window.saveNoticeForm = saveNoticeForm;

async function deleteNotice(id) {
  if (!App.isAdmin || !id) return;
  if (!(await showConfirm('साँच्चै यो सूचना मेटाउने?'))) return;
  try {
    await db.collection('notices').doc(id).delete();
    toast('🗑️ सूचना मेटियो');
    await refreshNotices();
  } catch (err) {
    toast('❌ मेटाउन सकिएन: ' + err.message);
  }
}
window.deleteNotice = deleteNotice;

async function refreshNotices() {
  const notices = await loadNoticesFromFirestore();
  if (notices) App.data.news = notices;
  App.newsIdx = 0;
  if (typeof setNews === 'function') setNews(0);
  if (typeof renderNewsBoardDots === 'function') renderNewsBoardDots();
  if (typeof renderTicker === 'function') renderTicker();
  if (typeof renderNewsCards === 'function') renderNewsCards();
  renderAdminNoticeList();
}

function editNoticeByIndex(i) {
  const n = App.data?.news?.[i];
  if (n) openNoticeForm(n);
}
window.editNoticeByIndex = editNoticeByIndex;

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderAdminNoticeList() {
  const el = document.getElementById('adminNoticeList');
  if (!el) return;
  const list = App.data?.news || [];
  if (!list.length) { el.innerHTML = '<div class="empty-s">कुनै सूचना छैन</div>'; return; }
  el.innerHTML = list.map((n, i) => `
    <div class="sett-row">
      <div class="sett-left">
        <div class="sett-ico" style="background:#fff3e0">📢</div>
        <div><div class="sett-name">${escapeHtml(n.title)}</div><div class="sett-desc">${escapeHtml(n.date || '')}${n.category ? ' · ' + escapeHtml(n.category) : ''}${!n.id ? ' · (fallback)' : ''}</div></div>
      </div>
      <div style="display:flex;gap:12px;flex-shrink:0">
        <button onclick="editNoticeByIndex(${i})" style="background:none;border:none;font-size:1.05rem;cursor:pointer">✏️</button>
        ${n.id ? `<button onclick="deleteNotice('${n.id}')" style="background:none;border:none;font-size:1.05rem;cursor:pointer">🗑️</button>` : ''}
      </div>
    </div>`).join('');
}

/* ════════════════════════════════════
   किताब (Books) — Firestore
   collection: site_content, doc: books  { years: [ ...books.json जस्तै संरचना ] }
   पूरा years array एउटै document मा राखिन्छ (सानो data भएकाले सजिलो)
   ════════════════════════════════════ */
const BOOKS_DOC_REF = () => db.collection('site_content').doc('books');

async function loadBooksFromFirestore() {
  try {
    const snap = await BOOKS_DOC_REF().get();
    if (!snap.exists) return null;
    const data = snap.data();
    const years = Array.isArray(data?.years) && data.years.length ? data.years : null;
    if (years) { try { localStorage.setItem('sp_cache_books', JSON.stringify(years)); } catch (e) {} }
    return years;
  } catch (err) {
    console.warn('Firestore बाट किताब लोड हुन सकेन, offline cache हेर्दैछ:', err.message);
    try {
      const cached = localStorage.getItem('sp_cache_books');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  }
}

async function saveBooksToFirestore() {
  try {
    await BOOKS_DOC_REF().set({
      years: App.data.years,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (err) {
    toast('❌ किताब सुरक्षित गर्न सकिएन: ' + err.message);
    return false;
  }
}

App.adminBook = { yearId: 1, subjectId: 'nepali', editingIdx: null };

function adminBooksOpen() {
  if (!App.isAdmin) return;
  const years = App.data?.years || [];
  if (years.length && !years.find(y => y.id === App.adminBook.yearId)) {
    App.adminBook.yearId = years[0].id;
  }
  openOv('adminBooksModal');
  renderAdminBooksYearTabs();
  renderAdminBooksSubjectTabs();
  renderAdminBooksList();
}
window.adminBooksOpen = adminBooksOpen;

function renderAdminBooksYearTabs() {
  const el = document.getElementById('adminBooksYearTabs');
  if (!el) return;
  const years = App.data?.years || [];
  el.innerHTML = years.map(y => `<button class="tab-btn ${App.adminBook.yearId === y.id ? 'on' : ''}" style="flex:none;padding:8px 14px;white-space:nowrap" onclick="adminBooksSetYear(${y.id})">${escapeHtml(y.title)}</button>`).join('');
}

function adminBooksSetYear(id) {
  App.adminBook.yearId = id;
  renderAdminBooksYearTabs();
  renderAdminBooksList();
}
window.adminBooksSetYear = adminBooksSetYear;

function renderAdminBooksSubjectTabs() {
  const el = document.getElementById('adminBooksSubjectTabs');
  if (!el) return;
  el.innerHTML = Object.keys(SUBJ).map(k => `<button class="tab-btn ${App.adminBook.subjectId === k ? 'on' : ''}" style="flex:none;padding:8px 14px;white-space:nowrap" onclick="adminBooksSetSubject('${k}')">${SUBJ[k].short} ${escapeHtml(SUBJ[k].label)}</button>`).join('');
}

function adminBooksSetSubject(k) {
  App.adminBook.subjectId = k;
  renderAdminBooksSubjectTabs();
  renderAdminBooksList();
}
window.adminBooksSetSubject = adminBooksSetSubject;

function getCurrentSubjectArr() {
  const y = (App.data?.years || []).find(y => y.id === App.adminBook.yearId);
  if (!y) return null;
  if (!y.subjects) y.subjects = {};
  if (!Array.isArray(y.subjects[App.adminBook.subjectId])) y.subjects[App.adminBook.subjectId] = [];
  return y.subjects[App.adminBook.subjectId];
}

function renderAdminBooksList() {
  const el = document.getElementById('adminBooksList');
  if (!el) return;
  const arr = getCurrentSubjectArr();
  if (!arr || !arr.length) { el.innerHTML = '<div class="empty-s">कुनै किताब छैन</div>'; return; }
  el.innerHTML = arr.map((b, i) => `
    <div class="sett-row">
      <div class="sett-left">
        <div class="sett-ico" style="background:#f3e5f5">📘</div>
        <div><div class="sett-name">${escapeHtml(b.title)}</div><div class="sett-desc">${escapeHtml(b.author || '')}</div></div>
      </div>
      <div style="display:flex;gap:10px;flex-shrink:0">
        <button onclick="adminBookMove(${i},-1)" ${i===0?'disabled style="background:none;border:none;cursor:not-allowed;opacity:0.3"':'style="background:none;border:none;cursor:pointer"'} title="माथि सार्नुस्"><img src="images/icons/arrow-up.svg" style="width:18px;height:18px;display:block"></button>
        <button onclick="adminBookMove(${i},1)" ${i===arr.length-1?'disabled style="background:none;border:none;cursor:not-allowed;opacity:0.3"':'style="background:none;border:none;cursor:pointer"'} title="तल सार्नुस्"><img src="images/icons/arrow-down.svg" style="width:18px;height:18px;display:block"></button>
        <button onclick="adminChaptersOpen('${b.id}')" style="background:none;border:none;font-size:1.05rem;cursor:pointer" title="अध्याय व्यवस्थापन">📖</button>
        <button onclick="adminBookEdit(${i})" style="background:none;border:none;font-size:1.05rem;cursor:pointer" title="सम्पादन">✏️</button>
        <button onclick="adminBookDelete(${i})" style="background:none;border:none;font-size:1.05rem;cursor:pointer" title="मेटाउनुस्">🗑️</button>
      </div>
    </div>`).join('');
}

async function adminBookMove(idx, dir) {
  if (!App.isAdmin) return;
  const arr = getCurrentSubjectArr();
  if (!arr) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  renderAdminBooksList(); // तुरुन्तै देखाउने, Firestore save हुँदा पर्खनु नपरोस्
  const ok = await saveBooksToFirestore();
  if (ok) {
    refreshBookViews();
  } else {
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]; // save फेल भए क्रम फिर्ता
    renderAdminBooksList();
  }
}
window.adminBookMove = adminBookMove;

function adminBookAddNew() {
  if (!App.isAdmin) return;
  if (typeof renderMdToolbar === 'function') {
    const tb = document.getElementById('bookDescToolbar');
    if (tb) tb.innerHTML = renderMdToolbar('bookFormDesc', { title: '📚 किताबको विवरण' });
  }
  App.adminBook.editingIdx = null;
  document.getElementById('bookFormTitle').value  = '';
  document.getElementById('bookFormAuthor').value = '';
  document.getElementById('bookFormCover').value  = '';
  document.getElementById('bookFormDesc').value   = '';
  document.getElementById('bookFormDesc').dataset.fontKey = 'siddhanta';
  document.getElementById('bookFormPdf').value    = '';
  document.getElementById('bookFormHeading').textContent = '➕ नयाँ किताब';
  openOv('bookFormModal');
}
window.adminBookAddNew = adminBookAddNew;

function adminBookEdit(idx) {
  if (!App.isAdmin) return;
  if (typeof renderMdToolbar === 'function') {
    const tb = document.getElementById('bookDescToolbar');
    if (tb) tb.innerHTML = renderMdToolbar('bookFormDesc', { title: '📚 किताबको विवरण' });
  }
  const arr = getCurrentSubjectArr();
  const b = arr?.[idx];
  if (!b) return;
  App.adminBook.editingIdx = idx;
  document.getElementById('bookFormTitle').value  = b.title || '';
  document.getElementById('bookFormAuthor').value = b.author || '';
  document.getElementById('bookFormCover').value  = b.cover || '';
  document.getElementById('bookFormDesc').value   = b.description || '';
  document.getElementById('bookFormDesc').dataset.fontKey = b.font || 'siddhanta';
  document.getElementById('bookFormPdf').value    = b.pdf || '';
  document.getElementById('bookFormHeading').textContent = '✏️ किताब सम्पादन';
  openOv('bookFormModal');
}
window.adminBookEdit = adminBookEdit;

async function adminBookSave() {
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const title   = document.getElementById('bookFormTitle').value.trim();
  const author  = document.getElementById('bookFormAuthor').value.trim();
  const cover   = document.getElementById('bookFormCover').value.trim();
  const descEl  = document.getElementById('bookFormDesc');
  const desc    = descEl.value.trim();
  const font    = descEl.dataset.fontKey || 'siddhanta';
  const pdf     = document.getElementById('bookFormPdf').value.trim();
  if (!title) { toast('⚠️ शीर्षक आवश्यक छ'); return; }
  const arr = getCurrentSubjectArr();
  if (!arr) return;
  const bookData = { title, author, cover, description: desc, font, pdf };
  if (App.adminBook.editingIdx !== null && arr[App.adminBook.editingIdx]) {
    const existingId = arr[App.adminBook.editingIdx].id;
    arr[App.adminBook.editingIdx] = { id: existingId, ...bookData };
  } else {
    const newId = `${App.adminBook.subjectId.slice(0, 3)}${App.adminBook.yearId}_${Date.now()}`;
    arr.push({ id: newId, ...bookData });
  }
  const ok = await saveBooksToFirestore();
  if (ok) {
    toast('✅ किताब सुरक्षित भयो');
    closeOv('bookFormModal');
    renderAdminBooksList();
    refreshBookViews();
  }
}
window.adminBookSave = adminBookSave;

async function adminBookDelete(idx) {
  if (!App.isAdmin) return;
  if (!(await showConfirm('साँच्चै यो किताब मेटाउने?'))) return;
  const arr = getCurrentSubjectArr();
  if (!arr) return;
  arr.splice(idx, 1);
  const ok = await saveBooksToFirestore();
  if (ok) {
    toast('🗑️ किताब मेटियो');
    renderAdminBooksList();
    refreshBookViews();
  }
}
window.adminBookDelete = adminBookDelete;

function refreshBookViews() {
  if (typeof renderHome === 'function') renderHome();
  if (App.page === 'year' && App.yearId && typeof renderYearPage === 'function') renderYearPage(App.yearId);
  if (App.page === 'subject' && App.subjectId && typeof renderSubjectPage === 'function') renderSubjectPage(App.subjectId, App.yearId);
}
window.refreshBookViews = refreshBookViews;

/* ════════════════════════════════════
   अध्याय (Chapters) — Firestore
   collection: chapters, doc: {bookId}, subcollection: items, doc: {auto-id}  { title, content, font, order }
   (पहिले सबै अध्याय एउटै document मा array भएर बस्थे — त्यसले Firestore को
   1 document = 1MB भन्दा बढी हुन नमिल्ने सीमा भेट्ने जोखिम थियो। अब प्रत्येक
   अध्याय आफ्नै छुट्टै document हो, त्यसैले अध्याय संख्यामा व्यावहारिक सीमा छैन।)
   पुरानो data/chapters/{bookId}/1.js,2.js... भन्दा यही प्राथमिकता पाउँछ
   (js/main.js को loadAndRenderChapters ले पहिले यहीँ हेर्छ)
   ════════════════════════════════════ */
const chaptersColRef = (bookId) => db.collection('chapters').doc(bookId).collection('items');

async function loadChaptersFromFirestore(bookId) {
  try {
    const snap = await chaptersColRef(bookId).orderBy('order').get();
    if (!snap.empty) {
      const chs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      try { localStorage.setItem('sp_cache_chapters_' + bookId, JSON.stringify(chs)); } catch (e) {}
      return chs;
    }
    // नयाँ subcollection खाली छ — पुरानो संरचना (chapters/{bookId} document भित्र array) मा डेटा छ कि जाँच्ने,
    // ताकि पुरानो प्रणालीमा लेखिएका अध्याय नहराओस्। (यी अध्याय अर्को पटक admin ले edit/save गर्दा नयाँ संरचनामा आफैं सर्छन्।)
    const legacySnap = await db.collection('chapters').doc(bookId).get();
    if (legacySnap.exists) {
      const data = legacySnap.data();
      if (Array.isArray(data?.chapters) && data.chapters.length) {
        try { localStorage.setItem('sp_cache_chapters_' + bookId, JSON.stringify(data.chapters)); } catch (e) {}
        return data.chapters;
      }
    }
    return null;
  } catch (err) {
    console.warn('Firestore बाट अध्याय लोड हुन सकेन, offline cache हेर्दैछ:', err.message);
    try {
      const cached = localStorage.getItem('sp_cache_chapters_' + bookId);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  }
}
window.loadChaptersFromFirestore = loadChaptersFromFirestore;

/* एउटा मात्र अध्याय (add वा update) — यसले प्रत्येक अध्याय आफ्नै document मा राख्छ */
async function saveChapterItem(bookId, chapter) {
  try {
    const data = {
      title: chapter.title, content: chapter.content, font: chapter.font || 'siddhanta',
      order: chapter.order ?? 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (chapter.id) {
      await chaptersColRef(bookId).doc(chapter.id).set(data, { merge: true });
    } else {
      const ref = await chaptersColRef(bookId).add(data);
      chapter.id = ref.id;
    }
    return true;
  } catch (err) {
    toast('❌ अध्याय सुरक्षित गर्न सकिएन: ' + err.message);
    return false;
  }
}

async function deleteChapterItem(bookId, chapter) {
  try {
    if (chapter && chapter.id) await chaptersColRef(bookId).doc(chapter.id).delete();
    return true;
  } catch (err) {
    toast('❌ अध्याय मेटाउन सकिएन: ' + err.message);
    return false;
  }
}

/* दिइएका अध्यायहरूको हालको array-क्रम अनुसार 'order' field मात्र अपडेट गर्ने (⬆️⬇️ र मेटाउने बेला प्रयोग हुन्छ) */
async function reorderChapters(bookId, items) {
  try {
    const batch = db.batch();
    let any = false;
    items.forEach(c => { if (c.id) { batch.update(chaptersColRef(bookId).doc(c.id), { order: c.order }); any = true; } });
    if (any) await batch.commit();
    return true;
  } catch (err) {
    toast('❌ क्रम मिलाउन सकिएन: ' + err.message);
    return false;
  }
}

/* पुरानो (legacy static file वा पुरानो single-document) बाट आएका अध्याय — जसमा अझै Firestore document
   ID छैन — भेटिए तिनलाई यहीँ छुट्टाछुट्टै document मा सार्ने (self-healing, एक पटक मात्र चल्छ) */
async function ensureChaptersHaveIds(bookId, chs) {
  const missing = chs.map((c, i) => ({ c, i })).filter(x => !x.c.id);
  if (!missing.length) return;
  try {
    let batch = db.batch(), count = 0; const commits = [];
    missing.forEach(({ c, i }) => {
      const ref = chaptersColRef(bookId).doc();
      c.id = ref.id;
      c.order = i;
      batch.set(ref, { title: c.title, content: c.content, font: c.font || 'siddhanta', order: i, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      count++;
      if (count === 400) { commits.push(batch.commit()); batch = db.batch(); count = 0; }
    });
    if (count > 0) commits.push(batch.commit());
    await Promise.all(commits);
  } catch (err) {
    console.warn('पुराना अध्याय Firestore मा सार्न सकिएन:', err.message);
  }
}

App.adminChapter = { bookId: null, bookTitle: '', editingIdx: null };

function adminChaptersOpen(bookId) {
  if (!App.isAdmin) return;
  const arr = getCurrentSubjectArr();
  const book = arr?.find(b => b.id === bookId);
  App.adminChapter.bookId = bookId;
  App.adminChapter.bookTitle = book?.title || '';
  const heading = document.getElementById('adminChaptersTitle');
  if (heading) heading.textContent = '📖 अध्याय — ' + (book?.title || '');
  openOv('adminChaptersModal');
  loadAdminChaptersForCurrentBook();
}
window.adminChaptersOpen = adminChaptersOpen;

async function loadAdminChaptersForCurrentBook() {
  const el = document.getElementById('adminChaptersList');
  if (el) el.innerHTML = '<div class="empty-s">लोड हुँदैछ...</div>';
  const bookId = App.adminChapter.bookId;
  let chs = await loadChaptersFromFirestore(bookId);
  if (!chs) {
    // Firestore मा अझै नभए, पहिल्यै browser मा cache भएको (पुरानो फाइलबाट) भए त्यो देखाउने
    chs = (App.chaptersCache && App.chaptersCache[bookId]) ? App.chaptersCache[bookId].map(c => ({ title: c.title, content: c.content, font: c.font })) : [];
  }
  App._adminChaptersCache = chs;
  renderAdminChaptersList();
}

function renderAdminChaptersList() {
  const el = document.getElementById('adminChaptersList');
  if (!el) return;
  const chs = App._adminChaptersCache || [];
  if (!chs.length) { el.innerHTML = '<div class="empty-s">कुनै अध्याय छैन</div>'; return; }
  el.innerHTML = chs.map((c, i) => `
    <div class="sett-row">
      <div class="sett-left">
        <div class="sett-ico" style="background:#e3f2fd">📖</div>
        <div><div class="sett-name">${escapeHtml(c.title || ('अध्याय ' + (i + 1)))}</div><div class="sett-desc">अध्याय ${i + 1}</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button onclick="adminChapterMove(${i},-1)" style="background:none;border:none;cursor:pointer;opacity:${i === 0 ? '0.3' : '1'}" ${i === 0 ? 'disabled' : ''}><img src="images/icons/arrow-up.svg" style="width:16px;height:16px;display:block"></button>
        <button onclick="adminChapterMove(${i},1)" style="background:none;border:none;cursor:pointer;opacity:${i === chs.length - 1 ? '0.3' : '1'}" ${i === chs.length - 1 ? 'disabled' : ''}><img src="images/icons/arrow-down.svg" style="width:16px;height:16px;display:block"></button>
        <button onclick="adminChapterEdit(${i})" style="background:none;border:none;font-size:1.05rem;cursor:pointer">✏️</button>
        <button onclick="adminChapterDelete(${i})" style="background:none;border:none;font-size:1.05rem;cursor:pointer">🗑️</button>
      </div>
    </div>`).join('');
}

function adminChapterAddNew() {
  if (!App.isAdmin) return;
  if (typeof renderMdToolbar === 'function') {
    const tb = document.getElementById('chapterContentToolbar');
    if (tb) tb.innerHTML = renderMdToolbar('chapterFormContent', { title: '📖 अध्याय लेख्नुस्' });
  }
  App.adminChapter.editingIdx = null;
  document.getElementById('chapterFormTitle').value   = '';
  document.getElementById('chapterFormContent').value = '';
  document.getElementById('chapterFormContent').dataset.fontKey = 'siddhanta';
  document.getElementById('chapterFormHeading').textContent = '➕ नयाँ अध्याय';
  openOv('chapterFormModal');
}
window.adminChapterAddNew = adminChapterAddNew;

function adminChapterEdit(idx) {
  if (!App.isAdmin) return;
  const c = (App._adminChaptersCache || [])[idx];
  if (!c) return;
  if (typeof renderMdToolbar === 'function') {
    const tb = document.getElementById('chapterContentToolbar');
    if (tb) tb.innerHTML = renderMdToolbar('chapterFormContent', { title: '📖 अध्याय लेख्नुस्' });
  }
  App.adminChapter.editingIdx = idx;
  document.getElementById('chapterFormTitle').value   = c.title || '';
  document.getElementById('chapterFormContent').value = c.content || '';
  document.getElementById('chapterFormContent').dataset.fontKey = c.font || 'siddhanta';
  document.getElementById('chapterFormHeading').textContent = '✏️ अध्याय सम्पादन';
  openOv('chapterFormModal');
}
window.adminChapterEdit = adminChapterEdit;

async function adminChapterSave() {
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const title   = document.getElementById('chapterFormTitle').value.trim();
  const contentEl = document.getElementById('chapterFormContent');
  const content = contentEl.value;
  const font    = contentEl.dataset.fontKey || 'siddhanta';
  if (!title) { toast('⚠️ शीर्षक आवश्यक छ'); return; }
  const bookId = App.adminChapter.bookId;
  const chs = App._adminChaptersCache || [];
  await ensureChaptersHaveIds(bookId, chs); // पुराना (legacy) अध्याय भए पहिले तिनलाई छुट्टाछुट्टै document मा सार्ने
  let chapterObj;
  if (App.adminChapter.editingIdx !== null && chs[App.adminChapter.editingIdx]) {
    chapterObj = chs[App.adminChapter.editingIdx];
    chapterObj.title = title; chapterObj.content = content; chapterObj.font = font;
  } else {
    chapterObj = { title, content, font, order: chs.length };
    chs.push(chapterObj);
  }
  const ok = await saveChapterItem(bookId, chapterObj); // यो एउटै अध्याय मात्र save हुन्छ — बाँकी document हरू touch हुँदैनन्
  if (ok) {
    toast('✅ अध्याय सुरक्षित भयो');
    closeOv('chapterFormModal');
    App.chaptersCache[bookId] = chs; // ताजा cache सिधै राख्ने
    renderAdminChaptersList();
    refreshInlineChapterView(bookId);
  }
}
window.adminChapterSave = adminChapterSave;

async function adminChapterDelete(idx) {
  if (!App.isAdmin) return;
  if (!(await showConfirm('साँच्चै यो अध्याय मेटाउने?'))) return;
  const bookId = App.adminChapter.bookId;
  const chs = App._adminChaptersCache || [];
  await ensureChaptersHaveIds(bookId, chs);
  const [removed] = chs.splice(idx, 1);
  const ok = await deleteChapterItem(bookId, removed);
  chs.forEach((c, i) => { c.order = i; });
  await reorderChapters(bookId, chs);
  if (ok) {
    toast('🗑️ अध्याय मेटियो');
    App.chaptersCache[bookId] = chs;
    renderAdminChaptersList();
    refreshInlineChapterView(bookId);
  }
}
window.adminChapterDelete = adminChapterDelete;

async function adminChapterMove(idx, dir) {
  const bookId = App.adminChapter.bookId;
  const chs = App._adminChaptersCache || [];
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= chs.length) return;
  await ensureChaptersHaveIds(bookId, chs);
  [chs[idx], chs[newIdx]] = [chs[newIdx], chs[idx]];
  chs[idx].order = idx; chs[newIdx].order = newIdx;
  const ok = await reorderChapters(bookId, [chs[idx], chs[newIdx]]); // सिर्फ सरेका दुई अध्यायको order मात्र अपडेट हुन्छ
  if (ok) {
    App.chaptersCache[bookId] = chs;
    renderAdminChaptersList();
    refreshInlineChapterView(bookId);
  }
}
window.adminChapterMove = adminChapterMove;

/* किताबको आफ्नै "अध्यायहरू" ट्याबबाट सिधै अध्याय थप्ने/सम्पादन गर्ने (Admin Panel नखोली) */
function adminInlineChapterAdd(bookId) {
  if (!App.isAdmin) return;
  App.adminChapter.bookId = bookId;
  App._adminChaptersCache = App.chaptersCache[bookId] || (App.chaptersCache[bookId] = []);
  adminChapterAddNew();
}
window.adminInlineChapterAdd = adminInlineChapterAdd;

function adminInlineChapterEdit(bookId, idx) {
  if (!App.isAdmin) return;
  App.adminChapter.bookId = bookId;
  App._adminChaptersCache = App.chaptersCache[bookId] || [];
  adminChapterEdit(idx);
}
window.adminInlineChapterEdit = adminInlineChapterEdit;

function adminInlineChapterDelete(bookId, idx) {
  if (!App.isAdmin) return;
  App.adminChapter.bookId = bookId;
  App._adminChaptersCache = App.chaptersCache[bookId] || [];
  adminChapterDelete(idx);
}
window.adminInlineChapterDelete = adminInlineChapterDelete;

function refreshInlineChapterView(bookId) {
  if (App.currentChapterBookId === bookId && typeof renderChapterListHtml === 'function') {
    renderChapterListHtml(bookId);
  }
}

/* ════════════════════════════════════
   विषय/समूह (Subject) — Firestore
   collection: site_content, doc: subjects  { subjects: { key: {label, short, g} } }
   यसले js/main.js भित्रको SUBJ constant लाई extend/override गर्छ (नयाँ थप्न वा नाम बदल्न)
   ════════════════════════════════════ */
const SUBJECTS_DOC_REF = () => db.collection('site_content').doc('subjects');

async function loadSubjectsFromFirestore() {
  try {
    const snap = await SUBJECTS_DOC_REF().get();
    if (!snap.exists) return null;
    const data = snap.data();
    const subj = (data && typeof data.subjects === 'object') ? data.subjects : null;
    if (subj) { try { localStorage.setItem('sp_cache_subjects', JSON.stringify(subj)); } catch (e) {} }
    return subj;
  } catch (err) {
    console.warn('Firestore बाट विषय लोड हुन सकेन, offline cache हेर्दैछ:', err.message);
    try {
      const cached = localStorage.getItem('sp_cache_subjects');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  }
}
window.loadSubjectsFromFirestore = loadSubjectsFromFirestore;

async function saveSubjectsToFirestore() {
  try {
    // SUBJ बाटै पूरा snapshot (built-in + custom दुवै) राख्ने, ताकि edit गरेको rename पनि जोगिन्छ
    const plain = {};
    Object.keys(SUBJ).forEach(k => { plain[k] = { label: SUBJ[k].label, short: SUBJ[k].short, g: SUBJ[k].g }; });
    await SUBJECTS_DOC_REF().set({
      subjects: plain,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (err) {
    toast('❌ विषय सुरक्षित गर्न सकिएन: ' + err.message);
    return false;
  }
}

const SUBJECT_PALETTE = [
  '#FF7A45,#D94F1E', '#3E8DFF,#1B4FCC', '#28C76F,#12864A', '#B36BFF,#7A2FD1',
  '#FFB020,#D98800', '#FF5C7A,#C71F45', '#20C4C9,#0E8A8F', '#8D6E63,#5D4037'
];

App.adminSubject = { editingKey: null };

function adminSubjectsOpen() {
  if (!App.isAdmin) return;
  openOv('adminSubjectsModal');
  renderAdminSubjectsList();
}
window.adminSubjectsOpen = adminSubjectsOpen;

function renderAdminSubjectsList() {
  const el = document.getElementById('adminSubjectsList');
  if (!el) return;
  const keys = Object.keys(SUBJ);
  if (!keys.length) { el.innerHTML = '<div class="empty-s">कुनै विषय छैन</div>'; return; }
  el.innerHTML = keys.map(k => {
    const s = SUBJ[k];
    const [c1, c2] = (s.g || '#EEE,#CCC').split(',');
    return `
    <div class="sett-row">
      <div class="sett-left">
        <div class="sett-ico" style="background:linear-gradient(135deg,${c1},${c2})">${escapeHtml(s.short || '?')}</div>
        <div><div class="sett-name">${escapeHtml(s.label || k)}</div><div class="sett-desc">key: ${escapeHtml(k)}</div></div>
      </div>
      <div style="display:flex;gap:12px;flex-shrink:0">
        <button onclick="adminSubjectEdit('${k}')" style="background:none;border:none;font-size:1.05rem;cursor:pointer">✏️</button>
      </div>
    </div>`;
  }).join('');
}

function adminSubjectAddNew() {
  if (!App.isAdmin) return;
  App.adminSubject.editingKey = null;
  const keyEl = document.getElementById('subjectFormKey');
  keyEl.value = '';
  keyEl.disabled = false;
  document.getElementById('subjectFormLabel').value = '';
  document.getElementById('subjectFormShort').value = '';
  document.getElementById('subjectFormHeading').textContent = '➕ नयाँ विषय';
  openOv('subjectFormModal');
}
window.adminSubjectAddNew = adminSubjectAddNew;

function adminSubjectEdit(key) {
  if (!App.isAdmin) return;
  const s = SUBJ[key];
  if (!s) return;
  App.adminSubject.editingKey = key;
  const keyEl = document.getElementById('subjectFormKey');
  keyEl.value = key;
  keyEl.disabled = true; // existing key बदल्न मिल्दैन (books/chapters यही key सँग जोडिएको हुन्छ)
  document.getElementById('subjectFormLabel').value = s.label || '';
  document.getElementById('subjectFormShort').value = s.short || '';
  document.getElementById('subjectFormHeading').textContent = '✏️ विषय सम्पादन';
  openOv('subjectFormModal');
}
window.adminSubjectEdit = adminSubjectEdit;

async function adminSubjectSave() {
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const isNew = !App.adminSubject.editingKey;
  const rawKey  = document.getElementById('subjectFormKey').value.trim().toLowerCase();
  const key     = isNew ? rawKey.replace(/[^a-z0-9_]/g, '') : App.adminSubject.editingKey;
  const label   = document.getElementById('subjectFormLabel').value.trim();
  const short   = document.getElementById('subjectFormShort').value.trim();
  if (!key || !label) { toast('⚠️ Key र नाम दुवै आवश्यक छ'); return; }

  if (isNew && SUBJ[key]) { toast('⚠️ यो key पहिल्यै अस्तित्वमा छ'); return; }

  if (isNew) {
    const g = SUBJECT_PALETTE[Object.keys(SUBJ).length % SUBJECT_PALETTE.length];
    SUBJ[key] = { label, short: short || label.slice(0, 2), g };
    // सबै वर्षमा यो नयाँ विषयको लागि खाली किताब-array थप्ने
    (App.data.years || []).forEach(y => {
      if (!y.subjects) y.subjects = {};
      if (!Array.isArray(y.subjects[key])) y.subjects[key] = [];
    });
    const ok1 = await saveBooksToFirestore();
    const ok2 = await saveSubjectsToFirestore();
    if (ok1 && ok2) {
      toast('✅ नयाँ विषय थपियो');
      closeOv('subjectFormModal');
      renderAdminSubjectsList();
      if (typeof renderAdminBooksSubjectTabs === 'function') renderAdminBooksSubjectTabs();
      refreshBookViews();
    }
  } else {
    SUBJ[key].label = label;
    SUBJ[key].short = short || SUBJ[key].short;
    const ok = await saveSubjectsToFirestore();
    if (ok) {
      toast('✅ विषय अपडेट भयो');
      closeOv('subjectFormModal');
      renderAdminSubjectsList();
      if (typeof renderAdminBooksSubjectTabs === 'function') renderAdminBooksSubjectTabs();
      refreshBookViews();
    }
  }
}
window.adminSubjectSave = adminSubjectSave;

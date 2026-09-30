/* ================================================
   शास्त्री पोर्टल — Admin (GitHub API बाट सम्पादन)
   ================================================
   - Firebase छैन। Admin = वैध GitHub token भएको व्यक्ति।
   - सबै सम्पादन (सूचना, समाचार, किताब, विषय, अध्याय, फोटो) GitHub repo मा
     सिधै commit हुन्छ — data/*.json, data/chapters/{bookId}.json, images/uploads/
   - वास्तविक सुरक्षा GitHub ले गर्छ: token बिना कसैले लेख्न सक्दैन।
   ================================================ */
'use strict';

App.isAdmin   = false;
App.adminUser = null;

const DATA_BOOKS    = 'data/books.json';
const DATA_SUBJECTS = 'data/subjects.json';
const DATA_NEWS     = 'data/news.json';
const DATA_FEED     = 'data/feed.json';
const chapterPath   = (bookId) => `data/chapters/${bookId}.json`;

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* GitHub मा लेख्ने साझा wrapper — सफल भए true, नभए toast देखाएर false */
async function ghSave(fn, failMsg) {
  try { await fn(); return true; }
  catch (err) { toast('❌ ' + failMsg + ': ' + err.message); return false; }
}

/* ════════════════════════════════════
   LOGIN (GitHub token)
   ════════════════════════════════════ */
function openAdminLogin() {
  const cfg = GH.cfg();
  document.getElementById('adminGhOwner').value = cfg.owner || '';
  document.getElementById('adminGhRepo').value  = cfg.repo  || '';
  document.getElementById('adminGhToken').value = '';
  const err = document.getElementById('adminGhError');
  err.style.display = 'none';
  openOv('adminLoginModal');
}
window.openAdminLogin = openAdminLogin;

async function adminConnect() {
  const owner  = document.getElementById('adminGhOwner').value.trim();
  const repo   = document.getElementById('adminGhRepo').value.trim();
  const token  = document.getElementById('adminGhToken').value.trim();
  const remember = document.getElementById('adminGhRemember').checked;
  const err = document.getElementById('adminGhError');
  const btn = document.getElementById('adminGhBtn');
  err.style.display = 'none';
  if (!owner || !repo || !token) { err.textContent = 'तीनवटै ठाउँ भर्नुस्।'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'जाँच्दैछ…';
  const r = await GH.verify(token, owner, repo);
  btn.disabled = false; btn.textContent = '✅ जोड्नुस्';
  if (!r.ok) { err.textContent = '❌ ' + r.error; err.style.display = 'block'; return; }
  GH.saveCfg(owner, repo, r.defaultBranch || 'main');
  GH.setToken(token, remember);
  document.getElementById('adminGhToken').value = '';
  closeOv('adminLoginModal');
  await activateAdmin(r.login);
}
window.adminConnect = adminConnect;

function adminLogout() {
  GH.clearToken();
  App.isAdmin = false;
  App.adminUser = null;
  renderAdminUI();
  toast('👋 Logout भयो');
}
window.adminLogout = adminLogout;

async function activateAdmin(login) {
  App.isAdmin = true;
  App.adminUser = { login };
  toast('✅ Admin जोडियो — @' + login);
  renderAdminUI();
  await adminRefreshFromGitHub();
}

/* पेज खुल्दा — पहिले नै token सुरक्षित छ भने चुपचाप जाँचेर Admin बनाउने */
async function adminAutoLogin() {
  const t = GH.token();
  if (!t) return;
  const r = await GH.verify(t);
  if (r.ok) { await activateAdmin(r.login); }
  else if (/गलत|अनुमति छैन|लेख्न पाउँदैन/.test(r.error || '')) { GH.clearToken(); toast('⚠️ सुरक्षित token काम गरेन, फेरि Login गर्नुस्'); }
}

function renderAdminUI() {
  const loginBox = document.getElementById('adminLoginBox');
  const panelBox = document.getElementById('adminPanelBox');
  if (loginBox && panelBox) {
    loginBox.style.display = App.isAdmin ? 'none'  : 'block';
    panelBox.style.display = App.isAdmin ? 'block' : 'none';
    const nameEl = document.getElementById('adminNameDisp');
    if (nameEl) nameEl.textContent = App.adminUser ? '@' + App.adminUser.login : '';
  }
  document.body.classList.toggle('is-admin', App.isAdmin);
  renderAdminNoticeList();
}

/* Admin ले हेर्ने डाटा GitHub API बाट सिधै (Pages को पुरानो cache बाट होइन) ताजा तान्ने,
   ताकि आफ्नै भर्खरको commit माथि पुरानो डाटा लेखिएर नबिग्रियोस् */
async function adminRefreshFromGitHub() {
  try {
    const [books, subj, news, feed] = await Promise.all([
      GH.readJson(DATA_BOOKS), GH.readJson(DATA_SUBJECTS), GH.readJson(DATA_NEWS), GH.readJson(DATA_FEED)
    ]);
    if (books && Array.isArray(books.years)) App.data.years = books.years;
    if (subj && typeof subj === 'object') Object.assign(SUBJ, subj);
    if (Array.isArray(news)) App.data.news = news;
    if (Array.isArray(feed)) App.feedPosts = feed;
    App.chaptersCache = {};
  } catch (err) {
    toast('⚠️ GitHub बाट ताजा डाटा तान्न सकिएन: ' + err.message);
  }
  refreshBookViews();
  refreshNoticeViews();
  if (typeof renderNewsListPage === 'function') renderNewsListPage();
  if (App.currentChapterBookId && document.getElementById('chList') && typeof loadAndRenderChapters === 'function') {
    loadAndRenderChapters(App.currentChapterBookId);
  }
  renderAdminNoticeList();
}

/* ════════════════════════════════════
   फोटो छान्ने (सूचना/समाचार र किताबको cover)
   — छान्दा browser मै सानो बनाइन्छ; GitHub मा अपलोड "सुरक्षित गर्नुस्" थिच्दा मात्र हुन्छ
   ════════════════════════════════════ */
async function handleNoticeImageChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const prepared = await GH.prepareImage(file);
    App._noticeImg = prepared;
    document.getElementById('noticeImgPreview').src = prepared.dataUrl;
    document.getElementById('noticeImgPreviewWrap').style.display = 'block';
    document.getElementById('noticeImgPickBtn').textContent = '📷 फोटो बदल्नुस्';
  } catch (err) { toast('⚠️ ' + err.message); }
}
window.handleNoticeImageChange = handleNoticeImageChange;

function removeNoticeImage() {
  App._noticeImg = null;
  document.getElementById('noticeFormImage').value = '';
  document.getElementById('noticeFormImageFile').value = '';
  document.getElementById('noticeImgPreviewWrap').style.display = 'none';
  document.getElementById('noticeImgPickBtn').textContent = '📷 फोटो छान्नुस्';
}
window.removeNoticeImage = removeNoticeImage;

async function handleBookCoverChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const prepared = await GH.prepareImage(file, 900);
    App._bookCoverImg = prepared;
    const prev = document.getElementById('bookCoverPreview');
    prev.src = prepared.dataUrl; prev.style.display = 'block';
  } catch (err) { toast('⚠️ ' + err.message); }
}
window.handleBookCoverChange = handleBookCoverChange;

/* ════════════════════════════════════
   सूचना (home board) र समाचार feed
   files: data/news.json (App.data.news), data/feed.json (App.feedPosts)
   ════════════════════════════════════ */
const cleanPost = (p) => {
  const o = { title: p.title || '', content: p.content || '', date: p.date || '', category: p.category || '', image: p.image || '' };
  if (p.font && p.font !== 'siddhanta') o.font = p.font;
  if (p.authorName) o.authorName = p.authorName;
  return o;
};

function openNoticeForm(notice = null, target = 'notices', idx = null) {
  if (!App.isAdmin) return;
  App._noticeTarget = target;      // 'notices' = home board, 'feed' = समाचार पेजको feed
  App._noticeEditIdx = notice ? idx : null;
  App._noticeImg = null;
  if (typeof renderMdToolbar === 'function') {
    const tb = document.getElementById('noticeContentToolbar');
    if (tb) tb.innerHTML = renderMdToolbar('noticeFormContent', { title: '📢 सूचना लेख्नुस्' });
  }
  document.getElementById('noticeFormTitle').value    = notice?.title    || '';
  document.getElementById('noticeFormContent').value  = notice?.content  || '';
  document.getElementById('noticeFormDate').value     = notice?.date     || '';
  document.getElementById('noticeFormCategory').value = notice?.category || '';
  document.getElementById('noticeFormImage').value    = notice?.image    || '';
  document.getElementById('noticeFormAuthor').value   = notice?.authorName || '';
  document.getElementById('noticeFormAuthorGroup').style.display = target === 'feed' ? 'block' : 'none';
  document.getElementById('noticeFormContent').dataset.fontKey = notice?.font || 'siddhanta';
  const prevWrap = document.getElementById('noticeImgPreviewWrap');
  const prevImg  = document.getElementById('noticeImgPreview');
  const pickBtn  = document.getElementById('noticeImgPickBtn');
  if (notice?.image) {
    prevImg.src = notice.image; prevWrap.style.display = 'block';
    pickBtn.textContent = '📷 फोटो बदल्नुस्';
  } else {
    prevWrap.style.display = 'none';
    pickBtn.textContent = '📷 फोटो छान्नुस्';
  }
  document.getElementById('noticeFormImageFile').value = '';
  document.getElementById('noticeFormHeading').textContent = notice ? '✏️ सम्पादन' : (target === 'feed' ? '➕ नयाँ पोस्ट' : '➕ नयाँ सूचना');
  openOv('noticeFormModal');
}
window.openNoticeForm = openNoticeForm;

async function saveNoticeForm() {
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const isFeed = App._noticeTarget === 'feed';
  const contentEl = document.getElementById('noticeFormContent');
  const data = {
    title:    document.getElementById('noticeFormTitle').value.trim(),
    content:  contentEl.value.trim(),
    date:     document.getElementById('noticeFormDate').value.trim(),
    category: document.getElementById('noticeFormCategory').value.trim(),
    image:    document.getElementById('noticeFormImage').value.trim(),
    font:     contentEl.dataset.fontKey || 'siddhanta',
  };
  if (isFeed) { const a = document.getElementById('noticeFormAuthor').value.trim(); if (a) data.authorName = a; }
  if (!data.title || !data.content) { toast('⚠️ शीर्षक र विवरण आवश्यक छ'); return; }

  toast('⏳ GitHub मा सुरक्षित गर्दैछ…');
  const ok = await ghSave(async () => {
    if (App._noticeImg) data.image = await GH.uploadImage(App._noticeImg);
    const src = isFeed ? App.feedPosts : (App.data.news || []);
    const list = src.map(cleanPost);
    const i = App._noticeEditIdx;
    if (i !== null && i !== undefined && list[i]) list[i] = cleanPost(data); else list.unshift(cleanPost(data));
    await GH.writeJson(isFeed ? DATA_FEED : DATA_NEWS, list, (isFeed ? 'Update feed: ' : 'Update notice: ') + data.title);
    if (isFeed) App.feedPosts = list; else App.data.news = list;
  }, 'सुरक्षित गर्न सकिएन');
  if (!ok) return;
  toast('✅ सुरक्षित भयो (१–२ मिनेटमा सबैले देख्छन्)');
  closeOv('noticeFormModal');
  if (isFeed) renderNewsListPage(); else refreshNoticeViews();
}
window.saveNoticeForm = saveNoticeForm;

async function deleteNoticeAt(i) {
  if (!App.isAdmin) return;
  if (!(await showConfirm('साँच्चै यो सूचना मेटाउने?'))) return;
  const list = (App.data.news || []).map(cleanPost);
  list.splice(i, 1);
  if (await ghSave(() => GH.writeJson(DATA_NEWS, list, 'Delete notice'), 'मेटाउन सकिएन')) {
    App.data.news = list; toast('🗑️ सूचना मेटियो'); refreshNoticeViews();
  }
}
window.deleteNoticeAt = deleteNoticeAt;

function editNoticeByIndex(i) {
  const n = App.data?.news?.[i];
  if (n) openNoticeForm(n, 'notices', i);
}
window.editNoticeByIndex = editNoticeByIndex;

function refreshNoticeViews() {
  App.newsIdx = 0;
  if (typeof setNews === 'function') setNews(0);
  if (typeof renderNewsBoardDots === 'function') renderNewsBoardDots();
  if (typeof renderTicker === 'function') renderTicker();
  if (typeof renderNewsCards === 'function') renderNewsCards();
  renderAdminNoticeList();
}
window.refreshNoticeViews = refreshNoticeViews;

function editFeedPostByIdx(i) {
  const p = App.feedPosts?.[i];
  if (p) openNoticeForm(p, 'feed', i);
}
window.editFeedPostByIdx = editFeedPostByIdx;

async function deleteFeedPostAt(i) {
  if (!App.isAdmin) return;
  if (!(await showConfirm('साँच्चै यो पोस्ट मेटाउने?'))) return;
  const list = App.feedPosts.map(cleanPost);
  list.splice(i, 1);
  if (await ghSave(() => GH.writeJson(DATA_FEED, list, 'Delete feed post'), 'मेटाउन सकिएन')) {
    App.feedPosts = list; toast('🗑️ पोस्ट मेटियो'); renderNewsListPage();
  }
}
window.deleteFeedPostAt = deleteFeedPostAt;

function renderAdminNoticeList() {
  const el = document.getElementById('adminNoticeList');
  if (!el) return;
  const list = App.data?.news || [];
  if (!list.length) { el.innerHTML = '<div class="empty-s">कुनै सूचना छैन</div>'; return; }
  el.innerHTML = list.map((n, i) => `
    <div class="sett-row">
      <div class="sett-left">
        <div class="sett-ico" style="background:#fff3e0">📢</div>
        <div><div class="sett-name">${escapeHtml(n.title)}</div><div class="sett-desc">${escapeHtml(n.date || '')}${n.category ? ' · ' + escapeHtml(n.category) : ''}</div></div>
      </div>
      <div style="display:flex;gap:12px;flex-shrink:0">
        <button onclick="editNoticeByIndex(${i})" style="background:none;border:none;font-size:1.05rem;cursor:pointer">✏️</button>
        <button onclick="deleteNoticeAt(${i})" style="background:none;border:none;font-size:1.05rem;cursor:pointer">🗑️</button>
      </div>
    </div>`).join('');
}

/* ════════════════════════════════════
   किताब (Books) — data/books.json  { years: [...] }
   ════════════════════════════════════ */
async function saveBooksToGitHub(msg = 'Update books') {
  return ghSave(() => GH.writeJson(DATA_BOOKS, { years: App.data.years }, msg), 'किताब सुरक्षित गर्न सकिएन');
}

App.adminBook = { yearId: 1, subjectId: 'nepali', editingIdx: null };

function adminBooksOpen() {
  if (!App.isAdmin) return;
  const years = App.data?.years || [];
  if (years.length && !years.find(y => y.id === App.adminBook.yearId)) App.adminBook.yearId = years[0].id;
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
function adminBooksSetYear(id) { App.adminBook.yearId = id; renderAdminBooksYearTabs(); renderAdminBooksList(); }
window.adminBooksSetYear = adminBooksSetYear;

function renderAdminBooksSubjectTabs() {
  const el = document.getElementById('adminBooksSubjectTabs');
  if (!el) return;
  el.innerHTML = Object.keys(SUBJ).map(k => `<button class="tab-btn ${App.adminBook.subjectId === k ? 'on' : ''}" style="flex:none;padding:8px 14px;white-space:nowrap" onclick="adminBooksSetSubject('${k}')">${SUBJ[k].short} ${escapeHtml(SUBJ[k].label)}</button>`).join('');
}
function adminBooksSetSubject(k) { App.adminBook.subjectId = k; renderAdminBooksSubjectTabs(); renderAdminBooksList(); }
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
  const n = idx + dir;
  if (n < 0 || n >= arr.length) return;
  [arr[idx], arr[n]] = [arr[n], arr[idx]];
  renderAdminBooksList();
  if (await saveBooksToGitHub('Reorder books')) refreshBookViews();
  else { [arr[idx], arr[n]] = [arr[n], arr[idx]]; renderAdminBooksList(); }
}
window.adminBookMove = adminBookMove;

function _bookFormToolbar() {
  if (typeof renderMdToolbar === 'function') {
    const tb = document.getElementById('bookDescToolbar');
    if (tb) tb.innerHTML = renderMdToolbar('bookFormDesc', { title: '📚 किताबको विवरण' });
  }
}
function _bookFormCoverReset(cover) {
  App._bookCoverImg = null;
  document.getElementById('bookFormCoverFile').value = '';
  const prev = document.getElementById('bookCoverPreview');
  if (cover) { prev.src = cover; prev.style.display = 'block'; } else { prev.removeAttribute('src'); prev.style.display = 'none'; }
}

function adminBookAddNew() {
  if (!App.isAdmin) return;
  _bookFormToolbar();
  App.adminBook.editingIdx = null;
  document.getElementById('bookFormTitle').value  = '';
  document.getElementById('bookFormAuthor').value = '';
  document.getElementById('bookFormCover').value  = '';
  document.getElementById('bookFormDesc').value   = '';
  document.getElementById('bookFormDesc').dataset.fontKey = 'siddhanta';
  document.getElementById('bookFormPdf').value    = '';
  _bookFormCoverReset('');
  document.getElementById('bookFormHeading').textContent = '➕ नयाँ किताब';
  openOv('bookFormModal');
}
window.adminBookAddNew = adminBookAddNew;

function adminBookEdit(idx) {
  if (!App.isAdmin) return;
  _bookFormToolbar();
  const b = getCurrentSubjectArr()?.[idx];
  if (!b) return;
  App.adminBook.editingIdx = idx;
  document.getElementById('bookFormTitle').value  = b.title || '';
  document.getElementById('bookFormAuthor').value = b.author || '';
  document.getElementById('bookFormCover').value  = b.cover || '';
  document.getElementById('bookFormDesc').value   = b.description || '';
  document.getElementById('bookFormDesc').dataset.fontKey = b.font || 'siddhanta';
  document.getElementById('bookFormPdf').value    = b.pdf || '';
  _bookFormCoverReset(b.cover || '');
  document.getElementById('bookFormHeading').textContent = '✏️ किताब सम्पादन';
  openOv('bookFormModal');
}
window.adminBookEdit = adminBookEdit;

async function adminBookSave() {
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const title  = document.getElementById('bookFormTitle').value.trim();
  const author = document.getElementById('bookFormAuthor').value.trim();
  let cover    = document.getElementById('bookFormCover').value.trim();
  const descEl = document.getElementById('bookFormDesc');
  const desc   = descEl.value.trim();
  const font   = descEl.dataset.fontKey || 'siddhanta';
  const pdf    = document.getElementById('bookFormPdf').value.trim();
  if (!title) { toast('⚠️ शीर्षक आवश्यक छ'); return; }
  const arr = getCurrentSubjectArr();
  if (!arr) return;
  const snap = JSON.stringify(App.data.years);
  toast('⏳ GitHub मा सुरक्षित गर्दैछ…');
  const ok = await ghSave(async () => {
    if (App._bookCoverImg) cover = await GH.uploadImage(App._bookCoverImg, 'images/covers');
    const bookData = { title, author, cover, description: desc, font, pdf };
    const eIdx = App.adminBook.editingIdx;
    if (eIdx !== null && arr[eIdx]) arr[eIdx] = { id: arr[eIdx].id, ...bookData };
    else arr.push({ id: `${App.adminBook.subjectId.slice(0, 3)}${App.adminBook.yearId}_${Date.now()}`, ...bookData });
    await GH.writeJson(DATA_BOOKS, { years: App.data.years }, 'Update book: ' + title);
  }, 'किताब सुरक्षित गर्न सकिएन');
  if (!ok) { App.data.years = JSON.parse(snap); return; }
  toast('✅ किताब सुरक्षित भयो');
  closeOv('bookFormModal');
  renderAdminBooksList();
  refreshBookViews();
}
window.adminBookSave = adminBookSave;

async function adminBookDelete(idx) {
  if (!App.isAdmin) return;
  if (!(await showConfirm('साँच्चै यो किताब मेटाउने? (अध्यायको फाइल भने रहन्छ)'))) return;
  const arr = getCurrentSubjectArr();
  if (!arr) return;
  const snap = JSON.stringify(App.data.years);
  arr.splice(idx, 1);
  if (await saveBooksToGitHub('Delete book')) { toast('🗑️ किताब मेटियो'); renderAdminBooksList(); refreshBookViews(); }
  else App.data.years = JSON.parse(snap);
}
window.adminBookDelete = adminBookDelete;

function refreshBookViews() {
  if (typeof renderHome === 'function') renderHome();
  if (App.page === 'year' && App.yearId && typeof renderYearPage === 'function') renderYearPage(App.yearId);
  if (App.page === 'subject' && App.subjectId && typeof renderSubjectPage === 'function') renderSubjectPage(App.subjectId, App.yearId);
}
window.refreshBookViews = refreshBookViews;

/* ════════════════════════════════════
   अध्याय (Chapters) — data/chapters/{bookId}.json
   एउटा किताबका सबै अध्याय एउटै फाइलमा: [ { title, content, font }, ... ]
   (पुरानो data/chapters/{bookId}/1.js, 2.js... भए तिनै पढिन्छ; पहिलो पटक सुरक्षित गर्दा
    सबै नयाँ .json फाइलमा सर्छन् र त्यही प्राथमिकता पाउँछ)
   ════════════════════════════════════ */
async function saveChapters(bookId, list, msg) {
  const payload = list.map(c => ({ title: c.title || '', content: c.content || '', font: c.font || 'siddhanta' }));
  return ghSave(() => GH.writeJson(chapterPath(bookId), payload, msg || 'Update chapters: ' + bookId), 'अध्याय सुरक्षित गर्न सकिएन');
}

/* GitHub बाट ताजा अध्याय ल्याएर cache मा राख्ने (नभए पुरानो .js फाइलबाट) */
async function adminSyncChapters(bookId) {
  let chs = null;
  try { chs = await GH.readJson(chapterPath(bookId)); } catch (e) { toast('⚠️ ' + e.message); }
  if (!Array.isArray(chs)) chs = (typeof loadChaptersForBook === 'function') ? await loadChaptersForBook(bookId) : [];
  App.chaptersCache[bookId] = chs;
  return chs;
}

App.adminChapter = { bookId: null, bookTitle: '', editingIdx: null };

function adminChaptersOpen(bookId) {
  if (!App.isAdmin) return;
  const book = getCurrentSubjectArr()?.find(b => b.id === bookId);
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
  await adminSyncChapters(App.adminChapter.bookId);
  renderAdminChaptersList();
}

function renderAdminChaptersList() {
  const el = document.getElementById('adminChaptersList');
  if (!el) return;
  const chs = App.chaptersCache[App.adminChapter.bookId] || [];
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

function _chapterFormToolbar() {
  if (typeof renderMdToolbar === 'function') {
    const tb = document.getElementById('chapterContentToolbar');
    if (tb) tb.innerHTML = renderMdToolbar('chapterFormContent', { title: '📖 अध्याय लेख्नुस्' });
  }
}

function adminChapterAddNew() {
  if (!App.isAdmin) return;
  _chapterFormToolbar();
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
  const c = (App.chaptersCache[App.adminChapter.bookId] || [])[idx];
  if (!c) return;
  _chapterFormToolbar();
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
  const bookId = App.adminChapter.bookId;
  const title = document.getElementById('chapterFormTitle').value.trim();
  const contentEl = document.getElementById('chapterFormContent');
  if (!title) { toast('⚠️ शीर्षक आवश्यक छ'); return; }
  const item = { title, content: contentEl.value, font: contentEl.dataset.fontKey || 'siddhanta' };
  const list = (App.chaptersCache[bookId] || []).map(c => ({ ...c }));
  const i = App.adminChapter.editingIdx;
  if (i !== null && list[i]) list[i] = item; else list.push(item);
  toast('⏳ GitHub मा सुरक्षित गर्दैछ…');
  if (!(await saveChapters(bookId, list, 'Update chapter: ' + title))) return;
  App.chaptersCache[bookId] = list;
  toast('✅ अध्याय सुरक्षित भयो');
  closeOv('chapterFormModal');
  renderAdminChaptersList();
  refreshInlineChapterView(bookId);
}
window.adminChapterSave = adminChapterSave;

async function adminChapterDelete(idx) {
  if (!App.isAdmin) return;
  const bookId = App.adminChapter.bookId;
  if (!(await showConfirm('साँच्चै यो अध्याय मेटाउने?'))) return;
  const list = (App.chaptersCache[bookId] || []).map(c => ({ ...c }));
  list.splice(idx, 1);
  if (!(await saveChapters(bookId, list, 'Delete chapter'))) return;
  App.chaptersCache[bookId] = list;
  toast('🗑️ अध्याय मेटियो');
  renderAdminChaptersList();
  refreshInlineChapterView(bookId);
}
window.adminChapterDelete = adminChapterDelete;

async function adminChapterMove(idx, dir) {
  if (!App.isAdmin) return;
  const bookId = App.adminChapter.bookId;
  const list = (App.chaptersCache[bookId] || []).map(c => ({ ...c }));
  const n = idx + dir;
  if (n < 0 || n >= list.length) return;
  [list[idx], list[n]] = [list[n], list[idx]];
  if (!(await saveChapters(bookId, list, 'Reorder chapters'))) return;
  App.chaptersCache[bookId] = list;
  renderAdminChaptersList();
  refreshInlineChapterView(bookId);
}
window.adminChapterMove = adminChapterMove;

/* किताबको आफ्नै "अध्यायहरू" ट्याबबाट सिधै (Admin Panel नखोली) */
async function adminInlineChapterAdd(bookId) {
  if (!App.isAdmin) return;
  App.adminChapter.bookId = bookId;
  await adminSyncChapters(bookId);
  adminChapterAddNew();
}
window.adminInlineChapterAdd = adminInlineChapterAdd;

async function adminInlineChapterEdit(bookId, idx) {
  if (!App.isAdmin) return;
  App.adminChapter.bookId = bookId;
  await adminSyncChapters(bookId);
  adminChapterEdit(idx);
}
window.adminInlineChapterEdit = adminInlineChapterEdit;

async function adminInlineChapterDelete(bookId, idx) {
  if (!App.isAdmin) return;
  App.adminChapter.bookId = bookId;
  await adminSyncChapters(bookId);
  adminChapterDelete(idx);
}
window.adminInlineChapterDelete = adminInlineChapterDelete;

function refreshInlineChapterView(bookId) {
  if (App.currentChapterBookId === bookId && typeof renderChapterListHtml === 'function') renderChapterListHtml(bookId);
}

/* ════════════════════════════════════
   विषय (Subject) — data/subjects.json  { key: {label, short, g} }
   ════════════════════════════════════ */
async function saveSubjectsToGitHub() {
  const plain = {};
  Object.keys(SUBJ).forEach(k => { plain[k] = { label: SUBJ[k].label, short: SUBJ[k].short, g: SUBJ[k].g }; });
  return ghSave(() => GH.writeJson(DATA_SUBJECTS, plain, 'Update subjects'), 'विषय सुरक्षित गर्न सकिएन');
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
  keyEl.value = ''; keyEl.disabled = false;
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
  keyEl.value = key; keyEl.disabled = true; // किताब/अध्याय यही key सँग जोडिएका छन्
  document.getElementById('subjectFormLabel').value = s.label || '';
  document.getElementById('subjectFormShort').value = s.short || '';
  document.getElementById('subjectFormHeading').textContent = '✏️ विषय सम्पादन';
  openOv('subjectFormModal');
}
window.adminSubjectEdit = adminSubjectEdit;

async function adminSubjectSave() {
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const isNew = !App.adminSubject.editingKey;
  const rawKey = document.getElementById('subjectFormKey').value.trim().toLowerCase();
  const key    = isNew ? rawKey.replace(/[^a-z0-9_]/g, '') : App.adminSubject.editingKey;
  const label  = document.getElementById('subjectFormLabel').value.trim();
  const short  = document.getElementById('subjectFormShort').value.trim();
  if (!key || !label) { toast('⚠️ Key र नाम दुवै आवश्यक छ'); return; }
  if (isNew && SUBJ[key]) { toast('⚠️ यो key पहिल्यै अस्तित्वमा छ'); return; }

  let ok;
  if (isNew) {
    const g = SUBJECT_PALETTE[Object.keys(SUBJ).length % SUBJECT_PALETTE.length];
    SUBJ[key] = { label, short: short || label.slice(0, 2), g };
    (App.data.years || []).forEach(y => {
      if (!y.subjects) y.subjects = {};
      if (!Array.isArray(y.subjects[key])) y.subjects[key] = [];
    });
    ok = (await saveBooksToGitHub('Add subject: ' + key)) && (await saveSubjectsToGitHub());
  } else {
    SUBJ[key].label = label;
    SUBJ[key].short = short || SUBJ[key].short;
    ok = await saveSubjectsToGitHub();
  }
  if (ok) {
    toast(isNew ? '✅ नयाँ विषय थपियो' : '✅ विषय अपडेट भयो');
    closeOv('subjectFormModal');
    renderAdminSubjectsList();
    renderAdminBooksSubjectTabs();
    refreshBookViews();
  }
}
window.adminSubjectSave = adminSubjectSave;

/* ── सुरु ── */
window.addEventListener('load', () => { adminAutoLogin(); });

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
App._mdImgs   = App._mdImgs  || {};   // सम्पादकमा राखेका फोटो: pending id -> {dataUrl,b64}
App._mdImgUp  = App._mdImgUp || {};   // pending id -> GitHub मा गएको path

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
   सम्पादकमा राखेका फोटो (pending:ID) — Commit गर्दा मात्र GitHub मा अपलोड हुन्छन्
   ════════════════════════════════════ */
async function resolvePendingImages(text) {
  if (!text || text.indexOf('pending:') === -1) return text;
  const ids = [...new Set([...text.matchAll(/pending:([A-Za-z0-9_-]+)/g)].map(m => m[1]))];
  for (const id of ids) {
    let path = App._mdImgUp[id];
    if (!path) {
      const prep = App._mdImgs[id];
      if (!prep) throw new Error('एउटा फोटो तयार छैन (पेज reload भएको हुन सक्छ) — फोटो फेरि जोड्नुस्');
      path = await GH.uploadImage(prep, 'images/content');
      App._mdImgUp[id] = path;
    }
    text = text.split('pending:' + id).join(path);
  }
  return text;
}
/* पूर्वावलोकनमा pending फोटो ब्राउजरमै भएको प्रति (dataUrl) बाट देखाउने */
function pvSubstitute(html) {
  return html.replace(/pending:([A-Za-z0-9_-]+)/g, (m, id) => (App._mdImgUp[id] || (App._mdImgs[id] && App._mdImgs[id].dataUrl) || m));
}

/* ════════════════════════════════════
   LOGIN (GitHub token)
   ════════════════════════════════════ */
/* Admin Login — सेटिङ पेजकै कार्डभित्र (अध्याय खुले जस्तै: चेभ्रन घुम्छ, भाग त्यहीँ खुल्छ) */
function adminInlineToggle(on) {
  const box = document.getElementById('adminLoginBox'), row = document.getElementById('adminLoginRow');
  if (!box) return;
  box.classList.toggle('open', !!on);
  if (row) row.setAttribute('aria-expanded', on ? 'true' : 'false');
  if (on) setTimeout(() => { try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }, 60);
}
function adminInlineClose() { adminInlineToggle(false); }
window.adminInlineClose = adminInlineClose;

function openAdminLogin() {
  const bx = document.getElementById('adminLoginBox');
  if (bx && bx.classList.contains('open')) { adminInlineClose(); return; }    // फेरि थिच्दा बन्द
  const cfg = GH.cfg();
  document.getElementById('adminGhOwner').value = cfg.owner || '';
  document.getElementById('adminGhRepo').value  = cfg.repo  || '';
  document.getElementById('adminGhToken').value = '';
  document.getElementById('adminGhError').style.display = 'none';
  document.getElementById('adminPin').value = '';
  document.getElementById('adminPinError').style.display = 'none';
  /* सर्भर (Cloudflare) मा PIN/Fingerprint सेटअप भएको छ भने त्यही देखाउने, नत्र पुरानो token फारम */
  window.__adminModeChosen = false;
  adminLoginMode(localStorage.getItem('sp_admin_fn') === '1' ? 'pin' : 'token');
  adminInlineToggle(true);
  fetch('/api/admin/status', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
    const on = !!(j && j.configured);
    localStorage.setItem('sp_admin_fn', on ? '1' : '0');
    document.getElementById('adminToPin').style.display = on ? '' : 'none';
    if (on && !window.__adminModeChosen) adminLoginMode('pin');
    if (!on) adminLoginMode('token');
  }).catch(() => {});
}
window.openAdminLogin = openAdminLogin;

/* 'pin' (PIN/Fingerprint) वा 'token' (पुरानो) फारम */
function adminLoginMode(m, byUser) {
  const pin = m === 'pin';
  if (byUser) window.__adminModeChosen = true;                 // हातले छानेको मोड सर्भरको जवाफले नबदलियोस्
  const show = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none'; };
  show('adminPinBox', pin); show('adminPinBtns', pin); show('adminTokenBox', !pin); show('adminTokenBtns', !pin);
  show('adminToPin', !pin && localStorage.getItem('sp_admin_fn') === '1');
  show('adminFpBtn', pin && !!localStorage.getItem(FP_KEY) && !!window.PublicKeyCredential);
  if (pin) setTimeout(() => { const e = document.getElementById('adminPin'); if (e) e.focus(); }, 150);
}
window.adminLoginMode = adminLoginMode;

/* ── PIN लगइन ── */
async function adminPinLogin() {
  const pin = document.getElementById('adminPin').value.trim();
  const err = document.getElementById('adminPinError'), btn = document.getElementById('adminPinBtn');
  const bad = m => { err.textContent = '❌ ' + m; err.style.display = 'block'; };
  err.style.display = 'none';
  if (!pin) return bad('PIN लेख्नुस्');
  btn.disabled = true; btn.textContent = 'जाँच्दैछ…';
  try {
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.token) return await adminProxyIn(j);
    if (j.error === 'wrong_pin') bad('PIN गलत छ — ' + j.left + ' प्रयास बाँकी');
    else if (res.status === 429) bad('धेरै गलत प्रयास — ' + adminWait(j.retry) + ' पछि फेरि प्रयास गर्नुस्');
    else if (res.status === 503) bad('Cloudflare मा सेटअप पूरा भएको छैन');
    else bad('सर्भर समस्या (' + res.status + ')');
  } catch (e) { bad('नेटवर्क समस्या'); }
  finally { btn.disabled = false; btn.textContent = '🔓 खोल्नुस्'; document.getElementById('adminPin').value = ''; }
}
window.adminPinLogin = adminPinLogin;
const adminWait = s => s >= 3600 ? Math.ceil(s / 3600) + ' घण्टा' : Math.ceil(s / 60) + ' मिनेट';

async function adminProxyIn(j) {
  GH.setSession(j.token, j.exp);
  GH.saveCfg(j.owner, String(j.repo).split('/')[1], 'main');
  document.getElementById('adminPin').value = '';
  adminInlineClose();
  await activateAdmin(j.owner);
}

/* ── Fingerprint (फोनको आफ्नै स्क्यानर — WebAuthn; सर्भरले सार्वजनिक कुञ्जीले जाँच्छ) ── */
const FP_KEY = 'sp_fp_id';
const _b64u = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const _unb64u = t => { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; const bin = atob(t), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

async function adminFpLogin() {
  const err = document.getElementById('adminPinError');
  const bad = m => { err.textContent = '❌ ' + m; err.style.display = 'block'; };
  err.style.display = 'none';
  const id = localStorage.getItem(FP_KEY);
  if (!id || !window.PublicKeyCredential) return bad('यो फोनमा Fingerprint राखिएको छैन — PIN प्रयोग गर्नुस्');
  try {
    const c = await (await fetch('/api/admin/challenge', { method: 'POST' })).json();
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: new TextEncoder().encode(c.challenge), rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: _unb64u(id) }], userVerification: 'required', timeout: 60000
    } });
    const r = cred.response;
    const res = await fetch('/api/admin/fp-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      id: _b64u(cred.rawId), clientDataJSON: _b64u(r.clientDataJSON), authenticatorData: _b64u(r.authenticatorData), signature: _b64u(r.signature)
    }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.token) return await adminProxyIn(j);
    bad('Fingerprint मिलेन — PIN प्रयोग गर्नुस्');
  } catch (e) {
    bad(e && e.name === 'NotAllowedError' ? 'Fingerprint रद्द भयो वा मिलेन — फेरि प्रयास गर्नुस् वा PIN प्रयोग गर्नुस्' : 'Fingerprint चलेन — PIN प्रयोग गर्नुस्');
  }
}
window.adminFpLogin = adminFpLogin;

async function adminFpRegister() {
  const t = GH.sessionToken();
  if (!t) { toast('⚠️ पहिले PIN ले Admin खोल्नुस्'); return; }
  if (!window.PublicKeyCredential) { toast('⚠️ यो फोन/browser मा Fingerprint समर्थन छैन'); return; }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'शास्त्री पोर्टल', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'admin', displayName: 'Admin' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none', timeout: 60000
    } });
    const pk = cred.response.getPublicKey && cred.response.getPublicKey();
    if (!pk) { toast('⚠️ यो फोनले Fingerprint कुञ्जी दिन सकेन'); return; }
    const id = _b64u(cred.rawId);
    const res = await fetch('/api/admin/fp-register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }, body: JSON.stringify({ id, publicKey: _b64u(pk) }) });
    if (!res.ok) { toast('⚠️ Fingerprint राख्न सकिएन (' + res.status + ')'); return; }
    localStorage.setItem(FP_KEY, id);
    toast('✅ Fingerprint राखियो — अब यसले खोल्न मिल्छ');
    renderAdminUI();
  } catch (e) {
    toast(e && e.name === 'NotAllowedError' ? 'Fingerprint राख्न रद्द भयो' : '⚠️ Fingerprint राख्न सकिएन');
  }
}
async function adminFpRemove() {
  const id = localStorage.getItem(FP_KEY), t = GH.sessionToken();
  if (t) { try { await fetch('/api/admin/fp-remove', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }, body: JSON.stringify({ id }) }); } catch (e) {} }
  localStorage.removeItem(FP_KEY);
  toast('🗑️ Fingerprint हटाइयो');
  renderAdminUI();
}
function adminFpToggle() { return localStorage.getItem(FP_KEY) ? adminFpRemove() : adminFpRegister(); }
window.adminFpToggle = adminFpToggle;

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
  adminInlineClose();
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
  adminSuggestCount();                           // User Request को संख्या (badge)
  await adminRefreshFromGitHub();
}

/* पेज खुल्दा — पहिले नै token सुरक्षित छ भने चुपचाप जाँचेर Admin बनाउने */
async function adminAutoLogin() {
  if (GH.proxy()) {                                   // PIN/Fingerprint को सेसन (१२ घण्टा)
    const st = GH.sessionToken();
    if (!st) { GH.clearToken(); return; }              // सेसन सकियो — चुपचाप; Login थिचेर PIN/Fingerprint
    try {
      const r = await fetch('/api/admin/session', { headers: { 'Authorization': 'Bearer ' + st }, cache: 'no-store' });
      if (r.ok) { const j = await r.json(); await activateAdmin(j.owner); }
      else { GH.clearToken(); toast('⚠️ सेसन सकियो — PIN वा Fingerprint ले फेरि खोल्नुस्'); }
    } catch (e) {}
    return;
  }
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
  const fpRow = document.getElementById('adminFpRow');                        // Fingerprint राख्ने/हटाउने पंक्ति
  if (fpRow) {
    fpRow.style.display = (App.isAdmin && GH.proxy() && window.PublicKeyCredential) ? '' : 'none';
    const fpName = document.getElementById('adminFpName');
    if (fpName) fpName.textContent = localStorage.getItem(FP_KEY) ? 'Fingerprint हटाउनुस्' : 'Fingerprint राख्नुस्';
  }
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

function collectNoticeForm() {
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
  if (!data.title || !data.content) { toast('⚠️ शीर्षक र विवरण आवश्यक छ'); return null; }
  return { isFeed, data, idx: App._noticeEditIdx };
}

/* "👁 पूर्वावलोकन" बटन — सिधै सेभ गर्दैन, पहिले साइटमा जस्तो देखिन्छ त्यही देखाउँछ */
async function saveNoticeForm() {
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const c = collectNoticeForm();
  if (!c) return;
  const { isFeed, data, idx } = c;
  const shown = { ...data, image: App._noticeImg ? App._noticeImg.dataUrl : data.image };
  const render = n => isFeed ? feedCardHtml(n, 'P', true) : noticePreviewHtml(n);
  const list = isFeed ? (App.feedPosts || []) : (App.data.news || []);
  const old = (idx !== null && idx !== undefined) ? list[idx] : null;
  adminPreview({
    title: isFeed ? '👁 समाचार पोस्ट — पूर्वावलोकन' : '👁 सूचना — पूर्वावलोकन',
    after: render(shown),
    before: old ? render(old) : null,
    onConfirm: async () => { const ok = await commitNotice(c); if (ok) pvDone('noticeFormModal'); return ok; }
  });
}
window.saveNoticeForm = saveNoticeForm;

async function commitNotice({ isFeed, data, idx }) {
  toast('⏳ GitHub मा commit गर्दैछ…');
  const ok = await ghSave(async () => {
    const d = { ...data };
    d.content = await resolvePendingImages(d.content);
    if (App._noticeImg) d.image = await GH.uploadImage(App._noticeImg);
    const src = isFeed ? App.feedPosts : (App.data.news || []);
    const list = src.map(cleanPost);
    if (idx !== null && idx !== undefined && list[idx]) list[idx] = cleanPost(d); else list.unshift(cleanPost(d));
    await GH.writeJson(isFeed ? DATA_FEED : DATA_NEWS, list, (isFeed ? 'Update feed: ' : 'Update notice: ') + d.title);
    if (isFeed) App.feedPosts = list; else App.data.news = list;
  }, 'सुरक्षित गर्न सकिएन');
  if (!ok) return false;
  toast('✅ Commit भयो (१–२ मिनेटमा सबैले देख्छन्)');
  if (isFeed) renderNewsListPage(); else refreshNoticeViews();
  return true;
}

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
  const ok = await ghSave(() => GH.writeJson(DATA_BOOKS, { years: App.data.years }, msg), 'किताब सुरक्षित गर्न सकिएन');
  if (ok) { App._drafts.books = null; renderDirtyBar(); }
  return ok;
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

function adminBookMove(idx, dir) {
  if (!App.isAdmin) return;
  const arr = getCurrentSubjectArr();
  if (!arr) return;
  const n = idx + dir;
  if (n < 0 || n >= arr.length) return;
  if (!App._drafts.books) App._drafts.books = JSON.stringify(App.data.years);   // रद्द गर्न मिल्ने गरी पहिलेको अवस्था सुरक्षित
  [arr[idx], arr[n]] = [arr[n], arr[idx]];
  renderAdminBooksList();
  refreshBookViews();          // साइटमा तुरुन्तै देखिन्छ (अझै commit भएको छैन)
  renderDirtyBar();
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

function collectBookForm() {
  const descEl = document.getElementById('bookFormDesc');
  const v = {
    title:  document.getElementById('bookFormTitle').value.trim(),
    author: document.getElementById('bookFormAuthor').value.trim(),
    cover:  document.getElementById('bookFormCover').value.trim(),
    description: descEl.value.trim(),
    font:   descEl.dataset.fontKey || 'siddhanta',
    pdf:    document.getElementById('bookFormPdf').value.trim()
  };
  if (!v.title) { toast('⚠️ शीर्षक आवश्यक छ'); return null; }
  return v;
}

function bookPreviewHtml(b, yr, key) {
  const s = SUBJ[key] || { short: 'क', g: '#EEE,#CCC', label: key };
  const [c1, c2] = s.g.split(',');
  const row = bookCardHtml({ id: 'pv', title: b.title, author: b.author || '', cover: b.cover || '' }, yr.id, key);
  const hero = `<div class="subj-hero" style="background:linear-gradient(135deg,${c1},${c2})">
      ${b.cover ? `<img src="${escapeHtml(b.cover)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top;z-index:0" onerror="this.style.display='none'">` : ''}
      <span class="subj-hero-emoji" style="${b.cover ? 'display:none' : 'display:flex'}">${escapeHtml(s.short)}</span>
      <div class="subj-hero-overlay" style="z-index:2">
        ${b.cover ? '<div></div>' : `<div><div class="sh-title">${escapeHtml(b.title)}</div><div class="sh-meta">${escapeHtml(s.label)} · ${escapeHtml(yr.title)}</div></div>`}
      </div></div>`;
  const ff = (b.font && typeof fontCssFor === 'function') ? `font-family:${fontCssFor(b.font)}` : '';
  const info = `<div class="info-card"><h3>📖 किताबको बारेमा</h3><div style="${ff}">${renderMd(b.description || 'विवरण यहाँ राख्नुस्।')}</div></div>
      <div class="info-card"><h3>👨‍🏫 लेखक</h3><p>${escapeHtml(b.author || '')}</p></div>`;
  return pvLbl('सूचीमा देखिँदा') + `<div class="books-list">${row}</div>` + pvLbl('किताब खोल्दा') + hero + info;
}

async function adminBookSave() {          // "👁 पूर्वावलोकन" बटन
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const v = collectBookForm();
  if (!v) return;
  const arr = getCurrentSubjectArr();
  const yr = (App.data.years || []).find(y => y.id === App.adminBook.yearId);
  if (!arr || !yr) return;
  const key = App.adminBook.subjectId;
  const eIdx = App.adminBook.editingIdx;
  const old = (eIdx !== null && arr[eIdx]) ? arr[eIdx] : null;
  const shown = { ...v, cover: App._bookCoverImg ? App._bookCoverImg.dataUrl : v.cover };
  adminPreview({
    title: '👁 किताब — पूर्वावलोकन',
    after: bookPreviewHtml(shown, yr, key),
    before: old ? bookPreviewHtml(old, yr, key) : null,
    onConfirm: async () => { const ok = await commitBook(v); if (ok) pvDone('bookFormModal'); return ok; }
  });
}
window.adminBookSave = adminBookSave;

async function commitBook(v) {
  const arr = getCurrentSubjectArr();
  if (!arr) return false;
  const snap = JSON.stringify(App.data.years);
  toast('⏳ GitHub मा commit गर्दैछ…');
  const ok = await ghSave(async () => {
    let cover = v.cover;
    v = { ...v, description: await resolvePendingImages(v.description) };
    if (App._bookCoverImg) cover = await GH.uploadImage(App._bookCoverImg, 'images/covers');
    const bookData = { title: v.title, author: v.author, cover, description: v.description, font: v.font, pdf: v.pdf };
    const eIdx = App.adminBook.editingIdx;
    if (eIdx !== null && arr[eIdx]) arr[eIdx] = { id: arr[eIdx].id, ...bookData };
    else arr.push({ id: `${App.adminBook.subjectId.slice(0, 3)}${App.adminBook.yearId}_${Date.now()}`, ...bookData });
    await GH.writeJson(DATA_BOOKS, { years: App.data.years }, 'Update book: ' + v.title);
  }, 'किताब सुरक्षित गर्न सकिएन');
  if (!ok) { App.data.years = JSON.parse(snap); return false; }
  App._drafts.books = null; renderDirtyBar();
  toast('✅ किताब commit भयो');
  renderAdminBooksList();
  refreshBookViews();
  return true;
}

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
  const payload = list.map(c => ({ title: c.title || '', content: c.content || '', font: c.font || 'eczar' }));
  const ok = await ghSave(() => GH.writeJson(chapterPath(bookId), payload, msg || 'Update chapters: ' + bookId), 'अध्याय सुरक्षित गर्न सकिएन');
  if (ok) { delete App._drafts.chapters[bookId]; renderDirtyBar(); }
  return ok;
}

/* GitHub बाट ताजा अध्याय ल्याएर cache मा राख्ने (नभए पुरानो .js फाइलबाट) */
async function adminSyncChapters(bookId) {
  // अनसेभ क्रम-परिवर्तन (draft) भए GitHub बाट पुरानो ल्याएर नमेट्ने
  if (App._drafts.chapters[bookId] && App.chaptersCache[bookId]) return App.chaptersCache[bookId];
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

/* ── अध्यायमा PDF (Admin) ── */
const _PDF_TOKEN_RE = /\[\[pdf:([A-Za-z0-9_\-./]+?\.pdf)\]\]/g;
App._pdfNames = App._pdfNames || {};
function adminChapterPdfRefresh() {
  const ta = document.getElementById('chapterFormContent'), box = document.getElementById('chapterPdfList');
  if (!ta || !box) return;
  const found = [...String(ta.value || '').matchAll(_PDF_TOKEN_RE)].map(m => m[1]);
  box.innerHTML = found.map((path, k) => `<div class="pdf-adm-row"><span class="pdf-adm-name"></span>
      <button type="button" class="pdf-adm-del" onclick="adminChapterPdfRemove(${k})">हटाउनुहोस्</button></div>`).join('');
  box.querySelectorAll('.pdf-adm-name').forEach((el, k) => { el.textContent = '📄 ' + (App._pdfNames[found[k]] || found[k].split('/').pop()); });
}
window.adminChapterPdfRefresh = adminChapterPdfRefresh;
function adminChapterPdfRemove(k) {
  const ta = document.getElementById('chapterFormContent'); if (!ta) return;
  let n = -1;
  ta.value = String(ta.value || '').replace(_PDF_TOKEN_RE, m => (++n === k ? '' : m));
  adminChapterPdfRefresh();
  toast('PDF अध्यायबाट हटाइयो (Commit गरेपछि लागू हुन्छ)');
}
window.adminChapterPdfRemove = adminChapterPdfRemove;
function adminChapterPdfPick() {
  if (!App.isAdmin) return;
  if (!window.GH || !GH.token()) { toast('⚠️ PDF अपलोड गर्न GitHub token चाहिन्छ (Admin मा लगइन गर्नुहोस्)'); return; }
  let inp = document.getElementById('chapterPdfFile');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/pdf,.pdf'; inp.id = 'chapterPdfFile'; inp.style.display = 'none';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) adminChapterPdfUpload(f); };
    document.body.appendChild(inp);
  }
  inp.value = ''; inp.click();
}
window.adminChapterPdfPick = adminChapterPdfPick;
async function adminChapterPdfUpload(file) {
  const MAX = 20 * 1024 * 1024;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { toast('⚠️ PDF फाइल मात्र छान्नुहोस्'); return; }
  if (file.size > MAX) { toast('⚠️ PDF धेरै ठूलो छ (२० MB भन्दा सानो चाहिन्छ)'); return; }
  const btn = document.getElementById('chapterPdfBtn'), old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ अपलोड हुँदैछ…'; }
  try {
    const buf = await file.arrayBuffer();
    const path = 'data/pdf/pdf_' + Date.now().toString(36) + '.pdf';
    await GH.enqueue(async () => {
      const res = await GH.putRaw(path, _cfB64(buf), 'Add PDF ' + file.name);
      if (!res.ok) throw new Error(await GH.errMsg(res));
    });
    App._pdfNames[path] = file.name;
    const ta = document.getElementById('chapterFormContent');
    ta.value = String(ta.value || '').replace(/\s+$/, '') + '\n\n[[pdf:' + path + ']]\n';
    adminChapterPdfRefresh();
    toast('✅ PDF अपलोड भयो — अध्याय Commit गरेपछि देखिन्छ');
  } catch (e) { toast('⚠️ PDF अपलोड भएन: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
}

function adminChapterAddNew() {
  if (!App.isAdmin) return;
  _chapterFormToolbar();
  App.adminChapter.editingIdx = null;
  document.getElementById('chapterFormTitle').value   = '';
  document.getElementById('chapterFormContent').value = '';
  document.getElementById('chapterFormContent').dataset.fontKey = 'eczar';
  document.getElementById('chapterFormHeading').textContent = '➕ नयाँ अध्याय';
  adminChapterPdfRefresh();
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
  document.getElementById('chapterFormContent').dataset.fontKey = c.font || 'eczar';
  document.getElementById('chapterFormHeading').textContent = '✏️ अध्याय सम्पादन';
  adminChapterPdfRefresh();
  openOv('chapterFormModal');
}
window.adminChapterEdit = adminChapterEdit;

function chapterPreviewHtml(c, num) {
  const ff = (c.font && typeof fontCssFor === 'function') ? `font-family:${fontCssFor(c.font)}` : '';
  return `<div class="ch-list"><div class="chapter-item open">
    <div class="ch-head"><div class="ch-num">${toN(num)}</div><div class="ch-title-txt">${escapeHtml(c.title || ('अध्याय ' + num))}</div></div>
    <div class="ch-read-body"><div class="ch-read-content" style="${ff}">${renderMd(c.content || '')}</div></div>
  </div></div>`;
}

async function adminChapterSave() {       // "👁 पूर्वावलोकन" बटन
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const bookId = App.adminChapter.bookId;
  const title = document.getElementById('chapterFormTitle').value.trim();
  const contentEl = document.getElementById('chapterFormContent');
  if (!title) { toast('⚠️ शीर्षक आवश्यक छ'); return; }
  const item = { title, content: contentEl.value, font: contentEl.dataset.fontKey || 'eczar' };
  const cur = App.chaptersCache[bookId] || [];
  const i = App.adminChapter.editingIdx;
  const isEdit = (i !== null && i !== undefined && cur[i]);
  // पूर्वावलोकन हटाइएको — सिधै GitHub मा commit
  if (App._chCommitBusy) return;
  App._chCommitBusy = true;
  const btn = document.getElementById('chapterCommitBtn');
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Commit हुँदैछ…'; }
  try {
    const ok = await commitChapter(bookId, item, isEdit ? i : null);
    if (ok) closeOv('chapterFormModal');
  } finally {
    App._chCommitBusy = false;
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}
window.adminChapterSave = adminChapterSave;

async function commitChapter(bookId, item, i) {
  toast('⏳ फोटो/अध्याय GitHub मा हाल्दैछ…');
  try { item = { ...item, content: await resolvePendingImages(item.content) }; }
  catch (err) { toast('❌ ' + err.message); return false; }
  const list = (App.chaptersCache[bookId] || []).map(c => ({ ...c }));
  if (i !== null && list[i]) list[i] = item; else list.push(item);
  toast('⏳ GitHub मा commit गर्दैछ…');
  if (!(await saveChapters(bookId, list, 'Update chapter: ' + item.title))) return false;
  App.chaptersCache[bookId] = list;
  toast('✅ अध्याय commit भयो');
  renderAdminChaptersList();
  refreshInlineChapterView(bookId);
  return true;
}

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

function adminChapterMove(idx, dir) {
  if (!App.isAdmin) return;
  const bookId = App.adminChapter.bookId;
  const list = App.chaptersCache[bookId] || [];
  const n = idx + dir;
  if (n < 0 || n >= list.length) return;
  if (!App._drafts.chapters[bookId]) App._drafts.chapters[bookId] = JSON.stringify(list);
  [list[idx], list[n]] = [list[n], list[idx]];
  renderAdminChaptersList();
  refreshInlineChapterView(bookId);   // साइटमा तुरुन्तै देखिन्छ (अझै commit भएको छैन)
  renderDirtyBar();
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
        <div class="sett-ico subj-mgr-ico">${escapeHtml(s.short || '?')}</div>
        <div><div class="sett-name">${escapeHtml(s.label || k)}</div><div class="sett-desc">key: ${escapeHtml(k)}</div></div>
      </div>
      <div style="display:flex;gap:10px;flex-shrink:0">
        <button type="button" class="neu-btn" style="width:40px;height:40px" title="सम्पादन" onclick="adminSubjectEdit('${k}')">✏️</button>
        <button type="button" class="neu-btn" style="width:40px;height:40px" title="मेटाउनुहोस्" onclick="adminSubjectDelete('${k}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

async function adminSubjectDelete(key) {
  if (!App.isAdmin || !SUBJ[key]) return;
  const nBooks = (App.data.years || []).reduce((n, y) => n + (((y.subjects || {})[key] || []).length), 0);
  if (nBooks > 0) { toast('⚠️ "' + (SUBJ[key].label || key) + '" मा ' + nBooks + ' किताब छन् — पहिले ती किताब मेटाउनुहोस्'); return; }
  if (!(await showConfirm('"' + (SUBJ[key].label || key) + '" विषय मेटाउने? (फिर्ता गर्न मिल्दैन)'))) return;
  const snapYears = JSON.stringify(App.data.years), snapSubj = JSON.stringify(SUBJ);
  toast('⏳ GitHub मा commit हुँदैछ…');
  delete SUBJ[key];
  (App.data.years || []).forEach(y => { if (y.subjects) delete y.subjects[key]; });
  const ok = (await saveBooksToGitHub('Delete subject: ' + key)) && (await saveSubjectsToGitHub());
  if (!ok) {
    App.data.years = JSON.parse(snapYears);
    Object.keys(SUBJ).forEach(k => delete SUBJ[k]); Object.assign(SUBJ, JSON.parse(snapSubj));
    return;
  }
  if (App.adminBook && App.adminBook.subjectId === key) App.adminBook.subjectId = Object.keys(SUBJ)[0] || null;
  toast('✅ विषय मेटियो');
  renderAdminSubjectsList();
  renderAdminBooksSubjectTabs();
  refreshBookViews();
}
window.adminSubjectDelete = adminSubjectDelete;

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

function subjectPreviewHtml(key, label, short, g) {
  const [c1, c2] = (g || '#EEE,#CCC').split(',');
  return pvLbl('विषयको सूची') + `<div class="sett-row"><div class="sett-left">
      <div class="sett-ico" style="background:linear-gradient(135deg,${c1},${c2})">${escapeHtml(short || '?')}</div>
      <div><div class="sett-name">${escapeHtml(label || key)}</div><div class="sett-desc">key: ${escapeHtml(key)}</div></div></div></div>`
    + pvLbl('किताब ट्याबमा') + `<div style="display:flex;gap:8px"><span class="tab-btn on" style="flex:none;padding:8px 14px;white-space:nowrap">${escapeHtml(short || '?')} ${escapeHtml(label || key)}</span></div>`;
}

async function adminSubjectSave() {       // "👁 पूर्वावलोकन" बटन
  if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
  const isNew = !App.adminSubject.editingKey;
  const rawKey = document.getElementById('subjectFormKey').value.trim().toLowerCase();
  const key    = isNew ? rawKey.replace(/[^a-z0-9_]/g, '') : App.adminSubject.editingKey;
  const label  = document.getElementById('subjectFormLabel').value.trim();
  const short  = document.getElementById('subjectFormShort').value.trim();
  if (!key || !label) { toast('⚠️ Key र नाम दुवै आवश्यक छ'); return; }
  if (isNew && SUBJ[key]) { toast('⚠️ यो key पहिल्यै अस्तित्वमा छ'); return; }
  const g = isNew ? SUBJECT_PALETTE[Object.keys(SUBJ).length % SUBJECT_PALETTE.length] : SUBJ[key].g;
  const shortFinal = short || (isNew ? label.slice(0, 2) : SUBJ[key].short);
  const old = isNew ? null : SUBJ[key];
  adminPreview({
    title: '👁 विषय — पूर्वावलोकन',
    after: subjectPreviewHtml(key, label, shortFinal, g),
    before: old ? subjectPreviewHtml(key, old.label, old.short, old.g) : null,
    onConfirm: async () => { const ok = await commitSubject({ isNew, key, label, short: shortFinal, g }); if (ok) pvDone('subjectFormModal'); return ok; }
  });
}
window.adminSubjectSave = adminSubjectSave;

async function commitSubject({ isNew, key, label, short, g }) {
  const snapYears = JSON.stringify(App.data.years), snapSubj = JSON.stringify(SUBJ);
  toast('⏳ GitHub मा commit गर्दैछ…');
  let ok;
  if (isNew) {
    SUBJ[key] = { label, short, g };
    (App.data.years || []).forEach(y => {
      if (!y.subjects) y.subjects = {};
      if (!Array.isArray(y.subjects[key])) y.subjects[key] = [];
    });
    ok = (await saveBooksToGitHub('Add subject: ' + key)) && (await saveSubjectsToGitHub());
  } else {
    SUBJ[key].label = label;
    SUBJ[key].short = short;
    ok = await saveSubjectsToGitHub();
  }
  if (!ok) {
    App.data.years = JSON.parse(snapYears);
    Object.keys(SUBJ).forEach(k => delete SUBJ[k]); Object.assign(SUBJ, JSON.parse(snapSubj));
    return false;
  }
  toast(isNew ? '✅ नयाँ विषय commit भयो' : '✅ विषय commit भयो');
  renderAdminSubjectsList();
  renderAdminBooksSubjectTabs();
  refreshBookViews();
  return true;
}

/* ════════════════════════════════════
   पूर्वावलोकन (Preview) — सेभ गर्नु अघि साइटमा जस्तो देखिन्छ त्यही हेर्ने;
   चित्त बुझेमा मात्र "Commit" थिच्ने। सम्पादन गरेको भए "पहिले / अहिले" दुवै हेर्न मिल्छ।
   ════════════════════════════════════ */
App._pv = null;
App._drafts = { books: null, chapters: {} };   // अनसेभ क्रम-परिवर्तन (पहिलेको अवस्थाको snapshot)

const pvLbl = t => `<div style="font-size:.72rem;font-weight:700;color:var(--text-3);margin:12px 2px 6px">${t}</div>`;

function noticePreviewHtml(n) {
  // साइटको असली chalkboard लाई clone गरेर त्यसमा नयाँ पाठ भर्ने → ठ्याक्कै उस्तै देखिन्छ
  let board = '';
  const src = document.getElementById('newsBoard');
  if (src) {
    const c = src.cloneNode(true);
    c.removeAttribute('id'); c.removeAttribute('onclick');
    const q = id => c.querySelector('#' + id);
    const t = q('newsBoardTitle'), d = q('newsBoardDesc'), dt = q('newsBoardDate'), dots = q('newsBoardDots');
    if (t) { t.textContent = n.title; t.style.opacity = '1'; t.removeAttribute('id'); }
    if (d) {
      d.innerHTML = renderMd(n.content || '');
      d.style.fontFamily = (n.font && typeof fontCssFor === 'function') ? fontCssFor(n.font) : '';
      d.style.opacity = '1'; d.removeAttribute('id');
    }
    if (dt) { dt.textContent = n.date ? `मिति :- ${n.date}` : ''; dt.style.opacity = '1'; dt.removeAttribute('id'); }
    if (dots) { dots.innerHTML = ''; dots.removeAttribute('id'); }
    board = c.outerHTML;
  }
  const ff = (n.font && typeof fontCssFor === 'function') ? `font-family:${fontCssFor(n.font)}` : '';
  const full = `<div class="info-card">
      ${n.image ? `<img src="${escapeHtml(n.image)}" alt="" style="width:100%;border-radius:12px;margin-bottom:10px;display:block">` : ''}
      <h3>${escapeHtml(n.title)}</h3>
      <div style="font-size:.72rem;color:var(--text-3);margin:2px 0 8px">${escapeHtml(n.date || '')}${n.category ? ' · ' + escapeHtml(n.category) : ''}</div>
      <div style="${ff}">${renderMd(n.content || '')}</div></div>`;
  return pvLbl('होम पेजको चकबोर्डमा') + board + pvLbl('थिच्दा खुल्ने पूरा सूचना') + full;
}

function adminPreview({ title, after, before, okLabel, onConfirm }) {
  App._pv = { after, before: before || null, mode: 'after', onConfirm, busy: false };
  document.getElementById('adminPreviewTitle').textContent = title || '👁 पूर्वावलोकन';
  document.getElementById('adminPreviewOk').textContent = okLabel || '✅ ठीक छ, Commit गर्नुस्';
  document.getElementById('adminPreviewTabs').style.display = before ? 'flex' : 'none';
  pvRender();
  document.getElementById('adminPreviewBody').scrollTop = 0;
  openOv('adminPreviewModal');
}
function pvRender() {
  const v = App._pv;
  if (!v) return;
  // pointer-events:none — पूर्वावलोकनका लिंक/बटन दबिँदा साइट नबदलियोस्; स्क्रोल भने चल्छ
  document.getElementById('adminPreviewBody').innerHTML = `<div style="pointer-events:none">${pvSubstitute(v.mode === 'before' ? v.before : v.after)}</div>`;
  document.getElementById('pvTabAfter').classList.toggle('on', v.mode === 'after');
  document.getElementById('pvTabBefore').classList.toggle('on', v.mode === 'before');
}
function pvMode(m) { if (App._pv) { App._pv.mode = m; pvRender(); } }
window.pvMode = pvMode;

async function pvConfirm() {
  const v = App._pv;
  if (!v || v.busy) return;
  v.busy = true;
  const btn = document.getElementById('adminPreviewOk');
  btn.disabled = true;
  try { await v.onConfirm(); } catch (e) { toast('❌ ' + e.message); }
  btn.disabled = false; v.busy = false;
}
window.pvConfirm = pvConfirm;

function pvDone(formId) {
  closeOv('adminPreviewModal');
  if (formId) setTimeout(() => closeOv(formId), 160);   // history.back() पूरा भएपछि मात्र फारम बन्द गर्ने
}

/* क्रम मिलाएको तर commit नगरेको अवस्थामा माथि देखिने bar */
function renderDirtyBar() {
  let bar = document.getElementById('adminDirtyBar');
  const n = (App._drafts.books ? 1 : 0) + Object.keys(App._drafts.chapters).length;
  if (!n) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'adminDirtyBar';
    bar.style.cssText = 'position:fixed;left:10px;right:10px;top:calc(8px + env(safe-area-inset-top,0px));z-index:400;background:#2b2b2b;color:#fff;border-radius:14px;padding:9px 10px 9px 14px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 28px rgba(0,0,0,.35);font-size:.8rem';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span style="flex:1;line-height:1.35">● अनसेभ क्रम-परिवर्तन<br><span style="opacity:.7;font-size:.7rem">साइटमा हेर्न मिल्छ, अझै commit भएको छैन</span></span>
    <button onclick="adminDraftsDiscard()" style="background:#555;color:#fff;border:0;border-radius:10px;padding:8px 11px;font-weight:700">↩ रद्द</button>
    <button onclick="adminDraftsCommit()" style="background:#d94f1e;color:#fff;border:0;border-radius:10px;padding:8px 11px;font-weight:700">✅ Commit</button>`;
}
async function adminDraftsCommit() {
  const d = App._drafts;
  toast('⏳ GitHub मा commit गर्दैछ…');
  if (d.books && !(await saveBooksToGitHub('Reorder books'))) return;
  for (const id of Object.keys(d.chapters)) {
    if (!(await saveChapters(id, App.chaptersCache[id] || [], 'Reorder chapters'))) return;
  }
  renderDirtyBar();
  toast('✅ क्रम commit भयो');
}
window.adminDraftsCommit = adminDraftsCommit;

function adminDraftsDiscard() {
  const d = App._drafts;
  if (d.books) { App.data.years = JSON.parse(d.books); d.books = null; }
  Object.keys(d.chapters).forEach(id => { App.chaptersCache[id] = JSON.parse(d.chapters[id]); delete d.chapters[id]; });
  renderDirtyBar();
  if (document.getElementById('adminBooksList')) renderAdminBooksList();
  if (document.getElementById('adminChaptersList') && App.adminChapter.bookId) renderAdminChaptersList();
  refreshBookViews();
  if (App.currentChapterBookId) refreshInlineChapterView(App.currentChapterBookId);
  toast('↩ क्रम-परिवर्तन रद्द भयो');
}
window.adminDraftsDiscard = adminDraftsDiscard;

/* ── सुरु ── */
window.addEventListener('load', () => { adminAutoLogin(); });


/* ════════════════════════════════════════════════
   📨 User Request — पाठकले पठाएको सुधार सुझाव (GitHub Issues, label: suggestion)
   स्वीकार → अध्यायमा पुरानो पाठ हटेर नयाँ पाठ commit हुन्छ; अस्वीकार → Issue बन्द
   ════════════════════════════════════════════════ */
const SG_LABEL = 'suggestion';
App._sgList = []; App._sgPending = {};

function _sgParse(issue) {
  const m = /<!--SP-REQ\s+([A-Za-z0-9+\/=]+)\s*-->/.exec((issue && issue.body) || '');
  if (!m) return null;
  try { return JSON.parse(GH.fromB64(m[1])); } catch (e) { return null; }
}
async function _sgFetch() {
  const res = await GH.req(`issues?labels=${SG_LABEL}&state=open&per_page=50&sort=created&direction=desc`);
  if (!res.ok) throw new Error(await GH.errMsg(res));
  const done = _sgDoneSet();
  return (await res.json()).filter(i => !i.pull_request && !done.has(i.number));     // यो फोनमा पहिल्यै निपटाइएका फेरि नदेखाउने
}
/* निपटाइएका (स्वीकार/अस्वीकार) सुझावको नम्बर — GitHub मा बन्द हुन नसके पनि सूचीमा फेरि नदेखिन */
function _sgDoneSet() { try { return new Set(JSON.parse(localStorage.getItem('sp_sg_done') || '[]')); } catch (e) { return new Set(); } }
function _sgMarkDone(n) { try { const s = _sgDoneSet(); s.add(n); localStorage.setItem('sp_sg_done', JSON.stringify([...s].slice(-300))); } catch (e) {} }
function _sgBadge() {
  const b = document.getElementById('sgBadge'); if (!b) return;
  const n = App._sgList.length; b.textContent = n; b.hidden = !n;
}
async function adminSuggestCount() {
  if (!App.isAdmin) return;
  try { App._sgList = await _sgFetch(); _sgBadge(); } catch (e) { /* चुपचाप */ }
}
window.adminSuggestCount = adminSuggestCount;

/* सुझाव-सेवा (Cloudflare Function) को अवस्था: के चालु छ, token छ कि छैन */
async function adminSuggestStatus() {
  const el = document.getElementById('sgStatus'); if (!el) return;
  el.className = 'sg-status'; el.textContent = '⏳ सेवा जाँच्दैछु…';
  try {
    const res = await fetch('/api/suggest', { cache: 'no-store' });
    let j = null; try { j = await res.json(); } catch (e) {}
    if (!j || !j.service) { el.classList.add('bad'); el.innerHTML = '❌ सुझाव सेवा (functions/api/suggest.js) साइटमा चलिरहेको छैन। Cloudflare Pages मा Git बाट deploy भएको र <b>functions</b> फोल्डर पुगेको जाँच्नुहोस्।'; return; }
    if (!j.configured) { el.classList.add('bad'); el.innerHTML = '⚠️ सेवा चलेको छ तर <b>GH_TOKEN</b> राखिएको छैन (वा राखेपछि फेरि Deploy गरिएको छैन)। Cloudflare → Settings → Variables and Secrets मा राखेर Retry deployment गर्नुहोस्।'; return; }
    if (j.github === 200 && j.issues) {
      let cl = '';
      try { const r2 = await fetch('/api/suggest-close', { cache: 'no-store' }); const j2 = await r2.json(); cl = j2 && j2.error === 'method_not_allowed' ? '' : ' · ⚠️ बन्द गर्ने सेवा (suggest-close) तैनाथ भएको छैन'; } catch (e) { cl = ' · ⚠️ बन्द गर्ने सेवा (suggest-close) तैनाथ भएको छैन'; }
      el.classList.add(cl ? 'bad' : 'ok'); el.textContent = '✅ सेवा ठीक छ' + cl; return;
    }
    el.classList.add('bad');
    el.innerHTML = j.github === 200 ? '⚠️ repo मा Issues बन्द छ — GitHub → repo Settings → Features → Issues खोल्नुहोस्।'
      : '⚠️ GH_TOKEN ले GitHub मा काम गरेन (कोड ' + j.github + '): ' + (j.github === 401 ? 'token गलत वा म्याद सकिएको।' : 'token ले यो repo (' + escapeHtml(j.repo) + ') पाएन — Repository access र Issues अनुमति जाँच्नुहोस्।');
  } catch (e) { el.classList.add('bad'); el.textContent = '⚠️ सेवा जाँच्न सकिएन: ' + e.message; }
}
/* परीक्षण: एउटा नक्कली सुझाव पठाएर नतिजा (त्रुटि सहित) सिधै देखाउने */
async function adminSuggestTest() {
  const el = document.getElementById('sgStatus'); if (el) { el.className = 'sg-status'; el.textContent = '⏳ परीक्षण सुझाव पठाउँदैछु…'; }
  try {
    const res = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: 1, bookId: 'test', idx: 0, chTitle: 'परीक्षण', bookTitle: 'परीक्षण', old: 'पुरानो', new: 'नयाँ', before: '', after: '', s: 0, total: 0 }) });
    let j = null; try { j = await res.json(); } catch (e) {}
    if (res.ok && j && j.ok) { toast('✅ परीक्षण सुझाव पुग्यो (#' + j.id + ')'); await adminSuggestOpen(); return; }
    if (el) { el.className = 'sg-status bad'; el.textContent = '❌ परीक्षण असफल: HTTP ' + res.status + ' · ' + ((j && j.error) || 'जवाफ आएन'); }
  } catch (e) { if (el) { el.className = 'sg-status bad'; el.textContent = '❌ परीक्षण असफल: ' + e.message; } }
}
window.adminSuggestTest = adminSuggestTest;

async function adminSuggestOpen() {
  if (!App.isAdmin) return;
  openOv('adminSuggestModal');
  adminSuggestStatus();
  const box = document.getElementById('adminSuggestList');
  box.innerHTML = '<div class="sg-empty">⏳ लोड हुँदैछ…</div>';
  try { App._sgList = await _sgFetch(); _sgBadge(); renderAdminSuggest(); }
  catch (e) { box.innerHTML = '<div class="sg-empty">⚠️ ' + escapeHtml(e.message) + '</div>'; }
}
window.adminSuggestOpen = adminSuggestOpen;

function _sgStyled(d) {                                   // नयाँ पाठ बोल्ड/रङ्गीन भए त्यसै देखाउने
  const st = (d.color ? 'color:' + d.color + ';' : '') + (d.bold || d.color ? 'font-weight:' + (d.bold ? 800 : 600) : '');
  return `<ins style="${escapeHtml(st)}">${escapeHtml(d.new)}</ins>`;
}
function renderAdminSuggest() {
  const box = document.getElementById('adminSuggestList');
  const bar = document.getElementById('sgBar');
  if (!App._sgList.length) { if (bar) bar.hidden = true; box.innerHTML = '<div class="sg-empty">📭 कुनै नयाँ सुझाव छैन</div>'; return; }
  if (bar) bar.hidden = false;
  box.innerHTML = App._sgList.map(is => {
    const d = _sgParse(is), n = is.number;
    if (!d) return `<div class="sg-row"><div class="sg-rb"><div class="sg-rt">#${n} · ढाँचा मिलेन</div><div class="sg-rd"><a href="${escapeHtml(is.html_url)}" target="_blank" rel="noopener">GitHub मा हेर्नुहोस्</a></div></div><div class="sg-ra"><button class="sg-ib" onclick="adminSuggestReject(${n})" aria-label="अस्वीकार">❌</button></div></div>`;
    return `<div class="sg-row" id="sgc-${n}">
      <input type="checkbox" class="sg-ck" value="${n}" onchange="adminSuggestSel()" aria-label="छान्नुहोस्">
      <div class="sg-rb" onclick="this.previousElementSibling.click()">
        <div class="sg-rt">${escapeHtml(d.bookTitle || d.bookId)} › ${escapeHtml(d.chTitle || '')}</div>
        <div class="sg-rd"><del>${escapeHtml(d.old)}</del> → ${_sgStyled(d)}</div>
        ${App._sgStale[n] ? `<div class="sg-stale">⚠️ ${escapeHtml(App._sgStale[n])} — पहिल्यै लागू भएको वा अध्याय बदलिएको हुन सक्छ। ❌ थिचेर हटाउनुहोस्।</div>` : ''}
      </div>
      <div class="sg-ra"><button class="sg-ib ok" onclick="adminSuggestApprove(${n})" aria-label="स्वीकार">✅</button><button class="sg-ib" onclick="adminSuggestReject(${n})" aria-label="अस्वीकार">❌</button></div>
    </div>`;
  }).join('');
  adminSuggestSel();
}
function adminSuggestSel() {
  const cks = [...document.querySelectorAll('#adminSuggestList .sg-ck')], on = cks.filter(c => c.checked).length;
  const all = document.getElementById('sgAll'); if (all) { all.checked = cks.length > 0 && on === cks.length; all.indeterminate = on > 0 && on < cks.length; }
  const ok = document.getElementById('sgBulkOk'), no = document.getElementById('sgBulkNo');
  if (ok) { ok.disabled = !on; ok.textContent = on ? '✅ स्वीकार (' + on + ')' : '✅ स्वीकार'; }
  if (no) no.disabled = !on;
}
function adminSuggestSelAll(v) { document.querySelectorAll('#adminSuggestList .sg-ck').forEach(c => { c.checked = v; }); adminSuggestSel(); }
window.adminSuggestSel = adminSuggestSel; window.adminSuggestSelAll = adminSuggestSelAll;
function _sgSelected() { return [...document.querySelectorAll('#adminSuggestList .sg-ck:checked')].map(c => parseInt(c.value, 10)); }

function _sgFindChapter(list, d) {
  if (!Array.isArray(list)) return -1;
  if (list[d.idx] && list[d.idx].title === d.chTitle) return d.idx;              // अनुक्रम र शीर्षक दुवै मिल्यो
  const byTitle = list.findIndex(c => c.title === d.chTitle);                    // अनुक्रम सारिएको हुन सक्छ
  if (byTitle >= 0) return byTitle;
  return list[d.idx] ? d.idx : -1;
}
/* पुरानो पाठ markdown मा खोज्ने: पहिले ठ्याक्कै, नभए खाली-ठाउँ/markup (** == आदि) सहने तरिका */
function _sgLocate(content, d) {
  const old = String(d.old || ''); if (!old) return null;
  let cand = [], loose = false, i = -1;
  while ((i = content.indexOf(old, i + 1)) >= 0 && cand.length < 50) cand.push({ start: i, end: i + old.length });
  if (!cand.length) {
    const toks = old.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!toks.length || toks.length > 400) return null;
    const re = new RegExp(toks.join('(?:[\\s*_=~`>|#-]|<[^>]{0,60}>|\\{\\{[^:{}\\n]{0,24}:|\\}\\})*'), 'g');
    let m; loose = true;
    while ((m = re.exec(content)) && cand.length < 50) { if (!m[0].length) { re.lastIndex++; continue; } cand.push({ start: m.index, end: m.index + m[0].length }); }
  }
  if (!cand.length) return null;
  let best = cand[0], confident = true;
  if (cand.length > 1) {                                                          // सन्दर्भ (अघिल्लो/पछिल्लो शब्द) र अनुमानित स्थानले छान्ने
    const bf = (d.before || '').trim().slice(-8), af = (d.after || '').trim().slice(0, 8);
    const hint = d.total ? (d.s / d.total) * content.length : 0;
    const sc = cand.map(c => ({ c, sc: (bf && content.slice(Math.max(0, c.start - 40), c.start).includes(bf) ? 2 : 0) + (af && content.slice(c.end, c.end + 40).includes(af) ? 2 : 0), dist: Math.abs(c.start - hint) }))
                   .sort((a, b) => b.sc - a.sc || a.dist - b.dist);
    best = sc[0].c;
    confident = sc[0].sc > sc[1].sc || (!!d.total && sc[0].sc === sc[1].sc && sc[0].dist * 2 < sc[1].dist);   // स्पष्ट रूपमा एउटा मात्र नजिक भए "विश्वस्त"
  }
  if (loose && !_sgBalanced(content.slice(best.start, best.end))) return null;     // markdown चिन्ह (** == {{ }}) आधा काटिने भए स्वतः नबदल्ने
  return { start: best.start, end: best.end, count: cand.length, loose, confident };
}
function _sgBalanced(t) {
  const c = (re) => (t.match(re) || []).length;
  return c(/\*\*/g) % 2 === 0 && c(/==/g) % 2 === 0 && c(/~~/g) % 2 === 0 && c(/__/g) % 2 === 0 && c(/`/g) % 2 === 0 && c(/\{\{/g) === c(/\}\}/g);
}

/* Issue बन्द: पहिले सिधै GitHub बाट; token मा "Issues: write" छैन (403) भने /api/suggest-close (सर्भर फङ्सन) बाट। जे भए पनि यो फोनको सूचीबाट हटाइन्छ */
async function _sgClose(n, reason, comment) {
  let ok = false, why = [];
  try {
    const c = comment ? await GH.req(`issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) }) : { ok: true, status: 200 };
    if (!c.ok) why.push('टिप्पणी ' + c.status);
    const r = c.ok ? await GH.req(`issues/${n}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: reason }) }) : { ok: false, status: c.status };
    ok = r.ok; if (!r.ok && c.ok) why.push('बन्द ' + r.status);
  } catch (e) { why.push('नेट'); }
  if (!ok) {
    try {
      const r = await fetch('/api/suggest-close', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GH.token() }, body: JSON.stringify({ number: n, reason, comment }) });
      ok = r.ok; if (!r.ok) { let e = ''; try { e = (await r.json()).error || ''; } catch (x) {} why.push('सेवा ' + r.status + (e ? ' ' + e : '')); }
    } catch (e) { why.push('सेवा नेट'); }
  }
  _sgMarkDone(n);
  App._sgWhy = ok ? '' : why.join(' · ');
  return ok;
}
/* पाठकको सुझावलाई markdown बनाउने: बोल्ड → **पाठ**, रङ → {{#रङ:पाठ}} (साइटकै चिन्ह) */
function _sgMd(d, content, m) {
  let t = String(d.new || '');
  if (d.bold || d.color) {
    t = t.replace(/[{}*]/g, '');
    if (/^#[0-9a-fA-F]{6}$/.test(d.color || '')) t = '{{' + d.color + ':' + t + '}}';
    const inBold = content.slice(Math.max(0, m.start - 2), m.start) === '**' && content.slice(m.end, m.end + 2) === '**';
    if (d.bold && !inBold) t = '**' + t + '**';
  }
  return t;
}
/* पहिल्यै लागू भइसकेको (नयाँ पाठ अध्यायमा छ) कि? */
function _sgHasNew(content, d) { const t = String(d.new || '').trim(); return t.length >= 2 && content.indexOf(t) >= 0; }
App._sgStale = App._sgStale || {};

/* एक वा धेरै सुझाव लागू: किताब अनुसार एकैचोटि commit। interactive=true भए शंकास्पद (कुन ठाउँ पक्का नभएको) मा सोध्छ, होइन भने छोडिदिन्छ */
async function _sgApply(nums, interactive) {
  const byBook = {};
  nums.forEach(n => { const d = _sgParse(App._sgList.find(x => x.number === n)); if (d) (byBook[d.bookId] = byBook[d.bookId] || []).push({ n, d }); });
  const applied = [], already = [], stale = [], unsure = [];
  for (const bookId of Object.keys(byBook)) {
    let list; try { list = await adminSyncChapters(bookId); } catch (e) { byBook[bookId].forEach(x => { stale.push(x.n); App._sgStale[x.n] = 'किताब/अध्याय लोड हुन सकेन'; }); continue; }
    const backup = list.map(c => c.content), done = [], titles = [];
    for (const { n, d } of byBook[bookId]) {
      const ci = _sgFindChapter(list, d); if (ci < 0) { stale.push(n); App._sgStale[n] = 'अध्याय भेटिएन'; continue; }
      const content = list[ci].content || '', m = _sgLocate(content, d);
      if (!m) {
        if (_sgHasNew(content, d)) { already.push(n); continue; }                  // नयाँ पाठ पहिल्यै अध्यायमा छ → लागू भइसकेको
        stale.push(n); App._sgStale[n] = 'पुरानो पाठ अध्यायमा छैन'; continue;
      }
      if (!m.confident) {
        if (!interactive) { unsure.push(n); continue; }
        const ctx = '…' + content.slice(Math.max(0, m.start - 30), m.start) + '【' + content.slice(m.start, m.end) + ' → ' + d.new + '】' + content.slice(m.end, m.end + 30) + '…';
        const ok = await showConfirm('यो पाठ ' + m.count + ' ठाउँमा भेटियो र कुन हो भनी पक्का भएन; तलको ठाउँ मात्र बदलिन्छ।\n' + ctx, 'हो, बदल्नुहोस्', 'पुष्टि गर्नुहोस्');
        if (!ok) { unsure.push(n); continue; }
      }
      list[ci].content = content.slice(0, m.start) + _sgMd(d, content, m) + content.slice(m.end);
      done.push(n); titles.push(list[ci].title);
    }
    if (done.length) {
      const ok = await saveChapters(bookId, list, 'User suggestions approved (' + done.length + '): ' + [...new Set(titles)].join(', '));
      if (ok) applied.push(...done); else { list.forEach((c, i) => { c.content = backup[i]; }); done.forEach(n => { unsure.push(n); }); }
    }
  }
  let closeFail = 0;
  for (const n of applied) { if (!(await _sgClose(n, 'completed', '✅ स्वीकार गरियो र अध्यायमा लागू गरियो। धन्यवाद!'))) closeFail++; }
  for (const n of already) { if (!(await _sgClose(n, 'completed', 'ℹ️ यो सुधार अध्यायमा पहिल्यै लागू भइसकेको थियो।'))) closeFail++; }
  const gone = applied.concat(already);
  App._sgList = App._sgList.filter(x => !gone.includes(x.number)); _sgBadge(); renderAdminSuggest();
  byBookRefresh(Object.keys(byBook));
  const parts = [];
  if (applied.length) parts.push('✅ ' + applied.length + ' लागू भयो');
  if (already.length) parts.push(already.length + ' पहिल्यै लागू (हटाइयो)');
  if (stale.length) parts.push('⚠️ ' + stale.length + ' को पाठ अध्यायमा भेटिएन — ❌ थिचेर हटाउनुहोस्');
  if (unsure.length) parts.push(unsure.length + ' ठाउँ पक्का भएन — ✅ एक-एक गरेर थिच्नुहोस्');
  if (closeFail) parts.push('GitHub मा बन्द हुन सकेन (' + (App._sgWhy || '?') + ') — यहाँबाट हटाइयो');
  toast(parts.join(' · ') || '—');
}
function byBookRefresh(ids) { ids.forEach(id => { try { if (typeof refreshInlineChapterView === 'function') refreshInlineChapterView(id); } catch (e) {} }); }

async function adminSuggestApprove(n) { await _sgApply([n], true); }
async function adminSuggestBulk(kind) {
  const nums = _sgSelected(); if (!nums.length) return;
  if (kind === 'ok') { await _sgApply(nums, false); return; }
  if (!(await showConfirm(nums.length + ' सुझाव अस्वीकार गरेर बन्द गर्ने?', 'अस्वीकार गर्नुहोस्', 'सुझाव अस्वीकार'))) return;
  let bad = 0; for (const n of nums) { if (!(await _sgClose(n, 'not_planned', 'यो सुझाव यसपटक लागू गरिएन। सहभागिताका लागि धन्यवाद!'))) bad++; }
  App._sgList = App._sgList.filter(x => !nums.includes(x.number)); _sgBadge(); renderAdminSuggest(); toast(bad ? 'अस्वीकार गरियो · ⚠️ GitHub मा बन्द हुन सकेन (' + (App._sgWhy || '?') + ') — यहाँबाट हटाइयो' : 'अस्वीकार गरियो');
}
async function adminSuggestReject(n) {
  if (!(await showConfirm('यो सुझाव अस्वीकार गरेर बन्द गर्ने?', 'अस्वीकार गर्नुहोस्', 'सुझाव अस्वीकार'))) return;
  const okc = await _sgClose(n, 'not_planned', 'यो सुझाव यसपटक लागू गरिएन। सहभागिताका लागि धन्यवाद!');
  App._sgList = App._sgList.filter(x => x.number !== n); _sgBadge(); renderAdminSuggest(); toast(okc ? 'अस्वीकार गरियो' : 'अस्वीकार गरियो · ⚠️ GitHub मा बन्द हुन सकेन (' + (App._sgWhy || '?') + ') — यहाँबाट हटाइयो');
}
window.adminSuggestApprove = adminSuggestApprove; window.adminSuggestBulk = adminSuggestBulk; window.adminSuggestReject = adminSuggestReject;

/* PIN को छेउको ⋮ — "Token राखेर लगइन" विकल्प */
function admPinMoreToggle(force) {
  const m = document.getElementById('adminPinMoreMenu'), b = document.getElementById('adminPinMore'); if (!m || !b) return;
  const open = typeof force === 'boolean' ? force : m.hidden;
  m.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
window.admPinMoreToggle = admPinMoreToggle;
document.addEventListener('click', e => { if (!e.target.closest('.adm-more-wrap')) admPinMoreToggle(false); });

/* ================================================
   शास्त्री पोर्टल — Admin Text Toolbar
   ================================================
   सूचना/किताब/अध्याय content लेख्दा Bold, Italic, Highlight,
   रंगीन text, Heading, Quote, List, तालिका, बक्स, फोटो जोड्ने
   बटनहरू + पूरा-स्क्रिन लेख्ने mode। यसले textarea भित्र त्यही
   custom markdown-जस्तो syntax insert गर्छ, जुन साइटले
   पहिल्यैदेखि (js/main.js को renderMd) मार्फत support गर्दै
   आएको हो — त्यसैले यहाँ लेखेको तुरुन्तै book/notice detail
   page मा राम्रोसँग formatted देखिन्छ।

   NOTE: रंग-छान्ने र पूरा-स्क्रिन दुवै जानाजानी .overlay/openOv
   प्रणाली प्रयोग गर्दैनन् (history push/pop गर्दैनन्), ताकि यी
   अरू खुला भइरहेको form (notice/book/chapter modal) माथि सिधै
   inline देखिऊन् र back-navigation ले parent modal नै बन्द
   नगरोस्।
   ================================================ */
'use strict';

function _mdTa(id) { return document.getElementById(id); }

/* Selected text लाई अगाडि-पछाडि केही राखेर wrap गर्ने (Bold, Italic, Highlight) */
function mdWrap(id, before, after, placeholder = '') {
  const R = window.RTE && RTE.get(id);
  if (R && !R.codeMode) {            // लेख्ने (rich) मोड — कोड नदेखिई सिधै बोल्ड/हाइलाइट
    if (before === '**') return R.bold();
    if (before === '*') return R.italic();
    if (before === '==') return R.mark('hl', null);
    let m = before.match(/^==(.+):$/); if (m) return R.mark('hl', m[1]);
    m = before.match(/^\{\{(.+):$/); if (m) return R.mark('fc', m[1]);
  }
  const ta = _mdTa(id); if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const sel = ta.value.substring(start, end) || placeholder;
  ta.value = ta.value.substring(0, start) + before + sel + after + ta.value.substring(end);
  const pos = start + before.length + sel.length + after.length;
  ta.focus(); ta.setSelectionRange(pos, pos);
}
window.mdWrap = mdWrap;

/* लाइनको सुरुमा prefix राख्ने (Heading, Quote, List item) */
function mdInsertLine(id, prefix, placeholder = '') {
  const R = window.RTE && RTE.get(id);
  if (R && !R.codeMode) {
    if (prefix === '# ') return R.block('h1');
    if (prefix === '## ') return R.block('h2');
    if (prefix === '> ') return R.block('blockquote');
    if (prefix === '- ') return R.list();
  }
  const ta = _mdTa(id); if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const sel = ta.value.substring(start, end) || placeholder;
  const needsNL = start > 0 && ta.value[start - 1] !== '\n';
  const insert = (needsNL ? '\n' : '') + prefix + sel;
  ta.value = ta.value.substring(0, start) + insert + ta.value.substring(end);
  const pos = start + insert.length;
  ta.focus(); ta.setSelectionRange(pos, pos);
}
window.mdInsertLine = mdInsertLine;

/* Cursor भएको ठाउँमा सिधै block text insert गर्ने (HR, Table, Box) */
function mdInsertBlock(id, text) {
  const R = window.RTE && RTE.get(id);
  if (R && !R.codeMode) {
    if (/^\n---\n$/.test(text)) return R.hr();
    return R.text(text.replace(/^\n|\n$/g, ''));
  }
  const ta = _mdTa(id); if (!ta) return;
  const start = ta.selectionStart;
  ta.value = ta.value.substring(0, start) + text + ta.value.substring(ta.selectionEnd);
  const pos = start + text.length;
  ta.focus(); ta.setSelectionRange(pos, pos);
}
window.mdInsertBlock = mdInsertBlock;

const MD_BOX_TYPES = [
  { key: 'question', label: '❓ सोच्नुहोस्' },
  { key: 'tip',       label: '💡 सुझाव' },
  { key: 'note',      label: '📝 याद राख्नुहोस्' },
  { key: 'warning',   label: '⚠️ ध्यान दिनुहोस्' },
  { key: 'info',      label: '📖 जानकारी' },
  { key: 'example',   label: '✏️ उदाहरण' },
];

let _boxInsertCtx = { textareaId: null };

function _mdBoxOutsideClick(e) {
  const pop = document.getElementById('boxTypePopover');
  if (!pop) return;
  if (!pop.contains(e.target) && !e.target.closest('.tb-btn-box')) mdCloseBoxPicker();
}
function mdCloseBoxPicker() {
  document.getElementById('boxTypePopover')?.classList.remove('show');
  document.removeEventListener('click', _mdBoxOutsideClick, true);
  document.querySelectorAll('.overlay.blur-paused').forEach(el => el.classList.remove('blur-paused'));
}
window.mdCloseBoxPicker = mdCloseBoxPicker;

function mdInsertBox(id, btnEl) {
  _boxInsertCtx = { textareaId: id };
  const pop = document.getElementById('boxTypePopover');
  if (!pop) return;
  document.querySelectorAll('.overlay.open').forEach(el => el.classList.add('blur-paused'));
  const list = document.getElementById('boxTypeList');
  if (list) {
    list.innerHTML = MD_BOX_TYPES.map(b => `<button type="button" class="font-opt-btn" onclick="mdApplyBoxType('${b.key}')">${b.label}</button>`).join('');
  }
  if (btnEl) {
    const r = btnEl.getBoundingClientRect();
    const popW = Math.min(250, window.innerWidth - 20);
    let left = r.left;
    if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
    if (left < 10) left = 10;
    let top = r.bottom + 8;
    if (top + 300 > window.innerHeight) top = Math.max(10, r.top - 310);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  pop.classList.add('show');
  setTimeout(() => document.addEventListener('click', _mdBoxOutsideClick, true), 0);
}
window.mdInsertBox = mdInsertBox;

function mdApplyBoxType(type) {
  const id = _boxInsertCtx.textareaId;
  const R = id && window.RTE && RTE.get(id);
  if (R && !R.codeMode) { R.box(type); mdCloseBoxPicker(); return; }
  if (id) mdInsertBlock(id, `\n:::${type}\nयहाँ लेख्नुस्...\n:::\n`);
  mdCloseBoxPicker();
}
window.mdApplyBoxType = mdApplyBoxType;

function mdInsertTable(id) {
  const R = window.RTE && RTE.get(id);
  if (R && !R.codeMode) return R.table();
  mdInsertBlock(id, `\n| कलम १ | कलम २ |\n|---|---|\n| मान १ | मान २ |\n`);
}
window.mdInsertTable = mdInsertTable;

async function mdInsertImage(id) {
  const url = await showTextPrompt('Image URL राख्नुस्', 'https://...');
  if (!url) return;
  const R = window.RTE && RTE.get(id);
  if (R && !R.codeMode) return R.image(url, '', url);
  mdInsertBlock(id, `![](${url})`);
}
window.mdInsertImage = mdInsertImage;


/* ════════════════════════════════════
   📷 फोटो अपलोड — textarea को कर्सर भएको जुनसुकै ठाउँमा
   - फोटो छान्दा browser मै सानो बनाइन्छ (max 1200px) र "![](pending:ID)" राखिन्छ
   - साँच्चै GitHub मा अपलोड "Commit" गर्दा मात्र हुन्छ (पूर्वावलोकनमा तुरुन्तै देखिन्छ)
   - आकार (पूरा/७५%/५०%/३०%) र स्थिति (बीचमा / अक्षर वरिपरि बायाँ / दायाँ) छान्न मिल्छ
   ════════════════════════════════════ */
const MD_TA_IDS = new Set();
/* App._mdImgs (pending id -> {dataUrl,b64}) र App._mdImgUp (id -> GitHub path) js/admin.js मा तयार हुन्छन् */
function _mdStore() { App._mdImgs = App._mdImgs || {}; App._mdImgUp = App._mdImgUp || {}; return App._mdImgs; }
let _mdImgCtx = null;
let _mdImgSeq = 0;

function mdUploadImage(id) {
  const ta = _mdTa(id); if (!ta) return;
  _mdImgCtx = { id, start: ta.selectionStart, end: ta.selectionEnd };
  let inp = document.getElementById('mdImgFile');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'mdImgFile'; inp.style.display = 'none';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) _mdImgStart(f); };
    document.body.appendChild(inp);
  }
  inp.value = '';
  inp.click();
}
window.mdUploadImage = mdUploadImage;

async function _mdImgStart(file) {
  if (!window.GH) { toast('⚠️ GitHub module लोड भएको छैन'); return; }
  try {
    toast('⏳ फोटो तयार गर्दैछ…');
    const prepared = await GH.prepareImage(file, 1200, 0.82);
    _mdImgCtx.prepared = prepared;
    _mdImgCtx.size = '100'; _mdImgCtx.align = 'center';
    _mdImgSheet();
  } catch (e) { toast('⚠️ ' + e.message); }
}

function _mdImgSheet() {
  document.getElementById('mdImgSheet')?.remove();
  const c = _mdImgCtx;
  const sheet = document.createElement('div');
  sheet.id = 'mdImgSheet'; sheet.className = 'mdimg-back';
  const chip = (grp, val, label) => `<button type="button" class="mdimg-chip" data-grp="${grp}" data-val="${val}" onclick="mdImgPick('${grp}','${val}')">${label}</button>`;
  sheet.innerHTML = `<div class="mdimg-card">
      <div class="mdimg-title">📷 फोटो कसरी राख्ने?</div>
      <div class="mdimg-prev"><img src="${c.prepared.dataUrl}" alt=""></div>
      <div class="mdimg-lbl">आकार</div>
      <div class="mdimg-row">${chip('size', '100', 'पूरा')}${chip('size', '75', '७५%')}${chip('size', '50', '५०%')}${chip('size', '30', '३०%')}</div>
      <div class="mdimg-lbl">स्थिति</div>
      <div class="mdimg-row">${chip('align', 'center', 'बीचमा')}${chip('align', 'left', '◧ बायाँ (अक्षर वरिपरि)')}${chip('align', 'right', 'दायाँ (अक्षर वरिपरि) ◨')}</div>
      <div class="mdimg-hint" id="mdImgHint"></div>
      <div class="mdimg-btns">
        <button type="button" class="btn-s" onclick="mdImgCancel()">रद्द</button>
        <button type="button" class="btn-p" onclick="mdImgConfirm()">✅ यहाँ राख्नुस्</button>
      </div></div>`;
  sheet.addEventListener('click', e => { if (e.target === sheet) mdImgCancel(); });
  document.body.appendChild(sheet);
  _mdImgRefresh();
}

function _mdImgRefresh() {
  const c = _mdImgCtx; if (!c) return;
  document.querySelectorAll('#mdImgSheet .mdimg-chip').forEach(b => b.classList.toggle('on', c[b.dataset.grp] === b.dataset.val));
  const h = document.getElementById('mdImgHint');
  if (h) h.textContent = c.align === 'center' ? 'फोटो आफ्नै लाइनमा, बीचमा देखिन्छ।' : 'फोटो छेउमा र अक्षर यसको वरिपरि बग्छ (पत्रिकामा जस्तै)। ५०% वा ३०% राख्दा राम्रो देखिन्छ।';
}
function mdImgPick(grp, val) {
  if (!_mdImgCtx) return;
  _mdImgCtx[grp] = val;
  if (grp === 'align' && val !== 'center' && _mdImgCtx.size === '100') _mdImgCtx.size = '50';   // अक्षर वरिपरि राख्दा आधा आकार उपयुक्त
  _mdImgRefresh();
}
window.mdImgPick = mdImgPick;

function mdImgCancel() { document.getElementById('mdImgSheet')?.remove(); _mdImgCtx = null; }
window.mdImgCancel = mdImgCancel;

function mdImgConfirm() {
  const c = _mdImgCtx; if (!c) return;
  const ta = _mdTa(c.id);
  document.getElementById('mdImgSheet')?.remove();
  if (!ta) { _mdImgCtx = null; return; }
  const pid = 'i' + Date.now().toString(36).slice(-5) + (++_mdImgSeq);
  _mdStore()[pid] = c.prepared;
  const opts = (c.size !== '100' ? '|' + c.size : '') + (c.align !== 'center' ? '|' + c.align : '');
  const md = `![${opts}](pending:${pid})`;
  const R = window.RTE && RTE.get(c.id);
  if (R && !R.codeMode) {                  // लेख्ने मोड — फोटो सिधै देखिन्छ
    R.image(c.prepared.dataUrl, opts, 'pending:' + pid);
    _mdImgCtx = null;
    toast('✅ फोटो राखियो — पूर्वावलोकनमा हेर्न सकिन्छ');
    return;
  }
  const v = ta.value, s = Math.min(c.start, v.length), e = Math.min(c.end, v.length);
  const pre  = (s > 0 && v[s - 1] !== '\n') ? '\n' : '';
  const post = (v[e] !== undefined && v[e] !== '\n') ? '\n' : '\n';
  ta.value = v.slice(0, s) + pre + md + post + v.slice(e);
  const pos = s + pre.length + md.length + post.length;
  ta.focus(); ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  _mdImgCtx = null;
  toast('✅ फोटो राखियो — पूर्वावलोकनमा हेर्न सकिन्छ');
}
window.mdImgConfirm = mdImgConfirm;

/* RTE भित्र फोटो paste गर्दा (rich-editor.js ले बोलाउँछ) */
window.mdPasteImage = (id, file) => { _mdImgCtx = { id, start: 0, end: 0 }; _mdImgStart(file); };

/* कम्प्युटरमा clipboard बाट फोटो paste गर्दा पनि कर्सरकै ठाउँमा */
document.addEventListener('paste', e => {
  const ta = e.target;
  if (!ta || ta.tagName !== 'TEXTAREA' || !MD_TA_IDS.has(ta.id)) return;
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
  if (!f) return;
  e.preventDefault();
  _mdImgCtx = { id: ta.id, start: ta.selectionStart, end: ta.selectionEnd };
  _mdImgStart(f);
});

/* वैदिक/संस्कृत विशेष अक्षरहरू — क्रमैसँग, cursor भएको ठाउँमा सिधै insert हुने */
const VEDIC_CHARS = ['ॐ','ऽ','॥','।','ᳬ','ᳫ','ᳪ','ᳩ','ᳰ','ᳮ','ᳱ','ᳯ','꣱','꣰','꣯','꣮','꣭','꣬','꣫','꣠','꣡','꣢','꣣','꣤','꣥','꣦','꣧','꣨','꣩','꣪','॰'];

function mdInsertChar(id, ch) {
  mdInsertBlock(id, ch);
}
window.mdInsertChar = mdInsertChar;

/* साइटले support गर्ने रंगहरू (renderMd/HL_COLOR_MAP सँग मिल्ने) */
const MD_COLORS = [
  { key: 'रातो',    hex: '#F44336' },
  { key: 'निलो',    hex: '#2196F3' },
  { key: 'हरियो',   hex: '#4CAF50' },
  { key: 'पहेलो',   hex: '#FBC02D' },
  { key: 'सुन्तला', hex: '#FB8C00' },
  { key: 'बैजनी',   hex: '#9C27B0' },
  { key: 'गुलाबी',  hex: '#EC407A' },
  { key: 'खैरो',    hex: '#8D6E63' },
  { key: 'आकाशे',   hex: '#00BCD4' },
];

/* ════════════════════════════════════
   रंग छान्ने — सानो inline popup (toolbar बटनकै छेउमा)
   ════════════════════════════════════ */
let _mdColorCtx = { textareaId: null, mode: null };

function _mdColorOutsideClick(e) {
  const pop = document.getElementById('colorPopover');
  if (!pop) return;
  if (!pop.contains(e.target) && !e.target.closest('.tb-btn-color')) {
    mdCloseColorPicker();
  }
}

function mdCloseColorPicker() {
  document.getElementById('colorPopover')?.classList.remove('show');
  document.removeEventListener('click', _mdColorOutsideClick, true);
  document.querySelectorAll('.overlay.blur-paused').forEach(el => el.classList.remove('blur-paused'));
}
window.mdCloseColorPicker = mdCloseColorPicker;

function mdOpenColorPicker(textareaId, mode, btnEl) {
  _mdColorCtx = { textareaId, mode };
  const pop = document.getElementById('colorPopover');
  if (!pop) return;
  document.querySelectorAll('.overlay.open').forEach(el => el.classList.add('blur-paused'));
  const titleEl = document.getElementById('colorPopoverTitle');
  if (titleEl) titleEl.textContent = mode === 'highlight' ? '🎨 Highlight रंग छान्नुस्' : '🖊️ अक्षरको रंग छान्नुस्';
  const grid = document.getElementById('colorPopoverGrid');
  if (grid) {
    grid.innerHTML = MD_COLORS.map(c => `
      <button type="button" class="color-swatch-btn" onclick="mdApplyColor('${c.key}')">
        <span class="color-swatch-dot" style="background:${c.hex}"></span>
        <span class="color-swatch-lbl">${c.key}</span>
      </button>`).join('');
  }

  // बटनकै नजिकमा popup देखाउने (viewport भित्रै रहने गरी)
  if (btnEl) {
    const r = btnEl.getBoundingClientRect();
    const popW = Math.min(236, window.innerWidth - 20);
    let left = r.left;
    if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
    if (left < 10) left = 10;
    let top = r.bottom + 8;
    // तल ठाउँ नपुगे बटनको माथिपट्टि देखाउने
    if (top + 180 > window.innerHeight) top = Math.max(10, r.top - 190);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  pop.classList.add('show');
  setTimeout(() => document.addEventListener('click', _mdColorOutsideClick, true), 0);
}
window.mdOpenColorPicker = mdOpenColorPicker;

function mdApplyColor(colorKey) {
  const { textareaId, mode } = _mdColorCtx;
  if (textareaId) {
    if (mode === 'highlight') mdWrap(textareaId, `==${colorKey}:`, '==', 'यहाँ लेख्नुस्');
    else mdWrap(textareaId, `{{${colorKey}:`, '}}', 'यहाँ लेख्नुस्');
  }
  mdCloseColorPicker();
}
window.mdApplyColor = mdApplyColor;

/* ════════════════════════════════════
   फन्ट छान्ने — पूरा-स्क्रिन editor मा लेख्दा (टाइप गर्ने अनुभव मात्र बदल्छ)
   ════════════════════════════════════ */
const MD_FONTS = [
  { key: 'siddhanta', label: 'सिद्धान्त (Default)', css: "'Siddhanta','Chakra Petch','Noto Serif Devanagari',serif" },
  { key: 'khand',      label: 'Khand Nepali',        css: "'Khand','Noto Serif Devanagari',sans-serif" },
  { key: 'gotu',       label: 'Gotu Nepali',         css: "'Gotu','Noto Serif Devanagari',sans-serif" },
  { key: 'notoserif',  label: 'Noto Serif',          css: "'Noto Serif Devanagari',serif" },
  { key: 'comic',      label: 'Comic (English)',     css: "'Comic Neue','Noto Serif Devanagari',cursive" },
  { key: 'patrick',    label: 'Patrick Hand (English)', css: "'Patrick Hand','Noto Serif Devanagari',cursive" },
  { key: 'fredoka',    label: 'Fredoka (English)',   css: "'Fredoka','Noto Serif Devanagari',sans-serif" },
];

function _mdFontOutsideClick(e) {
  const pop = document.getElementById('fontPopover');
  if (!pop) return;
  if (!pop.contains(e.target) && !e.target.closest('.fs-editor-font-btn')) {
    mdCloseFontPicker();
  }
}

function mdCloseFontPicker() {
  document.getElementById('fontPopover')?.classList.remove('show');
  document.removeEventListener('click', _mdFontOutsideClick, true);
}
window.mdCloseFontPicker = mdCloseFontPicker;

function mdOpenFontPicker(btnEl) {
  const pop = document.getElementById('fontPopover');
  const ta = document.getElementById('fsEditorTa');
  if (!pop || !ta) return;
  const current = ta.dataset.fontKey || 'siddhanta';
  const list = document.getElementById('fontPopoverList');
  if (list) {
    list.innerHTML = MD_FONTS.map(f => `
      <button type="button" class="font-opt-btn ${f.key === current ? 'active' : ''}" style="font-family:${f.css}" onclick="mdApplyFont('${f.key}')">${f.label}</button>`).join('');
  }
  if (btnEl) {
    const r = btnEl.getBoundingClientRect();
    const popW = Math.min(240, window.innerWidth - 20);
    let left = r.right - popW;
    if (left < 10) left = 10;
    let top = r.bottom + 8;
    if (top + 260 > window.innerHeight) top = Math.max(10, r.top - 270);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  pop.classList.add('show');
  setTimeout(() => document.addEventListener('click', _mdFontOutsideClick, true), 0);
}
window.mdOpenFontPicker = mdOpenFontPicker;

function mdApplyFont(fontKey) {
  const ta = document.getElementById('fsEditorTa');
  const f = MD_FONTS.find(x => x.key === fontKey);
  if (ta && f) {
    ta.style.fontFamily = f.css;
    ta.dataset.fontKey = fontKey;
  }
  mdCloseFontPicker();
}
window.mdApplyFont = mdApplyFont;

/* ════════════════════════════════════
   पूरा-स्क्रिन लेख्ने Mode — छुट्टै full-page (history/overlay प्रयोग गर्दैन)
   ════════════════════════════════════ */
let _fsEditorSourceId = null;

function mdOpenFullscreen(textareaId, title, btnEl) {
  const src = _mdTa(textareaId);
  const page = document.getElementById('fsEditorPage');
  if (!src || !page) return;
  _fsEditorSourceId = textareaId;
  document.querySelectorAll('.overlay.open').forEach(el => el.classList.add('blur-paused'));
  const titleEl = document.getElementById('fsEditorTitle');
  if (titleEl) titleEl.textContent = title || 'सम्पादन';
  const fsTa = _mdTa('fsEditorTa');
  fsTa.value = src.value;
  const existingFontKey = src.dataset.fontKey || 'siddhanta';
  fsTa.dataset.fontKey = existingFontKey;
  fsTa.style.fontFamily = fontCssFor(existingFontKey);
  const tb = document.getElementById('fsEditorToolbar');
  if (tb) tb.innerHTML = renderMdToolbar('fsEditorTa', { fullscreenBtn: false });
  page.classList.add('show');
  setTimeout(() => { const R = window.RTE && RTE.get('fsEditorTa'); if (R && !R.codeMode) R.focus(); else fsTa.focus(); }, 320);
}
window.mdOpenFullscreen = mdOpenFullscreen;

function mdCloseFullscreen() {
  const src = _mdTa(_fsEditorSourceId);
  const fsTa = _mdTa('fsEditorTa');
  if (src && fsTa) {
    src.value = fsTa.value; // सम्पादन गरेको content मूल textarea मा फर्काउने
    src.dataset.fontKey = fsTa.dataset.fontKey || 'siddhanta'; // छानिएको फन्ट पनि सँगै फर्काउने (save गर्दा चाहिन्छ)
  }
  document.getElementById('fsEditorPage')?.classList.remove('show');
  document.querySelectorAll('.overlay.blur-paused').forEach(el => el.classList.remove('blur-paused'));
}
window.mdCloseFullscreen = mdCloseFullscreen;

/* फन्ट key बाट CSS font-family value निकाल्ने — content render गर्दा (renderMd सँगै) प्रयोग हुन्छ */
function fontCssFor(key) {
  const f = MD_FONTS.find(x => x.key === key);
  return f ? f.css : '';
}
window.fontCssFor = fontCssFor;

/* पूरा toolbar एउटै ठाउँमा render गर्ने — कुनै पनि textarea id लाई जोड्न मिल्ने
   opts.title = पूरा-स्क्रिन खोल्दा देखिने heading
   opts.fullscreenBtn = false भए ⛶ बटन नदेखाउने (पूरा-स्क्रिन भित्रैको toolbar मा दोहोरो नआउन) */

/* ════════════════════════════════════════════════════════════
   नयाँ Toolbar — DevExtreme HtmlEditor "Toolbar Customization" जस्तै
   Undo · Redo | Heading (Normal text, 1–5) | Bold · Italic · Strike · Underline |
   Align Left · Center · Right · Justify | Show markup
   ════════════════════════════════════════════════════════════ */
function _rte(id) { return window.RTE && RTE.get(id); }

/* code (markup) मोडमा textarea मै काम गर्ने — सामान्य मोडमा RTE ले गर्छ */
function _mdLineRange(ta) {
  const v = ta.value, s = ta.selectionStart;
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  let le = v.indexOf('\n', s); if (le < 0) le = v.length;
  return { v, ls, le };
}
function mdFmt(id, kind) {
  const R = _rte(id);
  if (R && !R.codeMode) {
    if (kind === 'bold') return R.bold();
    if (kind === 'italic') return R.italic();
    if (kind === 'strike') return R.strike();
    if (kind === 'underline') return R.underline();
  }
  if (kind === 'bold') return mdWrap(id, '**', '**', 'बोल्ड');
  if (kind === 'italic') return mdWrap(id, '*', '*', 'छड्के');
  if (kind === 'strike') return mdWrap(id, '~~', '~~', 'काटिएको');
  if (kind === 'underline') return mdWrap(id, '__', '__', 'रेखाङ्कित');
}
function mdHeading(id, level) {
  level = +level || 0;
  const R = _rte(id);
  if (R && !R.codeMode) return R.heading(level);
  const ta = _mdTa(id); if (!ta) return;
  const { v, ls, le } = _mdLineRange(ta);
  let line = v.slice(ls, le).replace(/^#{1,5} /, '');
  line = (level ? '#'.repeat(level) + ' ' : '') + line;
  ta.value = v.slice(0, ls) + line + v.slice(le);
  ta.focus(); ta.setSelectionRange(ls + line.length, ls + line.length);
}
function mdAlign(id, al) {
  const R = _rte(id);
  if (R && !R.codeMode) return R.align(al);
  const ta = _mdTa(id); if (!ta) return;
  const { v, ls, le } = _mdLineRange(ta);
  const line = v.slice(ls, le).replace(/^((?:#{1,5} |> |- )?)(?:\{:(?:left|center|right|justify)\})?/, (m, pre) => pre + (al === 'left' ? '' : '{:' + al + '}'));
  ta.value = v.slice(0, ls) + line + v.slice(le);
  ta.focus(); ta.setSelectionRange(ls + line.length, ls + line.length);
}
function mdUndo(id) { const R = _rte(id); if (R && !R.codeMode) R.undo(); else { const ta = _mdTa(id); if (ta) { ta.focus(); document.execCommand('undo'); } } }
function mdRedo(id) { const R = _rte(id); if (R && !R.codeMode) R.redo(); else { const ta = _mdTa(id); if (ta) { ta.focus(); document.execCommand('redo'); } } }
function mdClearMarks(id) { const R = _rte(id); if (R && !R.codeMode) R.clearMarks(); else toast('⚠️ पहिले अक्षर select गर्नुस्'); }
function mdToggleCode(id) { const R = _rte(id); if (R) R.toggleCode(); }
window.mdFmt = mdFmt; window.mdHeading = mdHeading; window.mdAlign = mdAlign;
window.mdUndo = mdUndo; window.mdRedo = mdRedo; window.mdClearMarks = mdClearMarks; window.mdToggleCode = mdToggleCode;

/* आइकनहरू — DevExtreme जस्तै सरल रेखा-आइकन */
const _DXI = {
  undo:      '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  redo:      '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>',
  bold:      '<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>',
  italic:    '<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>',
  strike:    '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/>',
  underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/>',
  alignL:    '<line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/>',
  alignC:    '<line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="19" y1="18" x2="5" y2="18"/>',
  alignR:    '<line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="7" y2="18"/>',
  alignJ:    '<line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/>',
};
const _dxIco = k => `<svg class="dxtb-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${_DXI[k]}</svg>`;

function renderMdToolbar(textareaId, opts = {}) {
  MD_TA_IDS.add(textareaId);   // यो textarea मा फोटो paste गर्न पनि मिल्ने
  // लेख्ने (rich) एडिटर — textarea DOM मा आइसकेपछि जोड्ने
  queueMicrotask(() => { try { if (window.RTE) RTE.attach(textareaId); } catch (e) { console.error('RTE', e); } });
  const id = textareaId;
  /* बटन थिच्दा editor को selection नहराओस् भनेर mousedown रोक्ने */
  const btn = (icon, title, onclick, cmd) =>
    `<button type="button" class="dxtb-btn" title="${title}" aria-label="${title}" onmousedown="event.preventDefault()" onclick="${onclick}"${cmd ? ` data-ta="${id}" data-cmd="${cmd}" aria-pressed="false"` : ''}>${_dxIco(icon)}</button>`;
  const sep = '<span class="dxtb-sep" role="separator"></span>';
  return `
  <div class="dxtb" role="toolbar" aria-label="Text editor toolbar">
    ${btn('undo', 'Undo', `mdUndo('${id}')`)}
    ${btn('redo', 'Redo', `mdRedo('${id}')`)}
    ${sep}
    <select class="dxtb-select" title="Header" aria-label="Header" data-ta="${id}" data-cmd="hd" onchange="mdHeading('${id}', this.value)">
      <option value="0">Normal text</option>
      <option value="1">Heading 1</option>
      <option value="2">Heading 2</option>
      <option value="3">Heading 3</option>
      <option value="4">Heading 4</option>
      <option value="5">Heading 5</option>
    </select>
    ${sep}
    ${btn('bold', 'Bold', `mdFmt('${id}','bold')`, 'bold')}
    ${btn('italic', 'Italic', `mdFmt('${id}','italic')`, 'italic')}
    ${btn('strike', 'Strikethrough', `mdFmt('${id}','strike')`, 's')}
    ${btn('underline', 'Underline', `mdFmt('${id}','underline')`, 'u')}
    ${sep}
    ${btn('alignL', 'Align left', `mdAlign('${id}','left')`, 'alL')}
    ${btn('alignC', 'Align center', `mdAlign('${id}','center')`, 'alC')}
    ${btn('alignR', 'Align right', `mdAlign('${id}','right')`, 'alR')}
    ${btn('alignJ', 'Justify', `mdAlign('${id}','justify')`, 'alJ')}
    ${sep}
    <button type="button" class="dxtb-btn dxtb-text tb-btn-code" title="Show markup" onmousedown="event.preventDefault()" onclick="mdToggleCode('${id}')" data-ta="${id}" data-cmd="code" aria-pressed="false"><span class="dxtb-lbl">Show markup</span></button>
  </div>`;
}
window.renderMdToolbar = renderMdToolbar;

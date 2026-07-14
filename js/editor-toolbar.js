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
  if (id) mdInsertBlock(id, `\n:::${type}\nयहाँ लेख्नुस्...\n:::\n`);
  mdCloseBoxPicker();
}
window.mdApplyBoxType = mdApplyBoxType;

function mdInsertTable(id) {
  mdInsertBlock(id, `\n| कलम १ | कलम २ |\n|---|---|\n| मान १ | मान २ |\n`);
}
window.mdInsertTable = mdInsertTable;

async function mdInsertImage(id) {
  const url = await showTextPrompt('Image URL राख्नुस्', 'https://...');
  if (!url) return;
  mdInsertBlock(id, `![](${url})`);
}
window.mdInsertImage = mdInsertImage;

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
  { key: 'eczar',      label: 'Eczar Nepali',        css: "'Eczar','Noto Serif Devanagari',serif" },
  { key: 'khand',      label: 'Khand Nepali',        css: "'Khand','Noto Serif Devanagari',sans-serif" },
  { key: 'gotu',       label: 'Gotu Nepali',         css: "'Gotu','Noto Serif Devanagari',sans-serif" },
  { key: 'notoserif',  label: 'Noto Serif',          css: "'Noto Serif Devanagari',serif" },
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
  setTimeout(() => fsTa.focus(), 320);
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
function renderMdToolbar(textareaId, opts = {}) {
  const title = opts.title || 'सम्पादन';
  const showFs = opts.fullscreenBtn !== false;
  return `
  <div class="md-toolbar md-vedic-row">
    ${VEDIC_CHARS.map(ch => `<button type="button" class="tb-btn tb-btn-char" onclick="mdInsertChar('${textareaId}','${ch}')" title="${ch} थप्नुस्">${ch}</button>`).join('')}
  </div>
  <div class="md-toolbar">
    ${showFs ? `<button type="button" class="tb-btn tb-btn-fs" onclick="mdOpenFullscreen('${textareaId}','${title}',this)" title="पूरा स्क्रिनमा लेख्नुस्">⛶ पूरा स्क्रिन</button>` : ''}
    <button type="button" class="tb-btn" onclick="mdWrap('${textareaId}','**','**','बोल्ड')" title="बोल्ड"><b>B</b></button>
    <button type="button" class="tb-btn" onclick="mdWrap('${textareaId}','*','*','छड्के')" title="छड्के (Italic)"><i>I</i></button>
    <button type="button" class="tb-btn" onclick="mdWrap('${textareaId}','==','==','हाइलाइट')" title="सामान्य हाइलाइट">🖍️ H</button>
    <button type="button" class="tb-btn tb-btn-color" onclick="mdOpenColorPicker('${textareaId}','highlight',this)" title="रंगीन Highlight">🎨 रंगीन Highlight</button>
    <button type="button" class="tb-btn tb-btn-color" onclick="mdOpenColorPicker('${textareaId}','text',this)" title="रंगीन अक्षर मात्र">🖊️ रंगीन अक्षर</button>
    <button type="button" class="tb-btn" onclick="mdInsertLine('${textareaId}','# ','शीर्षक')" title="ठूलो शीर्षक">H1</button>
    <button type="button" class="tb-btn" onclick="mdInsertLine('${textareaId}','## ','उप-शीर्षक')" title="उप-शीर्षक">H2</button>
    <button type="button" class="tb-btn" onclick="mdInsertLine('${textareaId}','> ','उद्धरण')" title="उद्धरण">❝</button>
    <button type="button" class="tb-btn" onclick="mdInsertLine('${textareaId}','- ','सूची वस्तु')" title="सूची">• सूची</button>
    <button type="button" class="tb-btn" onclick="mdInsertBlock('${textareaId}','\\n---\\n')" title="भाग छुट्याउने रेखा">― रेखा</button>
    <button type="button" class="tb-btn tb-btn-box" onclick="mdInsertBox('${textareaId}',this)" title="सूचना/सुझाव बक्स">📦 बक्स</button>
    <button type="button" class="tb-btn" onclick="mdInsertTable('${textareaId}')" title="तालिका">▦ तालिका</button>
    <button type="button" class="tb-btn" onclick="mdInsertImage('${textareaId}')" title="फोटो">🖼️ फोटो</button>
  </div>`;
}
window.renderMdToolbar = renderMdToolbar;

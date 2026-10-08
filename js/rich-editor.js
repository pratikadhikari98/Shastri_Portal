/* ================================================
   शास्त्री पोर्टल — Rich Editor (लेख्दा नै बोल्ड/हाइलाइट देखिने)
   ================================================
   - textarea भित्र **राम** जस्तो कोड देखिँदैन। बोल्ड गर्दा अक्षर सिधै बोल्ड देखिन्छ।
   - भित्र भण्डारण भने उही पुरानो markdown ढाँचामा हुन्छ (textarea.value) —
     त्यसैले पुराना अध्याय/सूचना, renderMd, पूर्वावलोकन र commit सबै पहिले जस्तै चल्छ।
   - "</> कोड" बटनले चाहेमा markdown कोड हेर्न/सम्पादन गर्न मिल्छ।
   ================================================ */
(function () {
  'use strict';

  const INSTS = new Map();                 // textarea id -> instance
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = s => String(s).replace(/"/g, '&quot;');
  const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR']);
  const RE_SPECIAL_LINE = /^(#{1,5} |> |- |---$|:::|\|)/;

  const store = () => { App._mdImgs = App._mdImgs || {}; App._mdImgUp = App._mdImgUp || {}; return App; };
  const boxMeta = t => (typeof BOX_TYPES !== 'undefined' && (BOX_TYPES[String(t).toLowerCase()] || BOX_TYPES.note)) || { icon: '📝', color: '#4CAF50', label: 'याद राख्नुहोस्' };
  const colorOf = w => (typeof resolveHlColor === 'function' ? resolveHlColor(w) : null);

  /* ═════════ markdown → editor HTML ═════════ */
  function imgHtml(alt, src) {
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
    let shown = src;
    const pm = src.match(/^pending:([A-Za-z0-9_-]+)$/);
    if (pm) { const A = store(); shown = A._mdImgUp[pm[1]] || (A._mdImgs[pm[1]] && A._mdImgs[pm[1]].dataUrl) || src; }
    return `<img class="rte-img" data-alt="${escAttr(alt)}" data-src="${escAttr(src)}" src="${escAttr(shown)}"${st.length ? ' style="' + st.join(';') + '"' : ''}>`;
  }

  const SENT = { '*': '\uE001', '=': '\uE002', '{': '\uE003', '}': '\uE004', '\\': '\uE005', ':': '\uE006', '_': '\uE007', '~': '\uE008' };
  const UNSENT = { '\uE001': '*', '\uE002': '=', '\uE003': '{', '\uE004': '}', '\uE005': '\\', '\uE006': ':', '\uE007': '_', '\uE008': '~' };
  function inlineHtml(raw) {
    let s = esc(raw).replace(/\\([\\*={}:_~])/g, (m, c) => SENT[c]);        // \* जस्ता सुरक्षित अक्षर
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => imgHtml(alt, src));
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/__([^_\s](?:[^_]*?[^_\s])?)__/g, '<u>$1</u>')
      .replace(/~~(.+?)~~/g, '<s>$1</s>')
      .replace(/==(?:([^=\n]{1,16}):)?([^=]+?)==/g, (m, w, txt) => {
        const c = colorOf(w);
        if (c) return `<span class="highlight rte-hl" data-c="${escAttr(w.trim())}" style="background:${c}33;color:${c};box-shadow:inset 0 -2px 0 ${c}">${txt}</span>`;
        return `<span class="highlight rte-hl">${w ? w + ':' + txt : txt}</span>`;
      })
      .replace(/\{\{([^:{}\n]{1,16}):([^{}]+?)\}\}/g, (m, w, txt) => {
        const c = colorOf(w);
        if (c) return `<span class="rte-fc" data-c="${escAttr(w.trim())}" style="color:${c};font-weight:600">${txt}</span>`;
        return w + ':' + txt;
      });
    return s.replace(/[\uE001-\uE008]/g, ch => UNSENT[ch]);
  }

  /* ── पङ्क्ति मिलान (align): लाइनको सुरुमा {:center} {:right} {:justify} ── */
  const AL_RE = /^\{:(left|center|right|justify)\}/;
  const alignOf = s => { const m = String(s).match(AL_RE); return m ? { al: m[1], t: s.slice(m[0].length) } : { al: '', t: s }; };
  const alAttr = al => (al && al !== 'left') ? ` data-al="${al}" style="text-align:${al}"` : '';
  const alPrefix = n => { const a = n.getAttribute && n.getAttribute('data-al'); return a && a !== 'left' ? `{:${a}}` : ''; };

  const lineHtml = ln => { const a = alignOf(ln); return '<div' + alAttr(a.al) + '>' + (inlineHtml(a.t) || '<br>') + '</div>'; };

  function boxHtml(type, label, innerLines) {
    const meta = boxMeta(type);
    const title = label || meta.label;
    const body = (innerLines.length ? innerLines : ['']).map(lineHtml).join('');
    return `<div class="content-box rte-box" data-type="${escAttr(type.toLowerCase())}" data-label="${escAttr(label || '')}" style="background:${meta.color}14;border-color:${meta.color}40;border-left-color:${meta.color}">` +
      `<div class="content-box-head rte-box-head" contenteditable="false" style="color:${meta.color}"><span class="content-box-ico">${meta.icon}</span><span class="content-box-title">${esc(title)}</span><span class="rte-box-pen" title="शीर्षक बदल्नुस्">✎</span></div>` +
      `<div class="content-box-body rte-box-body">${body}</div></div>`;
  }

  function tableHtml(headers, rows) {
    const cell = (tag, t) => `<${tag}>${inlineHtml(t) || '<br>'}</${tag}>`;
    return `<div class="content-table-wrap rte-tablewrap"><table class="content-table rte-table"><thead><tr>${headers.map(h => cell('th', h)).join('')}</tr></thead>` +
      `<tbody>${rows.map(r => '<tr>' + r.map(c => cell('td', c)).join('') + '</tr>').join('')}</tbody></table></div>`;
  }

  function mdToHtml(md) {
    const lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i];
      let m;
      // बक्स — :::type:शीर्षक ... :::
      if ((m = ln.match(/^:::(\w+)(?::(.*))?$/))) {
        const inner = []; let j = i + 1, closed = false;
        while (j < lines.length) {
          const L = lines[j];
          if (/:::\s*$/.test(L)) { const before = L.replace(/:::\s*$/, ''); if (before !== '') inner.push(before); closed = true; break; }
          inner.push(L); j++;
        }
        if (closed) { out.push(boxHtml(m[1], (m[2] || '').trim(), inner)); i = j + 1; continue; }
      }
      // तालिका
      if (/^\|(.+)\|\s*$/.test(ln) && i + 1 < lines.length && /^\|[ \t]*[:\-][ \t:\-|]*\|\s*$/.test(lines[i + 1])) {
        let j = i + 2; const rows = [];
        while (j < lines.length && /^\|.*\|\s*$/.test(lines[j])) { rows.push(lines[j].replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim())); j++; }
        if (rows.length) {
          const headers = ln.split('|').map(s => s.trim()).filter(Boolean);
          out.push(tableHtml(headers, rows)); i = j; continue;
        }
      }
      if ((m = ln.match(/^(#{1,5}) (.+)$/))) { const a = alignOf(m[2]); out.push(`<h${m[1].length}${alAttr(a.al)}>${inlineHtml(a.t)}</h${m[1].length}>`); i++; continue; }
      if (/^---$/.test(ln)) { out.push('<hr>'); i++; continue; }
      if ((m = ln.match(/^> (.+)$/))) { const a = alignOf(m[1]); out.push(`<blockquote${alAttr(a.al)}>${inlineHtml(a.t)}</blockquote>`); i++; continue; }
      if (/^- (.+)$/.test(ln)) {
        const items = [];
        let j = i;
        while (j < lines.length) {
          if (/^- (.+)$/.test(lines[j])) { items.push(lines[j].slice(2)); j++; continue; }
          // बुँदा बीचका खाली लाइन — त्यसपछि फेरि बुँदा आउँछ भने एउटै सूची (renderMd ले पनि उस्तै जोड्छ)
          let k = j; while (k < lines.length && lines[k].trim() === '') k++;
          if (k > j && k < lines.length && /^- (.+)$/.test(lines[k])) { j = k; continue; }
          break;
        }
        out.push('<ul>' + items.map(t => { const a = alignOf(t); return `<li${alAttr(a.al)}>${inlineHtml(a.t)}</li>`; }).join('') + '</ul>');
        i = j; continue;
      }
      out.push(lineHtml(ln)); i++;
    }
    // अन्तिममा कर्सर राख्न मिल्ने खाली लाइन
    const last = out[out.length - 1] || '';
    if (!out.length || !/^<div>/.test(last) || /rte-box|rte-tablewrap/.test(last)) out.push('<div><br></div>');
    return out.join('');
  }

  /* ═════════ editor HTML → markdown ═════════ */
  const isBlockEl = n => n.nodeType === 1 && (BLOCK_TAGS.has(n.tagName) || n.classList.contains('rte-tablewrap'));

  /* **  राम ** → ' **राम** ' (खाली ठाउँ चिन्हभन्दा बाहिर) */
  const mark = (open, close, t) => { const m = t.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[2] ? m[1] + open + m[2] + close + m[3] : t; };

  /* पाठ भित्रका * == {{ }} लाई ढाँचाको चिन्ह नमानियोस् भनेर \ लगाउने (साइटले \* लाई * देखाउँछ) */
  const escMd = s => s.replace(/\\(?=[\\*={}:_~])/g, '\\\\').replace(/\*/g, '\\*').replace(/_{2,}/g, m => '\\_'.repeat(m.length)).replace(/~{2,}/g, m => '\\~'.repeat(m.length)).replace(/:{3,}/g, m => '\\:'.repeat(m.length))
    .replace(/={2,}/g, m => '\\='.repeat(m.length)).replace(/\{{2,}/g, m => '\\{'.repeat(m.length)).replace(/\}{2,}/g, m => '\\}'.repeat(m.length));

  function inlineMd(nodes, allowNl, ctx) {
    ctx = ctx || { b: false, i: false, u: false, s: false };
    let s = '';
    for (const n of nodes) {
      if (n.nodeType === 3) { s += escMd(n.nodeValue.replace(/[\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/\n/g, allowNl ? '\n' : ' ')); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      const kids = () => inlineMd(n.childNodes, allowNl, ctx);
      if (tag === 'BR') { s += allowNl ? '\n' : ' '; continue; }
      if (tag === 'IMG') {
        const src = n.getAttribute('data-src') || n.getAttribute('src') || '';
        if (/^data:/i.test(src)) continue;
        s += `![${n.getAttribute('data-alt') || ''}](${src})`; continue;
      }
      if (tag === 'B' || tag === 'STRONG') {
        if (ctx.b) { s += kids(); continue; }
        ctx.b = true; const t = kids(); ctx.b = false; s += mark('**', '**', t); continue;
      }
      if (tag === 'I' || tag === 'EM') {
        if (ctx.i) { s += kids(); continue; }
        ctx.i = true; const t = kids(); ctx.i = false; s += mark('*', '*', t); continue;
      }
      if (tag === 'U') {
        if (ctx.u) { s += kids(); continue; }
        ctx.u = true; const t = kids(); ctx.u = false; s += mark('__', '__', t); continue;
      }
      if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') {
        if (ctx.s) { s += kids(); continue; }
        ctx.s = true; const t = kids(); ctx.s = false; s += mark('~~', '~~', t); continue;
      }
      if (n.classList.contains('rte-hl')) {
        const t = kids(); const c = n.getAttribute('data-c');
        s += mark('==' + (c ? c + ':' : ''), '==', t); continue;
      }
      if (n.classList.contains('rte-fc')) {
        const t = kids(); const c = n.getAttribute('data-c');
        s += c ? mark('{{' + c + ':', '}}', t) : t; continue;
      }
      s += kids();
    }
    return s;
  }

  function lineOut(s) {
    s = s.replace(/\n+$/, '');
    // सामान्य लाइनले शीर्षक/सूची/बक्स जस्तो सुरु हुन्छ भने (लाइन-ब्रेक पछि पनि) अदृश्य चिन्ह राखेर अक्षरकै रूपमा सुरक्षित गर्ने
    return s.replace(/(^|\n)(?=(#{1,5} |> |- |---(?=\n|$)|:::|\|))/g, '$1\u200b');
  }

  function tableMd(table, lines) {
    const cellMd = c => inlineMd(c.childNodes, false).replace(/\|/g, '｜').trim();
    const trs = [...table.querySelectorAll('tr')];
    if (trs.length < 2) return;
    const head = [...trs[0].children].map(c => cellMd(c) || 'कलम');
    lines.push('| ' + head.join(' | ') + ' |');
    lines.push('|' + head.map(() => '---').join('|') + '|');
    trs.slice(1).forEach(tr => lines.push('| ' + [...tr.children].map(cellMd).join(' | ') + ' |'));
  }

  function blockMd(n, lines) {
    const tag = n.tagName;
    if (n.classList.contains('rte-box')) {
      const type = n.getAttribute('data-type') || 'note';
      const label = (n.getAttribute('data-label') || '').trim();
      lines.push(`:::${type}${label ? ':' + label : ''}`);
      const body = n.querySelector('.rte-box-body');
      const inner = [];
      if (body) for (const ch of body.childNodes) {
        if (ch.nodeType === 3) { const t = inlineMd([ch], false); if (t.trim()) inner.push(t); }
        else if (ch.nodeType === 1) inner.push(inlineMd(ch.tagName === 'DIV' || ch.tagName === 'P' ? ch.childNodes : [ch], true).replace(/\n+$/, '').replace(/\n/g, ' '));
      }
      while (inner.length && inner[inner.length - 1] === '') inner.pop();
      inner.forEach(t => lines.push(t.replace(/^:::/, '\u200b:::')));
      lines.push(':::');
      return;
    }
    if (n.classList.contains('rte-tablewrap')) { const t = n.querySelector('table'); if (t) tableMd(t, lines); return; }
    if (tag === 'TABLE') { tableMd(n, lines); return; }
    if (tag === 'HR') { lines.push('---'); return; }
    if (/^H[1-5]$/.test(tag)) { const t = inlineMd(n.childNodes, false).trim(); lines.push(t ? '#'.repeat(+tag[1]) + ' ' + alPrefix(n) + t : ''); return; }
    if (tag === 'BLOCKQUOTE') { const t = inlineMd(n.childNodes, false).trim(); lines.push(t ? '> ' + alPrefix(n) + t : ''); return; }
    if (tag === 'UL' || tag === 'OL') {
      n.querySelectorAll(':scope > li').forEach(li => { const t = inlineMd(li.childNodes, false).trim(); if (t) lines.push('- ' + alPrefix(li) + t); });
      return;
    }
    if (tag === 'LI') { const t = inlineMd(n.childNodes, false).trim(); if (t) lines.push('- ' + alPrefix(n) + t); return; }
    // सामान्य लाइन (DIV/P) — भित्र अर्को block भए पुनः खोल्ने
    if ([...n.children].some(isBlockEl)) { childrenMd(n, lines); return; }
    const pre = alPrefix(n);
    if (pre) {
      const raw = inlineMd(n.childNodes, true).replace(/\n+$/, '');
      lines.push(raw.split('\n').map(l => l.trim() ? pre + l : l).join('\n'));
      return;
    }
    lines.push(lineOut(inlineMd(n.childNodes, true)));
  }

  function childrenMd(root, lines) {
    let pending = [];
    const flush = () => { if (pending.length) { lines.push(lineOut(inlineMd(pending, true))); pending = []; } };
    for (const n of root.childNodes) {
      if (n.nodeType === 1 && (isBlockEl(n))) { flush(); blockMd(n, lines); }
      else pending.push(n);
    }
    flush();
  }

  function htmlToMd(root) {
    const lines = [];
    childrenMd(root, lines);
    return lines.join('\n').replace(/\n+$/, '');
  }


  /* ═════════ बटनको "चालु/बन्द" अवस्था — कर्सर/चुनिएको अक्षरमा के लागू छ देखाउने ═════════ */
  function selectedTexts(range) {
    const out = [];
    const root = range.commonAncestorContainer;
    if (root.nodeType === 3) { if (range.toString().trim()) out.push(root); return out; }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const n = tw.currentNode;
      if (!range.intersectsNode(n)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      if (n === range.startContainer) r.setStart(n, range.startOffset);
      if (n === range.endContainer) r.setEnd(n, range.endOffset);
      if (r.toString().trim()) out.push(n);
    }
    return out;
  }
  function computeState(inst) {
    const sel = getSelection();
    if (!sel.rangeCount || !inst.el.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    const up = (n, q) => { const e = n && n.nodeType === 3 ? n.parentElement : n; const m = e && e.closest ? e.closest(q) : null; return m && inst.el.contains(m) ? m : null; };
    const collapsed = range.collapsed;
    const texts = collapsed ? [] : selectedTexts(range);
    if (!collapsed && !texts.length) return null;
    const find = q => collapsed ? up(range.startContainer, q) : (texts.every(n => up(n, q)) ? up(texts[0], q) : null);
    let bold = !!find('b,strong'), italic = !!find('i,em');
    if (collapsed) {      // कर्सर मात्र: अर्को अक्षर बोल्ड/छड्के हुन्छ कि हुँदैन — browser को "typing style" नै सही हो
      const inHead = up(range.startContainer, 'h1,h2,h3,h4,h5');
      try { if (!inHead) { bold = document.queryCommandState('bold'); italic = document.queryCommandState('italic'); } } catch (e) {}
    }
    let uu = !!find('u'), ss = !!find('s,strike,del');
    if (collapsed) { try { uu = document.queryCommandState('underline'); ss = document.queryCommandState('strikeThrough'); } catch (e) {} }
    const blk = closestBlock(inst, collapsed ? range.startContainer : (texts[0] || range.startContainer));
    const al = (blk && blk.getAttribute('data-al')) || 'left';
    const hb = find('h1,h2,h3,h4,h5');
    const hlAny = find('.rte-hl');
    return {
      bold, italic,
      hl: !!(hlAny && !hlAny.getAttribute('data-c')),
      hlc: hlAny && hlAny.getAttribute('data-c') ? hlAny.getAttribute('data-c') : null,
      fc: (find('.rte-fc') || null) && find('.rte-fc').getAttribute('data-c'),
      h1: !!find('h1'), h2: !!find('h2'), ul: !!find('li'),
      u: uu, s: ss, hd: hb ? +hb.tagName[1] : 0,
      alL: al === 'left', alC: al === 'center', alR: al === 'right', alJ: al === 'justify'
    };
  }
  function paintState(inst, st) {
    if (!st) return;
    document.querySelectorAll('[data-ta="' + inst.id + '"][data-cmd]').forEach(b => {
      const k = b.getAttribute('data-cmd');
      if (k === 'code') return;
      if (b.tagName === 'SELECT') { b.value = String(st[k] || 0); return; }
      const v = st[k];
      const on = !!v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (k === 'hlc' || k === 'fc') { const c = on ? colorOf(v) : null; if (c) b.style.setProperty('--dot', c); else b.style.removeProperty('--dot'); }
    });
  }

  /* ═════════ instance ═════════ */
  const protoValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

  function attach(id) {
    if (INSTS.has(id)) return INSTS.get(id);
    const ta = document.getElementById(id);
    if (!ta || ta.tagName !== 'TEXTAREA' || !document.createRange) return null;
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) {}

    const el = document.createElement('div');
    el.className = 'rte ch-read-content ' + (ta.className || '').replace(/f-textarea|fs-editor-ta/g, '').trim();
    if (ta.classList.contains('fs-editor-ta')) el.classList.add('rte-fs');
    el.id = id + '__rte';
    el.contentEditable = 'true';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('data-ph', ta.getAttribute('placeholder') || '');
    const rows = parseInt(ta.getAttribute('rows') || '0', 10);
    if (rows) el.style.minHeight = Math.max(140, rows * 30) + 'px';
    if (ta.style.minHeight) el.style.minHeight = ta.style.minHeight;
    ta.insertAdjacentElement('afterend', el);
    ta.style.display = 'none';

    const inst = {
      id, ta, el, range: null, dirty: false, timer: 0, codeMode: false, hist: [], hi: -1,
      load(md) { el.innerHTML = mdToHtml(md); this.dirty = false; this.hist = []; this.hi = -1; this.snap(); },
      flush() {
        if (this.codeMode) return;
        clearTimeout(this.timer); this.dirty = false;
        protoValue.set.call(ta, htmlToMd(el));
        this.snap();
      },
      /* हाम्रै Undo/Redo (हाम्रा बोल्ड/हाइलाइट/बक्स जस्ता कामले browser को undo बिगार्ने भएकाले) */
      snap() {
        const html = el.innerHTML, cur = this.hist[this.hi];
        if (cur && cur.html === html) { cur.sel = selPath(el); return; }
        this.hist.length = this.hi + 1;
        this.hist.push({ html, sel: selPath(el) });
        if (this.hist.length > 80) this.hist.shift();
        this.hi = this.hist.length - 1;
      },
      goto(i) {
        const s = this.hist[i]; if (!s) return;
        this.hi = i; el.innerHTML = s.html; this.dirty = false;
        protoValue.set.call(ta, htmlToMd(el));
        el.focus({ preventScroll: true }); restoreSel(el, s.sel) || placeCaret(el, true);
      },
      markDirty() { this.dirty = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 160); },
      syncFont() { el.style.fontFamily = ta.style.fontFamily || (typeof fontCssFor === 'function' ? fontCssFor(ta.dataset.fontKey || 'siddhanta') : ''); },
      focus(end) {
        el.focus({ preventScroll: true });
        if (end !== false) placeCaret(el, true);
      },
      restore() {
        const sel = getSelection();
        let r = null;
        if (sel.rangeCount && el.contains(sel.anchorNode) && el.contains(sel.focusNode)) r = sel.getRangeAt(0).cloneRange();   // जीवित selection
        else if (this.range && el.contains(this.range.startContainer) && el.contains(this.range.endContainer)) r = this.range;   // सुरक्षित गरिएको
        el.focus({ preventScroll: true });                       // focus() ले selection सारिदिन सक्छ — त्यसैले पछि फेरि राख्ने
        if (r) { sel.removeAllRanges(); sel.addRange(r); } else placeCaret(el, true);
      },
      /* ── toolbar क्रियाहरू ── */
      bold() { this.restore(); document.execCommand('bold'); this.flush(); this.updateState(); },
      italic() { this.restore(); document.execCommand('italic'); this.flush(); this.updateState(); },
      strike() { this.restore(); document.execCommand('strikeThrough'); cleanStyles(el); this.flush(); this.updateState(); },
      underline() { this.restore(); document.execCommand('underline'); cleanStyles(el); this.flush(); this.updateState(); },
      heading(n) { this.restore(); setBlock(this, n ? 'h' + n : 'div', '', true); this.updateState(); },
      align(al) { this.restore(); if (blockedHere(this)) return; alignBlocks(this, al); cleanStyles(el); this.flush(); this.updateState(); },
      undo() { if (this.dirty) this.flush(); if (this.hi > 0) this.goto(this.hi - 1); },
      redo() { if (this.hi < this.hist.length - 1) this.goto(this.hi + 1); },
      mark(kind, color) { this.restore(); applyMark(this, kind, color); },
      clearMarks() { this.restore(); clearMarks(this); },
      block(tag) { this.restore(); setBlock(this, tag); this.updateState(); },
      list() { this.restore(); if (blockedHere(this)) return; document.execCommand('insertUnorderedList'); cleanStyles(el); this.flush(); this.updateState(); },
      hr() { this.restore(); if (blockedHere(this)) return; insertBlockAtCaret(this, '<hr><div><br></div>'); this.commit(); },
      text(t) { this.restore(); document.execCommand('insertText', false, t); this.flush(); },
      html(h) { this.restore(); document.execCommand('insertHTML', false, h); this.flush(); },
      commit() { cleanStyles(el); this.flush(); this.updateState(); },
      updateState() { paintState(this, computeState(this)); },
      box(type) { this.restore(); insertBox(this, type); },
      table() { this.restore(); if (blockedHere(this)) return; insertBlockAtCaret(this, tableHtml(['कलम १', 'कलम २'], [['मान १', 'मान २']]) + '<div><br></div>'); this.commit(); },
      image(src, alt, dataSrc) { this.restore(); insertBlockAtCaret(this, '<div>' + imgHtmlRaw(alt || '', dataSrc || src, src) + '</div>'); this.commit(); },
      toggleCode() {
        this.codeMode = !this.codeMode;
        if (this.codeMode) {
          protoValue.set.call(ta, htmlToMd(el));
          el.style.display = 'none'; ta.style.display = ''; ta.classList.add('rte-code');
          ta.focus();
        } else {
          this.load(protoValue.get.call(ta));
          ta.style.display = 'none'; ta.classList.remove('rte-code'); el.style.display = '';
          this.focus(false);
        }
        document.querySelectorAll('.tb-btn-code').forEach(b => {
          b.classList.toggle('on', this.codeMode);
          b.setAttribute('aria-pressed', this.codeMode ? 'true' : 'false');
          const lb = b.querySelector('.dxtb-lbl'); if (lb) lb.textContent = this.codeMode ? 'Hide markup' : 'Show markup';
        });
        return this.codeMode;
      }
    };

    /* textarea.value ← → editor : सबै पुरानो कोडले .value पढ्न/लेख्न मिलिरहोस् */
    Object.defineProperty(ta, 'value', {
      configurable: true,
      get() { if (inst.dirty && !inst.codeMode) inst.flush(); return protoValue.get.call(ta); },
      set(v) { protoValue.set.call(ta, v); if (!inst.codeMode) inst.load(v); }
    });

    el.addEventListener('input', () => inst.markDirty());
    el.addEventListener('blur', () => { cleanStyles(el); inst.flush(); });
    el.addEventListener('keydown', e => onKey(inst, e));
    el.addEventListener('beforeinput', e => {
      if (e.inputType === 'historyUndo') { e.preventDefault(); inst.undo(); }
      else if (e.inputType === 'historyRedo') { e.preventDefault(); inst.redo(); }
    });
    el.addEventListener('paste', e => onPaste(inst, e));
    el.addEventListener('copy', e => copyCut(inst, e, false));
    el.addEventListener('cut', e => copyCut(inst, e, true));
    el.addEventListener('drop', e => e.preventDefault());
    el.addEventListener('click', e => onClick(inst, e));
    document.addEventListener('selectionchange', () => {
      const sel = getSelection();
      if (sel && sel.rangeCount && el.contains(sel.anchorNode) && el.contains(sel.focusNode)) {
        inst.range = sel.getRangeAt(0).cloneRange();
        if (!inst._raf) inst._raf = requestAnimationFrame(() => { inst._raf = 0; inst.updateState(); });
      }
    });
    new MutationObserver(() => inst.syncFont()).observe(ta, { attributes: true, attributeFilter: ['style', 'data-font-key'] });

    inst.load(protoValue.get.call(ta));
    inst.syncFont();
    INSTS.set(id, inst);
    return inst;
  }

  function imgHtmlRaw(alt, dataSrc, shownSrc) {
    // alt = "|50|left" जस्तो; dataSrc = markdown मा जाने (pending:ID वा path/URL); shownSrc = editor मा देखिने
    const h = imgHtml(alt, dataSrc);
    return shownSrc && shownSrc !== dataSrc ? h.replace(/ src="[^"]*"/, ` src="${escAttr(shownSrc)}"`) : h;
  }

  function placeCaret(el, atEnd) {
    const sel = getSelection(); const r = document.createRange();
    let target = el.lastElementChild;
    if (!target) { r.selectNodeContents(el); } else {
      while (target.lastElementChild && !/^(IMG|BR|HR|TABLE)$/.test(target.lastElementChild.tagName) && !target.classList.contains('rte-box-head')) target = target.lastElementChild;
      r.selectNodeContents(target);
    }
    r.collapse(!atEnd ? true : false);
    sel.removeAllRanges(); sel.addRange(r);
  }

  /* ═════════ मदतगार ═════════ */
  function cleanStyles(root) {
    // browser ले थपेका बेकारका style हटाउने (हाम्रा rte-hl/rte-fc/img/बक्स बाहेक)।
    // नोट: node सार्ने/हटाउने काम गर्दैनौं (selection बिग्रन्छ) — attribute मात्र हटाउँछौं।
    root.querySelectorAll('font').forEach(f => { f.removeAttribute('face'); f.removeAttribute('size'); f.removeAttribute('color'); });
    root.querySelectorAll('span, h1,h2,h3,h4,h5,blockquote,ul,ol,li,div,p,b,i,u,s,strike,strong,em').forEach(x => {
      if (x.classList.contains('rte-hl') || x.classList.contains('rte-fc') || x.classList.contains('rte-box') ||
          x.classList.contains('rte-box-head') || x.closest('.rte-box-head')) return;
      if (x.hasAttribute('style')) {
        const al = x.getAttribute('data-al');
        if (al && al !== 'left') x.setAttribute('style', 'text-align:' + al); else x.removeAttribute('style');
      }
      if (x.hasAttribute('align')) x.removeAttribute('align');
    });
  }

  const lineBlocksSel = ':scope > div:not(.rte-box):not(.rte-tablewrap), :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > blockquote, :scope > ul > li, .rte-box-body > div, td, th';
  const closestBlock = (inst, node) => {
    let n = node && node.nodeType === 3 ? node.parentElement : node;
    while (n && n !== inst.el) { if (/^(H1|H2|H3|H4|H5|BLOCKQUOTE|LI|TD|TH)$/.test(n.tagName) || (n.tagName === 'DIV' && n.parentElement && (n.parentElement === inst.el || n.parentElement.classList.contains('rte-box-body')))) return n; n = n.parentElement; }
    return null;
  };
  function blockedHere(inst) {
    const sel = getSelection(); const n = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
    if (n && n.closest && (n.closest('.rte-box-body') || n.closest('td,th'))) { toast('⚠️ बक्स वा तालिका भित्र यो काम गर्न मिल्दैन'); return true; }
    return false;
  }

  function segments(inst, range) {
    const segs = [];
    inst.el.querySelectorAll(lineBlocksSel).forEach(b => {
      if (!range.intersectsNode(b)) return;
      const r = document.createRange(); r.selectNodeContents(b);
      if (b.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
      if (b.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
      if (!r.collapsed) segs.push(r);
    });
    if (!segs.length && !range.collapsed) segs.push(range.cloneRange());
    return segs;
  }

  const MARK = { hl: '.rte-hl', fc: '.rte-fc' };
  function markSpan(kind, color, inner) {
    const c = color ? colorOf(color) : null;
    if (kind === 'hl') {
      return c ? `<span class="highlight rte-hl" data-c="${escAttr(color)}" style="background:${c}33;color:${c};box-shadow:inset 0 -2px 0 ${c}">${inner}</span>`
               : `<span class="highlight rte-hl">${inner}</span>`;
    }
    return `<span class="rte-fc" data-c="${escAttr(color)}" style="color:${c || 'inherit'};font-weight:600">${inner}</span>`;
  }

  function makeSpan(kind, color) {
    const tpl = document.createElement('template');
    tpl.innerHTML = markSpan(kind, color, '');
    return tpl.content.firstChild;
  }
  function recolor(sp, kind, color) {
    const nw = makeSpan(kind, color);
    if (color) { sp.setAttribute('data-c', color); } else sp.removeAttribute('data-c');
    sp.setAttribute('style', nw.getAttribute('style') || ''); if (!nw.getAttribute('style')) sp.removeAttribute('style');
  }

  /* चुनिएको अक्षरमा हाइलाइट/रंग (हाम्रै DOM काम — बोल्ड/छड्के सँग मिलाएर पनि चल्छ) */
  function applyMark(inst, kind, color) {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!inst.el.contains(range.commonAncestorContainer)) return;
    if (range.collapsed) {
      const sp = makeSpan(kind, color); sp.textContent = 'यहाँ लेख्नुस्';
      range.insertNode(sp);
      const r = document.createRange(); r.selectNodeContents(sp); sel.removeAllRanges(); sel.addRange(r);
      inst.commit(); return;
    }
    const segs = segments(inst, range);
    const ancOf = r => { const a = r.commonAncestorContainer; const e = a.nodeType === 3 ? a.parentElement : a; const sp = e && e.closest ? e.closest(MARK[kind]) : null; return sp && inst.el.contains(sp) ? sp : null; };
    let first = null, last = null;
    if (segs.length && segs.every(ancOf)) {
      const spans = [...new Set(segs.map(ancOf))];
      const same = spans.every(sp => (sp.getAttribute('data-c') || '') === (color || ''));
      spans.forEach(sp => { if (same) sp.replaceWith(...sp.childNodes); else { recolor(sp, kind, color); first = first || sp; last = sp; } });
    } else {
      for (const r of segs.slice().reverse()) {
        const frag = r.extractContents();
        frag.querySelectorAll(MARK[kind]).forEach(x => x.replaceWith(...x.childNodes));
        const sp = makeSpan(kind, color); sp.appendChild(frag); r.insertNode(sp);
        last = last || sp; first = sp;
      }
    }
    inst.el.normalize();
    if (first && last) { const r = document.createRange(); r.setStartBefore(first); r.setEndAfter(last); sel.removeAllRanges(); sel.addRange(r); }
    inst.commit();
  }

  function clearMarks(inst) {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !inst.el.contains(range.commonAncestorContainer)) return;
    document.execCommand('removeFormat');                       // बोल्ड/छड्के
    const r2 = sel.rangeCount ? sel.getRangeAt(0) : range;
    inst.el.querySelectorAll('.rte-hl,.rte-fc').forEach(sp => { if (r2.intersectsNode(sp)) sp.replaceWith(...sp.childNodes); });
    inst.commit();
  }

  function setBlock(inst, tag, placeholder, force) {
    if (blockedHere(inst)) return;
    const sel = getSelection(); const blk = closestBlock(inst, sel.anchorNode);
    const cur = blk ? blk.tagName.toLowerCase() : 'div';
    const target = (!force && cur === tag) ? 'div' : tag;
    const keepAl = blk && blk.getAttribute('data-al');
    const wasEmpty = blk && !blk.textContent.replace(/[\u200b\s]/g, '');
    document.execCommand('formatBlock', false, target);
    if (keepAl) { const b3 = closestBlock(inst, getSelection().anchorNode); if (b3 && !b3.getAttribute('data-al')) { b3.setAttribute('data-al', keepAl); b3.style.textAlign = keepAl; } }
    cleanStyles(inst.el);
    if (target !== 'div' && wasEmpty) {
      document.execCommand('insertText', false, placeholder || (tag === 'blockquote' ? 'उद्धरण' : 'शीर्षक'));
      const s2 = getSelection(); if (s2.rangeCount) { const b2 = closestBlock(inst, s2.anchorNode); if (b2) { const r = document.createRange(); r.selectNodeContents(b2); s2.removeAllRanges(); s2.addRange(r); } }
    }
    inst.flush();
  }

  /* पङ्क्ति मिलान — चुनिएका सबै लाइन/शीर्षक/बुँदामा */
  function alignBlocks(inst, al) {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const blocks = new Set();
    inst.el.querySelectorAll(':scope > div:not(.rte-box):not(.rte-tablewrap), :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > blockquote, :scope > ul > li')
      .forEach(b => { if (range.intersectsNode(b)) blocks.add(b); });
    if (!blocks.size) { const b = closestBlock(inst, range.startContainer); if (b) blocks.add(b); }
    blocks.forEach(b => {
      if (al === 'left') { b.removeAttribute('data-al'); b.removeAttribute('style'); }
      else { b.setAttribute('data-al', al); b.style.textAlign = al; }
    });
  }

  /* ── selection लाई DOM-path को रूपमा सुरक्षित गर्ने (हाम्रो Undo का लागि) ── */
  function pathOf(node, root) { const p = []; while (node && node !== root) { const par = node.parentNode; if (!par) return null; p.unshift(Array.prototype.indexOf.call(par.childNodes, node)); node = par; } return p; }
  function nodeAt(root, path) { let n = root; for (const i of path) { n = n.childNodes[i]; if (!n) return null; } return n; }
  function selPath(root) {
    const sel = getSelection(); if (!sel.rangeCount || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
    const r = sel.getRangeAt(0); const s = pathOf(r.startContainer, root), e = pathOf(r.endContainer, root);
    return s && e ? { s, so: r.startOffset, e, eo: r.endOffset } : null;
  }
  function restoreSel(root, sp) {
    if (!sp) return false;
    const sn = nodeAt(root, sp.s), en = nodeAt(root, sp.e); if (!sn || !en) return false;
    try {
      const r = document.createRange();
      r.setStart(sn, Math.min(sp.so, sn.nodeType === 3 ? sn.nodeValue.length : sn.childNodes.length));
      r.setEnd(en, Math.min(sp.eo, en.nodeType === 3 ? en.nodeValue.length : en.childNodes.length));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return true;
    } catch (e) { return false; }
  }

  /* block (बक्स/तालिका/रेखा/फोटो) लाई कर्सरको ठाउँमा राख्ने:
     लाइनको बीचमा भए लाइन दुई टुक्रा गरेर बीचमा, सुरुमा भए अघि, अन्त्यमा भए पछि, खाली लाइन भए त्यसैको ठाउँमा */
  function insertBlockAtCaret(inst, html) {
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const nodes = [...tpl.content.childNodes];
    const sel = getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    let top = range ? range.startContainer : null;
    if (top && top.nodeType === 3) top = top.parentNode;
    while (top && top !== inst.el && top.parentNode !== inst.el) top = top.parentNode;
    if (!top || top === inst.el) { inst.el.append(...nodes); return; }
    const isLine = top.tagName === 'DIV' && ![...top.children].some(isBlockEl);
    if (!isLine) { top.after(...nodes); return; }
    const hasContent = r => r.toString().replace(/[\u200b\s]/g, '') !== '' || r.cloneContents().querySelector('img');
    const pre = document.createRange(); pre.selectNodeContents(top); pre.setEnd(range.startContainer, range.startOffset);
    const post = document.createRange(); post.selectNodeContents(top); post.setStart(range.endContainer, range.endOffset);
    const before = hasContent(pre), after = hasContent(post);
    if (!before && !after) top.replaceWith(...nodes);
    else if (!before) top.before(...nodes);
    else if (!after) top.after(...nodes);
    else { const tail = document.createElement('div'); tail.appendChild(post.extractContents()); top.after(...nodes, tail); }
  }

  function insertBox(inst, type) {
    if (blockedHere(inst)) return;
    insertBlockAtCaret(inst, boxHtml(type, '', ['यहाँ लेख्नुस्...']).replace('class="content-box rte-box"', 'class="content-box rte-box" data-fresh="1"') + '<div><br></div>');
    const b = inst.el.querySelector('.rte-box[data-fresh="1"]');
    if (b) {
      b.removeAttribute('data-fresh');
      const body = b.querySelector('.rte-box-body > div');
      if (body) { const r = document.createRange(); r.selectNodeContents(body); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
    inst.flush();
  }

  /* ═════════ कार्यक्रम (events) ═════════ */
  function onKey(inst, e) {
    if (e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); inst.undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); inst.redo(); return; }
    }
    const sel = getSelection();
    const n = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
    if (e.key === 'Enter' && !e.shiftKey && n && n.closest) {
      if (n.closest('td,th')) { e.preventDefault(); return; }                      // तालिकाको कक्षमा नयाँ लाइन छैन
      const hb = n.closest('h1,h2,h3,h4,h5,blockquote');
      if (hb && inst.el.contains(hb)) {                                              // शीर्षक पछि सामान्य लाइन आओस्
        e.preventDefault();
        document.execCommand('insertParagraph');
        const b = closestBlock(inst, getSelection().anchorNode);
        if (b && /^(H1|H2|H3|H4|H5|BLOCKQUOTE)$/.test(b.tagName)) document.execCommand('formatBlock', false, 'div');
        cleanStyles(inst.el); inst.markDirty();
      }
    }
    if (e.key === 'Tab' && n && n.closest && n.closest('td,th')) {                  // तालिकामा Tab = अर्को कक्ष
      e.preventDefault();
      const cell = n.closest('td,th'); const cells = [...cell.closest('table').querySelectorAll('th,td')];
      let idx = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
      if (idx >= cells.length) {                                                     // अन्तिम कक्षमा Tab = नयाँ पङ्क्ति
        const tr = cell.closest('tr').cloneNode(true); tr.querySelectorAll('th,td').forEach(c => { c.innerHTML = '<br>'; });
        const tb = cell.closest('table').tBodies[0]; tb.appendChild(tr);
        idx = cells.length;
        const nc = [...cell.closest('table').querySelectorAll('th,td')][idx];
        if (nc) { const r = document.createRange(); r.selectNodeContents(nc); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
        inst.markDirty(); return;
      }
      if (idx >= 0) { const r = document.createRange(); r.selectNodeContents(cells[idx]); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    }
  }

  /* clipboard मा text/plain नभई HTML मात्र भए त्यसबाट पाठ निकाल्ने */
  function htmlToPlain(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,head').forEach(x => x.remove());
    const out = [];
    const walk = n => {
      if (n.nodeType === 3) { out.push(n.nodeValue.replace(/\s+/g, ' ')); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { out.push('\n'); return; }
      const blk = /^(P|DIV|H[1-6]|LI|TR|BLOCKQUOTE|UL|OL|TABLE|SECTION|ARTICLE)$/.test(n.tagName);
      if (blk && out.length && !/\n$/.test(out[out.length - 1])) out.push('\n');
      n.childNodes.forEach(walk);
      if (blk) out.push('\n');
    };
    walk(doc.body);
    return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  const isPlainLine = d => d && d.tagName === 'DIV' && !d.classList.contains('rte-box') && !d.classList.contains('rte-tablewrap') && ![...d.children].some(isBlockEl);

  function pasteText(inst, raw, asMd) {
    const text = String(raw).replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
    if (!text) return;
    const sel = getSelection();
    if (!sel.rangeCount || !inst.el.contains(sel.anchorNode)) { inst.focus(); }
    let range = sel.getRangeAt(0);
    if (!range.collapsed) { range.deleteContents(); range = sel.getRangeAt(0); }
    const ctxEl = (range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer);
    const inCell = ctxEl && ctxEl.closest && ctxEl.closest('li,td,th,h1,h2,h3,h4,h5,blockquote');
    const multi = /\n/.test(text) || (asMd && /^(#{1,5} |> |- |:::|\|)/.test(text));

    const putInline = html => {                                 // एउटै लाइन/सानो ठाउँ — कर्सरको ठाउँमा सिधै
      const tpl = document.createElement('template'); tpl.innerHTML = html;
      const last = tpl.content.lastChild;
      range.insertNode(tpl.content);
      if (last) { const r = document.createRange(); r.setStartAfter(last); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    };
    const ih = asMd ? inlineHtml : esc;                            // asMd = हाम्रै एडिटरबाट copy गरेको (ढाँचासहित)
    if (!multi) { putInline(ih(text)); }
    else if (inCell) { putInline(ih(text.replace(/\s*\n+\s*/g, ' '))); }
    else {
      // लाइन कर्सरमा दुई टुक्रा: [अघि + पेस्टको पहिलो लाइन] ... [पेस्टको अन्तिम लाइन + पछि]
      let line = range.startContainer; if (line.nodeType === 3) line = line.parentNode;
      while (line && line !== inst.el && !(isPlainLine(line) && (line.parentNode === inst.el || line.parentNode.classList.contains('rte-box-body')))) line = line.parentNode;
      const tpl = document.createElement('template');
      tpl.innerHTML = (asMd ? mdToHtml(text) : text.split('\n').map(l => '<div>' + (esc(l) || '<br>') + '</div>').join('')).replace(/<div><br><\/div>$/, '');
      const nodes = [...tpl.content.childNodes];
      if (!line || line === inst.el) { inst.el.append(...nodes); }
      else {
        // खाली लाइनको <br> चिह्न हटाउने (नत्र पेस्टको अघि खाली लाइन बन्छ)
        if (line.children.length === 1 && line.firstElementChild.tagName === 'BR' && !line.textContent) { line.innerHTML = ''; range = document.createRange(); range.setStart(line, 0); range.collapse(true); }
        const tailR = document.createRange(); tailR.setStart(range.startContainer, range.startOffset); tailR.setEnd(line, line.childNodes.length);
        const tail = tailR.extractContents();
        const first = nodes[0];
        if (isPlainLine(first)) {
          const kids = [...first.childNodes];
          if (!(kids.length === 1 && kids[0].nodeName === 'BR')) line.append(...kids);
          nodes.shift();
        }
        const lastN = nodes[nodes.length - 1];
        const marker = document.createTextNode('');
        let caretHost;
        if (!nodes.length) { line.append(marker); line.append(tail); caretHost = line; }
        else if (isPlainLine(lastN)) {
          [...lastN.childNodes].filter(c => c.nodeName === 'BR' && lastN.childNodes.length === 1).forEach(c => c.remove());
          lastN.append(marker); lastN.append(tail); caretHost = lastN; line.after(...nodes);
        } else {
          const tailDiv = document.createElement('div'); tailDiv.append(marker); tailDiv.append(tail); nodes.push(tailDiv); caretHost = tailDiv; line.after(...nodes);
        }
        const idx = Array.prototype.indexOf.call(marker.parentNode.childNodes, marker);
        const r = document.createRange(); r.setStart(marker.parentNode, idx); r.collapse(true);
        marker.remove();
        sel.removeAllRanges(); sel.addRange(r);
        // खाली बाँकी रहेका लाइनमा <br> राख्ने
        [line, caretHost].forEach(d => { if (d && d.nodeType === 1 && !d.textContent && !d.querySelector('img,br')) d.innerHTML = '<br>'; });
      }
    }
    inst.el.normalize();
    inst.commit();
    const s2 = getSelection(); if (s2.rangeCount) { const n = s2.anchorNode && (s2.anchorNode.nodeType === 3 ? s2.anchorNode.parentElement : s2.anchorNode); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' }); }
  }

  /* एडिटर भित्र copy/cut गर्दा ढाँचा (markdown) पनि सँगै राख्ने — फेरि पेस्ट गर्दा बोल्ड/हाइलाइट फर्किन्छ */
  function copyCut(inst, e, cut) {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !inst.el.contains(sel.anchorNode) || !e.clipboardData) return;
    const range = sel.getRangeAt(0);
    const d = document.createElement('div'); d.appendChild(range.cloneContents());
    e.clipboardData.setData('text/plain', sel.toString());
    e.clipboardData.setData('application/x-rte-md', htmlToMd(d));
    e.preventDefault();
    if (cut) { range.deleteContents(); inst.el.normalize(); inst.commit(); }
  }

  function onPaste(inst, e) {
    const cd = e.clipboardData; if (!cd) return;
    const f = [...(cd.files || [])].find(x => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); if (typeof window.mdPasteImage === 'function') window.mdPasteImage(inst.id, f); return; }
    const mdText = cd.getData('application/x-rte-md');          // हाम्रै एडिटरबाट copy (बोल्ड/हाइलाइट सहित)
    let text = mdText || cd.getData('text/plain');
    if (!text) { const h = cd.getData('text/html'); if (h) text = htmlToPlain(h); }
    if (!text) return;                       // खाली भए browser को आफ्नै व्यवहार
    e.preventDefault();
    try { pasteText(inst, text, !!mdText); }
    catch (err) { console.error('paste', err); document.execCommand('insertText', false, text); inst.commit(); }   // जे भए पनि पाठ हराउँदैन
  }

  async function onClick(inst, e) {
    const head = e.target.closest && e.target.closest('.rte-box-head');
    if (head && inst.el.contains(head)) {
      const box = head.closest('.rte-box');
      const cur = box.getAttribute('data-label') || '';
      let v = null;
      try { v = typeof showTextPrompt === 'function' ? await showTextPrompt('बक्सको शीर्षक (खाली छोडे सामान्य)', cur || '') : window.prompt('बक्सको शीर्षक', cur); } catch (err) {}
      if (v === null || v === undefined) return;
      v = String(v).replace(/[\n:]/g, ' ').trim();
      box.setAttribute('data-label', v);
      head.querySelector('.content-box-title').textContent = v || boxMeta(box.getAttribute('data-type')).label;
      inst.flush();
    }
  }

  window.RTE = {
    attach, get: id => INSTS.get(id) || null, has: id => INSTS.has(id),
    mdToHtml, htmlToMd, inlineHtml,
    fromTarget: el => { const r = el && el.closest && el.closest('.rte'); if (!r) return null; return INSTS.get(r.id.replace(/__rte$/, '')) || null; }
  };
})();

/* ================================================
   शास्त्री पोर्टल — "त्रुटि सच्याउनुहोस्" (पाठकको सानो सुधार)
   पाठकले अध्यायको शब्द छानेर ✏️ थिच्छ → सानो पप-अपमा आफ्नो शब्द लेख्छ → तुरुन्तै उसकै फोनमा त्यो शब्द देखिन्छ
   (फोनमै सुरक्षित रहन्छ)। साथै सुधार एडमिनको "User Request" मा जान्छ (functions/api/suggest.js → GitHub Issue);
   एडमिनले स्वीकार गरे अध्यायमै स्थायी रूपमा बदलिन्छ। पठाउन नसकिए पछि आफैं फेरि प्रयास हुन्छ।
   ================================================ */
(function () {
  'use strict';
  const EP = '/api/suggest', FX = 'sp_fixes', QK = 'sp_sg_q', LOG = 'sp_sg_log';
  const LIM_OLD = 600, LIM_NEW = 1200;
  const COLORS = ['#F44336', '#FB8C00', '#4CAF50', '#2196F3', '#9C27B0', '#EC407A', '#8D6E63'];
  let ctx = null, fmt = { b: false, c: '' };
  const $ = id => document.getElementById(id);
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const norm = s => String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

  function parseKey(key) {                                    // chi-<bookId>-<idx>
    const p = key.lastIndexOf('-');
    return { bookId: key.slice(key.indexOf('-') + 1, p), idx: parseInt(key.slice(p + 1), 10) };
  }
  function chapterOf(bookId, idx) { return ((window.App && App.chaptersCache && App.chaptersCache[bookId]) || [])[idx] || {}; }
  function bookTitleOf(bookId) {
    try {
      for (const y of (window.App && App.data && App.data.years) || [])
        for (const k in (y.subjects || {})) { const b = (y.subjects[k] || []).find(x => x.id === bookId); if (b) return b.title || ''; }
    } catch (e) {}
    return '';
  }

  /* ── DOM मा पाठ बदल्ने: textContent को [s,e) भाग → नयाँ पाठ (धेरै text node मा फैलिएको भए पनि) ── */
  function richSpan(txt, rich) {
    const sp = document.createElement('span');
    if (rich.c) sp.style.color = rich.c;
    if (rich.b || rich.c) sp.style.fontWeight = rich.b ? '800' : '600';
    sp.textContent = txt; return sp;
  }
  function replaceByOffsets(root, s, e, txt, rich) {
    if (rich && (rich.b || rich.c)) {                                         // बोल्ड/रङ्गीन: Range ले बदल्ने
      const w2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let pos2 = 0, n2, sN = null, sO = 0, eN = null, eO = 0;
      while ((n2 = w2.nextNode())) {
        const L2 = n2.nodeValue.length;
        if (!sN && pos2 + L2 > s) { sN = n2; sO = s - pos2; }
        if (sN && pos2 + L2 >= e) { eN = n2; eO = e - pos2; break; }
        pos2 += L2;
      }
      if (!sN || !eN) return false;
      const r = document.createRange(); r.setStart(sN, sO); r.setEnd(eN, eO); r.deleteContents(); r.insertNode(richSpan(txt, rich));
      return true;
    }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hit = []; let pos = 0, n;
    while ((n = w.nextNode())) {
      const L = n.nodeValue.length;
      if (pos + L > s && pos < e) hit.push({ n, from: Math.max(s - pos, 0), to: Math.min(e - pos, L) });
      pos += L; if (pos >= e) break;
    }
    if (!hit.length) return false;
    hit.forEach((x, i) => { const v = x.n.nodeValue; x.n.nodeValue = v.slice(0, x.from) + (i === 0 ? txt : '') + v.slice(x.to); });
    return true;
  }
  /* old (सन्दर्भ before/after सहित) खोजेर बदल्ने */
  function replaceByText(root, f) {
    const tc = root.textContent;
    let at = -1;
    if (f.before || f.after) { const k = tc.indexOf((f.before || '') + f.old + (f.after || '')); if (k >= 0) at = k + (f.before || '').length; }
    if (at < 0 && f.before) { const k = tc.indexOf(f.before + f.old); if (k >= 0) at = k + f.before.length; }
    if (at < 0) at = tc.indexOf(f.old);
    if (at < 0) return false;
    return replaceByOffsets(root, at, at + f.old.length, f.neu, { b: f.bold, c: f.color });
  }

  /* ── पाठकको फोनमा सुरक्षित सुधारहरू: अध्याय खुल्दा लागू ── */
  window.spApplyFixes = function (item) {
    try {
      if (!item) return;
      const c = item.querySelector('.ch-read-content'); if (!c || c._fxDone) return;
      c._fxDone = true;
      const p = item.id.lastIndexOf('-'), bookId = item.id.slice(4, p), idx = parseInt(item.id.slice(p + 1), 10);
      const title = chapterOf(bookId, idx).title || '';
      const all = jget(FX, []), keep = [];
      all.forEach(f => {
        if (f.b !== bookId || f.t !== title) { keep.push(f); return; }
        if (replaceByText(c, f)) keep.push(f);                                  // लागू भयो — राख्ने
        else if (c.textContent.indexOf(f.neu) >= 0) { /* एडमिनले स्थायी बदलिसक्यो — अब चाहिँदैन */ }
        else keep.push(f);                                                       // पाठ भेटिएन (अहिलेलाई राख्ने)
      });
      if (keep.length !== all.length) jset(FX, keep);
    } catch (e) {}
  };

  /* ── एडमिनलाई पठाउने (चुपचाप): असफल भए queue मा राखेर पछि फेरि प्रयास ── */
  async function flushQueue() {
    let q = jget(QK, []); if (!q.length || !navigator.onLine) return;
    const rest = [];
    for (const it of q) {
      try {
        const ac = new AbortController(), to = setTimeout(() => ac.abort(), 15000);
        const res = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it.d), signal: ac.signal });
        clearTimeout(to);
        if (res.ok) continue;                                                    // पुग्यो
        if (res.status >= 400 && res.status < 500 && res.status !== 404 && res.status !== 405) continue;   // अमान्य/सीमा — फेरि नपठाउने
        it.n = (it.n || 0) + 1; if (it.n < 8) rest.push(it);                      // सेवा अझै तयार छैन — पछि फेरि
      } catch (e) { it.n = (it.n || 0) + 1; if (it.n < 8) rest.push(it); }
    }
    jset(QK, rest);
  }
  function enqueue(d) {
    const recent = jget(LOG, []).filter(t => Date.now() - t < 3600e3);
    if (recent.length >= 8) return;                                              // स्प्याम सीमा (चुपचाप)
    recent.push(Date.now()); jset(LOG, recent);
    const q = jget(QK, []); q.push({ d, n: 0, t: Date.now() }); jset(QK, q.slice(-20));
    flushQueue();
  }
  window.addEventListener('online', flushQueue);
  setTimeout(flushQueue, 4000);

  /* ── सानो पप-अप ── */
  function ensureOv() {
    if ($('sgOv')) return;
    const ov = document.createElement('div');
    ov.className = 'overlay overlay-top sg-ovc'; ov.id = 'sgOv';
    ov.addEventListener('click', e => { if (e.target === ov) closeOv('sgOv'); });
    ov.innerHTML =
      '<div class="modal-sheet sg-pop">' +
        '<div class="sg-pop-t">✏️ त्रुटि सच्याउनुहोस्</div>' +
        '<input class="f-input sg-pop-in" id="sgNew" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="' + LIM_NEW + '" enterkeyhint="done">' +
        '<div class="sg-fmt" id="sgFmt"><button type="button" class="sg-b" id="sgB" aria-pressed="false" title="बोल्ड"><b>B</b></button>' +
          COLORS.map(c => '<button type="button" class="sg-sw" data-c="' + c + '" style="background:' + c + '" aria-label="रङ" aria-pressed="false"></button>').join('') + '</div>' +
        '<input type="text" id="sgHp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' +
        '<div class="sg-pop-err" id="sgMsg" role="status"></div>' +
        '<div class="sg-pop-btns"><button type="button" class="btn-s" id="sgCancel">रद्द</button><button type="button" class="btn-p" id="sgSend">ठीक छ</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    $('sgCancel').onclick = () => closeOv('sgOv');
    $('sgSend').onclick = submit;
    $('sgFmt').addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.id === 'sgB') fmt.b = !fmt.b; else fmt.c = (fmt.c === t.dataset.c ? '' : t.dataset.c);
      paintFmt();
    });
    $('sgNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }

  function paintFmt() {
    const i = $('sgNew'); if (!i) return;
    $('sgB').setAttribute('aria-pressed', fmt.b); $('sgB').classList.toggle('on', fmt.b);
    document.querySelectorAll('#sgFmt .sg-sw').forEach(b => { const on = b.dataset.c === fmt.c; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    i.style.fontWeight = fmt.b ? '800' : ''; i.style.color = fmt.c || '';        // इनपुटमै नमूना देखिने
  }

  window.openSuggest = function (info) {
    if (!info || !info.key || !info.el || (window.App && App.isAdmin)) return;
    const old = String(info.old || '').replace(/\u00a0/g, ' ').replace(/^\s+|\s+$/g, '');
    if (!old) return;
    if (old.length > LIM_OLD) { if (window.toast) toast('⚠️ छोटो भाग (शब्द/वाक्य) छान्नुहोस्'); return; }
    const k = parseKey(info.key), ch = chapterOf(k.bookId, k.idx);
    const oldSrv = String(info.oldNl || old).replace(/^\s+|\s+$/g, '').slice(0, 1500);
    ctx = { el: info.el, key: info.key, bookId: k.bookId, idx: k.idx, chTitle: ch.title || '', bookTitle: bookTitleOf(k.bookId),
            old, oldSrv, before: info.before || '', after: info.after || '', s: info.s || 0, e: info.e != null ? info.e : (info.s || 0) + old.length, total: info.total || 0 };
    ensureOv();
    fmt = { b: false, c: '' }; paintFmt();
    $('sgNew').value = old; $('sgMsg').textContent = '';
    openOv('sgOv');
    setTimeout(() => { const t = $('sgNew'); try { t.focus(); t.select(); } catch (e) {} }, 300);
  };

  function submit() {
    if (!ctx) return;
    const nw = $('sgNew').value.replace(/\u00a0/g, ' ').trim();
    if (!nw) { $('sgMsg').textContent = 'शब्द लेख्नुहोस्।'; return; }
    if (nw === ctx.old && !fmt.b && !fmt.c) { $('sgMsg').textContent = 'पुरानोभन्दा फरक लेख्नुहोस्।'; return; }
    const c = ctx; ctx = null; const rich = { b: fmt.b, c: fmt.c };
    // १) तुरुन्तै पाठकको फोनमा देखाउने
    let ok = false;
    try {
      const cur = c.el.textContent.slice(c.s, c.e);
      if (norm(cur) === norm(c.old)) ok = replaceByOffsets(c.el, c.s, c.s + cur.length, nw, rich);
      if (!ok) ok = replaceByText(c.el, { old: c.old, neu: nw, before: c.before, after: c.after, bold: rich.b, color: rich.c });
    } catch (e) {}
    // २) फोनमा सुरक्षित (अध्याय फेरि खोल्दा पनि रहोस्)
    const fx = jget(FX, []); fx.push({ b: c.bookId, t: c.chTitle, old: c.old, neu: nw, before: c.before, after: c.after, bold: rich.b, color: rich.c, at: Date.now() });
    jset(FX, fx.slice(-200));
    // ३) एडमिनलाई चुपचाप
    enqueue({ v: 1, bookId: c.bookId, idx: c.idx, chTitle: c.chTitle, bookTitle: c.bookTitle, old: c.oldSrv || c.old, new: nw,
              before: c.before, after: c.after, s: c.s, total: c.total, bold: rich.b, color: rich.c, hp: $('sgHp').value });
    closeOv('sgOv');
    if (window.toast) toast(ok ? '✅ सच्याइयो' : '✅ सुरक्षित भयो');
  }
})();

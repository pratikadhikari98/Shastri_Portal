/* ================================================
   शास्त्री पोर्टल — अध्यायको पाठ select गर्दा आउने पट्टी
   ================================================
   अध्यायको पाठ होल्ड/select गर्दा zipper-बटन जस्तै पट्टी आउँछ:
     [ने] [अं] [सं]  → नेपाली / English / संस्कृतमा अनुवाद (तलबाट पाटी)
     [अ̲] [अ-हाइलाइट] → छानेको पाठ रङ्गिन वा हाइलाइट (यही फोनमा सुरक्षित, अध्याय फेरि खोल्दा पनि रहन्छ)

   अहिले: Google Translate को निःशुल्क (अनौपचारिक) endpoint — key नचाहिने तर Google ले
          कुनै दिन बन्द/सीमित गर्न सक्छ।
   पछि:  तलको TR_API_KEY मा Google Cloud Translation API key राखे (डोमेनमा सीमित गरेर)
          आफैं आधिकारिक API मा सर्छ — अरू केही बदल्न पर्दैन।
   ================================================ */
(function () {
  'use strict';

  const TR_API_KEY = '';   // ← पछि यहाँ API key राख्नुस् (जस्तै 'AIza...')

  const LANGS = [{ c: 'ne', n: 'नेपाली' }, { c: 'en', n: 'English' }, { c: 'sa', n: 'संस्कृत' }];
  const LNAME = { ne: 'नेपाली', en: 'English', sa: 'संस्कृत', hi: 'हिन्दी', mr: 'मराठी', bn: 'বাংলা', gu: 'ગુજરાતી', ta: 'தமிழ்', te: 'తెలుగు' };
  const MAXLEN = 1000;
  const SEL = '.ch-read-content';

  let cur = { text: '', tl: 'ne', el: null, key: '', s: 0, e: 0 };
  let bar = null, timer = 0, raf = 0, drag = null, lastTap = 0, userPos = null;
  try { userPos = JSON.parse(localStorage.getItem('sp_trbar_pos') || 'null'); } catch (e) {}   // पट्टी सारेको ठाउँ सम्झने

  /* ── फोनको आफ्नै select (र त्यसको Copy/Select all मेनु) बन्द गरेर आफ्नै select ──
     छुने स्क्रिन (pointer: coarse) मा अध्यायको पाठको user-select बन्द हुन्छ, त्यसैले फोनको select-मेनु आउनै सक्दैन।
     त्यसको सट्टा: होल्ड गर्दा शब्द छानिन्छ, दुई छेउका ठुला थोप्लाले बढाउन/घटाउन मिल्छ। (माउस/कम्प्युटरमा पहिले जस्तै) */
  const CUST = !!(window.Highlight && window.CSS && CSS.highlights && window.matchMedia && matchMedia('(pointer: coarse)').matches);
  if (CUST) document.documentElement.classList.add('tr-cust');
  let cs = null, hdls = null, lp = null;                               // cs = आफ्नै छानिएको Range
  const DELIM = /[\s\u0964\u0965,;:.!?()\[\]{}"'“”‘’<>|\/\\]/;
  function caretAt(x, y) {
    let n = null, o = 0;
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { n = p.offsetNode; o = p.offset; } }
    else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { n = r.startContainer; o = r.startOffset; } }
    if (!n) return null;
    const el = n.nodeType === 3 ? n.parentElement : n;
    return el && el.closest && el.closest(SEL) ? { n, o } : null;
  }
  function paintSel() {
    if (!CUST) return;
    const h = CSS.highlights.get('trsel') || new Highlight();
    h.clear(); if (cs) h.add(cs);
    CSS.highlights.set('trsel', h);
  }
  function setH(i, x, y) { const h = hdls[i]; h.hidden = false; h.style.left = (x - 18) + 'px'; h.style.top = (y - 2) + 'px'; }
  function hideHandles() { if (hdls) hdls.forEach(h => { h.hidden = true; }); }
  function placeHandles() {
    if (!CUST || !cs) { hideHandles(); return; }
    ensureHandles();
    const rs = cs.getClientRects(); if (!rs.length) { hideHandles(); return; }
    const f = rs[0], l = rs[rs.length - 1];
    setH(0, f.left, f.bottom); setH(1, l.right, l.bottom);
  }
  function ensureHandles() {
    if (hdls) return hdls;
    hdls = [0, 1].map(i => {
      const h = document.createElement('div'); h.className = 'tr-hdl'; h.hidden = true; document.body.appendChild(h);
      let id = null, fixed = null;
      h.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation(); id = e.pointerId;
        fixed = i === 0 ? { n: cs.endContainer, o: cs.endOffset } : { n: cs.startContainer, o: cs.startOffset };
        try { h.setPointerCapture(id); } catch (x) {}
      });
      h.addEventListener('pointermove', e => {
        if (e.pointerId !== id || !cs || !fixed) return;
        const c = caretAt(e.clientX, e.clientY - 24);                  // औँलाले छोपेकाले अलि माथिको अक्षर
        if (!c) return;
        const mv = document.createRange(); mv.setStart(c.n, c.o); mv.collapse(true);
        const fx = document.createRange(); fx.setStart(fixed.n, fixed.o); fx.collapse(true);
        const r = document.createRange();
        if (mv.compareBoundaryPoints(Range.START_TO_START, fx) <= 0) { r.setStart(c.n, c.o); r.setEnd(fixed.n, fixed.o); }
        else { r.setStart(fixed.n, fixed.o); r.setEnd(c.n, c.o); }
        cs = r; paintSel(); placeHandles(); schedule();
      });
      const end = e => { if (e.pointerId === id) { id = null; fixed = null; place(); } };
      h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
      return h;
    });
    return hdls;
  }
  function selectWordAt(x, y) {
    const c = caretAt(x, y), r = document.createRange();
    if (c && c.n.nodeType === 3) {
      const t = c.n.nodeValue; let a = Math.min(c.o, t.length);
      if (a > 0 && (a >= t.length || DELIM.test(t[a])) && !DELIM.test(t[a - 1])) a--;
      if (a >= t.length || DELIM.test(t[a])) return false;
      while (a > 0 && !DELIM.test(t[a - 1])) a--;
      let b = a; while (b < t.length && !DELIM.test(t[b])) b++;
      r.setStart(c.n, a); r.setEnd(c.n, b);
    } else {                                                           // अक्षर ठ्याक्कै नचिनिए: औँला मुनिको अनुच्छेद
      const el = document.elementFromPoint(x, y), host = el && el.closest ? el.closest(SEL) : null; if (!host) return false;
      const blk = el.closest('p,li,h1,h2,h3,h4,h5,td,th,blockquote') || host;
      r.selectNodeContents(host.contains(blk) ? blk : host);
    }
    if (r.collapsed) return false;
    cs = r; paintSel(); place();
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    return true;
  }
  function clearCust() { if (!cs) return; cs = null; paintSel(); hideHandles(); hide(); }
  if (CUST) {
    document.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const t = e.target;
      if (t.closest && (t.closest('#trBar') || t.closest('.tr-hdl'))) { lp = null; return; }
      const inChap = !!(t.closest && t.closest('.chapter-item ' + SEL));
      lp = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, made: false, tm: 0 };
      if (inChap) lp.tm = setTimeout(() => { if (lp && !lp.moved) lp.made = selectWordAt(lp.x, lp.y); }, 450);
    }, true);
    document.addEventListener('pointermove', e => {
      if (!lp || e.pointerType !== 'touch') return;
      if (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10) { lp.moved = true; clearTimeout(lp.tm); }
    }, true);
    const lpEnd = e => {
      if (!lp) return; clearTimeout(lp.tm);
      if (e.type === 'pointerup' && cs && !lp.made && !lp.moved && Date.now() - lp.t < 400) clearCust();   // खाली ठाउँमा सानो थिचाइ: छान्ने हट्ने
      lp = null;
    };
    document.addEventListener('pointerup', lpEnd, true);
    document.addEventListener('pointercancel', lpEnd, true);
  }

  /* ── select गरिएको पाठ (अध्यायको पाठ भित्र मात्र) ── */
  function curRange() {
    if (cs) return cs;
    const s = window.getSelection && getSelection();
    return s && s.rangeCount && !s.isCollapsed ? s.getRangeAt(0) : null;
  }
  function selInfo() {
    const rg = curRange(); if (!rg) return null;
    const ea = rg.startContainer, eb = rg.endContainer;
    const a = ea && (ea.nodeType === 3 ? ea.parentElement : ea), f = eb && (eb.nodeType === 3 ? eb.parentElement : eb);
    const ra = a && a.closest ? a.closest(SEL) : null, rf = f && f.closest ? f.closest(SEL) : null;
    if (!ra || ra !== rf || ra.closest('.rte')) return null;
    const text = rg.toString().replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const rect = rg.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    const ci = ra.closest('.chapter-item');                            // रङ/हाइलाइट: अध्यायको पाठमा मात्र (feed आदिमा होइन)
    const key = ci && ci.id ? ci.id : '';
    const off = (n, o) => { const r = document.createRange(); r.setStart(ra, 0); r.setEnd(n, o); return r.toString().length; };
    let st = 0, en = 0;
    if (key) { try { st = off(rg.startContainer, rg.startOffset); en = off(rg.endContainer, rg.endOffset); } catch (e) { st = en = 0; } }
    return { text, rect, el: ra, key: key && en > st ? key : '', s: st, e: en };
  }

  /* ── तैरिने पट्टी (zipper-बटन .neu-btn जस्तै; बोर्डर थिम अनुसार) ── */
  const PAL = ['#F44336', '#FB8C00', '#FBC02D', '#4CAF50', '#2196F3', '#9C27B0'];
  let view = 'main';   // 'main' | 'fc' (अक्षरको रङ) | 'hl' (हाइलाइट)
  const nb = (attrs, title, html) => `<button type="button" class="neu-btn${/data-on="1"/.test(attrs) ? ' on' : ''}" ${attrs} title="${title}" aria-label="${title}">${html}</button>`;
  const tlBtn = (c, title, html) => nb(`data-tl="${c}"` + (out && out.tl === c ? ' data-on="1"' : ''), title, html);
  function paintBar() {
    const b = ensureBar();
    b.classList.toggle('has-out', !!out && view === 'main');
    const grip = '<span class="tr-grip" title="सार्न तान्नुस् (दुई पटक थिच्दा पुरानै ठाउँमा)" aria-label="पट्टी सार्नुस्"></span>';
    if (view === 'main') {
      const ICO_COPY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
      b.innerHTML = grip +
        '<div class="tr-grp">' + tlBtn('ne', 'नेपालीमा अनुवाद', 'ने') + tlBtn('en', 'English मा अनुवाद', 'अं') + tlBtn('sa', 'संस्कृतमा अनुवाद', 'सं') + '</div>' +
        (cur.el && cur.key ? '<div class="tr-grp">' + nb('data-mk="fc"', 'अक्षर रङ्गिन बनाउने', '<span class="tr-ico-fc">अ</span>') + nb('data-mk="hl"', 'हाइलाइट गर्ने', '<span class="tr-ico-hl">अ</span>') + '</div>' : '') +
        '<div class="tr-grp">' + nb('data-act="copy"', 'कपी गर्ने', ICO_COPY) + nb('data-act="all"', 'सबै पाठ छान्ने', 'सब') + '</div>' + outHtml();
    } else {
      b.innerHTML = grip + nb('data-back="1"', 'फर्कनुहोस्', '‹') +
        PAL.map(c => `<button type="button" class="tr-sw" data-c="${c}" style="background:${c}" title="${view === 'fc' ? 'अक्षरको रङ' : 'हाइलाइट'}" aria-label="${c}"></button>`).join('') +
        nb('data-clear="1"', 'रङ/हाइलाइट हटाउने', '⌫');
    }
  }
  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'trBar'; bar.className = 'tr-bar'; bar.hidden = true;
    bar.addEventListener('pointerdown', e => {
      e.preventDefault();                                              // select हराउन नदिने
      const g = e.target.closest && e.target.closest('.tr-grip'); if (!g) return;
      const r = bar.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, moved: false };
      try { g.setPointerCapture(e.pointerId); } catch (x) {}
    });
    bar.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.moved = true;
      const bw = bar.offsetWidth, bh = bar.offsetHeight;
      const x = Math.max(4, Math.min(innerWidth - bw - 4, e.clientX - drag.dx));
      const y = Math.max(4, Math.min(innerHeight - bh - 4, e.clientY - drag.dy));
      bar.style.left = x + 'px'; bar.style.top = y + 'px';
      const fw = Math.max(1, innerWidth - bw - 8), fh = Math.max(1, innerHeight - bh - 8);
      userPos = { fx: (x - 4) / fw, fy: (y - 4) / fh };
    });
    const endDrag = e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) { try { localStorage.setItem('sp_trbar_pos', JSON.stringify(userPos)); } catch (x) {} }
      else {                                                           // दुई पटक छिटो थिच्दा: आफैं ठाउँ (select को नजिक) मा फर्कने
        const now = Date.now();
        if (now - lastTap < 400) { userPos = null; try { localStorage.removeItem('sp_trbar_pos'); } catch (x) {} place(); }
        lastTap = now;
      }
      drag = null;
    };
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
    bar.addEventListener('mousedown', e => e.preventDefault());
    bar.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const info = selInfo(); if (info) { cur.text = info.text; cur.el = info.el; cur.key = info.key; cur.s = info.s; cur.e = info.e; }
      if (t.dataset.tl) { if (cur.text) showOut(t.dataset.tl); return; }
      if (t.dataset.act === 'closeout') { closeOut(); return; }
      if (t.dataset.act === 'copyout') { copyOut(); return; }
      if (t.dataset.act === 'copy') { copySel(); return; }
      if (t.dataset.act === 'all') { selectAll(); return; }
      if (t.dataset.mk) { view = t.dataset.mk; paintBar(); return; }
      if (t.dataset.back) { view = 'main'; paintBar(); return; }
      if (t.dataset.c) { addMark(view, t.dataset.c); return; }
      if (t.dataset.clear) { clearMarks(); }
    });
    document.body.appendChild(bar);
    return bar;
  }
  function hide() { if (bar) { bar.hidden = true; view = 'main'; out = null; outText = ''; showOut._n = (showOut._n || 0) + 1; } }
  function place() {
    const info = selInfo();
    if (!info) { hide(); hideHandles(); return; }
    placeHandles();
    if (out && info.text.slice(0, MAXLEN) !== outText) { out = null; outText = ''; showOut._n = (showOut._n || 0) + 1; if (bar) paintBar(); }   // नयाँ पाठ छानियो — पुरानो अनुवाद हटाउने
    const had = cur.el !== info.el || !!cur.key !== !!info.key;
    cur.text = info.text; cur.el = info.el; cur.key = info.key; cur.s = info.s; cur.e = info.e;
    const b = ensureBar();
    if (b.hidden || had || !b.firstChild) { if (b.hidden) view = 'main'; paintBar(); }
    b.hidden = false;
    const bw = b.offsetWidth, bh = b.offsetHeight, vw = innerWidth, vh = innerHeight;
    const hdr = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h'), 10) || 64;
    if (userPos) {                                                     // प्रयोगकर्ताले सारेको ठाउँमा
      b.style.left = (4 + userPos.fx * Math.max(0, vw - bw - 8)) + 'px';
      b.style.top = (4 + userPos.fy * Math.max(0, vh - bh - 8)) + 'px';
      return;
    }
    let top = info.rect.bottom + (cs ? 40 : 16);                       // आफ्नै select मा थोप्ला (handle) मुनि                                   // फोनको आफ्नै select-मेनु सामान्यतया माथि आउँछ, त्यसैले तल
    if (top + bh > vh - 8) top = info.rect.top - bh - 16;
    top = Math.max(hdr + 8, Math.min(vh - bh - 8, top));
    let left = info.rect.left + info.rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(vw - bw - 8, left));
    b.style.top = top + 'px'; b.style.left = left + 'px';
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(place, 220); };
  document.addEventListener('selectionchange', schedule);
  window.addEventListener('scroll', () => { if (!bar || bar.hidden || raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); }, { passive: true, capture: true });
  window.addEventListener('resize', schedule);

  /* ── अनुवाद ल्याउने (cache सहित) ── */
  const CK = 'sp_tr_cache';
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length; };
  function cacheGet(k) { try { const o = JSON.parse(localStorage.getItem(CK) || '{}'); return o.m && o.m[k] || null; } catch (e) { return null; } }
  function cacheSet(k, v) {
    try {
      const o = JSON.parse(localStorage.getItem(CK) || '{}'); o.m = o.m || {}; o.o = o.o || [];
      if (!o.m[k]) o.o.push(k); o.m[k] = v;
      while (o.o.length > 80) delete o.m[o.o.shift()];
      localStorage.setItem(CK, JSON.stringify(o));
    } catch (e) {}
  }
  async function fetchTr(text, tl) {
    if (TR_API_KEY) {                                                  // आधिकारिक Google Cloud Translation API
      const r = await fetch('https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(TR_API_KEY), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, target: tl, format: 'text' })
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error((d.error && d.error.message) || ('HTTP ' + r.status));
      const t = d.data.translations[0];
      return { out: t.translatedText, src: t.detectedSourceLanguage || '' };
    }
    // अनौपचारिक निःशुल्क endpoint (key चाहिँदैन)
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + tl + '&dt=t&q=' + encodeURIComponent(text));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const out = (d && d[0] ? d[0] : []).map(x => (x && x[0]) || '').join('');
    if (!out) throw new Error('खाली उत्तर');
    return { out, src: (d && d[2]) || '' };
  }
  async function translate(text, tl) {
    const k = tl + '|' + hash(text), hit = cacheGet(k);
    if (hit) return hit;
    const v = await fetchTr(text, tl);
    cacheSet(k, v);
    return v;
  }

  /* ── अनुवाद पट्टीभित्रै तलतिर फैलिएर देखिने (अलग पाटी होइन) ── */
  let out = null, outText = '';          // out = { tl, st:'loading'|'ok'|'err', text, src }
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function outHtml() {
    if (!out) return '';
    const lg = LANGS.find(l => l.c === out.tl), srcN = out.src && LNAME[out.src] ? LNAME[out.src] + ' → ' : '';
    const body = out.st === 'loading' ? '<div class="tr-out-b loading">अनुवाद हुँदैछ…</div>'
      : out.st === 'err' ? `<div class="tr-out-b err">${esc(out.text)}</div>`
      : `<div class="tr-out-b">${esc(out.text)}</div>`;
    return '<div class="tr-out"><div class="tr-out-h"><span class="tr-out-t">' + esc(srcN + (lg ? lg.n : '')) + '</span>' +
      (out.st === 'ok' ? '<button type="button" class="neu-btn" data-act="copyout" title="अनुवाद कपी" aria-label="अनुवाद कपी">⧉</button>' : '') +
      '<button type="button" class="neu-btn" data-act="closeout" title="अनुवाद बन्द" aria-label="अनुवाद बन्द">✕</button></div>' + body + '</div>';
  }
  async function showOut(tl) {
    outText = cur.text.length > MAXLEN ? cur.text.slice(0, MAXLEN) : cur.text;
    const text = outText, my = (showOut._n = (showOut._n || 0) + 1);
    out = { tl, st: 'loading', text: '', src: '' };
    paintBar(); place();
    try {
      const v = await translate(text, tl);
      if (my !== showOut._n || !out) return;                           // बीचमा अर्को भाषा थिचिएछ / बन्द भयो
      out = { tl, st: 'ok', text: v.out + (cur.text.length > MAXLEN ? '\n\n(धेरै लामो भएकाले पहिलो ' + MAXLEN + ' अक्षर मात्र अनुवाद भयो)' : ''), src: v.src };
    } catch (e) {
      if (my !== showOut._n || !out) return;
      out = { tl, st: 'err', text: '⚠️ अनुवाद आएन (' + (e && e.message ? e.message : 'त्रुटि') + ')। इन्टरनेट जाँचेर फेरि थिच्नुहोस्।', src: '' };
    }
    paintBar(); place();
  }
  function closeOut() { out = null; outText = ''; showOut._n = (showOut._n || 0) + 1; if (bar && !bar.hidden) { paintBar(); place(); } }
  function copyOut() {
    if (!out || out.st !== 'ok') return;
    const txt = out.text.replace(/\n\n\(धेरै लामो[^)]*\)$/, '');
    const ok = () => { if (typeof toast === 'function') toast('अनुवाद कपी भयो ✓'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => {});
  }

  /* ── कपी / सबै छान्ने (फोनको आफ्नै मेनु रोकिएकाले पट्टीमै) ── */
  function copySel() {
    const rg = curRange(); const txt = rg ? rg.toString() : '';
    if (!txt) return;
    const ok = () => { if (typeof toast === 'function') toast('कपी भयो ✓'); };
    const old = () => { try { if (document.execCommand('copy')) ok(); } catch (e) {} };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, old); else old();
  }
  function selectAll() {
    if (!cur.el) return;
    const r = document.createRange(); r.selectNodeContents(cur.el);
    if (CUST) { cs = r; paintSel(); place(); return; }
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);       // selectionchange ले पट्टी फेरि ठाउँमा ल्याउँछ
  }

  /* ── रङ्गिन अक्षर / हाइलाइट (व्यक्तिगत, यही फोनमा) ── */
  const MK = 'sp_marks';
  let store = null;
  const loadMarks = () => { if (!store) { try { store = JSON.parse(localStorage.getItem(MK) || '{}'); } catch (e) { store = {}; } } return store; };
  const saveMarks = () => { try { localStorage.setItem(MK, JSON.stringify(store)); } catch (e) {} };
  function unwrapAll(root) {
    root.querySelectorAll('.usr-mk').forEach(sp => sp.replaceWith(...sp.childNodes));
    root.normalize();
  }
  function applyOne(root, m) {
    const full = root.textContent;
    let s = m.s, e = m.e;
    if (full.slice(s, e) !== m.t) {                                    // अध्याय सम्पादन भएछ — नजिकै उही पाठ खोज्ने
      const i = full.indexOf(m.t, Math.max(0, s - 300));
      if (i < 0) return 0;
      s = i; e = i + m.t.length;
    }
    const nodes = []; let pos = 0;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const l = n.nodeValue.length; nodes.push([n, pos, pos + l]); pos += l; }
    let did = 0;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const [nd, a, b] = nodes[i]; const x = Math.max(s, a), y = Math.min(e, b);
      if (x >= y) continue;
      const r = document.createRange(); r.setStart(nd, x - a); r.setEnd(nd, y - a);
      const sp = document.createElement('span');
      sp.className = 'usr-mk usr-' + m.k;
      sp.style.cssText = m.k === 'hl'
        ? `background:${m.c}33;color:${m.c};box-shadow:inset 0 -2px 0 ${m.c}`
        : `color:${m.c};font-weight:600`;
      r.surroundContents(sp); did++;
    }
    return did;
  }
  function applyAll(el) {
    const key = (el.closest('.chapter-item') || {}).id; if (!key) return;
    const list = loadMarks()[key] || [];
    unwrapAll(el);
    let ok = 0; list.forEach(m => { ok += applyOne(el, m); });
    el._usrFail = ok ? null : el.textContent.length;
  }
  function cut(list, s, e, kind, text) {                               // [s,e) को भाग हटाउने (kind=null भए दुवै थोक)
    const out = [];
    list.forEach(m => {
      if ((kind && m.k !== kind) || m.e <= s || m.s >= e) { out.push(m); return; }
      if (m.s < s) out.push(Object.assign({}, m, { e: s, t: text.slice(m.s, s) }));
      if (m.e > e) out.push(Object.assign({}, m, { s: e, t: text.slice(e, m.e) }));
    });
    return out;
  }
  function addMark(kind, color) {
    if (!cur.el || !cur.key || cur.e <= cur.s) return;
    const st = loadMarks(), text = cur.el.textContent;
    const list = cut(st[cur.key] || [], cur.s, cur.e, kind, text);
    list.push({ s: cur.s, e: cur.e, t: text.slice(cur.s, cur.e), k: kind, c: color });
    st[cur.key] = list; saveMarks();
    applyAll(cur.el); done();
  }
  function clearMarks() {
    if (!cur.el || !cur.key) return;
    const st = loadMarks(), text = cur.el.textContent;
    st[cur.key] = cut(st[cur.key] || [], cur.s, cur.e, null, text);
    if (!st[cur.key].length) delete st[cur.key];
    saveMarks(); applyAll(cur.el); done();
  }
  function done() { if (cs) { cs = null; paintSel(); } hideHandles(); const s = getSelection(); if (s) s.removeAllRanges(); hide(); }

  /* अध्याय फेरि बन्दा/खुल्दा (दोहोरो render) मा रङ/हाइलाइट फेरि लगाउने */
  let mto = 0;
  function sweep() {
    const st = loadMarks();
    document.querySelectorAll('.chapter-item .ch-read-content').forEach(el => {
      const key = (el.closest('.chapter-item') || {}).id;
      if (!key || !(st[key] && st[key].length)) return;
      if (el.querySelector('.usr-mk')) return;
      if (el._usrFail === el.textContent.length) return;
      applyAll(el);
    });
  }
  new MutationObserver(() => { clearTimeout(mto); mto = setTimeout(sweep, 250); }).observe(document.body, { childList: true, subtree: true });
  setTimeout(sweep, 600);
})();

/* ================================================
   शास्त्री पोर्टल — अध्यायको पाठ अनुवाद (नेपाली / English / संस्कृत)
   ================================================
   अध्यायको पाठ होल्ड/select गर्दा तल सानो पट्टी आउँछ: [नेपाली] [English] [संस्कृत]।
   थिचेपछि तलबाट पाटी आउँछ र त्यसमा अनुवाद देखिन्छ।

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

  let cur = { text: '', tl: 'ne' };
  let bar = null, timer = 0, raf = 0;

  /* ── select गरिएको पाठ (अध्यायको पाठ भित्र मात्र) ── */
  function selInfo() {
    const s = window.getSelection && getSelection();
    if (!s || !s.rangeCount || s.isCollapsed) return null;
    const a = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode);
    const f = s.focusNode && (s.focusNode.nodeType === 3 ? s.focusNode.parentElement : s.focusNode);
    const ra = a && a.closest ? a.closest(SEL) : null, rf = f && f.closest ? f.closest(SEL) : null;
    if (!ra || ra !== rf || ra.closest('.rte')) return null;
    const text = s.toString().replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const rect = s.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    return { text, rect };
  }

  /* ── तैरिने पट्टी ── */
  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'trBar'; bar.className = 'tr-bar'; bar.hidden = true;
    bar.innerHTML = '<span class="tr-bar-ico">🌐</span>' + LANGS.map(l => `<button type="button" data-tl="${l.c}">${l.n}</button>`).join('');
    bar.addEventListener('pointerdown', e => e.preventDefault());      // select हराउन नदिने
    bar.addEventListener('mousedown', e => e.preventDefault());
    bar.addEventListener('click', e => {
      const b = e.target.closest('button[data-tl]'); if (!b) return;
      const info = selInfo(); if (info) cur.text = info.text;
      if (cur.text) open(b.dataset.tl);
    });
    document.body.appendChild(bar);
    return bar;
  }
  function hide() { if (bar) bar.hidden = true; }
  function place() {
    const info = selInfo();
    if (!info) { hide(); return; }
    cur.text = info.text;
    const b = ensureBar(); b.hidden = false;
    const bw = b.offsetWidth, bh = b.offsetHeight, vw = innerWidth, vh = innerHeight;
    const hdr = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h'), 10) || 64;
    let top = info.rect.bottom + 16;                                   // फोनको आफ्नै select-मेनु सामान्यतया माथि आउँछ, त्यसैले तल
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

  /* ── पाटी ── */
  const $ = id => document.getElementById(id);
  function paintTabs() {
    const box = $('trTabs'); if (!box) return;
    box.innerHTML = LANGS.map(l => `<button type="button" class="tr-tab${l.c === cur.tl ? ' on' : ''}" data-tl="${l.c}">${l.n}</button>`).join('');
  }
  async function run(tl) {
    cur.tl = tl; paintTabs();
    const dst = $('trDst'), srcL = $('trSrcLang'); if (!dst) return;
    const my = (run._n = (run._n || 0) + 1);
    dst.className = 'tr-dst loading'; dst.textContent = 'अनुवाद हुँदैछ…'; if (srcL) srcL.textContent = '';
    try {
      const v = await translate(cur.text, tl);
      if (my !== run._n) return;                                       // बीचमा अर्को भाषा थिचिएछ
      dst.className = 'tr-dst'; dst.textContent = v.out;
      if (srcL) srcL.textContent = v.src && LNAME[v.src] ? '(' + LNAME[v.src] + ')' : '';
    } catch (e) {
      if (my !== run._n) return;
      dst.className = 'tr-dst err';
      dst.textContent = '⚠️ अनुवाद आएन (' + (e && e.message ? e.message : 'त्रुटि') + ')। इन्टरनेट जाँचेर फेरि थिच्नुहोस्।';
    }
  }
  function open(tl) {
    const text = cur.text.length > MAXLEN ? cur.text.slice(0, MAXLEN) : cur.text;
    cur.text = text;
    $('trSrc').textContent = text + (text.length >= MAXLEN ? ' …' : '');
    const note = $('trNote'); if (note) note.textContent = text.length >= MAXLEN ? 'धेरै लामो भएकाले पहिलो ' + MAXLEN + ' अक्षर मात्र अनुवाद हुन्छ।' : '';
    hide();
    if (typeof openOv === 'function') openOv('trModal');
    run(tl);
  }
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('#trTabs .tr-tab'); if (t) run(t.dataset.tl);
    const c = e.target.closest && e.target.closest('#trCopy');
    if (c) {
      const txt = ($('trDst') || {}).textContent || '';
      if (navigator.clipboard && txt) navigator.clipboard.writeText(txt).then(() => { if (typeof toast === 'function') toast('कपी भयो ✓'); });
    }
  });
})();

/* ================================================
   शास्त्री पोर्टल — पाठकको "सुधार सुझाव"
   अध्यायको पाठ छानेर ✏️ थिचेपछि: पुरानो पाठ देखिन्छ, पाठकले नयाँ पाठ लेख्छ, एडमिनलाई "User Request" को रूपमा पुग्छ।
   एडमिनले स्वीकार गरेमा पुरानो पाठ हटेर नयाँ पाठ नै अध्यायमा commit हुन्छ (Admin Panel → User Request)।
   सर्भर: functions/api/suggest.js (Cloudflare Pages Function)
   ================================================ */
(function () {
  'use strict';
  const EP = '/api/suggest', MAIL = 'apratik055@gmail.com';
  const LIM_OLD = 1500, LIM_NEW = 3000;
  const LOG = 'sp_sg_log';
  let ctx = null, sending = false;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  function bookTitleOf(bookId) {
    try {
      for (const y of (window.App && App.data && App.data.years) || [])
        for (const k in (y.subjects || {})) { const b = (y.subjects[k] || []).find(x => x.id === bookId); if (b) return b.title || ''; }
    } catch (e) {}
    return '';
  }
  const recent = () => { try { const a = JSON.parse(localStorage.getItem(LOG) || '[]'); return a.filter(t => Date.now() - t < 3600e3); } catch (e) { return []; } };
  const logSent = () => { try { const a = recent(); a.push(Date.now()); localStorage.setItem(LOG, JSON.stringify(a)); } catch (e) {} };

  function ensureOv() {
    if ($('sgOv')) return;
    const ov = document.createElement('div');
    ov.className = 'overlay overlay-top'; ov.id = 'sgOv';
    ov.addEventListener('click', e => { if (e.target === ov && !sending) closeOv('sgOv'); });
    ov.innerHTML =
      '<div class="modal-sheet sg-sheet">' +
        '<div class="m-title">✏️ सुधार सुझाव</div>' +
        '<div class="sg-hint">तपाईंले छानेको पाठ बदल्न सुझाव पठाउनुहोस्। एडमिनले जाँचेर स्वीकार गरेपछि मात्र अध्यायमा परिवर्तन हुन्छ।</div>' +
        '<label class="f-label">पुरानो पाठ (तपाईंले छानेको)</label><div class="sg-old" id="sgOld"></div>' +
        '<label class="f-label" for="sgNew">नयाँ पाठ (तपाईंको सुझाव)</label><textarea class="f-textarea sg-new" id="sgNew" rows="4" maxlength="' + LIM_NEW + '"></textarea>' +
        '<label class="f-label" for="sgNote">कारण / टिप्पणी (वैकल्पिक)</label><input class="f-input" id="sgNote" maxlength="300" placeholder="जस्तै: वर्णविन्यास सच्याएको">' +
        '<label class="f-label" for="sgName">तपाईंको नाम (वैकल्पिक)</label><input class="f-input" id="sgName" maxlength="80" autocomplete="name">' +
        '<input type="text" id="sgHp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' +
        '<div class="sg-msg" id="sgMsg" role="status"></div>' +
        '<div class="m-btns"><button type="button" class="btn-s" id="sgCancel">रद्द</button><button type="button" class="btn-p" id="sgSend">पठाउनुहोस्</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    $('sgCancel').onclick = () => { if (!sending) closeOv('sgOv'); };
    $('sgSend').onclick = submit;
  }
  const msg = (t, kind, html) => { const m = $('sgMsg'); m.className = 'sg-msg ' + (kind || ''); if (html) m.innerHTML = t; else m.textContent = t || ''; };

  function mailFallback() {
    const c = ctx; if (!c) return '';
    const body = 'पुस्तक: ' + c.bookTitle + '\nअध्याय: ' + c.chTitle + '\n\nपुरानो पाठ:\n' + c.old + '\n\nनयाँ पाठ:\n' + ($('sgNew').value || '');
    return 'mailto:' + MAIL + '?subject=' + encodeURIComponent('सुधार सुझाव: ' + c.chTitle) + '&body=' + encodeURIComponent(body);
  }

  window.openSuggest = function (info) {
    if (!info || !info.key || !info.old) return;
    const p = info.key.lastIndexOf('-');                                   // chi-<bookId>-<idx>
    const bookId = info.key.slice(info.key.indexOf('-') + 1, p), idx = parseInt(info.key.slice(p + 1), 10);
    const ch = (window.App && App.chaptersCache && App.chaptersCache[bookId] || [])[idx] || {};
    let old = String(info.old).replace(/\u00a0/g, ' ').replace(/^\s+|\s+$/g, '');
    if (!old) return;
    if (old.length > LIM_OLD) { if (window.toast) toast('⚠️ छोटो भाग छान्नुहोस् (अधिकतम ' + LIM_OLD + ' अक्षर)'); return; }
    ctx = { bookId, idx, chTitle: ch.title || '', bookTitle: bookTitleOf(bookId), old, before: info.before || '', after: info.after || '', s: info.s || 0, total: info.total || 0 };
    ensureOv();
    $('sgOld').textContent = old; $('sgNew').value = old; $('sgNote').value = ''; msg('');
    try { $('sgName').value = localStorage.getItem('sp_sg_name') || ''; } catch (e) {}
    $('sgSend').disabled = false; sending = false;
    openOv('sgOv');
    setTimeout(() => { const t = $('sgNew'); try { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } catch (e) {} }, 320);
  };

  async function submit() {
    if (sending || !ctx) return;
    const nw = $('sgNew').value.replace(/\u00a0/g, ' ').trim();
    if (!nw) return msg('नयाँ पाठ लेख्नुहोस्।', 'err');
    if (nw === ctx.old) return msg('नयाँ पाठ पुरानोभन्दा फरक हुनुपर्छ।', 'err');
    if (recent().length >= 5) return msg('एक घण्टामा ५ सुझावसम्म मात्र पठाउन मिल्छ। केहीबेरपछि प्रयास गर्नुहोस्।', 'err');
    sending = true; $('sgSend').disabled = true; msg('⏳ पठाउँदैछु…');
    const name = $('sgName').value.trim();
    try { localStorage.setItem('sp_sg_name', name); } catch (e) {}
    const body = Object.assign({}, ctx, { new: nw, note: $('sgNote').value.trim(), name, hp: $('sgHp').value });
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 15000);
      const res = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
      clearTimeout(to);
      let j = null; try { j = await res.json(); } catch (e) {}
      if (res.ok && j && j.ok) {
        logSent(); sending = false; closeOv('sgOv');
        if (window.toast) toast('✅ सुझाव पठाइयो — एडमिनको स्वीकृतिपछि लागू हुन्छ');
        return;
      }
      const code = (j && j.error) || String(res.status);
      let t = 'सुझाव पठाउन सकिएन।';
      if (code === 'not_configured' || res.status === 404 || res.status === 405) t = 'सुझाव सेवा अहिले चालु भएको छैन।';
      else if (code === 'rate_limited') t = 'आजको सीमा पुग्यो। भोलि फेरि प्रयास गर्नुहोस्।';
      else if (code === 'invalid') t = 'सुझाव मिलेन — पाठ जाँच्नुहोस्।';
      msg(esc(t) + ' <a href="' + esc(mailFallback()) + '">इमेलबाट पठाउनुहोस्</a>', 'err', true);
    } catch (e) {
      msg((e && e.name === 'AbortError' ? 'ढिलो भयो। ' : 'इन्टरनेट जाँच्नुहोस्। ') + '<a href="' + esc(mailFallback()) + '">इमेलबाट पठाउनुहोस्</a>', 'err', true);
    }
    sending = false; $('sgSend').disabled = false;
  }
})();

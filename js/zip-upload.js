/* ================================================
   शास्त्री पोर्टल — Admin: Zip बाट साइट अपडेट
   ================================================
   Admin Panel → "📦 Zip बाट साइट अपडेट"
   - Zip भित्रका सबै फाइल एउटै commit मा GitHub मा जान्छन् (फोल्डर छान्न पर्दैन)
   - Admin Login को token नै प्रयोग हुन्छ (फेरि राख्न पर्दैन)
   - Commit अघि: के-के थपिन्छ / बदलिन्छ / मेटिन्छ सूची देखिन्छ
   - data/ र images/ मा पहिल्यै भएका फाइल (किताब, अध्याय, सूचना, फोटो) कहिल्यै बदलिँदैनन् (चाहे बन्द गर्न मिल्छ)
   ================================================ */
(function () {
  'use strict';

  const PROTECT = ['data/', 'images/'];
  const LEGACY  = ['js/firebase-config.js', 'data/news.js'];     // पुराना फाइल — आफैं मेटिने
  const SKIP_RE = /(^|\/)(\.git\/|__MACOSX\/|\.DS_Store$)|^upload-all\.html$|^tools\/upload-all\.html$/;

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = n => (typeof toN === 'function' ? toN(n) : String(n));
  const kb = b => b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  const S = { phase: 'pick', file: null, items: null, ctx: null, protect: true, msg: 'Update site (zip upload)', error: '', prog: { done: 0, total: 0, cur: '' }, result: null };

  /* ── न्यूनतम zip पाठक (कुनै library चाहिँदैन) ── */
  function readEntries(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let i = buf.byteLength - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('यो zip फाइल होइन जस्तो छ');
    const total = dv.getUint16(i + 10, true);
    let p = dv.getUint32(i + 16, true);
    const out = [];
    for (let n = 0; n < total; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip बिग्रिएको छ');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      out.push({ name: new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)), method, csize, lho });
      p += 46 + nlen + elen + clen;
    }
    return out;
  }
  async function extract(buf, e) {
    const dv = new DataView(buf);
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    const data = new Uint8Array(buf, start, e.csize);
    if (e.method === 0) return data.slice();
    if (e.method === 8) {
      const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    }
    throw new Error('यो zip को compression समर्थित छैन');
  }
  async function gitSha(bytes) {
    const head = new TextEncoder().encode('blob ' + bytes.length + '\0');
    const all = new Uint8Array(head.length + bytes.length);
    all.set(head); all.set(bytes, head.length);
    const d = await crypto.subtle.digest('SHA-1', all);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function b64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* ── GitHub (github-api.js को GH.req प्रयोग) ── */
  async function api(path, opts) {
    let res, last;
    for (let a = 0; a < 3; a++) {                       // कमजोर नेटवर्कमा २ पटक फेरि प्रयास
      try { res = await GH.req(path, opts); break; }
      catch (e) { last = e; if (/repo/.test(e.message)) throw e; await new Promise(r => setTimeout(r, 600 * (a + 1))); }
    }
    if (!res) throw new Error('GitHub सम्म पुग्न सकिएन — इन्टरनेट जाँचेर फेरि प्रयास गर्नुस्');
    if (!res.ok) throw new Error(await GH.errMsg(res));
    return res.json();
  }

  /* ════════ जाँच (scan) ════════ */
  async function scan(file) {
    S.file = file; S.phase = 'scan'; S.error = ''; render();
    try {
      const v = await GH.verify(GH.token());
      if (!v.ok) throw new Error(v.error);
      const branch = v.defaultBranch || GH.cfg().branch || 'main';
      const ref = await api('git/ref/heads/' + branch);
      const parent = ref.object.sha;
      const commit = await api('git/commits/' + parent);
      const baseTree = commit.tree.sha;
      const tree = await api('git/trees/' + baseTree + '?recursive=1');
      const existing = new Map(tree.tree.filter(t => t.type === 'blob').map(t => [t.path, t.sha]));

      const buf = await file.arrayBuffer();
      const entries = readEntries(buf).filter(e => !e.name.endsWith('/'));
      const firsts = new Set(entries.map(e => e.name.split('/')[0]));
      const rootLen = (firsts.size === 1 && entries.every(e => e.name.includes('/'))) ? [...firsts][0].length + 1 : 0;
      const items = [];
      for (const e of entries) {
        const path = e.name.slice(rootLen);
        if (!path || SKIP_RE.test(path)) continue;
        const bytes = await extract(buf, e);
        items.push({ path, bytes, sha: await gitSha(bytes), have: existing.get(path) || null });
      }
      S.items = items;
      S.ctx = { branch, parent, baseTree, existing, truncated: !!tree.truncated };
      S.phase = 'plan';
    } catch (e) { S.phase = 'err'; S.error = e.message; }
    render();
  }

  function makePlan() {
    const add = [], chg = [], same = [], prot = [];
    for (const it of S.items) {
      if (!it.have) { add.push(it); continue; }
      if (S.protect && PROTECT.some(p => it.path.startsWith(p))) { prot.push(it.path); continue; }
      if (it.have === it.sha) { same.push(it.path); continue; }
      chg.push(it);
    }
    const inZip = new Set(S.items.map(i => i.path));
    const newsOk = S.ctx.existing.has('data/news.json') || inZip.has('data/news.json');
    const del = LEGACY.filter(p => S.ctx.existing.has(p) && !inZip.has(p) && (p !== 'data/news.js' || newsOk));
    return { add, chg, same, prot, del };
  }

  function sanity() {
    const paths = new Set(S.items.map(i => i.path));
    const notes = [];
    if (!(paths.has('index.html') && paths.has('js/main.js'))) notes.push({ lvl: 'err', t: 'यो zip शास्त्री पोर्टलको जस्तो देखिएन (index.html वा js/main.js छैन)। अर्कै project को zip हाल्न लाग्नुभएको हुन सक्छ।' });
    else {
      if (!(paths.has('js/admin.js') && paths.has('js/github-api.js'))) notes.push({ lvl: 'warn', t: 'यो zip मा GitHub Admin का फाइल (js/admin.js, js/github-api.js) छैनन्। हाल्नुभयो भने Admin Panel बिग्रन सक्छ।' });
      if (paths.has('js/firebase-config.js')) notes.push({ lvl: 'warn', t: 'यो zip पुरानो Firebase संस्करणको हो। हाल्नुभयो भने GitHub Admin बन्द हुन सक्छ।' });
    }
    if (S.ctx.truncated) notes.push({ lvl: 'warn', t: 'Repo धेरै ठूलो भएकाले केही फाइलको तुलना अधुरो हुन सक्छ।' });
    return notes;
  }

  /* ════════ Commit ════════ */
  async function commit() {
    const P = makePlan();
    const files = [...P.add, ...P.chg];
    S.phase = 'prog'; S.prog = { done: 0, total: files.length, cur: '' }; render();
    try {
      const entries = [], q = files.slice();
      const worker = async () => {
        while (q.length) {
          const f = q.shift();
          S.prog.cur = f.path; paint();
          const b = await api('git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(f.bytes), encoding: 'base64' }) });
          entries.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
          S.prog.done++; paint();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      P.del.forEach(p => entries.push({ path: p, mode: '100644', type: 'blob', sha: null }));
      S.prog.cur = 'Commit बनाउँदै…'; paint();
      const t = await api('git/trees', { method: 'POST', body: JSON.stringify({ base_tree: S.ctx.baseTree, tree: entries }) });
      const c = await api('git/commits', { method: 'POST', body: JSON.stringify({ message: S.msg.trim() || 'Update site (zip upload)', tree: t.sha, parents: [S.ctx.parent] }) });
      await api('git/refs/heads/' + S.ctx.branch, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
      S.result = { n: files.length, del: P.del.length };
      S.phase = 'done';
    } catch (e) {
      S.phase = 'err';
      S.error = /fast forward|422/.test(e.message) ? 'जाँच गरेपछि repo मा अर्को परिवर्तन भयो। फेरि जाँचेर प्रयास गर्नुस्। (' + e.message + ')' : e.message;
    }
    render();
  }

  /* ════════ UI ════════ */
  const STEP = { pick: 1, scan: 1, plan: 2, prog: 3, done: 3, err: 1 };

  function steps() {
    const cur = STEP[S.phase] || 1;
    const lbl = ['१ Zip छान्नुस्', '२ सूची जाँच', '३ Commit'];
    $('zuSteps').innerHTML = lbl.map((t, i) => `<span class="${i + 1 === cur ? 'on' : (i + 1 < cur ? 'done' : '')}">${i + 1 < cur ? '✓ ' : ''}${t}</span>`).join('');
  }

  function det(icon, label, cls, list) {
    if (!list.length) return '';
    const rows = list.slice(0, 300).map(p => `<div class="zu-path">${esc(p)}</div>`).join('');
    return `<details class="zu-det ${cls}"><summary>${icon} ${label} <b>${N(list.length)}</b></summary><div class="zu-list">${rows}${list.length > 300 ? '<div class="zu-path">… र अरू</div>' : ''}</div></details>`;
  }

  function render() {
    if (!$('zuBody')) return;
    steps();
    const body = $('zuBody'), btns = $('zuBtns');
    const close = `<button class="btn-s" onclick="closeOv('zipUploadModal')">बन्द</button>`;

    if (S.phase === 'pick') {
      body.innerHTML = `
        <label class="zu-drop" for="zuFile">
          <span class="ico">📦</span><b>Zip फाइल छान्न यहाँ थिच्नुस्</b>
          <span class="zu-sub">फोल्डर छान्न पर्दैन — सबै फाइल एउटै commit मा जान्छन्</span>
        </label>
        <input type="file" id="zuFile" accept=".zip,application/zip" style="display:none" onchange="ZU.pick(this)">
        <div class="zu-tips">
          <div><span>🔒</span><p><b>सुरक्षित:</b> data/ र images/ मा पहिल्यै भएका किताब, अध्याय, सूचना र फोटो कहिल्यै बदलिँदैनन्।</p></div>
          <div><span>🧹</span><p><b>सफाइ:</b> पुराना firebase-config.js र news.js आफैं मेटिन्छन्।</p></div>
          <div><span>👁</span><p><b>जाँच:</b> Commit अघि के-के बदलिन्छ भन्ने सूची देखिन्छ।</p></div>
        </div>`;
      btns.innerHTML = close;
    }
    else if (S.phase === 'scan') {
      body.innerHTML = `<div class="zu-center"><div class="zu-spin"></div><b>जाँच्दैछ…</b><span class="zu-sub">${esc(S.file ? S.file.name : '')} (${S.file ? kb(S.file.size) : ''})<br>Zip पढ्दै र GitHub सँग तुलना गर्दै</span></div>`;
      btns.innerHTML = '';
    }
    else if (S.phase === 'plan') {
      const P = makePlan(), notes = sanity(), total = P.add.length + P.chg.length + P.del.length;
      const blocked = notes.some(n => n.lvl === 'err');
      body.innerHTML = `
        <div class="zu-file">📄 <b>${esc(S.file.name)}</b> <span>${kb(S.file.size)}</span></div>
        ${notes.map(n => `<div class="zu-note ${n.lvl}">${n.lvl === 'err' ? '⛔' : '⚠️'} ${esc(n.t)}</div>`).join('')}
        <div class="zu-tiles">
          <div class="zu-tile new"><div class="n">${N(P.add.length)}</div><div class="l">➕ नयाँ फाइल</div></div>
          <div class="zu-tile chg"><div class="n">${N(P.chg.length)}</div><div class="l">✏️ बदलिने</div></div>
          <div class="zu-tile del"><div class="n">${N(P.del.length)}</div><div class="l">🗑️ मेटिने</div></div>
          <div class="zu-tile same"><div class="n">${N(P.same.length + P.prot.length)}</div><div class="l">⏭ छोडिने${P.prot.length ? ` <small>(🔒 ${N(P.prot.length)})</small>` : ''}</div></div>
        </div>
        ${total ? '' : '<div class="zu-note ok">✅ सबै फाइल उस्तै छन् — केही बदल्न बाँकी छैन।</div>'}
        ${det('➕', 'नयाँ फाइल', 'new', P.add.map(f => f.path))}
        ${det('✏️', 'बदलिने फाइल', 'chg', P.chg.map(f => f.path))}
        ${det('🗑️', 'मेटिने फाइल', 'del', P.del)}
        ${det('🔒', 'सुरक्षित राखिएका (छोडिने)', 'same', P.prot)}
        <label class="zu-check"><input type="checkbox" ${S.protect ? 'checked' : ''} onchange="ZU.setProtect(this.checked)">
          <span><b>data/ र images/ का पहिल्यै भएका फाइल नबदल्ने</b><br><small>बन्द गरे तपाईंका किताब/अध्याय/सूचना पनि zip को संस्करणले बदलिन सक्छन्।</small></span></label>
        <label class="f-label" style="margin-top:12px">Commit सन्देश</label>
        <input class="f-input" id="zuMsg" type="text" value="${esc(S.msg)}" oninput="ZU.setMsg(this.value)">`;
      btns.innerHTML = `<button class="btn-s" onclick="ZU.reset()">← अर्को zip</button>
        <button class="btn-p" onclick="ZU.commit()" ${(!total || blocked) ? 'disabled' : ''}>✅ Commit गर्नुस् (${N(P.add.length + P.chg.length)})</button>`;
    }
    else if (S.phase === 'prog') {
      body.innerHTML = `<div class="zu-center"><b id="zuProgT"></b><div class="zu-bar"><i id="zuBar"></i></div><span class="zu-sub" id="zuCur"></span><span class="zu-sub">बन्द नगर्नुस्, केही बेर कुर्नुस्…</span></div>`;
      btns.innerHTML = '';
      paint();
    }
    else if (S.phase === 'done') {
      body.innerHTML = `<div class="zu-center"><div class="zu-big ok">✓</div><b>Commit भयो!</b>
        <span class="zu-sub">${N(S.result.n)} फाइल थपिए/बदलिए${S.result.del ? ` · ${N(S.result.del)} पुरानो फाइल मेटियो` : ''}।<br>साइट आफैं फेरि build हुन्छ — १–२ मिनेटमा नयाँ संस्करण देखिन्छ।</span></div>`;
      btns.innerHTML = `${close}<button class="btn-p" onclick="location.reload()">🔄 साइट reload</button>`;
    }
    else if (S.phase === 'err') {
      body.innerHTML = `<div class="zu-center"><div class="zu-big bad">!</div><b>काम सकिएन</b><span class="zu-sub" style="color:#c0392b">${esc(S.error)}</span><span class="zu-sub">Commit बनिसकेको छैन भने repo जस्ताको तस्तै छ।</span></div>`;
      btns.innerHTML = `${close}<button class="btn-p" onclick="ZU.reset()">↻ फेरि प्रयास</button>`;
    }
  }

  function paint() {
    const p = S.prog, bar = $('zuBar');
    if (!bar) return;
    bar.style.width = (p.total ? Math.round(p.done / p.total * 100) : 100) + '%';
    $('zuProgT').textContent = `${N(p.done)} / ${N(p.total)} फाइल अपलोड`;
    $('zuCur').textContent = p.cur || '';
  }

  /* ════════ सार्वजनिक ════════ */
  window.ZU = {
    pick(input) { const f = input.files && input.files[0]; if (f) scan(f); },
    setProtect(v) { S.protect = !!v; render(); },
    setMsg(v) { S.msg = v; },
    reset() { S.phase = 'pick'; S.file = null; S.items = null; S.error = ''; render(); },
    commit
  };
  window.zipUploadOpen = function () {
    if (!App.isAdmin) { toast('⚠️ पहिले Admin Login गर्नुस्'); return; }
    if (S.phase === 'prog') { openOv('zipUploadModal'); return; }
    S.phase = 'pick'; S.file = null; S.items = null; S.protect = true; S.error = '';
    render();
    openOv('zipUploadModal');
  };
})();

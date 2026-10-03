/* ================================================
   शास्त्री पोर्टल — GitHub API (Admin ले website भित्रैबाट सम्पादन गर्न)
   ================================================
   - Firebase पूरै हटाइयो। Admin = GitHub token भएको व्यक्ति मात्र।
   - Token तपाईंको browser (localStorage) मा मात्र बस्छ — कोड/GitHub मा कहिल्यै जाँदैन।
   - सबै परिवर्तन यही repo मा commit बनेर जान्छ (GitHub Pages ले १–२ मिनेटमा देखाउँछ)।
   ================================================ */
'use strict';

/* Repo को विवरण — GitHub Pages (username.github.io/repo) मा चलेको भए आफैं पत्ता लाग्छ।
   Custom domain भए यहाँ owner/repo राख्नुस् (वा Admin Login मा भर्नुस्)। */
const GITHUB_CONFIG = {
  owner:  '',        // जस्तै: 'pratik'
  repo:   '',        // जस्तै: 'shastri-portal'
  branch: 'main'
};

const GH = {
  TOKEN_KEY: 'sp_gh_token',
  REPO_KEY:  'sp_gh_repo',
  _queue: Promise.resolve(),

  /* ── Repo config ── */
  cfg() {
    let owner = GITHUB_CONFIG.owner, repo = GITHUB_CONFIG.repo, branch = GITHUB_CONFIG.branch || 'main';
    try {
      const saved = JSON.parse(localStorage.getItem(GH.REPO_KEY) || 'null');
      if (saved && saved.owner && saved.repo) { owner = saved.owner; repo = saved.repo; branch = saved.branch || branch; }
    } catch (e) {}
    if (!owner || !repo) {
      const h = location.hostname;
      if (h.endsWith('.github.io')) {
        owner = h.split('.')[0];
        repo  = location.pathname.split('/').filter(Boolean)[0] || (owner + '.github.io');
      }
    }
    return { owner, repo, branch };
  },
  saveCfg(owner, repo, branch) {
    localStorage.setItem(GH.REPO_KEY, JSON.stringify({ owner, repo, branch: branch || 'main' }));
  },

  /* ── Token ── */
  token() {
    return localStorage.getItem(GH.TOKEN_KEY) || sessionStorage.getItem(GH.TOKEN_KEY) || '';
  },
  setToken(t, remember = true) {
    GH.clearToken();
    (remember ? localStorage : sessionStorage).setItem(GH.TOKEN_KEY, t);
  },
  clearToken() {
    localStorage.removeItem(GH.TOKEN_KEY);
    sessionStorage.removeItem(GH.TOKEN_KEY);
  },

  /* ── Low-level request ── */
  async req(path, opts = {}, tokenOverride) {
    const { owner, repo } = GH.cfg();
    if (!owner || !repo) throw new Error('GitHub repo (username/repo) राखिएको छैन');
    const url = path.startsWith('http') ? path : `https://api.github.com/repos/${owner}/${repo}/${path}`;
    const t = tokenOverride || GH.token();
    const res = await fetch(url, {
      ...opts,
      cache: 'no-store',
      headers: {
        'Accept': 'application/vnd.github+json',
        ...(t ? { 'Authorization': 'Bearer ' + t } : {}),
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {})
      }
    });
    return res;
  },
  async errMsg(res) {
    let m = '';
    try { m = (await res.json()).message || ''; } catch (e) {}
    if (res.status === 401) return 'Token गलत वा म्याद सकिएको छ';
    if (res.status === 403) return 'अनुमति छैन वा rate limit पुग्यो — ' + m;
    if (res.status === 404) return 'फाइल/repo भेटिएन (token मा यो repo को access छ?)';
    return `GitHub ${res.status}: ${m}`;
  },

  /* ── Token जाँच: repo मा लेख्न (push) पाउँछ कि? ── */
  async verify(token, owner, repo) {
    const cfg = GH.cfg();
    const o = owner || cfg.owner, r = repo || cfg.repo;
    if (!o || !r) return { ok: false, error: 'GitHub username र repo नाम आवश्यक छ' };
    try {
      const res = await fetch(`https://api.github.com/repos/${o}/${r}`, {
        cache: 'no-store',
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return { ok: false, error: await GH.errMsg(res) };
      const j = await res.json();
      if (!j.permissions || !j.permissions.push) return { ok: false, error: 'यो token ले यो repo मा लेख्न पाउँदैन (Contents: Read and write चाहिन्छ)' };
      return { ok: true, login: (j.owner && j.owner.login) || o, defaultBranch: j.default_branch };
    } catch (e) {
      return { ok: false, error: 'नेटवर्क समस्या: ' + e.message };
    }
  },

  /* ── UTF-8 <-> base64 ── */
  toB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  },
  fromB64(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  },

  /* ── फाइल पढ्ने → { sha, text } वा null (छैन भने) ── */
  async getFile(path) {
    const { branch } = GH.cfg();
    const res = await GH.req(`contents/${path}?ref=${encodeURIComponent(branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await GH.errMsg(res));
    const j = await res.json();
    if (Array.isArray(j)) throw new Error(path + ' फोल्डर हो, फाइल होइन');
    let text;
    if (j.content && j.encoding === 'base64') {
      text = GH.fromB64(j.content);
    } else {
      // १MB भन्दा ठूलो फाइल — blob API बाट
      const b = await GH.req(`git/blobs/${j.sha}`);
      if (!b.ok) throw new Error(await GH.errMsg(b));
      text = GH.fromB64((await b.json()).content);
    }
    return { sha: j.sha, text };
  },

  /* ── आधारभूत लेख्ने (create/update) — base64 content ── */
  async putRaw(path, b64, message, sha) {
    const { branch } = GH.cfg();
    const res = await GH.req(`contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: b64, branch, ...(sha ? { sha } : {}) })
    });
    return res;
  },

  /* ── queue — एकै समयमा दुई commit नटकरिऊन् ── */
  enqueue(fn) {
    const p = GH._queue.then(fn, fn);
    GH._queue = p.catch(() => {});
    return p;
  },

  /* ── पाठ फाइल लेख्ने (अवस्थित भए sha आफैं लिने, conflict भए एकपटक फेरि प्रयास) ── */
  writeText(path, text, message) {
    return GH.enqueue(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const cur = await GH.getFile(path);
        const res = await GH.putRaw(path, GH.toB64(text), message || ('Update ' + path), cur && cur.sha);
        if (res.ok) return true;
        if (res.status === 409 || res.status === 422) { await new Promise(r => setTimeout(r, 600)); continue; }
        throw new Error(await GH.errMsg(res));
      }
      throw new Error('धेरै पटक conflict भयो, फेरि प्रयास गर्नुस्');
    });
  },

  /* ── JSON ── */
  async readJson(path) {
    const f = await GH.getFile(path);
    if (!f) return null;
    try { return JSON.parse(f.text); } catch (e) { throw new Error(path + ' को JSON बिग्रिएको छ'); }
  },
  writeJson(path, obj, message) {
    return GH.writeText(path, JSON.stringify(obj, null, 2) + '\n', message);
  },

  /* ── फाइल मेटाउने ── */
  deleteFile(path, message) {
    return GH.enqueue(async () => {
      const cur = await GH.getFile(path);
      if (!cur) return true;
      const { branch } = GH.cfg();
      const res = await GH.req(`contents/${path}`, {
        method: 'DELETE',
        body: JSON.stringify({ message: message || ('Delete ' + path), sha: cur.sha, branch })
      });
      if (!res.ok) throw new Error(await GH.errMsg(res));
      return true;
    });
  },

  /* ── फोटो: browser मै सानो बनाएर (max 1200px, JPEG) तयार पार्ने — अपलोड save गर्दा मात्र हुन्छ ── */
  prepareImage(file, maxSide = 1200, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('फोटो फाइल मात्र राख्नुस्'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('फाइल पढ्न सकिएन'));
      reader.onload = ev => {
        const img = new Image();
        img.onerror = () => reject(new Error('फोटो खोल्न सकिएन'));
        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(1, maxSide / Math.max(width, height));
          width = Math.round(width * scale); height = Math.round(height * scale);
          const c = document.createElement('canvas');
          c.width = width; c.height = height;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = c.toDataURL('image/jpeg', quality);
          resolve({ dataUrl, b64: dataUrl.split(',')[1] });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  },
  /* prepareImage() ले दिएको { b64 } वा data: URL लाई images/uploads/ मा commit गर्ने → path फर्काउँछ */
  uploadImage(prepared, folder = 'images/uploads') {
    const b64 = typeof prepared === 'string' ? prepared.replace(/^data:[^,]+,/, '') : prepared.b64;
    const path = `${folder}/${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
    return GH.enqueue(async () => {
      const res = await GH.putRaw(path, b64, 'Upload image ' + path);
      if (!res.ok) throw new Error(await GH.errMsg(res));
      return path;
    });
  }
};
window.GH = GH;

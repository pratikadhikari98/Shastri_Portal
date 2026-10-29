/* ================================================
   शास्त्री पोर्टल — Admin सुरक्षित लगइन (PIN + Fingerprint)  ·  Cloudflare Pages Function
   /api/admin/*

   GitHub token यहाँ (Cloudflare को Secret) मा बस्छ — फोन/browser वा कोडमा कहिल्यै जाँदैन।
   Admin ले PIN वा Fingerprint (फोनको आफ्नै स्क्यानर, WebAuthn) ले खोल्छ → १२ घण्टाको सेसन पाउँछ →
   साइटले GitHub सँग सिधै होइन, यही फङ्सन (/api/admin/gh/…) मार्फत बोल्छ।

   एकपटकको सेटअप (Cloudflare Pages → Settings): CLOUDFLARE_ADMIN_SETUP.md हेर्नुस्
     ADMIN_GH_TOKEN (Secret)  = GitHub fine-grained token — यही repo, Contents + Issues: Read and write
     ADMIN_PIN      (Secret)  = तपाईंको PIN (कम्तीमा ४ अङ्क; लामो भए बढी सुरक्षित)
     SESSION_SECRET (Secret)  = लामो अनियमित अक्षर (३२+) — सेसन/चुनौती हस्ताक्षर गर्न
     ADMIN_KV       (KV binding) = गलत PIN को गन्ती/लक र Fingerprint को सार्वजनिक कुञ्जी राख्न
     GH_REPO        (वैकल्पिक)  = "pratikadhikari98/Shastri_Portal"

   Endpoints:
     GET  /api/admin/status            → { configured }                     (साइटले PIN-मोड देखाउने कि पुरानो token-मोड भन्ने जाँच)
     POST /api/admin/login             { pin }             → { token, exp, repo }
     POST /api/admin/challenge                              → { challenge }  (Fingerprint को लागि)
     POST /api/admin/fp-login          { id, clientDataJSON, authenticatorData, signature } → { token, exp, repo }
     POST /api/admin/fp-register       (सेसन चाहिन्छ) { id, publicKey } → { ok }
     POST /api/admin/fp-remove         (सेसन चाहिन्छ) { id | all:true }  → { ok }
     GET  /api/admin/session           (सेसन चाहिन्छ) → { ok, exp, repo }
     ANY  /api/admin/gh/repos/<owner>/<repo>/…  (सेसन चाहिन्छ) → GitHub API (ADMIN_GH_TOKEN सहित)
   ================================================ */
const DEFAULT_REPO = 'pratikadhikari98/Shastri_Portal';
const SESSION_TTL = 12 * 3600;                 // सेकेन्ड — १२ घण्टा
const CHAL_TTL = 120 * 1000;                   // Fingerprint चुनौतीको म्याद — २ मिनेट
const ALLOWED = ['contents', 'git', 'commits', 'branches', 'issues'];   // repo भित्र यीमात्र खुला
const MAX_FP = 5;

const enc = new TextEncoder(), dec = new TextDecoder();
const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── base64url / crypto सहायक ── */
const b64u = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const hmacKey = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const sign = async (secret, data) => b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
const sha256 = data => crypto.subtle.digest('SHA-256', data);
const safeEq = async (a, b) => {                // समय-सुरक्षित तुलना (दुवैको hash बराबर गरेर)
  const [x, y] = (await Promise.all([sha256(enc.encode(String(a))), sha256(enc.encode(String(b)))])).map(h => new Uint8Array(h));
  let d = 0; for (let i = 0; i < 32; i++) d |= x[i] ^ y[i]; return d === 0;
};
const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };

/* ── सेसन token:  spa1.<exp>.<how>.<sig> ── */
async function makeSession(env, how) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const body = 'spa1.' + exp + '.' + how;
  return { token: body + '.' + await sign(env.SESSION_SECRET, body), exp };
}
async function checkSession(env, request) {
  const m = /^Bearer\s+(spa1\.\d+\.(?:pin|fp)\.[\w-]+)$/.exec(request.headers.get('Authorization') || '');
  if (!m) return null;
  const p = m[1].split('.'), exp = parseInt(p[1], 10);
  if (!exp || exp * 1000 < Date.now()) return null;
  return (await safeEq(p[3], await sign(env.SESSION_SECRET, p.slice(0, 3).join('.')))) ? { exp, how: p[2] } : null;
}

/* ── गलत PIN: ५ पटकपछि लक (१५ मि → ३० मि → १ घण्टा … अधिकतम २४ घण्टा) ── */
async function tryPin(env, pin) {
  const now = Date.now();
  const raw = await env.ADMIN_KV.get('lock');
  const st = raw ? JSON.parse(raw) : { fails: 0, until: 0 };
  if (st.until > now) return { locked: true, retry: Math.ceil((st.until - now) / 1000) };
  const fails = st.fails + 1;                                   // प्रयास पहिले नै गन्ने (एकैचोटि धेरै पठाएर छल्न नपाओस्)
  let until = 0;
  if (fails % 5 === 0) until = now + Math.min(15 * 60 * 1000 * Math.pow(2, Math.min(Math.floor(fails / 5) - 1, 7)), 24 * 3600 * 1000);
  await env.ADMIN_KV.put('lock', JSON.stringify({ fails, until }), { expirationTtl: 7 * 24 * 3600 });
  if (await safeEq(String(pin || ''), String(env.ADMIN_PIN))) { await env.ADMIN_KV.delete('lock'); return { ok: true }; }
  await sleep(800);
  return until ? { ok: false, locked: true, retry: Math.ceil((until - now) / 1000) } : { ok: false, left: 5 - (fails % 5) };
}

/* ── Fingerprint (WebAuthn, ES256) ── */
async function makeChallenge(env) {
  const ts = Date.now(), rand = b64u(crypto.getRandomValues(new Uint8Array(12)));
  return ts + '.' + rand + '.' + await sign(env.SESSION_SECRET, 'chal.' + ts + '.' + rand);
}
async function checkChallenge(env, chal) {
  const p = String(chal || '').split('.');
  if (p.length !== 3) return false;
  const ts = parseInt(p[0], 10);
  if (!ts || Date.now() - ts > CHAL_TTL || ts > Date.now() + 5000) return false;
  if (!(await safeEq(p[2], await sign(env.SESSION_SECRET, 'chal.' + p[0] + '.' + p[1])))) return false;
  if (await env.ADMIN_KV.get('used:' + p[2])) return false;     // एकपटक मात्र चल्ने
  await env.ADMIN_KV.put('used:' + p[2], '1', { expirationTtl: 300 });
  return true;
}
function derToRaw(der) {                                         // ECDSA DER → r||s (६४ बाइट)
  let o = 2; if (der[1] & 0x80) o += der[1] & 0x7f;
  const rl = der[o + 1]; let r = der.slice(o + 2, o + 2 + rl); o += 2 + rl;
  const sl = der[o + 1]; let s = der.slice(o + 2, o + 2 + sl);
  const fix = x => { while (x.length > 32 && x[0] === 0) x = x.slice(1); const out = new Uint8Array(32); out.set(x, 32 - x.length); return out; };
  return concat(fix(r), fix(s));
}
async function verifyAssertion(env, url, b) {
  const cdBytes = unb64u(b.clientDataJSON), cd = JSON.parse(dec.decode(cdBytes));
  if (cd.type !== 'webauthn.get' || cd.origin !== url.origin) return false;
  if (!(await checkChallenge(env, dec.decode(unb64u(cd.challenge))))) return false;
  const ad = unb64u(b.authenticatorData);
  if (ad.length < 37) return false;
  const rp = new Uint8Array(await sha256(enc.encode(url.hostname)));
  for (let i = 0; i < 32; i++) if (ad[i] !== rp[i]) return false;
  if (!(ad[32] & 0x01) || !(ad[32] & 0x04)) return false;       // उपस्थिति (UP) + आफ्नो पहिचान (UV: fingerprint/PIN) दुवै चाहिन्छ
  const raw = await env.ADMIN_KV.get('creds');
  const creds = raw ? JSON.parse(raw) : {};
  const pk = creds[String(b.id || '')];
  if (!pk) return false;
  const key = await crypto.subtle.importKey('spki', unb64u(pk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const signed = concat(ad, new Uint8Array(await sha256(cdBytes)));
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(unb64u(b.signature)), signed);
}

/* ── GitHub proxy ── */
async function proxyGitHub(env, request, url, repo) {
  const rest = url.pathname.replace(/^\/api\/admin\/gh\//, '');
  if (!rest || /(^|\/)\.\.?(\/|$)|%2e|%2f|\/\/|\\/i.test(rest)) return json({ error: 'bad_path' }, 400);
  const base = 'repos/' + repo, low = rest.toLowerCase(), lb = base.toLowerCase();
  const inside = low === lb || low.startsWith(lb + '/');
  const seg = inside ? rest.slice(base.length + 1).split('/')[0] : '';
  if (!inside || (seg && !ALLOWED.includes(seg))) return json({ error: 'forbidden_path' }, 403);
  if (!['GET', 'PUT', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
  const init = {
    method: request.method,
    headers: {
      'Authorization': 'Bearer ' + env.ADMIN_GH_TOKEN,
      'Accept': request.headers.get('Accept') || 'application/vnd.github+json',
      'User-Agent': 'shastri-portal-admin', 'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (request.method !== 'GET') { init.body = await request.arrayBuffer(); init.headers['Content-Type'] = request.headers.get('Content-Type') || 'application/json'; }
  const res = await fetch('https://api.github.com/' + rest + url.search, init);
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' } });
}

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/+$/, '');
    const configured = !!(env.ADMIN_GH_TOKEN && env.ADMIN_PIN && env.SESSION_SECRET && env.ADMIN_KV);
    if (route === 'status') return json({ configured });
    if (!configured) return json({ error: 'not_configured' }, 503);

    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return json({ error: 'forbidden' }, 403);   // अर्को साइटबाट होइन
    const repo = env.GH_REPO || DEFAULT_REPO, owner = repo.split('/')[0];
    const post = request.method === 'POST';
    const body = async () => { try { return await request.json(); } catch (e) { return {}; } };

    if (route === 'login' && post) {
      const r = await tryPin(env, (await body()).pin);
      if (r.locked && !r.ok) return json({ error: 'locked', retry: r.retry }, 429);
      if (!r.ok) return json({ error: 'wrong_pin', left: r.left }, 401);
      return json({ ok: true, ...(await makeSession(env, 'pin')), repo, owner });
    }
    if (route === 'challenge' && post) return json({ challenge: await makeChallenge(env) });
    if (route === 'fp-login' && post) {
      const b = await body();
      let ok = false; try { ok = await verifyAssertion(env, url, b); } catch (e) { ok = false; }
      if (!ok) return json({ error: 'fp_failed' }, 401);
      return json({ ok: true, ...(await makeSession(env, 'fp')), repo, owner });
    }

    const sess = await checkSession(env, request);
    if (!sess) return json({ error: 'unauthorized' }, 401);

    if (route === 'session') return json({ ok: true, exp: sess.exp, repo, owner });
    if (route === 'fp-register' && post) {
      const b = await body(), id = String(b.id || '');
      if (!id || id.length > 400 || !b.publicKey) return json({ error: 'invalid' }, 400);
      const spki = unb64u(b.publicKey);
      await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);   // ठीक कुञ्जी हो? नभए त्रुटि
      const raw = await env.ADMIN_KV.get('creds'), creds = raw ? JSON.parse(raw) : {};
      if (!creds[id] && Object.keys(creds).length >= MAX_FP) return json({ error: 'too_many' }, 400);
      creds[id] = b64u(spki);
      await env.ADMIN_KV.put('creds', JSON.stringify(creds));
      return json({ ok: true });
    }
    if (route === 'fp-remove' && post) {
      const b = await body(), raw = await env.ADMIN_KV.get('creds'), creds = raw ? JSON.parse(raw) : {};
      if (b.all) await env.ADMIN_KV.delete('creds');
      else { delete creds[String(b.id || '')]; await env.ADMIN_KV.put('creds', JSON.stringify(creds)); }
      return json({ ok: true });
    }
    if (route.startsWith('gh/')) return proxyGitHub(env, request, url, repo);
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    return json({ error: 'server' }, 500);
  }
}

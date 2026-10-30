/* ================================================
   POST /api/suggest-cancel  {number, ck} — पाठकले आफ्नै अझै स्वीकार नभएको सुझाव रद्द गर्ने
   • ck = पठाउँदा फोनमा बनेको गोप्य कुञ्जी; Issue भित्र त्यसको hash मात्र छ — मिल्यो भने मात्र रद्द हुन्छ (अरूको सुझाव रद्द गर्न मिल्दैन)
   • खुला (अझै स्वीकार/अस्वीकार नभएको) Issue मात्र रद्द हुन्छ — एडमिनले स्वीकारिसकेको वा बन्द भइसकेको रद्द हुँदैन
   ================================================ */
const DEFAULT_REPO = 'pratikadhikari98/Shastri_Portal';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const sha256 = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const hdr = (env) => ({ 'Authorization': 'Bearer ' + env.GH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'shastri-portal-suggest', 'Content-Type': 'application/json' });
const isSugg = (ij) => ij && !ij.pull_request && (ij.labels || []).some(l => l && l.name === 'suggestion');
const CANCEL_MARK = '\uD83D\uDEAB';   // 🚫 — पाठकले रद्द गरेको Issue को शीर्षकको सुरुमा

export async function onRequestPost({ request, env }) {
  try {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return json({ error: 'forbidden' }, 403);
    let b; try { b = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
    const n = Number.isInteger(b.number) && b.number > 0 ? b.number : 0;
    const ck = typeof b.ck === 'string' && /^[0-9a-f]{16,64}$/.test(b.ck) ? b.ck : '';
    if (!n || !ck) return json({ error: 'invalid' }, 400);
    if (!env.GH_TOKEN) return json({ error: 'not_configured' }, 503);
    const repo = env.GH_REPO || DEFAULT_REPO, api = 'https://api.github.com/repos/' + repo + '/issues/' + n, h = hdr(env);
    const ir = await fetch(api, { headers: h });
    if (!ir.ok) return json({ error: 'not_found' }, 404);
    const ij = await ir.json();
    if (!isSugg(ij)) return json({ error: 'not_a_suggestion' }, 400);
    if (ij.state !== 'open') return json({ error: 'already_closed' }, 409);          // स्वीकार/अस्वीकार भइसकेको — रद्द मिल्दैन
    const m = /<!--SP-REQ\s+([A-Za-z0-9+\/=]+)\s*-->/.exec(ij.body || '');
    let req = null; try { req = m && JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) {}
    if (!req || !req.ckh || req.ckh !== await sha256(ck)) return json({ error: 'forbidden' }, 403);
    await fetch(api + '/comments', { method: 'POST', headers: h, body: JSON.stringify({ body: 'पाठकले आफ्नो सुझाव रद्द गर्‍यो।' }) });
    const cr = await fetch(api, { method: 'PATCH', headers: h, body: JSON.stringify({ state: 'closed', state_reason: 'not_planned', title: (CANCEL_MARK + ' ' + String(ij.title || '').replace(/^\u270F\uFE0F\s*/, '')).slice(0, 120) }) });
    if (!cr.ok) return json({ error: 'github_' + cr.status }, 502);
    return json({ ok: true });
  } catch (e) { return json({ error: 'server' }, 500); }
}
export const onRequest = () => json({ error: 'method_not_allowed' }, 405);

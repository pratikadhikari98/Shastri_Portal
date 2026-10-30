/* ================================================
   GET /api/suggest-status?n=12,13,14 — पाठकले पठाएका सुझावको अवस्था (पाठकको "मेरा सुधार" ले हेर्छ)
   pending (खुला) · approved (एडमिनले स्वीकारेको) · rejected (एडमिनले अस्वीकारेको) · cancelled (पाठकले आफैं रद्द गरेको)
   केवल "suggestion" label भएको Issue को अवस्था मात्र फर्काउँछ; अरू केही (सामग्री/व्यक्ति) कहिल्यै फर्काउँदैन।
   ================================================ */
const DEFAULT_REPO = 'pratikadhikari98/Shastri_Portal';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const sha256 = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const hdr = (env) => ({ 'Authorization': 'Bearer ' + env.GH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'shastri-portal-suggest', 'Content-Type': 'application/json' });
const isSugg = (ij) => ij && !ij.pull_request && (ij.labels || []).some(l => l && l.name === 'suggestion');
const CANCEL_MARK = '\uD83D\uDEAB';   // 🚫 — पाठकले रद्द गरेको Issue को शीर्षकको सुरुमा

export async function onRequestGet({ request, env }) {
  try {
    if (!env.GH_TOKEN) return json({ error: 'not_configured' }, 503);
    const n = [...new Set((new URL(request.url).searchParams.get('n') || '').split(',').map(x => parseInt(x, 10)).filter(x => x > 0))].slice(0, 30);
    const repo = env.GH_REPO || DEFAULT_REPO, out = {};
    await Promise.all(n.map(async (k) => {
      try {
        const r = await fetch('https://api.github.com/repos/' + repo + '/issues/' + k, { headers: hdr(env) });
        if (!r.ok) return;
        const ij = await r.json(); if (!isSugg(ij)) return;
        out[k] = ij.state === 'open' ? 'pending'
          : (String(ij.title || '').startsWith(CANCEL_MARK) ? 'cancelled' : (ij.state_reason === 'completed' ? 'approved' : 'rejected'));
      } catch (e) {}
    }));
    return json({ ok: true, s: out });
  } catch (e) { return json({ error: 'server' }, 500); }
}
export const onRequest = () => json({ error: 'method_not_allowed' }, 405);

/* ================================================
   POST /api/suggest-close — Admin ले सुझाव स्वीकार/अस्वीकार गरेपछि Issue बन्द गर्ने
   किन चाहिन्छ: Admin को GitHub token मा "Issues: write" अनुमति छैन भने browser बाट Issue बन्द हुँदैन (403)।
   यो फङ्सनले (Issues: write भएको) GH_TOKEN बाट बन्द गरिदिन्छ — तर पहिले माग गर्ने मानिस साँच्चै repo को
   push-अनुमति भएको Admin हो भनी उसकै token बाट GitHub मा जाँच्छ, र केवल "suggestion" label भएको Issue मात्र बन्द गर्छ।
   ================================================ */
const DEFAULT_REPO = 'pratikadhikari98/Shastri_Portal';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  try {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return json({ error: 'forbidden' }, 403);
    const m = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') || '');
    if (!m) return json({ error: 'unauthorized' }, 401);
    let b; try { b = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
    const n = Number.isInteger(b.number) && b.number > 0 ? b.number : 0;
    const reason = b.reason === 'not_planned' ? 'not_planned' : 'completed';
    const comment = typeof b.comment === 'string' ? b.comment.slice(0, 500) : '';
    if (!n) return json({ error: 'invalid' }, 400);
    if (!env.GH_TOKEN) return json({ error: 'not_configured' }, 503);
    const repo = env.GH_REPO || DEFAULT_REPO, api = 'https://api.github.com/repos/' + repo;
    const ua = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'shastri-portal-suggest' };

    // १) माग गर्ने साँच्चै admin (push अनुमति) हो?
    const who = await fetch(api, { headers: { ...ua, 'Authorization': 'Bearer ' + m[1] } });
    if (!who.ok) return json({ error: 'forbidden' }, 403);
    const wj = await who.json();
    if (!wj.permissions || !wj.permissions.push) return json({ error: 'forbidden' }, 403);

    // २) "suggestion" label भएको सामान्य Issue हो? (अरू कुनै Issue/PR बन्द नगर्ने)
    const gh = { ...ua, 'Authorization': 'Bearer ' + env.GH_TOKEN, 'Content-Type': 'application/json' };
    const ir = await fetch(api + '/issues/' + n, { headers: gh });
    if (!ir.ok) return json({ error: 'not_found' }, 404);
    const ij = await ir.json();
    if (ij.pull_request || !(ij.labels || []).some(l => l && l.name === 'suggestion')) return json({ error: 'not_a_suggestion' }, 400);

    // ३) टिप्पणी (वैकल्पिक) + बन्द
    if (comment) await fetch(api + '/issues/' + n + '/comments', { method: 'POST', headers: gh, body: JSON.stringify({ body: comment }) });
    const cr = await fetch(api + '/issues/' + n, { method: 'PATCH', headers: gh, body: JSON.stringify({ state: 'closed', state_reason: reason }) });
    if (!cr.ok) return json({ error: 'github_' + cr.status }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'server' }, 500);
  }
}
export const onRequest = () => json({ error: 'method_not_allowed' }, 405);

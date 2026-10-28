/* ================================================
   शास्त्री पोर्टल — पाठकको "सुधार सुझाव" (Cloudflare Pages Function)
   POST /api/suggest  → GitHub Issue (label: suggestion) बनाउँछ।
   Admin Panel को "User Request" ले यही Issue हरू पढ्छ र स्वीकार/अस्वीकार गर्छ।

   एकपटकको सेटअप (Cloudflare Pages → Settings → Variables and Secrets):
     GH_TOKEN  (Secret)  = GitHub fine-grained token — यही repo मा केवल "Issues: Read and write" अनुमति
                           (Contents अनुमति नदिनुहोस् — admin token भन्दा फरक, सानो अनुमतिको token)
     GH_REPO   (वैकल्पिक) = "pratikadhikari98/Shastri_Portal"  (नराखे यही default)
     SUGG_KV   (वैकल्पिक KV binding) = राखे प्रति IP दिनको १० सुझाव सीमा लाग्छ
   ================================================ */
const DEFAULT_REPO = 'pratikadhikari98/Shastri_Portal';
const MAX_BODY = 14000;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
const str = (v, max) => (typeof v === 'string' ? v : '').replace(/\u0000/g, '').slice(0, max);
const b64 = (text) => {                       // UTF-8 सुरक्षित base64
  const bytes = new TextEncoder().encode(text); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fence = (t) => '```\n' + t.replace(/```/g, "'''") + '\n```';

export async function onRequestPost({ request, env }) {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return json({ error: 'forbidden' }, 403);   // अर्को साइटबाट होइन
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    let d; try { d = JSON.parse(raw); } catch (e) { return json({ error: 'bad_json' }, 400); }
    if (d.hp) return json({ ok: true });                                    // honeypot: robot लाई सफल देखाउने, बनाउँदैन

    const req = {
      v: 1,
      bookId: str(d.bookId, 120), idx: Number.isInteger(d.idx) ? d.idx : -1,
      chTitle: str(d.chTitle, 200), bookTitle: str(d.bookTitle, 200),
      old: str(d.old, 1600), new: str(d.new, 3200), note: str(d.note, 400), name: str(d.name, 80),
      before: str(d.before, 80), after: str(d.after, 80),
      s: Number.isFinite(d.s) ? d.s : 0, total: Number.isFinite(d.total) ? d.total : 0,
      at: new Date().toISOString()
    };
    if (!req.bookId || !req.old.trim() || !req.new.trim() || req.old === req.new) return json({ error: 'invalid' }, 400);

    const token = env.GH_TOKEN;
    if (!token) return json({ error: 'not_configured' }, 503);

    if (env.SUGG_KV) {                                                      // वैकल्पिक: प्रति IP सीमा
      const ip = request.headers.get('CF-Connecting-IP') || 'x';
      const k = 'sg:' + ip + ':' + new Date().toISOString().slice(0, 10);
      const n = parseInt((await env.SUGG_KV.get(k)) || '0', 10);
      if (n >= 10) return json({ error: 'rate_limited' }, 429);
      await env.SUGG_KV.put(k, String(n + 1), { expirationTtl: 90000 });
    }

    const repo = env.GH_REPO || DEFAULT_REPO;
    const title = ('✏️ ' + (req.chTitle || req.bookId) + ' — ' + req.old.replace(/\s+/g, ' ').slice(0, 50)).slice(0, 120);
    const body =
      '**पुस्तक:** ' + (req.bookTitle || req.bookId) + '\n**अध्याय:** ' + req.chTitle + '\n' +
      (req.name ? '**पठाउने:** ' + req.name.replace(/[<>]/g, '') + '\n' : '') +
      (req.note ? '**कारण:** ' + req.note.replace(/[<>]/g, '') + '\n' : '') +
      '\n**पुरानो पाठ:**\n' + fence(req.old) + '\n**नयाँ पाठ:**\n' + fence(req.new) +
      '\n\n_यो Issue "शास्त्री पोर्टल" Admin Panel → User Request बाट स्वीकार/अस्वीकार गर्नुहोस्।_\n' +
      '<!--SP-REQ ' + b64(JSON.stringify(req)) + ' -->';

    const res = await fetch('https://api.github.com/repos/' + repo + '/issues', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
        'User-Agent': 'shastri-portal-suggest', 'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body, labels: ['suggestion'] })
    });
    if (!res.ok) return json({ error: 'github_' + res.status }, 502);
    const j = await res.json();
    return json({ ok: true, id: j.number });
  } catch (e) {
    return json({ error: 'server' }, 500);
  }
}
export const onRequest = () => json({ error: 'method_not_allowed' }, 405);

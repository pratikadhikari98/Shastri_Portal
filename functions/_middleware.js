/* ================================================
   एउटै ठेगाना (canonical domain) — Google ले दुई ठाउँ (pages.dev र आफ्नै डोमेन) लाई "डुप्लिकेट" नठान्न
   • project.pages.dev  → आफ्नो डोमेनमा स्थायी (301) redirect, path/query जस्ताको तस्तै
   • अरू *.pages.dev (preview deployment) → redirect होइन, तर Google ले index नगरोस् (noindex)
   आफ्नो डोमेन बदल्नुपरे Cloudflare Pages → Settings → Variables मा CANONICAL_HOST राख्नुस्
   ================================================ */
const DEFAULT_HOST = 'shastri-portal.pratikadhikari98.com.np';

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const target = ((env && env.CANONICAL_HOST) || DEFAULT_HOST).toLowerCase();

  if (host.endsWith('.pages.dev') && host !== target) {
    if (host.split('.').length === 3) {                 // project.pages.dev — मुख्य ठेगाना
      url.protocol = 'https:'; url.hostname = target; url.port = '';
      return Response.redirect(url.toString(), 301);
    }
    const res = await next();                           // hash.project.pages.dev — preview
    const out = new Response(res.body, res);
    out.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return out;
  }
  return next();
}

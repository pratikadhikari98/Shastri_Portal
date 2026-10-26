// शास्त्री पोर्टल — Service Worker v25
// ⚡ Speed: app shell/फन्ट/फोटो = STALE-WHILE-REVALIDATE (cache बाट तुरुन्तै, पछाडि ताजा तान्ने)
//    data/* = network-first तर ढिलो नेटवर्कमा २.५s पछि cache। कोड अपडेट गर्दा APP_CACHE को नम्बर बढाउनुस्।
const APP_CACHE      = 'shastri-app-v152';     // App shell (auto)
const OFFLINE_CACHE  = 'shastri-offline-v2';  // User-triggered "Save for offline" content
const DATA_CACHE     = 'shastri-data-v2';     // data/* (अध्याय आदि) — app version बदलिँदा पनि मेटिँदैन

const APP_ASSETS = [
  './',
  './css/style.css',
  './fonts/Siddhanta.woff',
  './fonts/AnandaDevanagariRound.woff',
  './js/main.js',
  './js/translate.js',
  './js/admin.js',
  './js/github-api.js',
  './js/zip-upload.js',
  './js/rich-editor.js',
  './js/editor-toolbar.js',
  './data/books.json',
  './data/subjects.json',
  './data/news.json',
  './data/feed.json',
  './data/contributors.js',
  './manifest.json',
  './images/nepal-skyline.webp',
];


// Redirect भएको (redirected) response लाई navigation मा सिधै दिँदा Chrome ले ERR_FAILED देखाउँछ — सफा प्रतिलिपि बनाएर दिने
// डेटा फाइलको सट्टा HTML पृष्ठ (Cloudflare को SPA fallback) आयो कि?
function isHtml(res) { return /text\/html/i.test((res && res.headers && res.headers.get('content-type')) || ''); }

function clean(res) {
  if (!res || !res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE).then(c => Promise.all(APP_ASSETS.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== APP_CACHE && k !== OFFLINE_CACHE && k !== DATA_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // GitHub API (Admin को सम्पादन) र लेख्ने (PUT/POST/DELETE) request लाई कहिल्यै नछेक्ने
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).hostname === 'api.github.com') return;
  const url = e.request.url;
  const isData = url.includes('/data/');

  // PDF.js (cdnjs): पहिलो पटक network बाट, त्यसपछि cache बाट (PDF अफलाइन देखाउन)
  if (url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/')) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res && res.ok) { const c = res.clone(); caches.open(DATA_CACHE).then(ca => ca.put(e.request, c)); }
      return res;
    })());
    return;
  }

  // पृष्ठ खोल्ने (navigate) request: network पहिले (redirect ब्राउजरले आफैं सम्हाल्छ); offline भए cache गरिएको './'
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await Promise.race([
          fetch(e.request),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000)),
        ]);
      } catch (err) {
        const c = (await caches.match('./')) || (await caches.match('./index.html'));
        return c ? clean(c) : Response.error();
      }
    })());
    return;
  }

  // ⚡ डाटा (किताब/सूचना/अध्याय): network-first, तर ढिलो नेटवर्कमा २.५ सेकेन्डपछि cache दिने
  //    (ताजा डाटा आउनासाथ cache अपडेट हुन्छ)
  // PDF फाइल (नाम अद्वितीय, कहिल्यै बदलिँदैन): cache-first. साइटले (SPA fallback) PDF को सट्टा HTML दियो भने cache नगर्ने
  if (isData && /\.pdf(\?|#|$)/i.test(url)) {
    if (e.request.headers.has('range')) return;   // आंशिक (Range) माग सिधै नेटवर्कमा — पूरै फाइल मात्र सेभ गर्ने
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit && !isHtml(hit)) return hit;
      const res = await fetch(e.request);
      if (res && res.status === 200 && !isHtml(res)) { const c = res.clone(); caches.open(DATA_CACHE).then(ca => ca.put(e.request, c)); }
      return res;
    })());
    return;
  }

  if (isData) {
    e.respondWith((async () => {
      const cacheMatch = () => caches.match(e.request).then(r => r || caches.match(e.request, { cacheName: OFFLINE_CACHE })).then(r => (r && !isHtml(r)) ? r : undefined);
      const net = fetch(e.request).then(res => {
        if (res && res.ok && !isHtml(res)) { const c = res.clone(); caches.open(DATA_CACHE).then(ca => ca.put(e.request, c)); }
        return res;
      });
      const cached = await cacheMatch();
      if (!cached) return net.catch(() => new Response('', { status: 504 }));
      return Promise.race([net.catch(() => cached), new Promise(r => setTimeout(() => r(cached), 2500))]);
    })());
    return;
  }

  // ⚡ बाँकी सबै (html/css/js/फन्ट/फोटो): STALE-WHILE-REVALIDATE
  //    cache भए तुरुन्तै देखाउने (network कुर्दैन), पछाडि ताजा फाइल तानेर अर्को पटकका लागि राख्ने
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    const refresh = fetch(e.request).then(res => {
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) { const c = res.clone(); caches.open(APP_CACHE).then(ca => ca.put(e.request, c)); }
      return res;
    });
    if (cached) { refresh.catch(() => {}); return clean(cached); }
    try { return await refresh; }
    catch (err) {
      const off = await caches.match(e.request, { cacheName: OFFLINE_CACHE });
      return off || Response.error();
    }
  })());
});

// ── "Save for offline" / "Delete offline data" — triggered from the app's ⋮ menu ──
self.addEventListener('message', event => {
  const data = event.data || {};

  if (data.type === 'CACHE_URLS') {
    event.waitUntil((async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      let done = 0;
      for (const url of data.urls) {
        try {
          const res = await fetch(url);
          if (res && res.ok) await cache.put(url, res);
        } catch (err) { /* skip failed items, continue */ }
        done++;
      }
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'CACHE_DONE', total: data.urls.length, done }));
    })());
  }

  if (data.type === 'CLEAR_OFFLINE') {
    event.waitUntil((async () => {
      await caches.delete(OFFLINE_CACHE);
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'CLEAR_DONE' }));
    })());
  }
});

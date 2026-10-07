// शास्त्री पोर्टल — Service Worker v24
// ⚡ Speed: app shell/फन्ट/फोटो = STALE-WHILE-REVALIDATE (cache बाट तुरुन्तै, पछाडि ताजा तान्ने)
//    data/* = network-first तर ढिलो नेटवर्कमा २.५s पछि cache। कोड अपडेट गर्दा APP_CACHE को नम्बर बढाउनुस्।
const APP_CACHE      = 'shastri-app-v27';     // App shell (auto)
const OFFLINE_CACHE  = 'shastri-offline-v2';  // User-triggered "Save for offline" content

const APP_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './fonts/Siddhanta.woff',
  './fonts/AnandaDevanagariRound.woff',
  './js/main.js',
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
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE).then(c => Promise.all(APP_ASSETS.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== APP_CACHE && k !== OFFLINE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // GitHub API (Admin को सम्पादन) र लेख्ने (PUT/POST/DELETE) request लाई कहिल्यै नछेक्ने
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).hostname === 'api.github.com') return;
  const url = e.request.url;
  const isData = url.includes('/data/');

  // ⚡ डाटा (किताब/सूचना/अध्याय): network-first, तर ढिलो नेटवर्कमा २.५ सेकेन्डपछि cache दिने
  //    (ताजा डाटा आउनासाथ cache अपडेट हुन्छ)
  if (isData) {
    e.respondWith((async () => {
      const cacheMatch = () => caches.match(e.request).then(r => r || caches.match(e.request, { cacheName: OFFLINE_CACHE }));
      const net = fetch(e.request).then(res => {
        if (res && res.ok) { const c = res.clone(); caches.open(APP_CACHE).then(ca => ca.put(e.request, c)); }
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
    if (cached) { refresh.catch(() => {}); return cached; }
    try { return await refresh; }
    catch (err) {
      const off = await caches.match(e.request, { cacheName: OFFLINE_CACHE });
      return off || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
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

// शास्त्री पोर्टल — Service Worker v14
// ⚠️ यहाँदेखि app shell (html/css/js) लाई NETWORK-FIRST बनाइयो —
//    अब जहिले पनि internet भएसम्म GitHub बाट ताजा (latest) फाइल नै ल्याउँछ,
//    cache चाहिं offline हुँदा मात्र प्रयोग हुन्छ। यसले "पुरानै देखिने" समस्या जरैबाट हटाउँछ।
const APP_CACHE      = 'shastri-app-v17';     // App shell (auto)
const OFFLINE_CACHE  = 'shastri-offline-v2';  // User-triggered "Save for offline" content

const APP_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
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
  // Chapter/news JS — network first, fallback to offline cache, then app cache
  if (e.request.url.includes('/data/chapters/') || e.request.url.includes('/data/news')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request, { cacheName: OFFLINE_CACHE }).then(r => r || caches.match(e.request))
      )
    );
    return;
  }
  // बाँकी सबै (html/css/js/manifest/books.json) — NETWORK FIRST
  // (internet भए सधैं ताजा फाइल; offline भए मात्र cache बाट देखाउने)
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(APP_CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || caches.match(e.request, { cacheName: OFFLINE_CACHE }))
        .then(r => r || caches.match('./index.html'))
    )
  );
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

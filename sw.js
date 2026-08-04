const CACHE_NAME = 'share-bible-v1';
const CORE_FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_URLS') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    let failed = 0;
    for (const url of event.data.urls || []) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        await cache.put(url, response);
      } catch { failed += 1; }
    }
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'CACHE_COMPLETE', failed }));
  })());
});

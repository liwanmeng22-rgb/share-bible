const CACHE_NAME = 'share-bible-v4';
const DATA_CACHE_NAME = 'share-bible-data-v1';
const CORE_FILES = ['./', './index.html', './reader-speech.js', './manifest.webmanifest', './icon.svg'];
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const DATA_PATH = new URL('./data/', self.registration.scope).pathname;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const dataCache = await caches.open(DATA_CACHE_NAME);
    const oldNames = (await caches.keys()).filter(name => /^share-bible-v\d+$/.test(name) && name !== CACHE_NAME);
    // Preserve downloaded scripture while replacing old HTML caches.
    for (const name of oldNames) {
      const old = await caches.open(name);
      for (const request of await old.keys()) {
        if (!new URL(request.url).pathname.startsWith(DATA_PATH)) continue;
        const response = await old.match(request);
        if (response) await dataCache.put(request, response);
      }
      await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function readPage(request) {
  const cache = await caches.open(CACHE_NAME);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // Ordinary links always request the current deployed page, even with ref.
    const response = await fetch(request, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error('Page unavailable');
    await cache.put(INDEX_URL, response.clone());
    return response;
  } catch {
    return (await cache.match(INDEX_URL)) || Response.error();
  } finally {
    clearTimeout(timeout);
  }
}

async function readData(request) {
  const cache = await caches.open(DATA_CACHE_NAME);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function readAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Asset unavailable');
    await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (event.request.mode === 'navigate') event.respondWith(readPage(event.request));
  else if (url.pathname.startsWith(DATA_PATH)) event.respondWith(readData(event.request));
  else event.respondWith(readAsset(event.request));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_URLS') return;
  event.waitUntil((async () => {
    const cache = await caches.open(DATA_CACHE_NAME);
    let failed = 0;
    for (const path of event.data.urls || []) {
      try {
        const url = new URL(path, self.registration.scope);
        if (url.origin !== location.origin || !url.pathname.startsWith(DATA_PATH)) throw new Error('Invalid cache path');
        const response = await fetch(url.href);
        if (!response.ok) throw new Error(String(response.status));
        await cache.put(url.href, response);
      } catch { failed += 1; }
    }
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'CACHE_COMPLETE', failed }));
  })());
});

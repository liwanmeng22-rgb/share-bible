const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const origin = 'https://example.test';
const scope = origin + '/share-bible/';
const handlers = {};
const stores = new Map();
const key = request => new URL(typeof request === 'string' ? request : request.url, scope).href;
const caches = {
  keys: async () => [...stores.keys()],
  delete: async name => stores.delete(name),
  open: async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const values = stores.get(name);
    return {
      match: async r => values.get(key(r))?.clone(),
      put: async (r, response) => values.set(key(r), response.clone()),
      keys: async () => [...values.keys()].map(url => new Request(url)),
      addAll: async requests => {
        for (const r of requests) {
          assert.equal(r.cache, 'reload');
          values.set(key(r), new Response('installed'));
        }
      }
    };
  }
};
let offline = false;
let fetches = 0;
const context = vm.createContext({
  URL, Request, Response, AbortController, setTimeout, clearTimeout, caches,
  location: {origin},
  self: {registration: {scope}, addEventListener: (n,f) => handlers[n] = f,
    skipWaiting: async () => {}, clients: {claim: async () => {}}},
  fetch: async (request, options) => {
    fetches++;
    if (offline) throw new Error('offline');
    if (key(request).includes('?ref=')) assert.equal(options.cache, 'no-cache');
    return new Response('deployed-new-version');
  }
});
vm.runInContext(readFileSync('sw.js', 'utf8'), context);
async function lifecycle(name) {
  let work;
  handlers[name]({waitUntil: promise => work = promise});
  await work;
}
(async () => {
  const old = await caches.open('share-bible-v2');
  await old.put(scope + '?ref=mat.20', new Response('stale-page'));
  await old.put(scope + 'data/gen.json', new Response('downloaded-book'));
  await caches.open('another-app');
  await lifecycle('install');
  await lifecycle('activate');
  assert(stores.has('another-app'), 'must not remove other apps caches');
  assert(!stores.has('share-bible-v2'));
  const nav = new Request(scope + '?ref=mat.20');
  assert.equal(await (await context.readPage(nav)).text(), 'deployed-new-version');
  offline = true;
  assert.equal(await (await context.readPage(new Request(scope + '?ref=gen.8'))).text(), 'deployed-new-version');
  const before = fetches;
  assert.equal(await (await context.readData(new Request(scope + 'data/gen.json'))).text(), 'downloaded-book');
  assert.equal(fetches, before, 'offline scripture must use preserved data cache');
  let handled = false;
  handlers.fetch({request: {url: 'https://other.test/', method: 'GET'}, respondWith: () => handled = true});
  assert.equal(handled, false);
  const html = readFileSync('index.html','utf8');
  new Function(html.split('<script>')[1].split('</script>')[0]);
  console.log('PASS: fresh navigations, offline fallback, preserved scripture, scoped cleanup, cross-origin passthrough, script syntax');
})().catch(error => {console.error(error); process.exitCode = 1;});

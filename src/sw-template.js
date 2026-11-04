// Keeps a copy of the site on the device so it opens with no internet. Written by vite.config.ts.
// This only holds the site itself. Students' work lives in the browser's own storage, untouched by this.
const CACHE = 'study-forge-__VERSION__';
const FILES = "__FILES__";
const INDEX = new URL('./index.html', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  // A new version waits until the student chooses to refresh, so nothing changes in the middle of their work.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('study-forge-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'use-new-version') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Sign-in, saving online, and other services go straight to the internet.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      const page = await cache.match(INDEX, { ignoreVary: true });
      if (page) return page;
    }
    return (await cache.match(request, { ignoreSearch: true, ignoreVary: true })) ?? fetch(request);
  })());
});

// Service worker: deja la app del guardia disponible sin conexión.
//
// Estrategia: network-first con respaldo en caché. Con conexión, siempre se
// sirve la versión fresca del servidor (los deploys llegan solos a los
// teléfonos); sin conexión, se sirve el shell cacheado y la ronda sigue.
// El API va siempre por red (la cola offline vive en la app, no acá).
//
// VERSION: subirla en cada release (junto con package.json) — invalida el
// caché viejo en activate.
const VERSION = 'v1.1.0';
const CACHE = 'rondasqr-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'app.js',
  'estilos.css',
  'manifest.webmanifest',
  'icono.svg',
  'vendor/jsqr.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

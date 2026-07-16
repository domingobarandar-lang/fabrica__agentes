// Service worker: deja la app del guardia disponible sin conexión.
// El API va siempre por red (la cola offline vive en la app, no acá).
const CACHE = 'rondasqr-v1';
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
    caches.match(e.request, { ignoreSearch: true }).then(guardada =>
      guardada ||
      fetch(e.request).then(resp => {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return resp;
      })
    )
  );
});

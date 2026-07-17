/* FertiControl — Service Worker
 *
 * Rende l'app installabile e utilizzabile offline quando è servita via HTTP(S).
 * Non ha effetto se la pagina è aperta da file:// (i service worker richiedono
 * un contesto sicuro): in quel caso l'app funziona come sempre, senza cache.
 *
 * ⚠️ Ad ogni modifica del file dell'app, incrementa CACHE_VERSION: forza
 *    l'aggiornamento della cache e il ricaricamento della nuova versione.
 */
const CACHE_VERSION = 'v2.0.3';
const CACHE_NAME = 'ferticontrol-' + CACHE_VERSION;

// Risorse dell'app shell (percorsi relativi allo scope del SW).
const APP_SHELL = [
  'Ferticontrol1.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('ferticontrol-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo GET same-origin: i font Google (cross-origin) vanno in rete e,
  // offline, degradano ai font di sistema — comportamento voluto.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first: prende sempre l'ultima versione se online, altrimenti cache.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('Ferticontrol1.html')))
    );
  } else {
    // Cache-first per asset statici (icone, manifest).
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached))
    );
  }
});

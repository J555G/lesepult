// Offline cache for the app shell (dictionaries live in IndexedDB, not here).
const CACHE = 'lesepult-v12';
const FILES = ['./', 'index.html', 'app.js', 'style.css', 'fonts.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  ...['greek', 'greek-ext', 'latin', 'latin-ext'].flatMap(s => ['400-normal', '700-normal', '400-italic'].map(w => `fonts/gentium-book-plus-${s}-${w}.woff2`))];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // network first (so updates arrive), cache as offline fallback
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});

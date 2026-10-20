// Pult Atlas · offline helper: everything from the network first (so a rebuilt atlas shows at once), the stored copy when
// offline or slow. Its own scope (/lesepult/atlas/); Pult's helper leaves these addresses alone.
const CACHE = 'pult-atlas';
const FILES = ['./', 'index.html', 'model.json', 'history.json', 'd3.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png',
  '../fonts.css', ...['latin', 'latin-ext', 'greek', 'greek-ext'].map(x => `../fonts/source-sans-3-${x}-wght-normal.woff2`), ...['greek', 'greek-ext', 'latin', 'latin-ext'].flatMap(s => ['400-normal', '700-normal', '400-italic', '700-italic'].map(w => `../fonts/gentium-book-plus-${s}-${w}.woff2`))];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(new Request(f, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : req.url.split('?')[0];
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(req, { signal: ctl.signal, cache: 'no-cache' }); clearTimeout(t); if (r.ok) c.put(key, r.clone()); return r;
    } catch (_) { return (await c.match(key)) || Response.error(); }
  })());
});

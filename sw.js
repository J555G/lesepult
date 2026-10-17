// Offline cache for the app shell (dictionaries and texts live in IndexedDB, not here).
const CACHE = 'lesepult-v185';
const FILES = ['./', 'index.html', 'core.js', 'analysis.js', 'text.js', 'dictview.js', 'dialogs.js', 'export.js', 'library.js', 'app.js', 'maps.js', 'maplayers.js', 'mapsaved.js', 'mapdraw.js', 'maprelief.js', 'style.css', 'fonts.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/roboto-condensed-latin-400-normal.woff2',
  ...['greek', 'greek-ext', 'latin', 'latin-ext'].flatMap(s => ['400-normal', '700-normal', '400-italic'].map(w => `fonts/gentium-book-plus-${s}-${w}.woff2`))];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(r => {
    if (!r.ok) throw new Error(f);
    return c.put(f, clean(r));
  })))).then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'pult-maps').map(k => caches.delete(k)))).then(() => self.clients.claim())));

// Safari refuses to show a page from a service worker if the response was redirected
// (e.g. GitHub Pages: /lesepult → /lesepult/) – store and serve a clean copy instead.
function clean(r) {
  if (!r.redirected) return r;
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
}

// network with a time limit: offline, iOS often lets a request hang instead of failing
function net(url, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { cache: 'no-cache', signal: ctl.signal }).finally(() => clearTimeout(t));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), path = url.pathname;
  if (url.origin !== self.location.origin) return;   // e.g. the private repository (GitHub API): never cached
  if (!path.startsWith(new URL(self.registration.scope).pathname)) return;   // other sites on the same host (the map packages, lesepult-maps): straight to the network
  if (path.includes('/packages/') || path.includes('/texts/')) return;   // dictionary and text downloads go straight to the network (stored in IndexedDB)
  // map data (Dictionaries → Maps): from the downloaded copy, otherwise from the network
  // the list of map packages: always the newest from the network (so new packages and updates show), the stored copy offline
  if (path.endsWith('/maps/maps.json')) { e.respondWith(net(url.href.split('?')[0], 6000).then(r => { if (!r.ok) throw 0; return r; }).catch(() => caches.open('pult-maps').then(c => c.match(url.href.split('?')[0])).then(r => r || Response.error()))); return; }
  if (path.includes('/maps/')) { e.respondWith(caches.open('pult-maps').then(c => c.match(url.href.split('?')[0])).then(r => r || fetch(req))); return; }
  const page = req.mode === 'navigate';
  const key = page ? 'index.html' : url.href.split('?')[0];
  // network first (so updates arrive), the cached copy when offline or slow
  e.respondWith(net(url.href.split('#')[0], page ? 4000 : 8000).then(r => {
    if (!r.ok) throw new Error(r.status);
    const c = clean(r), copy = c.clone();
    caches.open(CACHE).then(ca => ca.put(key, copy));
    return c;
  }).catch(async () => {
    const hit = await caches.match(key, { ignoreSearch: true }) || await caches.match(req, { ignoreSearch: true })
      || (page && (await caches.match('./') || await caches.match('index.html')));
    // not in the cache either (e.g. just replaced by a new version): the network once more, without a time limit
    return hit || fetch(req).catch(() => Response.error());
  }));
});

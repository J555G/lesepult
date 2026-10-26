// Offline cache for the app shell (dictionaries and texts live in IndexedDB, not here).
importScripts('reliefsw.js');                                        // (the saved relief: reliefServe)
const CACHE = 'lesepult-v442';
const FILES = ['./', 'index.html', 'crash.js', 'core.js', 'analysis.js', 'text.js', 'dictview.js', 'dialogs.js', 'export.js', 'library.js', 'libtime.js', 'libmenu.js', 'librev.js', 'glosses.js', 'search.js', 'people.js', 'tempora.js', 'app.js', 'maps.js', 'maplibre-contour.js', 'reliefsw.js', 'maplayers.js', 'mapsaved.js', 'mapdraw.js', 'maprelief.js', 'tinysdf.js', 'mapimg.js', 'mapsun.js', 'mapcam.js', 'sky/sun.webp', 'sky/moonface.webp', 'sky/zodiac-rings.webp', 'sky/zodiac-helios.webp', 'sky/zodiac.json', 'sky/stars.json', 'style.css', 'fonts.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/roboto-condensed-latin-400-normal.woff2', ...['latin', 'latin-ext', 'greek', 'greek-ext'].map(x => `fonts/source-sans-3-${x}-wght-normal.woff2`), 'fonts/source-sans-3-latin-wght-italic.woff2', 'fonts/source-sans-3-latin-ext-wght-italic.woff2',
  ...['greek', 'greek-ext', 'latin', 'latin-ext'].flatMap(s => ['400-normal', '700-normal', '400-italic', '700-italic'].map(w => `fonts/gentium-book-plus-${s}-${w}.woff2`))];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(r => {
    if (!r.ok) throw new Error(f);
    return c.put(f, clean(r));
  })))).then(() => self.skipWaiting())));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'pult-maps' && k !== RELIEF && k !== 'pult-lib').map(k => caches.delete(k)))).then(() => self.clients.claim())));

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

// the page asks which version this is (Settings shows it): answered from the name above, without touching the stored files (v371)
self.addEventListener('message', e => { if (e.data === 'pult-ver') e.ports?.[0]?.postMessage(+CACHE.split('-v')[1]); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), path = url.pathname;
  if (url.hostname === MH_HOST) { e.respondWith(reliefServe(req)); return; }   // Mapterhorn: the saved areas first
  if (url.origin !== self.location.origin) return;   // e.g. the private repository (GitHub API): never cached
  if (!path.startsWith(new URL(self.registration.scope).pathname)) return;   // other sites on the same host (the map packages, lesepult-maps): straight to the network
  if (path.includes('/packages/') || path.includes('/texts/') || path.includes('/atlas/')) return;   // (the atlas web app has its own helper – v349)
  // large libraries (lib/, their version in the name): kept apart, across updates of the app – fetched once, then from the cache
  // (only the app's own lib/ – not maps/base/lib/, which belongs to the downloaded map package below – v347)
  if (path.startsWith(new URL(self.registration.scope).pathname + 'lib/')) { e.respondWith(caches.open('pult-lib').then(async c => (await c.match(url.href)) || fetch(req).then(r => { if (r.ok) c.put(url.href, r.clone()); return r; }))); return; }   // dictionary and text downloads go straight to the network (stored in IndexedDB)
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

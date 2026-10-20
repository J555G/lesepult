// The atlas has moved to https://j555g.github.io/Pult-atlas/ – this old offline helper clears its store and removes itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  await caches.delete('pult-atlas'); await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('https://j555g.github.io/Pult-atlas/');
})()));

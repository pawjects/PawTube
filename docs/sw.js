const CACHE_NAME = 'pawtube-v7';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './player.js',
  
  './app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Never cache API or video image calls so feed/thumbnails stay live
  if (
    event.request.url.includes('/api/') || 
    event.request.url.includes('/api/v1/') || 
    event.request.url.includes('googlevideo.com') ||
    event.request.url.includes('googlevideo.com')
  ) {
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) { return response; }
        return fetch(event.request);
      })
  );
});

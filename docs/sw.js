const CACHE_NAME = 'pawtube-v5';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Never cache Piped API or YouTube image calls so the feed stays live
  if (event.request.url.startsWith('https://piped-instances') || event.request.url.includes('ytimg.com')) {
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

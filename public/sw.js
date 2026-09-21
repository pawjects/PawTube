const CACHE_NAME = 'pawtube-v10';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/public/manifest.webmanifest',
  '/public/assets/pawtube_logo.png',
  '/src/styles/tokens.css',
  '/src/styles/global.css',
  '/src/styles/liquid-glass.css',
  '/src/styles/responsive.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Critical requirement: NEVER intercept or cache /api/* or external media/thumbnails
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('googlevideo.com') ||
    url.hostname.includes('ytimg.com') ||
    url.hostname.includes('piped')
  ) {
    return;
  }

  // Network-first with cache fallback for HTML pages
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first with network fallback for other static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const resToCache = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resToCache));
        return res;
      }).catch(() => null);
    })
  );
});

const CACHE_NAME = 'invoice-system-v18';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase-sync.js',
  './pdf-generator.js',
  './jspdf.umd.min.js',
  './MPLUS1p-Regular.ttf',
  './MPLUS1p-Bold.ttf',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Firebase/Firestore の通信はキャッシュしない
  if (url.includes('firebasejs') || url.includes('googleapis.com') || url.includes('firestore')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

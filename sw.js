// Keeps a copy of the app on your phone so it opens without internet.
// When you change any app file, bump the version number below so phones pick up the new files.
var CACHE = 'grocery-v17';
var FILES = [
  './',
  'index.html',
  'style.css',
  'catalog.js',
  'app.js',
  'manifest.json',
  'icon.svg',
  'icon-sage-180.png',
  'icon-sage-192.png',
  'icon-sage-512.png'
];

// 'reload' skips the browser's own short-term cache, so an update really gets the new files
// (otherwise a phone that opened the app a few minutes ago could save the old ones again).
self.addEventListener('install', function (e) {
  var fresh = FILES.map(function (f) { return new Request(f, { cache: 'reload' }); });
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(fresh); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Show the saved copy right away, and quietly fetch a fresh one for next time.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (cached) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () {
        return cached || (req.mode === 'navigate' ? cache.match('index.html') : undefined);
      });
      return cached || fresh;
    });
  }));
});

// Cache version is stamped at build time (vite closeBundle rewrites the
// token in dist/sw.js). The raw token never ships: dev serves public/ but
// never registers the SW from vite dev, and the fallback covers any edge.
const BUILD_ID = "__SW_BUILD_ID__".includes("BUILD_ID") ? "dev" : "__SW_BUILD_ID__";
const CACHE = `sunbird-shell-${BUILD_ID}`;
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/icons/favicon-64.png",
  "/fonts/fredoka-latin-500-normal.woff2",
  "/fonts/fredoka-latin-600-normal.woff2",
  "/fonts/fredoka-latin-700-normal.woff2",
  "/fonts/atkinson-hyperlegible-latin-400-normal.woff2",
  "/fonts/atkinson-hyperlegible-latin-400-italic.woff2",
  "/fonts/atkinson-hyperlegible-latin-700-normal.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Only cache same-origin requests to prevent cross-origin cache poisoning
  if (!event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
            return res;
          })
          .catch(() => caches.match("/index.html")),
    ),
  );
});

// Real notification surface used by the daily-hills reminder (in-app while open).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    if (list[0]) return list[0].focus();
    return self.clients.openWindow("/");
  }));
});

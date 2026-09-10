const CACHE = "sunbird-shell-v4";
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/icons/favicon-64.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const url of PRECACHE) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn("SW precache failed:", url, e);
        }
      }
    }),
  );
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
  // Network-first with timeout fallback to cache for navigation requests;
  // cache-first for assets to avoid redundant downloads.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        fetch(event.request, { signal: controller.signal })
          .then((res) => {
            clearTimeout(timeout);
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
            }
            return res;
          })
          .catch(() => {
            clearTimeout(timeout);
            return cached || caches.match("/index.html");
          }),
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

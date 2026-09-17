const CACHE = "niva-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./core.js",
  "./app.js",
  "./visual.js",
  "./icon.svg",
  "./manifest.json",
  "./sample-bank-export.csv",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.allSettled(ASSETS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});

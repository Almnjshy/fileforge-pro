// FileForge Pro — Service Worker
// Strategy: stale-while-revalidate for same-origin GETs, with precaching of
// key routes. Falls back to the cached app shell for navigation requests
// when offline.

const CACHE_NAME = "fileforge-v3";

// Key routes to precache on install. _next/static/* chunks are picked up
// dynamically at runtime (SWR), so we only hardcode the app shell here.
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll is atomic — if any URL fails, the whole install aborts, so
      // we use Promise.allSettled-style swallowing for resilience.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => { /* ignore individual precache failures */ })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Skip non-GET requests
  if (req.method !== "GET") return;
  // Skip Next.js HMR and cross-origin requests
  if (req.url.includes("_next/webpack-hmr")) return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Stale-while-revalidate: serve from cache immediately, then update the
  // cache from the network in the background. Falls back to cache (or the
  // app shell for navigations) when offline.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            cache.put(req, response.clone());
          }
          return response;
        })
        .catch(() => {
          // Network failed — if this is a navigation, fall back to the
          // cached app shell so the user gets *something* instead of the
          // browser's offline dinosaur.
          if (req.mode === "navigate") {
            return cache.match("/");
          }
          // Otherwise, return the cached response if we have one; if not,
          // return a minimal Response so the call site sees something.
          return cached || new Response("", { status: 504, statusText: "Offline" });
        });
      // Return the stale cached response immediately, or wait for the
      // network if there's no cached copy yet.
      return cached || networkFetch;
    })
  );
});

// Listen for messages from clients
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

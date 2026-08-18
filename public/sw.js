// Grand Football — Service Worker
// Enables PWA install prompt and basic offline support
// Cache version — bump this string on every deployment to bust stale caches
const CACHE_NAME = 'grand-football-v3';

// Shell assets to pre-cache on install
const PRECACHE_URLS = ['/manifest.json', '/icons/icon-192x192.png', '/icons/icon-512x512.png'];

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
        ),
      self.registration.navigationPreload?.enable(),
    ]).then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
// Network-first for API/auth routes, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API and auth responses must always come from the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // Hashed Next.js assets are immutable. Cache them after first use so repeat
  // PWA launches do not wait on the network for the application shell.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Other Next.js internals (image optimization and RSC development requests)
  // keep their framework-managed caching behaviour.
  if (url.pathname.startsWith('/_next/')) return;

  // Cache-first for static assets (icons, manifest)
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  // Navigation preload starts the request while the service worker boots,
  // avoiding the extra startup delay seen in installed PWAs. Authenticated
  // HTML is intentionally not cached on-device.
  if (request.mode === 'navigate') {
    event.respondWith(
      Promise.resolve(event.preloadResponse).then((preloaded) => preloaded || fetch(request)),
    );
    return;
  }

  // Network-first fallback for non-navigation same-origin resources.
  event.respondWith(
    fetch(request)
      .then((response) => {
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});

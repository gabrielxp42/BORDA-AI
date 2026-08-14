const CACHE_NAME = 'borda-ai-cache-v1.0.2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

// 1. Install Event: Skip waiting and force activation immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[PWA SW] Non-critical static cache error:', err);
      });
    })
  );
});

// 2. Activate Event: Clean up old caches & claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[PWA SW] Removing legacy cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. Listen for message from app UI (e.g. forced update button)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Event: Network-first for HTML, APIs & Fonts, Stale-while-revalidate for static assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests, WebSockets, and browser extensions
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // Supabase, Google Fonts & External APIs -> Network Only with safe fallback
  if (
    url.hostname.includes('supabase.co') || 
    url.hostname.includes('focusnfe') || 
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.pathname.startsWith('/api')
  ) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response('', { status: 404, statusText: 'Offline or Network Error' });
      })
    );
    return;
  }

  // HTML / App Shell Navigation -> Network First with Cache Fallback
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clonedResponse));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallbackHtml = await caches.match('/index.html') || await caches.match('/');
          if (fallbackHtml) return fallbackHtml;
          return new Response('<h1>Offline - BORDA AI</h1>', { headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // Static Assets (CSS, JS, Images) -> Stale While Revalidate with guaranteed Response fallback
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise.catch(() => new Response('', { status: 404 }));
    })
  );
});

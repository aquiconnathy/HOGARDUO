/**
 * HogarDúo Service Worker - Network-First Smart Auto-Update & Offline Fallback
 * Never requires manual cache clearing. Always pulls latest code on refresh.
 */
const CACHE_NAME = 'hogarduo-cache-v4-' + Date.now();

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/main.css',
  './css/components.css',
  './icons/icon.svg',
  './js/audio-fx.js',
  './js/store.js',
  './js/cloud-sync.js',
  './js/notes.js',
  './js/bcv.js',
  './js/tasks.js',
  './js/pantry.js',
  './js/shopping.js',
  './js/personal.js',
  './js/app.js',
  './manifest.webmanifest'
];

// 1. Instalación inmediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
});

// 2. Activación y purga inmediata de cachés viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia NETWORK-FIRST (La red manda siempre; el caché es solo de respaldo offline)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // APIs y Firebase siempre en vivo
  if (
    event.request.url.includes('firebaseio.com') ||
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('gstatic.com') ||
    event.request.url.includes('dolarvzla.com') ||
    event.request.url.includes('qrserver.com') ||
    event.request.url.includes('/api/')
  ) {
    return;
  }

  // Network-First con fallback a Caché
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Solo si no hay internet se usa el caché
        return caches.match(event.request);
      })
  );
});

// 4. Manejo de Clic en Notificaciones Push
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});

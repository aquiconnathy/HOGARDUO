/**
 * HogarDúo - Firebase Cloud Messaging Background Service Worker (Google FCM + Web Push)
 * Handles background push notifications when the app is closed, minimized or phone is locked.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCu5DDDWmxo8024xjN7hUMfs-lfyC9uHP4",
  authDomain: "hogarduo-ncwr1912.firebaseapp.com",
  projectId: "hogarduo-ncwr1912",
  storageBucket: "hogarduo-ncwr1912.firebasestorage.app",
  messagingSenderId: "148710209559",
  appId: "1:148710209559:web:6c724b7bffc7a5b59cc452"
});

let messaging = null;
try {
  messaging = firebase.messaging();
} catch (e) {
  console.warn('FCM SW init error:', e);
}

// 1. Mensajes en segundo plano a través de Firebase Cloud Messaging
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || '💌 Mensaje de tu Pareja';
    const body = payload.notification?.body || payload.data?.body || 'Tienes una nueva nota de amor en HogarDúo ❤️';

    const notificationOptions = {
      body: body,
      icon: 'icons/icon.svg',
      badge: 'icons/icon.svg',
      vibrate: [200, 100, 200],
      tag: 'hogarduo-fcm-' + Date.now(),
      renotify: true,
      requireInteraction: false,
      data: {
        url: './index.html'
      }
    };

    return self.registration.showNotification(title, notificationOptions);
  });
}

// 2. Receptor Genérico de Web Push Estándar (W3C Push API)
self.addEventListener('push', (event) => {
  let title = '💌 Mensaje de tu Pareja';
  let body = 'Tienes un nuevo mensaje en HogarDúo ❤️';

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || data.notification?.title || title;
      body = data.body || data.message || data.notification?.body || body;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: 'icons/icon.svg',
    badge: 'icons/icon.svg',
    vibrate: [200, 100, 200],
    tag: 'hogarduo-push-' + Date.now(),
    renotify: true,
    data: {
      url: './index.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 3. Manejo de Clic en la Notificación
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

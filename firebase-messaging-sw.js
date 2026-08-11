/**
 * HogarDúo - Firebase Cloud Messaging Background Service Worker (Google FCM)
 * Handles background push notifications when the app is completely closed or screen is locked.
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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || '💌 Mensaje de tu Pareja';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'Tienes una nueva nota de amor en HogarDúo ❤️',
    icon: 'icons/icon.svg',
    badge: 'icons/icon.svg',
    vibrate: [200, 100, 200],
    tag: 'hogarduo-fcm-' + Date.now(),
    renotify: true,
    data: {
      url: './index.html'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

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

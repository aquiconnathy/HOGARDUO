/**
 * Vercel Serverless Function: /api/push
 * Sends real Web Push notifications directly to Google & Apple Push Notification Services
 * to wake up mobile phones when locked or with the app closed.
 */
const webpush = require('web-push');

// Configuración VAPID dedicada para HogarDúo
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuYkr3qBUYIhbQFLXYp5Nksh8U';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UUxI90H-1i_BmswY4tKq2wN-4Cq8Z_0yBw19XlXyM_E';
const VAPID_SUBJECT = 'mailto:soporte@hogarduo.vercel.app';

try {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} catch (e) {
  console.warn('VAPID init error:', e);
}

module.exports = async (req, res) => {
  // Configurar encabezados CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { subscription, title, body, icon, url, householdCode, targetUser } = req.body;

    let targetSubscription = subscription;

    // Si no enviaron la suscripción en el cuerpo pero enviaron householdCode y targetUser,
    // consultar la base de datos de Firebase Realtime Database
    if (!targetSubscription && householdCode && targetUser) {
      const cleanCode = householdCode.toLowerCase().replace(/[^a-z0-9]/g, '');
      const dbUrl = `https://hogarduo-ncwr1912-default-rtdb.firebaseio.com/households/${cleanCode}/subscriptions/${targetUser}.json`;
      
      const dbRes = await fetch(dbUrl);
      if (dbRes.ok) {
        targetSubscription = await dbRes.json();
      }
    }

    if (!targetSubscription || !targetSubscription.endpoint) {
      return res.status(400).json({ error: 'No active push subscription found for target device.' });
    }

    const payload = JSON.stringify({
      title: title || '💌 Mensaje de tu Pareja',
      body: body || 'Tienes una nueva nota de amor en HogarDúo ❤️',
      icon: icon || 'icons/icon.svg',
      badge: 'icons/icon.svg',
      vibrate: [300, 150, 300, 150, 300],
      tag: 'hogarduo-fcm-' + Date.now(),
      data: {
        url: url || './index.html'
      }
    });

    const options = {
      TTL: 86400, // 24 horas de persistencia en los servidores de Google
      urgency: 'high'
    };

    const pushResult = await webpush.sendNotification(targetSubscription, payload, options);

    return res.status(200).json({
      success: true,
      statusCode: pushResult.statusCode,
      message: 'Push notification delivered to Google FCM / Apple APNs.'
    });
  } catch (error) {
    console.error('Push delivery error:', error);
    return res.status(500).json({
      error: 'Failed to deliver push notification',
      details: error.message
    });
  }
};

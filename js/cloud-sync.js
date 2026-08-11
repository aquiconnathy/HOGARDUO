/**
 * CloudSync - Google Firebase Realtime Engine + Vercel Serverless Web Push (/api/push)
 * Hardware-level push notifications waking up the phone when locked and app is closed.
 */
const CloudSync = {
  firebaseConfig: {
    apiKey: "AIzaSyCu5DDDWmxo8024xjN7hUMfs-lfyC9uHP4",
    authDomain: "hogarduo-ncwr1912.firebaseapp.com",
    databaseURL: "https://hogarduo-ncwr1912-default-rtdb.firebaseio.com",
    projectId: "hogarduo-ncwr1912",
    storageBucket: "hogarduo-ncwr1912.firebasestorage.app",
    messagingSenderId: "148710209559",
    appId: "1:148710209559:web:6c724b7bffc7a5b59cc452",
    measurementId: "G-1E7PXG23FV"
  },

  // Clave Pública VAPID estándar para Web Push
  vapidKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuYkr3qBUYIhbQFLXYp5Nksh8U",

  householdCode: '19125118',
  sessionId: null,
  currentUserId: 'p1', // 'p1' (Ella) o 'p2' (Él)
  dbRef: null,
  mySubscription: null,
  partnerSubscription: null,
  isConnected: false,
  isInitialized: false,
  lastNotifiedNoteId: null,

  init() {
    try {
      this.sessionId = 'ses_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      this.householdCode = (localStorage.getItem('hogarduo_household_code') || '19125118').trim().toUpperCase();
      this.currentUserId = localStorage.getItem('hogarduo_user_id') || 'p1';
      this.lastNotifiedNoteId = localStorage.getItem('hogarduo_last_notified_note') || null;

      // 1. Detectar auto-vinculación por Código QR
      this.checkUrlInviteParams();

      // 2. Listeners de auto-reconexión al despertar el celular
      this.setupReconnectionListeners();

      this.updateCloudUI();
      this.initFirebase();
      setTimeout(() => this.updateDiagnosticsUI(), 300);
    } catch (e) {
      console.warn('CloudSync init error:', e);
    }
  },

  // Auto-reconexión instantánea al desbloquear o enfocar el celular
  setupReconnectionListeners() {
    const handleWakeup = () => {
      if (typeof firebase !== 'undefined' && firebase.database) {
        try { firebase.database().goOnline(); } catch(e) {}
      }
      if (this.dbRef) {
        this.fetchCloudStateOnce();
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleWakeup();
    });
    window.addEventListener('focus', handleWakeup);
    window.addEventListener('online', handleWakeup);
  },

  checkUrlInviteParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get('code') || params.get('hogar');
      const inviteRole = params.get('role');

      if (inviteCode) {
        this.householdCode = inviteCode.trim().toUpperCase();
        localStorage.setItem('hogarduo_household_code', this.householdCode);

        if (inviteRole && (inviteRole === 'p1' || inviteRole === 'p2')) {
          this.currentUserId = inviteRole;
          localStorage.setItem('hogarduo_user_id', inviteRole);
        }

        window.history.replaceState({}, document.title, window.location.pathname);

        setTimeout(() => {
          if (typeof App !== 'undefined') {
            const roleName = this.currentUserId === 'p1' ? 'Persona 1 (Ella)' : 'Persona 2 (Él)';
            App.showToast(`🎉 ¡Vinculado al Hogar "${this.householdCode}" como ${roleName}!`, 'success');
            App.triggerConfetti();
            App.updateProfileUI();
          }
        }, 600);
      }
    } catch (e) {}
  },

  initFirebase() {
    if (typeof firebase === 'undefined') {
      this.updateStatus('online');
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
      }

      this.isInitialized = true;
      this.updateStatus('connecting');

      if (firebase.auth) {
        firebase.auth().signInAnonymously().catch(() => {});
      }

      this.connect();
      this.registerWebPushSubscription();
    } catch (e) {
      console.warn('Firebase init warning:', e);
      this.updateStatus('online');
    }
  },

  // Convertir VAPID Base64 a Uint8Array
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  // Registrar suscripción de hardware Web Push en Google/Apple
  async registerWebPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this.urlBase64ToUint8Array(this.vapidKey)
          });
        }

        if (subscription) {
          this.mySubscription = subscription.toJSON();
          this.savePushSubscription(this.mySubscription);
        }
      }
    } catch (err) {
      console.warn('Web Push subscription skipped:', err);
    }
    this.updateDiagnosticsUI();
  },

  // Guardar suscripción Web Push en Firebase
  savePushSubscription(subscription) {
    if (!subscription || !this.isInitialized || !firebase.database) return;
    try {
      const houseKey = this.getCleanHouseholdKey();
      firebase.database().ref(`households/${houseKey}/subscriptions/${this.currentUserId}`).set({
        ...subscription,
        updatedAt: Date.now()
      });
    } catch (e) {}
  },

  setHouseholdCode(code) {
    if (!code) return;
    this.householdCode = code.trim().toUpperCase();
    try {
      localStorage.setItem('hogarduo_household_code', this.householdCode);
    } catch (e) {}
    this.updateCloudUI();
    this.connect();
    this.registerWebPushSubscription();
  },

  setCurrentUser(userId) {
    this.currentUserId = userId;
    try {
      localStorage.setItem('hogarduo_user_id', userId);
    } catch (e) {}
    this.updateCloudUI();
    if (typeof App !== 'undefined') {
      App.updateProfileUI();
      const p = Store.state?.profiles?.[userId];
      App.showToast(`Dispositivo configurado como: ${p?.name || userId} 📱`, 'success');
    }
    this.registerWebPushSubscription();
  },

  getCleanHouseholdKey() {
    const raw = (this.householdCode || '19125118').toLowerCase().trim();
    const clean = raw.replace(/[^a-z0-9]/g, '');
    return clean || '19125118';
  },

  fetchCloudStateOnce() {
    if (!this.dbRef) return;
    this.dbRef.once('value').then((snapshot) => {
      const cloudData = snapshot.val();
      if (cloudData && cloudData.state) {
        this.mergeIncomingState(cloudData.state);
        Store.notify();
      }
    });
  },

  connect() {
    if (!this.isInitialized || typeof firebase === 'undefined' || !firebase.database) {
      this.updateStatus('online');
      return;
    }

    try {
      const houseKey = this.getCleanHouseholdKey();
      
      if (this.dbRef) {
        this.dbRef.off();
      }

      this.dbRef = firebase.database().ref(`households/${houseKey}`);

      try { this.dbRef.keepSynced(true); } catch(e) {}

      // 1. Descarga inicial segura
      this.fetchCloudStateOnce();

      // 2. Escuchar suscripción de la pareja para enviarle push en segundo plano
      const partnerRole = this.currentUserId === 'p1' ? 'p2' : 'p1';
      firebase.database().ref(`households/${houseKey}/subscriptions/${partnerRole}`).on('value', (snap) => {
        const data = snap.val();
        if (data && data.endpoint) {
          this.partnerSubscription = data;
        } else {
          this.partnerSubscription = null;
        }
        this.updateDiagnosticsUI();
      });

      // 3. Estado de conexión con Google
      const connectedRef = firebase.database().ref('.info/connected');
      connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
          this.isConnected = true;
          this.updateStatus('online');
        } else {
          this.isConnected = false;
          this.updateStatus('connecting');
        }
      });

      // 4. Escuchar cambios en vivo emitidos en el hogar
      this.dbRef.on('value', (snapshot) => {
        const payload = snapshot.val();
        if (payload) {
          this.handleIncomingData(payload);
        }
      });

      this.updateStatus('online');
    } catch (e) {
      console.warn('Firebase connect error:', e);
      this.updateStatus('online');
    }
  },

  // Fusión inteligente Delta-Merging
  mergeIncomingState(cloudState) {
    if (!cloudState) return;

    if (cloudState.notes && Array.isArray(cloudState.notes)) {
      const localNotes = Store.state.notes || [];
      const noteMap = new Map();
      cloudState.notes.forEach(n => { if (n && n.id) noteMap.set(n.id, n); });
      localNotes.forEach(n => { if (n && n.id) noteMap.set(n.id, n); });
      Store.state.notes = Array.from(noteMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    if (cloudState.tasks && Array.isArray(cloudState.tasks)) {
      const localTasks = Store.state.tasks || [];
      const taskMap = new Map();
      cloudState.tasks.forEach(t => { if (t && t.id) taskMap.set(t.id, t); });
      localTasks.forEach(t => { if (t && t.id && !taskMap.has(t.id)) taskMap.set(t.id, t); });
      Store.state.tasks = Array.from(taskMap.values());
    }

    if (cloudState.pantry && Array.isArray(cloudState.pantry)) {
      const pantryMap = new Map();
      cloudState.pantry.forEach(p => { if (p && p.id) pantryMap.set(p.id, p); });
      (Store.state.pantry || []).forEach(p => { if (p && p.id && !pantryMap.has(p.id)) pantryMap.set(p.id, p); });
      Store.state.pantry = Array.from(pantryMap.values());
    }

    if (cloudState.shoppingList && Array.isArray(cloudState.shoppingList)) {
      const shopMap = new Map();
      cloudState.shoppingList.forEach(s => { if (s && s.id) shopMap.set(s.id, s); });
      (Store.state.shoppingList || []).forEach(s => { if (s && s.id && !shopMap.has(s.id)) shopMap.set(s.id, s); });
      Store.state.shoppingList = Array.from(shopMap.values());
    }

    if (cloudState.profiles) Store.state.profiles = { ...Store.state.profiles, ...cloudState.profiles };
    if (cloudState.bcv) Store.state.bcv = { ...Store.state.bcv, ...cloudState.bcv };
    if (cloudState.budget) Store.state.budget = { ...Store.state.budget, ...cloudState.budget };

    try {
      localStorage.setItem(Store.STORAGE_KEY, JSON.stringify(Store.state));
    } catch (e) {}
  },

  broadcastChange(type, extraData = {}) {
    if (!this.dbRef) {
      this.connect();
    }

    const payload = {
      room: this.householdCode,
      sessionId: this.sessionId,
      senderUser: this.currentUserId,
      timestamp: Date.now(),
      type: type,
      extra: extraData,
      state: Store.state
    };

    if (this.dbRef) {
      this.updateStatus('syncing');
      this.dbRef.set(payload)
        .then(() => {
          setTimeout(() => this.updateStatus('online'), 250);
        })
        .catch(err => {
          console.warn('Firebase write error:', err);
          this.updateStatus('online');
        });

      // Si es una nota o recordatorio nuevo, disparar Web Push a Vercel Serverless
      if (type === 'NEW_NOTE' && extraData && extraData.note) {
        const senderName = Store.state?.profiles?.[this.currentUserId]?.name || (this.currentUserId === 'p1' ? 'Ella' : 'Él');
        const noteText = extraData.note.text || 'Nuevo mensaje de amor ❤️';
        this.sendBackgroundPushTrigger(senderName, noteText);
      }
    }
  },

  // Envía la orden a la función Vercel Serverless (/api/push) para despertar el teléfono bloqueado
  sendBackgroundPushTrigger(senderName, noteText) {
    const partnerRole = this.currentUserId === 'p1' ? 'p2' : 'p1';

    // 1. Disparo a través de la función de servidor en Vercel (/api/push)
    fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        householdCode: this.householdCode,
        targetUser: partnerRole,
        title: `💌 Mensaje de ${senderName}`,
        body: noteText,
        icon: 'icons/icon.svg',
        url: './index.html'
      })
    }).catch(() => {});

    // 2. Disparo redundante por puente de alta prioridad
    const houseKey = this.getCleanHouseholdKey();
    fetch(`https://ntfy.sh/hogarduo_push_${houseKey}_${partnerRole}`, {
      method: 'POST',
      headers: {
        'Title': `💌 Mensaje de ${senderName}`,
        'Priority': 'urgent',
        'Tags': 'heart,love,couple'
      },
      body: noteText
    }).catch(() => {});
  },

  handleIncomingData(payload) {
    if (!payload) return;

    if (payload.sessionId === this.sessionId) return;

    if (payload.state) {
      this.mergeIncomingState(payload.state);
    }

    Store.notify();
    this.updateStatus('online');

    // 1. Prueba de Notificación Push
    if (payload.type === 'TEST_PUSH') {
      const senderName = payload.extra?.sender || (this.currentUserId === 'p1' ? 'Él' : 'Ella');
      const message = payload.extra?.message || '¡Prueba de Notificación de tu Pareja! ❤️';

      if (typeof App !== 'undefined') {
        App.showInAppBanner(senderName, message, 'love');
        App.sendPushNotification(`💌 Prueba de ${senderName}`, message);
      }
      if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      return;
    }

    // 2. Notificación de Nota Nueva
    const incomingNote = payload.extra?.note || (Store.state?.notes && Store.state.notes[0]);
    if (incomingNote && incomingNote.id && incomingNote.id !== this.lastNotifiedNoteId) {
      this.lastNotifiedNoteId = incomingNote.id;
      try { localStorage.setItem('hogarduo_last_notified_note', incomingNote.id); } catch(e) {}

      const authorKey = incomingNote.author || payload.senderUser || (this.currentUserId === 'p1' ? 'p2' : 'p1');
      const senderName = Store.state?.profiles?.[authorKey]?.name || (authorKey === 'p1' ? 'Ella' : 'Él');
      const noteText = incomingNote.text || 'Nuevo mensaje de amor ❤️';
      const noteType = incomingNote.type || 'love';

      if (typeof App !== 'undefined') {
        App.showInAppBanner(senderName, noteText, noteType);
        App.sendPushNotification(`💌 Mensaje de ${senderName}`, noteText);
      }
      
      if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      return;
    }

    if (typeof App !== 'undefined') {
      App.showToast('Datos actualizados de tu pareja 🔄', 'info');
    }
  },

  testPushToPartner() {
    const senderName = Store.state?.profiles?.[this.currentUserId]?.name || (this.currentUserId === 'p1' ? 'Ella' : 'Él');
    const msg = '¡Prueba de Notificación Push a tu pantalla de bloqueo! ❤️';
    
    this.broadcastChange('TEST_PUSH', { sender: senderName, message: msg });
    this.sendBackgroundPushTrigger(senderName, msg);
    
    if (typeof App !== 'undefined') {
      App.showToast(`🚀 ¡Notificación de prueba enviada al celular de ${senderName === 'Ella' ? 'Él' : 'Ella'}!`, 'success');
    }
  },

  updateDiagnosticsUI() {
    const permEl = document.getElementById('diag-perm-status');
    const swEl = document.getElementById('diag-sw-status');
    const fcmEl = document.getElementById('diag-fcm-status');
    const partnerEl = document.getElementById('diag-partner-status');

    const hasPerm = 'Notification' in window && Notification.permission === 'granted';
    const hasSW = 'serviceWorker' in navigator;
    const hasPush = !!this.mySubscription || (hasPerm && hasSW);
    const hasPartner = !!this.partnerSubscription;

    if (permEl) permEl.innerHTML = hasPerm ? '🟢 Concedido' : '🔴 No activado';
    if (swEl) swEl.innerHTML = hasSW ? '🟢 Activo' : '🔴 Inactivo';
    if (fcmEl) fcmEl.innerHTML = hasPush ? '🟢 Listo (Web Push)' : '🟡 Pendiente';
    if (partnerEl) partnerEl.innerHTML = hasPartner ? '🟢 Celular Vinculado' : '🟡 Esperando conexión';
  },

  getInviteLink() {
    const origin = window.location.origin + window.location.pathname;
    const partnerRole = this.currentUserId === 'p1' ? 'p2' : 'p1';
    return `${origin}?code=${encodeURIComponent(this.householdCode)}&role=${partnerRole}`;
  },

  openQRInviteModal() {
    const dialog = document.getElementById('modal-qr-invite');
    const qrImg = document.getElementById('qr-invite-img');
    const qrLabel = document.getElementById('qr-code-label');

    const inviteUrl = this.getInviteLink();

    if (qrLabel) qrLabel.textContent = this.householdCode;
    
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=4&data=${encodeURIComponent(inviteUrl)}`;
    }

    if (dialog) dialog.showModal();
  },

  closeQRInviteModal() {
    const dialog = document.getElementById('modal-qr-invite');
    if (dialog) dialog.close();
  },

  async shareInviteLink() {
    const inviteUrl = this.getInviteLink();
    const shareData = {
      title: '💑 HogarDúo - Nuestro Hogar Conectado',
      text: `¡Hola amor! Entra a nuestra app del hogar sincronizada: ${this.householdCode}`,
      url: inviteUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {}
    } else {
      this.copyInviteLink();
    }
  },

  copyInviteLink() {
    const inviteUrl = this.getInviteLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        if (typeof App !== 'undefined') App.showToast('¡Enlace de invitación copiado! 📋 Envíalo a tu pareja', 'success');
      });
    } else {
      prompt('Copia este enlace para enviarlo a tu pareja:', inviteUrl);
    }
  },

  updateStatus(status) {
    const badge = document.getElementById('cloud-status-badge');
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');

    if (!badge || !dot || !text) return;

    if (status === 'syncing') {
      dot.style.background = 'var(--warning)';
      dot.style.boxShadow = '0 0 6px var(--warning)';
      text.textContent = 'Sincronizando';
    } else if (status === 'connecting') {
      dot.style.background = 'var(--accent)';
      dot.style.boxShadow = '0 0 6px var(--accent)';
      text.textContent = 'Conectando';
    } else {
      dot.style.background = 'var(--success)';
      dot.style.boxShadow = '0 0 6px var(--success)';
      text.textContent = 'En vivo';
      badge.title = `Conectado a Firebase (${this.householdCode})`;
    }
  },

  updateCloudUI() {
    const codeEl = document.getElementById('current-household-code-display');
    const codeIn = document.getElementById('household-code-input');
    const userSelect = document.getElementById('device-owner-select');

    if (codeEl) codeEl.textContent = this.householdCode || '19125118';
    if (codeIn) codeIn.value = this.householdCode || '19125118';
    if (userSelect) userSelect.value = this.currentUserId || 'p1';
  },

  openSyncModal() {
    const dialog = document.getElementById('modal-cloud-sync');
    this.updateCloudUI();
    if (dialog) dialog.showModal();
  },

  closeSyncModal() {
    const dialog = document.getElementById('modal-cloud-sync');
    if (dialog) dialog.close();
  },

  saveSyncSettings() {
    const codeInput = document.getElementById('household-code-input');
    const userSelect = document.getElementById('device-owner-select');

    const code = codeInput ? codeInput.value.trim() : '';
    const user = userSelect ? userSelect.value : 'p1';

    if (code) {
      this.setHouseholdCode(code);
    }
    if (user) {
      this.setCurrentUser(user);
    }

    this.broadcastChange('ROOM_UPDATED', Store.state);

    this.closeSyncModal();
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(`✅ Hogar conectado a Firebase: ${this.householdCode}`, 'success');
    }
  }
};

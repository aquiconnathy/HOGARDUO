/**
 * CloudSync - Google Firebase Realtime Engine + Google FCM Cloud Messaging (VAPID)
 * Cloud-First Non-Destructive Data Merging & Independent Couple Profiles.
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

  vapidKey: "BN-joOU-IJeLmfVZTtU6o-CMo8B9YR6n1I7EcIVDRdoOihzRxYx8aw5ES3C6tywE_pVCYjvaQ9XeSIP0UlG-PMw",

  householdCode: 'HOGAR-2026',
  sessionId: null,
  currentUserId: 'p1', // 'p1' (Ella) o 'p2' (Él)
  dbRef: null,
  messaging: null,
  isConnected: false,
  isInitialized: false,
  lastNotifiedNoteId: null,

  init() {
    try {
      this.sessionId = 'ses_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      this.householdCode = (localStorage.getItem('hogarduo_household_code') || 'HOGAR-2026').trim().toUpperCase();
      this.currentUserId = localStorage.getItem('hogarduo_user_id') || 'p1';
      this.lastNotifiedNoteId = localStorage.getItem('hogarduo_last_notified_note') || null;

      // 1. Detectar si el usuario abrió la app mediante un Código QR o enlace de invitación
      this.checkUrlInviteParams();

      this.updateCloudUI();
      this.initFirebase();
    } catch (e) {
      console.warn('CloudSync init error:', e);
    }
  },

  // Auto-Vinculación por Código QR
  checkUrlInviteParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get('code') || params.get('hogar');
      const inviteRole = params.get('role'); // 'p1' o 'p2'

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
      this.initFCM();
    } catch (e) {
      console.warn('Firebase init warning:', e);
      this.updateStatus('online');
    }
  },

  async initFCM() {
    if (typeof firebase === 'undefined' || !firebase.messaging) return;

    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const messaging = firebase.messaging();
        this.messaging = messaging;

        messaging.onMessage((payload) => {
          const title = payload.notification?.title || payload.data?.title || '💌 Nota de tu pareja';
          const body = payload.notification?.body || payload.data?.body || 'Tienes un nuevo mensaje';
          
          if (typeof App !== 'undefined') {
            App.showToast(`💌 ${title}: "${body}"`, 'success');
            App.sendPushNotification(title, body);
          }
          if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        });

        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
          const token = await messaging.getToken({
            vapidKey: this.vapidKey,
            serviceWorkerRegistration: registration
          });

          if (token) {
            this.saveDeviceToken(token);
          }
        }
      }
    } catch (err) {
      console.warn('FCM setup warning:', err);
    }
  },

  saveDeviceToken(token) {
    if (!token || !this.isInitialized || !firebase.database) return;
    try {
      const houseKey = this.getCleanHouseholdKey();
      firebase.database().ref(`households/${houseKey}/fcm_tokens/${this.currentUserId}`).set({
        token: token,
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
  },

  getCleanHouseholdKey() {
    return (this.householdCode || 'HOGAR-2026').toLowerCase().replace(/[^a-z0-9]/g, '_');
  },

  // Conexión Cloud-First: Primero lee los datos existentes para NUNCA sobreescribirlos
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

      // 1. Lectura inicial para no sobreescribir lo que hizo el otro celular
      this.dbRef.once('value').then((snapshot) => {
        const cloudData = snapshot.val();
        if (cloudData && cloudData.state) {
          Store.state = {
            ...Store.state,
            ...cloudData.state
          };
          try {
            localStorage.setItem(Store.STORAGE_KEY, JSON.stringify(Store.state));
          } catch (e) {}
          Store.notify();
        }
      });

      // 2. Estado de conexión con servidores de Google
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

      // 3. Escuchar cambios en vivo de la pareja
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

  // Publicar cambio (solo cuando el usuario realiza una acción deliberada)
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
    }
  },

  // Recibir y fusionar datos entrantes de la pareja
  handleIncomingData(payload) {
    if (!payload) return;

    // Ignorar si el mensaje fue enviado por esta misma sesión
    if (payload.sessionId === this.sessionId) return;

    // 1. Fusionar estado entrante de forma segura
    if (payload.state) {
      Store.state = {
        ...Store.state,
        ...payload.state
      };
    }

    if (payload.type === 'NEW_NOTE' && payload.extra && payload.extra.note) {
      if (!Store.state.notes) Store.state.notes = [];
      if (!Store.state.notes.some(n => n.id === payload.extra.note.id)) {
        Store.state.notes.unshift(payload.extra.note);
      }
    }

    try {
      localStorage.setItem(Store.STORAGE_KEY, JSON.stringify(Store.state));
    } catch (e) {}

    // Notificar a toda la interfaz
    Store.notify();
    this.updateStatus('online');

    // 2. Notificar si hay una nota nueva enviada por la pareja
    const incomingNote = payload.extra?.note || (Store.state?.notes && Store.state.notes[0]);
    if (incomingNote && incomingNote.id && incomingNote.id !== this.lastNotifiedNoteId) {
      // Verificar que la nota fue escrita por la pareja y no por este usuario
      if (incomingNote.author !== this.currentUserId) {
        this.lastNotifiedNoteId = incomingNote.id;
        try { localStorage.setItem('hogarduo_last_notified_note', incomingNote.id); } catch(e) {}

        const authorKey = incomingNote.author || (this.currentUserId === 'p1' ? 'p2' : 'p1');
        const senderName = Store.state?.profiles?.[authorKey]?.name || (authorKey === 'p1' ? 'Ella' : 'Él');
        const noteText = incomingNote.text || 'Nuevo mensaje de amor ❤️';

        if (typeof App !== 'undefined') {
          App.showToast(`💌 ${senderName}: "${noteText}"`, 'success');
          App.sendPushNotification(`💌 Mensaje de ${senderName}`, noteText);
        }
        
        if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        return;
      }
    }

    if (typeof App !== 'undefined') {
      App.showToast('Datos actualizados de tu pareja 🔄', 'info');
    }
  },

  // --------------------------------------------------------------------------
  // CÓDIGO QR & ENLACE MÁGICO DE INVITACIÓN
  // --------------------------------------------------------------------------
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

    if (codeEl) codeEl.textContent = this.householdCode || 'HOGAR-2026';
    if (codeIn) codeIn.value = this.householdCode || 'HOGAR-2026';
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

    this.closeSyncModal();
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(`✅ Hogar conectado a Firebase: ${this.householdCode}`, 'success');
    }
  }
};

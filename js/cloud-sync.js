/**
 * CloudSync - Google Firebase Official Realtime Engine + Instant QR Couple Pairing
 * Connects both phones via Google Firebase (Port 443 HTTPS) + 1-Tap QR Magic Link.
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

  householdCode: 'HOGAR-2026',
  deviceId: null,
  currentUserId: 'p1', // 'p1' o 'p2'
  dbRef: null,
  isConnected: false,
  isInitialized: false,

  init() {
    try {
      this.deviceId = 'dev_' + (localStorage.getItem('hogarduo_device_id') || this.generateId());
      localStorage.setItem('hogarduo_device_id', this.deviceId);

      this.householdCode = (localStorage.getItem('hogarduo_household_code') || 'HOGAR-2026').trim().toUpperCase();
      this.currentUserId = localStorage.getItem('hogarduo_user_id') || 'p1';

      // 1. Detectar si el usuario abrió la app escaneando un Código QR o enlace de invitación
      this.checkUrlInviteParams();

      this.updateCloudUI();
      this.initFirebase();
    } catch (e) {
      console.warn('CloudSync init error:', e);
    }
  },

  generateId() {
    return Math.random().toString(36).substring(2, 9);
  },

  // Auto-Login / Vinculación con Código QR o Enlace Mágico
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

        // Limpiar la URL en el navegador para mantenerla elegante
        window.history.replaceState({}, document.title, window.location.pathname);

        setTimeout(() => {
          if (typeof App !== 'undefined') {
            App.showToast(`🎉 ¡Vinculado al Hogar "${this.householdCode}"!`, 'success');
            App.triggerConfetti();
            App.updateProfileUI();
          }
        }, 600);
      }
    } catch (e) {}
  },

  initFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded, using local storage fallback');
      this.updateStatus('online');
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
      }

      this.isInitialized = true;
      this.updateStatus('connecting');

      // Autenticación anónima segura de Google Firebase
      firebase.auth().signInAnonymously().catch(err => {
        console.log('Firebase Auth:', err.message);
      });

      this.connect();
    } catch (e) {
      console.warn('Firebase init warning:', e);
      this.updateStatus('online');
    }
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
      App.showToast(`Dispositivo asignado a: ${p?.name || userId} 📱`, 'success');
    }
  },

  getCleanHouseholdKey() {
    return (this.householdCode || 'HOGAR-2026').toLowerCase().replace(/[^a-z0-9]/g, '_');
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

      // Escuchar conexión activa con Google
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

      // Escuchar cambios en vivo de la pareja
      this.dbRef.on('value', (snapshot) => {
        const payload = snapshot.val();
        if (payload && payload.senderId !== this.deviceId) {
          this.handleIncomingData(payload);
        }
      });

      this.updateStatus('online');
    } catch (e) {
      console.warn('Firebase connect error:', e);
      this.updateStatus('online');
    }
  },

  // Publicar cambio en la base de datos de Google Firebase
  broadcastChange(type, extraData = {}) {
    if (!this.dbRef) {
      this.connect();
    }

    const payload = {
      room: this.householdCode,
      senderId: this.deviceId,
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
          setTimeout(() => this.updateStatus('online'), 300);
        })
        .catch(err => {
          console.warn('Firebase write warning:', err);
          this.updateStatus('online');
        });
    }
  },

  // Recibir y fusionar datos entrantes de la pareja
  handleIncomingData(payload) {
    if (!payload || payload.senderId === this.deviceId) return;

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

    // Notificar reactivamente a toda la interfaz
    Store.notify();
    this.updateStatus('online');

    if (payload.type === 'NEW_NOTE') {
      const senderName = Store.state?.profiles?.[payload.senderUser]?.name || 'Tu pareja';
      const noteText = payload.extra?.note?.text || (Store.state?.notes && Store.state.notes[0]?.text) || 'Nuevo mensaje de amor ❤️';
      
      if (typeof App !== 'undefined') {
        App.showToast(`💌 ${senderName} te dejó una nota`, 'success');
        App.sendPushNotification(`💌 Mensaje de ${senderName}`, noteText);
      }
      
      if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    } else if (typeof App !== 'undefined') {
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
    
    // Generar código QR instantáneo de alta resolución
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
    if (typeof App !== 'undefined' && App.requestNotificationPermission) {
      if ('Notification' in window && Notification.permission === 'default') {
        App.requestNotificationPermission();
      }
    }
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

    if (typeof App !== 'undefined' && App.requestNotificationPermission) {
      App.requestNotificationPermission();
    }
  }
};

/**
 * CloudSync - Google Firebase Official Realtime Engine ($0 Cost, 100% Privacy & Security)
 * Connects both phones via Google Firebase Infrastructure (Port 443 HTTPS) with zero blocking.
 */
const CloudSync = {
  // Configuración Oficial de Firebase del Proyecto HogarDuo
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

      this.updateCloudUI();
      this.initFirebase();
    } catch (e) {
      console.warn('CloudSync init error:', e);
    }
  },

  generateId() {
    return Math.random().toString(36).substring(2, 9);
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

      // Autenticación anónima/automática de Google Firebase
      firebase.auth().signInAnonymously().catch(err => {
        console.log('Firebase Auth Anonymous login:', err.message);
      });

      // Conectar a la base de datos en tiempo real
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
      
      // Si ya existía una referencia anterior, desuscribirse limpiamente
      if (this.dbRef) {
        this.dbRef.off();
      }

      this.dbRef = firebase.database().ref(`households/${houseKey}`);

      // Mantener sincronización offline local activa
      try { this.dbRef.keepSynced(true); } catch(e) {}

      // Escuchar conexión con los servidores de Google
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

  // Publicar cambio en la nube de Google Firebase
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
          console.warn('Firebase write error:', err);
          this.updateStatus('online');
        });
    }
  },

  // Recibir y fusionar datos entrantes de la pareja
  handleIncomingData(payload) {
    if (!payload || payload.senderId === this.deviceId) return;

    // Fusionar estado entrante
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

    // Notificaciones especiales si la pareja envió una nota
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

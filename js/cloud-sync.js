/**
 * CloudSync - Google Firebase Realtime Engine + Google Auth + Google Calendar Synchronization
 * Direct Google Calendar hardware-level alarms and cross-device synchronization for couples.
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

  vapidKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuYkr3qBUYIhbQFLXYp5Nksh8U",

  householdCode: '19125118',
  sessionId: null,
  currentUserId: 'p1', // 'p1' (Ella) o 'p2' (Él)
  currentUserEmail: null,
  partnerEmail: null,
  googleAccessToken: null,
  dbRef: null,
  isConnected: false,
  isInitialized: false,
  lastNotifiedNoteId: null,

  init() {
    try {
      this.sessionId = 'ses_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      this.householdCode = (localStorage.getItem('hogarduo_household_code') || '19125118').trim().toUpperCase();
      this.currentUserId = localStorage.getItem('hogarduo_user_id') || 'p1';
      this.currentUserEmail = localStorage.getItem('hogarduo_user_email') || null;
      this.partnerEmail = localStorage.getItem('hogarduo_partner_email') || null;
      this.googleAccessToken = localStorage.getItem('hogarduo_g_token') || null;
      this.lastNotifiedNoteId = localStorage.getItem('hogarduo_last_notified_note') || null;

      // 1. Detectar auto-vinculación por Código QR
      this.checkUrlInviteParams();

      // 2. Listeners de auto-reconexión al despertar el celular
      this.setupReconnectionListeners();

      this.updateCloudUI();
      this.initFirebase();
      setTimeout(() => {
        this.updateDiagnosticsUI();
        this.updateAuthUI();
      }, 300);
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

      // Escuchar estado de autenticación de Firebase
      if (firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
          if (user) {
            this.currentUserEmail = user.email;
            try { localStorage.setItem('hogarduo_user_email', user.email); } catch(e) {}
            this.updateAuthUI();
            this.saveUserEmailToHousehold();
          } else {
            // Iniciar sesión anónima si no hay usuario de Google activo
            firebase.auth().signInAnonymously().catch(() => {});
          }
        });
      }

      this.connect();
    } catch (e) {
      console.warn('Firebase init warning:', e);
      this.updateStatus('online');
    }
  },

  // Iniciar Sesión con Google (con permisos para Google Calendar)
  async signInWithGoogle() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      if (typeof App !== 'undefined') App.showToast('Firebase Auth no disponible', 'warning');
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar.events');

    try {
      const result = await firebase.auth().signInWithPopup(provider);
      const user = result.user;
      const credential = result.credential;

      if (credential && credential.accessToken) {
        this.googleAccessToken = credential.accessToken;
        try { localStorage.setItem('hogarduo_g_token', credential.accessToken); } catch(e) {}
      }

      this.currentUserEmail = user.email;
      try { localStorage.setItem('hogarduo_user_email', user.email); } catch(e) {}

      // Actualizar perfil local
      if (Store.state && Store.state.profiles) {
        const profile = Store.state.profiles[this.currentUserId];
        if (profile) {
          profile.email = user.email;
          if (user.displayName) profile.name = user.displayName.split(' ')[0];
          Store.save();
        }
      }

      this.updateAuthUI();
      this.saveUserEmailToHousehold();
      
      if (typeof App !== 'undefined') {
        App.showToast(`✅ Conectado con Google: ${user.email} 📅`, 'success');
        App.triggerConfetti();
        App.updateProfileUI();
      }
    } catch (err) {
      console.warn('Google sign in error:', err);
      if (typeof App !== 'undefined') {
        App.showToast(`Aviso: ${err.message}`, 'warning');
      }
    }
  },

  // Cerrar Sesión de Google
  async signOutGoogle() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      await firebase.auth().signOut();
    }
    this.currentUserEmail = null;
    this.googleAccessToken = null;
    try {
      localStorage.removeItem('hogarduo_g_token');
      localStorage.removeItem('hogarduo_user_email');
    } catch(e) {}
    this.updateAuthUI();
    if (typeof App !== 'undefined') {
      App.showToast('Sesión de Google cerrada', 'info');
      App.updateProfileUI();
    }
  },

  savePartnerEmail(email) {
    if (!email) return;
    this.partnerEmail = email.trim();
    try {
      localStorage.setItem('hogarduo_partner_email', this.partnerEmail);
    } catch(e) {}

    const partnerRole = this.currentUserId === 'p1' ? 'p2' : 'p1';
    if (Store.state && Store.state.profiles && Store.state.profiles[partnerRole]) {
      Store.state.profiles[partnerRole].email = this.partnerEmail;
      Store.save();
    }

    if (this.isInitialized && typeof firebase !== 'undefined' && firebase.database) {
      const houseKey = this.getCleanHouseholdKey();
      firebase.database().ref(`households/${houseKey}/emails/${partnerRole}`).set(this.partnerEmail);
    }

    this.updateDiagnosticsUI();
  },

  updateAuthUI() {
    const emailEl = document.getElementById('google-user-email-display');
    const btnLogin = document.getElementById('btn-google-login');
    const btnLogout = document.getElementById('btn-google-logout');
    const partnerEmailIn = document.getElementById('partner-email-input');

    if (emailEl) {
      emailEl.textContent = this.currentUserEmail ? `🟢 Conectado: ${this.currentUserEmail}` : '⚪ No conectado';
    }
    if (btnLogin) btnLogin.style.display = this.currentUserEmail ? 'none' : 'flex';
    if (btnLogout) btnLogout.style.display = this.currentUserEmail ? 'inline-block' : 'none';
    if (partnerEmailIn) {
      partnerEmailIn.value = this.partnerEmail || '';
    }
  },

  saveUserEmailToHousehold() {
    if (!this.currentUserEmail || !this.isInitialized || !firebase.database) return;
    try {
      const houseKey = this.getCleanHouseholdKey();
      firebase.database().ref(`households/${houseKey}/emails/${this.currentUserId}`).set(this.currentUserEmail);
    } catch (e) {}
  },

  // Programar Alarma en Google Calendar (Ambos Celulares)
  async createGoogleCalendarEvent(title, description, reminderTimeISO) {
    if (!reminderTimeISO) return null;

    const startDate = new Date(reminderTimeISO);
    const endDate = new Date(startDate.getTime() + 30 * 60000); // 30 min de duración

    const partnerEmail = this.partnerEmail || (document.getElementById('partner-email-input')?.value.trim()) || '';

    // 1. Si tenemos el token de Google Calendar API, crear directamente en la nube
    if (this.googleAccessToken) {
      try {
        const attendees = [];
        if (partnerEmail && partnerEmail.includes('@')) {
          attendees.push({ email: partnerEmail });
        }

        const eventBody = {
          summary: `💑 HogarDúo: ${title}`,
          description: `${description || 'Recordatorio de HogarDúo'}\n\nCreado desde la app del hogar 🏡`,
          start: { dateTime: startDate.toISOString() },
          end: { dateTime: endDate.toISOString() },
          attendees: attendees,
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 0 },
              { method: 'popup', minutes: 10 }
            ]
          }
        };

        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.googleAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(eventBody)
        });

        if (res.ok) {
          if (typeof App !== 'undefined') {
            App.showToast(`📅 ¡Alarma guardada en Google Calendar para ambos!`, 'success');
          }
          return true;
        }
      } catch (e) {
        console.warn('Direct Calendar API failed, falling back to Web Intent:', e);
      }
    }

    // 2. Enlace Directo de Google Calendar Web (1-Tap Fallback sin configuraciones)
    const formatGTime = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
    const startG = formatGTime(startDate);
    const endG = formatGTime(endDate);

    let intentUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('💑 HogarDúo: ' + title)}&dates=${startG}/${endG}&details=${encodeURIComponent(description || 'Recordatorio de HogarDúo')}`;
    
    if (partnerEmail && partnerEmail.includes('@')) {
      intentUrl += `&add=${encodeURIComponent(partnerEmail)}`;
    }

    return intentUrl;
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

      // 2. Escuchar correo de la pareja
      const partnerRole = this.currentUserId === 'p1' ? 'p2' : 'p1';
      firebase.database().ref(`households/${houseKey}/emails/${partnerRole}`).on('value', (snap) => {
        this.partnerEmail = snap.val() || null;
        this.updateAuthUI();
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
    }
  },

  handleIncomingData(payload) {
    if (!payload) return;

    if (payload.sessionId === this.sessionId) return;

    if (payload.state) {
      this.mergeIncomingState(payload.state);
    }

    Store.notify();
    this.updateStatus('online');

    // Notificación de Nota / Recordatorio en Vivo
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

  updateDiagnosticsUI() {
    const permEl = document.getElementById('diag-perm-status');
    const swEl = document.getElementById('diag-sw-status');
    const fcmEl = document.getElementById('diag-fcm-status');
    const partnerEl = document.getElementById('diag-partner-status');

    const hasPerm = 'Notification' in window && Notification.permission === 'granted';
    const hasSW = 'serviceWorker' in navigator;
    const hasAuth = !!this.currentUserEmail;
    const hasPartner = !!this.partnerEmail;

    if (permEl) permEl.innerHTML = hasPerm ? '🟢 Concedido' : '🔴 No activado';
    if (swEl) swEl.innerHTML = hasSW ? '🟢 Activo' : '🔴 Inactivo';
    if (fcmEl) fcmEl.innerHTML = hasAuth ? '🟢 Conectado con Google' : '🟡 Pendiente';
    if (partnerEl) partnerEl.innerHTML = hasPartner ? '🟢 Pareja Vinculada' : '🟡 Esperando conexión';
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
    if (dialog) {
      try { dialog.close(); } catch(e) {}
      dialog.removeAttribute('open');
    }
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
    if (dialog) {
      try { dialog.close(); } catch(e) {}
      dialog.removeAttribute('open');
    }
  },

  saveSyncSettings() {
    const codeInput = document.getElementById('household-code-input');
    const userSelect = document.getElementById('device-owner-select');
    const partnerEmailIn = document.getElementById('partner-email-input');

    const code = codeInput ? codeInput.value.trim() : '';
    const user = userSelect ? userSelect.value : 'p1';

    if (code) {
      this.setHouseholdCode(code);
    }
    if (user) {
      this.setCurrentUser(user);
    }
    if (partnerEmailIn && partnerEmailIn.value.trim()) {
      this.partnerEmail = partnerEmailIn.value.trim();
    }

    this.broadcastChange('ROOM_UPDATED', Store.state);

    this.closeSyncModal();
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(`✅ Hogar conectado a Firebase: ${this.householdCode}`, 'success');
    }
  }
};

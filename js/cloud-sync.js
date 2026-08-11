/**
 * CloudSync - Google Firebase Auth & Realtime Engine for Couples
 * Multi-user Email/Password & Google 1-Tap Auth, Independent Profiles, Photos & Communication.
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

  householdCode: '19125118',
  sessionId: null,
  currentUserId: 'p1', // 'p1' (Ella) o 'p2' (Él)
  currentUser: null,
  currentUserEmail: null,
  partnerEmail: null,
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
      this.lastNotifiedNoteId = localStorage.getItem('hogarduo_last_notified_note') || null;

      // 1. Escuchar reconexiones al despertar el teléfono
      this.setupReconnectionListeners();

      // 2. Inicializar Firebase
      this.initFirebase();
    } catch (e) {
      console.warn('CloudSync init error:', e);
    }
  },

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

      if (firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
          if (user) {
            this.currentUser = user;
            this.currentUserEmail = user.email;
            try { localStorage.setItem('hogarduo_user_email', user.email); } catch(e) {}
            this.loadUserHouseholdProfile(user.uid);
          } else {
            // Auto login anónimo para que la app siempre esté conectada y hermosa
            firebase.auth().signInAnonymously().catch(() => {});
          }
          this.connect();
        });
      } else {
        this.connect();
      }
    } catch (e) {
      console.warn('Firebase init warning:', e);
      this.connect();
    }
  },

  showAuthGateway() {
    const gateway = document.getElementById('auth-gateway-screen');
    const mainApp = document.getElementById('main-app-container');
    if (gateway) gateway.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
  },

  showMainApp() {
    const gateway = document.getElementById('auth-gateway-screen');
    const mainApp = document.getElementById('main-app-container');
    if (gateway) gateway.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';

    if (typeof App !== 'undefined') {
      App.updateProfileUI();
      App.renderAll();
    }
    if (typeof Personal !== 'undefined') {
      Personal.init();
    }
    this.updateCloudUI();
  },

  // ==========================================
  // AUTENTICACIÓN Y REGISTRO
  // ==========================================

  // 1. Crear Nuevo Hogar + Registro
  async registerNewHousehold(email, password, name, phone, role, householdCode, photoData = null) {
    if (!email || !password || !name) {
      if (typeof App !== 'undefined') App.showToast('Por favor completa todos los campos requeridos', 'warning');
      return;
    }

    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email.trim(), password);
      const user = userCredential.user;

      const cleanCode = (householdCode || 'HOGAR-' + Math.floor(1000 + Math.random() * 9000)).trim().toUpperCase();
      this.householdCode = cleanCode;
      this.currentUserId = role || 'p1';

      localStorage.setItem('hogarduo_household_code', this.householdCode);
      localStorage.setItem('hogarduo_user_id', this.currentUserId);

      // Guardar perfil en Store
      if (Store.state?.profiles?.[this.currentUserId]) {
        Store.state.profiles[this.currentUserId].name = name.trim();
        Store.state.profiles[this.currentUserId].email = email.trim();
        if (phone) Store.state.profiles[this.currentUserId].phone = phone.trim();
        if (photoData) Store.state.profiles[this.currentUserId].photo = photoData;
        Store.save();
      }

      // Guardar en Firebase
      const houseKey = this.getCleanHouseholdKey();
      await firebase.database().ref(`users/${user.uid}`).set({
        email: email.trim(),
        householdCode: this.householdCode,
        role: this.currentUserId,
        name: name.trim(),
        phone: phone || '',
        photo: photoData || ''
      });

      this.broadcastChange('PROFILE_REGISTERED', Store.state);

      if (typeof App !== 'undefined') {
        App.showToast(`🎉 ¡Bienvenida/o a HogarDúo, ${name}! Hogar: ${this.householdCode}`, 'success');
        App.triggerConfetti();
      }
    } catch (err) {
      // Si el correo ya existe, iniciar sesión automáticamente y vincular
      if (err.code === 'auth/email-already-in-use') {
        try {
          const userCredential = await firebase.auth().signInWithEmailAndPassword(email.trim(), password);
          const user = userCredential.user;

          this.householdCode = (householdCode || '19125118').trim().toUpperCase();
          this.currentUserId = role || 'p1';

          localStorage.setItem('hogarduo_household_code', this.householdCode);
          localStorage.setItem('hogarduo_user_id', this.currentUserId);

          if (Store.state?.profiles?.[this.currentUserId]) {
            Store.state.profiles[this.currentUserId].name = name.trim();
            Store.state.profiles[this.currentUserId].email = email.trim();
            if (phone) Store.state.profiles[this.currentUserId].phone = phone.trim();
            Store.save();
          }

          await firebase.database().ref(`users/${user.uid}`).update({
            email: email.trim(),
            householdCode: this.householdCode,
            role: this.currentUserId,
            name: name.trim(),
            phone: phone || ''
          });

          this.broadcastChange('PROFILE_REGISTERED', Store.state);

          if (typeof App !== 'undefined') {
            App.showToast(`🎉 ¡Bienvenida de vuelta, ${name}! Hogar: ${this.householdCode}`, 'success');
            App.triggerConfetti();
          }
          return;
        } catch (loginErr) {
          if (typeof App !== 'undefined') {
            App.showToast('Este correo ya está registrado. Ve a la pestaña "🔑 Entrar" o usa Google', 'info');
          }
          setAuthTab('login');
          const loginEmail = document.getElementById('auth-login-email');
          if (loginEmail) loginEmail.value = email;
          return;
        }
      }

      console.error('Register error:', err);
      if (typeof App !== 'undefined') App.showToast(`Error: ${err.message}`, 'warning');
    }
  },

  // 2. Unirme al Hogar de mi Pareja
  async joinHousehold(email, password, name, phone, role, householdCode, photoData = null) {
    if (!email || !password || !name || !householdCode) {
      if (typeof App !== 'undefined') App.showToast('Completa todos los datos y el código del hogar', 'warning');
      return;
    }

    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email.trim(), password);
      const user = userCredential.user;

      this.householdCode = householdCode.trim().toUpperCase();
      this.currentUserId = role || 'p2';

      localStorage.setItem('hogarduo_household_code', this.householdCode);
      localStorage.setItem('hogarduo_user_id', this.currentUserId);

      if (Store.state?.profiles?.[this.currentUserId]) {
        Store.state.profiles[this.currentUserId].name = name.trim();
        Store.state.profiles[this.currentUserId].email = email.trim();
        if (phone) Store.state.profiles[this.currentUserId].phone = phone.trim();
        if (photoData) Store.state.profiles[this.currentUserId].photo = photoData;
        Store.save();
      }

      await firebase.database().ref(`users/${user.uid}`).set({
        email: email.trim(),
        householdCode: this.householdCode,
        role: this.currentUserId,
        name: name.trim(),
        phone: phone || '',
        photo: photoData || ''
      });

      this.broadcastChange('PARTNER_JOINED', Store.state);

      if (typeof App !== 'undefined') {
        App.showToast(`💑 ¡Te has unido al Hogar "${this.householdCode}"!`, 'success');
        App.triggerConfetti();
      }
    } catch (err) {
      console.error('Join error:', err);
      if (typeof App !== 'undefined') App.showToast(`Error: ${err.message}`, 'warning');
    }
  },

  // 3. Iniciar Sesión con Correo y Contraseña
  async signInWithEmail(email, password) {
    if (!email || !password) {
      if (typeof App !== 'undefined') App.showToast('Ingresa tu correo y contraseña', 'warning');
      return;
    }

    try {
      await firebase.auth().signInWithEmailAndPassword(email.trim(), password);
      if (typeof App !== 'undefined') App.showToast('¡Sesión iniciada con éxito! 🚀', 'success');
    } catch (err) {
      console.error('Login error:', err);
      if (typeof App !== 'undefined') App.showToast(`Error de acceso: ${err.message}`, 'warning');
    }
  },

  // 4. Iniciar Sesión con Google (1-Tap)
  async signInWithGoogle() {
    if (typeof firebase === 'undefined' || !firebase.auth) return;
    const provider = new firebase.auth.GoogleAuthProvider();

    try {
      const result = await firebase.auth().signInWithPopup(provider);
      const user = result.user;
      
      if (typeof App !== 'undefined') {
        App.showToast(`✅ Conectado con Google: ${user.email}`, 'success');
        App.triggerConfetti();
      }
    } catch (err) {
      console.warn('Google login error:', err);
      if (typeof App !== 'undefined') App.showToast(`Aviso: ${err.message}`, 'warning');
    }
  },

  // 5. Cerrar Sesión
  async signOut() {
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        await firebase.auth().signOut();
      }
      this.currentUser = null;
      this.currentUserEmail = null;
      localStorage.removeItem('hogarduo_user_email');
      this.showAuthGateway();
      if (typeof App !== 'undefined') App.showToast('Sesión cerrada correctamente 🔒', 'info');
    } catch (e) {}
  },

  // Cargar perfil asignado en el Hogar
  async loadUserHouseholdProfile(uid) {
    try {
      const snap = await firebase.database().ref(`users/${uid}`).once('value');
      const data = snap.val();
      if (data) {
        if (data.householdCode) {
          this.householdCode = data.householdCode;
          localStorage.setItem('hogarduo_household_code', this.householdCode);
        }
        if (data.role) {
          this.currentUserId = data.role;
          localStorage.setItem('hogarduo_user_id', this.currentUserId);
        }
        if (Store.state?.profiles?.[this.currentUserId]) {
          if (data.name) Store.state.profiles[this.currentUserId].name = data.name;
          if (data.phone) Store.state.profiles[this.currentUserId].phone = data.phone;
          if (data.photo) Store.state.profiles[this.currentUserId].photo = data.photo;
          if (data.email) Store.state.profiles[this.currentUserId].email = data.email;
          Store.save();
        }
      }
    } catch (e) {}
  },

  // Sincronizar datos personales privados
  syncPersonalData(personalData) {
    if (!this.currentUser || !firebase.database) return;
    try {
      firebase.database().ref(`users/${this.currentUser.uid}/personal_state`).set(personalData);
    } catch (e) {}
  },

  // Subir Foto de Perfil (Base64 compacta)
  handlePhotoUpload(file, role) {
    return new Promise((resolve, reject) => {
      if (!file) return reject('No file');

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Redimensionar a 200x200 para máxima velocidad y nitidez
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 200;
          canvas.height = 200;
          
          ctx.drawImage(img, 0, 0, 200, 200);
          const base64Photo = canvas.toDataURL('image/jpeg', 0.85);

          const targetRole = role || this.currentUserId;
          if (Store.state?.profiles?.[targetRole]) {
            Store.state.profiles[targetRole].photo = base64Photo;
            Store.save();
          }

          if (this.currentUser && firebase.database) {
            firebase.database().ref(`users/${this.currentUser.uid}/photo`).set(base64Photo);
            const houseKey = this.getCleanHouseholdKey();
            firebase.database().ref(`households/${houseKey}/profiles/${targetRole}/photo`).set(base64Photo);
          }

          if (typeof App !== 'undefined') {
            App.updateProfileUI();
            App.showToast('¡Foto de perfil actualizada! 📸', 'success');
          }
          resolve(base64Photo);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  getCleanHouseholdKey() {
    const raw = (this.householdCode || '19125118').toLowerCase().trim();
    return raw.replace(/[^a-z0-9]/g, '') || '19125118';
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
      if (this.dbRef) this.dbRef.off();

      this.dbRef = firebase.database().ref(`households/${houseKey}`);
      try { this.dbRef.keepSynced(true); } catch(e) {}

      this.fetchCloudStateOnce();

      // Escuchar cambios de perfiles en vivo (fotos, teléfonos, nombres)
      this.dbRef.child('profiles').on('value', (snap) => {
        const profiles = snap.val();
        if (profiles && Store.state) {
          Store.state.profiles = { ...Store.state.profiles, ...profiles };
          Store.save();
          if (typeof App !== 'undefined') App.updateProfileUI();
        }
      });

      // Escuchar conexión
      firebase.database().ref('.info/connected').on('value', (snap) => {
        this.isConnected = (snap.val() === true);
        this.updateStatus(this.isConnected ? 'online' : 'connecting');
      });

      // Escuchar cambios en vivo del hogar
      this.dbRef.on('value', (snapshot) => {
        const payload = snapshot.val();
        if (payload) this.handleIncomingData(payload);
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
    if (!this.dbRef) this.connect();

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
        .then(() => setTimeout(() => this.updateStatus('online'), 250))
        .catch(() => this.updateStatus('online'));
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

    // Notificación en vivo si la pareja envió una nota
    const incomingNote = payload.extra?.note || (Store.state?.notes && Store.state.notes[0]);
    if (incomingNote && incomingNote.id && incomingNote.id !== this.lastNotifiedNoteId) {
      const authorKey = incomingNote.author || payload.senderUser;
      
      // Solo notificar si la nota fue escrita por la pareja (no por mí)
      if (authorKey !== this.currentUserId) {
        this.lastNotifiedNoteId = incomingNote.id;
        try { localStorage.setItem('hogarduo_last_notified_note', incomingNote.id); } catch(e) {}

        const senderName = Store.state?.profiles?.[authorKey]?.name || 'Tu pareja';
        const noteText = incomingNote.text || 'Nuevo mensaje de amor ❤️';
        const noteType = incomingNote.type || 'love';

        if (typeof App !== 'undefined') {
          App.showInAppBanner(senderName, noteText, noteType);
          App.sendPushNotification(`💌 Mensaje de ${senderName}`, noteText);
        }
        
        if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      }
    }
  },

  updateStatus(status) {
    const badge = document.getElementById('cloud-status-badge');
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');

    if (!badge || !dot || !text) return;

    if (status === 'syncing') {
      dot.style.background = 'var(--warning)';
      text.textContent = 'Sincronizando';
    } else if (status === 'connecting') {
      dot.style.background = 'var(--accent)';
      text.textContent = 'Conectando';
    } else {
      dot.style.background = 'var(--success)';
      text.textContent = 'En vivo';
      badge.title = `Conectado al Hogar (${this.householdCode})`;
    }
  },

  updateCloudUI() {
    const codeEl = document.getElementById('current-household-code-display');
    if (codeEl) codeEl.textContent = this.householdCode || '19125118';
  }
};

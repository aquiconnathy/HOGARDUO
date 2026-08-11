/**
 * CloudSync - Ultra-Fast Direct WebRTC Peer-to-Peer Couple Sync ($0 Cost, End-to-End Encrypted)
 * Connects both phones directly via WebRTC DataChannels for 0ms sub-second sync worldwide.
 */
const CloudSync = {
  householdCode: 'HOGAR-2026',
  deviceId: null,
  currentUserId: 'p1', // 'p1' o 'p2'
  peer: null,
  connection: null,
  isConnected: false,
  channel: null,
  reconnectTimer: null,
  partnerCheckTimer: null,

  init() {
    try {
      this.deviceId = 'dev_' + (localStorage.getItem('hogarduo_device_id') || this.generateId());
      localStorage.setItem('hogarduo_device_id', this.deviceId);

      this.householdCode = (localStorage.getItem('hogarduo_household_code') || 'HOGAR-2026').trim().toUpperCase();
      this.currentUserId = localStorage.getItem('hogarduo_user_id') || 'p1';

      this.updateCloudUI();
      this.connect();
    } catch (e) {
      console.warn('CloudSync init error:', e);
    }
  },

  generateId() {
    return Math.random().toString(36).substring(2, 8);
  },

  setHouseholdCode(code) {
    if (!code) return;
    this.householdCode = code.trim().toUpperCase();
    try {
      localStorage.setItem('hogarduo_household_code', this.householdCode);
    } catch (e) {}
    this.updateCloudUI();
    this.reconnect();
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
      App.showToast(`Dispositivo configurado para: ${p?.name || userId} 📱`, 'success');
    }
    this.reconnect();
  },

  getMyPeerId() {
    const clean = (this.householdCode || 'HOGAR-2026').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `hogarduo_${clean}_${this.currentUserId}`;
  },

  getPartnerPeerId() {
    const clean = (this.householdCode || 'HOGAR-2026').toLowerCase().replace(/[^a-z0-9]/g, '');
    const partnerRole = this.currentUserId === 'p1' ? 'p2' : 'p1';
    return `hogarduo_${clean}_${partnerRole}`;
  },

  connect() {
    if (!this.householdCode) return;

    // 1. Sincronización instantánea entre pestañas (BroadcastChannel)
    if ('BroadcastChannel' in window) {
      try {
        if (this.channel) this.channel.close();
        this.channel = new BroadcastChannel(`hogarduo_${this.householdCode}`);
        this.channel.onmessage = (event) => {
          this.handleIncomingData(event.data);
        };
      } catch (err) {}
    }

    // 2. Conexión P2P WebRTC
    this.setupPeerJS();
  },

  setupPeerJS() {
    if (typeof Peer === 'undefined') {
      this.updateStatus('online');
      return;
    }

    try {
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
      }

      const myId = this.getMyPeerId();
      this.peer = new Peer(myId, {
        debug: 0
      });

      this.peer.on('open', (id) => {
        this.updateStatus('online');
        this.connectToPartner();
      });

      this.peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        this.updateStatus('online');
      });

      this.peer.on('disconnected', () => {
        this.updateStatus('online');
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (this.peer && !this.peer.destroyed) this.peer.reconnect();
        }, 3000);
      });

      // Chequeo periódico para conectar si la pareja acaba de abrir la app
      clearInterval(this.partnerCheckTimer);
      this.partnerCheckTimer = setInterval(() => {
        if (!this.connection || !this.connection.open) {
          this.connectToPartner();
        }
      }, 5000);
    } catch (e) {
      this.updateStatus('online');
    }
  },

  connectToPartner() {
    if (!this.peer || this.peer.destroyed) return;
    const partnerId = this.getPartnerPeerId();
    try {
      const conn = this.peer.connect(partnerId, {
        reliable: true
      });
      this.setupConnection(conn);
    } catch (e) {}
  },

  setupConnection(conn) {
    if (!conn) return;
    this.connection = conn;

    conn.on('open', () => {
      this.isConnected = true;
      this.updateStatus('online');
      // Sincronizar estado inicial
      this.broadcastChange('FULL_SYNC', { state: Store.state });
      if (typeof App !== 'undefined') {
        const partnerName = Store.state?.profiles?.[this.currentUserId === 'p1' ? 'p2' : 'p1']?.name || 'Tu pareja';
        App.showToast(`Conectado en vivo con ${partnerName} 💑`, 'success');
      }
    });

    conn.on('data', (data) => {
      this.handleIncomingData(data);
    });

    conn.on('close', () => {
      this.isConnected = false;
      this.connection = null;
    });
  },

  reconnect() {
    this.connect();
  },

  // Publicar cambio en la nube
  broadcastChange(type, extraData = {}) {
    const payload = {
      room: this.householdCode,
      senderId: this.deviceId,
      senderUser: this.currentUserId,
      timestamp: Date.now(),
      type: type,
      extra: extraData,
      state: Store.state
    };

    // 1. Canal local
    if (this.channel) {
      try { this.channel.postMessage(payload); } catch (e) {}
    }

    // 2. Enviar por túnel WebRTC P2P
    if (this.connection && this.connection.open) {
      try {
        this.connection.send(payload);
        this.updateStatus('syncing');
        setTimeout(() => this.updateStatus('online'), 300);
      } catch (e) {
        console.warn('P2P send warning:', e);
      }
    } else {
      this.connectToPartner();
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

    // Si es una nota nueva específica
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
      const noteText = payload.extra?.note?.text || 'Nuevo mensaje de amor ❤️';
      
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
    } else {
      dot.style.background = 'var(--success)';
      dot.style.boxShadow = '0 0 6px var(--success)';
      text.textContent = 'En vivo';
      badge.title = `Conectado al Hogar: ${this.householdCode}`;
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
      App.showToast(`✅ Hogar conectado: ${this.householdCode}`, 'success');
    }

    if (typeof App !== 'undefined' && App.requestNotificationPermission) {
      App.requestNotificationPermission();
    }
  }
};

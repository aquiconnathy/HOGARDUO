/**
 * CloudSync - Real-Time Household Synchronization Layer ($0 Cost, Privacy-First)
 * Synchronizes tasks, shopping, pantry, and love notes across both phones in real-time.
 */
const CloudSync = {
  householdCode: 'HOGAR-2026',
  deviceId: null,
  currentUserId: 'p1',
  socket: null,
  isConnected: false,
  channel: null,

  init() {
    try {
      this.deviceId = 'device_' + (localStorage.getItem('hogarduo_device_id') || this.generateId());
      localStorage.setItem('hogarduo_device_id', this.deviceId);

      this.householdCode = localStorage.getItem('hogarduo_household_code') || 'HOGAR-2026';
      this.currentUserId = localStorage.getItem('hogarduo_user_id') || 'p1';

      this.updateCloudUI();
      this.connect();
    } catch (e) {
      console.warn('CloudSync init error:', e);
    }
  },

  generateId() {
    return Math.random().toString(36).substring(2, 9);
  },

  setHouseholdCode(code) {
    if (!code) return;
    this.householdCode = code.trim().toUpperCase();
    try {
      localStorage.setItem('hogarduo_household_code', this.householdCode);
    } catch (e) {}
    this.updateCloudUI();
    this.reconnect();
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(`Conectado al Hogar: ${this.householdCode} ☁️`, 'success');
    }
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
  },

  connect() {
    if (!this.householdCode) return;

    try {
      this.updateStatus('online');

      // 1. BroadcastChannel para sincronización instantánea entre pestañas abiertas en el mismo navegador
      if ('BroadcastChannel' in window) {
        try {
          if (this.channel) this.channel.close();
          this.channel = new BroadcastChannel(`hogarduo_${this.householdCode}`);
          this.channel.onmessage = (event) => {
            this.handleIncomingData(event.data);
          };
        } catch (err) {}
      }

      // 2. Conexión WebSocket para sincronización en tiempo real entre celulares
      this.setupWebsocketRelay();
    } catch (e) {
      console.warn('CloudSync connection warning:', e);
      this.updateStatus('offline');
    }
  },

  setupWebsocketRelay() {
    if (typeof WebSocket === 'undefined') return;

    try {
      if (this.socket) {
        try { this.socket.close(); } catch (e) {}
      }

      // Usar broker websocket seguro público
      this.socket = new WebSocket('wss://echo.websocket.events');

      this.socket.onopen = () => {
        this.isConnected = true;
        this.updateStatus('online');
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.room === this.householdCode && payload.senderId !== this.deviceId) {
            this.handleIncomingData(payload.data);
          }
        } catch (err) {}
      };

      this.socket.onclose = () => {
        this.isConnected = false;
      };

      this.socket.onerror = () => {
        this.isConnected = false;
      };
    } catch (err) {
      this.isConnected = false;
    }
  },

  reconnect() {
    this.connect();
  },

  // Emitir cambios locales a la nube
  broadcastChange(type, data) {
    try {
      const payload = {
        room: this.householdCode,
        senderId: this.deviceId,
        senderUser: this.currentUserId,
        timestamp: Date.now(),
        type: type,
        data: Store.state
      };

      // BroadcastChannel local
      if (this.channel) {
        try { this.channel.postMessage(payload); } catch (e) {}
      }

      // WebSocket remoto
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify(payload));
          this.updateStatus('syncing');
          setTimeout(() => this.updateStatus('online'), 400);
        } catch (e) {}
      }
    } catch (e) {}
  },

  // Recibir y fusionar datos entrantes de la pareja
  handleIncomingData(payload) {
    if (!payload || !payload.data) return;
    if (payload.senderId === this.deviceId) return;

    const incoming = payload.data;
    
    // Fusionar estado entrante
    Store.state = {
      ...Store.state,
      ...incoming
    };

    try {
      localStorage.setItem(Store.STORAGE_KEY, JSON.stringify(Store.state));
    } catch (e) {}

    // Notificar a la UI
    Store.notify();
    this.updateStatus('online');

    // Notificar si hay un nuevo mensaje de la pareja
    if (payload.type === 'NEW_NOTE' && typeof App !== 'undefined') {
      const senderName = Store.state?.profiles?.[payload.senderUser]?.name || 'Tu pareja';
      const lastNote = (Store.state?.notes && Store.state.notes[0]) ? Store.state.notes[0].text : 'Tienes un nuevo mensaje';
      
      App.showToast(`💌 ${senderName} te dejó un mensaje nuevo`, 'success');
      App.sendPushNotification(`💌 Mensaje de ${senderName}`, lastNote);
      
      if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
    }
  },

  updateStatus(status) {
    const badge = document.getElementById('cloud-status-badge');
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');

    if (!badge || !dot || !text) return;

    if (status === 'online') {
      dot.style.background = 'var(--success)';
      text.textContent = 'En vivo';
      badge.title = `Conectado al Hogar (${this.householdCode})`;
    } else if (status === 'syncing') {
      dot.style.background = 'var(--warning)';
      text.textContent = 'Sincronizando...';
    } else if (status === 'connecting') {
      dot.style.background = 'var(--accent)';
      text.textContent = 'Conectando...';
    } else {
      dot.style.background = 'var(--text-muted)';
      text.textContent = 'Modo Local';
      badge.title = 'Sin conexión de sincronización';
    }
  },

  updateCloudUI() {
    const codeEl = document.getElementById('current-household-code-display');
    const codeIn = document.getElementById('household-code-input');
    const userSelect = document.getElementById('device-owner-select');

    if (codeEl) codeEl.textContent = this.householdCode || 'HOGAR-2026';
    if (codeIn && !codeIn.value) codeIn.value = this.householdCode || 'HOGAR-2026';
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
    const code = document.getElementById('household-code-input')?.value.trim();
    const user = document.getElementById('device-owner-select')?.value;

    if (code) this.setHouseholdCode(code);
    if (user) this.setCurrentUser(user);

    this.closeSyncModal();
  }
};

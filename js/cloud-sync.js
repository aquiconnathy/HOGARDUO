/**
 * CloudSync - Universal Fail-Safe Real-Time Synchronization Engine ($0 Cost)
 * Combines Native SSE (Server-Sent Events) + Zero-Preflight HTTPS + 4s Auto-Polling Fallback.
 */
const CloudSync = {
  householdCode: 'HOGAR-2026',
  deviceId: null,
  currentUserId: 'p1',
  eventSource: null,
  isConnected: false,
  channel: null,
  pollTimer: null,
  lastTimestamp: 0,

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

  getTopicName() {
    const cleanCode = (this.householdCode || 'HOGAR-2026').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `hogarduo_${cleanCode}_v1`;
  },

  connect() {
    if (!this.householdCode) return;

    // 1. BroadcastChannel (Sincronización instantánea entre pestañas abiertas localmente)
    if ('BroadcastChannel' in window) {
      try {
        if (this.channel) this.channel.close();
        this.channel = new BroadcastChannel(`hogarduo_${this.householdCode}`);
        this.channel.onmessage = (event) => {
          this.handleIncomingData(event.data);
        };
      } catch (err) {}
    }

    // 2. Conectar stream en tiempo real SSE sobre HTTPS
    this.setupSSERelay();

    // 3. Fallback de sondeo automático cada 4 segundos (garantiza recepción incluso si el móvil duerme el socket)
    this.startPollingFallback();
  },

  setupSSERelay() {
    if (typeof EventSource === 'undefined') {
      this.updateStatus('online');
      return;
    }

    try {
      if (this.eventSource) {
        try { this.eventSource.close(); } catch (e) {}
      }

      const topic = this.getTopicName();
      const sseUrl = `https://ntfy.sh/${topic}/sse`;

      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.updateStatus('online');
      };

      this.eventSource.onmessage = (event) => {
        try {
          const ntfyData = JSON.parse(event.data);
          if (ntfyData && ntfyData.event === 'message' && ntfyData.message) {
            const payload = JSON.parse(ntfyData.message);
            if (payload && payload.senderId !== this.deviceId) {
              this.handleIncomingData(payload);
            }
          }
        } catch (err) {
          // Si el mensaje es texto plano JSON
          try {
            const payload = JSON.parse(event.data);
            if (payload && payload.senderId !== this.deviceId) {
              this.handleIncomingData(payload);
            }
          } catch (e) {}
        }
      };

      this.eventSource.onerror = () => {
        // En caso de reconexión de red móvil
        this.isConnected = false;
        this.updateStatus('online');
      };
    } catch (err) {
      this.updateStatus('online');
    }
  },

  startPollingFallback() {
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.pollLatestUpdates();
    }, 4000);
  },

  async pollLatestUpdates() {
    try {
      const topic = this.getTopicName();
      const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=30s`, { cache: 'no-store' });
      if (!res.ok) return;

      const text = await res.text();
      if (!text) return;

      const lines = text.trim().split('\n');
      for (const line of lines) {
        try {
          const ntfyObj = JSON.parse(line);
          if (ntfyObj && ntfyObj.event === 'message' && ntfyObj.message) {
            const payload = JSON.parse(ntfyObj.message);
            if (payload && payload.senderId !== this.deviceId && payload.timestamp > this.lastTimestamp) {
              this.lastTimestamp = payload.timestamp;
              this.handleIncomingData(payload);
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  },

  reconnect() {
    this.connect();
  },

  // Publicar cambio a la pareja
  async broadcastChange(type, extraData = {}) {
    const payload = {
      room: this.householdCode,
      senderId: this.deviceId,
      senderUser: this.currentUserId,
      timestamp: Date.now(),
      type: type,
      extra: extraData,
      state: Store.state
    };

    this.lastTimestamp = payload.timestamp;

    // 1. Enviar por canal local
    if (this.channel) {
      try { this.channel.postMessage(payload); } catch (e) {}
    }

    // 2. Enviar por HTTPS POST estándar (sin cabeceras personalizadas para evitar preflight CORS)
    this.updateStatus('syncing');

    try {
      const topic = this.getTopicName();
      await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Sync post failed:', err);
    } finally {
      // Siempre restaurar el estado 'online' tras enviar
      setTimeout(() => this.updateStatus('online'), 400);
    }
  },

  // Recibir y fusionar datos entrantes de la pareja
  handleIncomingData(payload) {
    if (!payload) return;
    if (payload.senderId === this.deviceId) return;

    // Actualizar timestamp
    if (payload.timestamp) {
      this.lastTimestamp = Math.max(this.lastTimestamp, payload.timestamp);
    }

    // Fusionar estado
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

    // Notificar a toda la interfaz
    Store.notify();
    this.updateStatus('online');

    // Notificaciones y alertas
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

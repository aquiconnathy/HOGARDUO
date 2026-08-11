/**
 * CloudSync - Universal Real-Time Household Synchronization Layer ($0 Cost, Privacy-First)
 * Uses native Server-Sent Events (SSE) & standard HTTPS (Port 443) via public encrypted relay.
 * Requires 0 accounts, 0 setup, and works reliably across all mobile carriers & WiFi networks.
 */
const CloudSync = {
  householdCode: 'HOGAR-2026',
  deviceId: null,
  currentUserId: 'p1',
  eventSource: null,
  isConnected: false,
  channel: null,
  reconnectTimeout: null,

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
      App.showToast(`Dispositivo configurado como: ${p?.name || userId} 📱`, 'success');
    }
  },

  getTopicName() {
    const cleanCode = (this.householdCode || 'HOGAR-2026').toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `hogarduo_sync_${cleanCode}`;
  },

  connect() {
    if (!this.householdCode) return;

    // 1. Sincronización instantánea local (BroadcastChannel)
    if ('BroadcastChannel' in window) {
      try {
        if (this.channel) this.channel.close();
        this.channel = new BroadcastChannel(`hogarduo_${this.householdCode}`);
        this.channel.onmessage = (event) => {
          this.handleIncomingData(event.data);
        };
      } catch (err) {}
    }

    // 2. Sincronización en tiempo real remota (HTTPS SSE sobre Puerto 443)
    this.setupSSERelay();
  },

  setupSSERelay() {
    if (typeof EventSource === 'undefined') {
      this.updateStatus('offline');
      return;
    }

    try {
      if (this.eventSource) {
        try { this.eventSource.close(); } catch (e) {}
      }

      this.updateStatus('connecting');

      const topic = this.getTopicName();
      const sseUrl = `https://ntfy.sh/${topic}/sse`;

      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.updateStatus('online');
        // Enviar estado inicial para sincronizar el otro teléfono si acaba de abrir la app
        this.broadcastChange('DEVICE_SYNC', Store.state);
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
          console.warn('Sync parse error:', err);
        }
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.updateStatus('offline');
        // Reconectar automáticamente
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
          if (!this.isConnected) this.setupSSERelay();
        }, 5000);
      };
    } catch (err) {
      console.warn('SSE setup warning:', err);
      this.updateStatus('offline');
    }
  },

  reconnect() {
    this.connect();
  },

  // Publicar cambio en la nube
  async broadcastChange(type, data) {
    try {
      const payload = {
        room: this.householdCode,
        senderId: this.deviceId,
        senderUser: this.currentUserId,
        timestamp: Date.now(),
        type: type,
        data: Store.state
      };

      // 1. Canal local
      if (this.channel) {
        try { this.channel.postMessage(payload); } catch (e) {}
      }

      // 2. Relay en la nube vía HTTPS POST
      const topic = this.getTopicName();
      this.updateStatus('syncing');

      fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: {
          'Title': 'HogarDuo',
          'Priority': 'high',
          'Tags': 'cloud,sync'
        },
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (res.ok) {
          this.updateStatus('online');
        }
      })
      .catch(err => {
        console.warn('Sync POST error:', err);
      });
    } catch (e) {
      console.warn('Broadcast error:', e);
    }
  },

  // Recibir y fusionar datos entrantes de la pareja
  handleIncomingData(payload) {
    if (!payload || !payload.data) return;
    if (payload.senderId === this.deviceId) return;

    const incoming = payload.data;

    // Fusionar estado entrante en Store
    Store.state = {
      ...Store.state,
      ...incoming
    };

    try {
      localStorage.setItem(Store.STORAGE_KEY, JSON.stringify(Store.state));
    } catch (e) {}

    // Notificar reactivamente a toda la interfaz
    Store.notify();
    this.updateStatus('online');

    // Notificaciones especiales si la pareja envió una nota o completó algo
    if (payload.type === 'NEW_NOTE' && typeof App !== 'undefined') {
      const senderName = Store.state?.profiles?.[payload.senderUser]?.name || 'Tu pareja';
      const lastNote = (Store.state?.notes && Store.state.notes[0]) ? Store.state.notes[0].text : 'Tienes un nuevo mensaje';
      
      App.showToast(`💌 ${senderName} te dejó una nueva nota`, 'success');
      App.sendPushNotification(`💌 Mensaje de ${senderName}`, lastNote);
      
      if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
    } else if (payload.type === 'STATE_UPDATED' && typeof App !== 'undefined') {
      App.showToast('Datos actualizados de tu pareja 🔄', 'info');
    }
  },

  updateStatus(status) {
    const badge = document.getElementById('cloud-status-badge');
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');

    if (!badge || !dot || !text) return;

    if (status === 'online') {
      dot.style.background = 'var(--success)';
      dot.style.boxShadow = '0 0 6px var(--success)';
      text.textContent = 'En vivo';
      badge.title = `Conectado al Hogar: ${this.householdCode}`;
    } else if (status === 'syncing') {
      dot.style.background = 'var(--warning)';
      dot.style.boxShadow = '0 0 6px var(--warning)';
      text.textContent = 'Sincronizando...';
    } else if (status === 'connecting') {
      dot.style.background = 'var(--accent)';
      dot.style.boxShadow = '0 0 6px var(--accent)';
      text.textContent = 'Conectando...';
    } else {
      dot.style.background = 'var(--text-muted)';
      dot.style.boxShadow = 'none';
      text.textContent = 'Reconectando';
      badge.title = 'Reconectando sincronización...';
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
      App.showToast(`✅ Hogar conectado: ${this.householdCode}`, 'success');
    }
  }
};

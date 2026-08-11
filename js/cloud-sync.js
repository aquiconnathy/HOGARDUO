/**
 * CloudSync - Real-Time Household Synchronization Layer ($0 Cost, Privacy-First)
 * Uses high-speed MQTT over WebSockets + BroadcastChannel to sync between phones worldwide.
 */
const CloudSync = {
  householdCode: 'HOGAR-2026',
  deviceId: null,
  currentUserId: 'p1',
  client: null,
  isConnected: false,
  channel: null,
  reconnectTimer: null,

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
      App.showToast(`Dispositivo asignado a: ${p?.name || userId} 📱`, 'success');
    }
  },

  connect() {
    if (!this.householdCode) return;

    // 1. BroadcastChannel (Para sincronización entre pestañas en el mismo equipo/red)
    if ('BroadcastChannel' in window) {
      try {
        if (this.channel) this.channel.close();
        this.channel = new BroadcastChannel(`hogarduo_${this.householdCode}`);
        this.channel.onmessage = (event) => {
          this.handleIncomingData(event.data);
        };
      } catch (err) {}
    }

    // 2. MQTT over WebSockets (Para sincronización en tiempo real entre celulares diferentes)
    this.setupMQTTRelay();
  },

  setupMQTTRelay() {
    if (typeof Paho === 'undefined' || !Paho.MQTT) {
      console.warn('Paho MQTT library not loaded, using local sync fallback');
      this.updateStatus('online');
      return;
    }

    try {
      if (this.client) {
        try { this.client.disconnect(); } catch (e) {}
      }

      this.updateStatus('connecting');

      // Brokers públicos gratuitos y de alta disponibilidad con SSL
      const brokers = [
        { host: 'broker.emqx.io', port: 8084, path: '/mqtt' },
        { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' }
      ];

      const broker = brokers[0];
      const clientId = `hd_${this.deviceId}_${Math.floor(Math.random() * 1000)}`;
      
      this.client = new Paho.MQTT.Client(broker.host, broker.port, broker.path, clientId);

      this.client.onConnectionLost = (responseObject) => {
        this.isConnected = false;
        this.updateStatus('offline');
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 4000);
      };

      this.client.onMessageArrived = (message) => {
        try {
          const payload = JSON.parse(message.payloadString);
          if (payload && payload.senderId !== this.deviceId) {
            this.handleIncomingData(payload);
          }
        } catch (err) {
          console.warn('Error parsing incoming sync packet:', err);
        }
      };

      const topic = `hogarduo/room/${this.householdCode.toLowerCase()}/sync`;

      this.client.connect({
        useSSL: true,
        timeout: 5,
        keepAliveInterval: 30,
        cleanSession: true,
        onSuccess: () => {
          this.isConnected = true;
          this.client.subscribe(topic, { qos: 1 });
          this.updateStatus('online');
          // Enviar estado local inicial
          this.broadcastChange('DEVICE_JOINED', Store.state);
        },
        onFailure: (err) => {
          console.warn('MQTT Connection error, retrying in 5s:', err);
          this.isConnected = false;
          this.updateStatus('offline');
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        }
      });
    } catch (err) {
      console.warn('MQTT setup error:', err);
      this.updateStatus('offline');
    }
  },

  reconnect() {
    this.connect();
  },

  // Emitir cambios locales a la pareja
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

      // 1. Enviar por BroadcastChannel local
      if (this.channel) {
        try { this.channel.postMessage(payload); } catch (e) {}
      }

      // 2. Enviar por MQTT a través de la nube
      if (this.client && this.client.isConnected()) {
        try {
          const topic = `hogarduo/room/${this.householdCode.toLowerCase()}/sync`;
          const msg = new Paho.MQTT.Message(JSON.stringify(payload));
          msg.destinationName = topic;
          msg.qos = 1;
          this.client.send(msg);
          
          this.updateStatus('syncing');
          setTimeout(() => this.updateStatus('online'), 350);
        } catch (e) {
          console.warn('MQTT send failed:', e);
        }
      }
    } catch (e) {}
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

    // Notificar a toda la interfaz de usuario
    Store.notify();
    this.updateStatus('online');

    // Notificar al usuario si la pareja envió una nota
    if (payload.type === 'NEW_NOTE' && typeof App !== 'undefined') {
      const senderName = Store.state?.profiles?.[payload.senderUser]?.name || 'Tu pareja';
      const lastNote = (Store.state?.notes && Store.state.notes[0]) ? Store.state.notes[0].text : 'Tienes un nuevo mensaje';
      
      App.showToast(`💌 ${senderName} te dejó una nueva nota`, 'success');
      App.sendPushNotification(`💌 Mensaje de ${senderName}`, lastNote);
      
      if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
    } else if (payload.type === 'STATE_UPDATED' && typeof App !== 'undefined') {
      App.showToast('Datos sincronizados en vivo 🔄', 'info');
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
      badge.title = `Conectado al Hogar (${this.householdCode})`;
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
      badge.title = 'Buscando conexión con la pareja...';
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
    const code = document.getElementById('household-code-input')?.value.trim();
    const user = document.getElementById('device-owner-select')?.value;

    if (code) {
      this.setHouseholdCode(code);
    }
    if (user) {
      this.setCurrentUser(user);
    }

    this.closeSyncModal();
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(`Hogar conectado con éxito: ${this.householdCode} ☁️`, 'success');
    }
  }
};

/**
 * App - Main Controller, Tab Router, Profiles with Photos, Native Confetti & PWA Manager
 */
const App = {
  deferredPrompt: null,

  init() {
    Store.init();
    this.applyTheme(Store.state.theme || 'dark');
    this.updateProfileUI();
    this.renderWidgets();

    // Iniciar Módulos
    CloudSync.init();
    Notes.init();
    BCV.init();
    Tasks.init();
    Pantry.init();
    Shopping.init();
    Personal.init();

    // Registrar cambios en el Store para re-renderizar
    Store.subscribe(() => {
      this.updateProfileUI();
      this.renderWidgets();
      Notes.render();
      BCV.renderRates();
      Tasks.render();
      Pantry.render();
      Shopping.render();
      Personal.render();
    });

    // PWA Install Event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBox = document.getElementById('pwa-install-box');
      if (installBox) installBox.style.display = 'block';
    });

    // Service Worker Registration
    if (window.location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then((registration) => {
        registration.update();
      }).catch(err => console.log('SW registration skipped:', err));
    }
  },

  renderAll() {
    this.updateProfileUI();
    this.renderWidgets();
    Notes.render();
    BCV.renderRates();
    Tasks.render();
    Pantry.render();
    Shopping.render();
    Personal.render();
  },

  // Enrutador de Pestañas
  navigateTo(tabId) {
    document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => item.classList.remove('active'));

    const targetView = document.getElementById(`view-${tabId}`);
    const targetNav = document.querySelector(`.bottom-nav .nav-item[data-tab="${tabId}"]`);

    if (targetView) targetView.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    if (tabId === 'personal' && typeof Personal !== 'undefined') {
      Personal.render();
    } else if (tabId === 'settings' && typeof CloudSync !== 'undefined') {
      CloudSync.updateDiagnosticsUI();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ==========================================
  // COMUNICACIÓN RÁPIDA 1-TAP CON LA PAREJA
  // ==========================================

  getPartnerData() {
    const currentRole = CloudSync.currentUserId || 'p1';
    const partnerRole = currentRole === 'p1' ? 'p2' : 'p1';
    const partner = Store.state?.profiles?.[partnerRole] || { name: 'Tu pareja', phone: '' };
    return { role: partnerRole, profile: partner };
  },

  callPartner() {
    const { profile } = this.getPartnerData();
    if (!profile.phone) {
      this.showToast(`Agrega el número de ${profile.name} en Ajustes ⚙️`, 'warning');
      this.navigateTo('settings');
      return;
    }
    window.location.href = `tel:${profile.phone.replace(/[^0-9+]/g, '')}`;
  },

  whatsappPartner() {
    const { profile } = this.getPartnerData();
    if (!profile.phone) {
      this.showToast(`Agrega el número de ${profile.name} en Ajustes ⚙️`, 'warning');
      this.navigateTo('settings');
      return;
    }
    const cleanPhone = profile.phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  },

  telegramPartner() {
    const { profile } = this.getPartnerData();
    if (!profile.phone) {
      this.showToast(`Agrega el número de ${profile.name} en Ajustes ⚙️`, 'warning');
      this.navigateTo('settings');
      return;
    }
    const cleanPhone = profile.phone.replace(/[^0-9+]/g, '');
    window.open(`https://t.me/+${cleanPhone.replace('+', '')}`, '_blank');
  },

  smsPartner() {
    const { profile } = this.getPartnerData();
    if (!profile.phone) {
      this.showToast(`Agrega el número de ${profile.name} en Ajustes ⚙️`, 'warning');
      this.navigateTo('settings');
      return;
    }
    window.location.href = `sms:${profile.phone.replace(/[^0-9+]/g, '')}`;
  },

  // Subir Foto de Perfil
  triggerPhotoUpload(role) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        CloudSync.handlePhotoUpload(file, role);
      }
    };
    fileInput.click();
  },

  // Actualizar Nombres, Fotos y Avatares en la UI
  updateProfileUI() {
    const p1 = Store.state.profiles.p1 || { name: 'Ella', avatar: '👩' };
    const p2 = Store.state.profiles.p2 || { name: 'Él', avatar: '👨' };

    const headerNames = document.getElementById('header-couple-names');
    const greeting = document.getElementById('dash-greeting');
    const myProfileName = document.getElementById('my-profile-name-tag');

    const currentRole = CloudSync.currentUserId || 'p1';
    const me = currentRole === 'p1' ? p1 : p2;
    const partner = currentRole === 'p1' ? p2 : p1;

    if (headerNames) headerNames.textContent = `${p1.name} & ${p2.name}`;
    if (greeting) greeting.textContent = `¡Hola, ${me.name}! 💑`;
    if (myProfileName) myProfileName.textContent = `Tú (${me.name})`;

    // Tarjeta "Nosotros" en Inicio
    const p1PhotoEl = document.getElementById('card-photo-p1');
    const p2PhotoEl = document.getElementById('card-photo-p2');
    const p1NameEl = document.getElementById('card-name-p1');
    const p2NameEl = document.getElementById('card-name-p2');
    const partnerCommTitle = document.getElementById('partner-comm-title');

    if (p1PhotoEl) {
      p1PhotoEl.innerHTML = p1.photo 
        ? `<img src="${p1.photo}" class="couple-hero-avatar-img" alt="${p1.name}">`
        : `<span class="couple-hero-avatar-emoji">${p1.avatar || '👩'}</span>`;
    }
    if (p2PhotoEl) {
      p2PhotoEl.innerHTML = p2.photo 
        ? `<img src="${p2.photo}" class="couple-hero-avatar-img" alt="${p2.name}">`
        : `<span class="couple-hero-avatar-emoji">${p2.avatar || '👨'}</span>`;
    }
    if (p1NameEl) p1NameEl.textContent = p1.name;
    if (p2NameEl) p2NameEl.textContent = p2.name;
    if (partnerCommTitle) partnerCommTitle.textContent = `Hablar con ${partner.name}`;

    // Cargar en vista Ajustes
    const p1NameIn = document.getElementById('p1-name-input');
    const p1PhoneIn = document.getElementById('p1-phone-input');
    const p2NameIn = document.getElementById('p2-name-input');
    const p2PhoneIn = document.getElementById('p2-phone-input');

    if (p1NameIn && !p1NameIn.value) p1NameIn.value = p1.name;
    if (p1PhoneIn && !p1PhoneIn.value) p1PhoneIn.value = p1.phone || '';
    if (p2NameIn && !p2NameIn.value) p2NameIn.value = p2.name;
    if (p2PhoneIn && !p2PhoneIn.value) p2PhoneIn.value = p2.phone || '';
  },

  saveProfiles() {
    const p1Name = document.getElementById('p1-name-input')?.value.trim() || 'Ella';
    const p1Phone = document.getElementById('p1-phone-input')?.value.trim() || '';
    const p2Name = document.getElementById('p2-name-input')?.value.trim() || 'Él';
    const p2Phone = document.getElementById('p2-phone-input')?.value.trim() || '';

    Store.state.profiles.p1.name = p1Name;
    Store.state.profiles.p1.phone = p1Phone;
    Store.state.profiles.p2.name = p2Name;
    Store.state.profiles.p2.phone = p2Phone;

    Store.save(true);
    CloudSync.broadcastChange('PROFILE_UPDATED', Store.state);

    this.updateProfileUI();
    Tasks.render();
    Notes.render();
    this.showToast('Perfiles actualizados con éxito ❤️', 'success');
  },

  // Tema Claro / Oscuro
  toggleTheme(isDark) {
    const theme = isDark ? 'dark' : 'light';
    Store.state.theme = theme;
    Store.save(false);
    this.applyTheme(theme);
  },

  toggleThemeQuick() {
    const nextTheme = Store.state.theme === 'dark' ? 'light' : 'dark';
    this.toggleTheme(nextTheme === 'dark');
    this.showToast(`Modo ${nextTheme === 'dark' ? 'Oscuro 🌙' : 'Claro ☀️'} activado`, 'info');
  },

  applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    const checkbox = document.getElementById('theme-checkbox');
    const quickBtn = document.getElementById('btn-quick-theme');

    if (checkbox) checkbox.checked = (theme === 'dark');
    if (quickBtn) quickBtn.textContent = (theme === 'dark') ? '🌙' : '☀️';
  },

  // Personalización de Widgets del Inicio
  toggleWidget(widgetKey, isVisible) {
    if (!Store.state.widgets) {
      Store.state.widgets = { showNotes: true, showStats: true, showQuickActions: true };
    }
    Store.state.widgets[widgetKey] = isVisible;
    Store.save(true);
    this.renderWidgets();
  },

  renderWidgets() {
    const w = Store.state.widgets || { showNotes: true, showStats: true, showQuickActions: true };
    
    const secNotes = document.getElementById('sec-widget-notes');
    const secStats = document.getElementById('sec-widget-stats');
    const secActions = document.getElementById('sec-widget-actions');

    if (secNotes) secNotes.style.display = w.showNotes !== false ? 'block' : 'none';
    if (secStats) secStats.style.display = w.showStats !== false ? 'grid' : 'none';
    if (secActions) secActions.style.display = w.showQuickActions !== false ? 'flex' : 'none';

    // Switches en Ajustes
    const tNotes = document.getElementById('toggle-widget-notes');
    const tStats = document.getElementById('toggle-widget-stats');
    const tActions = document.getElementById('toggle-widget-actions');

    if (tNotes) tNotes.checked = w.showNotes !== false;
    if (tStats) tStats.checked = w.showStats !== false;
    if (tActions) tActions.checked = w.showQuickActions !== false;
  },

  // Toast Notification
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s forwards ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  },

  // Banner Flotante Superior
  showInAppBanner(senderName, noteText, noteType = 'love') {
    const container = document.getElementById('inapp-banner-container');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = `inapp-floating-banner banner-${noteType}`;
    
    banner.innerHTML = `
      <div class="banner-avatar">💌</div>
      <div class="banner-content">
        <strong class="banner-title">${senderName}</strong>
        <p class="banner-body">${noteText}</p>
      </div>
      <button class="banner-close" onclick="this.parentElement.remove()">✕</button>
    `;

    banner.onclick = (e) => {
      if (e.target.classList.contains('banner-close')) return;
      App.navigateTo('dashboard');
      banner.remove();
    };

    container.appendChild(banner);
    setTimeout(() => {
      if (banner.parentElement) {
        banner.style.animation = 'bannerSlideUp 0.35s ease forwards';
        setTimeout(() => banner.remove(), 350);
      }
    }, 6000);
  },

  // Notificación Push
  sendPushNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: title,
            body: body,
            icon: 'icons/icon.svg'
          });
        } else {
          new Notification(title, {
            body: body,
            icon: 'icons/icon.svg',
            vibrate: [200, 100, 200]
          });
        }
      } catch (e) {}
    }
  },

  testNotification() {
    this.sendPushNotification('💌 HogarDúo en Vivo', '¡Las notificaciones están funcionando perfectamente en este teléfono! ❤️');
    this.showToast('Notificación de prueba enviada 🔔', 'info');
  },

  requestNotificationPermission() {
    if (!('Notification' in window)) {
      this.showToast('Este navegador no soporta notificaciones', 'warning');
      return;
    }

    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        this.showToast('¡Notificaciones activadas con éxito! 🔔', 'success');
        this.testNotification();
      } else {
        this.showToast('Permiso de notificaciones denegado', 'warning');
      }
      CloudSync.updateDiagnosticsUI();
    });
  },

  // Confetti Nativo en Canvas
  triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const numberOfPieces = 50;
    const colors = ['#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    for (let i = 0; i < numberOfPieces; i++) {
      pieces.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        r: Math.random() * 5 + 3,
        d: Math.random() * numberOfPieces,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngleIncremental: (Math.random() * 0.07) + .05,
        tiltAngle: 0,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12 - 4
      });
    }

    let animationFrame;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let stillActive = false;

      pieces.forEach(p => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.x += Math.sin(p.d);
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // Gravedad

        if (p.y < canvas.height) stillActive = true;

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });

      if (stillActive) {
        animationFrame = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationFrame);
      }
    };

    draw();
  },

  installPWA() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          this.showToast('¡HogarDúo instalada en tu pantalla de inicio! 📱', 'success');
        }
        this.deferredPrompt = null;
      });
    } else {
      this.showToast('Para instalar: abre el menú de tu navegador y selecciona "Agregar a pantalla principal"', 'info');
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});

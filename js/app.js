/**
 * App - Main Controller, Tab Router, Profiles, Native Confetti & PWA Manager
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

    // Registrar cambios en el Store para re-renderizar
    Store.subscribe(() => {
      this.updateProfileUI();
      this.renderWidgets();
      Notes.render();
      BCV.renderRates();
      Tasks.render();
      Pantry.render();
      Shopping.render();
    });

    // PWA Install Event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBox = document.getElementById('pwa-install-box');
      if (installBox) installBox.style.display = 'block';
    });

    // Service Worker Registration (solo en http/https)
    if (window.location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration skipped:', err));
    }
  },

  // Enrutador de Pestañas
  navigateTo(tabId) {
    document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => item.classList.remove('active'));

    const targetView = document.getElementById(`view-${tabId}`);
    const targetNav = document.querySelector(`.bottom-nav .nav-item[data-tab="${tabId}"]`);

    if (targetView) targetView.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // Actualizar Nombres y Avatares en la UI
  updateProfileUI() {
    const p1 = Store.state.profiles.p1;
    const p2 = Store.state.profiles.p2;

    const headerNames = document.getElementById('header-couple-names');
    const dashP1 = document.getElementById('dash-avatar-p1');
    const dashP2 = document.getElementById('dash-avatar-p2');
    const greeting = document.getElementById('dash-greeting');

    if (headerNames) headerNames.textContent = `${p1.avatar} ${p1.name} & ${p2.avatar} ${p2.name}`;
    if (dashP1) dashP1.textContent = p1.avatar;
    if (dashP2) dashP2.textContent = p2.avatar;
    if (greeting) greeting.textContent = `¡Hola, ${p1.name} y ${p2.name}! 💑`;

    // Cargar en vista Ajustes
    const p1NameIn = document.getElementById('p1-name-input');
    const p1AvatarIn = document.getElementById('p1-avatar-input');
    const p2NameIn = document.getElementById('p2-name-input');
    const p2AvatarIn = document.getElementById('p2-avatar-input');

    if (p1NameIn && !p1NameIn.value) p1NameIn.value = p1.name;
    if (p1AvatarIn && !p1AvatarIn.value) p1AvatarIn.value = p1.avatar;
    if (p2NameIn && !p2NameIn.value) p2NameIn.value = p2.name;
    if (p2AvatarIn && !p2AvatarIn.value) p2AvatarIn.value = p2.avatar;
  },

  saveProfiles() {
    const p1Name = document.getElementById('p1-name-input').value.trim() || 'Ella';
    const p1Avatar = document.getElementById('p1-avatar-input').value.trim() || '👩';
    const p2Name = document.getElementById('p2-name-input').value.trim() || 'Él';
    const p2Avatar = document.getElementById('p2-avatar-input').value.trim() || '👨';

    Store.state.profiles.p1.name = p1Name;
    Store.state.profiles.p1.avatar = p1Avatar;
    Store.state.profiles.p2.name = p2Name;
    Store.state.profiles.p2.avatar = p2Avatar;

    Store.save(true);
    this.updateProfileUI();
    Tasks.render();
    Notes.render();
    this.showToast('Perfiles de la pareja actualizados ❤️', 'success');
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

  // Personalización de Widgets del Inicio (Mostrar / Ocultar)
  toggleWidget(widgetKey, isVisible) {
    if (!Store.state.widgets) {
      Store.state.widgets = { showNotes: true, showStats: true, showQuickActions: true };
    }
    Store.state.widgets[widgetKey] = isVisible;
    Store.save(true);
    this.renderWidgets();
    App.showToast('Preferencia de widgets guardada 🎛️', 'success');
  },

  renderWidgets() {
    const widgets = Store.state.widgets || { showNotes: true, showStats: true, showQuickActions: true };

    const notesEl = document.getElementById('widget-notes-section');
    const statsEl = document.getElementById('widget-stats-section');
    const actionsEl = document.getElementById('widget-actions-section');

    const toggleNotes = document.getElementById('toggle-widget-notes');
    const toggleStats = document.getElementById('toggle-widget-stats');
    const toggleActions = document.getElementById('toggle-widget-actions');

    if (notesEl) notesEl.style.display = widgets.showNotes !== false ? 'block' : 'none';
    if (statsEl) statsEl.style.display = widgets.showStats !== false ? 'grid' : 'none';
    if (actionsEl) actionsEl.style.display = widgets.showQuickActions !== false ? 'grid' : 'none';

    if (toggleNotes) toggleNotes.checked = widgets.showNotes !== false;
    if (toggleStats) toggleStats.checked = widgets.showStats !== false;
    if (toggleActions) toggleActions.checked = widgets.showQuickActions !== false;
  },

  // Sistema de Notificaciones Nativas del Celular
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      this.showToast('Tu navegador no soporta notificaciones push', 'warning');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.showToast('¡Notificaciones push activadas! 🔔', 'success');
        this.sendPushNotification('💑 HogarDúo Conectado', 'Recibirás avisos cuando tu pareja deje notas o tareas.');
        const btn = document.getElementById('btn-enable-notifications');
        if (btn) btn.textContent = '✅ Notificaciones Activadas';
      } else {
        this.showToast('Permiso de notificaciones denegado', 'warning');
      }
    } catch (e) {
      console.warn('Notification error:', e);
    }
  },

  sendPushNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, {
            body: body,
            icon: 'icons/icon.svg',
            badge: 'icons/icon.svg',
            vibrate: [200, 100, 200],
            tag: 'hogarduo-notification'
          });
        });
      } else {
        new Notification(title, {
          body: body,
          icon: 'icons/icon.svg'
        });
      }
    } catch (e) {
      console.warn('Send notification error:', e);
    }
  },

  // Motor Nativo de Confeti en HTML5 Canvas (Ponytail: Cero dependencias externas)
  triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#ec4899', '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#a855f7'];

    for (let i = 0; i < 70; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        r: Math.random() * 6 + 4,
        d: Math.random() * 50 + 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngleIncremental: (Math.random() * 0.07) + .05,
        tiltAngle: 0,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 16
      });
    }

    let animationFrame;
    let opacity = 1;

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = opacity;

      particles.forEach(p => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2 + p.vy;
        p.x += Math.sin(p.d) * 2 + p.vx;
        p.vy += 0.3; // Gravedad
        p.tilt = Math.sin(p.tiltAngle - (p.r / 3)) * 15;

        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + (p.r / 4), p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + (p.r / 4));
        ctx.stroke();
      });

      opacity -= 0.015;
      if (opacity > 0) {
        animationFrame = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationFrame);
      }
    }

    render();
  },

  // Instalación PWA
  async installPWA() {
    if (!this.deferredPrompt) {
      this.showToast('Para instalar: usa el menú de tu navegador "Añadir a pantalla de inicio" 📲', 'info');
      return;
    }
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      this.showToast('¡Gracias por instalar HogarDúo! 🎉', 'success');
    }
    this.deferredPrompt = null;
  }
};

// Inicialización Automática al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

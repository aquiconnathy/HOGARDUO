/**
 * Store - Central Reactive State Manager (LocalStorage based, 100% Offline-First)
 */
const Store = {
  STORAGE_KEY: 'hogarduo_app_data_v1',
  
  // Estado por defecto inicial
  state: {
    profiles: {
      p1: { name: 'Ella', avatar: '👩', color: '#ec4899' },
      p2: { name: 'Él', avatar: '👨', color: '#3b82f6' }
    },
    notes: [
      {
        id: 'note_welcome',
        text: '¡Hola amor! Recuerda que hoy nos toca revisar la despensa y comprar el queso blanco ❤️ Te amo!',
        type: 'love',
        author: 'p1',
        timestamp: Date.now() - 3600000,
        reminderTime: null,
        reactions: { '❤️': 2, '🥰': 1 }
      }
    ],
    bcv: {
      rate: 68.50,
      lastUpdated: null,
      source: 'Oficial BCV'
    },
    budget: {
      usd: 60.00
    },
    tasks: [
      { id: '1', title: 'Lavar y secar los platos', assignee: 'p1', frequency: 'daily', completed: false },
      { id: '2', title: 'Sacar la basura y reciclaje', assignee: 'p2', frequency: 'daily', completed: false },
      { id: '3', title: 'Limpiar y ordenar la cocina', assignee: 'both', frequency: 'daily', completed: false },
      { id: '4', title: 'Barrer y trapear la sala', assignee: 'unassigned', frequency: 'weekly', completed: false },
      { id: '5', title: 'Lavar ropa y toallas', assignee: 'p1', frequency: 'weekly', completed: false },
      { id: '6', title: 'Limpiar el baño principal', assignee: 'p2', frequency: 'weekly', completed: false }
    ],
    pantry: [
      { id: '1', name: 'Harina PAN (Maíz)', category: 'viveres', status: 'abundant' },
      { id: '2', name: 'Arroz blanco', category: 'viveres', status: 'low' },
      { id: '3', name: 'Aceite vegetal', category: 'viveres', status: 'out' },
      { id: '4', name: 'Café molido', category: 'viveres', status: 'low' },
      { id: '5', name: 'Huevos (Cartón)', category: 'proteinas', status: 'out' },
      { id: '6', name: 'Pechuga de pollo', category: 'proteinas', status: 'abundant' },
      { id: '7', name: 'Queso blanco llanero', category: 'proteinas', status: 'low' },
      { id: '8', name: 'Detergente en polvo', category: 'limpieza', status: 'abundant' },
      { id: '9', name: 'Lavaplatos líquido', category: 'limpieza', status: 'out' },
      { id: '10', name: 'Pasta dental', category: 'higiene', status: 'low' },
      { id: '11', name: 'Jabón de baño', category: 'higiene', status: 'abundant' },
      { id: '12', name: 'Papel higiénico', category: 'higiene', status: 'out' }
    ],
    shoppingList: [
      { id: '1', name: 'Aceite vegetal (1L)', qty: 1, priceUSD: 3.20, checked: false, origin: 'pantry' },
      { id: '2', name: 'Huevos (Medio cartón)', qty: 1, priceUSD: 2.80, checked: false, origin: 'pantry' },
      { id: '3', name: 'Lavaplatos líquido', qty: 1, priceUSD: 1.50, checked: false, origin: 'pantry' },
      { id: '4', name: 'Papel higiénico (4 rollos)', qty: 1, priceUSD: 2.50, checked: false, origin: 'pantry' }
    ],
    theme: 'dark',
    widgets: {
      showNotes: true,
      showStats: true,
      showQuickActions: true
    }
  },

  listeners: [],

  init() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          if (parsed.profiles) this.state.profiles = { ...this.state.profiles, ...parsed.profiles };
          if (parsed.bcv) this.state.bcv = { ...this.state.bcv, ...parsed.bcv };
          if (parsed.budget) this.state.budget = { ...this.state.budget, ...parsed.budget };
          if (parsed.widgets) this.state.widgets = { ...this.state.widgets, ...parsed.widgets };
          if (Array.isArray(parsed.notes)) this.state.notes = parsed.notes;
          if (Array.isArray(parsed.tasks)) this.state.tasks = parsed.tasks;
          if (Array.isArray(parsed.pantry)) this.state.pantry = parsed.pantry;
          if (Array.isArray(parsed.shoppingList)) this.state.shoppingList = parsed.shoppingList;
          if (parsed.theme) this.state.theme = parsed.theme;
        }
      }
    } catch (e) {
      console.warn('Error loading from localStorage:', e);
    }
  },

  save(broadcast = true) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
      this.notify();
      if (broadcast && typeof CloudSync !== 'undefined' && CloudSync.broadcastChange) {
        CloudSync.broadcastChange('STATE_UPDATED', this.state);
      }
    } catch (e) {
      console.error('Error saving state:', e);
    }
  },

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.push(listener);
    }
  },

  notify() {
    this.listeners.forEach(fn => {
      try { fn(this.state); } catch (e) { console.error('Listener error:', e); }
    });
  },

  // 1-Click JSON Data Export
  exportBackup() {
    const dataStr = JSON.stringify(this.state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `hogarduo_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast('Copia de seguridad descargada con éxito 📥', 'success');
    }
  },

  // 1-Click JSON Data Import
  importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (imported && imported.profiles && imported.tasks) {
          this.state = {
            ...this.state,
            ...imported
          };
          this.save(true);
          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast('Datos restaurados correctamente 🎉', 'success');
          }
          setTimeout(() => window.location.reload(), 800);
        } else {
          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast('El archivo no tiene el formato válido de HogarDúo', 'danger');
          }
        }
      } catch (err) {
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('Error al leer el archivo JSON', 'danger');
        }
      }
    };
    reader.readAsText(file);
  }
};

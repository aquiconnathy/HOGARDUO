/**
 * Personal - Private Space Engine for Individual Tasks, Reminders & Wishlist
 * 100% private and independent for each partner.
 */
const Personal = {
  activeTab: 'shopping', // 'shopping', 'tasks', 'reminders'
  currentCategoryFilter: 'all',

  defaultCategories: [
    { id: 'ropa', name: '👗 Ropa & Calzado', color: '#ec4899' },
    { id: 'cuidado', name: '🧴 Cuidado & Belleza', color: '#8b5cf6' },
    { id: 'tech', name: '📱 Tecnología & Gadgets', color: '#3b82f6' },
    { id: 'libros', name: '📚 Libros & Estudio', color: '#10b981' },
    { id: 'antojos', name: '🍫 Antojos & Gustos', color: '#f59e0b' },
    { id: 'hogar_personal', name: '🏠 Para mi Espacio', color: '#6366f1' }
  ],

  data: {
    tasks: [],
    reminders: [],
    shopping: [],
    categories: []
  },

  init() {
    this.loadLocalData();
    this.render();
  },

  getStorageKey() {
    const userId = CloudSync?.currentUserId || 'p1';
    return `hogarduo_personal_${userId}`;
  },

  loadLocalData() {
    try {
      const key = this.getStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        this.data = JSON.parse(saved);
      }
      if (!this.data.categories || this.data.categories.length === 0) {
        this.data.categories = [...this.defaultCategories];
      }
      if (!this.data.tasks) this.data.tasks = [];
      if (!this.data.reminders) this.data.reminders = [];
      if (!this.data.shopping) this.data.shopping = [];
    } catch (e) {
      console.warn('Error loading personal data:', e);
      this.data = { tasks: [], reminders: [], shopping: [], categories: [...this.defaultCategories] };
    }
  },

  save() {
    try {
      const key = this.getStorageKey();
      localStorage.setItem(key, JSON.stringify(this.data));
      // Sincronizar en la nube privada del usuario si está conectado
      if (CloudSync?.syncPersonalData) {
        CloudSync.syncPersonalData(this.data);
      }
    } catch (e) {}
  },

  switchTab(tab) {
    this.activeTab = tab;
    
    document.querySelectorAll('.personal-subtab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.personal-tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `personal-pane-${tab}`);
    });

    this.render();
  },

  render() {
    if (this.activeTab === 'shopping') this.renderShopping();
    else if (this.activeTab === 'tasks') this.renderTasks();
    else if (this.activeTab === 'reminders') this.renderReminders();
  },

  // ==========================================
  // 1. COMPRAS & DESEOS PERSONALES (WISHLIST)
  // ==========================================

  setCategoryFilter(catId) {
    this.currentCategoryFilter = catId;
    this.renderShopping();
  },

  renderShopping() {
    const listEl = document.getElementById('personal-shopping-list');
    const categoriesBar = document.getElementById('personal-categories-bar');
    const summaryUSD = document.getElementById('personal-shop-total-usd');
    const summaryBS = document.getElementById('personal-shop-total-bs');
    const countEl = document.getElementById('personal-shop-count');

    if (!listEl) return;

    const rate = Store.state?.bcv?.rate || 761.22;
    const items = this.data.shopping || [];
    const categories = this.data.categories || this.defaultCategories;

    // Renderizar barra de categorías
    if (categoriesBar) {
      categoriesBar.innerHTML = `
        <button class="cat-chip ${this.currentCategoryFilter === 'all' ? 'active' : ''}" onclick="Personal.setCategoryFilter('all')">
          🌟 Todas (${items.length})
        </button>
        ${categories.map(c => {
          const count = items.filter(i => i.category === c.id).length;
          return `
            <button class="cat-chip ${this.currentCategoryFilter === c.id ? 'active' : ''}" onclick="Personal.setCategoryFilter('${c.id}')" style="--chip-color: ${c.color || '#ec4899'}">
              ${c.name} ${count > 0 ? `(${count})` : ''}
            </button>
          `;
        }).join('')}
        <button class="cat-chip btn-add-cat" onclick="Personal.openCategoryModal()">
          ➕ Nueva Categoría
        </button>
      `;
    }

    // Filtrar items
    const filtered = this.currentCategoryFilter === 'all' 
      ? items 
      : items.filter(i => i.category === this.currentCategoryFilter);

    // Calcular Totales
    const pendingItems = items.filter(i => !i.checked);
    const totalUSD = pendingItems.reduce((acc, item) => acc + ((item.priceUSD || 0) * (item.qty || 1)), 0);
    const totalBS = totalUSD * rate;

    if (summaryUSD) summaryUSD.textContent = `$${totalUSD.toFixed(2)}`;
    if (summaryBS) summaryBS.textContent = `Bs ${totalBS.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (countEl) countEl.textContent = `${pendingItems.length} pendientes (${items.filter(i => i.checked).length} comprados)`;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state glass-panel text-center" style="padding: 2rem 1rem;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🛍️</span>
          <h4>No hay compras en esta categoría</h4>
          <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 1rem;">Anota tus gustos, ropa, cosas que deseas comprar o regalos pendientes.</p>
          <button class="btn btn-primary btn-sm" onclick="Personal.openShoppingModal()">
            ➕ Agregar Compra / Deseo
          </button>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(item => {
      const cat = categories.find(c => c.id === item.category) || { name: 'General', color: '#ec4899' };
      const itemTotalUSD = (item.priceUSD || 0) * (item.qty || 1);
      const itemTotalBS = itemTotalUSD * rate;

      return `
        <div class="personal-item-card glass-panel ${item.checked ? 'item-checked' : ''}">
          <label class="custom-checkbox">
            <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="Personal.toggleShoppingItem('${item.id}')">
            <span class="checkmark"></span>
          </label>

          <div class="personal-item-info">
            <div class="personal-item-title-row">
              <strong class="personal-item-title">${this.escapeHTML(item.name)}</strong>
              ${item.qty > 1 ? `<span class="item-qty-tag">x${item.qty}</span>` : ''}
            </div>
            
            <div class="personal-item-meta">
              <span class="personal-cat-tag" style="background: ${cat.color}22; color: ${cat.color}; border: 1px solid ${cat.color}44;">
                ${cat.name}
              </span>
              ${item.link ? `
                <a href="${this.escapeHTML(item.link)}" target="_blank" rel="noopener" class="personal-link-btn" title="Ver enlace">
                  🔗 Link
                </a>
              ` : ''}
            </div>
          </div>

          <div class="personal-item-price-box">
            ${item.priceUSD > 0 ? `
              <div class="price-usd">$${itemTotalUSD.toFixed(2)}</div>
              <div class="price-bs">≈ ${itemTotalBS.toFixed(0)} Bs</div>
            ` : `
              <span class="price-free">Sin precio</span>
            `}
          </div>

          <div class="personal-item-actions">
            <button class="btn-icon-xs" onclick="Personal.openShoppingModal('${item.id}')" title="Editar">✏️</button>
            <button class="btn-icon-xs" onclick="Personal.deleteShoppingItem('${item.id}')" title="Eliminar">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  },

  toggleShoppingItem(id) {
    const item = this.data.shopping.find(i => i.id === id);
    if (!item) return;
    item.checked = !item.checked;
    this.save();
    this.renderShopping();
    if (item.checked) {
      AudioFX?.playSuccess();
      App?.showToast(`¡Comprado: ${item.name}! 🎉`, 'success');
    }
  },

  deleteShoppingItem(id) {
    this.data.shopping = this.data.shopping.filter(i => i.id !== id);
    this.save();
    this.renderShopping();
    App?.showToast('Artículo eliminado de tus compras', 'warning');
  },

  openShoppingModal(editId = null) {
    const dialog = document.getElementById('modal-personal-shopping');
    const titleEl = document.getElementById('personal-shop-modal-title');
    const idIn = document.getElementById('personal-shop-id');
    const nameIn = document.getElementById('personal-shop-name');
    const catSelect = document.getElementById('personal-shop-category');
    const priceIn = document.getElementById('personal-shop-price');
    const currSelect = document.getElementById('personal-shop-currency');
    const qtyIn = document.getElementById('personal-shop-qty');
    const linkIn = document.getElementById('personal-shop-link');

    if (!dialog) return;

    // Llenar categorías dinámicas
    if (catSelect) {
      catSelect.innerHTML = (this.data.categories || this.defaultCategories).map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
    }

    if (editId) {
      const item = this.data.shopping.find(i => i.id === editId);
      if (!item) return;
      if (titleEl) titleEl.textContent = '✏️ Editar Compra / Deseo';
      if (idIn) idIn.value = item.id;
      if (nameIn) nameIn.value = item.name;
      if (catSelect) catSelect.value = item.category || 'ropa';
      if (priceIn) priceIn.value = item.priceUSD || '';
      if (currSelect) currSelect.value = 'USD';
      if (qtyIn) qtyIn.value = item.qty || 1;
      if (linkIn) linkIn.value = item.link || '';
    } else {
      if (titleEl) titleEl.textContent = '🛍️ Nueva Compra / Deseo Personal';
      if (idIn) idIn.value = '';
      if (nameIn) nameIn.value = '';
      if (priceIn) priceIn.value = '';
      if (qtyIn) qtyIn.value = '1';
      if (linkIn) linkIn.value = '';
    }

    dialog.showModal();
  },

  closeShoppingModal() {
    const dialog = document.getElementById('modal-personal-shopping');
    if (dialog) {
      try { dialog.close(); } catch(e) {}
      dialog.removeAttribute('open');
    }
  },

  handleShoppingSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('personal-shop-id')?.value;
    const name = document.getElementById('personal-shop-name')?.value.trim();
    const category = document.getElementById('personal-shop-category')?.value || 'ropa';
    const rawPrice = parseFloat(document.getElementById('personal-shop-price')?.value) || 0;
    const currency = document.getElementById('personal-shop-currency')?.value || 'USD';
    const qty = parseInt(document.getElementById('personal-shop-qty')?.value, 10) || 1;
    const link = document.getElementById('personal-shop-link')?.value.trim() || '';

    if (!name) return;

    const rate = Store.state?.bcv?.rate || 761.22;
    let priceUSD = rawPrice;
    if (currency === 'BS') {
      priceUSD = rawPrice / rate;
    }
    priceUSD = Math.round(priceUSD * 100) / 100;

    if (id) {
      const item = this.data.shopping.find(i => i.id === id);
      if (item) {
        item.name = name;
        item.category = category;
        item.priceUSD = priceUSD;
        item.qty = qty;
        item.link = link;
      }
      App?.showToast('Compra actualizada ✏️', 'success');
    } else {
      this.data.shopping.unshift({
        id: 'pshop_' + Date.now(),
        name,
        category,
        priceUSD,
        qty,
        link,
        checked: false,
        createdAt: Date.now()
      });
      App?.showToast('¡Agregado a tus compras personales! 🛍️', 'success');
    }

    this.save();
    this.renderShopping();
    this.closeShoppingModal();
  },

  // Gestión de Categorías Libres
  openCategoryModal() {
    const dialog = document.getElementById('modal-personal-category');
    const nameIn = document.getElementById('new-category-name');
    if (nameIn) nameIn.value = '';
    if (dialog) dialog.showModal();
  },

  closeCategoryModal() {
    const dialog = document.getElementById('modal-personal-category');
    if (dialog) {
      try { dialog.close(); } catch(e) {}
      dialog.removeAttribute('open');
    }
  },

  handleCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('new-category-name')?.value.trim();
    const color = document.getElementById('new-category-color')?.value || '#ec4899';

    if (!name) return;

    const id = 'cat_' + Date.now();
    this.data.categories.push({ id, name, color });
    this.save();
    this.currentCategoryFilter = id;
    this.renderShopping();
    this.closeCategoryModal();
    App?.showToast(`Categoría "${name}" creada 🏷️`, 'success');
  },

  // ==========================================
  // 2. TAREAS Y PENDIENTES PERSONALES
  // ==========================================

  renderTasks() {
    const listEl = document.getElementById('personal-tasks-list');
    const countEl = document.getElementById('personal-tasks-count');
    if (!listEl) return;

    const tasks = this.data.tasks || [];
    const pending = tasks.filter(t => !t.completed);

    if (countEl) countEl.textContent = `${pending.length} pendientes`;

    if (tasks.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state glass-panel text-center" style="padding: 2rem 1rem;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">📋</span>
          <h4>No tienes tareas personales</h4>
          <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 1rem;">Crea listas de pendientes privados que solo tú puedas ver.</p>
          <button class="btn btn-primary btn-sm" onclick="Personal.openTaskModal()">
            ➕ Nueva Tarea Personal
          </button>
        </div>
      `;
      return;
    }

    listEl.innerHTML = tasks.map(task => `
      <div class="personal-item-card glass-panel ${task.completed ? 'item-checked' : ''}">
        <label class="custom-checkbox">
          <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="Personal.toggleTask('${task.id}')">
          <span class="checkmark"></span>
        </label>

        <div class="personal-item-info">
          <strong class="personal-item-title">${this.escapeHTML(task.title)}</strong>
          ${task.notes ? `<p class="personal-item-notes">${this.escapeHTML(task.notes)}</p>` : ''}
        </div>

        <div class="personal-item-actions">
          <button class="btn-icon-xs" onclick="Personal.deleteTask('${task.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>
    `).join('');
  },

  toggleTask(id) {
    const task = this.data.tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    this.save();
    this.renderTasks();
    if (task.completed) {
      AudioFX?.playSuccess();
      App?.showToast('¡Tarea personal completada! ✅', 'success');
    }
  },

  deleteTask(id) {
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    this.save();
    this.renderTasks();
    App?.showToast('Tarea eliminada', 'warning');
  },

  openTaskModal() {
    const dialog = document.getElementById('modal-personal-task');
    const titleIn = document.getElementById('personal-task-title');
    const notesIn = document.getElementById('personal-task-notes');
    if (titleIn) titleIn.value = '';
    if (notesIn) notesIn.value = '';
    if (dialog) dialog.showModal();
  },

  closeTaskModal() {
    const dialog = document.getElementById('modal-personal-task');
    if (dialog) {
      try { dialog.close(); } catch(e) {}
      dialog.removeAttribute('open');
    }
  },

  handleTaskSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('personal-task-title')?.value.trim();
    const notes = document.getElementById('personal-task-notes')?.value.trim() || '';

    if (!title) return;

    this.data.tasks.unshift({
      id: 'ptask_' + Date.now(),
      title,
      notes,
      completed: false,
      createdAt: Date.now()
    });

    this.save();
    this.renderTasks();
    this.closeTaskModal();
    App?.showToast('Tarea personal agregada 📋', 'success');
  },

  // ==========================================
  // 3. RECORDATORIOS PRIVADOS
  // ==========================================

  renderReminders() {
    const listEl = document.getElementById('personal-reminders-list');
    if (!listEl) return;

    const reminders = this.data.reminders || [];

    if (reminders.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state glass-panel text-center" style="padding: 2rem 1rem;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">⏰</span>
          <h4>No hay recordatorios privados</h4>
          <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 1rem;">Programa alarmas y fechas importantes que solo te avisarán a ti.</p>
          <button class="btn btn-primary btn-sm" onclick="Personal.openReminderModal()">
            ➕ Nuevo Recordatorio Privado
          </button>
        </div>
      `;
      return;
    }

    listEl.innerHTML = reminders.map(r => `
      <div class="personal-item-card glass-panel">
        <span style="font-size: 1.5rem;">⏰</span>
        <div class="personal-item-info">
          <strong class="personal-item-title">${this.escapeHTML(r.text)}</strong>
          <span class="note-date" style="color: var(--primary);">
            📅 ${new Date(r.time).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>
        <div class="personal-item-actions">
          <button class="btn-icon-xs" onclick="Personal.deleteReminder('${r.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>
    `).join('');
  },

  deleteReminder(id) {
    this.data.reminders = this.data.reminders.filter(r => r.id !== id);
    this.save();
    this.renderReminders();
    App?.showToast('Recordatorio eliminado', 'warning');
  },

  openReminderModal() {
    const dialog = document.getElementById('modal-personal-reminder');
    const textIn = document.getElementById('personal-reminder-text');
    const timeIn = document.getElementById('personal-reminder-time');
    if (textIn) textIn.value = '';
    if (timeIn) timeIn.value = '';
    if (dialog) dialog.showModal();
  },

  closeReminderModal() {
    const dialog = document.getElementById('modal-personal-reminder');
    if (dialog) {
      try { dialog.close(); } catch(e) {}
      dialog.removeAttribute('open');
    }
  },

  handleReminderSubmit(e) {
    e.preventDefault();
    const text = document.getElementById('personal-reminder-text')?.value.trim();
    const time = document.getElementById('personal-reminder-time')?.value;

    if (!text || !time) return;

    this.data.reminders.unshift({
      id: 'prem_' + Date.now(),
      text,
      time,
      fired: false,
      createdAt: Date.now()
    });

    this.save();
    this.renderReminders();
    this.closeReminderModal();
    App?.showToast('Recordatorio privado programado ⏰', 'success');
  },

  escapeHTML(str) {
    return str ? str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)) : '';
  }
};

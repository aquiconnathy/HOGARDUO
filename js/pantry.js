/**
 * Pantry - Inventory Stock Management & Automatic Quincenal Market Generator
 */
const Pantry = {
  currentCategory: 'all',

  init() {
    this.render();
  },

  setCategory(cat, btnEl) {
    this.currentCategory = cat;
    document.querySelectorAll('#pantry-categories .cat-tab').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    this.render();
  },

  render() {
    const container = document.getElementById('pantry-items-container');
    if (!container) return;

    let items = Store.state.pantry;
    if (this.currentCategory !== 'all') {
      items = items.filter(i => i.category === this.currentCategory);
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state glass-panel text-center" style="grid-column: 1 / -1; padding: 2rem;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🥫</span>
          <h3>No hay artículos en esta categoría</h3>
          <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.25rem;">Agrega tus víveres y provisiones habituales.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      let badgeClass = 'status-abundant';
      let badgeText = '🟢 Abundante';
      
      if (item.status === 'low') {
        badgeClass = 'status-low';
        badgeText = '🟡 Por Agotarse';
      } else if (item.status === 'out') {
        badgeClass = 'status-out';
        badgeText = '🔴 Agotado';
      }

      return `
        <div class="pantry-card">
          <div class="pantry-card-header">
            <span class="pantry-item-cat">${this.getCategoryLabel(item.category)}</span>
            <div class="pantry-card-actions">
              <button class="btn-icon-xs" onclick="Pantry.openEditModal('${item.id}')" title="Editar artículo">✏️</button>
              <button class="btn-icon-xs" onclick="Pantry.deleteItem('${item.id}')" title="Eliminar de despensa">🗑️</button>
            </div>
          </div>
          <h4 class="pantry-item-name">${this.escapeHTML(item.name)}</h4>
          <button class="status-badge-btn ${badgeClass}" onclick="Pantry.cycleStatus('${item.id}')" title="Toca para cambiar estado">
            ${badgeText}
          </button>
        </div>
      `;
    }).join('');

    // Actualizar conteo de despensa baja en el Dashboard
    const lowCount = Store.state.pantry.filter(i => i.status === 'out' || i.status === 'low').length;
    const dashLow = document.getElementById('dash-low-pantry');
    if (dashLow) dashLow.textContent = lowCount;
  },

  getCategoryLabel(cat) {
    const map = {
      viveres: '🌾 Víveres',
      proteinas: '🥩 Frescos/Carnes',
      limpieza: '🧹 Limpieza',
      higiene: '🧴 Higiene',
      snacks: '🍪 Snacks/Bebidas'
    };
    return map[cat] || '🥫 General';
  },

  // Ciclo rápido de estado: Abundante -> Por Agotarse -> Agotado
  cycleStatus(itemId) {
    const item = Store.state.pantry.find(i => i.id === itemId);
    if (!item) return;

    if (item.status === 'abundant') {
      item.status = 'low';
      App.showToast(`"${item.name}" marcado: Por agotarse 🟡`, 'warning');
    } else if (item.status === 'low') {
      item.status = 'out';
      App.showToast(`"${item.name}" marcado: Agotado 🔴`, 'danger');
    } else {
      item.status = 'abundant';
      App.showToast(`"${item.name}" marcado: Abundante 🟢`, 'success');
    }

    Store.save();
    this.render();
  },

  // Eliminar Artículo de Despensa
  deleteItem(itemId) {
    const item = Store.state.pantry.find(i => i.id === itemId);
    const name = item ? `"${item.name}"` : 'Artículo';
    Store.state.pantry = Store.state.pantry.filter(i => i.id !== itemId);
    Store.save();
    this.render();
    App.showToast(`${name} eliminado de la despensa 🗑️`, 'warning');
  },

  // Generador Mágico de Mercado Quincenal
  generateShoppingList() {
    const needed = Store.state.pantry.filter(i => i.status === 'out' || i.status === 'low');
    
    if (needed.length === 0) {
      App.showToast('¡Tu despensa está llena! No hay artículos agotados 🟢', 'success');
      return;
    }

    let addedCount = 0;
    needed.forEach(item => {
      // Verificar si ya existe en la lista de compras
      const alreadyInList = Store.state.shoppingList.some(s => s.name.toLowerCase().includes(item.name.toLowerCase()));
      if (!alreadyInList) {
        Store.state.shoppingList.push({
          id: 'shop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: item.name,
          qty: 1,
          priceUSD: 0,
          checked: false,
          origin: 'pantry'
        });
        addedCount++;
      }
    });

    Store.save();
    Shopping.render();
    App.showToast(`¡Se añadieron ${addedCount} productos agotados a la lista de mercado! 🛒`, 'success');
    App.navigateTo('shopping');
  },

  // Modal Crear Despensa
  openCreateModal() {
    const dialog = document.getElementById('modal-pantry-form');
    document.getElementById('pantry-modal-title').textContent = 'Artículo de Despensa';
    document.getElementById('pantry-edit-id').value = '';
    document.getElementById('pantry-name').value = '';
    document.getElementById('pantry-category').value = 'viveres';
    document.getElementById('pantry-status').value = 'abundant';
    if (dialog) dialog.showModal();
  },

  // Modal Editar Despensa
  openEditModal(itemId) {
    const item = Store.state.pantry.find(i => i.id === itemId);
    if (!item) return;

    const dialog = document.getElementById('modal-pantry-form');
    document.getElementById('pantry-modal-title').textContent = '✏️ Editar Artículo de Despensa';
    document.getElementById('pantry-edit-id').value = item.id;
    document.getElementById('pantry-name').value = item.name;
    document.getElementById('pantry-category').value = item.category;
    document.getElementById('pantry-status').value = item.status;
    if (dialog) dialog.showModal();
  },

  closeFormModal() {
    const dialog = document.getElementById('modal-pantry-form');
    if (dialog) dialog.close();
  },

  handleFormSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('pantry-name').value.trim();
    const category = document.getElementById('pantry-category').value;
    const status = document.getElementById('pantry-status').value;
    const editId = document.getElementById('pantry-edit-id').value;

    if (!name) return;

    if (editId) {
      const item = Store.state.pantry.find(i => i.id === editId);
      if (item) {
        item.name = name;
        item.category = category;
        item.status = status;
      }
      Store.save();
      App.showToast(`"${name}" actualizado en la despensa ✏️`, 'success');
    } else {
      Store.state.pantry.unshift({
        id: 'pantry_' + Date.now(),
        name,
        category,
        status
      });
      Store.save();
      App.showToast(`"${name}" agregado a la despensa 🥫`, 'success');
    }

    this.render();
    this.closeFormModal();
  }
};

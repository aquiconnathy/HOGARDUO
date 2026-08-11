/**
 * Shopping - Quincenal Supermarket List, Dynamic Budget, Real-Time Surplus & Dual Pricing ($/Bs)
 */
const Shopping = {
  currentInputCurrency: 'USD',
  hasAlertedSurplus: false,

  init() {
    this.render();
  },

  render() {
    const container = document.getElementById('shopping-items-container');
    if (!container) return;

    const rate = Store.state.bcv.rate || 68.50;
    const budgetUSD = Store.state.budget.usd || 0;
    const budgetBs = budgetUSD * rate;

    // Actualizar input y equivalente de presupuesto
    const budgetInput = document.getElementById('budget-usd-input');
    const budgetBsEq = document.getElementById('budget-bs-equivalent');
    if (budgetInput && document.activeElement !== budgetInput) {
      budgetInput.value = budgetUSD.toFixed(2);
    }
    if (budgetBsEq) {
      budgetBsEq.textContent = `≈ ${budgetBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;
    }

    // Calcular Totales de la Lista
    let totalSpentUSD = 0;
    Store.state.shoppingList.forEach(item => {
      totalSpentUSD += (item.priceUSD || 0) * (item.qty || 1);
    });

    const totalSpentBs = totalSpentUSD * rate;
    const remainingUSD = budgetUSD - totalSpentUSD;
    const remainingBs = remainingUSD * rate;

    // Actualizar Textos de Métricas
    const totalSpentUsdEl = document.getElementById('total-spent-usd');
    const totalSpentBsEl = document.getElementById('total-spent-bs');
    const remainingUsdEl = document.getElementById('remaining-usd');
    const remainingBsEl = document.getElementById('remaining-bs');
    const remainingLabelEl = document.getElementById('remaining-label');
    const surplusBox = document.getElementById('surplus-metric-box');
    const surplusUsdEl = document.getElementById('surplus-usd');
    const surplusBsEl = document.getElementById('surplus-bs');
    const progressBar = document.getElementById('budget-progress-bar');

    if (totalSpentUsdEl) totalSpentUsdEl.textContent = `$${totalSpentUSD.toFixed(2)}`;
    if (totalSpentBsEl) totalSpentBsEl.textContent = `${totalSpentBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;

    // Manejo de la Barra de Progreso y Alerta de Excedente
    let percentage = budgetUSD > 0 ? (totalSpentUSD / budgetUSD) * 100 : 0;
    if (progressBar) {
      progressBar.style.width = `${Math.min(percentage, 100)}%`;
      progressBar.classList.remove('warning', 'exceeded');
    }

    if (totalSpentUSD > budgetUSD && budgetUSD > 0) {
      // MODO EXCEDENTE / SOBREPRESUPUESTO
      const surplusUSD = totalSpentUSD - budgetUSD;
      const surplusBs = surplusUSD * rate;

      if (progressBar) progressBar.classList.add('exceeded');
      if (surplusBox) surplusBox.classList.remove('hidden');
      if (surplusUsdEl) surplusUsdEl.textContent = `+$${surplusUSD.toFixed(2)} USD`;
      if (surplusBsEl) surplusBsEl.textContent = `+${surplusBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;

      if (remainingLabelEl) remainingLabelEl.textContent = 'Estado del Presupuesto';
      if (remainingUsdEl) {
        remainingUsdEl.textContent = '¡Superado!';
        remainingUsdEl.className = 'metric-val text-danger';
      }
      if (remainingBsEl) remainingBsEl.textContent = 'Revisar excedente arriba';

      if (!this.hasAlertedSurplus) {
        AudioFX.playSurplusAlert();
        this.hasAlertedSurplus = true;
      }
    } else {
      // DENTRO DEL PRESUPUESTO
      this.hasAlertedSurplus = false;
      if (surplusBox) surplusBox.classList.add('hidden');
      
      if (percentage >= 80 && progressBar) {
        progressBar.classList.add('warning');
      }

      if (remainingLabelEl) remainingLabelEl.textContent = 'Restante Disponible';
      if (remainingUsdEl) {
        remainingUsdEl.textContent = `$${remainingUSD.toFixed(2)}`;
        remainingUsdEl.className = 'metric-val text-success';
      }
      if (remainingBsEl) {
        remainingBsEl.textContent = `${remainingBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;
      }
    }

    // Renderizar Lista de Productos
    const countBadge = document.getElementById('shopping-count-badge');
    const dashShopping = document.getElementById('dash-shopping-items');
    const navBadge = document.getElementById('nav-shopping-badge');
    const uncheckCount = Store.state.shoppingList.filter(i => !i.checked).length;

    if (countBadge) countBadge.textContent = `${Store.state.shoppingList.length} productos en lista (${uncheckCount} por comprar)`;
    if (dashShopping) dashShopping.textContent = uncheckCount;
    if (navBadge) {
      navBadge.textContent = uncheckCount;
      navBadge.classList.toggle('hidden', uncheckCount === 0);
    }

    if (Store.state.shoppingList.length === 0) {
      container.innerHTML = `
        <div class="empty-state glass-panel text-center" style="padding: 2rem;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🛒</span>
          <h3>Tu lista de mercado está vacía</h3>
          <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.25rem;">Agrega productos o genera la lista desde la Despensa con un clic.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = Store.state.shoppingList.map(item => {
      const itemTotalUSD = (item.priceUSD || 0) * (item.qty || 1);
      const itemTotalBs = itemTotalUSD * rate;

      return `
        <div class="shop-item-row ${item.checked ? 'checked' : ''}" id="shop-row-${item.id}">
          <div class="shop-item-left">
            <input type="checkbox" class="shop-checkbox" ${item.checked ? 'checked' : ''} onchange="Shopping.toggleItemCheck('${item.id}')" title="Marcar como comprado">
            <div>
              <span class="shop-item-name">${item.name}</span>
              <span class="shop-item-qty">Cant: ${item.qty} ${item.priceUSD ? `($${item.priceUSD.toFixed(2)} c/u)` : ''}</span>
            </div>
          </div>

          <div class="shop-item-prices">
            <span class="shop-price-usd">$${itemTotalUSD.toFixed(2)}</span>
            <span class="shop-price-bs">${itemTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
          </div>
          
          <div style="display: flex; gap: 0.25rem; margin-left: 0.5rem;">
            <button class="btn-icon-xs" onclick="Shopping.openEditModal('${item.id}')" title="Editar producto">✏️</button>
            <button class="btn-icon-xs" onclick="Shopping.deleteItem('${item.id}')" title="Eliminar producto">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  },

  updateBudgetFromUSD(val) {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      Store.state.budget.usd = num;
      Store.save();
      this.render();
      App.showToast(`Presupuesto actualizado a $${num.toFixed(2)}`, 'success');
    }
  },

  openBudgetConfig() {
    const current = Store.state.budget.usd;
    const input = document.getElementById('budget-usd-input');
    if (input) {
      input.focus();
      input.select();
    }
  },

  toggleItemCheck(id) {
    const item = Store.state.shoppingList.find(i => i.id === id);
    if (!item) return;

    item.checked = !item.checked;
    if (item.checked) {
      AudioFX.playSuccess();
    }
    Store.save();
    this.render();
  },

  deleteItem(id) {
    Store.state.shoppingList = Store.state.shoppingList.filter(i => i.id !== id);
    Store.save();
    this.render();
    App.showToast('Producto eliminado de la lista', 'warning');
  },

  clearChecked() {
    Store.state.shoppingList = Store.state.shoppingList.filter(i => !i.checked);
    Store.save();
    this.render();
    App.showToast('Se limpiaron los productos ya comprados 🧹', 'success');
  },

  // Modal Crear Producto
  openCreateModal() {
    const dialog = document.getElementById('modal-shopping-form');
    document.getElementById('shopping-modal-title').textContent = 'Producto de Mercado';
    document.getElementById('shopping-edit-id').value = '';
    document.getElementById('shop-item-name').value = '';
    document.getElementById('shop-item-qty').value = '1';
    document.getElementById('shop-item-price').value = '';
    document.getElementById('shop-item-currency').value = 'USD';
    this.togglePriceCurrency('USD');

    if (dialog) dialog.showModal();
  },

  // Modal Editar Producto
  openEditModal(itemId) {
    const item = Store.state.shoppingList.find(i => i.id === itemId);
    if (!item) return;

    const dialog = document.getElementById('modal-shopping-form');
    document.getElementById('shopping-modal-title').textContent = '✏️ Editar Producto de Mercado';
    document.getElementById('shopping-edit-id').value = item.id;
    document.getElementById('shop-item-name').value = item.name;
    document.getElementById('shop-item-qty').value = item.qty || 1;
    document.getElementById('shop-item-currency').value = 'USD';
    this.togglePriceCurrency('USD');
    document.getElementById('shop-item-price').value = (item.priceUSD || 0).toFixed(2);

    const helper = document.getElementById('shop-price-conversion');
    if (helper) helper.textContent = `≈ ${((item.priceUSD || 0) * Store.state.bcv.rate).toFixed(2)} Bs`;

    if (dialog) dialog.showModal();
  },

  closeFormModal() {
    const dialog = document.getElementById('modal-shopping-form');
    if (dialog) dialog.close();
  },

  togglePriceCurrency(currency) {
    this.currentInputCurrency = currency;
    const label = document.getElementById('shop-price-label');
    const helper = document.getElementById('shop-price-conversion');
    const priceInput = document.getElementById('shop-item-price');

    if (currency === 'USD') {
      if (label) label.textContent = 'Precio Unitario ($ USD)';
      if (priceInput) {
        priceInput.placeholder = '0.00';
        priceInput.oninput = () => {
          const v = parseFloat(priceInput.value) || 0;
          const bs = v * Store.state.bcv.rate;
          if (helper) helper.textContent = `≈ ${bs.toFixed(2)} Bs`;
        };
      }
    } else {
      if (label) label.textContent = 'Precio Unitario (Bs Bolívares)';
      if (priceInput) {
        priceInput.placeholder = '0.00';
        priceInput.oninput = () => {
          const v = parseFloat(priceInput.value) || 0;
          const usd = v / Store.state.bcv.rate;
          if (helper) helper.textContent = `≈ $${usd.toFixed(2)} USD`;
        };
      }
    }
  },

  handleFormSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('shop-item-name').value.trim();
    const qty = parseInt(document.getElementById('shop-item-qty').value, 10) || 1;
    const rawPrice = parseFloat(document.getElementById('shop-item-price').value) || 0;
    const currency = document.getElementById('shop-item-currency').value;
    const editId = document.getElementById('shopping-edit-id')?.value;

    if (!name) return;

    // Convertir a USD como moneda base
    let priceUSD = rawPrice;
    if (currency === 'BS') {
      priceUSD = rawPrice / (Store.state.bcv.rate || 68.50);
    }
    priceUSD = Math.round(priceUSD * 100) / 100;

    if (editId) {
      const item = Store.state.shoppingList.find(i => i.id === editId);
      if (item) {
        item.name = name;
        item.qty = qty;
        item.priceUSD = priceUSD;
      }
      Store.save();
      App.showToast(`"${name}" actualizado en el mercado ✏️`, 'success');
    } else {
      Store.state.shoppingList.unshift({
        id: 'shop_' + Date.now(),
        name,
        qty,
        priceUSD,
        checked: false,
        origin: 'manual'
      });
      Store.save();
      App.showToast(`"${name}" agregado al mercado 🛒`, 'success');
    }

    this.render();
    this.closeFormModal();
  }
};

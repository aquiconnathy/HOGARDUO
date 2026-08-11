/**
 * BCV - Exchange Rate (Oficial BCV & Paralelo), Live Dual API, Bidirectional Converter & Calculator
 */
const BCV = {
  currentCalc: '0',
  calcHistory: '',
  activeSource: 'oficial', // 'oficial' o 'paralelo'

  init() {
    this.renderRates();
    this.fetchLiveRate(false);
  },

  switchRateSource(source) {
    this.activeSource = source;
    
    const tabOficial = document.getElementById('bcv-tab-oficial');
    const tabParalelo = document.getElementById('bcv-tab-paralelo');

    if (tabOficial) tabOficial.classList.toggle('active', source === 'oficial');
    if (tabParalelo) tabParalelo.classList.toggle('active', source === 'paralelo');

    this.fetchLiveRate(true);
  },

  async fetchLiveRate(manualTrigger = false) {
    const btn = document.getElementById('btn-fetch-bcv');
    const quickBtn = document.getElementById('quick-refresh-bcv');
    
    if (btn) btn.classList.add('loading');
    if (quickBtn) quickBtn.style.transform = 'rotate(180deg)';

    const endpoint = this.activeSource === 'paralelo' 
      ? 'https://ve.dolarapi.com/v1/dolares/paralelo'
      : 'https://ve.dolarapi.com/v1/dolares/oficial';

    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('API offline');
      const data = await response.json();

      if (data && data.promedio) {
        Store.state.bcv.rate = parseFloat(data.promedio);
        Store.state.bcv.lastUpdated = data.fechaActualizacion || new Date().toISOString();
        Store.state.bcv.source = this.activeSource === 'paralelo' ? 'Paralelo (DolarApi)' : 'Oficial BCV (DolarApi)';
        Store.save();
        
        this.renderRates();
        if (manualTrigger && typeof App !== 'undefined') {
          const label = this.activeSource === 'paralelo' ? 'Paralelo' : 'BCV Oficial';
          App.showToast(`Tasa ${label}: ${Store.state.bcv.rate.toFixed(2)} Bs/$ 🇻🇪`, 'success');
        }
      }
    } catch (err) {
      console.warn('Could not fetch live rate, using cached value:', err);
      if (manualTrigger && typeof App !== 'undefined') {
        App.showToast('No se pudo conectar a la API. Usando tasa guardada.', 'warning');
      }
    } finally {
      if (btn) btn.classList.remove('loading');
      if (quickBtn) quickBtn.style.transform = 'none';
      this.renderRates();
    }
  },

  renderRates() {
    const rate = Store.state.bcv.rate || 757.54;
    const formatted = rate.toFixed(2);

    // Quick Badge
    const quickEl = document.getElementById('quick-bcv-rate');
    if (quickEl) quickEl.textContent = `${formatted} Bs`;

    // Dashboard
    const dashEl = document.getElementById('dash-bcv-rate');
    if (dashEl) dashEl.textContent = formatted;

    // BCV Tab Hero
    const heroEl = document.getElementById('bcv-display-rate');
    if (heroEl) heroEl.textContent = formatted;

    // Timestamp
    const tsEl = document.getElementById('bcv-timestamp');
    if (tsEl) {
      const last = Store.state.bcv.lastUpdated ? new Date(Store.state.bcv.lastUpdated).toLocaleString('es-VE') : 'Reciente';
      const sourceName = Store.state.bcv.source || 'Tasa Oficial';
      tsEl.textContent = `Última actualización: ${last} (${sourceName})`;
    }

    // Manual input placeholder
    const manualInput = document.getElementById('manual-rate-input');
    if (manualInput) manualInput.placeholder = formatted;

    // Update converter if inputs have values
    const usdInput = document.getElementById('conv-usd-input');
    if (usdInput && usdInput.value) {
      this.convertUSDToBs(usdInput.value);
    }
  },

  setManualRate() {
    const input = document.getElementById('manual-rate-input');
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
      Store.state.bcv.rate = val;
      Store.state.bcv.lastUpdated = new Date().toISOString();
      Store.state.bcv.source = 'Ajuste Manual Personalizado';
      Store.save();
      this.renderRates();
      input.value = '';
      if (typeof App !== 'undefined') {
        App.showToast(`Tasa manual guardada: ${val.toFixed(2)} Bs/$`, 'success');
      }
    } else if (typeof App !== 'undefined') {
      App.showToast('Ingresa un valor numérico válido', 'warning');
    }
  },

  // Conversor Bidireccional
  convertUSDToBs(usd) {
    const bsInput = document.getElementById('conv-bs-input');
    const rate = Store.state.bcv.rate || 757.54;
    const val = parseFloat(usd);

    if (isNaN(val) || val <= 0) {
      if (bsInput && document.activeElement !== bsInput) bsInput.value = '';
      return;
    }

    if (bsInput && document.activeElement !== bsInput) {
      bsInput.value = (val * rate).toFixed(2);
    }
  },

  convertBsToUSD(bs) {
    const usdInput = document.getElementById('conv-usd-input');
    const rate = Store.state.bcv.rate || 757.54;
    const val = parseFloat(bs);

    if (isNaN(val) || val <= 0) {
      if (usdInput && document.activeElement !== usdInput) usdInput.value = '';
      return;
    }

    if (usdInput && document.activeElement !== usdInput) {
      usdInput.value = (val / rate).toFixed(2);
    }
  },

  // Calculadora de Pasillo
  appendCalc(char) {
    if (this.currentCalc === '0' && char !== '.') {
      this.currentCalc = char;
    } else {
      this.currentCalc += char;
    }
    this.updateCalcDisplay();
  },

  clearCalc() {
    this.currentCalc = '0';
    this.calcHistory = '';
    this.updateCalcDisplay();
  },

  deleteCalcLast() {
    if (this.currentCalc.length > 1) {
      this.currentCalc = this.currentCalc.slice(0, -1);
    } else {
      this.currentCalc = '0';
    }
    this.updateCalcDisplay();
  },

  evaluateCalc() {
    try {
      const sanitized = this.currentCalc.replace(/×/g, '*').replace(/÷/g, '/');
      const result = Function(`'use strict'; return (${sanitized})`)();
      this.calcHistory = this.currentCalc + ' =';
      this.currentCalc = String(Math.round(result * 100) / 100);
      this.updateCalcDisplay();
      if (typeof AudioFX !== 'undefined') AudioFX.playSuccess();
    } catch (e) {
      this.currentCalc = 'Error';
      this.updateCalcDisplay();
    }
  },

  updateCalcDisplay() {
    const screen = document.getElementById('calc-display');
    const hist = document.getElementById('calc-history');
    const eq = document.getElementById('calc-equivalent-bs');
    const rate = Store.state.bcv.rate || 757.54;

    if (screen) screen.textContent = this.currentCalc;
    if (hist) hist.textContent = this.calcHistory;

    const num = parseFloat(this.currentCalc);
    if (eq) {
      if (!isNaN(num) && num > 0) {
        eq.textContent = `≈ ${(num * rate).toFixed(2)} Bs`;
      } else {
        eq.textContent = '≈ 0.00 Bs';
      }
    }
  }
};

/**
 * BCV - Exchange Rate, Live API, Bidirectional Converter & Supermarket Calculator
 */
const BCV = {
  currentCalc: '0',
  calcHistory: '',

  init() {
    this.renderRates();
    this.fetchLiveRate(false);
  },

  async fetchLiveRate(manualTrigger = false) {
    const btn = document.getElementById('btn-fetch-bcv');
    const quickBtn = document.getElementById('quick-refresh-bcv');
    
    if (btn) btn.classList.add('loading');
    if (quickBtn) quickBtn.style.transform = 'rotate(180deg)';

    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (!response.ok) throw new Error('API offline');
      const data = await response.json();

      if (data && data.promedio) {
        Store.state.bcv.rate = parseFloat(data.promedio);
        Store.state.bcv.lastUpdated = data.fechaActualizacion || new Date().toISOString();
        Store.state.bcv.source = 'Oficial BCV (DolarApi)';
        Store.save();
        
        this.renderRates();
        if (manualTrigger) {
          App.showToast(`Tasa BCV actualizada: ${Store.state.bcv.rate.toFixed(2)} Bs/$ 🇻🇪`, 'success');
        }
      }
    } catch (err) {
      console.warn('Could not fetch live BCV rate, using cached value:', err);
      if (manualTrigger) {
        App.showToast('No se pudo conectar a la API. Usando tasa guardada.', 'warning');
      }
    } finally {
      if (btn) btn.classList.remove('loading');
      if (quickBtn) quickBtn.style.transform = 'none';
      this.renderRates();
    }
  },

  renderRates() {
    const rate = Store.state.bcv.rate || 68.50;
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
      tsEl.textContent = `Última actualización: ${last} (Tasa Oficial)`;
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
      Store.state.bcv.source = 'Ajuste Manual';
      Store.save();
      this.renderRates();
      input.value = '';
      App.showToast(`Tasa manual guardada: ${val.toFixed(2)} Bs/$`, 'success');
    } else {
      App.showToast('Ingresa un valor numérico válido', 'warning');
    }
  },

  // Conversor Bidireccional
  convertUSDToBs(usd) {
    const bsInput = document.getElementById('conv-bs-input');
    if (!usd || isNaN(usd)) {
      if (bsInput) bsInput.value = '';
      return;
    }
    const rate = Store.state.bcv.rate;
    const result = parseFloat(usd) * rate;
    if (bsInput) bsInput.value = result.toFixed(2);
  },

  convertBsToUSD(bs) {
    const usdInput = document.getElementById('conv-usd-input');
    if (!bs || isNaN(bs)) {
      if (usdInput) usdInput.value = '';
      return;
    }
    const rate = Store.state.bcv.rate;
    const result = parseFloat(bs) / rate;
    if (usdInput) usdInput.value = result.toFixed(2);
  },

  // Calculadora de Pasillo para Supermercado
  calcInput(char) {
    const screen = document.getElementById('calc-screen');
    const history = document.getElementById('calc-history');
    const eq = document.getElementById('calc-screen-bs');

    if (char === 'C') {
      this.currentCalc = '0';
      this.calcHistory = '';
    } else if (char === 'DEL') {
      this.currentCalc = this.currentCalc.length > 1 ? this.currentCalc.slice(0, -1) : '0';
    } else if (char === '=') {
      try {
        // Safe math evaluation with sanitized characters
        const safeExpr = this.currentCalc.replace(/[^0-9+\-*/.%]/g, '');
        const evalResult = Function(`'use strict'; return (${safeExpr})`)();
        this.calcHistory = this.currentCalc + ' =';
        this.currentCalc = String(Math.round(evalResult * 100) / 100);
      } catch (e) {
        this.currentCalc = 'Error';
      }
    } else {
      if (this.currentCalc === '0' && !['+', '-', '*', '/', '.'].includes(char)) {
        this.currentCalc = char;
      } else {
        this.currentCalc += char;
      }
    }

    if (screen) screen.textContent = this.currentCalc;
    if (history) history.textContent = this.calcHistory;

    // Calcular equivalente en Bs si es un número válido
    const numVal = parseFloat(this.currentCalc);
    if (!isNaN(numVal) && eq) {
      const bsEquiv = numVal * Store.state.bcv.rate;
      eq.textContent = `≈ ${bsEquiv.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`;
    }
  }
};

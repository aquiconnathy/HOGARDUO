/**
 * BCV - Multi-Source Real-Time Exchange Rate Engine (Oficial BCV & Paralelo)
 * Primary: DolarVZLA Direct CDN (Official BCV updated daily at 5:00 PM)
 * Supports permanent Custom Manual Rate persistence across refreshes.
 */
const BCV = {
  currentCalc: '0',
  calcHistory: '',
  activeSource: 'oficial', // 'oficial' o 'paralelo'

  init() {
    this.renderRates();
    // Solo auto-consultar si el usuario no tiene un ajuste manual fijado
    if (!Store.state.bcv || !Store.state.bcv.isManual) {
      this.fetchLiveRate(false);
    }
  },

  switchRateSource(source) {
    this.activeSource = source;
    if (Store.state.bcv) {
      Store.state.bcv.isManual = false;
    }
    
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

    let rateObtained = null;
    let rateDate = null;
    let sourceName = '';

    if (this.activeSource === 'paralelo') {
      try {
        const res = await fetch('https://ve.dolarapi.com/v1/dolares/paralelo');
        if (res.ok) {
          const data = await res.json();
          if (data && data.promedio) {
            rateObtained = parseFloat(data.promedio);
            rateDate = data.fechaActualizacion || new Date().toISOString();
            sourceName = 'Paralelo (EnParaleloVzla)';
          }
        }
      } catch (e) {}
    } else {
      // 1. Intentar Fuente Primaria Oficial Directa (DolarVZLA CDN)
      try {
        const res = await fetch('https://rates.dolarvzla.com/bcv/current.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.current && data.current.usd) {
            rateObtained = parseFloat(data.current.usd);
            rateDate = data.current.date || new Date().toISOString();
            sourceName = 'Oficial BCV (Banco Central)';
          }
        }
      } catch (e) {
        console.warn('DolarVZLA primary failed, trying fallback...');
      }

      // 2. Si falla la primaria, intentar fallback de DolarApi
      if (!rateObtained) {
        try {
          const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
          if (res.ok) {
            const data = await res.json();
            if (data && data.promedio) {
              rateObtained = parseFloat(data.promedio);
              rateDate = data.fechaActualizacion || new Date().toISOString();
              sourceName = 'Oficial BCV (Respaldo)';
            }
          }
        } catch (e) {}
      }
    }

    if (rateObtained && !isNaN(rateObtained)) {
      Store.state.bcv.rate = rateObtained;
      Store.state.bcv.isManual = false;
      Store.state.bcv.lastUpdated = rateDate || new Date().toISOString();
      Store.state.bcv.source = sourceName;
      Store.save();

      // Sincronizar tasa con la pareja en Firebase
      if (typeof CloudSync !== 'undefined' && CloudSync.broadcastChange) {
        CloudSync.broadcastChange('RATE_UPDATED', Store.state);
      }
      
      this.renderRates();
      if (manualTrigger && typeof App !== 'undefined') {
        App.showToast(`✅ Tasa actualizada: ${rateObtained.toFixed(2)} Bs/$ (${sourceName})`, 'success');
      }
    } else {
      if (manualTrigger && typeof App !== 'undefined') {
        App.showToast('No se pudo conectar a los servidores de tasa. Usando valor guardado.', 'warning');
      }
    }

    if (btn) btn.classList.remove('loading');
    if (quickBtn) quickBtn.style.transform = 'none';
    this.renderRates();
  },

  renderRates() {
    const rate = Store.state.bcv.rate || 761.22;
    const formatted = rate.toFixed(2);

    // Quick Badge en Header
    const quickEl = document.getElementById('quick-bcv-rate');
    if (quickEl) quickEl.textContent = `${formatted} Bs`;

    // Dashboard Stat Card
    const dashEl = document.getElementById('dash-bcv-rate');
    if (dashEl) dashEl.textContent = formatted;

    // Hero en Vista BCV
    const heroEl = document.getElementById('bcv-display-rate');
    if (heroEl) heroEl.textContent = formatted;

    // Timestamp & Fuente
    const tsEl = document.getElementById('bcv-timestamp');
    if (tsEl) {
      const last = Store.state.bcv.lastUpdated ? new Date(Store.state.bcv.lastUpdated).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Hoy';
      const sourceName = Store.state.bcv.source || (Store.state.bcv.isManual ? 'Ajuste Manual' : 'Oficial BCV');
      tsEl.textContent = `Fecha: ${last} — Fuente: ${sourceName}`;
    }

    // Manual input placeholder
    const manualInput = document.getElementById('manual-rate-input');
    if (manualInput) manualInput.placeholder = formatted;

    // Conversor dinámico
    const usdInput = document.getElementById('conv-usd-input');
    if (usdInput && usdInput.value) {
      this.convertUSDToBs(usdInput.value);
    }
  },

  // Guardar tasa manual personalizada permanentemente
  setManualRate() {
    const input = document.getElementById('manual-rate-input');
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
      Store.state.bcv.rate = val;
      Store.state.bcv.isManual = true; // Fijar para que el refresh NO la sobreescriba
      Store.state.bcv.lastUpdated = new Date().toISOString();
      Store.state.bcv.source = 'Ajuste Manual Personalizado';
      Store.save();

      // Sincronizar a la pareja
      if (typeof CloudSync !== 'undefined' && CloudSync.broadcastChange) {
        CloudSync.broadcastChange('RATE_UPDATED', Store.state);
      }

      this.renderRates();
      input.value = '';
      if (typeof App !== 'undefined') {
        App.showToast(`🔒 Tasa manual fijada permanentemente: ${val.toFixed(2)} Bs/$`, 'success');
      }
    } else if (typeof App !== 'undefined') {
      App.showToast('Ingresa un valor numérico válido', 'warning');
    }
  },

  // Conversor Bidireccional
  convertUSDToBs(usd) {
    const bsInput = document.getElementById('conv-bs-input');
    const rate = Store.state.bcv.rate || 761.22;
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
    const rate = Store.state.bcv.rate || 761.22;
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
    const rate = Store.state.bcv.rate || 761.22;

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

# HogarDúo 💑 - App Web Híbrida para Parejas y Organización del Hogar

App web híbrida, rápida, hermosa y **100% offline-first**, construida bajo la filosofía **Ponytail** (cero dependencias pesadas, máximo aprovechamiento de APIs nativas de HTML5/CSS/JavaScript).

---

## 🌟 Características Principales

1. **👥 Perfiles Dúo Personalizables**:
   * Personalización de nombres, apodos y avatares/emojis para ambos.
   * Visualización clara de a quién corresponde cada turno.

2. **🎲 Tareas del Hogar con Canvas & Dado Aleatorio 3D**:
   * **Canvas Visual**: Organización por persona (Ella / Él / Ambos / Por sortear).
   * **Botón Intercambiar ("Swap")**: Transfiere o intercambia tareas con un solo toque.
   * **Dado 3D Interactivo**: Sorteo imparcial y justo de tareas con animación 3D y efectos de sonido.
   * **Celebración con Confeti**: Animación nativa en Canvas al completar tareas.

3. **🥫 Despensa Inteligente & Generador de Mercado**:
   * Control de stock con 3 estados: `🟢 Abundante`, `🟡 Por Agotarse` y `🔴 Agotado`.
   * **Botón "⚡ Pasar a Mercado"**: Analiza todo lo agotado o por agotarse en la despensa y lo traspasa automáticamente a la lista de compras quincenales sin duplicados.

4. **🛒 Mercado Quincenal con Presupuesto Dinámico y Detector de Excedentes**:
   * Configura tu presupuesto en dólares ($) o su equivalente en bolívares (Bs).
   * Descuento en tiempo real al ingresar productos y precios.
   * **Alerta de Excedente / Sobrepresupuesto**: Si superas el presupuesto fijado, se despliega una tarjeta de alerta con la **diferencia exacta en $ y Bs** para evaluar si permitirse el gasto adicional.
   * Precios duales automáticos ($ y Bs) para cada artículo y para el total.
   * Modo checklist en tienda para marcar lo que vas subiendo al carrito físico.

5. **🇻🇪 Tasa Oficial BCV en Tiempo Real y Calculadora de Pasillo**:
   * Consulta automática en tiempo real de la tasa oficial del Banco Central de Venezuela (`dolarapi.com`).
   * Fallback offline y opción de ajuste manual si estás sin cobertura dentro del supermercado.
   * Conversor instantáneo bidireccional ($ ⇄ Bs).
   * Calculadora rápida incorporada para sumas, descuentos o cálculos por unidad/kilo.

6. **🔒 100% Privada y Sin Servidores de Pago**:
   * Tus datos se guardan de forma local en tu propio dispositivo (`localStorage` / `IndexedDB`).
   * Exportación e importación de copias de seguridad en formato JSON con 1 clic.
   * Instalable como PWA en teléfonos Android, iPhone y PC.

---

## 🚀 Cómo usarla

1. Abre directamente el archivo [index.html](file:///c:/Users/Usuario/Documents/PERSONAL%20PROYECTS/hogarduo/index.html) en tu navegador preferido (Chrome, Edge, Safari, Firefox).
2. O bien sírvela con cualquier servidor local simple (ej. `npx serve .` o Live Server).
3. En tu teléfono, presiona el menú de opciones del navegador y selecciona **"Añadir a la pantalla de inicio"** o **"Instalar aplicación"** para usarla a pantalla completa como una app nativa.

/**
 * Tasks - Task Canvas, Easy Swap, and 3D Random Dice Fair Distribution
 */
const Tasks = {
  currentFilter: 'all',
  selectedTaskForDice: null,
  isRolling: false,

  init() {
    this.render();
  },

  setFilter(filter, btnEl) {
    this.currentFilter = filter;
    document.querySelectorAll('.filter-pill-bar .pill-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    this.render();
  },

  render() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    const p1 = Store.state.profiles?.p1 || { name: 'Ella', avatar: '👩' };
    const p2 = Store.state.profiles?.p2 || { name: 'Él', avatar: '👨' };

    // Actualizar botones de filtro con los nombres
    const f1 = document.getElementById('filter-p1-btn');
    const f2 = document.getElementById('filter-p2-btn');
    if (f1) f1.textContent = `${p1.avatar} ${p1.name}`;
    if (f2) f2.textContent = `${p2.avatar} ${p2.name}`;

    let filtered = Store.state.tasks || [];
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(t => t.assignee === this.currentFilter);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state glass-panel text-center" style="padding: 2rem;">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🎉</span>
          <h3>¡No hay tareas pendientes aquí!</h3>
          <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.25rem;">Todo está al día o puedes crear una nueva con el botón de arriba.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(task => {
      let badgeHtml = '';
      if (task.assignee === 'p1') {
        badgeHtml = `<span class="badge-assignee badge-p1">${p1.avatar} ${p1.name}</span>`;
      } else if (task.assignee === 'p2') {
        badgeHtml = `<span class="badge-assignee badge-p2">${p2.avatar} ${p2.name}</span>`;
      } else if (task.assignee === 'both') {
        badgeHtml = `<span class="badge-assignee badge-both">🤝 Ambos</span>`;
      } else {
        badgeHtml = `<span class="badge-assignee badge-unassigned">🎲 Por Sortear</span>`;
      }

      return `
        <div class="task-card assignee-${task.assignee} ${task.completed ? 'completed' : ''}" id="task-card-${task.id}">
          <div class="task-info-col">
            <div class="task-badge-row">
              ${badgeHtml}
              <span class="task-frequency-tag">${task.frequency}</span>
            </div>
            <span class="task-main-title">${this.escapeHTML(task.title)}</span>
          </div>

          <div class="task-actions-col">
            <button class="btn-swap" onclick="Tasks.swapAssignee('${task.id}')" title="Intercambiar responsable">
              <span>🔄</span> Intercambiar
            </button>
            <button class="btn-icon-xs" onclick="Tasks.openRollDiceModal('${task.id}')" title="Sortear esta tarea con el dado">
              🎲
            </button>
            <button class="btn-check-task" onclick="Tasks.toggleComplete('${task.id}')" title="Completar tarea">
              ✓
            </button>
            <button class="btn-icon-xs" onclick="Tasks.openEditModal('${task.id}')" title="Editar tarea">
              ✏️
            </button>
            <button class="btn-icon-xs" onclick="Tasks.deleteTask('${task.id}')" title="Eliminar tarea">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Actualizar badge en la navegación inferior
    const pendingCount = (Store.state.tasks || []).filter(t => !t.completed).length;
    const navBadge = document.getElementById('nav-tasks-badge');
    const dashPending = document.getElementById('dash-pending-tasks');
    if (navBadge) {
      navBadge.textContent = pendingCount;
      navBadge.classList.toggle('hidden', pendingCount === 0);
    }
    if (dashPending) dashPending.textContent = pendingCount;
  },

  escapeHTML(str) {
    return str ? str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)) : '';
  },

  // Intercambio Fácil de Tareas ("Canvas Swap")
  swapAssignee(taskId) {
    const task = (Store.state.tasks || []).find(t => t.id === taskId);
    if (!task) return;

    const p1 = Store.state.profiles?.p1 || { name: 'Ella' };
    const p2 = Store.state.profiles?.p2 || { name: 'Él' };

    if (task.assignee === 'p1') {
      task.assignee = 'p2';
      App.showToast(`Tarea transferida a ${p2.name} 👨`, 'success');
    } else if (task.assignee === 'p2') {
      task.assignee = 'p1';
      App.showToast(`Tarea transferida a ${p1.name} 👩`, 'success');
    } else if (task.assignee === 'unassigned') {
      task.assignee = 'p1';
      App.showToast(`Tarea asignada a ${p1.name}`, 'success');
    } else {
      task.assignee = 'p1';
      App.showToast(`Turno individual asignado a ${p1.name}`, 'success');
    }

    Store.save();
    this.render();
  },

  // Marcar Tarea Completa con Celebración
  toggleComplete(taskId) {
    const task = (Store.state.tasks || []).find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    if (task.completed) {
      AudioFX.playSuccess();
      App.triggerConfetti();
      App.showToast('¡Tarea completada con éxito! 🎉', 'success');
    }
    Store.save();
    this.render();
  },

  // Eliminar Tarea
  deleteTask(taskId) {
    const task = (Store.state.tasks || []).find(t => t.id === taskId);
    const title = task ? `"${task.title}"` : 'Tarea';
    Store.state.tasks = (Store.state.tasks || []).filter(t => t.id !== taskId);
    Store.save();
    this.render();
    App.showToast(`${title} eliminada 🗑️`, 'warning');
  },

  // Modal Crear Tarea
  openCreateModal() {
    const dialog = document.getElementById('modal-task-form');
    const p1 = Store.state.profiles?.p1 || { name: 'Ella', avatar: '👩' };
    const p2 = Store.state.profiles?.p2 || { name: 'Él', avatar: '👨' };

    const titleEl = document.getElementById('task-modal-title');
    const opt1 = document.getElementById('opt-p1');
    const opt2 = document.getElementById('opt-p2');
    const editId = document.getElementById('task-edit-id');
    const titleIn = document.getElementById('task-title');

    if (titleEl) titleEl.textContent = 'Nueva Tarea del Hogar';
    if (opt1) opt1.textContent = `${p1.avatar} ${p1.name}`;
    if (opt2) opt2.textContent = `${p2.avatar} ${p2.name}`;
    if (editId) editId.value = '';
    if (titleIn) titleIn.value = '';
    
    if (dialog) dialog.showModal();
  },

  // Modal Editar Tarea
  openEditModal(taskId) {
    const task = (Store.state.tasks || []).find(t => t.id === taskId);
    if (!task) return;

    const dialog = document.getElementById('modal-task-form');
    const p1 = Store.state.profiles?.p1 || { name: 'Ella', avatar: '👩' };
    const p2 = Store.state.profiles?.p2 || { name: 'Él', avatar: '👨' };

    const titleEl = document.getElementById('task-modal-title');
    const opt1 = document.getElementById('opt-p1');
    const opt2 = document.getElementById('opt-p2');
    const editId = document.getElementById('task-edit-id');
    const titleIn = document.getElementById('task-title');
    const assigneeSel = document.getElementById('task-assignee');
    const freqSel = document.getElementById('task-frequency');

    if (titleEl) titleEl.textContent = '✏️ Editar Tarea del Hogar';
    if (opt1) opt1.textContent = `${p1.avatar} ${p1.name}`;
    if (opt2) opt2.textContent = `${p2.avatar} ${p2.name}`;
    if (editId) editId.value = task.id;
    if (titleIn) titleIn.value = task.title;
    if (assigneeSel) assigneeSel.value = task.assignee || 'unassigned';
    if (freqSel) freqSel.value = task.frequency || 'daily';

    if (dialog) dialog.showModal();
  },

  closeFormModal() {
    const dialog = document.getElementById('modal-task-form');
    if (dialog) dialog.close();
  },

  handleFormSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('task-title')?.value.trim();
    const assignee = document.getElementById('task-assignee')?.value || 'unassigned';
    const frequency = document.getElementById('task-frequency')?.value || 'daily';
    const editId = document.getElementById('task-edit-id')?.value;

    if (!title) return;

    if (!Store.state.tasks) Store.state.tasks = [];

    if (editId) {
      const task = Store.state.tasks.find(t => t.id === editId);
      if (task) {
        task.title = title;
        task.assignee = assignee;
        task.frequency = frequency;
      }
      App.showToast('Tarea actualizada ✏️', 'success');
    } else {
      Store.state.tasks.unshift({
        id: 'task_' + Date.now(),
        title,
        assignee,
        frequency,
        completed: false
      });
      App.showToast('Tarea guardada en el Canvas 📋', 'success');
    }

    Store.save();
    this.render();
    this.closeFormModal();
  },

  // Sorteo Justo con Dado Aleatorio 3D
  openRollDiceModal(preselectedTaskId = null) {
    const dialog = document.getElementById('modal-dice');
    const resultCard = document.getElementById('dice-result-card');
    const p1 = Store.state.profiles?.p1 || { name: 'Ella', avatar: '👩' };
    const p2 = Store.state.profiles?.p2 || { name: 'Él', avatar: '👨' };

    if (resultCard) resultCard.classList.add('hidden');
    
    // Actualizar caras del dado 3D con los avatares
    const faces = document.querySelectorAll('.dice-face');
    if (faces.length >= 6) {
      faces[0].textContent = p1.avatar;
      faces[1].textContent = p2.avatar;
      faces[2].textContent = '🤝';
      faces[3].textContent = p1.avatar;
      faces[4].textContent = p2.avatar;
      faces[5].textContent = '❤️';
    }

    // Poblar el selector de tareas pendientes en el modal del dado
    const taskSelect = document.getElementById('dice-task-select');
    const customInput = document.getElementById('dice-custom-task-input');
    const pendingTasks = (Store.state.tasks || []).filter(t => !t.completed);

    if (taskSelect) {
      taskSelect.innerHTML = '<option value="">-- Seleccionar tarea existente --</option>' +
        pendingTasks.map(t => `<option value="${t.id}">${this.escapeHTML(t.title)}</option>`).join('');
    }

    if (preselectedTaskId) {
      const selected = (Store.state.tasks || []).find(t => t.id === preselectedTaskId);
      if (selected) {
        if (customInput) customInput.value = selected.title;
        if (taskSelect) taskSelect.value = selected.id;
        this.selectedTaskForDice = selected;
      }
    } else {
      if (customInput) customInput.value = '';
      if (taskSelect) taskSelect.value = '';
      this.selectedTaskForDice = null;
    }

    if (dialog) dialog.showModal();
  },

  onDiceSelectChange(taskId) {
    const customInput = document.getElementById('dice-custom-task-input');
    if (taskId) {
      const task = (Store.state.tasks || []).find(t => t.id === taskId);
      if (task && customInput) {
        customInput.value = task.title;
        this.selectedTaskForDice = task;
      }
    } else {
      this.selectedTaskForDice = null;
    }
  },

  closeRollDiceModal() {
    const dialog = document.getElementById('modal-dice');
    if (dialog) dialog.close();
  },

  rollDice() {
    if (this.isRolling) return;
    this.isRolling = true;

    const cube = document.getElementById('dice-3d');
    const resultCard = document.getElementById('dice-result-card');
    const btn = document.getElementById('btn-roll-dice');
    const winnerNameEl = document.getElementById('dice-winner-name');
    const taskTitleEl = document.getElementById('dice-selected-task-title');
    const customTaskText = document.getElementById('dice-custom-task-input')?.value.trim();

    if (btn) btn.disabled = true;
    if (resultCard) resultCard.classList.add('hidden');
    if (cube) cube.classList.add('rolling');

    // Reproducir efectos de sonido periódicos durante el giro
    const soundInterval = setInterval(() => {
      AudioFX.playDiceTick();
    }, 150);

    setTimeout(() => {
      clearInterval(soundInterval);
      if (cube) cube.classList.remove('rolling');

      // Escoger resultado aleatorio: 0=P1, 1=P2, 2=Ambos
      const outcomes = ['p1', 'p2', 'both'];
      const picked = outcomes[Math.floor(Math.random() * outcomes.length)];
      
      const p1 = Store.state.profiles?.p1 || { name: 'Ella', avatar: '👩' };
      const p2 = Store.state.profiles?.p2 || { name: 'Él', avatar: '👨' };

      let winnerText = '';
      let winnerFaceTransform = '';

      if (picked === 'p1') {
        winnerText = `${p1.avatar} ¡Le toca a ${p1.name}!`;
        winnerFaceTransform = 'translateZ(-70px) rotateY(0deg)';
      } else if (picked === 'p2') {
        winnerText = `${p2.avatar} ¡Le toca a ${p2.name}!`;
        winnerFaceTransform = 'translateZ(-70px) rotateY(-90deg)';
      } else {
        winnerText = `🤝 ¡La hacen Juntos!`;
        winnerFaceTransform = 'translateZ(-70px) rotateY(-180deg)';
      }

      if (cube) cube.style.transform = winnerFaceTransform;

      // Asignar o crear la tarea sorteada
      let finalTaskTitle = customTaskText;

      if (this.selectedTaskForDice) {
        this.selectedTaskForDice.assignee = picked;
        finalTaskTitle = this.selectedTaskForDice.title;
        Store.save();
        this.render();
      } else if (customTaskText) {
        if (!Store.state.tasks) Store.state.tasks = [];
        const newTask = {
          id: 'task_' + Date.now(),
          title: customTaskText,
          assignee: picked,
          frequency: 'occasional',
          completed: false
        };
        Store.state.tasks.unshift(newTask);
        Store.save();
        this.render();
      }

      if (taskTitleEl) {
        taskTitleEl.textContent = finalTaskTitle ? `📌 Tarea: "${finalTaskTitle}"` : '¡Sorteo general de turnos!';
      }

      if (winnerNameEl) winnerNameEl.textContent = winnerText;
      if (resultCard) resultCard.classList.remove('hidden');

      AudioFX.playSuccess();
      App.triggerConfetti();

      this.isRolling = false;
      if (btn) btn.disabled = false;
    }, 1400);
  }
};

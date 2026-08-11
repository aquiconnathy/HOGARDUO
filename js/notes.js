/**
 * Notes - Love Notes & Reminders Widget for Couples
 * Interactive pinned board on the dashboard with categories, reactions and cloud sync.
 */
const Notes = {
  init() {
    this.render();
  },

  render() {
    const container = document.getElementById('pinned-notes-container');
    const heroNoteCard = document.getElementById('hero-note-card');
    if (!container || !heroNoteCard) return;

    const notes = Store.state.notes || [];
    const p1 = Store.state.profiles.p1;
    const p2 = Store.state.profiles.p2;

    if (notes.length === 0) {
      heroNoteCard.innerHTML = `
        <div class="note-empty-state">
          <span class="note-empty-icon">💌</span>
          <h4>No hay notas activas</h4>
          <p class="text-muted" style="font-size: 0.8rem; margin: 0.25rem 0 0.75rem;">¡Déjale un mensaje de amor o un recordatorio a tu pareja!</p>
          <button class="btn btn-sm btn-primary" onclick="Notes.openCreateModal()">
            ✍️ Escribir Nota o Recordatorio
          </button>
        </div>
      `;
      return;
    }

    // Mostrar la nota más reciente fijada en la tarjeta principal
    const latest = notes[0];
    const author = latest.author === 'p1' ? p1 : p2;
    const isMine = latest.author === CloudSync.currentUserId;

    const typeIcons = {
      love: '❤️ Amor',
      reminder: '⏰ Recordatorio',
      urgent: '🚨 Urgente',
      surprise: '🎁 Sorpresa',
      task: '📌 Tarea'
    };

    const reactions = latest.reactions || {};
    const reactionEmojis = ['❤️', '🥰', '👍', '💋', '🙌'];
    
    let reactionsHtml = reactionEmojis.map(emoji => {
      const count = reactions[emoji] || 0;
      return `
        <button class="btn-reaction ${count > 0 ? 'active' : ''}" onclick="Notes.addReaction('${latest.id}', '${emoji}')">
          <span>${emoji}</span> ${count > 0 ? `<span class="reaction-count">${count}</span>` : ''}
        </button>
      `;
    }).join('');

    heroNoteCard.innerHTML = `
      <div class="pinned-note-item note-type-${latest.type}">
        <div class="note-top-bar">
          <div class="note-author-info">
            <span class="note-author-avatar">${author.avatar}</span>
            <div>
              <span class="note-author-name">${author.name}</span>
              <span class="note-date">${this.formatDate(latest.timestamp)}</span>
            </div>
          </div>
          <span class="note-type-badge">${typeIcons[latest.type] || '💌 Nota'}</span>
        </div>

        <p class="note-body-text">${this.escapeHTML(latest.text)}</p>

        ${latest.reminderTime ? `
          <div class="note-reminder-tag">
            <span>⏰ Recordatorio:</span>
            <strong>${new Date(latest.reminderTime).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</strong>
          </div>
        ` : ''}

        <!-- Barra de Reacciones -->
        <div class="note-reactions-bar">
          <div class="reactions-list">
            ${reactionsHtml}
          </div>
          <div class="note-actions-right">
            <button class="btn-icon-xs" onclick="Notes.openEditModal('${latest.id}')" title="Editar nota">✏️</button>
            <button class="btn-icon-xs" onclick="Notes.deleteNote('${latest.id}')" title="Eliminar nota">🗑️</button>
            <button class="btn-text-sm" onclick="Notes.openCreateModal()" style="color: var(--primary);">+ Nueva</button>
          </div>
        </div>
      </div>
    `;

    // Renderizar historial de notas anteriores si hay más de 1
    if (notes.length > 1) {
      container.innerHTML = `
        <div class="notes-history-header">
          <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700;">Mensajes anteriores (${notes.length - 1})</span>
        </div>
        <div class="notes-history-list">
          ${notes.slice(1).map(n => {
            const a = n.author === 'p1' ? p1 : p2;
            return `
              <div class="note-history-mini glass-panel">
                <div class="mini-author">
                  <span>${a.avatar} ${a.name}</span>
                  <span class="text-muted" style="font-size: 0.7rem;">${this.formatDate(n.timestamp)}</span>
                </div>
                <p class="mini-text">${this.escapeHTML(n.text)}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem;">
                  <span class="note-type-badge-mini">${typeIcons[n.type] || '💌'}</span>
                  <button class="btn-icon-xs" onclick="Notes.deleteNote('${n.id}')" title="Eliminar">🗑️</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      container.innerHTML = '';
    }
  },

  formatDate(timestamp) {
    if (!timestamp) return 'Reciente';
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Hoy a las ${d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
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

  addReaction(noteId, emoji) {
    const notes = Store.state.notes || [];
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    if (!note.reactions) note.reactions = {};
    note.reactions[emoji] = (note.reactions[emoji] || 0) + 1;

    Store.save();
    CloudSync.broadcastChange('REACTION_ADDED', Store.state);
    AudioFX.playSuccess();
    this.render();
  },

  deleteNote(noteId) {
    Store.state.notes = (Store.state.notes || []).filter(n => n.id !== noteId);
    Store.save();
    CloudSync.broadcastChange('NOTE_DELETED', Store.state);
    this.render();
    App.showToast('Nota eliminada', 'warning');
  },

  openCreateModal() {
    const dialog = document.getElementById('modal-note-form');
    const input = document.getElementById('note-text-input');
    const reminderIn = document.getElementById('note-reminder-input');
    const editId = document.getElementById('note-edit-id');
    const title = document.getElementById('note-modal-title');
    
    if (editId) editId.value = '';
    if (input) input.value = '';
    if (reminderIn) reminderIn.value = '';
    if (title) title.textContent = '💌 Nueva Nota o Recordatorio';
    if (dialog) dialog.showModal();
  },

  openEditModal(noteId) {
    const note = (Store.state.notes || []).find(n => n.id === noteId);
    if (!note) return;

    const dialog = document.getElementById('modal-note-form');
    const input = document.getElementById('note-text-input');
    const reminderIn = document.getElementById('note-reminder-input');
    const typeSelect = document.getElementById('note-type-select');
    const editId = document.getElementById('note-edit-id');
    const title = document.getElementById('note-modal-title');

    if (editId) editId.value = note.id;
    if (input) input.value = note.text;
    if (typeSelect) typeSelect.value = note.type || 'love';
    if (reminderIn) reminderIn.value = note.reminderTime || '';
    if (title) title.textContent = '✏️ Editar Nota o Recordatorio';

    if (dialog) dialog.showModal();
  },

  closeFormModal() {
    const dialog = document.getElementById('modal-note-form');
    if (dialog) dialog.close();
  },

  handleFormSubmit(e) {
    e.preventDefault();
    const text = document.getElementById('note-text-input').value.trim();
    const type = document.getElementById('note-type-select').value;
    const reminderTime = document.getElementById('note-reminder-input').value;
    const editId = document.getElementById('note-edit-id')?.value;

    if (!text) return;

    if (!Store.state.notes) Store.state.notes = [];

    if (editId) {
      const existing = Store.state.notes.find(n => n.id === editId);
      if (existing) {
        existing.text = text;
        existing.type = type;
        existing.reminderTime = reminderTime || null;
      }
      Store.save();
      CloudSync.broadcastChange('NOTE_UPDATED', Store.state);
      App.showToast('Nota editada con éxito ✏️', 'success');
    } else {
      const newNote = {
        id: 'note_' + Date.now(),
        text,
        type,
        author: CloudSync.currentUserId || 'p1',
        timestamp: Date.now(),
        reminderTime: reminderTime || null,
        reactions: {}
      };

      Store.state.notes.unshift(newNote);
      Store.save();

      // Sincronizar en vivo con el celular de la pareja
      CloudSync.broadcastChange('NEW_NOTE', Store.state);
      App.showToast('¡Mensaje enviado a la pantalla de inicio! 💌', 'success');
    }

    this.render();
    this.closeFormModal();
    AudioFX.playSuccess();
  }
};

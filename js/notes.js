/**
 * Notes - Love Notes & Directed Reminders Engine for Couples
 * Directed messages (you only see what your partner wrote on the hero card), with full history modal.
 */
const Notes = {
  activeHistoryFilter: 'all', // 'all', 'received', 'sent'

  init() {
    this.render();
  },

  render() {
    const heroNoteCard = document.getElementById('hero-note-card');
    if (!heroNoteCard) return;

    const notes = Store.state.notes || [];
    const currentUserId = CloudSync.currentUserId || 'p1';
    const partnerId = currentUserId === 'p1' ? 'p2' : 'p1';

    const p1 = Store.state.profiles?.p1 || { name: 'Ella', avatar: '👩' };
    const p2 = Store.state.profiles?.p2 || { name: 'Él', avatar: '👨' };
    const partnerProfile = partnerId === 'p1' ? p1 : p2;

    // Buscar la nota más reciente enviada por la PAREJA hacia mí
    const partnerNotes = notes.filter(n => n.author === partnerId);
    const latestPartnerNote = partnerNotes[0];

    const typeIcons = {
      love: '❤️ Amor',
      reminder: '⏰ Recordatorio',
      urgent: '🚨 Urgente',
      surprise: '🎁 Sorpresa',
      task: '📌 Tarea'
    };

    if (!latestPartnerNote) {
      heroNoteCard.innerHTML = `
        <div class="note-empty-state">
          <span class="note-empty-icon">💌</span>
          <h4>Sin mensajes nuevos de ${partnerProfile.name}</h4>
          <p class="text-muted" style="font-size: 0.8rem; margin: 0.25rem 0 0.75rem;">¡Escríbele una nota de amor o un recordatorio para alegrarle el día!</p>
          <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-sm btn-primary" onclick="Notes.openCreateModal()">
              ✍️ Escribir Nota a ${partnerProfile.name}
            </button>
            <button class="btn btn-sm btn-outline" onclick="Notes.openHistoryModal()">
              📜 Historial (${notes.length})
            </button>
          </div>
        </div>
      `;
      return;
    }

    const author = partnerProfile;
    const reactions = latestPartnerNote.reactions || {};
    const reactionEmojis = ['❤️', '🥰', '👍', '💋', '🙌'];
    
    let reactionsHtml = reactionEmojis.map(emoji => {
      const count = reactions[emoji] || 0;
      return `
        <button class="btn-reaction ${count > 0 ? 'active' : ''}" onclick="Notes.addReaction('${latestPartnerNote.id}', '${emoji}')">
          <span>${emoji}</span> ${count > 0 ? `<span class="reaction-count">${count}</span>` : ''}
        </button>
      `;
    }).join('');

    heroNoteCard.innerHTML = `
      <div class="pinned-note-item note-type-${latestPartnerNote.type || 'love'}">
        <div class="note-top-bar">
          <div class="note-author-info">
            ${author.photo ? `
              <img src="${author.photo}" class="note-author-photo-round" alt="${author.name}">
            ` : `
              <span class="note-author-avatar">${author.avatar || '❤️'}</span>
            `}
            <div>
              <span class="note-author-name">${author.name}</span>
              <span class="note-date">${this.formatDate(latestPartnerNote.timestamp)}</span>
            </div>
          </div>
          <span class="note-type-badge">${typeIcons[latestPartnerNote.type] || '💌 Nota'}</span>
        </div>

        <p class="note-body-text">${this.escapeHTML(latestPartnerNote.text)}</p>

        ${latestPartnerNote.reminderTime ? `
          <div class="note-reminder-tag">
            <span>⏰ Recordatorio:</span>
            <strong>${new Date(latestPartnerNote.reminderTime).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</strong>
          </div>
        ` : ''}

        <div class="note-reactions-bar">
          <div class="reactions-list">
            ${reactionsHtml}
          </div>
          <div class="note-actions-right">
            <button class="btn-text-sm" onclick="Notes.openCreateModal()" style="color: var(--primary);">✍️ Responder</button>
            <button class="btn-text-sm" onclick="Notes.openHistoryModal()" style="color: var(--text-secondary);">📜 Historial</button>
          </div>
        </div>
      </div>
    `;
  },

  // ==========================================
  // HISTORIAL COMPLETO DE MENSAJES (MODAL)
  // ==========================================

  openHistoryModal(filter = 'all') {
    this.activeHistoryFilter = filter;
    const dialog = document.getElementById('modal-notes-history');
    if (!dialog) return;

    this.renderHistoryList();
    dialog.showModal();
  },

  closeHistoryModal() {
    const dialog = document.getElementById('modal-notes-history');
    if (dialog) {
      try { dialog.close(); } catch(e) {}
      dialog.removeAttribute('open');
    }
  },

  setHistoryFilter(filter) {
    this.activeHistoryFilter = filter;
    this.renderHistoryList();
  },

  renderHistoryList() {
    const listEl = document.getElementById('notes-history-modal-list');
    const tabsEl = document.getElementById('notes-history-tabs');
    if (!listEl) return;

    const notes = Store.state.notes || [];
    const currentUserId = CloudSync.currentUserId || 'p1';
    const partnerId = currentUserId === 'p1' ? 'p2' : 'p1';

    const p1 = Store.state.profiles?.p1 || { name: 'Ella', avatar: '👩' };
    const p2 = Store.state.profiles?.p2 || { name: 'Él', avatar: '👨' };

    const typeIcons = {
      love: '❤️ Amor',
      reminder: '⏰ Recordatorio',
      urgent: '🚨 Urgente',
      surprise: '🎁 Sorpresa',
      task: '📌 Tarea'
    };

    if (tabsEl) {
      tabsEl.innerHTML = `
        <button class="btn-tab-pill ${this.activeHistoryFilter === 'all' ? 'active' : ''}" onclick="Notes.setHistoryFilter('all')">
          Todas (${notes.length})
        </button>
        <button class="btn-tab-pill ${this.activeHistoryFilter === 'received' ? 'active' : ''}" onclick="Notes.setHistoryFilter('received')">
          De mi Pareja (${notes.filter(n => n.author === partnerId).length})
        </button>
        <button class="btn-tab-pill ${this.activeHistoryFilter === 'sent' ? 'active' : ''}" onclick="Notes.setHistoryFilter('sent')">
          Enviadas por Mí (${notes.filter(n => n.author === currentUserId).length})
        </button>
      `;
    }

    let filtered = notes;
    if (this.activeHistoryFilter === 'received') filtered = notes.filter(n => n.author === partnerId);
    if (this.activeHistoryFilter === 'sent') filtered = notes.filter(n => n.author === currentUserId);

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state text-center" style="padding: 2rem 1rem;">
          <span style="font-size: 2rem; display: block;">📭</span>
          <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.5rem;">No hay notas en esta sección</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(n => {
      const isMine = n.author === currentUserId;
      const author = n.author === 'p1' ? p1 : p2;

      return `
        <div class="history-note-card glass-panel ${isMine ? 'note-mine' : 'note-partner'}">
          <div class="history-note-header">
            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <span>${author.avatar || '👤'}</span>
              <strong style="font-size: 0.85rem;">${isMine ? 'Tú' : author.name}</strong>
              <span class="text-muted" style="font-size: 0.72rem;">• ${this.formatDate(n.timestamp)}</span>
            </div>
            <span class="note-type-badge-mini">${typeIcons[n.type] || '💌'}</span>
          </div>

          <p class="history-note-text">${this.escapeHTML(n.text)}</p>

          ${n.reminderTime ? `
            <div style="font-size: 0.75rem; color: var(--primary); margin: 0.35rem 0;">
              ⏰ Programado: ${new Date(n.reminderTime).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          ` : ''}

          <div class="history-note-footer">
            <div class="reactions-summary">
              ${Object.entries(n.reactions || {}).map(([emoji, count]) => `
                <span class="reaction-tag">${emoji} ${count}</span>
              `).join('')}
            </div>

            <div class="history-note-actions">
              ${isMine ? `
                <button class="btn-icon-xs" onclick="Notes.openEditModal('${n.id}')" title="Editar">✏️</button>
                <button class="btn-icon-xs" onclick="Notes.deleteNote('${n.id}')" title="Eliminar">🗑️</button>
              ` : `
                <button class="btn-icon-xs" onclick="Notes.addReaction('${n.id}', '❤️')" title="Reaccionar">❤️</button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
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
    AudioFX?.playSuccess();
    this.render();
    if (document.getElementById('modal-notes-history')?.open) {
      this.renderHistoryList();
    }
  },

  deleteNote(noteId) {
    Store.state.notes = (Store.state.notes || []).filter(n => n.id !== noteId);
    Store.save();
    CloudSync.broadcastChange('NOTE_DELETED', Store.state);
    this.render();
    if (document.getElementById('modal-notes-history')?.open) {
      this.renderHistoryList();
    }
    App?.showToast('Nota eliminada', 'warning');
  },

  openCreateModal() {
    const dialog = document.getElementById('modal-note-form');
    const input = document.getElementById('note-text-input');
    const reminderIn = document.getElementById('note-reminder-input');
    const editId = document.getElementById('note-edit-id');
    const title = document.getElementById('note-modal-title');
    
    const partnerId = (CloudSync.currentUserId || 'p1') === 'p1' ? 'p2' : 'p1';
    const partnerName = Store.state?.profiles?.[partnerId]?.name || 'tu pareja';

    if (editId) editId.value = '';
    if (input) input.value = '';
    if (reminderIn) reminderIn.value = '';
    if (title) title.textContent = `💌 Enviar Nota a ${partnerName}`;
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
    if (title) title.textContent = '✏️ Editar Nota';

    if (dialog) dialog.showModal();
  },

  closeFormModal() {
    const dialog = document.getElementById('modal-note-form');
    if (dialog) {
      try { dialog.close(); } catch(e) {}
      dialog.removeAttribute('open');
    }
  },

  handleFormSubmit(e) {
    e.preventDefault();
    const text = document.getElementById('note-text-input')?.value.trim();
    const type = document.getElementById('note-type-select')?.value || 'love';
    const reminderTime = document.getElementById('note-reminder-input')?.value;
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
      App?.showToast('Nota editada con éxito ✏️', 'success');
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

      CloudSync.broadcastChange('NEW_NOTE', { note: newNote });
      App?.showToast('¡Nota enviada al celular de tu pareja! 💌', 'success');
    }

    this.render();
    this.closeFormModal();
    AudioFX?.playSuccess();
  }
};

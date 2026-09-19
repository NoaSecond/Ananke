/**
 * board-settings-ui.js — Ananke v3.0 (NEW)
 *
 * Responsabilité unique (S) : gestion de la page Board Settings (membres, rename, suppression).
 */

import { state, getFullUrl } from './state.js';
import * as API from './api.js';
import { Logger } from './utils.js';
import { renderAvatarHtml, resolveUser } from './avatar.js';
import { updatePreview } from './theme-ui.js';
import { BOARD_COLORS, BOARD_ICONS } from './dashboard-ui.js';

let _onBack            = null;
let _onDeleted         = null;
let _onUpdated         = null;
let _tempBg            = null;
let _sessionBgUploads  = [];

/**
 * Initialize board settings.
 * @param {{ onBack: () => void, onDeleted: () => void, onUpdated?: (board: object) => void }} options
 */
export function initBoardSettings({ onBack, onDeleted, onUpdated }) {
    _onBack    = onBack;
    _onDeleted = onDeleted;
    _onUpdated = onUpdated;
}

/**
 * Render the board settings view for the current board.
 */
export async function renderBoardSettings() {
    const container = document.getElementById('view-board-settings');
    if (!container) return;

    const board = state.boards.find(b => b.id === state.currentBoardId);
    if (!board) return;

    // Ensure board data is loaded
    if (!state.boardData || state.boardData.id !== state.currentBoardId) {
        try {
            const { board: fullBoard } = await API.getBoard(state.currentBoardId);
            if (fullBoard?.data) {
                state.boardData = fullBoard.data;
            }
            if (fullBoard) {
                if (fullBoard.color) board.color = fullBoard.color;
                if (fullBoard.icon)  board.icon  = fullBoard.icon;
            }
        } catch (e) {
            Logger.warn('Could not load board data for settings', e);
        }
    }
    if (!state.boardData) state.boardData = {};

    const canAdmin = state.currentUser &&
        (['admin', 'owner'].includes(state.currentUser.role) || state.boardMembers?.some(
            m => m.id === state.currentUser.id && m.board_role === 'board_admin'
        ) || (board.created_by && board.created_by === state.currentUser.id));

    container.innerHTML = `
        <div class="settings-page-header">
            <button class="settings-page-back-btn" id="settings-back-btn" title="Back to board">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 class="settings-page-title">Board Settings — ${escHtml(board.name)}</h1>
        </div>

        ${canAdmin ? renderGeneralSection(board) : ''}

        ${canAdmin ? renderBackgroundSection(board) : ''}

        <div class="settings-section">
            <h3 class="settings-section-title">
                <span class="material-symbols-outlined">group</span>
                Members
            </h3>
            <div class="member-list" id="member-list">
                <div style="color: var(--clr-text-muted); font-size:0.85rem;">Loading members...</div>
            </div>
            ${canAdmin ? renderAddMemberForm() : ''}
        </div>

        ${canAdmin && state.currentUser?.role === 'owner' ? renderDangerZone() : ''}
    `;

    // Back button
    document.getElementById('settings-back-btn')?.addEventListener('click', () => {
        // Clean up unsaved uploads
        _sessionBgUploads.forEach(url => API.deleteMedia(url).catch(e => Logger.warn('Cleanup media notice', e)));
        _sessionBgUploads = [];
        if (_onBack) _onBack();
    });

    // General & Background form bindings
    if (canAdmin) {
        _bindGeneralForm();
        _bindBackgroundSection();
        _bindDangerZone();
    }

    // Load members
    await loadMembers();

    if (canAdmin) _bindAddMemberForm();
}

// --------------------------------------------------------------------------
// Sections
// --------------------------------------------------------------------------

function renderGeneralSection(board) {
    const currentColor = board.color || BOARD_COLORS[0];
    const currentIcon  = board.icon  || BOARD_ICONS[0];

    return `
        <div class="settings-section">
            <h3 class="settings-section-title">
                <span class="material-symbols-outlined">edit</span>
                General
            </h3>
            <form id="board-general-form" style="display:flex;flex-direction:column;gap:1rem;">
                <div class="form-group">
                    <label class="form-label">Board Name</label>
                    <input class="form-input" id="settings-board-name" type="text" value="${escHtml(board.name)}" maxlength="100" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea class="form-input" id="settings-board-desc" rows="3" maxlength="500" placeholder="Enter board description...">${escHtml(board.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Color</label>
                    <div class="color-picker-row" id="settings-board-color-swatches">
                        ${BOARD_COLORS.map(c => `
                            <div class="color-swatch${c === currentColor ? ' selected' : ''}"
                                 style="background:${c}" data-color="${c}" title="${c}"></div>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Icon</label>
                    <div class="icon-picker-row" id="settings-board-icon-swatches">
                        ${BOARD_ICONS.map(ic => `
                            <div class="icon-swatch${ic === currentIcon ? ' selected' : ''}" data-icon="${ic}" title="${ic}">
                                <span class="material-symbols-outlined">${ic}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div id="board-general-message" style="font-size:0.82rem;color:var(--clr-danger);min-height:1.2em;"></div>
                <button type="submit" class="action-btn" style="align-self:flex-start;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;">save</span>
                    Save changes
                </button>
            </form>
        </div>
    `;
}

function renderBackgroundSection(board) {
    const currentBg = state.boardData?.background || { type: 'default', value: '' };

    return `
        <div class="settings-section">
            <h3 class="settings-section-title">
                <span class="material-symbols-outlined">palette</span>
                Board Background
            </h3>
            <p style="font-size:0.85rem;color:var(--clr-text-muted);margin:0 0 1.25rem;">
                Customize the appearance of this board with a solid color, gradient, or custom image.
            </p>

            <div class="bg-preview" id="board-bg-preview">Preview</div>

            <div class="bg-options">
                <div class="bg-option-section">
                    <h4>Solid Color</h4>
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <input type="color" id="board-bg-color-picker" value="${currentBg.type === 'color' ? currentBg.value : '#1e1e2e'}" class="board-bg-color-picker">
                        <span id="board-bg-color-val" style="font-size:0.85rem;color:var(--clr-text-muted);font-family:monospace;">${currentBg.type === 'color' ? currentBg.value : '#1e1e2e'}</span>
                    </div>
                </div>

                <div class="bg-option-section">
                    <h4>Gradient Presets</h4>
                    <div class="gradient-presets">
                        <button type="button" class="gradient-btn board-gradient-btn" data-value="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                            style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);" title="Purple Bliss"></button>
                        <button type="button" class="gradient-btn board-gradient-btn" data-value="linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)"
                            style="background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);" title="Warm Flame"></button>
                        <button type="button" class="gradient-btn board-gradient-btn" data-value="linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)"
                            style="background: linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%);" title="Sky Blue"></button>
                        <button type="button" class="gradient-btn board-gradient-btn" data-value="linear-gradient(135deg, #f6d365 0%, #fda085 100%)"
                            style="background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);" title="Sunset"></button>
                        <button type="button" class="gradient-btn board-gradient-btn" data-value="linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)"
                            style="background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);" title="Ocean Breeze"></button>
                        <button type="button" class="gradient-btn board-gradient-btn" data-value="linear-gradient(135deg, #fa709a 0%, #fee140 100%)"
                            style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);" title="Pink Lemonade"></button>
                    </div>
                </div>

                <div class="bg-option-section">
                    <h4>Image URL</h4>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="board-bg-image-url" class="form-input" placeholder="https://images.unsplash.com/..."
                            value="${currentBg.type === 'image' && currentBg.value && currentBg.value.startsWith('http') ? escHtml(currentBg.value) : ''}" style="flex: 1;">
                        <button type="button" id="board-bg-image-apply-btn" class="secondary-btn small-btn">Apply</button>
                    </div>
                </div>

                <div class="bg-option-section">
                    <h4>Custom Image</h4>
                    <label for="board-bg-image-upload" class="media-upload-label" id="board-bg-upload-dropzone">
                        <span class="material-symbols-outlined">cloud_upload</span>
                        <span>Click or drag & drop image</span>
                        <small style="opacity:0.6;">PNG, JPG, WebP...</small>
                    </label>
                    <input type="file" id="board-bg-image-upload" accept="image/*" style="display: none;">
                </div>
            </div>

            <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem; align-items: center; flex-wrap: wrap;">
                <button type="button" id="board-reset-bg-btn" class="secondary-btn">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;">restart_alt</span>
                    Reset to Default
                </button>
                <button type="button" id="board-save-bg-btn" class="action-btn">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;">save</span>
                    Save Background
                </button>
                <div id="board-bg-message" style="font-size:0.85rem;min-height:1.2em;font-weight:500;"></div>
            </div>
        </div>
    `;
}

function renderAddMemberForm() {
    return `
        <div class="add-member-form" style="margin-top:1rem;">
            <select id="add-member-user-select" class="user-search-select">
                <option value="">Select a user...</option>
            </select>
            <select id="add-member-role-select">
                <option value="reader">Viewer</option>
                <option value="editor">Editor</option>
                <option value="board_admin">Admin</option>
            </select>
            <button class="btn btn-primary" id="add-member-btn">
                <span class="material-symbols-outlined">person_add</span>
                Add
            </button>
        </div>
        <div id="add-member-message" style="font-size:0.82rem;min-height:1.2em;margin-top:6px;"></div>
    `;
}

function renderDangerZone() {
    return `
        <div class="settings-section danger-zone">
            <h3 class="settings-section-title">
                <span class="material-symbols-outlined">warning</span>
                Danger Zone
            </h3>
            <p style="font-size:0.85rem;color:var(--clr-text-muted);margin:0 0 1rem;">
                Deleting a board is permanent and cannot be undone. All tasks and columns will be lost.
            </p>
            <button class="btn btn-danger" id="delete-board-btn">
                <span class="material-symbols-outlined">delete_forever</span>
                Delete this board
            </button>
        </div>
    `;
}

// --------------------------------------------------------------------------
// Members
// --------------------------------------------------------------------------

async function loadMembers() {
    const listEl = document.getElementById('member-list');
    if (!listEl || !state.currentBoardId) return;

    try {
        const { members } = await API.getBoardMembers(state.currentBoardId);
        state.boardMembers = members;
        renderMemberList(members);
        await populateUserSelect(members);
    } catch (err) {
        Logger.error('Load members error', err);
        listEl.innerHTML = '<div style="color:var(--clr-danger);font-size:0.85rem;">Failed to load members.</div>';
    }
}

function renderMemberList(members) {
    const listEl = document.getElementById('member-list');
    if (!listEl) return;

    const canAdmin = ['admin', 'owner'].includes(state.currentUser?.role) ||
        members.some(m => m.id === state.currentUser?.id && m.board_role === 'board_admin');

    if (!members.length) {
        listEl.innerHTML = '<div style="color:var(--clr-text-muted);font-size:0.85rem;">No members yet.</div>';
        return;
    }

    listEl.innerHTML = members.map(m => {
        const resolved   = resolveUser(m);
        const avatarHtml = renderAvatarHtml(m, { className: 'member-avatar' });
        const isSelf     = m.id === state.currentUser?.id;

        return `
            <div class="member-row" data-user-id="${m.id}">
                ${avatarHtml}
                <div class="member-info">
                    <div class="member-name">${escHtml(resolved.name)}${isSelf ? ' <span style="font-size:0.7rem;color:var(--clr-primary)">(you)</span>' : ''}</div>
                    <div class="member-email">${escHtml(resolved.email)}</div>
                </div>
                ${canAdmin && !isSelf ? `
                    <select class="member-role-select" data-user-id="${m.id}">
                        <option value="reader"      ${m.board_role === 'reader'      ? 'selected' : ''}>Viewer</option>
                        <option value="editor"      ${m.board_role === 'editor'      ? 'selected' : ''}>Editor</option>
                        <option value="board_admin" ${m.board_role === 'board_admin' ? 'selected' : ''}>Admin</option>
                    </select>
                    <button class="member-remove-btn" data-user-id="${m.id}" title="Remove member">
                        <span class="material-symbols-outlined">person_remove</span>
                    </button>
                ` : `<span style="font-size:0.78rem;color:var(--clr-text-muted);">${formatRole(m.board_role)}</span>`}
            </div>
        `;
    }).join('');

    // Bind role change
    listEl.querySelectorAll('.member-role-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            const userId = sel.dataset.userId;
            const role   = sel.value;
            try {
                await API.updateBoardMemberRole(state.currentBoardId, userId, role);
                Logger.success('Member role updated.');
            } catch (err) {
                Logger.error('Failed to update role', err);
                await loadMembers();
            }
        });
    });

    // Bind remove
    listEl.querySelectorAll('.member-remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.userId;
            if (!confirm('Remove this member from the board?')) return;
            try {
                await API.removeBoardMember(state.currentBoardId, userId);
                await loadMembers();
                Logger.success('Member removed.');
            } catch (err) {
                Logger.error('Failed to remove member', err);
            }
        });
    });
}

async function populateUserSelect(currentMembers) {
    const select = document.getElementById('add-member-user-select');
    if (!select) return;

    try {
        const { users } = await API.getSimpleList();
        const memberIds = new Set(currentMembers.map(m => m.id));
        const nonMembers = users.filter(u => !memberIds.has(u.id));

        select.innerHTML = '<option value="">Select a user...</option>' +
            nonMembers.map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('');
    } catch (err) {
        Logger.error('Failed to load user list', err);
    }
}

function _bindAddMemberForm() {
    const btn    = document.getElementById('add-member-btn');
    const msgEl  = document.getElementById('add-member-message');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const userId = document.getElementById('add-member-user-select')?.value;
        const role   = document.getElementById('add-member-role-select')?.value || 'reader';

        if (!userId) {
            if (msgEl) { msgEl.textContent = 'Please select a user.'; msgEl.style.color = 'var(--clr-danger)'; }
            return;
        }

        try {
            const res = await API.addBoardMember(state.currentBoardId, userId, role);
            if (res.success) {
                if (msgEl) { msgEl.textContent = 'Member added.'; msgEl.style.color = 'var(--clr-success)'; }
                await loadMembers();
            } else {
                if (msgEl) { msgEl.textContent = res.error || 'Failed to add member.'; msgEl.style.color = 'var(--clr-danger)'; }
            }
        } catch (err) {
            Logger.error('Add member error', err);
            if (msgEl) { msgEl.textContent = 'Network error.'; msgEl.style.color = 'var(--clr-danger)'; }
        }
    });
}

// --------------------------------------------------------------------------
// General form
// --------------------------------------------------------------------------

function _bindGeneralForm() {
    const form  = document.getElementById('board-general-form');
    const msgEl = document.getElementById('board-general-message');
    if (!form) return;

    const board = state.boards.find(b => b.id === state.currentBoardId);
    let selectedColor = board?.color || BOARD_COLORS[0];
    let selectedIcon  = board?.icon  || BOARD_ICONS[0];

    const colorRow = document.getElementById('settings-board-color-swatches');
    if (colorRow) {
        colorRow.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                colorRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                selectedColor = swatch.dataset.color;
            });
        });
    }

    const iconRow = document.getElementById('settings-board-icon-swatches');
    if (iconRow) {
        iconRow.querySelectorAll('.icon-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                iconRow.querySelectorAll('.icon-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                selectedIcon = swatch.dataset.icon;
            });
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name        = document.getElementById('settings-board-name')?.value?.trim();
        const description = document.getElementById('settings-board-desc')?.value?.trim();
        const color       = selectedColor;
        const icon        = selectedIcon;

        try {
            const res = await API.updateBoardMeta(state.currentBoardId, { name, description, color, icon });
            if (res.success) {
                const b = state.boards.find(item => item.id === state.currentBoardId);
                if (b) {
                    b.name = name;
                    b.description = description;
                    b.color = color;
                    b.icon = icon;
                }
                const pageTitle = document.querySelector('.settings-page-title');
                if (pageTitle) pageTitle.textContent = `Board Settings — ${name}`;

                const headerTitle = document.getElementById('board-title-display');
                if (headerTitle) headerTitle.textContent = name;

                if (msgEl) { msgEl.textContent = 'Saved!'; msgEl.style.color = 'var(--clr-success)'; }
                Logger.success('Board updated.');

                if (_onUpdated) _onUpdated(b);
            } else {
                if (msgEl) { msgEl.textContent = res.error || 'Failed.'; msgEl.style.color = 'var(--clr-danger)'; }
            }
        } catch (err) {
            Logger.error('Update board error', err);
            if (msgEl) { msgEl.textContent = 'Network error.'; msgEl.style.color = 'var(--clr-danger)'; }
        }
    });
}

// --------------------------------------------------------------------------
// Background form
// --------------------------------------------------------------------------

function _bindBackgroundSection() {
    const previewEl      = document.getElementById('board-bg-preview');
    const colorPicker    = document.getElementById('board-bg-color-picker');
    const colorVal       = document.getElementById('board-bg-color-val');
    const gradientBtns   = document.querySelectorAll('.board-gradient-btn');
    const urlInput       = document.getElementById('board-bg-image-url');
    const applyUrlBtn    = document.getElementById('board-bg-image-apply-btn');
    const fileInput      = document.getElementById('board-bg-image-upload');
    const dropzone       = document.getElementById('board-bg-upload-dropzone');
    const resetBtn       = document.getElementById('board-reset-bg-btn');
    const saveBtn        = document.getElementById('board-save-bg-btn');
    const msgEl          = document.getElementById('board-bg-message');

    // Cleanup previous session uploads
    _sessionBgUploads.forEach(url => API.deleteMedia(url).catch(e => Logger.warn('Cleanup media notice', e)));
    _sessionBgUploads = [];

    // Current background as temp working background
    _tempBg = state.boardData?.background ? { ...state.boardData.background } : { type: 'default', value: '' };

    function syncState() {
        updatePreview(previewEl, _tempBg);

        // Highlight active gradient if matching
        gradientBtns.forEach(btn => {
            btn.classList.toggle('active', _tempBg.type === 'gradient' && _tempBg.value === btn.dataset.value);
        });

        // Update color picker display
        if (_tempBg.type === 'color' && colorPicker && colorVal) {
            colorPicker.value = _tempBg.value;
            colorVal.textContent = _tempBg.value;
        }
    }

    // Initial sync
    syncState();

    // Color picker input
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            _tempBg = { type: 'color', value: e.target.value };
            if (colorVal) colorVal.textContent = e.target.value;
            syncState();
        });
    }

    // Gradient presets
    gradientBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            _tempBg = { type: 'gradient', value: btn.dataset.value };
            syncState();
        });
    });

    // Image URL Apply
    if (applyUrlBtn && urlInput) {
        applyUrlBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (url) {
                _tempBg = { type: 'image', value: url };
                syncState();
                if (msgEl) { msgEl.textContent = 'Image URL applied to preview.'; msgEl.style.color = 'var(--clr-text-muted)'; }
            }
        });
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyUrlBtn.click();
            }
        });
    }

    // File Upload handling
    const handleFile = async (file) => {
        if (!file) return;
        if (msgEl) { msgEl.textContent = 'Uploading image...'; msgEl.style.color = 'var(--clr-primary)'; }
        try {
            const res = await API.uploadFiles([file]);
            if (res.urls && res.urls.length > 0) {
                const uploadedUrl = res.urls[0];
                _sessionBgUploads.push(uploadedUrl);
                _tempBg = { type: 'image', value: uploadedUrl };
                if (urlInput) urlInput.value = '';
                syncState();
                if (msgEl) { msgEl.textContent = 'Image uploaded to preview.'; msgEl.style.color = 'var(--clr-success)'; }
            }
        } catch (err) {
            Logger.error('Failed to upload background image', err);
            if (msgEl) { msgEl.textContent = 'Failed to upload image.'; msgEl.style.color = 'var(--clr-danger)'; }
        }
    };

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            handleFile(e.target.files[0]);
        });
    }

    if (dropzone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-active'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-active'), false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt?.files?.[0]) handleFile(dt.files[0]);
        }, false);
    }

    // Reset to default
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            _tempBg = { type: 'default', value: '' };
            if (urlInput) urlInput.value = '';
            if (colorVal) colorVal.textContent = '#1e1e2e';
            syncState();
            if (msgEl) { msgEl.textContent = 'Reset to default preview.'; msgEl.style.color = 'var(--clr-text-muted)'; }
        });
    }

    // Save
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!state.currentBoardId) return;

            const oldBg = state.boardData?.background;

            // Delete old uploaded background if we replaced it
            if (oldBg && oldBg.type === 'image' && oldBg.value && oldBg.value.startsWith('/uploads/') && (!_tempBg || _tempBg.value !== oldBg.value)) {
                API.deleteMedia(oldBg.value).catch(err => Logger.error('Failed to delete old background', err));
            }

            // Cleanup any unused session uploads
            _sessionBgUploads.forEach(url => {
                if (!_tempBg || _tempBg.value !== url) {
                    API.deleteMedia(url).catch(e => Logger.warn('Cleanup media notice', e));
                }
            });
            _sessionBgUploads = [];

            if (!state.boardData) state.boardData = {};
            state.boardData.background = _tempBg;

            const board = state.boards.find(b => b.id === state.currentBoardId);
            if (board) {
                if (!board.data) board.data = {};
                board.data.background = _tempBg;
            }

            try {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<span class="material-symbols-outlined rotating" style="font-size:1.1rem;">progress_activity</span> Saving...';
                await API.saveBoardData(state.currentBoardId, state.boardData);

                if (state.socket) {
                    state.socket.emit('updateBoard', state.boardData);
                }

                if (msgEl) {
                    msgEl.textContent = 'Background saved successfully!';
                    msgEl.style.color = 'var(--clr-success)';
                }
                Logger.success('Board background updated');
            } catch (err) {
                Logger.error('Failed to save background', err);
                if (msgEl) {
                    msgEl.textContent = 'Failed to save background.';
                    msgEl.style.color = 'var(--clr-danger)';
                }
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:1.1rem;">save</span> Save Background';
            }
        });
    }
}

// --------------------------------------------------------------------------
// Danger zone
// --------------------------------------------------------------------------

function _bindDangerZone() {
    const btn = document.getElementById('delete-board-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const board = state.boards.find(b => b.id === state.currentBoardId);
        if (!board) return;
        if (!confirm(`Delete board "${board.name}"? This cannot be undone.`)) return;

        try {
            const res = await API.deleteBoard(state.currentBoardId);
            if (res.success) {
                state.boards = state.boards.filter(b => b.id !== state.currentBoardId);
                state.currentBoardId = null;
                Logger.success('Board deleted.');
                if (_onDeleted) _onDeleted();
            } else {
                alert(res.error || 'Failed to delete board.');
            }
        } catch (err) {
            Logger.error('Delete board error', err);
        }
    });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatRole(role) {
    switch (role) {
        case 'board_admin': return 'Admin';
        case 'editor':      return 'Editor';
        case 'reader':      return 'Viewer';
        default:            return role || 'Member';
    }
}

function escHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * board-settings-ui.js — Ananke v3.0 (NEW)
 *
 * Responsabilité unique (S) : gestion de la page Board Settings (membres, rename, suppression).
 */

import { state, getFullUrl } from './state.js';
import * as API from './api.js';
import { Logger, getContrastYIQ } from './utils.js';
import { renderAvatarHtml, resolveUser } from './avatar.js';
import { updatePreview } from './theme-ui.js';
import { BOARD_COLORS } from './dashboard-ui.js';
import { BOARD_ICONS, loadBoardIcons, renderIconSwatchesHtml, renderBoardIconHtml, getDefaultIconId } from './board-icons.js';
import { t } from './i18n.js';
import { saveData } from './board-ui.js';
import { showConfirm } from './modals.js';

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

    await loadBoardIcons();

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

    const canEdit = canAdmin || (state.currentUser && (
        ['admin', 'owner'].includes(state.currentUser.role) || state.boardMembers?.some(
            m => m.id === state.currentUser.id && ['editor', 'board_admin'].includes(m.board_role)
        )
    ));

    container.innerHTML = `
        <div class="settings-page-header">
            <button class="settings-page-back-btn" id="settings-back-btn" title="${t('board_settings.back_to_board')}">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 class="settings-page-title">${t('board_settings.title', { name: escHtml(board.name) })}</h1>
        </div>

        ${canAdmin ? renderGeneralSection(board) : ''}

        ${canAdmin ? renderBackgroundSection(board) : ''}

        ${canEdit ? renderTagsSection() : ''}

        <div class="settings-section">
            <h3 class="settings-section-title">
                <span class="material-symbols-outlined">group</span>
                ${t('board_settings.tab_members')}
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

    if (canEdit) {
        _bindTagsSection();
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
    const currentIcon  = board.icon  || getDefaultIconId();

    return `
        <div class="settings-section">
            <h3 class="settings-section-title">
                <span class="material-symbols-outlined">edit</span>
                ${t('board_settings.section_general')}
            </h3>
            <form id="board-general-form" style="display:flex;flex-direction:column;gap:1rem;">
                <div class="form-group">
                    <label class="form-label">${t('board_settings.board_name')}</label>
                    <input class="form-input" id="settings-board-name" type="text" value="${escHtml(board.name)}" maxlength="100" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('board_settings.description')}</label>
                    <textarea class="form-input" id="settings-board-desc" rows="3" maxlength="500" placeholder="${t('board_settings.description_placeholder')}">${escHtml(board.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('board_settings.icon_and_color')}</label>
                    <div class="color-picker-row" id="settings-board-color-swatches">
                        ${BOARD_COLORS.map(c => `
                            <div class="color-swatch${c === currentColor ? ' selected' : ''}"
                                 style="background:${c}" data-color="${c}" title="${c}"></div>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <div class="icon-picker-row" id="settings-board-icon-swatches">
                        ${renderIconSwatchesHtml(currentIcon)}
                    </div>
                </div>
                <div id="board-general-message" style="font-size:0.82rem;color:var(--clr-danger);min-height:1.2em;"></div>
                <button type="submit" class="action-btn" style="align-self:flex-start;">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;">save</span>
                    ${t('board_settings.btn_save')}
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
                    Reset
                </button>
                <button type="button" id="board-save-bg-btn" class="action-btn">
                    <span class="material-symbols-outlined" style="font-size:1.1rem;">save</span>
                    ${t('board_settings.btn_save')}
                </button>
                <div id="board-bg-message" style="font-size:0.85rem;min-height:1.2em;font-weight:500;"></div>
            </div>
        </div>
    `;
}

function renderTagsSection() {
    return `
        <div class="settings-section" id="board-tags-section">
            <h3 class="settings-section-title">
                <span class="material-symbols-outlined">label</span>
                ${t('board_settings.section_tags') || 'Gestion des Étiquettes'}
            </h3>
            <p style="font-size:0.85rem;color:var(--clr-text-muted);margin:0 0 1.25rem;">
                ${t('board_settings.tags_desc') || 'Gérez les étiquettes existantes de ce tableau, modifiez leur couleur ou leur libellé, ou créez-en de nouvelles.'}
            </p>

            <!-- Add Tag Box -->
            <div style="background: var(--clr-surface-2); border: 1px solid var(--clr-border); border-radius: var(--border-radius-md, 8px); padding: 1rem; margin-bottom: 1.25rem;">
                <h4 style="margin: 0 0 0.75rem; font-size: 0.9rem; font-weight: 600;">
                    ${t('board_settings.add_tag_title') || 'Créer une nouvelle étiquette'}
                </h4>
                <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                    <div style="position: relative; flex: 1; min-width: 180px;">
                        <input type="text" id="settings-new-tag-name" class="form-input"
                            placeholder="${t('board_settings.tag_name_placeholder') || 'Nom de l\'étiquette (ex: Urgent, Bug, Frontend...)'}"
                            maxlength="30" style="padding-right: 42px;">
                        <span id="settings-new-tag-counter" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 0.72rem; color: var(--clr-text-muted); pointer-events: none; font-variant-numeric: tabular-nums;">0/30</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <input type="color" id="settings-new-tag-color" value="#3b82f6" class="color-input-small" title="Choisir une couleur" aria-label="Tag color">
                    </div>
                    <button type="button" id="settings-add-tag-btn" class="action-btn"
                        style="display: flex; align-items: center; gap: 4px; padding: 0.5rem 1rem;">
                        <span class="material-symbols-outlined" style="font-size: 1.1rem;">add</span>
                        <span>${t('board_settings.btn_create_tag') || 'Créer'}</span>
                    </button>
                </div>
                <div id="settings-tag-create-msg" style="font-size: 0.82rem; min-height: 1.2em; margin-top: 6px;"></div>
            </div>

            <!-- Tags List -->
            <div id="settings-tags-list" class="settings-tags-list"></div>
        </div>
    `;
}

function renderAddMemberForm() {
    return `
        <div class="add-member-form" style="margin-top:1rem;">
            <select id="add-member-user-select" class="user-search-select">
                <option value="">${t('board_settings.add_member_placeholder')}</option>
            </select>
            <select id="add-member-role-select">
                <option value="reader">${t('board_settings.role_reader')}</option>
                <option value="editor">${t('board_settings.role_editor')}</option>
                <option value="board_admin">${t('board_settings.role_board_admin')}</option>
            </select>
            <button class="btn btn-primary" id="add-member-btn">
                <span class="material-symbols-outlined">person_add</span>
                ${t('board_settings.btn_add_member')}
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
                ${t('board_settings.danger_title')}
            </h3>
            <p style="font-size:0.85rem;color:var(--clr-text-muted);margin:0 0 1rem;">
                ${t('board_settings.danger_desc')}
            </p>
            <button class="btn btn-danger" id="delete-board-btn">
                <span class="material-symbols-outlined">delete_forever</span>
                ${t('board_settings.btn_delete_board')}
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
                        <option value="reader"      ${m.board_role === 'reader'      ? 'selected' : ''}>${t('board_settings.role_reader')}</option>
                        <option value="editor"      ${m.board_role === 'editor'      ? 'selected' : ''}>${t('board_settings.role_editor')}</option>
                        <option value="board_admin" ${m.board_role === 'board_admin' ? 'selected' : ''}>${t('board_settings.role_board_admin')}</option>
                    </select>
                    <button class="member-remove-btn" data-user-id="${m.id}" title="${t('board_settings.remove_member')}">
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
    let selectedIcon  = board?.icon  || getDefaultIconId();

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
                const settingsTitle = t('board_settings.title', { name }) || `Board Settings — ${name}`;
                if (pageTitle) pageTitle.textContent = settingsTitle;
                document.title = settingsTitle;

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
// Tags management section bindings
// --------------------------------------------------------------------------

function _bindTagsSection() {
    const listEl     = document.getElementById('settings-tags-list');
    const nameInput  = document.getElementById('settings-new-tag-name');
    const counterEl  = document.getElementById('settings-new-tag-counter');
    const colorInput = document.getElementById('settings-new-tag-color');
    const addBtn     = document.getElementById('settings-add-tag-btn');
    const msgEl      = document.getElementById('settings-tag-create-msg');

    if (!listEl) return;

    // Count tasks using a tag across all workflows
    function getTagUsageCount(tagName) {
        let count = 0;
        if (state.boardData?.workflows) {
            for (const wf of state.boardData.workflows) {
                if (Array.isArray(wf.tasks)) {
                    for (const task of wf.tasks) {
                        if (Array.isArray(task.tags) && task.tags.some(t => t.name.toLowerCase() === tagName.toLowerCase())) {
                            count++;
                        }
                    }
                }
            }
        }
        return count;
    }

    // Persist tags to SQLite and broadcast via Socket
    async function persistBoardTags() {
        saveData();
        try {
            await API.saveBoardData(state.currentBoardId, state.boardData);
        } catch (err) {
            Logger.warn('saveBoardData error during tag update', err);
        }
    }

    // Render list of tags
    function renderList() {
        const tags = state.boardData?.tags || [];
        if (tags.length === 0) {
            listEl.innerHTML = `
                <div style="padding: 1.5rem; text-align: center; color: var(--clr-text-muted); background: var(--clr-surface-2); border: 1px dashed var(--clr-border); border-radius: var(--border-radius-md, 8px); font-size: 0.88rem;">
                    <span class="material-symbols-outlined" style="font-size: 28px; opacity: 0.5; display: block; margin-bottom: 4px;">label_off</span>
                    ${t('board_settings.no_tags') || 'Aucune étiquette définie pour ce tableau.'}
                </div>
            `;
            return;
        }

        listEl.innerHTML = tags.map((tag, idx) => {
            const usageCount = getTagUsageCount(tag.name);
            const textColor = getContrastYIQ(tag.color || '#3b82f6');
            return `
                <div class="settings-tag-row" data-tag-index="${idx}" data-tag-name="${escHtml(tag.name)}">
                    <!-- Normal view -->
                    <div class="tag-row-view" style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px;">
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                            <span class="tag-pill" style="background-color: ${escHtml(tag.color)}; color: ${textColor};" title="${escHtml(tag.name)}">
                                ${escHtml(tag.name)}
                            </span>
                            <span class="tag-usage-badge" style="color: ${usageCount > 0 ? 'var(--clr-text-muted)' : 'var(--clr-text-subtle)'};">
                                ${usageCount > 0 ? t('board_settings.tag_used_in_tasks', { count: usageCount }) : (t('board_settings.tag_not_used') || 'Non utilisée')}
                            </span>
                        </div>
                        <div class="tag-row-actions">
                            <button type="button" class="tag-action-icon-btn tag-edit-btn" title="Modifier" aria-label="Modifier l'étiquette">
                                <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                            </button>
                            <button type="button" class="tag-action-icon-btn danger tag-delete-btn" title="Supprimer" aria-label="Supprimer l'étiquette">
                                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                            </button>
                        </div>
                    </div>

                    <!-- Edit view (hidden initially) -->
                    <div class="tag-row-edit" style="display: none; align-items: center; justify-content: space-between; width: 100%; gap: 8px;">
                        <div style="position: relative; flex: 1; min-width: 140px;">
                            <input type="text" class="form-input tag-edit-name-input" value="${escHtml(tag.name)}" maxlength="30" style="padding-right: 40px; font-size: 0.88rem; padding-top: 6px; padding-bottom: 6px;">
                            <span class="tag-edit-counter" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 0.7rem; color: var(--clr-text-muted); pointer-events: none; font-variant-numeric: tabular-nums;">${tag.name.length}/30</span>
                        </div>
                        <input type="color" class="color-input-small tag-edit-color-input" value="${escHtml(tag.color || '#3b82f6')}" title="Modifier la couleur" style="width: 34px; height: 34px; min-width: 34px; min-height: 34px;">
                        <div style="display: flex; gap: 4px;">
                            <button type="button" class="tag-action-icon-btn success tag-save-btn" title="Enregistrer" aria-label="Enregistrer">
                                <span class="material-symbols-outlined" style="font-size: 18px;">check</span>
                            </button>
                            <button type="button" class="tag-action-icon-btn tag-cancel-btn" title="Annuler" aria-label="Annuler">
                                <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Wire each row's edit and delete handlers
        listEl.querySelectorAll('.settings-tag-row').forEach(row => {
            const index = parseInt(row.dataset.tagIndex, 10);
            const tag = (state.boardData?.tags || [])[index];
            if (!tag) return;

            const viewContainer = row.querySelector('.tag-row-view');
            const editContainer = row.querySelector('.tag-row-edit');
            const editBtn       = row.querySelector('.tag-edit-btn');
            const deleteBtn     = row.querySelector('.tag-delete-btn');
            const saveBtn       = row.querySelector('.tag-save-btn');
            const cancelBtn     = row.querySelector('.tag-cancel-btn');
            const editNameInput = row.querySelector('.tag-edit-name-input');
            const editCounter   = row.querySelector('.tag-edit-counter');
            const editColorInput= row.querySelector('.tag-edit-color-input');

            // Switch to edit mode
            editBtn?.addEventListener('click', () => {
                viewContainer.style.display = 'none';
                editContainer.style.display = 'flex';
                editNameInput.focus();
                editNameInput.select();
            });

            // Cancel edit
            cancelBtn?.addEventListener('click', () => {
                editContainer.style.display = 'none';
                viewContainer.style.display = 'flex';
                editNameInput.value = tag.name;
                editColorInput.value = tag.color || '#3b82f6';
                if (editCounter) editCounter.textContent = `${tag.name.length}/30`;
            });

            // Live edit counter
            editNameInput?.addEventListener('input', () => {
                const len = editNameInput.value.length;
                if (editCounter) {
                    editCounter.textContent = `${len}/30`;
                    editCounter.style.color = len >= 30 ? '#ef4444' : (len >= 24 ? '#f59e0b' : 'var(--clr-text-muted)');
                }
            });

            // Save edit
            const handleSave = async () => {
                const newName = (editNameInput.value || '').trim().slice(0, 30);
                const newColor = editColorInput.value;
                if (!newName) {
                    alert(t('board_settings.tag_name_empty') || 'Le nom de l\'étiquette ne peut pas être vide.');
                    return;
                }

                // Check duplicate if name changed
                const isDuplicate = (state.boardData?.tags || []).some(
                    (t, i) => i !== index && t.name.toLowerCase() === newName.toLowerCase()
                );
                if (isDuplicate) {
                    alert(t('board_settings.tag_already_exists') || 'Une étiquette avec ce nom existe déjà.');
                    return;
                }

                const oldName = tag.name;
                tag.name = newName;
                tag.color = newColor;

                // Cascade update to all tasks across all workflows
                if (Array.isArray(state.boardData?.workflows)) {
                    for (const wf of state.boardData.workflows) {
                        if (Array.isArray(wf.tasks)) {
                            for (const task of wf.tasks) {
                                if (Array.isArray(task.tags)) {
                                    for (const taskTag of task.tags) {
                                        if (taskTag.name.toLowerCase() === oldName.toLowerCase()) {
                                            taskTag.name = newName;
                                            taskTag.color = newColor;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                await persistBoardTags();
                renderList();
            };

            saveBtn?.addEventListener('click', handleSave);
            editNameInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                } else if (e.key === 'Escape') {
                    cancelBtn?.click();
                }
            });

            // Delete tag
            deleteBtn?.addEventListener('click', () => {
                const usageCount = getTagUsageCount(tag.name);
                const confirmMsg = usageCount > 0
                    ? t('board_settings.confirm_delete_used_tag', { name: tag.name, count: usageCount })
                    : t('board_settings.confirm_delete_tag', { name: tag.name });

                showConfirm(confirmMsg, async () => {
                    const tagNameToRemove = tag.name;
                    // Remove from board tags
                    state.boardData.tags.splice(index, 1);

                    // Cascade remove from tasks if used
                    if (Array.isArray(state.boardData?.workflows)) {
                        for (const wf of state.boardData.workflows) {
                            if (Array.isArray(wf.tasks)) {
                                for (const task of wf.tasks) {
                                    if (Array.isArray(task.tags)) {
                                        task.tags = task.tags.filter(t => t.name.toLowerCase() !== tagNameToRemove.toLowerCase());
                                    }
                                }
                            }
                        }
                    }

                    await persistBoardTags();
                    renderList();
                });
            });
        });
    }

    // Input counter for create form
    nameInput?.addEventListener('input', () => {
        const len = nameInput.value.length;
        if (counterEl) {
            counterEl.textContent = `${len}/30`;
            counterEl.style.color = len >= 30 ? '#ef4444' : (len >= 24 ? '#f59e0b' : 'var(--clr-text-muted)');
        }
        if (msgEl) msgEl.textContent = '';
    });

    // Add Tag Handler
    const handleAdd = async () => {
        const name = (nameInput.value || '').trim().slice(0, 30);
        const color = colorInput.value;

        if (!name) {
            if (msgEl) {
                msgEl.textContent = t('board_settings.tag_name_empty') || 'Le nom ne peut pas être vide.';
                msgEl.style.color = 'var(--clr-danger)';
            }
            nameInput.focus();
            return;
        }

        if (!state.boardData) state.boardData = {};
        if (!Array.isArray(state.boardData.tags)) state.boardData.tags = [];

        if (state.boardData.tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
            if (msgEl) {
                msgEl.textContent = t('board_settings.tag_already_exists') || 'Cette étiquette existe déjà.';
                msgEl.style.color = 'var(--clr-danger)';
            }
            return;
        }

        state.boardData.tags.push({ name, color });
        await persistBoardTags();

        nameInput.value = '';
        if (counterEl) {
            counterEl.textContent = '0/30';
            counterEl.style.color = 'var(--clr-text-muted)';
        }
        if (msgEl) {
            msgEl.textContent = t('board_settings.tag_created') || 'Étiquette créée avec succès.';
            msgEl.style.color = 'var(--clr-success)';
            setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
        }

        renderList();
    };

    addBtn?.addEventListener('click', handleAdd);
    nameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    });

    // Initial list render
    renderList();
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
        case 'board_admin': return t('board_settings.role_board_admin');
        case 'editor':      return t('board_settings.role_editor');
        case 'reader':      return t('board_settings.role_reader');
        case 'owner':       return t('board_settings.role_owner');
        default:            return role || t('roles.user');
    }
}

function escHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

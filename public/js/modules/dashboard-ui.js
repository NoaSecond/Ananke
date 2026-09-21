/**
 * dashboard-ui.js — Ananke v3.0 (NEW)
 *
 * Responsabilité unique (S) : rendu et interactions de la vue Dashboard (liste des boards).
 */

import { state, getFullUrl } from './state.js';
import * as API from './api.js';
import { Logger } from './utils.js';
import { renderAvatarHtml } from './avatar.js';
import { t } from './i18n.js';
import { BOARD_ICONS, loadBoardIcons, renderBoardIconHtml, renderIconSwatchesHtml, getDefaultIconId } from './board-icons.js';

export { BOARD_ICONS, loadBoardIcons, renderBoardIconHtml, renderIconSwatchesHtml, getDefaultIconId };

export const BOARD_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#f59e0b', '#22c55e', '#14b8a6',
    '#3b82f6', '#06b6d4',
];

let _onBoardSelect   = null;
let _onBoardCreated  = null;
let _onBoardSettings = null;

/**
 * Initialize the dashboard view.
 * @param {{ onBoardSelect: (boardId: string) => void, onBoardCreated?: (board: object) => void, onBoardSettings?: (boardId: string) => void }} options
 */
export function initDashboard({ onBoardSelect, onBoardCreated, onBoardSettings }) {
    _onBoardSelect   = onBoardSelect;
    _onBoardCreated  = onBoardCreated;
    _onBoardSettings = onBoardSettings;
    _bindCreateModal();
}

/**
 * Render the dashboard with the current list of boards.
 */
export function renderDashboard() {
    const container = document.getElementById('view-dashboard');
    if (!container) return;

    const { currentUser, boards } = state;
    const canCreate = currentUser && ['admin', 'owner'].includes(currentUser.role);

    const firstName = currentUser?.first_name || currentUser?.name?.split(' ')[0] || 'there';
    const greeting = t(`dashboard.${getGreetingKey()}`, { name: escHtml(firstName) });
    const boardsSubtitle = t('dashboard.boards_count', { count: boards.length });

    container.innerHTML = `
        <div class="dashboard-greeting">
            <h2>${greeting}</h2>
            <p>${boardsSubtitle}</p>
        </div>

        <div class="dashboard-section-header">
            <div class="dashboard-section-title">
                <span class="material-symbols-outlined">view_kanban</span>
                ${t('dashboard.my_boards')}
            </div>
        </div>

        <div class="boards-grid" id="boards-grid">
            ${boards.map(b => renderBoardCard(b)).join('')}
            ${canCreate ? renderAddCard() : ''}
        </div>
    `;

    // Bind card clicks
    container.querySelectorAll('.board-card[data-board-id]').forEach(card => {
        card.addEventListener('click', () => {
            const boardId = card.dataset.boardId;
            if (boardId && _onBoardSelect) _onBoardSelect(boardId);
        });
    });

    // Bind settings buttons on cards
    container.querySelectorAll('.board-card-settings-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const boardId = btn.dataset.boardId;
            if (boardId && _onBoardSettings) _onBoardSettings(boardId);
        });
    });

    // Bind add board button
    const addCard = container.querySelector('.board-card-add');
    if (addCard) {
        addCard.addEventListener('click', () => openCreateBoardModal());
    }
}

export function updateDashboardPresence() {
    const container = document.getElementById('view-dashboard');
    if (!container || state.currentView !== 'dashboard') return;

    const cards = container.querySelectorAll('.board-card[data-board-id]');
    cards.forEach(card => {
        const boardId = card.dataset.boardId;
        const avatarsContainer = card.querySelector('.board-card-avatars');
        if (avatarsContainer) {
            const activeUsers = (state.boardPresence && state.boardPresence[boardId]) || [];
            avatarsContainer.outerHTML = renderActiveBoardUsers(activeUsers);
        }
    });
}

// --------------------------------------------------------------------------
// Private helpers
// --------------------------------------------------------------------------

function renderBoardCard(board) {
    const taskCount = countTasks(board);
    const activeUsers = (state.boardPresence && state.boardPresence[board.id]) || [];
    const descText = escHtml(board.description || t('dashboard.no_desc'));
    const tasksText = t('dashboard.tasks_count', { count: taskCount });

    return `
        <div class="board-card" data-board-id="${escHtml(board.id)}" style="--board-accent: ${escHtml(board.color || '#6366f1')}">
            <div class="board-card-header">
                <div class="board-card-icon" style="background:${escHtml(board.color || '#6366f1')}">
                    ${renderBoardIconHtml(board.icon || 'dashboard')}
                </div>
                <div class="board-card-title">${escHtml(board.name)}</div>
                <button class="board-card-settings-btn" data-board-id="${escHtml(board.id)}" title="${t('dashboard.settings_tooltip')}" aria-label="${t('dashboard.settings_tooltip')}">
                    <span class="material-symbols-outlined">settings</span>
                </button>
            </div>
            <div class="board-card-desc">${descText}</div>
            <div class="board-card-meta">
                ${renderActiveBoardUsers(activeUsers)}
                <span class="board-card-tasks-count">
                    <span class="material-symbols-outlined">task_alt</span>
                    ${tasksText}
                </span>
            </div>
        </div>
    `;
}

export function renderActiveBoardUsers(activeUsers) {
    if (!activeUsers || activeUsers.length === 0) {
        return `<div class="board-card-avatars"></div>`;
    }

    const MAX_SHOWN = 4;
    const shown = activeUsers.slice(0, MAX_SHOWN);
    const extraCount = activeUsers.length - MAX_SHOWN;
    const onBoardText = t('dashboard.on_board');

    return `
        <div class="board-card-avatars">
            ${shown.map(u => {
                const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.name || u.email || 'User';
                return renderAvatarHtml(u, {
                    className: 'board-card-avatar',
                    title: `${fullName} (${onBoardText})`,
                    style: 'width:26px;height:26px;font-size:11px;border-radius:50%;'
                });
            }).join('')}
            ${extraCount > 0 ? `<div class="board-card-avatar board-card-avatar-more" title="${t('dashboard.more_users', { count: extraCount })}">+${extraCount}</div>` : ''}
        </div>
    `;
}

function renderAddCard() {
    return `
        <div class="board-card-add" id="add-board-card" role="button" tabindex="0" aria-label="${t('dashboard.create_board')}">
            <span class="material-symbols-outlined">add_circle</span>
            <span>${t('dashboard.create_board')}</span>
        </div>
    `;
}

function countTasks(board) {
    try {
        const data = board.data || board._data;
        if (!data?.workflows) return 0;
        return data.workflows.reduce((acc, wf) => acc + (wf.tasks?.length || 0), 0);
    } catch { return 0; }
}

function formatRole(role) {
    switch (role) {
        case 'board_admin': return t('board_settings.role_board_admin');
        case 'editor':      return t('board_settings.role_editor');
        case 'reader':      return t('board_settings.role_reader');
        case 'owner':       return t('board_settings.role_owner');
        default:            return role || t('roles.user');
    }
}

function getGreetingKey() {
    const h = new Date().getHours();
    if (h < 12) return 'greeting_morning';
    if (h < 18) return 'greeting_afternoon';
    return 'greeting_evening';
}

function escHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --------------------------------------------------------------------------
// Create board modal
// --------------------------------------------------------------------------

let selectedColor = BOARD_COLORS[0];
let selectedIcon  = getDefaultIconId();

function _bindCreateModal() {
    const modal   = document.getElementById('create-board-modal');
    const form    = document.getElementById('create-board-form');
    const closeBtn = document.getElementById('create-board-close');

    if (!modal || !form) return;

    if (closeBtn) {
        closeBtn.onclick = () => modal.classList.remove('visible');
    }

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('visible'); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name        = document.getElementById('board-name-input')?.value?.trim();
        const description = document.getElementById('board-desc-input')?.value?.trim();
        const msgEl       = document.getElementById('create-board-message');

        if (!name) {
            if (msgEl) msgEl.textContent = 'Board name is required.';
            return;
        }

        try {
            const res = await API.createBoard({ name, description, color: selectedColor, icon: selectedIcon });
            if (res.board) {
                state.boards.push(res.board);
                modal.classList.remove('visible');
                form.reset();
                renderDashboard();
                if (_onBoardCreated) _onBoardCreated(res.board);
                Logger.success(`Board "${name}" created.`);
            } else {
                if (msgEl) msgEl.textContent = res.error || 'Creation failed.';
            }
        } catch (err) {
            Logger.error('Create board error', err);
            if (msgEl) msgEl.textContent = 'Network error.';
        }
    });
}

export async function openCreateBoardModal() {
    const modal = document.getElementById('create-board-modal');
    if (!modal) return;
    await loadBoardIcons();
    selectedColor = BOARD_COLORS[0];
    selectedIcon  = getDefaultIconId();

    // Render color swatches
    const colorRow = document.getElementById('board-color-swatches');
    if (colorRow) {
        colorRow.innerHTML = BOARD_COLORS.map(c => `
            <div class="color-swatch${c === selectedColor ? ' selected' : ''}"
                 style="background:${c}" data-color="${c}" title="${c}"></div>
        `).join('');
        colorRow.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                colorRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                selectedColor = swatch.dataset.color;
            });
        });
    }

    // Render icon swatches
    const iconRow = document.getElementById('board-icon-swatches');
    if (iconRow) {
        iconRow.innerHTML = renderIconSwatchesHtml(selectedIcon);
        iconRow.querySelectorAll('.icon-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                iconRow.querySelectorAll('.icon-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                selectedIcon = swatch.dataset.icon;
            });
        });
    }

    const msgEl = document.getElementById('create-board-message');
    if (msgEl) msgEl.textContent = '';

    const form = document.getElementById('create-board-form');
    if (form) form.reset();

    modal.classList.add('visible');
}

/**
 * dashboard-ui.js — Ananke v3.0 (NEW)
 *
 * Responsabilité unique (S) : rendu et interactions de la vue Dashboard (liste des boards).
 */

import { state, getFullUrl } from './state.js';
import * as API from './api.js';
import { Logger } from './utils.js';
import { renderAvatarHtml } from './avatar.js';

export const BOARD_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#f59e0b', '#22c55e', '#14b8a6',
    '#3b82f6', '#06b6d4',
];

export const BOARD_ICONS = [
    'dashboard', 'view_kanban', 'task', 'rocket_launch',
    'engineering', 'design_services', 'bug_report', 'code',
    'campaign', 'support', 'inventory', 'science',
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

    container.innerHTML = `
        <div class="dashboard-greeting">
            <h2>Good ${getGreeting()}, ${escHtml(firstName)} 👋</h2>
            <p>${boards.length} board${boards.length !== 1 ? 's' : ''} accessible to you</p>
        </div>

        <div class="dashboard-section-header">
            <div class="dashboard-section-title">
                <span class="material-symbols-outlined">view_kanban</span>
                My Boards
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

// --------------------------------------------------------------------------
// Private helpers
// --------------------------------------------------------------------------

function renderBoardCard(board) {
    const taskCount = countTasks(board);

    return `
        <div class="board-card" data-board-id="${escHtml(board.id)}" style="--board-accent: ${escHtml(board.color || '#6366f1')}">
            <div class="board-card-header">
                <div class="board-card-icon" style="background:${escHtml(board.color || '#6366f1')}">
                    <span class="material-symbols-outlined">${escHtml(board.icon || 'dashboard')}</span>
                </div>
                <div class="board-card-title">${escHtml(board.name)}</div>
                <button class="board-card-settings-btn" data-board-id="${escHtml(board.id)}" title="Board Settings" aria-label="Board Settings">
                    <span class="material-symbols-outlined">settings</span>
                </button>
            </div>
            <div class="board-card-desc">${escHtml(board.description || 'No description')}</div>
            <div class="board-card-meta">
                ${renderBoardMembers(board.members)}
                <span class="board-card-tasks-count">
                    <span class="material-symbols-outlined">task_alt</span>
                    ${taskCount} task${taskCount !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    `;
}

function renderBoardMembers(members) {
    const list = (members && members.length > 0)
        ? members
        : (state.currentUser ? [state.currentUser] : []);

    if (list.length === 0) {
        return `<span class="board-card-no-members" style="font-size:0.75rem;color:var(--clr-text-subtle);">No members</span>`;
    }

    const MAX_SHOWN = 4;
    const shown = list.slice(0, MAX_SHOWN);
    const extraCount = list.length - MAX_SHOWN;

    return `
        <div class="board-card-avatars">
            ${shown.map(m => {
                const roleName = formatRole(m.board_role || m.role);
                const fullName = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.name || m.email || 'Member';
                return renderAvatarHtml(m, {
                    className: 'board-card-avatar',
                    title: `${fullName} (${roleName})`,
                    style: 'width:26px;height:26px;font-size:11px;border-radius:50%;'
                });
            }).join('')}
            ${extraCount > 0 ? `<div class="board-card-avatar board-card-avatar-more" title="${extraCount} more members">+${extraCount}</div>` : ''}
        </div>
    `;
}

function renderAddCard() {
    return `
        <div class="board-card-add" id="add-board-card" role="button" tabindex="0" aria-label="Create new board">
            <span class="material-symbols-outlined">add_circle</span>
            <span>Create a new board</span>
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
        case 'board_admin': return 'Admin';
        case 'editor':      return 'Editor';
        case 'reader':      return 'Viewer';
        default:            return role || 'Member';
    }
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'evening';
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
let selectedIcon  = BOARD_ICONS[0];

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

export function openCreateBoardModal() {
    const modal = document.getElementById('create-board-modal');
    if (!modal) return;
    selectedColor = BOARD_COLORS[0];
    selectedIcon  = BOARD_ICONS[0];

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
        iconRow.innerHTML = BOARD_ICONS.map(ic => `
            <div class="icon-swatch${ic === selectedIcon ? ' selected' : ''}" data-icon="${ic}" title="${ic}">
                <span class="material-symbols-outlined">${ic}</span>
            </div>
        `).join('');
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

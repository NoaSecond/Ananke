/**
 * app.js — Ananke v3.0
 *
 * Responsabilité unique (S) : orchestrateur frontend — routing SPA, initialisation socket,
 * coordination entre les vues. Aucune logique UI directe ici.
 */

import { Logger } from './modules/utils.js';
import { createAvatarElement, cacheUsers } from './modules/avatar.js';
import { state, API_URL, basePath, getFullUrl } from './modules/state.js';
import { initModals, showConfirm } from './modules/modals.js';
import { initAuth, handleUnauthorized, updateUserUI, openSetupModal, toggleSettingsMenu, setProfileNavigateHandler } from './modules/auth-ui.js';
import { initBoardListeners, renderBoard } from './modules/board-ui.js';
import { initTaskListeners, refreshTaskView } from './modules/task-ui.js';
import { initWorkflowListeners } from './modules/workflow-ui.js';
import { initUserManagement } from './modules/user-ui.js';
import { initThemeListeners, applyBackground } from './modules/theme-ui.js';
import { initSearch } from './modules/search-ui.js';
import { initDashboard, renderDashboard, openCreateBoardModal, updateDashboardPresence } from './modules/dashboard-ui.js';
import { initBoardSettings, renderBoardSettings } from './modules/board-settings-ui.js';
import { renderProfileView } from './modules/profile-ui.js';
import { renderAppSettingsView } from './modules/app-settings-ui.js';
import { initI18n, setLanguage, getLanguage, registerLanguageListener, t, translateDOM } from './modules/i18n.js';
import { renderBoardIconHtml, loadBoardIcons } from './modules/board-icons.js';
import * as API from './modules/api.js';

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    Logger.info('🚀 Ananke v3.0 started');

    // Core init
    initModals();
    initBoardListeners();
    initTaskListeners();
    initWorkflowListeners();
    initUserManagement();
    initThemeListeners();
    initSearch();

    initDashboard({
        onBoardSelect:   navigateToBoard,
        onBoardCreated:  renderSidebarBoards,
        onBoardSettings: navigateToBoardSettings,
    });
    initBoardSettings({
        onBack: () => {
            if (previousBoardSettingsView === 'dashboard') {
                navigateToDashboard();
            } else {
                navigateToBoard(state.currentBoardId);
            }
        },
        onDeleted: navigateToDashboard,
        onUpdated: () => renderSidebarBoards(),
    });

    initTheme();
    loadBoardIcons();
    setupLanguageControls();
    initSidebar();
    initAuth(initSocket);
    setProfileNavigateHandler(navigateToProfile);

    // Board settings button in header (.settings-container / #settings-toggle-btn)
    const openBoardSettings = (e) => {
        e?.stopPropagation();
        if (state.currentBoardId) navigateToBoardSettings(state.currentBoardId);
    };
    document.getElementById('settings-toggle-btn')?.addEventListener('click', openBoardSettings);

    // Server logs modal
    const openLogsModal = async () => {
        const modal = document.getElementById('logs-modal');
        if (!modal) return;

        // Open modal immediately so the UI is responsive
        modal.classList.add('visible');

        const container = document.getElementById('logs-container');
        const badge = document.getElementById('logs-count-badge');
        if (badge) badge.textContent = '';

        // Display throbber immediately
        if (container) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 260px; gap: 14px; color: #94a3b8;">
                    <div class="spinner"></div>
                    <span style="font-size: 0.85rem;">Chargement des logs en arrière-plan...</span>
                </div>
            `;
        }

        try {
            const logs = await API.getLogs();

            // If the user closed the modal in the meantime, do not render
            if (!modal.classList.contains('visible')) return;

            if (container) {
                if (!Array.isArray(logs) || logs.length === 0) {
                    container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 2rem;">Aucun log disponible.</div>`;
                    return;
                }

                const colorMap = {
                    INFO: '#4fc1ff', ERROR: '#f44336', WARN: '#ff9800',
                    SUCCESS: '#4caf50', SOCKET: '#d32f2f', HTTP: '#00bcd4',
                };

                // Build HTML once without repeated DOM reflows
                const html = logs.map(entry => {
                    const color = colorMap[entry.type] || '#fff';
                    return `<div><span style="color:gray">[${entry.timestamp}]</span> <span style="color:${color};font-weight:bold">${entry.type}:</span> <span style="color:#d4d4d4">${escHtml(entry.message)}</span></div>`;
                }).join('');

                container.innerHTML = html;
                container.scrollTop = container.scrollHeight;

                if (badge) badge.textContent = `${logs.length} logs`;
            }
        } catch (err) {
            Logger.error('Failed to load logs', err);
            if (container && modal.classList.contains('visible')) {
                container.innerHTML = `<div style="color: #f44336; padding: 1.5rem; text-align: center;">Erreur lors du chargement des logs.</div>`;
            }
        }
    };
    document.getElementById('server-logs-btn')?.addEventListener('click', openLogsModal);
    document.getElementById('sidebar-logs-btn')?.addEventListener('click', openLogsModal);

    document.getElementById('clear-logs-btn')?.addEventListener('click', () => {
        const container = document.getElementById('logs-container');
        if (container) container.innerHTML = '';
        const badge = document.getElementById('logs-count-badge');
        if (badge) badge.textContent = '0 logs';
    });

    document.getElementById('purge-logs-btn')?.addEventListener('click', () => {
        const confirmMsg = t('modal.confirm_purge_logs') || 'Êtes-vous sûr de vouloir vider définitivement le fichier log du serveur ?';
        showConfirm(confirmMsg, async () => {
            try {
                await API.clearServerLogs();
                const container = document.getElementById('logs-container');
                if (container) {
                    container.innerHTML = `<div style="color: #4caf50; padding: 1rem; text-align: center; font-style: italic;">${t('modal.logs_purged') || 'Le fichier de logs a été vidé avec succès.'}</div>`;
                }
                const badge = document.getElementById('logs-count-badge');
                if (badge) badge.textContent = '0 logs';
            } catch (err) {
                Logger.error('Failed to purge server logs', err);
                alert(err.message || 'Échec lors de la suppression des logs.');
            }
        });
    });

    // Session check on tab focus
    const verifySession = () => {
        if (state.currentUser) {
            API.getMe().catch(() => {
                Logger.warn('Session invalid on focus — redirecting to login');
                handleUnauthorized();
            });
        }
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') verifySession();
    });
    window.addEventListener('focus', verifySession);
});

// --------------------------------------------------------------------------
// SPA Router
// --------------------------------------------------------------------------

/**
 * Navigate to a specific board's kanban view.
 * @param {string} boardId
 */
export async function navigateToBoard(boardId) {
    state.currentBoardId = boardId;
    state.currentView    = 'board';

    showView('board');
    updateSidebarActiveBoard(boardId);

    // Auto-collapse sidebar in board view to maximize kanban board space
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.add('collapsed');
        sidebar.classList.remove('mobile-open');
    }

    // Set header title immediately from state.boards to prevent lag/flicker
    const existingBoard = state.boards.find(b => b.id === boardId);
    const initialTitle = existingBoard?.name || 'Board';
    const headerTitle = document.getElementById('board-title-display');
    if (headerTitle) headerTitle.textContent = initialTitle;
    document.title = initialTitle;

    // Ask socket to join this board's room
    if (state.socket) {
        state.socket.emit('joinBoard', boardId);
    }

    try {
        const [boardRes, membersRes] = await Promise.allSettled([
            API.getBoard(boardId),
            API.getBoardMembers(boardId)
        ]);

        if (membersRes.status === 'fulfilled' && membersRes.value?.members) {
            state.boardMembers = membersRes.value.members;
            cacheUsers(state.boardMembers);
        }

        if (boardRes.status === 'fulfilled' && boardRes.value?.board) {
            const board = boardRes.value.board;
            if (existingBoard) {
                existingBoard.name = board.name;
                existingBoard.description = board.description;
                existingBoard.color = board.color;
                existingBoard.icon = board.icon;
            }
            if (board.data) {
                state.boardData = board.data;
                applyBackground(state.boardData.background);
                renderBoard();
            }

            const finalTitle = board.name || initialTitle;
            if (headerTitle) headerTitle.textContent = finalTitle;
            document.title = finalTitle;
        }
    } catch (err) {
        Logger.error('Failed to load board', err);
    }

    // Update board header visibility
    const boardHeader = document.getElementById('board-header');
    if (boardHeader) boardHeader.style.display = 'flex';
    const dashboardHeader = document.getElementById('dashboard-header');
    if (dashboardHeader) dashboardHeader.style.display = 'none';
    updateBoardHeaderPresence();
}

/**
 * Navigate to the dashboard.
 */
export async function navigateToDashboard() {
    state.currentView    = 'dashboard';
    document.title       = t('nav.dashboard') || 'Tableau de bord';

    // Leave any active board on socket
    if (state.socket && state.currentBoardId) {
        state.socket.emit('leaveBoard');
    }
    state.currentBoardId = null;

    showView('dashboard');
    updateSidebarActiveBoard(null);
    applyBackground(null);

    // Re-expand sidebar on dashboard and close mobile overlay
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.remove('collapsed');
        sidebar.classList.remove('mobile-open');
    }

    try {
        const { boards } = await API.getBoards();
        state.boards = boards;
        renderDashboard();
        renderSidebarBoards();
    } catch (err) {
        Logger.error('Failed to load boards', err);
    }

    // Hide board header on dashboard, show dashboard mobile header
    const boardHeader = document.getElementById('board-header');
    if (boardHeader) boardHeader.style.display = 'none';

    const dashboardHeader = document.getElementById('dashboard-header');
    if (dashboardHeader) dashboardHeader.style.display = '';
}

let previousBoardSettingsView = 'dashboard';

/**
 * Navigate to board settings.
 * @param {string} boardId
 */
export async function navigateToBoardSettings(boardId) {
    previousBoardSettingsView = state.currentView || 'dashboard';
    state.currentBoardId = boardId;
    state.currentView    = 'board-settings';

    const board = state.boards.find(b => b.id === boardId);
    const bName = board?.name || 'Board';
    document.title = t('board_settings.title', { name: bName }) || `Paramètres — ${bName}`;

    showView('board-settings');
    updateSidebarActiveBoard(boardId);
    applyBackground(null);

    // Auto-collapse sidebar in board settings
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.add('collapsed');
        sidebar.classList.remove('mobile-open');
    }

    // Hide board header on settings
    const boardHeader = document.getElementById('board-header');
    if (boardHeader) boardHeader.style.display = 'none';

    try {
        const { members } = await API.getBoardMembers(boardId);
        state.boardMembers = members;
    } catch { state.boardMembers = []; }

    await renderBoardSettings();
}

/**
 * Navigate to user profile settings (full-page view).
 */
let previousView = 'dashboard';

export async function navigateToProfile() {
    previousView = state.currentView || 'dashboard';
    state.currentView = 'profile';
    document.title = t('profile.title') || 'Profil Utilisateur';

    if (state.socket && state.currentBoardId && previousView === 'board') {
        state.socket.emit('leaveBoard');
    }

    showView('profile');
    updateSidebarActiveBoard(null);
    applyBackground(null);

    // Auto-collapse sidebar in profile view
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.add('collapsed');
        sidebar.classList.remove('mobile-open');
    }

    // Hide board header on profile
    const boardHeader = document.getElementById('board-header');
    if (boardHeader) boardHeader.style.display = 'none';

    await renderProfileView({
        onBack: () => {
            if (previousView === 'board' && state.currentBoardId) {
                navigateToBoard(state.currentBoardId);
            } else if (previousView === 'board-settings' && state.currentBoardId) {
                navigateToBoardSettings(state.currentBoardId);
            } else {
                navigateToDashboard();
            }
        }
    });
}

/**
 * Navigate to Application settings (full-page view: users, language, theme).
 */
let previousAppSettingsView = 'dashboard';

export async function navigateToAppSettings() {
    previousAppSettingsView = state.currentView || 'dashboard';
    state.currentView = 'app-settings';
    document.title = t('settings.page_title') || 'Paramètres';

    if (state.socket && state.currentBoardId && previousAppSettingsView === 'board') {
        state.socket.emit('leaveBoard');
    }

    showView('app-settings');
    updateSidebarActiveBoard(null);
    applyBackground(null);

    // Auto-collapse sidebar in app settings view
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.add('collapsed');
        sidebar.classList.remove('mobile-open');
    }

    // Hide board header on settings
    const boardHeader = document.getElementById('board-header');
    if (boardHeader) boardHeader.style.display = 'none';

    await renderAppSettingsView({
        onBack: () => {
            if (previousAppSettingsView === 'board' && state.currentBoardId) {
                navigateToBoard(state.currentBoardId);
            } else if (previousAppSettingsView === 'board-settings' && state.currentBoardId) {
                navigateToBoardSettings(state.currentBoardId);
            } else if (previousAppSettingsView === 'profile') {
                navigateToProfile();
            } else {
                navigateToDashboard();
            }
        }
    });
}

/**
 * Show one view, hide others.
 * @param {'dashboard'|'board'|'board-settings'|'profile'|'app-settings'} view
 */
function showView(view) {
    document.getElementById('view-dashboard')?.classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('kanban-board')?.classList.toggle('hidden', view !== 'board');
    document.getElementById('view-board-settings')?.classList.toggle('hidden', view !== 'board-settings');
    document.getElementById('view-profile')?.classList.toggle('hidden', view !== 'profile');
    document.getElementById('view-app-settings')?.classList.toggle('hidden', view !== 'app-settings');
    document.getElementById('nav-dashboard')?.classList.toggle('active', view === 'dashboard');
    document.getElementById('sidebar-settings-btn')?.classList.toggle('active', view === 'app-settings');

    const boardHeader = document.getElementById('board-header');
    if (boardHeader) boardHeader.style.display = view === 'board' ? 'flex' : 'none';

    const dashboardHeader = document.getElementById('dashboard-header');
    if (dashboardHeader) dashboardHeader.style.display = view === 'dashboard' ? '' : 'none';
}

// --------------------------------------------------------------------------
// Sidebar
// --------------------------------------------------------------------------

function initSidebar() {
    // Mobile toggle (board & dashboard)
    const mobileToggle     = document.getElementById('sidebar-toggle-mobile');
    const dashMobileToggle = document.getElementById('dashboard-sidebar-toggle-mobile');
    const overlay          = document.getElementById('sidebar-overlay');
    const sidebar          = document.getElementById('sidebar');

    const toggleSidebar = () => sidebar?.classList.toggle('mobile-open');

    mobileToggle?.addEventListener('click', toggleSidebar);
    dashMobileToggle?.addEventListener('click', toggleSidebar);
    overlay?.addEventListener('click', () => sidebar?.classList.remove('mobile-open'));

    // Dashboard link
    document.getElementById('nav-dashboard')?.addEventListener('click', navigateToDashboard);

    // Sidebar settings button -> opens full-page settings view
    document.getElementById('sidebar-settings-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToAppSettings();
    });

    // User profile in sidebar -> opens full-page profile view
    document.getElementById('sidebar-user')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToProfile();
    });
}

/**
 * Populate the sidebar board list.
 */
export function renderSidebarBoards() {
    const container = document.getElementById('sidebar-boards');
    if (!container) return;

    container.innerHTML = '';

    state.boards.forEach(board => {
        const item = document.createElement('button');
        item.className = 'sidebar-item';
        item.dataset.boardId = board.id;
        if (board.id === state.currentBoardId) item.classList.add('active');

        item.innerHTML = `
            ${renderBoardIconHtml(board.icon || 'dashboard')}
            <span class="sidebar-item-label">${escHtml(board.name)}</span>
        `;
        item.style.setProperty('--board-accent', board.color || 'var(--clr-primary)');
        item.addEventListener('click', () => navigateToBoard(board.id));
        container.appendChild(item);
    });

    // Add board button (admin/owner only)
    if (state.currentUser && ['admin', 'owner'].includes(state.currentUser.role)) {
        const addBtn = document.createElement('button');
        addBtn.className = 'sidebar-add-board';
        addBtn.innerHTML = `<span class="material-symbols-outlined">add</span><span>New board</span>`;
        addBtn.addEventListener('click', openCreateBoardModal);
        container.appendChild(addBtn);
    }
}

function updateSidebarActiveBoard(boardId) {
    document.getElementById('nav-dashboard')?.classList.toggle('active', state.currentView === 'dashboard');
    document.querySelectorAll('#sidebar-boards .sidebar-item[data-board-id]').forEach(el => {
        el.classList.toggle('active', Boolean(boardId) && el.dataset.boardId === boardId);
    });
}

// --------------------------------------------------------------------------
// Socket.io
// --------------------------------------------------------------------------

async function initSocket() {
    if (state.socket) return;

    state.socket = io({ path: basePath + '/socket.io' });

    state.socket.on('connect_error', (err) => {
        if (err?.message?.toLowerCase().includes('auth')) {
            Logger.warn('Socket auth error — redirecting to login');
            handleUnauthorized();
        }
    });

    // Re-verify session and re-join board after reconnect
    state.socket.io?.on('reconnect', async () => {
        try {
            const data = await API.getMe();
            state.currentUser = data.user;
            updateUserUI();
            if (state.currentBoardId) {
                state.socket.emit('joinBoard', state.currentBoardId);
            }
        } catch {
            Logger.warn('Session expired on reconnect');
            handleUnauthorized();
        }
    });

    state.socket.on('connect', () => Logger.info('🔌 Connected to server'));

    // Board update — only received for the room we joined
    state.socket.on('boardUpdate', (data) => {
        if (!state.isDraggingInternal && state.currentView === 'board') {
            const boardData = (data && data.data) ? data.data : data;
            state.boardData = boardData;
            applyBackground(state.boardData.background);
            renderBoard();
            refreshTaskView();
        }
    });

    state.socket.on('serverLog', appendLog);

    state.socket.on('boardPresence', (presenceMap) => {
        state.boardPresence = presenceMap || {};
        if (state.currentView === 'dashboard') {
            updateDashboardPresence();
        } else if (state.currentView === 'board' && state.currentBoardId) {
            updateBoardHeaderPresence();
        }
    });

    state.socket.on('onlineUsers', (users) => {
        cacheUsers(users);
        if (state.currentView === 'board' && state.currentBoardId) {
            updateBoardHeaderPresence();
        }
    });

    // Load boards and navigate to dashboard on first connect
    try {
        const { boards } = await API.getBoards();
        state.boards = boards;
        boards?.forEach(b => { if (b.members) cacheUsers(b.members); });
        API.getSimpleList().then(res => { if (res?.users) cacheUsers(res.users); }).catch(() => {});
        renderSidebarBoards();
        navigateToDashboard();
    } catch (err) {
        Logger.error('Failed to load initial boards', err);
        navigateToDashboard();
    }
}

function updateBoardHeaderPresence() {
    const container = document.getElementById('online-users-container');
    if (!container) return;
    container.innerHTML = '';
    const activeUsers = (state.boardPresence && state.currentBoardId && state.boardPresence[state.currentBoardId]) || [];
    activeUsers.forEach(user => {
        const el = createAvatarElement(user, {
            className: 'online-user-avatar',
            title: `${user.name || 'User'}${user.role ? ` (${user.role})` : ''}`
        });
        container.appendChild(el);
    });
}

// --------------------------------------------------------------------------
// Logs
// --------------------------------------------------------------------------

function appendLog(logEntry) {
    const modal = document.getElementById('logs-modal');
    if (!modal || !modal.classList.contains('visible')) return;

    const container = document.getElementById('logs-container');
    if (!container) return;

    if (container.querySelector('.spinner')) {
        container.innerHTML = '';
    }

    const colorMap = {
        INFO: '#4fc1ff', ERROR: '#f44336', WARN: '#ff9800',
        SUCCESS: '#4caf50', SOCKET: '#d32f2f', HTTP: '#00bcd4',
    };
    const color = colorMap[logEntry.type] || '#fff';
    const line  = document.createElement('div');
    line.innerHTML = `<span style="color:gray">[${logEntry.timestamp}]</span> <span style="color:${color};font-weight:bold">${logEntry.type}:</span> <span style="color:#d4d4d4">${escHtml(logEntry.message)}</span>`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
}


// --------------------------------------------------------------------------
// Theme
// --------------------------------------------------------------------------

function initTheme() {
    const storedTheme = localStorage.getItem('theme');
    const applyTheme  = (isDark) => {
        document.body.classList.toggle('dark-mode', isDark);
        document.body.classList.toggle('light-mode', !isDark);
        const icon = document.querySelector('.theme-icon');
        const text = document.getElementById('theme-text');
        if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        if (text) text.textContent = t(isDark ? 'settings.theme_light' : 'settings.theme_dark');
    };
    applyTheme(storedTheme !== 'light');

    document.getElementById('theme-toggle-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isDark = document.body.classList.toggle('dark-mode');
        document.body.classList.toggle('light-mode', !isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        applyTheme(isDark);
    });
}

// --------------------------------------------------------------------------
// Language
// --------------------------------------------------------------------------

async function setupLanguageControls() {
    // Re-render current view and dynamic elements when language changes
    registerLanguageListener(() => {
        if (state.currentView === 'dashboard') {
            document.title = t('nav.dashboard') || 'Tableau de bord';
            renderDashboard();
        } else if (state.currentView === 'board') {
            const currentBoard = state.boards.find(b => b.id === state.currentBoardId);
            if (currentBoard?.name) document.title = currentBoard.name;
            renderBoard();
        } else if (state.currentView === 'board-settings') {
            const board = state.boards.find(b => b.id === state.currentBoardId);
            const bName = board?.name || 'Board';
            document.title = t('board_settings.title', { name: bName }) || `Paramètres — ${bName}`;
            renderBoardSettings();
        } else if (state.currentView === 'profile') {
            document.title = t('profile.title') || 'Profil Utilisateur';
            renderProfileView();
        } else if (state.currentView === 'app-settings') {
            document.title = t('settings.page_title') || 'Paramètres';
            renderAppSettingsView();
        }

        // Update theme toggle text in popup
        const text = document.getElementById('theme-text');
        if (text) {
            const isDark = document.body.classList.contains('dark-mode');
            text.textContent = t(isDark ? 'settings.theme_light' : 'settings.theme_dark');
        }
    });

    await initI18n();

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await setLanguage(btn.dataset.lang);
        });
    });

    document.getElementById('language-toggle-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await setLanguage(getLanguage() === 'en' ? 'fr' : 'en');
    });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function escHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
import { Logger } from './modules/utils.js';
import { state, API_URL, basePath } from './modules/state.js';
import { elements } from './modules/dom.js';
import { initModals } from './modules/modals.js';
import { initAuth } from './modules/auth-ui.js';
import { initBoardListeners, renderBoard } from './modules/board-ui.js';
import { initTaskListeners, refreshTaskView } from './modules/task-ui.js';
import { initWorkflowListeners } from './modules/workflow-ui.js';
import { initUserManagement } from './modules/user-ui.js';
import * as API from './modules/api.js';
import { initThemeListeners, applyBackground } from './modules/theme-ui.js';
import { initSearch } from './modules/search-ui.js';

document.addEventListener('DOMContentLoaded', () => {
    Logger.info('🚀 Ananke application started');

    // Fetch and display version dynamically
    fetch(API_URL + '/version')
        .then(res => res.json())
        .then(data => {
            const versionDisplay = document.getElementById('app-version-display');
            if (versionDisplay && data.version) {
                versionDisplay.textContent = `v${data.version}`;
            }
        })
        .catch(err => Logger.error(`Failed to fetch app version: ${err}`));

    // --- Initialization ---
    initModals();
    initBoardListeners();
    initTaskListeners();
    initWorkflowListeners();
    initUserManagement();
    initThemeListeners();
    initSearch();

    function escapeHtml(unsafe) {
        return (unsafe || '').toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function appendLog(logEntry) {
        if (!elements.logsContainer) return;
        const colorMap = {
            'INFO': '#4fc1ff',
            'ERROR': '#f44336',
            'WARN': '#ff9800',
            'SUCCESS': '#4caf50',
            'SOCKET': '#d32f2f',
            'HTTP': '#00bcd4'
        };
        const color = colorMap[logEntry.type] || '#fff';
        const logLine = document.createElement('div');
        logLine.innerHTML = `<span style="color: gray;">[${logEntry.timestamp}]</span> <span style="color: ${color}; font-weight: bold;">${logEntry.type}:</span> <span style="color: #d4d4d4;">${escapeHtml(logEntry.message)}</span>`;
        elements.logsContainer.appendChild(logLine);
        elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
    }

    if (elements.serverLogsBtn) {
        elements.serverLogsBtn.onclick = async () => {
            if (elements.logsModal) elements.logsModal.classList.add('visible');
            try {
                const logs = await API.getLogs();
                if (elements.logsContainer) {
                    elements.logsContainer.innerHTML = '';
                    logs.forEach(log => appendLog(log));
                }
            } catch (err) {
                Logger.error('Failed to load logs', err);
            }
        };
    }

    if (elements.clearLogsBtn) {
        elements.clearLogsBtn.onclick = () => {
            if (elements.logsContainer) elements.logsContainer.innerHTML = '';
        };
    }

    // Theme Logic
    const initTheme = () => {
        const storedTheme = localStorage.getItem('theme');
        const themeText = document.getElementById('theme-text');
        const themeIcon = document.querySelector('.theme-icon');

        const updateThemeUI = (isDark) => {
            if (isDark) {
                document.body.classList.add('dark-mode');
                document.body.classList.remove('light-mode');
                if (themeText) themeText.textContent = 'Light Mode';
                if (themeIcon) themeIcon.textContent = 'light_mode';
            } else {
                document.body.classList.remove('dark-mode');
                document.body.classList.add('light-mode');
                if (themeText) themeText.textContent = 'Dark Mode';
                if (themeIcon) themeIcon.textContent = 'dark_mode';
            }
        };

        if (storedTheme === 'light') {
            updateThemeUI(false);
        } else {
            updateThemeUI(true); // Default dark
        }

        if (elements.themeToggleBtn) {
            elements.themeToggleBtn.onclick = (e) => {
                e.stopPropagation();
                const isDark = document.body.classList.toggle('dark-mode');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
                updateThemeUI(isDark);
            };
        }
    };
    initTheme();

    // Language Logic
    const initLanguage = () => {
        const storedLang = localStorage.getItem('lang') || 'en';
        const langBtns = document.querySelectorAll('.lang-btn');

        const updateLangUI = (lang) => {
            langBtns.forEach(btn => {
                if (btn.dataset.lang === lang) {
                    btn.style.background = 'var(--primary-color)';
                    btn.style.color = 'white';
                } else {
                    btn.style.background = 'none';
                    btn.style.color = 'var(--text-color)';
                }
            });

            localStorage.setItem('lang', lang);

            // Literal translations for key UI elements
            const translations = {
                en: {
                    addColumn: '<span class="material-symbols-outlined">add</span> Add Column',
                    myProfile: '<span class="material-symbols-outlined">person</span> My Profile',
                    users: '<span class="material-symbols-outlined">group</span> Users',
                    background: '<span class="material-symbols-outlined">palette</span> Background',
                    export: '<span class="material-symbols-outlined">download</span> Export (.kanban)',
                    logout: '<span class="material-symbols-outlined">logout</span> Logout',
                    searchPlaceholder: 'Search (Tag: Person: )',
                    discussion: 'Discussion',
                    commentPlaceholder: 'Write a comment...'
                },
                fr: {
                    addColumn: '<span class="material-symbols-outlined">add</span> Ajouter Colonne',
                    myProfile: '<span class="material-symbols-outlined">person</span> Mon Profil',
                    users: '<span class="material-symbols-outlined">group</span> Utilisateurs',
                    background: '<span class="material-symbols-outlined">palette</span> Arrière-plan',
                    export: '<span class="material-symbols-outlined">download</span> Exporter (.kanban)',
                    logout: '<span class="material-symbols-outlined">logout</span> Déconnexion',
                    searchPlaceholder: 'Rechercher (Tag: Person: )',
                    discussion: 'Discussion',
                    commentPlaceholder: 'Écrire un commentaire...'
                }
            };

            const t = translations[lang];
            const btnAddCol = document.getElementById('add-workflow-btn');
            if (btnAddCol) btnAddCol.innerHTML = t.addColumn;

            const btnProfile = document.getElementById('profile-btn');
            if (btnProfile) btnProfile.innerHTML = t.myProfile;

            const btnUsers = document.getElementById('manage-users-btn');
            if (btnUsers) btnUsers.innerHTML = t.users;

            const btnBg = document.getElementById('bg-customize-btn');
            if (btnBg) btnBg.innerHTML = t.background;

            const btnExport = document.getElementById('export-btn');
            if (btnExport) btnExport.innerHTML = t.export;

            const btnLogout = document.getElementById('logout-btn');
            if (btnLogout) btnLogout.innerHTML = t.logout;

            const inputSearch = document.getElementById('global-search');
            if (inputSearch) inputSearch.placeholder = t.searchPlaceholder;

            const discussionHeader = document.querySelector('#view-task-discussion-section h4');
            if (discussionHeader) discussionHeader.textContent = t.discussion;

            const commentInput = document.getElementById('task-comment-input');
            if (commentInput) commentInput.placeholder = t.commentPlaceholder;

            if (lang === 'fr') {
                Logger.info('Langue changée en Français');
            } else {
                Logger.info('Language changed to English');
            }
        };

        updateLangUI(storedLang);

        langBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                updateLangUI(btn.dataset.lang);
            };
        });

        // Toggle on row click
        const langRow = document.getElementById('language-toggle-btn');
        if (langRow) {
            langRow.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const current = localStorage.getItem('lang') || 'en';
                const newLang = current === 'en' ? 'fr' : 'en';
                updateLangUI(newLang);
            };
        }
    };
    initLanguage();

    // Init Auth (calls initSocket on success)
    initAuth(initSocket);

    async function initSocket() {
        if (state.socket) return;

        // Fetch initial data via REST for reliability
        try {
            const data = await API.getBoard();
            if (data && data.workflows) {
                state.boardData = data;
                applyBackground(state.boardData.background);
                renderBoard();
            }
        } catch (e) {
            Logger.debug('Rest API board fetch failed, relying on socket');
        }

        state.socket = io({ path: basePath + '/socket.io' });

        state.socket.on('boardUpdate', (data) => {
            if (!state.isDraggingInternal) {
                state.boardData = data;
                applyBackground(state.boardData.background);
                renderBoard();
                refreshTaskView();
            }
        });

        state.socket.on('serverLog', (logEntry) => {
            appendLog(logEntry);
        });

        state.socket.on('onlineUsers', (users) => {
            if (!elements.onlineUsersContainer) return;
            elements.onlineUsersContainer.innerHTML = '';

            const uniqueUsersMap = new Map();
            users.forEach(u => uniqueUsersMap.set(u.id, u));
            const uniqueUsers = Array.from(uniqueUsersMap.values());

            uniqueUsers.forEach(user => {
                const userEl = document.createElement('div');
                userEl.className = 'online-user-avatar';
                userEl.title = user.name + (user.role ? ` (${user.role})` : '');

                if (user.avatar_url) {
                    userEl.style.backgroundImage = `url('${user.avatar_url}')`;
                    userEl.style.backgroundSize = 'cover';
                    userEl.style.backgroundPosition = 'center';
                } else {
                    const initials = (user.name || 'U').substring(0, 2).toUpperCase();
                    userEl.textContent = initials;
                }
                elements.onlineUsersContainer.appendChild(userEl);
            });
        });

        state.socket.on('connect', () => {
            Logger.info('🔌 Connected to server');
        });
    }
});
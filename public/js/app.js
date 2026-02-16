import { Logger } from './modules/utils.js';
import { state } from './modules/state.js';
import { elements } from './modules/dom.js';
import { initModals } from './modules/modals.js';
import { initAuth } from './modules/auth-ui.js';
import { initBoardListeners, renderBoard } from './modules/board-ui.js';
import { initTaskListeners } from './modules/task-ui.js';
import { initWorkflowListeners } from './modules/workflow-ui.js';
import { initUserManagement } from './modules/user-ui.js';
import * as API from './modules/api.js';
import { initThemeListeners, applyBackground } from './modules/theme-ui.js';

document.addEventListener('DOMContentLoaded', () => {
    Logger.info('🚀 Ananke application started');

    // --- Initialization ---
    initModals();
    initBoardListeners();
    initTaskListeners();
    initWorkflowListeners();
    initUserManagement();
    initThemeListeners();

    // Theme Logic
    const initTheme = () => {
        const storedTheme = localStorage.getItem('theme');
        const themeText = document.getElementById('theme-text');
        const themeIcon = document.querySelector('.theme-icon');

        const updateThemeUI = (isDark) => {
            if (isDark) {
                document.body.classList.add('dark-mode');
                if (themeText) themeText.textContent = 'Light Mode';
                if (themeIcon) themeIcon.textContent = 'light_mode';
            } else {
                document.body.classList.remove('dark-mode');
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
            // Here you would normally trigger a full translation update
            // For now, we just save the preference
            localStorage.setItem('lang', lang);
            if (lang === 'fr') {
                Logger.info('Langue changée en Français (Rechargement nécessaire pour appliquer partout)');
            } else {
                Logger.info('Language changed to English (Reload required to apply everywhere)');
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

        state.socket = io();

        state.socket.on('boardUpdate', (data) => {
            if (!state.isDraggingInternal) {
                state.boardData = data;
                applyBackground(state.boardData.background);
                renderBoard();
            }
        });

        state.socket.on('connect', () => {
            Logger.info('🔌 Connected to server');
        });
    }
});
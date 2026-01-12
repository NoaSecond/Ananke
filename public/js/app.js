import { Logger } from './modules/utils.js';
import { state } from './modules/state.js';
import { elements } from './modules/dom.js';
import { initModals } from './modules/modals.js';
import { initAuth } from './modules/auth-ui.js';
import { initBoardListeners, renderBoard } from './modules/board-ui.js';
import { initTaskListeners } from './modules/task-ui.js';
import { initWorkflowListeners } from './modules/workflow-ui.js';
import { initUserManagement } from './modules/user-ui.js';

document.addEventListener('DOMContentLoaded', () => {
    Logger.info('🚀 Ananke application started');

    // --- Initialization ---
    initModals();
    initBoardListeners();
    initTaskListeners();
    initWorkflowListeners();
    initUserManagement();

    // Theme Logic
    const initTheme = () => {
        const storedTheme = localStorage.getItem('theme');
        const themeText = document.getElementById('theme-text');
        const themeIcon = document.querySelector('.theme-icon');

        const updateThemeUI = (isDark) => {
            if (isDark) {
                document.body.classList.add('dark-mode');
                if (themeText) themeText.textContent = 'Mode Clair';
                if (themeIcon) themeIcon.textContent = 'light_mode';
            } else {
                document.body.classList.remove('dark-mode');
                if (themeText) themeText.textContent = 'Mode Sombre';
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

    // Init Auth (calls initSocket on success)
    initAuth(initSocket);

    function initSocket() {
        if (state.socket) return;
        state.socket = io();

        state.socket.on('boardUpdate', (data) => {
            if (!state.isDraggingInternal) {
                state.boardData = data;
                renderBoard();
            }
        });

        state.socket.on('connect', () => {
            Logger.info('🔌 Connected to server');
        });
    }
});
import { elements } from './dom.js';
import { state, getFullUrl } from './state.js';
import { renderBoard } from './board-ui.js';
import { openModal, closeModal } from './modals.js';
import { Logger } from './utils.js';
import * as API from './api.js';

export function initThemeListeners() {
    // Theme and modal background listeners now handled per-board in board-settings-ui.js
}

export function updatePreview(preview, bg) {
    if (!preview) return;

    preview.style.background = '';
    preview.style.backgroundImage = '';
    preview.textContent = '';

    if (!bg || bg.type === 'default' || !bg.value) {
        preview.textContent = 'Default Background';
        preview.style.background = 'var(--clr-surface-3, #1e1e2e)';
        return;
    }

    if (bg.type === 'color') {
        preview.style.backgroundColor = bg.value;
    } else if (bg.type === 'gradient') {
        preview.style.background = bg.value;
    } else if (bg.type === 'image') {
        const bgUrl = getFullUrl(bg.value);
        preview.style.backgroundImage = `url("${bgUrl}")`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
    }
}

export function applyBackground(bg) {
    const mainArea = document.getElementById('main-area');

    // Always clean up document.body so it never leaks to the sidebar
    document.body.classList.remove('has-custom-bg');
    document.body.style.background = '';
    document.body.style.backgroundImage = '';

    if (!mainArea) return;

    if (!bg || bg.type === 'default' || !bg.value || state.currentView !== 'board') {
        mainArea.classList.remove('has-custom-bg');
        mainArea.style.removeProperty('background');
        mainArea.style.removeProperty('background-image');
        mainArea.style.removeProperty('background-color');
        mainArea.style.removeProperty('background-size');
        mainArea.style.removeProperty('background-position');
        mainArea.style.removeProperty('background-repeat');
        return;
    }

    mainArea.classList.add('has-custom-bg');

    if (bg.type === 'color') {
        mainArea.style.removeProperty('background-image');
        mainArea.style.setProperty('background', bg.value, 'important');
    } else if (bg.type === 'gradient') {
        mainArea.style.setProperty('background', bg.value, 'important');
    } else if (bg.type === 'image') {
        const bgUrl = getFullUrl(bg.value);
        mainArea.style.removeProperty('background');
        mainArea.style.setProperty('background-image', `url("${bgUrl}")`, 'important');
        mainArea.style.setProperty('background-size', 'cover', 'important');
        mainArea.style.setProperty('background-position', 'center', 'important');
        mainArea.style.setProperty('background-repeat', 'no-repeat', 'important');
    }
}

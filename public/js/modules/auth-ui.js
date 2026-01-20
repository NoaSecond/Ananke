import { elements } from './dom.js';
import * as API from './api.js';
import { state } from './state.js';
import { Logger } from './utils.js';

export function initAuth(initSocketCallback) {
    checkAuth(initSocketCallback);

    // Login Form Listener
    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            try {
                const data = await API.login(email, password);
                if (data.success) {
                    handleLoginSuccess(data.user, initSocketCallback);
                } else {
                    elements.authMessage.textContent = data.error || 'Login failed';
                }
            } catch (err) {
                elements.authMessage.textContent = 'Network error';
            }
        });
    }

    // Logout Button Listener
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', async () => {
            await API.logout();
            window.location.reload();
        });
    }

    // Setup Modal Close Button
    if (elements.setupCloseBtn) {
        elements.setupCloseBtn.onclick = () => {
            elements.setupModal.classList.remove('visible');
        };
    }

    // Setup Form Listener
    if (elements.setupForm) {
        elements.setupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const firstName = document.getElementById('setup-firstname').value;
            const lastName = document.getElementById('setup-lastname').value;
            const email = document.getElementById('setup-email').value;
            const password = document.getElementById('setup-password').value;
            const passwordConfirm = document.getElementById('setup-password-confirm').value;
            const messageEl = document.getElementById('setup-message');

            if (password && password !== passwordConfirm) {
                messageEl.textContent = 'Passwords do not match';
                return;
            }

            try {
                const res = await API.completeSetup({ firstName, lastName, email, password });
                if (res.success) {
                    state.currentUser = res.user;
                    updateUserUI();
                    elements.setupModal.classList.remove('visible');
                    Logger.success('Profile updated');

                    if (state.socket && !state.socket.connected) initSocketCallback();
                } else {
                    messageEl.textContent = res.error || 'Update failed';
                }
            } catch (err) {
                console.error(err);
                messageEl.textContent = 'Network error';
            }
        });
    }

    // Settings Toggle
    if (elements.settingsToggleBtn) {
        elements.settingsToggleBtn.onclick = (e) => {
            e.stopPropagation();
            elements.settingsMenu.classList.toggle('hidden');
        };
    }

    if (elements.settingsMenu) {
        elements.settingsMenu.onclick = (e) => e.stopPropagation();
    }

    // Global Click Listener to close menus
    document.addEventListener('click', (e) => {
        // Close settings if clicking outside
        if (elements.settingsMenu && !elements.settingsMenu.classList.contains('hidden')) {
            if (!e.target.closest('.settings-container')) {
                elements.settingsMenu.classList.add('hidden');
            }
        }
        // Close workflow menus if clicking outside
        if (!e.target.closest('.workflow-actions')) {
            document.querySelectorAll('.workflow-menu').forEach(m => m.classList.remove('visible'));
        }
    });

    // Profile Button
    if (elements.profileBtn) {
        elements.profileBtn.onclick = () => {
            elements.settingsMenu.classList.add('hidden');
            openSetupModal(false);
        };
    }
}

async function checkAuth(initSocketCallback) {
    try {
        const data = await API.getMe();
        handleLoginSuccess(data.user, initSocketCallback);
    } catch (e) {
        showAuth();
    }
}

function showAuth() {
    elements.authOverlay.style.visibility = 'visible';
    elements.authOverlay.style.display = 'flex';
    elements.kanbanBoard.style.display = 'none';
    document.body.classList.add('auth-mode');
}

function hideAuth() {
    elements.authOverlay.style.display = 'none';
    elements.kanbanBoard.style.display = 'flex';
    document.body.classList.remove('auth-mode');
}

function handleLoginSuccess(user, initSocketCallback) {
    state.currentUser = user;
    hideAuth();
    updateUserUI();

    if (!user.is_setup_complete) {
        openSetupModal(true);
    } else {
        if (initSocketCallback) initSocketCallback();
    }
}

export function updateUserUI() {
    if (!state.currentUser) return;

    elements.userDisplayName.textContent = state.currentUser.first_name ? `${state.currentUser.first_name} ${state.currentUser.last_name}` : (state.currentUser.name || state.currentUser.email);
    elements.userDisplayRole.textContent = state.currentUser.role.charAt(0).toUpperCase() + state.currentUser.role.slice(1);

    if (['admin', 'owner'].includes(state.currentUser.role)) {
        elements.manageUsersBtn.style.display = 'flex';
    } else {
        elements.manageUsersBtn.style.display = 'none';
    }

    if (state.currentUser.role === 'owner') {
        elements.importLabel.style.display = 'flex';
    } else {
        elements.importLabel.style.display = 'none';
    }
}

export function openSetupModal(isFirstTime) {
    elements.setupModal.classList.add('visible');
    const title = document.getElementById('setup-title');
    const desc = document.getElementById('setup-desc');
    const messageEl = document.getElementById('setup-message');

    // Reset form
    elements.setupForm.reset();
    messageEl.textContent = '';

    if (isFirstTime) {
        elements.setupCloseBtn.style.display = 'none';
        title.textContent = 'Welcome to Ananke';
        desc.textContent = 'Please configure your profile to start.';
        if (state.currentUser) document.getElementById('setup-email').value = state.currentUser.email;
    } else {
        elements.setupCloseBtn.style.display = 'block';
        title.textContent = 'My Profile';
        desc.textContent = 'Update your personal information.';
        if (state.currentUser) {
            document.getElementById('setup-firstname').value = state.currentUser.first_name || '';
            document.getElementById('setup-lastname').value = state.currentUser.last_name || '';
            document.getElementById('setup-email').value = state.currentUser.email || '';
        }
    }
}

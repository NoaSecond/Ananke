import { elements } from './dom.js';
import * as API from './api.js';
import { state } from './state.js';
import { Logger, getInitials } from './utils.js';
import { renderBoard } from './board-ui.js';
import { refreshSearchUsers } from './search-ui.js';

let currentAvatarUrl = null;

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
            currentAvatarUrl = null; // reset
        };
    }

    // Avatar Upload Listener
    const avatarUploadInput = document.getElementById('setup-avatar-upload');
    const avatarImg = document.getElementById('setup-avatar-img');
    const avatarInitials = document.getElementById('setup-avatar-initials');
    const avatarRemoveBtn = document.getElementById('setup-avatar-remove');

    if (avatarUploadInput) {
        avatarUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    currentAvatarUrl = event.target.result;
                    avatarImg.src = currentAvatarUrl;
                    avatarImg.style.display = 'block';
                    avatarInitials.style.display = 'none';
                    if (avatarRemoveBtn) avatarRemoveBtn.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (avatarRemoveBtn) {
        avatarRemoveBtn.addEventListener('click', () => {
            currentAvatarUrl = ''; // Empty string so backend removes it
            avatarImg.src = '';
            avatarImg.style.display = 'none';
            avatarInitials.style.display = 'block';
            avatarRemoveBtn.style.display = 'none';
        });
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
                const res = await API.completeSetup({ firstName, lastName, email, password, avatar_url: currentAvatarUrl });
                if (res.success) {
                    state.currentUser = res.user;
                    updateUserUI();

                    // Refresh the board to reflect new name/avatar
                    if (elements.kanbanBoard && state.boardData) {
                        try {
                            renderBoard();
                            await refreshSearchUsers();
                        } catch (e) {
                            console.error('Failed to trigger board re-render', e);
                        }
                    }

                    elements.setupModal.classList.remove('visible');
                    Logger.success('Profile updated');

                    if (!state.socket) initSocketCallback();
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

    // Password Toggle Button
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const passwordSection = document.getElementById('password-change-section');
    if (togglePasswordBtn && passwordSection) {
        togglePasswordBtn.addEventListener('click', () => {
            const isHidden = passwordSection.style.display === 'none';
            passwordSection.style.display = isHidden ? 'block' : 'none';
        });
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

    if (initSocketCallback) initSocketCallback();
    if (!user.is_setup_complete) {
        openSetupModal(true);
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

    const settingsAvatarContainer = document.getElementById('settings-user-avatar');
    if (settingsAvatarContainer) {
        if (state.currentUser.avatar_url) {
            settingsAvatarContainer.innerHTML = `<img src="${state.currentUser.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">`;
            settingsAvatarContainer.style.background = 'transparent';
        } else {
            settingsAvatarContainer.innerHTML = getInitials(state.currentUser);
            settingsAvatarContainer.style.background = 'var(--primary-color)';
            settingsAvatarContainer.style.color = 'white';
            settingsAvatarContainer.style.border = '2px solid var(--card-bg)';
        }
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

    const passwordSection = document.getElementById('password-change-section');
    if (passwordSection) {
        passwordSection.style.display = 'none';
    }

    // Handle avatar
    const avatarImg = document.getElementById('setup-avatar-img');
    const avatarInitials = document.getElementById('setup-avatar-initials');
    const avatarRemoveBtn = document.getElementById('setup-avatar-remove');
    currentAvatarUrl = state.currentUser ? state.currentUser.avatar_url : null;

    if (avatarImg && avatarInitials) {
        if (currentAvatarUrl) {
            avatarImg.src = currentAvatarUrl;
            avatarImg.style.display = 'block';
            avatarInitials.style.display = 'none';
            if (avatarRemoveBtn) avatarRemoveBtn.style.display = 'block';
        } else {
            avatarImg.src = '';
            avatarImg.style.display = 'none';
            avatarInitials.style.display = 'block';
            if (avatarRemoveBtn) avatarRemoveBtn.style.display = 'none';

            // Generate initials
            avatarInitials.textContent = getInitials(state.currentUser);
        }
    }

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

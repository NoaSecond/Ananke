import { elements } from './dom.js';
import * as API from './api.js';
import { state, API_URL, getFullUrl } from './state.js';
import { Logger } from './utils.js';
import { getInitials, updateAvatarElement } from './avatar.js';
import { renderBoard } from './board-ui.js';
import { refreshSearchUsers } from './search-ui.js';
import { t } from './i18n.js';

let currentAvatarUrl = null;
let oldAvatarUrl = null;
let sessionAvatarUploads = [];
let _onNavigateToProfile = null;

export function setProfileNavigateHandler(fn) {
    _onNavigateToProfile = fn;
}

export function initAuth(initSocketCallback) {
    API.setUnauthorizedHandler(handleUnauthorized);
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
            sessionAvatarUploads.forEach(url => {
                API.deleteMedia(url).catch(e => Logger.warn('Avatar cleanup notice', e));
            });
            sessionAvatarUploads = [];
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
        avatarUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const processAvatarUpload = async (uploadFile) => {
                try {
                    elements.setupModal.classList.add('loading-avatar'); // optional css indicator
                    const res = await API.uploadFiles([uploadFile]);
                    if (res.urls && res.urls.length > 0) {
                        sessionAvatarUploads.push(res.urls[0]);
                        currentAvatarUrl = res.urls[0];
                        avatarImg.src = getFullUrl(currentAvatarUrl);
                        avatarImg.style.display = 'block';
                        avatarInitials.style.display = 'none';
                        if (avatarRemoveBtn) avatarRemoveBtn.style.display = 'block';
                    }
                } catch (err) {
                    Logger.error('Failed to upload avatar', err);
                } finally {
                    elements.setupModal.classList.remove('loading-avatar');
                }
            };

            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                let isSquare = img.width === img.height;
                const MAX_SIZE_MB = 1;

                if (!isSquare) {
                    // Start Cropper
                    elements.cropModal.classList.add('visible');
                    elements.cropImage.src = url;

                    if (window.cropperInstance) window.cropperInstance.destroy();
                    window.cropperInstance = new Cropper(elements.cropImage, {
                        aspectRatio: 1,
                        viewMode: 1
                    });

                    elements.cropSaveBtn.onclick = async () => {
                        const canvas = window.cropperInstance.getCroppedCanvas({
                            width: 300,
                            height: 300 // reasonable avatar size
                        });

                        canvas.toBlob(async (blob) => {
                            elements.cropModal.classList.remove('visible');
                            window.cropperInstance.destroy();
                            window.cropperInstance = null;
                            const croppedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_cropped.jpg", { type: 'image/jpeg' });
                            await processAvatarUpload(croppedFile);
                        }, 'image/jpeg', 0.85); // 0.85 compression
                    };

                    elements.cropCloseBtn.onclick = () => {
                        elements.cropModal.classList.remove('visible');
                        if (window.cropperInstance) {
                            window.cropperInstance.destroy();
                            window.cropperInstance = null;
                        }
                    };
                } else {
                    // Already square. Do we need compression?
                    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.min(img.width, 400); // resize down to max 400px
                        canvas.height = Math.min(img.height, 400);
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        canvas.toBlob(async (blob) => {
                            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.jpg", { type: 'image/jpeg' });
                            await processAvatarUpload(compressedFile);
                        }, 'image/jpeg', 0.8);
                    } else {
                        processAvatarUpload(file);
                    }
                }
            };
            img.src = url;
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
                if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/') && currentAvatarUrl !== oldAvatarUrl) {
                    API.deleteMedia(oldAvatarUrl).catch(e => Logger.warn('Old avatar cleanup notice', e));
                }
                sessionAvatarUploads.forEach(url => {
                    if (url !== currentAvatarUrl) {
                        API.deleteMedia(url).catch(e => Logger.warn('Avatar cleanup notice', e));
                    }
                });
                sessionAvatarUploads = [];

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
                            Logger.warn('Failed to trigger board re-render', e);
                        }
                    }

                    elements.setupModal.classList.remove('visible');
                    Logger.success('Profile updated');

                    if (!state.socket) {
                        initSocketCallback();
                    } else {
                        state.socket.emit('profileUpdated');
                    }
                } else {
                    messageEl.textContent = res.error || 'Update failed';
                }
            } catch (err) {
                Logger.error('Setup completion error', err);
                messageEl.textContent = 'Network error';
            }
        });
    }

    if (elements.settingsMenu) {
        elements.settingsMenu.onclick = (e) => e.stopPropagation();
    }

    // Global Click Listener to close menus
    document.addEventListener('click', (e) => {
        // Close settings if clicking outside
        if (elements.settingsMenu && !elements.settingsMenu.classList.contains('hidden')) {
            if (!elements.settingsMenu.contains(e.target) &&
                !e.target.closest('#sidebar-settings-btn')) {
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
            if (_onNavigateToProfile) {
                _onNavigateToProfile();
            } else {
                openSetupModal(false);
            }
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
    document.body.classList.add('auth-mode');
    // Fermer tous les modaux ouverts
    document.querySelectorAll('.modal.visible, .modal-overlay.visible').forEach(m => m.classList.remove('visible'));
}

// Exporté : appelé quand une requête reçoit un 401 ou quand le socket reconnecte.
// Remet l'interface dans l'état "non authentifié" proprement.
export function handleUnauthorized() {
    state.currentUser = null;
    if (state.socket) {
        state.socket.disconnect();
        state.socket = null;
    }
    if (elements.setupModal) {
        elements.setupModal.classList.remove('visible');
    }
    showAuth();
}

function hideAuth() {
    elements.authOverlay.style.display = 'none';
    document.body.classList.remove('auth-mode');
}

function handleLoginSuccess(user, initSocketCallback) {
    state.currentUser = user;
    hideAuth();
    updateUserUI();
    checkVersion(user);

    if (initSocketCallback) initSocketCallback();
    refreshSearchUsers().catch(e => Logger.warn('User search refresh error', e));
    if (!user.is_setup_complete) {
        openSetupModal(true);
    }
}

async function checkVersion(user) {
    try {
        const localData = await API.getVersion();
        const localVersion = localData.version;

        const versionDisplay = document.getElementById('app-version-display');
        if (versionDisplay && localVersion) {
            versionDisplay.textContent = `v${localVersion}`;
        }

        if (!['admin', 'owner'].includes(user.role)) return;

        const remoteRes = await fetch('https://raw.githubusercontent.com/NoaSecond/Ananke/main/package.json?t=' + Date.now());
        const remoteData = await remoteRes.json();
        const remoteVersion = remoteData.version;

        if (localVersion !== remoteVersion && !document.getElementById('version-warning')) {
            const versionDisplay = document.getElementById('app-version-display');
            const footerRight = versionDisplay?.parentElement || document.querySelector('.footer-right');
            if (footerRight) {
                const warningBtn = document.createElement('a');
                warningBtn.id = 'version-warning';
                warningBtn.href = 'https://github.com/NoaSecond/Ananke/releases';
                warningBtn.target = '_blank';
                warningBtn.rel = 'noopener noreferrer';
                const label = t('footer.update_available') || 'Update available';
                warningBtn.title = `${label}: v${remoteVersion}`;
                warningBtn.innerHTML = `<span class="material-symbols-outlined">update</span><span data-i18n="footer.update_available">${label}</span>`;
                if (versionDisplay) {
                    footerRight.insertBefore(warningBtn, versionDisplay);
                } else {
                    footerRight.appendChild(warningBtn);
                }
            }
        }
    } catch (e) {
        Logger.warn('Failed to check version', e);
    }
}

export function updateUserUI() {
    if (!state.currentUser) return;

    const displayName = state.currentUser.first_name ? `${state.currentUser.first_name} ${state.currentUser.last_name}` : (state.currentUser.name || state.currentUser.email);
    const displayRole = state.currentUser.role.charAt(0).toUpperCase() + state.currentUser.role.slice(1);

    if (elements.userDisplayName) elements.userDisplayName.textContent = displayName;
    if (elements.userDisplayRole) elements.userDisplayRole.textContent = displayRole;

    const menuName = document.getElementById('user-display-name-menu');
    if (menuName) menuName.textContent = displayName;
    const menuRole = document.getElementById('user-display-role-menu');
    if (menuRole) menuRole.textContent = displayRole;

    if (['admin', 'owner'].includes(state.currentUser.role)) {
        elements.manageUsersBtn.style.display = 'flex';
        if (elements.serverLogsBtn) elements.serverLogsBtn.style.display = 'flex';
    } else {
        elements.manageUsersBtn.style.display = 'none';
        if (elements.serverLogsBtn) elements.serverLogsBtn.style.display = 'none';
    }

    if (state.currentUser.role === 'owner') {
        elements.importLabel.style.display = 'flex';
    } else {
        elements.importLabel.style.display = 'none';
    }

    const sidebarAvatar = document.getElementById('sidebar-user-avatar');
    if (sidebarAvatar) {
        updateAvatarElement(sidebarAvatar, state.currentUser);
    }

    const settingsAvatarContainer = document.getElementById('settings-user-avatar');
    if (settingsAvatarContainer) {
        updateAvatarElement(settingsAvatarContainer, state.currentUser);
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
    oldAvatarUrl = currentAvatarUrl;
    sessionAvatarUploads = [];

    if (avatarImg && avatarInitials) {
        if (currentAvatarUrl) {
            avatarImg.src = getFullUrl(currentAvatarUrl);
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

/**
 * Toggle the visibility and anchor orientation of the settings menu.
 * @param {'sidebar' | 'header'} source
 */
export function toggleSettingsMenu(source = 'sidebar') {
    const menu = elements.settingsMenu || document.getElementById('settings-menu');
    if (!menu) return;

    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
        menu.classList.remove('hidden', 'from-sidebar', 'from-sidebar-collapsed', 'from-header');
        if (source === 'sidebar') {
            const sidebar = document.getElementById('sidebar');
            if (sidebar?.classList.contains('collapsed')) {
                menu.classList.add('from-sidebar-collapsed');
            } else {
                menu.classList.add('from-sidebar');
            }
        } else {
            menu.classList.add('from-header');
        }
    } else {
        menu.classList.add('hidden');
    }
}


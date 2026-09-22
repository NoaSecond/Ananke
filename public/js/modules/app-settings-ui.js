/**
 * app-settings-ui.js — Ananke v3.0
 * 
 * Responsabilité unique (S) : Affichage et gestion de la page Paramètres de l'application
 * au format page complète (comme Board Settings et Profile) :
 * - Gestion des utilisateurs (CRUD admin)
 * - Langue (Français / Anglais)
 * - Thème (Sombre / Clair)
 */

import { state } from './state.js';
import * as API from './api.js';
import { Logger, escapeHtml } from './utils.js';
import { renderAvatarHtml } from './avatar.js';
import { t, getLanguage, setLanguage } from './i18n.js';
import { elements } from './dom.js';
import { openModal, closeModal } from './modals.js';

let _onBack = null;

export function initAppSettingsView({ onBack } = {}) {
    _onBack = onBack;
}

/**
 * Render the full-page app settings view inside #view-app-settings
 * @param {{ onBack?: () => void }} options
 */
export async function renderAppSettingsView({ onBack } = {}) {
    if (onBack) _onBack = onBack;

    const container = document.getElementById('view-app-settings');
    if (!container) return;

    const user = state.currentUser;
    if (!user) return;

    const isAdmin = ['admin', 'owner'].includes(user.role);
    const currentLang = getLanguage();
    const isDark = document.body.classList.contains('dark-mode') || !document.body.classList.contains('light-mode');

    container.innerHTML = `
        <div class="settings-page-header">
            <button class="settings-page-back-btn" id="app-settings-back-btn" title="${t('profile.back')}">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 class="settings-page-title">${t('settings.page_title')}</h1>
        </div>

        <div style="display:flex;flex-direction:column;gap:1.5rem;">
            
            <!-- Section 1: User Management -->
            <div class="settings-section">
                <h3 class="settings-section-title">
                    <span class="material-symbols-outlined">group</span>
                    ${t('settings.section_users')}
                </h3>

                ${isAdmin ? `
                    <!-- Create User Form Card -->
                    <div style="background:var(--clr-surface);padding:1.25rem;border-radius:var(--border-radius-md);border:1px solid var(--clr-border);margin-bottom:1.5rem;">
                        <h4 style="margin:0 0 1rem;font-size:0.95rem;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--clr-text);">
                            <span class="material-symbols-outlined" style="font-size:18px;color:var(--clr-primary);">person_add</span>
                            ${t('settings.create_user_title')}
                        </h4>
                        <form id="app-settings-create-user-form" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
                            <div style="flex:2;min-width:200px;">
                                <label class="form-label" style="font-size:0.8rem;" for="app-settings-email">${t('profile.email')}</label>
                                <input class="form-input" type="email" id="app-settings-email" required placeholder="user@example.com" style="margin:0;height:42px;box-sizing:border-box;">
                            </div>
                            <div style="flex:2;min-width:240px;">
                                <label class="form-label" style="font-size:0.8rem;" for="app-settings-password">${t('settings.temp_password')}</label>
                                <div style="position:relative;display:flex;align-items:center;">
                                    <input class="form-input" type="text" id="app-settings-password" required placeholder="Temp123!" style="margin:0;height:42px;box-sizing:border-box;padding-right:135px;font-family:monospace;font-size:0.9rem;">
                                    <div style="position:absolute;right:6px;display:flex;gap:4px;">
                                        <button type="button" id="app-settings-pwd-generate-btn" class="secondary-btn small-btn" style="font-size:0.75rem;padding:4px 8px;" data-i18n="settings.generate_pwd">${t('settings.generate_pwd') || 'Generate'}</button>
                                        <button type="button" id="app-settings-pwd-copy-btn" class="secondary-btn small-btn" style="font-size:0.75rem;padding:4px 8px;" data-i18n="settings.copy_pwd">${t('settings.copy_pwd') || 'Copy'}</button>
                                    </div>
                                </div>
                            </div>
                            <div style="flex:1;min-width:120px;">
                                <label class="form-label" style="font-size:0.8rem;" for="app-settings-role">${t('settings.role_label') || 'Role'}</label>
                                <select class="form-input role-select" id="app-settings-role" data-role="user" style="margin:0;height:42px;box-sizing:border-box;width:100%;">
                                    <option value="user">${t('roles.user') || 'Utilisateur'}</option>
                                    <option value="admin">${t('roles.admin') || 'Admin'}</option>
                                </select>
                            </div>
                            <button type="submit" class="action-btn" style="flex-shrink:0;height:42px;display:flex;align-items:center;gap:6px;padding:0 18px;">
                                <span class="material-symbols-outlined" style="font-size:18px;">add</span>
                                <span>${t('settings.create_user_btn')}</span>
                            </button>
                        </form>
                        <div id="app-settings-user-message" style="margin-top:0.75rem;font-size:0.85rem;min-height:1.2em;"></div>
                    </div>

                    <!-- User List Header & Container -->
                    <div style="margin-bottom:0.75rem;font-size:0.85rem;font-weight:600;color:var(--clr-text-muted);display:flex;justify-content:space-between;align-items:center;">
                        <span>${t('settings.users')}</span>
                        <button type="button" id="app-settings-refresh-users-btn" class="secondary-btn small-btn" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;font-size:0.75rem;">
                            <span class="material-symbols-outlined" style="font-size:14px;">refresh</span>
                        </button>
                    </div>
                    <div id="app-settings-user-list" style="display:flex;flex-direction:column;gap:8px;">
                        <div style="padding:1rem;text-align:center;color:var(--clr-text-muted);font-size:0.85rem;">${t('modal.loading')}</div>
                    </div>
                ` : `
                    <p style="font-size:0.85rem;color:var(--clr-text-muted);margin:0;">
                        ${t('settings.users_admin_only')}
                    </p>
                `}
            </div>

            <!-- Section 2: Language -->
            <div class="settings-section">
                <h3 class="settings-section-title">
                    <span class="material-symbols-outlined">language</span>
                    ${t('settings.section_language')}
                </h3>
                <p style="font-size:0.85rem;color:var(--clr-text-muted);margin:0 0 1rem;">
                    ${t('settings.language_desc')}
                </p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;max-width:520px;">
                    <button type="button" class="lang-option-card ${currentLang === 'fr' ? 'selected' : ''}" data-lang="fr" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--border-radius-md);border:1.5px solid ${currentLang === 'fr' ? 'var(--clr-primary)' : 'var(--clr-border)'};background:${currentLang === 'fr' ? 'rgba(99,102,241,0.08)' : 'var(--clr-surface)'};cursor:pointer;text-align:left;transition:all var(--transition-fast);">
                        <span style="font-size:1.5rem;line-height:1;">🇫🇷</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:0.9rem;color:var(--clr-text);">Français</div>
                            <div style="font-size:0.75rem;color:var(--clr-text-muted);">Français (FR)</div>
                        </div>
                        ${currentLang === 'fr' ? '<span class="material-symbols-outlined" style="color:var(--clr-primary);font-size:20px;">check_circle</span>' : ''}
                    </button>
                    <button type="button" class="lang-option-card ${currentLang === 'en' ? 'selected' : ''}" data-lang="en" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--border-radius-md);border:1.5px solid ${currentLang === 'en' ? 'var(--clr-primary)' : 'var(--clr-border)'};background:${currentLang === 'en' ? 'rgba(99,102,241,0.08)' : 'var(--clr-surface)'};cursor:pointer;text-align:left;transition:all var(--transition-fast);">
                        <span style="font-size:1.5rem;line-height:1;">🇬🇧</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:0.9rem;color:var(--clr-text);">English</div>
                            <div style="font-size:0.75rem;color:var(--clr-text-muted);">English (EN)</div>
                        </div>
                        ${currentLang === 'en' ? '<span class="material-symbols-outlined" style="color:var(--clr-primary);font-size:20px;">check_circle</span>' : ''}
                    </button>
                </div>
            </div>

            <!-- Section 3: Theme -->
            <div class="settings-section">
                <h3 class="settings-section-title">
                    <span class="material-symbols-outlined">palette</span>
                    ${t('settings.section_theme')}
                </h3>
                <p style="font-size:0.85rem;color:var(--clr-text-muted);margin:0 0 1rem;">
                    ${t('settings.theme_desc')}
                </p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;max-width:520px;">
                    <button type="button" class="theme-option-card ${isDark ? 'selected' : ''}" data-theme="dark" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--border-radius-md);border:1.5px solid ${isDark ? 'var(--clr-primary)' : 'var(--clr-border)'};background:${isDark ? 'rgba(99,102,241,0.08)' : 'var(--clr-surface)'};cursor:pointer;text-align:left;transition:all var(--transition-fast);">
                        <div style="width:36px;height:36px;border-radius:50%;background:#1e1b4b;border:1px solid rgba(99,102,241,0.3);display:flex;align-items:center;justify-content:center;color:#818cf8;flex-shrink:0;">
                            <span class="material-symbols-outlined" style="font-size:20px;color:#818cf8;">dark_mode</span>
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:0.9rem;color:var(--clr-text);">${t('settings.theme_dark')}</div>
                            <div style="font-size:0.75rem;color:var(--clr-text-muted);">Dark appearance</div>
                        </div>
                        ${isDark ? '<span class="material-symbols-outlined" style="color:var(--clr-primary);font-size:20px;">check_circle</span>' : ''}
                    </button>
                    <button type="button" class="theme-option-card ${!isDark ? 'selected' : ''}" data-theme="light" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--border-radius-md);border:1.5px solid ${!isDark ? 'var(--clr-primary)' : 'var(--clr-border)'};background:${!isDark ? 'rgba(99,102,241,0.08)' : 'var(--clr-surface)'};cursor:pointer;text-align:left;transition:all var(--transition-fast);">
                        <div style="width:36px;height:36px;border-radius:50%;background:#fef3c7;border:1px solid rgba(245,158,11,0.3);display:flex;align-items:center;justify-content:center;color:#d97706;flex-shrink:0;">
                            <span class="material-symbols-outlined" style="font-size:20px;color:#d97706;">light_mode</span>
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:0.9rem;color:var(--clr-text);">${t('settings.theme_light')}</div>
                            <div style="font-size:0.75rem;color:var(--clr-text-muted);">Light appearance</div>
                        </div>
                        ${!isDark ? '<span class="material-symbols-outlined" style="color:var(--clr-primary);font-size:20px;">check_circle</span>' : ''}
                    </button>
                </div>
            </div>

        </div>
    `;

    _bindEvents(isAdmin);
    if (isAdmin) {
        _loadUsersList();
    }
}

function _bindEvents(isAdmin) {
    // Back button
    document.getElementById('app-settings-back-btn')?.addEventListener('click', () => {
        if (_onBack) _onBack();
    });

    // Language switch cards
    document.querySelectorAll('.lang-option-card').forEach(card => {
        card.addEventListener('click', async (e) => {
            const lang = card.dataset.lang;
            if (lang && lang !== getLanguage()) {
                await setLanguage(lang);
                renderAppSettingsView();
            }
        });
    });

    // Theme switch cards
    document.querySelectorAll('.theme-option-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const theme = card.dataset.theme;
            const isDark = theme === 'dark';
            document.body.classList.toggle('dark-mode', isDark);
            document.body.classList.toggle('light-mode', !isDark);
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            const icon = document.querySelector('.theme-icon');
            const text = document.getElementById('theme-text');
            if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
            if (text) text.textContent = t(isDark ? 'settings.theme_light' : 'settings.theme_dark');
            renderAppSettingsView();
        });
    });

    if (!isAdmin) return;

    // Refresh users button
    document.getElementById('app-settings-refresh-users-btn')?.addEventListener('click', () => {
        _loadUsersList();
    });

    // Create user form
    const form = document.getElementById('app-settings-create-user-form');
    const msgEl = document.getElementById('app-settings-user-message');

    if (form) {
        const roleSelect = document.getElementById('app-settings-role');
        const pwdInput = document.getElementById('app-settings-password');
        const genBtn = document.getElementById('app-settings-pwd-generate-btn');
        const copyBtn = document.getElementById('app-settings-pwd-copy-btn');

        // Pre-fill with a secure temporary password
        if (pwdInput && !pwdInput.value) {
            pwdInput.value = _generateRandomPassword(10);
        }

        if (genBtn) {
            genBtn.addEventListener('click', () => {
                if (pwdInput) {
                    pwdInput.value = _generateRandomPassword(10);
                    pwdInput.focus();
                    pwdInput.select();
                }
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                if (pwdInput && pwdInput.value) {
                    try {
                        await navigator.clipboard.writeText(pwdInput.value);
                        const orig = copyBtn.textContent;
                        copyBtn.textContent = t('settings.copied') || 'Copié !';
                        setTimeout(() => { copyBtn.textContent = orig; }, 1500);
                    } catch (err) {
                        Logger.error('Copy to clipboard failed', err);
                    }
                }
            });
        }

        if (roleSelect) {
            roleSelect.addEventListener('change', (e) => {
                roleSelect.setAttribute('data-role', e.target.value);
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('app-settings-email')?.value?.trim();
            const password = document.getElementById('app-settings-password')?.value;
            const role = document.getElementById('app-settings-role')?.value || 'user';

            if (!email || !password) return;

            try {
                const res = await API.createAccount({ email, password, role });
                if (res.success) {
                    if (msgEl) {
                        msgEl.textContent = t('settings.user_created_success') || 'Account created successfully!';
                        msgEl.style.color = 'var(--clr-success, #22c55e)';
                    }
                    form.reset();
                    if (pwdInput) {
                        pwdInput.value = _generateRandomPassword(10);
                    }
                    _loadUsersList();
                } else {
                    if (msgEl) {
                        msgEl.textContent = res.error || 'Creation failed';
                        msgEl.style.color = 'var(--clr-danger, #ef4444)';
                    }
                }
            } catch (err) {
                if (msgEl) {
                    msgEl.textContent = 'Network error';
                    msgEl.style.color = 'var(--clr-danger, #ef4444)';
                }
            }
        });
    }
}

async function _loadUsersList() {
    const listEl = document.getElementById('app-settings-user-list');
    if (!listEl) return;

    listEl.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--clr-text-muted);font-size:0.85rem;">${t('modal.loading')}</div>`;

    try {
        const data = await API.getUsers();
        if (data && data.users && Array.isArray(data.users)) {
            _renderUserRows(data.users);
        } else {
            listEl.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--clr-danger);font-size:0.85rem;">Failed to load users list.</div>`;
        }
    } catch (err) {
        Logger.error('Failed to load users', err);
        listEl.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--clr-danger);font-size:0.85rem;">Loading error.</div>`;
    }
}

function _generateRandomPassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    let result = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}

function _renderUserRows(users) {
    const listEl = document.getElementById('app-settings-user-list');
    if (!listEl) return;

    if (users.length === 0) {
        listEl.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--clr-text-muted);font-size:0.85rem;">No users found.</div>`;
        return;
    }

    const isCurrentUserOwner = state.currentUser && state.currentUser.role === 'owner';

    listEl.innerHTML = users.map(u => {
        const isOwner = u.role === 'owner';
        const isSelf = state.currentUser && state.currentUser.id === u.id;
        const avatarHtml = renderAvatarHtml(u, {
            className: 'member-avatar',
            style: 'width:36px;height:36px;font-size:0.8rem;flex-shrink:0;'
        });
        const displayName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.name || 'User';

        return `
        <div class="member-row" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:var(--border-radius-md);transition:background var(--transition-fast);">
            ${avatarHtml}
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:0.9rem;color:var(--clr-text);">${escapeHtml(displayName)}</div>
                <div style="font-size:0.78rem;color:var(--clr-text-muted);">${escapeHtml(u.email || '')}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                ${!isOwner ? `
                    <select class="small-select role-select app-settings-role-select" data-user-id="${u.id}" data-role="${u.role}" style="font-size:0.8rem;padding:4px 8px;">
                        <option value="user" ${u.role === 'user' || u.role === 'reader' || u.role === 'editor' ? 'selected' : ''}>${t('roles.user') || 'Utilisateur'}</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${t('roles.admin') || 'Admin'}</option>
                    </select>
                ` : `<span class="role-badge owner">${t('roles.owner') || 'Owner'}</span>`}

                ${isCurrentUserOwner ? `
                    <button type="button" class="member-remove-btn app-settings-reset-pwd-btn" data-user-id="${u.id}" data-user-email="${escapeHtml(u.email || '')}" data-user-name="${escapeHtml(displayName)}" title="${t('settings.reset_pwd_tooltip') || 'Set temporary password'}" style="padding:4px 8px;border-radius:6px;border:none;background:transparent;cursor:pointer;color:var(--clr-text-muted);transition:color var(--transition-fast);">
                        <span class="material-symbols-outlined" style="font-size:18px;">lock_reset</span>
                    </button>
                ` : ''}

                ${!isOwner && !isSelf ? `
                    <button type="button" class="member-remove-btn app-settings-delete-user-btn" data-user-id="${u.id}" title="${t('modal.btn_delete')}" style="padding:4px 8px;border-radius:6px;border:none;background:transparent;cursor:pointer;color:var(--clr-text-muted);transition:color var(--transition-fast);">
                        <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
                    </button>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');

    // Bind role change listeners
    listEl.querySelectorAll('.app-settings-role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const userId = select.dataset.userId;
            const newRole = select.value;
            try {
                const res = await API.updateUserRole(userId, newRole);
                if (res.success) {
                    select.setAttribute('data-role', newRole);
                    Logger.success('Role updated');
                } else {
                    alert(res.error || 'Update failed');
                    _loadUsersList();
                }
            } catch (err) {
                Logger.error('Update role error', err);
                _loadUsersList();
            }
        });
    });

    // Bind reset password listeners (owner only)
    listEl.querySelectorAll('.app-settings-reset-pwd-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.userId;
            const email = btn.dataset.userEmail;
            const name = btn.dataset.userName;
            _openResetPasswordModal(userId, email, name);
        });
    });

    // Bind delete listeners
    listEl.querySelectorAll('.app-settings-delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.userId;
            if (!confirm(t('settings.confirm_delete_user') || 'Are you sure you want to delete this user?')) return;
            try {
                const res = await API.deleteUser(userId);
                if (res.success) {
                    Logger.success('User deleted');
                    _loadUsersList();
                } else {
                    alert(res.error || 'Deletion failed');
                }
            } catch (err) {
                Logger.error('Delete error', err);
            }
        });
    });
}

function _openResetPasswordModal(userId, email, name) {
    const modal = elements.resetPasswordModal || document.getElementById('reset-password-modal');
    if (!modal) return;

    const idInput = document.getElementById('reset-password-user-id');
    const pwdInput = document.getElementById('reset-password-input');
    const infoEl = document.getElementById('reset-password-user-info');
    const msgEl = document.getElementById('reset-password-message');
    const generateBtn = document.getElementById('reset-password-generate-btn');
    const copyBtn = document.getElementById('reset-password-copy-btn');
    const cancelBtn = document.getElementById('reset-password-cancel-btn');
    const saveBtn = document.getElementById('reset-password-save-btn');

    if (idInput) idInput.value = userId;
    if (infoEl) infoEl.textContent = t('settings.reset_pwd_user_info', { email: email || name }) || `Set a new temporary password for ${email || name}:`;
    if (msgEl) {
        msgEl.textContent = '';
        msgEl.style.color = '';
    }

    // Auto-generate an initial secure temporary password
    const tempPwd = _generateRandomPassword(10);
    if (pwdInput) {
        pwdInput.value = tempPwd;
    }

    if (generateBtn) {
        generateBtn.onclick = () => {
            if (pwdInput) {
                pwdInput.value = _generateRandomPassword(10);
                pwdInput.focus();
                pwdInput.select();
            }
        };
    }

    if (copyBtn) {
        copyBtn.onclick = async () => {
            if (pwdInput && pwdInput.value) {
                try {
                    await navigator.clipboard.writeText(pwdInput.value);
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = t('settings.copied') || 'Copié !';
                    setTimeout(() => { copyBtn.textContent = originalText; }, 1500);
                } catch (err) {
                    Logger.error('Copy to clipboard failed', err);
                }
            }
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => closeModal(modal);
    }

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.onclick = async () => {
            const password = pwdInput ? pwdInput.value.trim() : '';
            if (!password || password.length < 8) {
                if (msgEl) {
                    msgEl.textContent = t('settings.min_length_pwd') || 'Le mot de passe doit contenir au moins 8 caractères.';
                    msgEl.style.color = 'var(--clr-danger, #ef4444)';
                }
                return;
            }

            saveBtn.disabled = true;
            if (msgEl) {
                msgEl.textContent = t('modal.loading') || 'Loading...';
                msgEl.style.color = 'var(--clr-text-muted)';
            }

            try {
                const res = await API.resetUserPassword(userId, password);
                if (res.success) {
                    if (msgEl) {
                        msgEl.textContent = t('settings.reset_pwd_success') || 'Mot de passe réinitialisé avec succès !';
                        msgEl.style.color = 'var(--clr-success, #22c55e)';
                    }
                    Logger.success('Password reset successfully');
                    setTimeout(() => {
                        closeModal(modal);
                        saveBtn.disabled = false;
                    }, 1200);
                } else {
                    saveBtn.disabled = false;
                    if (msgEl) {
                        msgEl.textContent = res.error || 'Reset failed';
                        msgEl.style.color = 'var(--clr-danger, #ef4444)';
                    }
                }
            } catch (err) {
                saveBtn.disabled = false;
                if (msgEl) {
                    msgEl.textContent = err.message || 'Error occurred';
                    msgEl.style.color = 'var(--clr-danger, #ef4444)';
                }
            }
        };
    }

    openModal(modal);
    if (pwdInput) {
        pwdInput.focus();
        pwdInput.select();
    }
}

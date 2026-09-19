/**
 * profile-ui.js — Ananke v3.0
 * 
 * Responsabilité unique (S) : Affichage et gestion de la page Profil Utilisateur
 * au format page complète (comme Board Settings) : centré, sections, back button.
 */

import { state, getFullUrl } from './state.js';
import * as API from './api.js';
import { Logger, escapeHtml } from './utils.js';
import { getInitials, getAvatarGradient } from './avatar.js';
import { elements } from './dom.js';
import { updateUserUI } from './auth-ui.js';
import { renderBoard } from './board-ui.js';
import { refreshSearchUsers } from './search-ui.js';
import { t, getLanguage, setLanguage } from './i18n.js';

let _onBack = null;
let currentAvatarUrl = null;
let oldAvatarUrl = null;
let sessionAvatarUploads = [];

export function initProfileView({ onBack } = {}) {
    _onBack = onBack;
}

/**
 * Render the full-page profile view inside #view-profile
 * @param {{ onBack?: () => void }} options
 */
export async function renderProfileView({ onBack } = {}) {
    if (onBack) _onBack = onBack;

    const container = document.getElementById('view-profile');
    if (!container) return;

    const user = state.currentUser;
    if (!user) return;

    currentAvatarUrl = user.avatar_url || null;
    oldAvatarUrl = currentAvatarUrl;
    sessionAvatarUploads = [];

    const firstName = user.first_name || '';
    const lastName  = user.last_name  || '';
    const email     = user.email      || '';
    const role      = user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'Member';
    const initials  = getInitials(user);
    const gradient  = getAvatarGradient(user);

    const currentLang = getLanguage();

    container.innerHTML = `
        <div class="settings-page-header">
            <button class="settings-page-back-btn" id="profile-back-btn" title="${t('profile.back')}">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 class="settings-page-title">${t('profile.title')}</h1>
        </div>

        <form id="profile-main-form" style="display:flex;flex-direction:column;gap:1.5rem;">
            
            <!-- Section 1: Identity & Avatar -->
            <div class="settings-section">
                <h3 class="settings-section-title">
                    <span class="material-symbols-outlined">badge</span>
                    ${t('profile.section_info')}
                </h3>

                <!-- Avatar Upload Row -->
                <div class="profile-avatar-wrapper">
                    <div class="profile-avatar-preview" id="profile-avatar-preview" style="${currentAvatarUrl ? '' : `background:${gradient};`}">
                        <img id="profile-avatar-img" src="${currentAvatarUrl ? getFullUrl(currentAvatarUrl) : ''}" style="${currentAvatarUrl ? 'display:block;' : 'display:none;'}">
                        <div id="profile-avatar-initials" style="${currentAvatarUrl ? 'display:none;' : 'display:block;'}">${initials}</div>
                        <label for="profile-avatar-file-input" class="profile-avatar-overlay" title="${t('profile.photo_upload')}">
                            <span class="material-symbols-outlined">photo_camera</span>
                        </label>
                    </div>
                    <div class="profile-avatar-actions">
                        <div style="font-size:1rem;font-weight:600;color:var(--clr-text);">${escapeHtml(user.name || `${firstName} ${lastName}`.trim() || 'User')}</div>
                        <div style="display:flex;align-items:center;gap:10px;margin-top:4px;">
                            <span class="role-badge ${escapeHtml(user.role || 'reader')}">${escapeHtml(role)}</span>
                            <button type="button" id="profile-avatar-remove-btn" class="secondary-btn small-btn danger-text" style="${currentAvatarUrl ? 'display:inline-flex;' : 'display:none;'};align-items:center;gap:4px;padding:4px 8px;font-size:0.75rem;">
                                <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
                                ${t('profile.photo_remove')}
                            </button>
                        </div>
                    </div>
                    <input type="file" id="profile-avatar-file-input" accept="image/*" style="display:none;">
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:1rem;">
                    <div class="form-group">
                        <label class="form-label" for="profile-firstname">${t('profile.first_name')}</label>
                        <input class="form-input" id="profile-firstname" type="text" value="${escapeHtml(firstName)}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="profile-lastname">${t('profile.last_name')}</label>
                        <input class="form-input" id="profile-lastname" type="text" value="${escapeHtml(lastName)}" required>
                    </div>
                </div>

                <div class="form-group" style="margin-top:0.75rem;">
                    <label class="form-label" for="profile-email">${t('profile.email')}</label>
                    <input class="form-input" id="profile-email" type="email" value="${escapeHtml(email)}" required>
                </div>
            </div>

            <!-- Section 2: Security & Password -->
            <div class="settings-section">
                <h3 class="settings-section-title">
                    <span class="material-symbols-outlined">lock</span>
                    ${t('profile.section_security')}
                </h3>

                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:1rem;">
                    <div class="form-group">
                        <label class="form-label" for="profile-password">${t('profile.new_password')}</label>
                        <input class="form-input" id="profile-password" type="password" placeholder="${t('profile.new_password_placeholder')}" minlength="8" autocomplete="new-password">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="profile-password-confirm">${t('profile.confirm_password')}</label>
                        <input class="form-input" id="profile-password-confirm" type="password" placeholder="${t('profile.confirm_password_placeholder')}" autocomplete="new-password">
                    </div>
                </div>
                <div style="font-size:0.78rem;color:var(--clr-text-muted);margin-top:0.5rem;">
                    ${t('profile.password_hint')}
                </div>
            </div>

            <!-- Section 3: Preferences & Language -->
            <div class="settings-section">
                <h3 class="settings-section-title">
                    <span class="material-symbols-outlined">tune</span>
                    ${t('profile.section_preferences')}
                </h3>

                <div class="form-group" style="max-width:320px;">
                    <label class="form-label" for="profile-language-select">${t('profile.language_label')}</label>
                    <select class="form-input" id="profile-language-select">
                        <option value="en" ${currentLang === 'en' ? 'selected' : ''}>${t('profile.language_en')}</option>
                        <option value="fr" ${currentLang === 'fr' ? 'selected' : ''}>${t('profile.language_fr')}</option>
                    </select>
                </div>
            </div>

            <!-- Feedback message & Save action -->
            <div id="profile-form-message" style="font-size:0.88rem;min-height:1.2em;font-weight:500;"></div>
            
            <div style="display:flex;justify-content:flex-start;gap:12px;">
                <button type="submit" class="action-btn" id="profile-submit-btn" style="padding:10px 24px;font-size:0.9rem;">
                    <span class="material-symbols-outlined">save</span>
                    ${t('profile.btn_save')}
                </button>
            </div>
        </form>
    `;

    _bindEvents();
}

function _bindEvents() {
    // Back button
    document.getElementById('profile-back-btn')?.addEventListener('click', () => {
        if (_onBack) _onBack();
    });

    const fileInput  = document.getElementById('profile-avatar-file-input');
    const avatarImg  = document.getElementById('profile-avatar-img');
    const initialsEl = document.getElementById('profile-avatar-initials');
    const previewEl  = document.getElementById('profile-avatar-preview');
    const removeBtn  = document.getElementById('profile-avatar-remove-btn');
    const messageEl  = document.getElementById('profile-form-message');

    // Avatar upload handler
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const processUpload = async (uploadFile) => {
                try {
                    previewEl.style.opacity = '0.6';
                    const res = await API.uploadFiles([uploadFile]);
                    if (res.urls && res.urls.length > 0) {
                        sessionAvatarUploads.push(res.urls[0]);
                        currentAvatarUrl = res.urls[0];
                        avatarImg.src = getFullUrl(currentAvatarUrl);
                        avatarImg.style.display = 'block';
                        initialsEl.style.display = 'none';
                        previewEl.style.background = 'transparent';
                        if (removeBtn) removeBtn.style.display = 'inline-flex';
                    }
                } catch (err) {
                    Logger.error('Failed to upload avatar', err);
                    if (messageEl) {
                        messageEl.textContent = 'Failed to upload photo';
                        messageEl.style.color = 'var(--clr-danger)';
                    }
                } finally {
                    previewEl.style.opacity = '1';
                }
            };

            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                if (img.width !== img.height && typeof Cropper !== 'undefined' && elements.cropModal) {
                    elements.cropModal.classList.add('visible');
                    elements.cropImage.src = url;

                    if (window.cropperInstance) window.cropperInstance.destroy();
                    window.cropperInstance = new Cropper(elements.cropImage, {
                        aspectRatio: 1,
                        viewMode: 1
                    });

                    elements.cropSaveBtn.onclick = async () => {
                        const canvas = window.cropperInstance.getCroppedCanvas({ width: 300, height: 300 });
                        canvas.toBlob(async (blob) => {
                            elements.cropModal.classList.remove('visible');
                            window.cropperInstance.destroy();
                            window.cropperInstance = null;
                            const croppedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_cropped.jpg", { type: 'image/jpeg' });
                            await processUpload(croppedFile);
                        }, 'image/jpeg', 0.85);
                    };

                    elements.cropCloseBtn.onclick = () => {
                        elements.cropModal.classList.remove('visible');
                        if (window.cropperInstance) {
                            window.cropperInstance.destroy();
                            window.cropperInstance = null;
                        }
                    };
                } else {
                    processUpload(file);
                }
            };
            img.src = url;
        });
    }

    // Avatar remove button
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            currentAvatarUrl = '';
            avatarImg.src = '';
            avatarImg.style.display = 'none';
            initialsEl.style.display = 'block';
            initialsEl.textContent = getInitials(state.currentUser);
            previewEl.style.background = getAvatarGradient(state.currentUser);
            removeBtn.style.display = 'none';
        });
    }

    // Language selector
    const langSelect = document.getElementById('profile-language-select');
    if (langSelect) {
        langSelect.addEventListener('change', async (e) => {
            await setLanguage(e.target.value);
        });
    }

    // Form submission
    const form = document.getElementById('profile-main-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (messageEl) {
                messageEl.textContent = '';
                messageEl.style.color = '';
            }

            const firstName       = document.getElementById('profile-firstname').value.trim();
            const lastName        = document.getElementById('profile-lastname').value.trim();
            const email           = document.getElementById('profile-email').value.trim();
            const password        = document.getElementById('profile-password').value;
            const passwordConfirm = document.getElementById('profile-password-confirm').value;

            if (password && password !== passwordConfirm) {
                if (messageEl) {
                    messageEl.textContent = t('profile.passwords_mismatch');
                    messageEl.style.color = 'var(--clr-danger)';
                }
                return;
            }

            if (password && password.length < 8) {
                if (messageEl) {
                    messageEl.textContent = t('profile.password_hint');
                    messageEl.style.color = 'var(--clr-danger)';
                }
                return;
            }

            try {
                if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/') && currentAvatarUrl !== oldAvatarUrl) {
                    API.deleteMedia(oldAvatarUrl).catch(err => Logger.warn('Old avatar cleanup notice', err));
                }
                sessionAvatarUploads.forEach(u => {
                    if (u !== currentAvatarUrl) {
                        API.deleteMedia(u).catch(err => Logger.warn('Avatar cleanup notice', err));
                    }
                });
                sessionAvatarUploads = [];

                const res = await API.completeSetup({
                    firstName,
                    lastName,
                    email,
                    password,
                    avatar_url: currentAvatarUrl
                });

                if (res.success) {
                    state.currentUser = res.user;
                    updateUserUI();

                    if (elements.kanbanBoard && state.boardData) {
                        try {
                            renderBoard();
                            await refreshSearchUsers();
                        } catch (err) {
                            Logger.warn('Failed to re-render board', err);
                        }
                    }

                    if (state.socket) {
                        state.socket.emit('profileUpdated');
                    }

                    if (messageEl) {
                        messageEl.textContent = `✓ ${t('profile.saved_success')}`;
                        messageEl.style.color = 'var(--clr-success)';
                    }
                    Logger.success('Profile updated successfully');
                } else {
                    if (messageEl) {
                        messageEl.textContent = res.error || t('profile.save_failed');
                        messageEl.style.color = 'var(--clr-danger)';
                    }
                }
            } catch (err) {
                Logger.error('Failed to update profile', err);
                if (messageEl) {
                    messageEl.textContent = t('profile.save_failed');
                    messageEl.style.color = 'var(--clr-danger)';
                }
            }
        });
    }
}

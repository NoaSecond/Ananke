import { elements } from './dom.js';
import * as API from './api.js';
import { state } from './state.js';
import { Logger } from './utils.js';
import { openModal } from './modals.js';

export function initUserManagement() {
    if (elements.manageUsersBtn) {
        elements.manageUsersBtn.onclick = async () => {
            elements.settingsMenu.classList.add('hidden');
            openModal(elements.userManagementModal);
            loadUsers();
        };
    }

    if (elements.inviteForm) {
        elements.inviteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageEl = document.getElementById('invite-message');
            const email = document.getElementById('invite-email').value;
            const password = document.getElementById('invite-password').value;
            const role = document.getElementById('invite-role').value;

            try {
                const res = await API.inviteUser({ email, password, role });
                if (res.success) {
                    messageEl.textContent = 'Utilisateur invité avec succès !';
                    messageEl.style.color = '#22c55e';
                    elements.inviteForm.reset();
                    loadUsers();
                } else {
                    messageEl.textContent = res.error || 'Erreur lors de l\'invitation';
                    messageEl.style.color = '#ef4444';
                }
            } catch (err) {
                messageEl.textContent = 'Erreur réseau';
                messageEl.style.color = '#ef4444';
            }
        });
    }
}

export async function loadUsers() {
    const listEl = document.getElementById('user-list');
    listEl.innerHTML = '<div style="padding:1rem; text-align:center; opacity:0.7;">Chargement...</div>';

    try {
        const data = await API.getUsers();
        if (data.users && Array.isArray(data.users)) {
            renderUserList(data.users);
        } else {
            listEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--danger-color);">Impossible de charger la liste.</div>';
        }
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--danger-color);">Erreur de chargement. Vérifiez vos droits.</div>';
    }
}

function renderUserList(users) {
    const listEl = document.getElementById('user-list');
    if (users.length === 0) {
        listEl.innerHTML = '<div style="padding:1rem; text-align:center; opacity:0.7;">Aucun utilisateur trouvé.</div>';
        return;
    }

    listEl.innerHTML = users.map(u => {
        const isOwner = u.role === 'owner';
        const isSelf = state.currentUser && state.currentUser.id === u.id;

        return `
        <div class="user-row">
            <div class="user-info">
                <strong>${u.first_name || ''} ${u.last_name || ''}</strong>
                <small>${u.email}</small>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
                ${!isOwner ? `
                    <select onchange="window.changeUserRole(${u.id}, this.value)" class="small-input" style="width:auto; padding:2px 4px; font-size:0.8rem;">
                        <option value="reader" ${u.role === 'reader' ? 'selected' : ''}>Lecteur</option>
                        <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Éditeur</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                    ${!isSelf ? `<button onclick="window.deleteUser(${u.id})" class="text-danger io-btn" style="padding: 4px 8px; font-size: 0.8rem; border-color: var(--danger-color); color: var(--danger-color);">Supprimer</button>` : ''}
                ` : '<small style="opacity:0.7;">Propriétaire</small>'}
            </div>
        </div>
    `}).join('');
}

// Global Exposure for inline HTML click handlers
window.changeUserRole = async (id, role) => {
    try {
        const res = await API.updateUserRole(id, role);
        if (res.success) {
            Logger.success('Rôle mis à jour');
        } else {
            Logger.error(res.error || 'Erreur mise à jour rôle');
            loadUsers(); // Revert UI
        }
    } catch (e) {
        Logger.error('Erreur réseau');
        loadUsers();
    }
};

window.deleteUser = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
    try {
        const res = await API.deleteUser(id);
        if (res.success) {
            Logger.success('Utilisateur supprimé');
            loadUsers();
        } else {
            Logger.error(res.error || 'Erreur suppression');
        }
    } catch (e) {
        Logger.error('Erreur réseau');
    }
};

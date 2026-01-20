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
        const inviteRoleSelect = document.getElementById('invite-role');
        if (inviteRoleSelect) {
            inviteRoleSelect.addEventListener('change', (e) => {
                inviteRoleSelect.setAttribute('data-role', e.target.value);
            });
        }

        elements.inviteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const messageEl = document.getElementById('invite-message');
            const email = document.getElementById('invite-email').value;
            const password = document.getElementById('invite-password').value;
            const role = document.getElementById('invite-role').value;

            try {
                const res = await API.createAccount({ email, password, role });
                if (res.success) {
                    messageEl.textContent = 'Account created successfully!';
                    messageEl.style.color = '#22c55e';
                    elements.inviteForm.reset();
                    loadUsers();
                } else {
                    messageEl.textContent = res.error || 'Creation failed';
                    messageEl.style.color = '#ef4444';
                }
            } catch (err) {
                messageEl.textContent = 'Network error';
                messageEl.style.color = '#ef4444';
            }
        });
    }
}

export async function loadUsers() {
    const listEl = document.getElementById('user-list');
    listEl.innerHTML = '<div style="padding:1rem; text-align:center; opacity:0.7;">Loading...</div>';

    try {
        const data = await API.getUsers();
        if (data.users && Array.isArray(data.users)) {
            renderUserList(data.users);
        } else {
            listEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--danger-color);">Failed to load list.</div>';
        }
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--danger-color);">Loading error. Check permissions.</div>';
    }
}

function renderUserList(users) {
    const listEl = document.getElementById('user-list');
    if (users.length === 0) {
        listEl.innerHTML = '<div style="padding:1rem; text-align:center; opacity:0.7;">No users found.</div>';
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
                    <select onchange="window.changeUserRole(${u.id}, this.value)" class="small-select role-select" data-role="${u.role}">
                        <option value="reader" ${u.role === 'reader' ? 'selected' : ''}>Reader</option>
                        <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                    ${!isSelf ? `<button onclick="window.deleteUser(${u.id})" class="delete-user-btn">Delete</button>` : ''}
                ` : '<span class="role-badge owner">Owner</span>'}
            </div>
        </div>
    `}).join('');
}

// Global Exposure for inline HTML click handlers
window.changeUserRole = async (id, role) => {
    try {
        const res = await API.updateUserRole(id, role);
        if (res.success) {
            Logger.success('Role updated');
            // Update the data-role attribute for styling
            const selectEl = document.querySelector(`select[onchange*="changeUserRole(${id}"]`);
            if (selectEl) selectEl.setAttribute('data-role', role);
        } else {
            Logger.error(res.error || 'Update failed');
            loadUsers(); // Revert UI
        }
    } catch (e) {
        Logger.error('Network error');
        loadUsers();
    }
};

window.deleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
        const res = await API.deleteUser(id);
        if (res.success) {
            Logger.success('User deleted');
            loadUsers();
        } else {
            Logger.error(res.error || 'Deletion failed');
        }
    } catch (e) {
        Logger.error('Network error');
    }
};

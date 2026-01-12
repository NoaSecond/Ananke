import { API_URL, state } from './state.js';

export async function login(email, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    return res.json();
}

export async function logout() {
    return fetch(`${API_URL}/auth/logout`, { method: 'POST' });
}

export async function getMe() {
    const res = await fetch(`${API_URL}/auth/me`);
    if (res.ok) {
        return res.json();
    }
    throw new Error('Not authenticated');
}

export async function completeSetup(data) {
    const res = await fetch(`${API_URL}/auth/complete-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function inviteUser(data) {
    const res = await fetch(`${API_URL}/auth/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function getUsers() {
    const res = await fetch(`${API_URL}/auth/users`);
    return res.json();
}

export async function getSimpleList() {
    const res = await fetch(`${API_URL}/auth/list`);
    return res.json();
}

export async function updateUserRole(id, role) {
    const res = await fetch(`${API_URL}/auth/users/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
    });
    return res.json();
}

export async function deleteUser(id) {
    const res = await fetch(`${API_URL}/auth/users/${id}`, { method: 'DELETE' });
    return res.json();
}

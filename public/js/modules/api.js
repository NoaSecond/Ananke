import { API_URL, state } from './state.js';
import { compressImage } from './utils.js';

// Intercepteur global : tout 401 ou 403 reçu d'une API Ananke déclenche handleUnauthorized().
// Révoque immédiatement la session côté client et renvoie à l'écran de connexion.
let _handleUnauthorized = null;
export function setUnauthorizedHandler(fn) { _handleUnauthorized = fn; }

async function apiFetch(input, init = {}) {
    const res = await fetch(input, init);
    if ((res.status === 401 || res.status === 403) && _handleUnauthorized) {
        _handleUnauthorized();
        throw new Error('Unauthorized');
    }
    return res;
}

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
    const res = await apiFetch(`${API_URL}/auth/me`);
    if (res.ok) {
        return res.json();
    }
    throw new Error('Not authenticated');
}

export async function completeSetup(data) {
    const res = await apiFetch(`${API_URL}/auth/complete-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function createAccount(data) {
    const res = await apiFetch(`${API_URL}/auth/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

export async function getUsers() {
    const res = await apiFetch(`${API_URL}/auth/users`);
    return res.json();
}

export async function getSimpleList() {
    const res = await apiFetch(`${API_URL}/auth/list`);
    return res.json();
}

export async function updateUserRole(id, role) {
    const res = await apiFetch(`${API_URL}/auth/users/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
    });
    return res.json();
}

export async function deleteUser(id) {
    const res = await apiFetch(`${API_URL}/auth/users/${id}`, { method: 'DELETE' });
    return res.json();
}

export async function getBoard() {
    const res = await apiFetch(`${API_URL}/board`);
    if (res.ok) return res.json();
    throw new Error('Failed to fetch board');
}

export async function uploadFiles(files) {
    const formData = new FormData();
    for (const file of files) {
        const compressedFile = await compressImage(file);
        formData.append('files', compressedFile);
    }
    const res = await apiFetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
}

export async function deleteMedia(url) {
    const res = await apiFetch(`${API_URL}/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
    if (!res.ok) throw new Error('Failed to delete media');
    return res.json();
}

export async function getLogs() {
    const res = await apiFetch(`${API_URL}/logs`);
    if (res.ok) return res.json();
    throw new Error('Failed to fetch logs');
}

/**
 * api.js — Ananke v3.0
 *
 * Responsabilité unique (S) : couche de communication avec l'API REST.
 * Ouvert à l'extension (O) : ajouter une ressource = ajouter des fonctions, ne pas modifier apiFetch.
 * Interface ségrégée (I) : les modules importent uniquement les fonctions dont ils ont besoin.
 */

import { API_URL } from './state.js';
import { compressImage } from './utils.js';

// --------------------------------------------------------------------------
// Global 401 interceptor
// --------------------------------------------------------------------------

let _handleUnauthorized = null;
export function setUnauthorizedHandler(fn) { _handleUnauthorized = fn; }

async function apiFetch(input, init = {}) {
    const res = await fetch(input, init);
    if (res.status === 401 && _handleUnauthorized) {
        _handleUnauthorized();
        throw new Error('Unauthorized');
    }
    if (res.status === 403) {
        let errMsg = 'Accès refusé';
        try {
            const data = await res.clone().json();
            if (data?.error) errMsg = data.error;
        } catch (_) {}
        const err = new Error(errMsg);
        err.status = 403;
        throw err;
    }
    return res;
}

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------

export async function login(email, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
    });
    return res.json();
}

export async function logout() {
    return fetch(`${API_URL}/auth/logout`, { method: 'POST' });
}

export async function getMe() {
    const res = await apiFetch(`${API_URL}/auth/me`);
    if (res.ok) return res.json();
    throw new Error('Not authenticated');
}

export async function completeSetup(data) {
    const res = await apiFetch(`${API_URL}/auth/complete-setup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
    });
    return res.json();
}

// --------------------------------------------------------------------------
// Users (global management)
// --------------------------------------------------------------------------

export async function createAccount(data) {
    const res = await apiFetch(`${API_URL}/users`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
    });
    return res.json();
}

export async function getUsers() {
    const res = await apiFetch(`${API_URL}/users`);
    return res.json();
}

export async function getSimpleList() {
    const res = await apiFetch(`${API_URL}/users/list`);
    return res.json();
}

export async function updateUserRole(id, role) {
    const res = await apiFetch(`${API_URL}/users/${id}/role`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role }),
    });
    return res.json();
}

export async function deleteUser(id) {
    const res = await apiFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
    return res.json();
}

// --------------------------------------------------------------------------
// Boards
// --------------------------------------------------------------------------

export async function getBoards() {
    const res = await apiFetch(`${API_URL}/boards`);
    if (res.ok) return res.json();
    throw new Error('Failed to fetch boards');
}

export async function createBoard(data) {
    const res = await apiFetch(`${API_URL}/boards`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
    });
    return res.json();
}

export async function getBoard(boardId) {
    const res = await apiFetch(`${API_URL}/boards/${boardId}`);
    if (res.ok) return res.json();
    throw new Error('Failed to fetch board');
}

export async function updateBoardMeta(boardId, data) {
    const res = await apiFetch(`${API_URL}/boards/${boardId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
    });
    return res.json();
}

export async function deleteBoard(boardId) {
    const res = await apiFetch(`${API_URL}/boards/${boardId}`, { method: 'DELETE' });
    return res.json();
}

export async function saveBoardData(boardId, data) {
    const res = await apiFetch(`${API_URL}/boards/${boardId}/data`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
    });
    return res.json();
}

// --------------------------------------------------------------------------
// Board Members
// --------------------------------------------------------------------------

export async function getBoardMembers(boardId) {
    const res = await apiFetch(`${API_URL}/boards/${boardId}/members`);
    if (res.ok) return res.json();
    throw new Error('Failed to fetch members');
}

export async function addBoardMember(boardId, userId, role) {
    const res = await apiFetch(`${API_URL}/boards/${boardId}/members`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, role }),
    });
    return res.json();
}

export async function updateBoardMemberRole(boardId, userId, role) {
    const res = await apiFetch(`${API_URL}/boards/${boardId}/members/${userId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role }),
    });
    return res.json();
}

export async function removeBoardMember(boardId, userId) {
    const res = await apiFetch(`${API_URL}/boards/${boardId}/members/${userId}`, { method: 'DELETE' });
    return res.json();
}

// --------------------------------------------------------------------------
// Media & Files
// --------------------------------------------------------------------------

export async function uploadFiles(files) {
    const formData = new FormData();
    for (const file of files) {
        const compressed = await compressImage(file);
        formData.append('files', compressed);
    }
    const res = await apiFetch(`${API_URL}/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
}

export async function deleteMedia(url) {
    const res = await apiFetch(`${API_URL}/media`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error('Failed to delete media');
    return res.json();
}

// --------------------------------------------------------------------------
// System
// --------------------------------------------------------------------------

export async function getVersion() {
    const res = await apiFetch(`${API_URL}/version`);
    if (res.ok) return res.json();
    throw new Error('Failed to fetch version');
}

export async function getLogs() {
    const res = await apiFetch(`${API_URL}/logs`);
    if (res.ok) return res.json();
    throw new Error('Failed to fetch logs');
}

export async function clearServerLogs() {
    const res = await apiFetch(`${API_URL}/logs`, { method: 'DELETE' });
    if (res.ok) return res.json();
    throw new Error('Failed to clear logs');
}

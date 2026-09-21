/**
 * avatar.js — Centralized Avatar & Initials Management
 * 
 * Single source of truth for:
 * 1. Consistent initials calculation (e.g. "Noa Second" -> "N.S")
 * 2. Deterministic, attractive background gradients based on user identity
 * 3. Unified avatar rendering (HTML string or DOM Element)
 * 4. Automatic user overlay with current session state
 */

import { state, getFullUrl } from './state.js';
import { escapeHtml } from './utils.js';

// Curated palette of modern gradients for avatars without photos
const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)', // Indigo - Purple
    'linear-gradient(135deg, #3b82f6, #06b6d4)', // Blue - Cyan
    'linear-gradient(135deg, #10b981, #059669)', // Emerald - Green
    'linear-gradient(135deg, #f59e0b, #d97706)', // Amber - Orange
    'linear-gradient(135deg, #ec4899, #8b5cf6)', // Pink - Purple
    'linear-gradient(135deg, #14b8a6, #0284c7)', // Teal - Sky
    'linear-gradient(135deg, #f43f5e, #e11d48)', // Rose - Red
    'linear-gradient(135deg, #8b5cf6, #d946ef)', // Violet - Fuchsia
];

/**
 * Returns consistent initials for a user or name string.
 * Format: "F.L" if first & last name, or "F" if single name.
 * Example: "Noa Second" -> "N.S", { first_name: "Noa", last_name: "Second" } -> "N.S"
 */
export function getInitials(user) {
    if (!user) return '?';

    // Handle plain string input
    if (typeof user === 'string') {
        const clean = user.trim();
        if (!clean) return '?';
        const text = clean.includes('@') ? clean.split('@')[0] : clean;
        const parts = text.split(/[\s._-]+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}.${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return parts[0][0].toUpperCase();
    }

    // If user object has first_name and last_name
    if (user.first_name && user.last_name) {
        const f = String(user.first_name).trim();
        const l = String(user.last_name).trim();
        if (f && l) {
            return `${f[0]}.${l[0]}`.toUpperCase();
        }
        if (f) return f[0].toUpperCase();
        if (l) return l[0].toUpperCase();
    }

    // If user object has name (e.g. "Noa Second")
    if (user.name) {
        const parts = String(user.name).trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}.${parts[parts.length - 1][0]}`.toUpperCase();
        }
        if (parts.length === 1 && parts[0]) {
            return parts[0][0].toUpperCase();
        }
    }

    // Fallback to first_name only
    if (user.first_name && String(user.first_name).trim()) {
        return String(user.first_name).trim()[0].toUpperCase();
    }

    // Fallback to email
    if (user.email && String(user.email).trim()) {
        const beforeAt = String(user.email).split('@')[0];
        const parts = beforeAt.split(/[._-]/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}.${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return beforeAt[0].toUpperCase();
    }

    return '?';
}

/**
 * Returns deterministic background gradient for a user.
 */
export function getAvatarGradient(user) {
    const key = typeof user === 'string'
        ? user
        : (user?.id || user?.email || user?.name || 'default');
    let hash = 0;
    const str = String(key);
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[idx];
}

// Local cache for user profiles (keyed by id and email)
const userCache = new Map();

/**
 * Cache user objects for instant resolution across tasks and boards.
 * @param {Object|Array<Object>} users
 */
export function cacheUsers(users) {
    if (!users) return;
    const list = Array.isArray(users) ? users : [users];
    list.forEach(u => {
        if (!u || typeof u !== 'object') return;
        if (u.id) {
            const prev = userCache.get(u.id);
            userCache.set(u.id, { ...prev, ...u });
        }
        if (u.email) {
            const prev = userCache.get(u.email);
            userCache.set(u.email, { ...prev, ...u });
        }
    });
}

/**
 * Resolves user representation, merging with state.currentUser, userCache, and state.boardMembers
 */
export function resolveUser(user) {
    if (!user) return { id: null, name: 'Unknown', email: '', role: '', avatarUrl: null, initials: '?' };

    if (typeof user === 'string') {
        const cached = userCache.get(user);
        if (cached) return resolveUser(cached);
        return {
            id: null,
            name: user,
            email: user.includes('@') ? user : '',
            role: '',
            avatarUrl: null,
            initials: getInitials(user)
        };
    }

    const isCurrent = state.currentUser && (
        (user.id != null && user.id === state.currentUser.id) ||
        (user.email && user.email === state.currentUser.email) ||
        (user.name && user.name === state.currentUser.name)
    );

    const cached = isCurrent
        ? state.currentUser
        : ((user.id ? userCache.get(user.id) : null) ||
           (user.email ? userCache.get(user.email) : null) ||
           state.boardMembers?.find(m => m.id === user.id || (user.email && m.email === user.email)) ||
           null);

    const target = cached ? { ...user, ...cached } : user;

    let name = 'User';
    if (target.first_name && target.last_name) {
        name = `${target.first_name} ${target.last_name}`.trim();
    } else if (target.name) {
        name = target.name;
    } else if (target.email) {
        name = target.email;
    }

    const avatarUrl = target.avatar_url || user.avatar_url || cached?.avatar_url || target.avatarUrl || user.avatarUrl || null;

    return {
        id: target.id,
        name,
        email: target.email || '',
        role: target.role || target.board_role || '',
        avatarUrl,
        initials: getInitials(target)
    };
}

/**
 * Renders avatar HTML string (for use inside template literals)
 * @param {Object|string} user - User object or identifier
 * @param {Object} options - { className, title, style }
 */
export function renderAvatarHtml(user, options = {}) {
    const resolved = resolveUser(user);
    const className = options.className || 'avatar-circle';
    const title = options.title !== undefined ? options.title : resolved.name;
    const safeTitle = title ? escapeHtml(title) : '';
    const titleAttr = safeTitle ? `title="${safeTitle}"` : '';
    const extraStyle = options.style ? options.style : '';

    if (resolved.avatarUrl) {
        return `<img src="${getFullUrl(resolved.avatarUrl)}" class="${escapeHtml(className)}" ${titleAttr} style="object-fit:cover;${extraStyle}" alt="${escapeHtml(resolved.name)}">`;
    }

    const gradient = getAvatarGradient(resolved);
    return `<div class="${escapeHtml(className)}" ${titleAttr} style="background:${gradient};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;${extraStyle}">${resolved.initials}</div>`;
}

/**
 * Creates an avatar DOM element with live fallback handling
 * @param {Object|string} user - User object or identifier
 * @param {Object} options - { className, title, style }
 */
export function createAvatarElement(user, options = {}) {
    const resolved = resolveUser(user);
    const el = document.createElement('div');
    if (options.className) el.className = options.className;

    const title = options.title !== undefined ? options.title : resolved.name;
    if (title) el.title = title;

    if (options.style) {
        Object.assign(el.style, options.style);
    }

    if (resolved.avatarUrl) {
        el.style.backgroundImage = `url('${getFullUrl(resolved.avatarUrl)}')`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
    } else {
        el.style.backgroundImage = 'none';
        el.style.background = getAvatarGradient(resolved);
        el.style.color = '#fff';
        el.textContent = resolved.initials;
    }

    return el;
}

/**
 * Updates an existing avatar container element in-place
 * @param {HTMLElement} containerEl - DOM container element
 * @param {Object|string} user - User object or identifier
 */
export function updateAvatarElement(containerEl, user) {
    if (!containerEl) return;
    const resolved = resolveUser(user);

    if (resolved.avatarUrl) {
        containerEl.innerHTML = `<img src="${getFullUrl(resolved.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" alt="${escapeHtml(resolved.name)}">`;
        containerEl.style.background = 'transparent';
    } else {
        containerEl.innerHTML = resolved.initials;
        containerEl.style.background = getAvatarGradient(resolved);
        containerEl.style.color = '#fff';
    }
}

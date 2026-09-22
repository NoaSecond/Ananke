/**
 * validate.js — Ananke v3.0
 *
 * Responsabilité unique (S) : validation et sanitisation des inputs côté serveur.
 * Ouvert à l'extension (O) : ajouter un schéma = ajouter une constante et une fonction.
 * Interface ségrégée (I) : chaque route importe uniquement les validators dont elle a besoin.
 *
 * Cybersécurité :
 * - Validation stricte avant toute logique métier
 * - Protection contre XSS via sanitisation des chaînes
 * - Pattern allowlist pour les couleurs et les rôles
 */

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Strip HTML tags and trim a string.
 * @param {string} str
 * @returns {string}
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').trim();
}

/**
 * Validate hex color (#RRGGBB).
 * @param {string} color
 * @returns {boolean}
 */
function isValidHexColor(color) {
    return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --------------------------------------------------------------------------
// Allowed value sets
// --------------------------------------------------------------------------

const ALLOWED_GLOBAL_ROLES  = ['user', 'admin', 'reader', 'editor'];          // owner not settable via API
const ALLOWED_BOARD_ROLES   = ['reader', 'editor', 'board_admin'];

// --------------------------------------------------------------------------
// Validators (Express middleware factories)
// --------------------------------------------------------------------------

/**
 * Validate the body for creating/updating a board.
 */
function validateBoard(req, res, next) {
    const { name, description, color, icon } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Le nom du board est requis.' });
    }
    if (name.trim().length > 100) {
        return res.status(400).json({ error: 'Le nom du board ne doit pas dépasser 100 caractères.' });
    }
    if (description !== undefined && typeof description === 'string' && description.length > 500) {
        return res.status(400).json({ error: 'La description ne doit pas dépasser 500 caractères.' });
    }
    if (color !== undefined && !isValidHexColor(color)) {
        return res.status(400).json({ error: 'La couleur doit être au format hexadécimal (#RRGGBB).' });
    }
    if (icon !== undefined && (typeof icon !== 'string' || icon.length > 50)) {
        return res.status(400).json({ error: 'Icône invalide.' });
    }

    // Sanitize
    req.body.name        = sanitizeString(name);
    req.body.description = description ? sanitizeString(description) : '';
    if (icon) req.body.icon = sanitizeString(icon);

    next();
}

/**
 * Validate the body for creating a user account.
 */
function validateCreateAccount(req, res, next) {
    const { email, password, role } = req.body;

    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Format d\'adresse email invalide.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }
    if (password.length > 128) {
        return res.status(400).json({ error: 'Mot de passe trop long.' });
    }

    const userRole = role || 'user';
    if (!ALLOWED_GLOBAL_ROLES.includes(userRole) && req.user?.role !== 'owner') {
        return res.status(400).json({ error: 'Rôle invalide.' });
    }
    // Owner can also set 'owner' role
    if (!['user', 'reader', 'editor', 'admin', 'owner'].includes(userRole)) {
        return res.status(400).json({ error: 'Rôle invalide.' });
    }

    req.body.email = email.toLowerCase().trim();
    next();
}

/**
 * Validate the body for updating a global user role.
 */
function validateUserRole(req, res, next) {
    const { role } = req.body;
    if (!ALLOWED_GLOBAL_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide. Valeurs acceptées : user, admin.' });
    }
    next();
}

/**
 * Validate the body for adding/updating a board member role.
 */
function validateBoardMemberRole(req, res, next) {
    const { role } = req.body;
    if (!ALLOWED_BOARD_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Rôle board invalide. Valeurs acceptées : reader, editor, board_admin.' });
    }
    next();
}

/**
 * Validate the body for completing profile setup.
 */
function validateProfileSetup(req, res, next) {
    const { firstName, lastName, email } = req.body;

    if (!firstName || sanitizeString(firstName).length === 0) {
        return res.status(400).json({ error: 'Le prénom est requis.' });
    }
    if (!lastName || sanitizeString(lastName).length === 0) {
        return res.status(400).json({ error: 'Le nom est requis.' });
    }
    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Format d\'adresse email invalide.' });
    }
    if (firstName.length > 50 || lastName.length > 50) {
        return res.status(400).json({ error: 'Prénom ou nom trop long (max 50 caractères).' });
    }

    req.body.firstName = sanitizeString(firstName);
    req.body.lastName  = sanitizeString(lastName);
    req.body.email     = email.toLowerCase().trim();
    next();
}

/**
 * Validate the body for resetting a user's password.
 */
function validateResetPassword(req, res, next) {
    const { password } = req.body;

    if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }
    if (password.length > 128) {
        return res.status(400).json({ error: 'Mot de passe trop long.' });
    }

    next();
}

module.exports = {
    validateBoard,
    validateCreateAccount,
    validateUserRole,
    validateBoardMemberRole,
    validateProfileSetup,
    validateResetPassword,
    sanitizeString,
    isValidHexColor,
    isValidEmail,
    ALLOWED_GLOBAL_ROLES,
    ALLOWED_BOARD_ROLES,
};


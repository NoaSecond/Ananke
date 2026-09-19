/**
 * requireRole.js — Ananke v3.0
 *
 * Responsabilité unique (S) : RBAC global (par rôle d'instance).
 * Ouvert à l'extension (O) : ajouter un rôle = ajouter une entrée dans GLOBAL_ROLES.
 * Interface ségrégée (I) : les routes board n'importent pas ce middleware, elles utilisent boardAccess.js.
 */

// Hierarchy — index = privilege level (higher = more privileged)
const GLOBAL_ROLES = ['reader', 'editor', 'admin', 'owner'];

/**
 * Returns an Express middleware that enforces a minimum global role.
 * @param {string} minRole - Minimum required role (e.g. 'admin')
 */
function requireRole(minRole) {
    return (req, res, next) => {
        if (!req.user) return res.sendStatus(401);

        const userIndex = GLOBAL_ROLES.indexOf(req.user.role);
        const minIndex  = GLOBAL_ROLES.indexOf(minRole);

        if (userIndex === -1 || minIndex === -1) {
            return res.status(500).json({ error: 'Invalid role configuration' });
        }

        if (userIndex >= minIndex) {
            next();
        } else {
            res.status(403).json({ error: `Requires ${minRole} role or higher` });
        }
    };
}

module.exports = { requireRole, GLOBAL_ROLES };

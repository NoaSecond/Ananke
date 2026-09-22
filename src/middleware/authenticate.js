/**
 * authenticate.js — Ananke v3.0
 *
 * Responsabilité unique (S) : vérification JWT + révocation par token_version et instance_id.
 * Extrait de auth.js (v2) pour respecter le SRP.
 * Toute route qui nécessite une authentification importe CE middleware uniquement (I).
 */

const jwt = require('jsonwebtoken');
const { getInstanceId } = require('../config/database');
const userRepository = require('../repositories/userRepository');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;

function clearTokenCookie(req, res) {
    const cookiePath = process.env.APP_BASE_PATH || req.headers['x-forwarded-prefix'] || '/';
    const isSecure = process.env.NODE_ENV === 'production'
        || req.secure
        || req.headers['x-forwarded-proto'] === 'https'
        || process.env.COOKIE_SECURE === 'true';
    res.clearCookie('token', { path: cookiePath, httpOnly: true, secure: isSecure, sameSite: 'strict' });
    if (cookiePath !== '/') {
        res.clearCookie('token', { path: '/', httpOnly: true, secure: isSecure, sameSite: 'strict' });
    }
}

/**
 * Express middleware — attaches `req.user` on success, returns 401 on failure.
 */
async function authenticate(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch {
        clearTokenCookie(req, res);
        return res.status(401).json({ error: 'Session expirée ou invalide.' });
    }

    try {
        const instanceId = await getInstanceId();
        if (decoded.iid !== instanceId) {
            clearTokenCookie(req, res);
            return res.status(401).json({ error: 'Session invalide, veuillez vous reconnecter.' });
        }

        const user = await userRepository.findById(decoded.id);
        if (!user) {
            clearTokenCookie(req, res);
            return res.status(401).json({ error: 'Utilisateur introuvable.' });
        }

        const expectedVersion = user.token_version || 1;
        const tokenVersion    = decoded.tv          || 1;
        if (tokenVersion !== expectedVersion) {
            clearTokenCookie(req, res);
            return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter.' });
        }

        // Merge fresh DB data into decoded token (role may have changed)
        decoded.role = user.role;
        req.user = decoded;
        next();
    } catch (err) {
        logger.error(`authenticate middleware error: ${err.message}`);
        return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
}

module.exports = authenticate;

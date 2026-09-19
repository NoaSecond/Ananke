/**
 * auth.js (routes) — Ananke v3.0
 *
 * Responsabilité unique (S) : authentification uniquement (login, logout, me, setup).
 * La gestion des utilisateurs est dans users.js (extraction SRP).
 * Routes utilisent les repositories via DIP — pas de SQL direct ici.
 */

const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const authenticate    = require('../middleware/authenticate');
const { validateProfileSetup } = require('../middleware/validate');
const userRepository  = require('../repositories/userRepository');
const { getInstanceId } = require('../config/database');
const { processAvatar } = require('../utils/fileHelper');
const logger          = require('../utils/logger');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// --------------------------------------------------------------------------
// Rate limiting
// --------------------------------------------------------------------------

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.' },
});

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function displayName(user) {
    return user.first_name ? `${user.first_name} ${user.last_name}` : (user.name || user.email);
}

async function issueToken(user) {
    const instanceId = await getInstanceId();
    return jwt.sign(
        {
            id:                user.id,
            role:              user.role,
            name:              displayName(user),
            is_setup_complete: user.is_setup_complete,
            tv:                user.token_version || 1,
            iid:               instanceId,
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function setCookieToken(res, token) {
    res.cookie('token', token, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   24 * 60 * 60 * 1000,
        path:     '/',
    });
}

// --------------------------------------------------------------------------
// POST /api/auth/login
// --------------------------------------------------------------------------

router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }

    try {
        const user = await userRepository.findByEmail(email);

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            logger.warn(`Failed login: ${email} from ${clientIp}`);
            return res.status(401).json({ error: 'Identifiants invalides' });
        }

        const name = displayName(user);
        logger.info(`User logged in: ${name} (${user.role}) from ${clientIp}`);

        const token = await issueToken(user);
        setCookieToken(res, token);

        res.json({
            success: true,
            require_setup: user.is_setup_complete === 0,
            user: {
                id:                user.id,
                name,
                role:              user.role,
                email:             user.email,
                first_name:        user.first_name,
                last_name:         user.last_name,
                is_setup_complete: user.is_setup_complete,
                avatar_url:        user.avatar_url,
            },
        });
    } catch (err) {
        logger.error(`Login error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// POST /api/auth/logout
// --------------------------------------------------------------------------

router.post('/logout', (req, res) => {
    res.clearCookie('token', { path: '/' });
    logger.info('User logged out');
    res.json({ success: true });
});

// --------------------------------------------------------------------------
// GET /api/auth/me
// --------------------------------------------------------------------------

router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await userRepository.findById(req.user.id);
        if (!user) return res.sendStatus(401);
        const name = user.first_name ? `${user.first_name} ${user.last_name}` : user.email;
        res.json({ user: { ...user, name, token_version: undefined } });
    } catch (err) {
        logger.error(`/me error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// POST /api/auth/complete-setup  (profile update)
// --------------------------------------------------------------------------

router.post('/complete-setup', authenticate, validateProfileSetup, async (req, res) => {
    const { firstName, lastName, email, password, avatar_url } = req.body;
    const userId = req.user.id;

    try {
        const current = await userRepository.findById(userId);
        if (!current) return res.sendStatus(404);

        // Process avatar if base64
        const finalAvatarUrl = (avatar_url !== undefined)
            ? processAvatar(avatar_url, userId, current.avatar_url)
            : undefined;

        let passwordHash;
        if (password) {
            if (password.length < 8)  return res.status(400).json({ error: 'Mot de passe trop court (min 8 caractères).' });
            if (password.length > 128) return res.status(400).json({ error: 'Mot de passe trop long.' });
            passwordHash = bcrypt.hashSync(password, 10);
        }

        await userRepository.updateProfile(userId, {
            firstName,
            lastName,
            email,
            passwordHash,
            avatarUrl: finalAvatarUrl,
        });

        const updated = await userRepository.findById(userId);
        const name = `${updated.first_name} ${updated.last_name}`;
        const token = await issueToken(updated);
        setCookieToken(res, token);

        logger.info(`Profile updated: ${name} (${updated.email})`);
        res.json({ success: true, user: { ...updated, name, token_version: undefined } });
    } catch (err) {
        logger.error(`complete-setup error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

module.exports = { router, authenticate };

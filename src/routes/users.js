/**
 * users.js (routes) — Ananke v3.0
 *
 * Responsabilité unique (S) : gestion globale des utilisateurs (CRUD admin).
 * Extrait de auth.js (v2) pour respecter le SRP.
 * Utilise les repositories via DIP — pas de SQL direct ici.
 */

const express  = require('express');
const bcrypt   = require('bcrypt');
const rateLimit = require('express-rate-limit');

const authenticate      = require('../middleware/authenticate');
const requireSetup      = require('../middleware/requireSetup');
const { requireRole }   = require('../middleware/requireRole');
const { validateCreateAccount, validateUserRole } = require('../middleware/validate');
const userRepository    = require('../repositories/userRepository');
const logger            = require('../utils/logger');

const router = express.Router();

// All user management routes require authentication, completed setup, and no-store cache
router.use(authenticate);
router.use(requireSetup);
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, private');
    next();
});

// --------------------------------------------------------------------------
// Rate limiting
// --------------------------------------------------------------------------

const createLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Trop de créations de compte. Réessayez dans 15 minutes.' },
});

// --------------------------------------------------------------------------
// POST /api/users  — Create account (admin+)
// --------------------------------------------------------------------------

router.post('/', requireRole('admin'), createLimiter, validateCreateAccount, async (req, res) => {
    const { email, password, role } = req.body;
    const userRole = role || 'user';

    // Only owner can assign owner role
    if (userRole === 'owner' && req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Seul un Owner peut créer un compte Owner.' });
    }

    try {
        const passwordHash = bcrypt.hashSync(password, 10);
        const { id } = await userRepository.create({ email, passwordHash, role: userRole });

        logger.success(`Account created: ${email} as ${userRole} (by ${req.user.name})`);
        res.status(201).json({ id, success: true, message: 'Compte créé avec succès' });
    } catch (err) {
        if (err.message?.includes('UNIQUE constraint failed')) {
            logger.warn(`Account creation failed — email already exists: ${email}`);
            return res.status(409).json({ error: 'Email déjà utilisé' });
        }
        logger.error(`Account creation error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// GET /api/users  — List all users (admin+)
// --------------------------------------------------------------------------

router.get('/', requireRole('admin'), async (req, res) => {
    try {
        const users = await userRepository.findAll();
        res.json({
            users: users.map(u => ({
                ...u,
                name: u.first_name ? `${u.first_name} ${u.last_name}` : u.email,
            })),
        });
    } catch (err) {
        logger.error(`List users error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// GET /api/users/list  — Lightweight list for assignee pickers (F-03 minimization)
// --------------------------------------------------------------------------

router.get('/list', async (req, res) => {
    try {
        const users = await userRepository.findAllSimple();
        res.json({
            users: users.map(u => ({
                id:         u.id,
                name:       u.first_name ? `${u.first_name} ${u.last_name}`.trim() : 'Membre',
                avatar_url: u.avatar_url,
            })),
        });
    } catch (err) {
        logger.error(`Simple list error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// PUT /api/users/:id/role  — Update global role (admin+)
// --------------------------------------------------------------------------

router.put('/:id/role', requireRole('admin'), validateUserRole, async (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;

    // Prevent privilege escalation: admin cannot set owner role
    if (role === 'owner' && req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Seul un Owner peut attribuer le rôle Owner.' });
    }
    // Prevent self-demotion
    if (userId === req.user.id) {
        return res.status(400).json({ error: 'Impossible de modifier son propre rôle.' });
    }

    try {
        const target = await userRepository.findById(userId);
        if (!target) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        const { changed } = await userRepository.updateRole(userId, role);
        if (!changed) return res.status(404).json({ error: 'Utilisateur non trouvé ou action interdite (Owner)' });

        logger.info(`Role updated: ${target.email} → ${role} (by ${req.user.name})`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Update role error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// DELETE /api/users/:id  — Delete user (admin+)
// --------------------------------------------------------------------------

router.delete('/:id', requireRole('admin'), async (req, res) => {
    const userId = req.params.id;

    if (userId === req.user.id) {
        return res.status(400).json({ error: 'Impossible de se supprimer soi-même.' });
    }

    try {
        const target = await userRepository.findById(userId);
        if (!target) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        const { changed } = await userRepository.remove(userId);
        if (!changed) return res.status(404).json({ error: 'Utilisateur non trouvé ou action interdite' });

        logger.info(`User deleted: ${target.email} (by ${req.user.name})`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Delete user error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

module.exports = router;

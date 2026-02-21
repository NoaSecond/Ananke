const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const logger = require('../utils/logger');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'ananke-secret-key-prod-rev2';

// Login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) {
            logger.error(`Database error during login: ${err.message}`);
            return res.status(500).json({ error: err.message });
        }
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            logger.warn(`Failed login attempt for email: ${email}`);
            return res.status(401).json({ error: 'Identifiants invalides' });
        }

        const displayName = user.first_name ? `${user.first_name} ${user.last_name}` : (user.name || user.email);
        logger.info(`User logged in: ${displayName} (${user.role})`);

        const token = jwt.sign(
            { id: user.id, role: user.role, name: displayName, is_setup_complete: user.is_setup_complete },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            require_setup: user.is_setup_complete === 0,
            user: {
                id: user.id,
                name: displayName,
                role: user.role,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                is_setup_complete: user.is_setup_complete,
                avatar_url: user.avatar_url
            }
        });
    });
});

// Middleware for token authentication
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

// Middleware for Role-Based Access Control
const requireRole = (minRole) => {
    return (req, res, next) => {
        if (!req.user) return res.sendStatus(401);
        const roles = ['reader', 'editor', 'admin', 'owner']; // Order matters: 0, 1, 2, 3
        const userRoleIndex = roles.indexOf(req.user.role);
        const requiredRoleIndex = roles.indexOf(minRole);

        // Allow if user has higher or equal timestamp logic (index)
        if (userRoleIndex >= requiredRoleIndex) {
            next();
        } else {
            res.status(403).json({ error: `Requires ${minRole} role` });
        }
    }
};

// CREATE ACCOUNT (Admin/Owner only)
router.post('/create-account', authenticateToken, requireRole('admin'), (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email et Mot de passe requis' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const userRole = role || 'reader';

    db.run("INSERT INTO users (email, password_hash, role, is_setup_complete) VALUES (?, ?, ?, 0)",
        [email, hash, userRole],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    logger.warn(`Account creation failed: email already exists (${email})`);
                    return res.status(409).json({ error: 'Email déjà utilisé' });
                }
                logger.error(`Database error during account creation: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.success(`Account created: ${email} with role ${userRole} (by ${req.user.name})`);
            res.json({ id: this.lastID, success: true, message: 'Compte créé avec succès' });
        }
    );
});

// COMPLETE SETUP / UPDATE PROFILE
router.post('/complete-setup', authenticateToken, (req, res) => {
    const { firstName, lastName, email, password, avatar_url } = req.body;
    const userId = req.user.id;

    if (!firstName || !lastName || !email) {
        return res.status(400).json({ error: 'Champs requis manquants' });
    }

    let query = "UPDATE users SET first_name = ?, last_name = ?, email = ?, is_setup_complete = 1";
    let params = [firstName, lastName, email];

    if (password) {
        const hash = bcrypt.hashSync(password, 10);
        query += ", password_hash = ?";
        params.push(hash);
    }

    if (avatar_url !== undefined) {
        query += ", avatar_url = ?";
        params.push(avatar_url);
    }

    query += " WHERE id = ?";
    params.push(userId);

    db.run(query, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Update token immediately? Client should re-login or better: we issue new token?
        // Let's Re-issue token to reflect updated name and setup status
        db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
            if (user) {
                const displayName = `${user.first_name} ${user.last_name}`;
                const token = jwt.sign(
                    { id: user.id, role: user.role, name: displayName, is_setup_complete: 1 },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 24 * 3600000 });
                res.json({ success: true, user: { ...user, name: displayName, password_hash: undefined } });
            } else {
                res.json({ success: true });
            }
        });
    });
});

// Logout
router.post('/logout', (req, res) => {
    logger.info('User logging out');
    res.clearCookie('token');
    res.json({ success: true });
});

// Get Current User
router.get('/me', authenticateToken, (req, res) => {
    db.get("SELECT id, first_name, last_name, email, role, is_setup_complete, avatar_url FROM users WHERE id = ?", [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            const displayName = row.first_name ? `${row.first_name} ${row.last_name}` : row.email;
            res.json({ user: { ...row, name: displayName } });
        } else {
            res.sendStatus(401);
        }
    });
});

// List Users
router.get('/users', authenticateToken, requireRole('admin'), (req, res) => {
    db.all("SELECT id, first_name, last_name, email, role, is_setup_complete, avatar_url FROM users", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const users = rows.map(u => ({
            ...u,
            name: u.first_name ? `${u.first_name} ${u.last_name}` : u.email
        }));
        res.json({ users: users });
    });
});

// Update User Role
router.put('/users/:id/role', authenticateToken, requireRole('admin'), (req, res) => {
    const { role } = req.body;
    const userId = req.params.id;

    if (!['reader', 'editor', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide' });
    }

    db.run("UPDATE users SET role = ? WHERE id = ? AND role != 'owner'", [role, userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Utilisateur non trouvé ou action interdite (Owner)' });
        res.json({ success: true });
    });
});

// Delete User
router.delete('/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const userId = req.params.id;
    // Prevent deleting self or Owner
    if (parseInt(userId) === req.user.id) {
        return res.status(400).json({ error: 'Impossible de se supprimer soi-même' });
    }

    db.run("DELETE FROM users WHERE id = ? AND role != 'owner'", [userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Utilisateur non trouvé ou action interdite' });
        res.json({ success: true });
    });
});

// List Simple (Assignees)
router.get('/list', authenticateToken, (req, res) => {
    db.all("SELECT id, first_name, last_name, email, avatar_url FROM users", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const users = rows.map(u => ({
            id: u.id,
            name: u.first_name ? `${u.first_name} ${u.last_name}` : u.email,
            avatar_url: u.avatar_url
        }));
        res.json({ users: users });
    });
});

module.exports = { router, authenticateToken, requireRole };

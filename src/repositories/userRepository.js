/**
 * userRepository.js — Ananke v3.0
 *
 * Responsabilité unique (S) : toutes les requêtes SQL concernant la table `users`.
 * Aucune logique métier ici — uniquement l'accès aux données.
 * Suit le contrat d'interface uniforme (L) : findById, findAll, create, update, delete.
 */

const db = require('../config/database');
const crypto = require('crypto');

/**
 * Find a user by their primary key.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
function findById(id) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id, email, first_name, last_name, role, is_setup_complete, avatar_url, token_version
             FROM users WHERE id = ?`,
            [id],
            (err, row) => err ? reject(err) : resolve(row || null)
        );
    });
}

/**
 * Find a user by email (includes password_hash for authentication).
 * @param {string} email
 * @returns {Promise<object|null>}
 */
function findByEmail(email) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id, email, password_hash, first_name, last_name, role,
                    is_setup_complete, avatar_url, token_version
             FROM users WHERE email = ?`,
            [email],
            (err, row) => err ? reject(err) : resolve(row || null)
        );
    });
}

/**
 * Return all users (no password_hash).
 * @returns {Promise<object[]>}
 */
function findAll() {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT id, email, first_name, last_name, role, is_setup_complete, avatar_url
             FROM users ORDER BY created_at ASC`,
            (err, rows) => err ? reject(err) : resolve(rows || [])
        );
    });
}

/**
 * Return a minimal list of users for assignee pickers.
 * @returns {Promise<object[]>}
 */
function findAllSimple() {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT id, first_name, last_name, email, avatar_url FROM users ORDER BY first_name`,
            (err, rows) => err ? reject(err) : resolve(rows || [])
        );
    });
}

/**
 * Create a new user account.
 * @param {{ email: string, passwordHash: string, role: string }} data
 * @returns {Promise<{ id: string }>}
 */
function create({ email, passwordHash, role }) {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        db.run(
            `INSERT INTO users (id, email, password_hash, role, is_setup_complete) VALUES (?, ?, ?, ?, 0)`,
            [id, email, passwordHash, role],
            function (err) {
                if (err) return reject(err);
                resolve({ id });
            }
        );
    });
}

/**
 * Update profile fields for a user.
 * @param {string} id
 * @param {{ firstName, lastName, email, passwordHash?, avatarUrl? }} data
 * @returns {Promise<void>}
 */
function updateProfile(id, { firstName, lastName, email, passwordHash, avatarUrl }) {
    return new Promise((resolve, reject) => {
        const sets = ['first_name = ?', 'last_name = ?', 'email = ?', 'is_setup_complete = 1'];
        const params = [firstName, lastName, email];

        if (passwordHash !== undefined) {
            sets.push('password_hash = ?', 'token_version = COALESCE(token_version, 1) + 1');
            params.push(passwordHash);
        }
        if (avatarUrl !== undefined) {
            sets.push('avatar_url = ?');
            params.push(avatarUrl);
        }
        params.push(id);

        db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params,
            (err) => err ? reject(err) : resolve());
    });
}

/**
 * Update a user's global role. Cannot modify the owner role.
 * @param {string} id
 * @param {string} role
 * @returns {Promise<{ changed: boolean }>}
 */
function updateRole(id, role) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE users SET role = ? WHERE id = ? AND role != 'owner'`,
            [role, id],
            function (err) {
                if (err) return reject(err);
                resolve({ changed: this.changes > 0 });
            }
        );
    });
}

/**
 * Delete a user. Cannot delete an owner.
 * @param {string} id
 * @returns {Promise<{ changed: boolean }>}
 */
function remove(id) {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM users WHERE id = ? AND role != 'owner'`,
            [id],
            function (err) {
                if (err) return reject(err);
                resolve({ changed: this.changes > 0 });
            }
        );
    });
}

module.exports = { findById, findByEmail, findAll, findAllSimple, create, updateProfile, updateRole, remove };

/**
 * boardRepository.js — Ananke v3.0
 *
 * Responsabilité unique (S) : toutes les requêtes SQL concernant la table `boards`.
 * Contrat d'interface uniforme (L) : findById, findAllForUser, create, update, delete.
 */

const db = require('../config/database');
const crypto = require('crypto');

/**
 * Find a board by its ID.
 * Returns null if not found.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
function findById(id) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id, name, description, icon, color, data, created_by, created_at FROM boards WHERE id = ?`,
            [id],
            (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                try { row.data = row.data ? JSON.parse(row.data) : {}; } catch { row.data = {}; }
                resolve(row);
            }
        );
    });
}

/**
 * Return all boards accessible to a given user.
 * - `owner` and `admin` see all boards.
 * - Other roles only see boards they are a member of.
 * @param {string} userId
 * @param {string} globalRole - The user's global role
 * @returns {Promise<object[]>}
 */
function findAllForUser(userId, globalRole) {
    return new Promise((resolve, reject) => {
        const isGlobalAdmin = ['admin', 'owner'].includes(globalRole);
        const query = isGlobalAdmin
            ? `SELECT b.id, b.name, b.description, b.icon, b.color, b.created_by, b.created_at,
                      'board_admin' AS board_role
               FROM boards b ORDER BY b.created_at ASC`
            : `SELECT b.id, b.name, b.description, b.icon, b.color, b.created_by, b.created_at,
                      bm.role AS board_role
               FROM boards b
               INNER JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
               ORDER BY b.created_at ASC`;

        const params = isGlobalAdmin ? [] : [userId];

        db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}

/**
 * Create a new board.
 * @param {{ name, description?, icon?, color?, data?, createdBy? }} data
 * @returns {Promise<object>} The created board (without data JSON)
 */
function create({ name, description = '', icon = 'dashboard', color = '#6366f1', data = {}, createdBy = null }) {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const dataStr = JSON.stringify(data);
        db.run(
            `INSERT INTO boards (id, name, description, icon, color, data, created_by) VALUES (?,?,?,?,?,?,?)`,
            [id, name, description, icon, color, dataStr, createdBy],
            function (err) {
                if (err) return reject(err);
                resolve({ id, name, description, icon, color, created_by: createdBy });
            }
        );
    });
}

/**
 * Update board metadata (not data/kanban content).
 * @param {string} id
 * @param {{ name?, description?, icon?, color? }} fields
 * @returns {Promise<{ changed: boolean }>}
 */
function updateMeta(id, { name, description, icon, color }) {
    return new Promise((resolve, reject) => {
        const sets = [];
        const params = [];
        if (name       !== undefined) { sets.push('name = ?');        params.push(name); }
        if (description !== undefined) { sets.push('description = ?'); params.push(description); }
        if (icon       !== undefined) { sets.push('icon = ?');        params.push(icon); }
        if (color      !== undefined) { sets.push('color = ?');       params.push(color); }
        if (sets.length === 0) return resolve({ changed: false });

        params.push(id);
        db.run(`UPDATE boards SET ${sets.join(', ')} WHERE id = ?`, params,
            function (err) { err ? reject(err) : resolve({ changed: this.changes > 0 }); });
    });
}

/**
 * Overwrite the kanban JSON data for a board.
 * @param {string} id
 * @param {object} data
 * @returns {Promise<void>}
 */
function updateData(id, data) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE boards SET data = ? WHERE id = ?`,
            [JSON.stringify(data), id],
            (err) => err ? reject(err) : resolve()
        );
    });
}

/**
 * Delete a board by ID (cascades to board_members).
 * @param {string} id
 * @returns {Promise<{ changed: boolean }>}
 */
function remove(id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM boards WHERE id = ?`, [id],
            function (err) { err ? reject(err) : resolve({ changed: this.changes > 0 }); });
    });
}

module.exports = { findById, findAllForUser, create, updateMeta, updateData, remove };

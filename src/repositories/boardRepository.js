/**
 * boardRepository.js — Ananke v3.0
 *
 * Responsabilité unique (S) : toutes les requêtes SQL concernant la table `boards`.
 * Contrat d'interface uniforme (L) : findById, findAllForUser, create, update, delete.
 */

const db = require('../config/database');
const crypto = require('crypto');

/**
 * Enrich task assignees inside board data with latest user information (avatars, names).
 * @param {object} boardData
 * @returns {Promise<object>}
 */
async function enrichBoardAssignees(boardData) {
    if (!boardData || !Array.isArray(boardData.workflows)) return boardData;

    const userIds = new Set();
    for (const workflow of boardData.workflows) {
        if (Array.isArray(workflow.tasks)) {
            for (const task of workflow.tasks) {
                if (Array.isArray(task.assignees)) {
                    for (const a of task.assignees) {
                        const id = typeof a === 'string' ? a : a?.id;
                        if (id) userIds.add(id);
                    }
                }
            }
        }
    }

    if (userIds.size === 0) return boardData;

    const idList = Array.from(userIds);
    const placeholders = idList.map(() => '?').join(',');
    const users = await new Promise((resolve) => {
        db.all(
            `SELECT id, first_name, last_name, email, avatar_url, role FROM users WHERE id IN (${placeholders})`,
            idList,
            (err, rows) => resolve(rows || [])
        );
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    for (const workflow of boardData.workflows) {
        if (Array.isArray(workflow.tasks)) {
            for (const task of workflow.tasks) {
                if (Array.isArray(task.assignees)) {
                    task.assignees = task.assignees.map(a => {
                        const id = typeof a === 'string' ? a : a?.id;
                        const u = userMap.get(id);
                        if (!u) return a;
                        const fullName = (u.first_name || u.last_name)
                            ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                            : u.email;
                        if (typeof a === 'string') {
                            return {
                                id: u.id,
                                name: fullName,
                                first_name: u.first_name,
                                last_name: u.last_name,
                                email: u.email,
                                avatar_url: u.avatar_url,
                                role: u.role,
                            };
                        }
                        return {
                            ...a,
                            id: u.id,
                            name: fullName || a.name,
                            first_name: u.first_name !== undefined ? u.first_name : a.first_name,
                            last_name: u.last_name !== undefined ? u.last_name : a.last_name,
                            email: u.email || a.email,
                            avatar_url: u.avatar_url,
                            role: u.role || a.role,
                        };
                    });
                }
            }
        }
    }

    return boardData;
}

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
            async (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                try { row.data = row.data ? JSON.parse(row.data) : {}; } catch { row.data = {}; }
                row.data = await enrichBoardAssignees(row.data);
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
            ? `SELECT b.id, b.name, b.description, b.icon, b.color, b.data, b.created_by, b.created_at,
                      'board_admin' AS board_role
               FROM boards b ORDER BY b.created_at ASC`
            : `SELECT b.id, b.name, b.description, b.icon, b.color, b.data, b.created_by, b.created_at,
                      bm.role AS board_role
               FROM boards b
               INNER JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
               ORDER BY b.created_at ASC`;

        const params = isGlobalAdmin ? [] : [userId];

        db.all(query, params, async (err, rows) => {
            if (err) return reject(err);
            const parsed = await Promise.all((rows || []).map(async row => {
                try {
                    row.data = row.data ? JSON.parse(row.data) : {};
                } catch {
                    row.data = {};
                }
                row.data = await enrichBoardAssignees(row.data);
                return row;
            }));
            resolve(parsed);
        });
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

module.exports = { findById, findAllForUser, create, updateMeta, updateData, remove, enrichBoardAssignees };

/**
 * memberRepository.js — Ananke v3.0
 *
 * Responsabilité unique (S) : toutes les requêtes SQL sur la table `board_members`.
 * Contrat d'interface uniforme (L) : findByBoard, findByBoardAndUser, hasAccess, add, updateRole, remove.
 */

const db = require('../config/database');

/**
 * List all members of a board with their user profile.
 * @param {string} boardId
 * @returns {Promise<object[]>}
 */
function findByBoard(boardId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, u.role AS global_role,
                    bm.role AS board_role, bm.added_at
             FROM board_members bm
             INNER JOIN users u ON u.id = bm.user_id
             WHERE bm.board_id = ?
             ORDER BY bm.added_at ASC`,
            [boardId],
            (err, rows) => err ? reject(err) : resolve(rows || [])
        );
    });
}

/**
 * Find a single membership record.
 * Returns null if the user is not a member.
 * @param {string} boardId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
function findByBoardAndUser(boardId, userId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT board_id, user_id, role FROM board_members WHERE board_id = ? AND user_id = ?`,
            [boardId, userId],
            (err, row) => err ? reject(err) : resolve(row || null)
        );
    });
}

/**
 * Check whether a user has any access to a board (is a member).
 * Global admin/owner bypass is handled at the middleware level, not here.
 * @param {string} boardId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
function hasAccess(boardId, userId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ? LIMIT 1`,
            [boardId, userId],
            (err, row) => err ? reject(err) : resolve(!!row)
        );
    });
}

/**
 * Add a user to a board. Silently ignored if already a member.
 * @param {string} boardId
 * @param {string} userId
 * @param {string} role - 'reader' | 'editor' | 'board_admin'
 * @returns {Promise<void>}
 */
function add(boardId, userId, role = 'reader') {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR IGNORE INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)`,
            [boardId, userId, role],
            (err) => err ? reject(err) : resolve()
        );
    });
}

/**
 * Update a member's role on a board.
 * @param {string} boardId
 * @param {string} userId
 * @param {string} role
 * @returns {Promise<{ changed: boolean }>}
 */
function updateRole(boardId, userId, role) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ?`,
            [role, boardId, userId],
            function (err) { err ? reject(err) : resolve({ changed: this.changes > 0 }); }
        );
    });
}

/**
 * Remove a user from a board.
 * @param {string} boardId
 * @param {string} userId
 * @returns {Promise<{ changed: boolean }>}
 */
function remove(boardId, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM board_members WHERE board_id = ? AND user_id = ?`,
            [boardId, userId],
            function (err) { err ? reject(err) : resolve({ changed: this.changes > 0 }); }
        );
    });
}

/**
 * Find all members for a list of board IDs.
 * Returns an object mapping boardId -> Array of member objects.
 * @param {string[]} boardIds
 * @returns {Promise<Record<string, object[]>>}
 */
function findByBoardIds(boardIds) {
    if (!boardIds || boardIds.length === 0) return Promise.resolve({});

    return new Promise((resolve, reject) => {
        const placeholders = boardIds.map(() => '?').join(',');
        db.all(
            `SELECT bm.board_id, u.id, u.first_name, u.last_name, u.email, u.avatar_url,
                    bm.role AS board_role, bm.added_at
             FROM board_members bm
             INNER JOIN users u ON u.id = bm.user_id
             WHERE bm.board_id IN (${placeholders})
             ORDER BY bm.added_at ASC`,
            boardIds,
            (err, rows) => {
                if (err) return reject(err);
                const map = {};
                (rows || []).forEach(row => {
                    if (!map[row.board_id]) map[row.board_id] = [];
                    map[row.board_id].push({
                        id: row.id,
                        first_name: row.first_name,
                        last_name: row.last_name,
                        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
                        email: row.email,
                        avatar_url: row.avatar_url,
                        board_role: row.board_role,
                    });
                });
                resolve(map);
            }
        );
    });
}

module.exports = { findByBoard, findByBoardIds, findByBoardAndUser, hasAccess, add, updateRole, remove };

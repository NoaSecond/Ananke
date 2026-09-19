/**
 * database.js — Ananke v3.0
 *
 * Responsabilité unique (S) : connexion SQLite + initialisation du schéma.
 * Toutes les requêtes métier passent par les repositories (D — Dependency Inversion).
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, '../../ananke.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        logger.error('Error opening database:', err.message);
    } else {
        logger.success(`Connected to the SQLite database at: ${dbPath}`);
        initDb();
    }
});

// --------------------------------------------------------------------------
// Schema initialization
// --------------------------------------------------------------------------

function initDb() {
    db.serialize(() => {
        // Enable foreign key enforcement
        db.run('PRAGMA foreign_keys = ON');

        // ── Users ─────────────────────────────────────────────────────────
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id             TEXT PRIMARY KEY,
            email          TEXT UNIQUE NOT NULL,
            password_hash  TEXT NOT NULL,
            first_name     TEXT,
            last_name      TEXT,
            role           TEXT NOT NULL DEFAULT 'reader',
            is_setup_complete INTEGER NOT NULL DEFAULT 0,
            avatar_url     TEXT,
            token_version  INTEGER NOT NULL DEFAULT 1,
            created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (!err) runUserMigrations();
        });

        // ── Instance config ────────────────────────────────────────────────
        db.run(`CREATE TABLE IF NOT EXISTS instance_config (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`, () => {
            db.get("SELECT value FROM instance_config WHERE key = 'instance_id'", (err, row) => {
                if (!row) {
                    db.run("INSERT INTO instance_config (key, value) VALUES ('instance_id', ?)",
                        [crypto.randomUUID()]);
                    logger.info('instance_id generated (first install).');
                }
            });
        });

        // ── Boards ────────────────────────────────────────────────────────
        db.run(`CREATE TABLE IF NOT EXISTS boards (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT,
            icon        TEXT    NOT NULL DEFAULT 'dashboard',
            color       TEXT    NOT NULL DEFAULT '#6366f1',
            data        TEXT,
            created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // ── Board members ─────────────────────────────────────────────────
        db.run(`CREATE TABLE IF NOT EXISTS board_members (
            board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            user_id  TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
            role     TEXT NOT NULL DEFAULT 'reader',
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (board_id, user_id)
        )`);

        // ── Migration v2 → v3 (board_store → boards) ──────────────────────
        runV2Migration();
    });
}

// --------------------------------------------------------------------------
// Lazy column migrations for users table (handles upgrades from older installs)
// --------------------------------------------------------------------------

function runUserMigrations() {
    const columns = ['first_name TEXT', 'last_name TEXT',
        'is_setup_complete INTEGER DEFAULT 0',
        'avatar_url TEXT',
        'token_version INTEGER DEFAULT 1'];
    columns.forEach(col => {
        db.run(`ALTER TABLE users ADD COLUMN ${col}`, () => { /* ignore if exists */ });
    });

    // Migrate integer IDs to UUIDs if needed
    db.all('PRAGMA table_info(users)', (err, cols) => {
        if (err || !cols) return;
        const idCol = cols.find(c => c.name === 'id');
        if (idCol && idCol.type.toUpperCase() === 'INTEGER') {
            migrateUsersToUUID();
        }
    });
}

function migrateUsersToUUID() {
    logger.info('Migrating user IDs to UUID...');
    db.serialize(() => {
        db.run(`CREATE TABLE users_uuid_migration (
            id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT,
            first_name TEXT, last_name TEXT, role TEXT DEFAULT 'reader',
            is_setup_complete INTEGER DEFAULT 0, avatar_url TEXT,
            token_version INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.all('SELECT * FROM users', (err, rows) => {
            if (!err && rows) {
                rows.forEach(u => {
                    db.run(`INSERT INTO users_uuid_migration VALUES (?,?,?,?,?,?,?,?,?,?)`,
                        [crypto.randomUUID(), u.email, u.password_hash, u.first_name,
                            u.last_name, u.role, u.is_setup_complete, u.avatar_url,
                            u.token_version || 1, u.created_at]);
                });
            }
            db.run('DROP TABLE users', () => {
                db.run('ALTER TABLE users_uuid_migration RENAME TO users', () => {
                    logger.success('User UUID migration complete.');
                });
            });
        });
    });
}

// --------------------------------------------------------------------------
// Migration v2 → v3 : board_store → boards
// --------------------------------------------------------------------------

function runV2Migration() {
    // Check if the legacy board_store table still exists
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='board_store'`, (err, row) => {
        if (err || !row) {
            // No legacy table — ensure at least an empty default board exists
            ensureDefaultBoard();
            return;
        }

        // Legacy table exists: migrate its data to the new boards table
        db.get('SELECT count(*) AS count FROM boards', (err2, countRow) => {
            if (err2) return;

            if (countRow && countRow.count > 0) {
                // boards already populated — just drop the legacy table
                db.run('DROP TABLE IF EXISTS board_store', () => {
                    logger.info('Legacy board_store dropped (boards already populated).');
                });
                return;
            }

            // Migrate board_store data into the new boards table
            db.get('SELECT data FROM board_store WHERE id = 1', (err3, boardRow) => {
                const rawData = boardRow ? boardRow.data : null;
                let legacyData;
                try { legacyData = rawData ? JSON.parse(rawData) : null; } catch { legacyData = null; }

                const boardId = crypto.randomUUID();
                const boardName = (legacyData && legacyData.projectName) ? legacyData.projectName : 'Default';
                const boardData = legacyData || getDefaultBoardData();

                db.run(
                    `INSERT INTO boards (id, name, description, icon, color, data) VALUES (?, ?, ?, ?, ?, ?)`,
                    [boardId, boardName, 'Migrated from Ananke v2', 'dashboard', '#6366f1', JSON.stringify(boardData)],
                    (insertErr) => {
                        if (insertErr) {
                            logger.error(`Board migration failed: ${insertErr.message}`);
                            return;
                        }
                        logger.success(`Legacy board migrated as "${boardName}" (id: ${boardId}).`);

                        // Add all existing users as members of the migrated board
                        db.all('SELECT id, role FROM users', (userErr, users) => {
                            if (!userErr && users) {
                                users.forEach(u => {
                                    // owner/admin → board_admin, otherwise keep their role
                                    const boardRole = ['owner', 'admin'].includes(u.role)
                                        ? 'board_admin'
                                        : (u.role === 'editor' ? 'editor' : 'reader');
                                    db.run(
                                        `INSERT OR IGNORE INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)`,
                                        [boardId, u.id, boardRole]
                                    );
                                });
                                logger.info(`${users.length} user(s) added to migrated board.`);
                            }

                            db.run('DROP TABLE IF EXISTS board_store', () => {
                                logger.success('Legacy board_store dropped after migration.');
                            });
                        });
                    }
                );
            });
        });
    });
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function ensureDefaultBoard() {
    db.get('SELECT count(*) AS count FROM boards', (err, row) => {
        if (!err && row && row.count === 0) {
            const boardId = crypto.randomUUID();
            db.run(
                `INSERT INTO boards (id, name, description, icon, color, data) VALUES (?, ?, ?, ?, ?, ?)`,
                [boardId, 'My Board', 'Default board', 'dashboard', '#6366f1',
                    JSON.stringify(getDefaultBoardData())],
                () => logger.info('Default board created.')
            );
        }
    });
}

function getDefaultBoardData() {
    return {
        workflows: [
            { id: crypto.randomUUID(), title: 'To Do', color: '#ef4444', tasks: [] },
            { id: crypto.randomUUID(), title: 'In Progress', color: '#f97316', tasks: [] },
            { id: crypto.randomUUID(), title: 'To Test', color: '#3b82f6', tasks: [] },
            { id: crypto.randomUUID(), title: 'Done', color: '#22c55e', tasks: [] }
        ],
        tags: [],
        background: { type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
    };
}

// --------------------------------------------------------------------------
// Exports
// --------------------------------------------------------------------------

module.exports = db;

/**
 * Returns the unique instance_id for this installation.
 * Used to invalidate JWTs after a reset or on a different instance.
 */
module.exports.getInstanceId = () => new Promise((resolve, reject) => {
    db.get("SELECT value FROM instance_config WHERE key = 'instance_id'", (err, row) => {
        if (err || !row) return reject(new Error('instance_id not found in DB'));
        resolve(row.value);
    });
});

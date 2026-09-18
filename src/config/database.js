const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve(__dirname, '../../ananke.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        logger.error('Error opening database:', err.message);
    } else {
        logger.success(`Connected to the SQLite database at: ${dbPath}`);
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password_hash TEXT,
            first_name TEXT,
            last_name TEXT,
            role TEXT DEFAULT 'reader',
            is_setup_complete INTEGER DEFAULT 0,
            avatar_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (!err) {
                // Attempt to migrate if old table exists (simple check: try adding columns, ignore error if exist)
                // This is a "lazy" migration for development speed
                db.run("ALTER TABLE users ADD COLUMN first_name TEXT", () => { });
                db.run("ALTER TABLE users ADD COLUMN last_name TEXT", () => { });
                db.run("ALTER TABLE users ADD COLUMN is_setup_complete INTEGER DEFAULT 0", () => { });
                db.run("ALTER TABLE users ADD COLUMN avatar_url TEXT", () => { });
                db.run("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1", () => { });
            }
        });

        // Table instance_config : UUID unique par instance, changé à chaque reset.
        // Utilisé pour invalider tous les JWT après un reset ou sur une autre instance.
        db.run(`CREATE TABLE IF NOT EXISTS instance_config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`, () => {
            db.get("SELECT value FROM instance_config WHERE key = 'instance_id'", (err, row) => {
                if (!row) {
                    // Première installation : génération automatique de l'instance_id
                    db.run("INSERT INTO instance_config (key, value) VALUES ('instance_id', ?)", [crypto.randomUUID()]);
                    logger.info('instance_id généré (première installation).');
                }
            });
        });

        // Board table (Single Row Store for JSON Blob)
        db.run(`CREATE TABLE IF NOT EXISTS board_store (
            id INTEGER PRIMARY KEY DEFAULT 1,
            data TEXT
        )`);

        // Insert default empty board if not exists
        db.get("SELECT count(*) as count FROM board_store", (err, row) => {
            if (row && row.count === 0) {
                const defaultData = JSON.stringify({
                    projectName: 'Ananke',
                    workflows: [
                        { id: 1, title: 'To Do', color: '#ef4444', tasks: [] },
                        { id: 2, title: 'In Progress', color: '#f97316', tasks: [] },
                        { id: 3, title: 'To Test', color: '#3b82f6', tasks: [] },
                        { id: 4, title: 'Done', color: '#22c55e', tasks: [] }
                    ],
                    tags: [],
                    background: { type: 'gradient', value: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' }
                });
                db.run("INSERT INTO board_store (id, data) VALUES (1, ?)", [defaultData]);
                logger.info('Initialized board_store with default data.');
            }
        });
    });
}

module.exports = db;

// Retourne l'instance_id unique de cette installation/reset.
// Promesse pour s'assurer que la BDD est prête.
module.exports.getInstanceId = () => new Promise((resolve, reject) => {
    db.get("SELECT value FROM instance_config WHERE key = 'instance_id'", (err, row) => {
        if (err || !row) return reject(new Error('instance_id introuvable en BDD'));
        resolve(row.value);
    });
});


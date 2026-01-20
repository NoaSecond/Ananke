const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../ananke.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (!err) {
                // Attempt to migrate if old table exists (simple check: try adding columns, ignore error if exist)
                // This is a "lazy" migration for development speed
                db.run("ALTER TABLE users ADD COLUMN first_name TEXT", () => { });
                db.run("ALTER TABLE users ADD COLUMN last_name TEXT", () => { });
                db.run("ALTER TABLE users ADD COLUMN is_setup_complete INTEGER DEFAULT 0", () => { });
            }
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
                    tags: []
                });
                db.run("INSERT INTO board_store (id, data) VALUES (1, ?)", [defaultData]);
                console.log('Initialized board_store with default data.');
            }
        });
    });
}

module.exports = db;

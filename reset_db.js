require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const dbPath = process.env.DB_PATH || './ananke.db';
const db = new sqlite3.Database(dbPath);

const defaultData = {
    projectName: 'Nouveau Projet',
    tags: [],
    workflows: [
        { id: crypto.randomUUID(), title: 'To Do', color: '#ef4444', tasks: [] },
        { id: crypto.randomUUID(), title: 'In Progress', color: '#f97316', tasks: [] },
        { id: crypto.randomUUID(), title: 'To Test', color: '#3b82f6', tasks: [] },
        { id: crypto.randomUUID(), title: 'Done', color: '#22c55e', tasks: [] }
    ],
    background: { type: 'gradient', value: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' }
};

async function reset() {
    console.log('Resetting database...');

    db.serialize(async () => {
        db.run("DROP TABLE IF EXISTS users");
        db.run("DROP TABLE IF EXISTS board_store");
        db.run("DROP TABLE IF EXISTS instance_config");

        db.run(`CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            password_hash TEXT,
            first_name TEXT,
            last_name TEXT,
            role TEXT DEFAULT 'user',
            is_setup_complete INTEGER DEFAULT 0,
            avatar_url TEXT,
            token_version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE board_store (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT
        )`);

        // instance_config : identifiant unique par instance/reset.
        // Inclus dans chaque JWT — change à chaque reset, invalide tous les anciens tokens.
        db.run(`CREATE TABLE instance_config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);
        db.run(`INSERT INTO instance_config (key, value) VALUES ('instance_id', ?)`, [crypto.randomUUID()]);

        const hashedPassword = await bcrypt.hash('admin123', 10);
        const adminId = crypto.randomUUID();
        db.run(`INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_setup_complete) 
                VALUES (?, 'admin@setup.ananke', ?, '', '', 'owner', 0)`, [adminId, hashedPassword]);

        db.run(`INSERT INTO board_store (id, data) VALUES (1, ?)`, [JSON.stringify(defaultData)]);

        console.log('Database reset complete.');
        console.log('Admin user: admin@setup.ananke / admin123');
        console.log('New instance_id generated — all previous sessions are now invalid.');
        db.close();
    });
}

reset();

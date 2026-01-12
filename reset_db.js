const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./ananke.db');

const defaultData = {
    projectName: 'Nouveau Projet',
    tags: [],
    workflows: [
        { id: 1, title: 'To Do', color: '#ef4444', tasks: [] },
        { id: 2, title: 'In Progress', color: '#f97316', tasks: [] },
        { id: 3, title: 'To Test', color: '#3b82f6', tasks: [] },
        { id: 4, title: 'Done', color: '#22c55e', tasks: [] }
    ]
};

async function reset() {
    console.log('Resetting database...');

    db.serialize(async () => {
        db.run("DROP TABLE IF EXISTS users");
        db.run("DROP TABLE IF EXISTS board_store");

        db.run(`CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password_hash TEXT,
            first_name TEXT,
            last_name TEXT,
            role TEXT DEFAULT 'reader',
            is_setup_complete INTEGER DEFAULT 0
        )`);

        db.run(`CREATE TABLE board_store (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT
        )`);

        const hashedPassword = await bcrypt.hash('AdminAnanke', 10);
        db.run(`INSERT INTO users (email, password_hash, first_name, last_name, role, is_setup_complete) 
                VALUES ('admin@setup.ananke', ?, '', '', 'owner', 0)`, [hashedPassword]);

        db.run(`INSERT INTO board_store (id, data) VALUES (1, ?)`, [JSON.stringify(defaultData)]);

        console.log('Database reset complete.');
        console.log('Admin user: admin@setup.ananke / AdminAnanke');
        db.close();
    });
}

reset();

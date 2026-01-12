const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('ananke.db');

db.all("SELECT id, email, role, is_setup_complete, password_hash FROM users", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
});

#!/usr/bin/env node
/**
 * Ananke — Reset mot de passe
 * Liste les comptes de la BDD et permet de réinitialiser le mot de passe d'un utilisateur.
 * Usage : node reset_password.js  (ou npm run reset-password)
 */

require('dotenv').config();
const sqlite3  = require('sqlite3').verbose();
const bcrypt   = require('bcrypt');
const path     = require('path');
const readline = require('readline');

// ── Couleurs console ──────────────────────────────────────────────────────────
const c = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    cyan:   '\x1b[36m',
    gray:   '\x1b[90m',
    white:  '\x1b[37m',
};
const ok   = (msg) => console.log(`${c.green}${c.bold}  ✔${c.reset}  ${msg}`);
const warn = (msg) => console.log(`${c.yellow}${c.bold}  ⚠${c.reset}  ${msg}`);
const err  = (msg) => console.error(`${c.red}${c.bold}  ✘${c.reset}  ${msg}`);
const sep  = ()    => console.log(`${c.gray}  ${'─'.repeat(52)}${c.reset}`);

// ── Readline ──────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise(resolve => rl.question(question, resolve));

// ── BDD ───────────────────────────────────────────────────────────────────────
const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, 'ananke.db');

const db = new sqlite3.Database(dbPath, (dbErr) => {
    if (dbErr) {
        err(`Impossible d'ouvrir la BDD : ${dbErr.message}`);
        err(`Chemin tenté : ${dbPath}`);
        process.exit(1);
    }
});

// ── Rôle coloré ───────────────────────────────────────────────────────────────
function colorRole(role) {
    const map = { owner: c.red, admin: c.yellow, editor: c.cyan, reader: c.gray };
    return `${map[role] || c.white}${role}${c.reset}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log(`${c.bold}  Ananke — Reset mot de passe${c.reset}`);
    sep();

    // 1. Lister les utilisateurs
    const users = await new Promise((resolve, reject) => {
        db.all(
            'SELECT id, email, first_name, last_name, role FROM users ORDER BY id',
            [],
            (e, rows) => e ? reject(e) : resolve(rows)
        );
    });

    if (!users.length) {
        warn('Aucun utilisateur trouvé dans la BDD.');
        rl.close(); db.close(); return;
    }

    console.log(`${c.bold}  Utilisateurs disponibles :${c.reset}\n`);
    users.forEach((u, i) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
        console.log(
            `  ${c.bold}${c.cyan}[${i + 1}]${c.reset}` +
            `  ${String(u.id).padEnd(4)} ` +
            `${u.email.padEnd(35)} ` +
            `${name.padEnd(25)} ` +
            `${colorRole(u.role)}`
        );
    });

    console.log('');
    sep();

    // 2. Sélection de l'utilisateur
    let selectedUser;
    while (!selectedUser) {
        const input = (await ask(`${c.cyan}  Numéro du compte à modifier (1-${users.length}) : ${c.reset}`)).trim();
        const idx = parseInt(input, 10) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < users.length) {
            selectedUser = users[idx];
        } else {
            warn(`Entrée invalide. Saisis un nombre entre 1 et ${users.length}.`);
        }
    }

    const displayName = [selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || selectedUser.email;
    console.log('');
    console.log(`  Compte sélectionné : ${c.bold}${displayName}${c.reset} (${selectedUser.email}) — ${colorRole(selectedUser.role)}`);
    sep();

    // 3. Saisie du nouveau mot de passe
    let newPassword;
    while (!newPassword) {
        const pwd = (await ask(`${c.cyan}  Nouveau mot de passe (min. 8 caractères) : ${c.reset}`)).trim();
        if (pwd.length < 8) {
            warn('Le mot de passe doit faire au moins 8 caractères.');
        } else {
            const confirm = (await ask(`${c.cyan}  Confirmer le mot de passe : ${c.reset}`)).trim();
            if (pwd !== confirm) {
                warn('Les mots de passe ne correspondent pas.');
            } else {
                newPassword = pwd;
            }
        }
    }

    // 4. Hash + mise à jour
    console.log('');
    console.log(`  ${c.gray}Hashage en cours...${c.reset}`);
    const hash = await bcrypt.hash(newPassword, 10);

    await new Promise((resolve, reject) => {
        db.run(
            'UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?',
            [hash, selectedUser.id],
            function(e) { e ? reject(e) : resolve(this.changes); }
        );
    });

    sep();
    ok(`Mot de passe réinitialisé pour ${c.bold}${displayName}${c.reset} (${selectedUser.email})`);
    ok(`Session invalidée immédiatement — l'utilisateur devra se reconnecter.`);
    console.log('');

    rl.close();
    db.close();
}

main().catch(e => {
    err(`Erreur inattendue : ${e.message}`);
    rl.close();
    db.close();
    process.exit(1);
});

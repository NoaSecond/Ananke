#!/usr/bin/env node
/**
 * Ananke — Script d'installation
 *
 * Actions :
 *   1. Génère le .env avec un JWT_SECRET fort si absent ou compromis.
 *   2. Initialise la base de données (reset_db.js) :
 *        - Automatiquement si ananke.db n'existe pas encore (première install).
 *        - Uniquement si --reset est passé en argument (reset explicite).
 *      ⚠️  Sans --reset, une BDD existante n'est JAMAIS écrasée.
 *
 * Usage :
 *   npm run setup            → première installation (safe)
 *   npm run setup -- --reset → réinitialise tout (DÉTRUIT les données)
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ENV_PATH = path.join(__dirname, '.env');

// ── Couleurs console (sans dépendance externe) ────────────────────────────────
const c = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    cyan:   '\x1b[36m',
    gray:   '\x1b[90m',
};
const ok   = (msg) => console.log(`${c.green}${c.bold}  ✔${c.reset}  ${msg}`);
const warn = (msg) => console.log(`${c.yellow}${c.bold}  ⚠${c.reset}  ${msg}`);
const err  = (msg) => console.error(`${c.red}${c.bold}  ✘${c.reset}  ${msg}`);
const info = (msg) => console.log(`${c.cyan}     ${msg}${c.reset}`);
const sep  = ()    => console.log(`${c.gray}  ${'─'.repeat(52)}${c.reset}`);

// ── Constantes à ne jamais accepter ───────────────────────────────────────────
const COMPROMISED_SECRETS = [
    'ananke-secret-key-prod-rev2',
    '',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Génère un secret JWT de 64 octets en hex (128 caractères). */
function generateSecret() {
    return crypto.randomBytes(64).toString('hex');
}

/** Parse un fichier .env et retourne un objet { clé: valeur }. */
function parseEnv(content) {
    const result = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        result[key] = val;
    }
    return result;
}

/** Sérialise un objet en lignes .env (préserve les commentaires du template). */
function buildEnvContent(vars, template) {
    // On part du template pour conserver les commentaires et l'ordre
    let output = template;
    for (const [key, value] of Object.entries(vars)) {
        const re = new RegExp(`^(${key}=).*$`, 'm');
        if (re.test(output)) {
            output = output.replace(re, `$1${value}`);
        } else {
            output += `\n${key}=${value}`;
        }
    }
    return output;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('');
console.log(`${c.bold}  Ananke — Setup${c.reset}`);
sep();

// Template .env embarqué directement
const template = [
    '# Ananke — Configuration',
    '# Généré par setup.js — Ne jamais commiter ce fichier (.gitignore)',
    '',
    '# OBLIGATOIRE — Secret JWT unique par instance.',
    '# Régénérer avec : node setup.js',
    'JWT_SECRET=',
    '',
    '# Optionnel — mettre "production" en prod pour activer secure cookies, etc.',
    '# NODE_ENV=production',
    '',
].join('\n');

// Lire le .env existant ou partir d\'un objet vide
let existingVars = {};
let envExists = fs.existsSync(ENV_PATH);

if (envExists) {
    existingVars = parseEnv(fs.readFileSync(ENV_PATH, 'utf-8'));
    ok('.env existant détecté');
} else {
    info('.env absent — création en cours...');
}

// ── Vérification / génération du JWT_SECRET ───────────────────────────────────
let changed = false;
const currentSecret = existingVars['JWT_SECRET'] || '';

if (COMPROMISED_SECRETS.includes(currentSecret)) {
    if (currentSecret !== '') {
        warn('JWT_SECRET compromis détecté — remplacement automatique');
    }
    const newSecret = generateSecret();
    existingVars['JWT_SECRET'] = newSecret;
    changed = true;
    ok(`JWT_SECRET généré  ${c.gray}(${newSecret.slice(0, 16)}…)${c.reset}`);
} else {
    ok('JWT_SECRET déjà configuré — conservé sans modification');
}

// ── Écriture du .env ──────────────────────────────────────────────────────────
if (changed || !envExists) {
    const content = buildEnvContent(existingVars, template);
    fs.writeFileSync(ENV_PATH, content, 'utf-8');
    if (envExists) {
        ok('.env mis à jour');
    } else {
        ok('.env créé');
    }
} else {
    ok('.env inchangé');
}

sep();

// ── Initialisation de la base de données ──────────────────────────────────────
const DB_PATH       = path.join(__dirname, process.env.DB_PATH || 'ananke.db');
const RESET_SCRIPT  = path.join(__dirname, 'reset_db.js');
const forceReset    = process.argv.includes('--reset');
const dbExists      = fs.existsSync(DB_PATH);

console.log(`${c.bold}  Base de données${c.reset}`);
sep();

if (!fs.existsSync(RESET_SCRIPT)) {
    warn('reset_db.js introuvable — initialisation BDD ignorée');
} else if (forceReset) {
    warn('--reset détecté : la base de données va être réinitialisée (toutes les données seront perdues)');
    try {
        execSync(`node "${RESET_SCRIPT}"`, { stdio: 'inherit', cwd: __dirname });
        ok('Base de données réinitialisée');
    } catch (e) {
        err(`Échec de reset_db.js : ${e.message}`);
        process.exit(1);
    }
} else if (!dbExists) {
    info('Aucune BDD trouvée — initialisation automatique...');
    try {
        execSync(`node "${RESET_SCRIPT}"`, { stdio: 'inherit', cwd: __dirname });
        ok('Base de données initialisée');
    } catch (e) {
        err(`Échec de reset_db.js : ${e.message}`);
        process.exit(1);
    }
} else {
    ok(`BDD existante conservée  ${c.gray}(${path.basename(DB_PATH)})${c.reset}`);
    info(`Pour réinitialiser : ${c.cyan}npm run setup -- --reset${c.reset}`);
}

sep();
console.log(`${c.green}${c.bold}  Setup terminé.${c.reset} Lance ${c.cyan}npm start${c.reset} pour démarrer Ananke.`);
console.log('');

// Rappel sécurité
if (!fs.existsSync(path.join(__dirname, '.gitignore')) ||
    !fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf-8').includes('.env')) {
    warn('ATTENTION : .env n\'est pas dans le .gitignore ! Ne le commitez jamais.');
}

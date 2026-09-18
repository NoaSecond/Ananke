const pc = require('picocolors');

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'app.log');

// Assurer l'existence du dossier de logs
try {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
} catch (err) {
    console.error('Failed to create logs directory:', err);
}

const logsHistory = [];
const MAX_LOGS = 1000;

// [MED-05] — Charger l'historique récent depuis le fichier de log au démarrage
function initHistoryFromFile() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            const lines = content.trim().split('\n').filter(Boolean);
            const recentLines = lines.slice(-MAX_LOGS);
            for (const line of recentLines) {
                const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.*)$/);
                if (match) {
                    logsHistory.push({
                        timestamp: match[1],
                        type: match[2],
                        message: match[3]
                    });
                }
            }
        }
    } catch (err) {
        console.error('Failed to initialize logs from file:', err);
    }
}

initHistoryFromFile();

// Rotation simple si le fichier dépasse 10 Mo
function checkLogRotation() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > 10 * 1024 * 1024) {
                const oldLog = path.join(LOGS_DIR, 'app.log.old');
                if (fs.existsSync(oldLog)) {
                    fs.unlinkSync(oldLog);
                }
                fs.renameSync(LOG_FILE, oldLog);
            }
        }
    } catch (err) {
        console.error('Failed to rotate log file:', err);
    }
}

function formatArg(arg) {
    if (arg instanceof Error) {
        return arg.stack ? arg.stack.replace(/\r?\n\s*/g, ' | ') : arg.message;
    }
    if (typeof arg === 'object' && arg !== null) {
        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
    }
    return String(arg);
}

function saveLog(type, message, args) {
    const timestamp = new Date().toISOString();
    const formattedMessage = args.length > 0
        ? message + ' ' + args.map(formatArg).join(' ')
        : message;

    const logEntry = {
        timestamp,
        type,
        message: formattedMessage
    };

    logsHistory.push(logEntry);
    if (logsHistory.length > MAX_LOGS) {
        logsHistory.shift();
    }

    // [MED-05] — Persistance asynchrone sur disque
    checkLogRotation();
    const logLine = `[${timestamp}] [${type}] ${formattedMessage}\n`;
    fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) {
            console.error('Failed to write to log file:', err);
        }
    });

    if (logger.onLogCallback) {
        logger.onLogCallback(logEntry);
    }
}

const logger = {
    onLogCallback: null,
    getHistory: () => logsHistory,
    info: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`${pc.gray(`[${timestamp}]`)} ${pc.blue('INFO:')} ${message}`, ...args);
        saveLog('INFO', message, args);
    },
    error: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.error(`${pc.gray(`[${timestamp}]`)} ${pc.red('ERROR:')} ${pc.red(message)}`, ...args);
        saveLog('ERROR', message, args);
    },
    warn: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.warn(`${pc.gray(`[${timestamp}]`)} ${pc.yellow('WARN:')} ${message}`, ...args);
        saveLog('WARN', message, args);
    },
    success: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`${pc.gray(`[${timestamp}]`)} ${pc.green('SUCCESS:')} ${message}`, ...args);
        saveLog('SUCCESS', message, args);
    },
    socket: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`${pc.gray(`[${timestamp}]`)} ${pc.magenta('SOCKET:')} ${message}`, ...args);
        saveLog('SOCKET', message, args);
    },
    http: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`${pc.gray(`[${timestamp}]`)} ${pc.cyan('HTTP:')} ${message}`, ...args);
        saveLog('HTTP', message, args);
    }
};

module.exports = logger;

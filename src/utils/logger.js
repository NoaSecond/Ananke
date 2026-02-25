const pc = require('picocolors');

const logsHistory = [];
const MAX_LOGS = 1000;

function saveLog(type, message, args) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type,
        message: args.length > 0 ? message + ' ' + args.join(' ') : message
    };

    logsHistory.push(logEntry);
    if (logsHistory.length > MAX_LOGS) {
        logsHistory.shift();
    }

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

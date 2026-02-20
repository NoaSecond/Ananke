const pc = require('picocolors');

const logger = {
    info: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`${pc.gray(`[${timestamp}]`)} ${pc.blue('INFO:')} ${message}`, ...args);
    },
    error: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.error(`${pc.gray(`[${timestamp}]`)} ${pc.red('ERROR:')} ${pc.red(message)}`, ...args);
    },
    warn: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.warn(`${pc.gray(`[${timestamp}]`)} ${pc.yellow('WARN:')} ${message}`, ...args);
    },
    success: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`${pc.gray(`[${timestamp}]`)} ${pc.green('SUCCESS:')} ${message}`, ...args);
    },
    socket: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`${pc.gray(`[${timestamp}]`)} ${pc.magenta('SOCKET:')} ${message}`, ...args);
    },
    http: (message, ...args) => {
        const timestamp = new Date().toISOString();
        console.log(`${pc.gray(`[${timestamp}]`)} ${pc.cyan('HTTP:')} ${message}`, ...args);
    }
};

module.exports = logger;

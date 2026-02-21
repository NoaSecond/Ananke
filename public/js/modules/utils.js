export const Logger = {
    levels: {
        ERROR: { emoji: '🚨', color: '#ef4444', level: 0 },
        WARN: { emoji: '⚠️', color: '#f97316', level: 1 },
        INFO: { emoji: 'ℹ️', color: '#3b82f6', level: 2 },
        SUCCESS: { emoji: '✅', color: '#22c55e', level: 3 },
        DEBUG: { emoji: '🔍', color: '#8b5cf6', level: 4 }
    },

    // Log level for production (2 = INFO and below)
    currentLevel: window.location.hostname === 'localhost' ? 4 : 2,

    log(level, message, data = null) {
        const logLevel = this.levels[level];
        if (!logLevel || logLevel.level > this.currentLevel) return;

        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `${logLevel.emoji} [${timestamp}] ${message}`;

        console.log(
            `%c${logMessage}`,
            `color: ${logLevel.color}; font-weight: bold;`
        );

        if (data) {
            console.log('📊 Associated data:', data);
        }
    },

    error(message, error = null) {
        this.log('ERROR', message, error);
        if (error && error.stack) {
            console.error('📋 Stack trace:', error.stack);
        }
    },

    warn(message, data = null) {
        this.log('WARN', message, data);
    },

    info(message, data = null) {
        this.log('INFO', message, data);
    },

    success(message, data = null) {
        this.log('SUCCESS', message, data);
    },

    debug(message, data = null) {
        this.log('DEBUG', message, data);
    }
};

export const ErrorHandler = {
    handle(error, context = 'Application') {
        Logger.error(`Error in ${context}`, error);

        // Show notification to user if necessary
        if (error.userFacing) {
            this.showUserNotification(error.message, 'error');
        }
    },

    showUserNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${type === 'error' ? '🚨' : type === 'success' ? '' : 'ℹ️'}</span>
            <span class="notification-message">${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    },

    wrapAsync(fn, context) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handle(error, context);
                throw error;
            }
        };
    },

    wrapSync(fn, context) {
        return (...args) => {
            try {
                return fn(...args);
            } catch (error) {
                this.handle(error, context);
                throw error;
            }
        };
    }
};

export const getInitials = (user) => {
    if (!user) return '?';

    // Si on a un prénom et un nom
    if (user.first_name && user.last_name) {
        return `${user.first_name[0]}.${user.last_name[0]}`.toUpperCase();
    }

    // Si on a juste name (ex: "Noa Second")
    if (user.name) {
        const parts = user.name.split(' ').filter(p => p.trim() !== '');
        if (parts.length >= 2) {
            return `${parts[0][0]}.${parts[1][0]}`.toUpperCase();
        }
        return user.name[0].toUpperCase();
    }

    // En dernier recours: email ou autre
    if (user.first_name) return user.first_name[0].toUpperCase();
    if (user.email) return user.email[0].toUpperCase();

    return '?';
};

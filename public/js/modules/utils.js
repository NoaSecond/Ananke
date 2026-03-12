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

export const getContrastYIQ = (hexcolor) => {
    // If it's a valid hex color
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) {
        hexcolor = hexcolor.split('').map(c => c + c).join('');
    }
    if (hexcolor.length !== 6) return 'white'; // Default fallback

    var r = parseInt(hexcolor.substr(0, 2), 16);
    var g = parseInt(hexcolor.substr(2, 2), 16);
    var b = parseInt(hexcolor.substr(4, 2), 16);
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : 'white';
};

export async function compressImage(file, maxWidth = 2560, quality = 0.8) {
    if (!file.type.startsWith('image/')) return file;
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    if (file.size <= 1048576) return file; // Skip if <= 1MB (1024 * 1024)

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                if (file.type === 'image/jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }
                
                ctx.drawImage(img, 0, 0, width, height);

                const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

                canvas.toBlob((blob) => {
                    if (blob && blob.size < file.size) {
                        resolve(new File([blob], file.name, {
                            type: outputType,
                            lastModified: Date.now()
                        }));
                    } else {
                        resolve(file);
                    }
                }, outputType, quality);
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}

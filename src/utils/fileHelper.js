/**
 * fileHelper.js — Ananke v3.0
 *
 * Responsabilité unique (S) : gestion des fichiers uploadés (avatars, fonds d'écran, médias).
 * Extrait de server.js (v2) pour respecter le SRP.
 *
 * Cybersécurité :
 * - Whitelist MIME stricte
 * - Limite de taille
 * - Noms de fichiers aléatoires (anti-path-traversal)
 * - Nettoyage des anciens fichiers orphelins
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const multer = require('multer');
const logger = require('./logger');

// --------------------------------------------------------------------------
// MIME whitelists
// --------------------------------------------------------------------------

/** Accepted MIME types for generic media uploads (task attachments) */
const ALLOWED_MEDIA_MIMES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
];

/** Accepted MIME types for avatars and board backgrounds (images only) */
const ALLOWED_IMAGE_MIMES = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/gif':  'gif',
};

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

// --------------------------------------------------------------------------
// Multer configuration
// --------------------------------------------------------------------------

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../public/uploads'));
    },
    filename: (req, file, cb) => {
        const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
    },
});

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MEDIA_MIMES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Type de fichier non autorisé : ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_UPLOAD_SIZE },
});

// --------------------------------------------------------------------------
// Board background processing
// --------------------------------------------------------------------------

/**
 * Converts a base64 board background image to a file on disk.
 * Mutates `newBoardData.background.value` in place.
 * Cleans up the previous background file if any.
 *
 * @param {object} newBoardData
 * @param {object|null} oldBoardData
 */
function processBoardBackground(newBoardData, oldBoardData) {
    const bg = newBoardData?.background;
    if (!bg || bg.type !== 'image' || typeof bg.value !== 'string' || !bg.value.startsWith('data:image')) {
        return;
    }

    const matches = bg.value.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return;

    const mime = matches[1].toLowerCase();
    const ext  = ALLOWED_IMAGE_MIMES[mime];
    if (!ext) {
        logger.warn(`Rejected background MIME: ${mime}`);
        newBoardData.background = oldBoardData?.background || { type: 'default', value: '' };
        return;
    }

    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > MAX_UPLOAD_SIZE) {
        logger.warn(`Background too large: ${buffer.length} bytes`);
        newBoardData.background = oldBoardData?.background || { type: 'default', value: '' };
        return;
    }

    const bgDir = path.join(__dirname, '../../public/uploads/background');
    fs.mkdirSync(bgDir, { recursive: true });

    // Delete old background file if it was a file upload
    const oldValue = oldBoardData?.background?.value;
    if (typeof oldValue === 'string' && oldValue.startsWith('/uploads/background/')) {
        tryDelete(path.join(bgDir, path.basename(oldValue)));
    }

    const fileName = `bg_${crypto.randomUUID().slice(0, 8)}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(bgDir, fileName), buffer);
    newBoardData.background.value = `/uploads/background/${fileName}`;
    logger.info(`Background saved: ${fileName} (${Math.round(buffer.length / 1024)} KB)`);
}

// --------------------------------------------------------------------------
// Avatar processing
// --------------------------------------------------------------------------

/**
 * Converts a base64 avatar to a file on disk.
 * Returns the new URL, or the original value if nothing to convert.
 *
 * @param {string} base64DataUrl
 * @param {string} userId
 * @param {string|null} oldAvatarUrl - Existing avatar URL to delete
 * @returns {string} Disk URL or original string
 */
function processAvatar(base64DataUrl, userId, oldAvatarUrl = null) {
    if (!base64DataUrl || !base64DataUrl.startsWith('data:image')) {
        return base64DataUrl;
    }

    const matches = base64DataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return base64DataUrl;

    const mime = matches[1].toLowerCase();
    const ext  = ALLOWED_IMAGE_MIMES[mime];
    if (!ext) return base64DataUrl;

    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return base64DataUrl; // 5 MB max for avatars

    const avatarDir = path.join(__dirname, '../../public/uploads/Person');
    fs.mkdirSync(avatarDir, { recursive: true });

    // Delete old avatar if it was previously saved on disk
    if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/Person/')) {
        tryDelete(path.join(avatarDir, path.basename(oldAvatarUrl)));
    }

    const fileName = `user_${userId}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    fs.writeFileSync(path.join(avatarDir, fileName), buffer);
    return `/uploads/Person/${fileName}`;
}

// --------------------------------------------------------------------------
// Cleanup helpers
// --------------------------------------------------------------------------

/**
 * Safely delete a file, logging errors but not throwing.
 * @param {string} filePath
 */
function tryDelete(filePath) {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
        logger.error(`Failed to delete file: ${filePath} — ${e.message}`);
    }
}

/**
 * Delete a media file by its URL path.
 * Only files within /uploads/ are accepted.
 * @param {string} url - e.g. '/uploads/foo.jpg'
 * @returns {boolean} true if file existed and was deleted
 */
function deleteMediaByUrl(url) {
    if (!url || !url.startsWith('/uploads/')) return false;
    const filePath = path.join(__dirname, '../../public', path.normalize(url));
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
}

// Ensure the uploads directory exists at startup
fs.mkdirSync(path.join(__dirname, '../../public/uploads'), { recursive: true });

module.exports = {
    upload,
    processBoardBackground,
    processAvatar,
    tryDelete,
    deleteMediaByUrl,
    ALLOWED_IMAGE_MIMES,
    ALLOWED_MEDIA_MIMES,
};

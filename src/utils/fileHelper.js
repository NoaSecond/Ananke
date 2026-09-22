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
// Magic bytes detection & security validation
// --------------------------------------------------------------------------

const FORBIDDEN_EXTENSIONS = [
    '.html', '.htm', '.xhtml', '.svg', '.xml', '.php', '.phtml',
    '.js', '.mjs', '.cjs', '.sh', '.bat', '.cmd', '.exe', '.vbs', '.py', '.rb',
];

/**
 * Inspects a binary buffer header to determine real MIME type via magic bytes.
 * @param {Buffer} buffer
 * @returns {{ mime: string, ext: string } | null}
 */
function detectFileSignature(buffer) {
    if (!buffer || buffer.length < 4) return null;

    // Check for dangerous markup signatures in header text
    const headerStr = buffer.slice(0, Math.min(buffer.length, 512)).toString('latin1').toLowerCase();
    if (headerStr.includes('<html') || headerStr.includes('<!doctype') ||
        headerStr.includes('<script') || headerStr.includes('<svg') ||
        headerStr.includes('<?xml')) {
        return null;
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return { mime: 'image/jpeg', ext: 'jpg' };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
        return { mime: 'image/png', ext: 'png' };
    }

    // GIF: GIF87a (47 49 46 38 37 61) or GIF89a (47 49 46 38 39 61)
    if (buffer.length >= 6 &&
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61) {
        return { mime: 'image/gif', ext: 'gif' };
    }

    // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return { mime: 'image/webp', ext: 'webp' };
    }

    // MP4: bytes 4..7 are 'ftyp'
    if (buffer.length >= 8 &&
        buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return { mime: 'video/mp4', ext: 'mp4' };
    }

    // WEBM: 1A 45 DF A3
    if (buffer.length >= 4 &&
        buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
        return { mime: 'video/webm', ext: 'webm' };
    }

    return null;
}

// --------------------------------------------------------------------------
// Multer configuration
// --------------------------------------------------------------------------

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../public/uploads'));
    },
    filename: (req, file, cb) => {
        // Save to temporary unique filename without trusting client extension
        const tempName = `tmp_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`;
        cb(null, tempName);
    },
});

const fileFilter = (req, file, cb) => {
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    if (FORBIDDEN_EXTENSIONS.includes(rawExt)) {
        return cb(new Error(`Extension interdite : ${rawExt}`), false);
    }
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

/**
 * Middleware validating written files by magic bytes, renaming to safe extensions,
 * and removing any forged or malicious files.
 */
function validateAndSaveUploadedFiles(req, res, next) {
    if (!req.files || req.files.length === 0) return next();

    const verifiedFiles = [];
    try {
        for (const file of req.files) {
            const tempPath = file.path;
            const buffer = Buffer.alloc(512);
            let bytesRead = 0;
            const fd = fs.openSync(tempPath, 'r');
            try {
                bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
            } finally {
                fs.closeSync(fd);
            }

            const headerSlice = buffer.slice(0, bytesRead);
            const detected = detectFileSignature(headerSlice);

            // Check if magic bytes match allowed MIME types
            if (!detected || !ALLOWED_MEDIA_MIMES.includes(detected.mime)) {
                logger.warn(`Rejected upload: signature mismatch or unknown format for ${file.originalname}`);
                for (const f of req.files) tryDelete(f.path);
                return res.status(400).json({
                    error: 'Format de fichier non autorisé ou signature corrompue.',
                });
            }

            // Assign safe canonical filename with verified extension
            const finalFilename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${detected.ext}`;
            const finalPath = path.join(path.dirname(tempPath), finalFilename);
            fs.renameSync(tempPath, finalPath);

            file.filename = finalFilename;
            file.path     = finalPath;
            file.mimetype = detected.mime;
            verifiedFiles.push(file);
        }
        req.files = verifiedFiles;
        next();
    } catch (err) {
        logger.error(`Error validating uploaded files: ${err.message}`);
        for (const f of req.files) tryDelete(f.path);
        return res.status(500).json({ error: 'Erreur lors du traitement du fichier.' });
    }
}

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

    const detected = detectFileSignature(buffer);
    if (!detected || !ALLOWED_IMAGE_MIMES[detected.mime]) {
        logger.warn(`Rejected background: magic bytes mismatch or forbidden format`);
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

    const fileName = `bg_${crypto.randomUUID().slice(0, 8)}_${Date.now()}.${detected.ext}`;
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

    const detected = detectFileSignature(buffer);
    if (!detected || !ALLOWED_IMAGE_MIMES[detected.mime]) {
        logger.warn(`Rejected avatar: magic bytes mismatch or forbidden format`);
        return base64DataUrl;
    }

    const avatarDir = path.join(__dirname, '../../public/uploads/Person');
    fs.mkdirSync(avatarDir, { recursive: true });

    // Delete old avatar if it was previously saved on disk
    if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/Person/')) {
        tryDelete(path.join(avatarDir, path.basename(oldAvatarUrl)));
    }

    const fileName = `user_${userId}_${crypto.randomUUID().slice(0, 8)}.${detected.ext}`;
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
    if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) return false;
    const uploadsDir = path.resolve(__dirname, '../../public/uploads');
    const filePath = path.resolve(__dirname, '../../public', '.' + path.normalize(url));
    if (!filePath.startsWith(uploadsDir + path.sep) && filePath !== uploadsDir) {
        logger.warn(`Potential path traversal attempt in deleteMediaByUrl: ${url}`);
        return false;
    }
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
    validateAndSaveUploadedFiles,
    detectFileSignature,
    processBoardBackground,
    processAvatar,
    tryDelete,
    deleteMediaByUrl,
    ALLOWED_IMAGE_MIMES,
    ALLOWED_MEDIA_MIMES,
};

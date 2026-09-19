/**
 * server.js — Ananke v3.0
 *
 * Responsabilité unique (S) : orchestrateur — configure Express, monte les routes,
 * gère les WebSockets. Aucune logique métier directe ici.
 *
 * Les routes, middlewares et repositories gèrent chacun leur domaine (S, D).
 */

require('dotenv').config();

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const path         = require('path');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');
const fs           = require('fs');

const db                    = require('./src/config/database');
const { getInstanceId }     = require('./src/config/database');
const { router: authRouter } = require('./src/routes/auth');
const usersRouter           = require('./src/routes/users');
const boardsRouter          = require('./src/routes/boards');
const authenticate          = require('./src/middleware/authenticate');
const { requireRole }       = require('./src/middleware/requireRole');
const { requireBoardRole }  = require('./src/middleware/boardAccess');
const boardRepository       = require('./src/repositories/boardRepository');
const memberRepository      = require('./src/repositories/memberRepository');
const { upload, deleteMediaByUrl, processBoardBackground } = require('./src/utils/fileHelper');
const { describeChanges }   = require('./src/utils/boardDiff');
const logger                = require('./src/utils/logger');

// --------------------------------------------------------------------------
// Guard: JWT_SECRET must be strong and set
// --------------------------------------------------------------------------

const COMPROMISED_SECRETS = ['ananke-secret-key-prod-rev2'];
if (!process.env.JWT_SECRET || COMPROMISED_SECRETS.includes(process.env.JWT_SECRET)) {
    logger.error('FATAL: JWT_SECRET must be set to a strong, unique value.');
    logger.error('Generate one with: node -e "require(\'crypto\').randomBytes(64).toString(\'hex\')"');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// --------------------------------------------------------------------------
// Express setup
// --------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Content Security Policy
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:    ["'self'"],
            scriptSrc:     ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc:      ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc:       ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
            imgSrc:        ["'self'", 'data:', 'blob:', 'https:'],
            connectSrc:    ["'self'", 'ws:', 'wss:', 'https://raw.githubusercontent.com'],
            objectSrc:     ["'none'"],
            baseUri:       ["'self'"],
            upgradeInsecureRequests: null,
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

const server = http.createServer(app);
const io     = new Server(server, { maxHttpBufferSize: 1e7 });

// Log relay to admin sockets
logger.onLogCallback = (logEntry) => {
    if (!io?.sockets?.sockets) return;
    io.sockets.sockets.forEach(socket => {
        if (socket.user && ['admin', 'owner'].includes(socket.user.role)) {
            socket.emit('serverLog', logEntry);
        }
    });
};

// Payload limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Protected uploads (auth required)
app.use('/uploads', authenticate, express.static(path.join(__dirname, 'public', 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// HTTP logging
app.use(morgan((tokens, req, res) => [
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens['response-time'](req, res), 'ms',
].join(' '), { stream: { write: msg => logger.http(msg.trim()) } }));

// --------------------------------------------------------------------------
// API Routes
// --------------------------------------------------------------------------

app.use('/api/auth',   authRouter);
app.use('/api/users',  usersRouter);
app.use('/api/boards', boardsRouter);

// --------------------------------------------------------------------------
// File upload
// --------------------------------------------------------------------------

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Trop de requêtes d\'upload. Veuillez patienter.' },
});

app.post('/api/upload', authenticate, uploadLimiter, upload.array('files', 10), (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded.' });
    const urls = req.files.map(f => `/uploads/${f.filename}`);
    logger.info(`${req.files.length} file(s) uploaded by ${req.user.name}`);
    res.json({ urls });
});

app.delete('/api/media', authenticate, (req, res) => {
    const { url } = req.body;
    if (!url || !url.startsWith('/uploads/')) return res.status(400).json({ error: 'Invalid URL' });
    try {
        deleteMediaByUrl(url);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Delete media error: ${err.message}`);
        res.status(500).json({ error: 'Failed to delete media.' });
    }
});

// --------------------------------------------------------------------------
// Misc protected endpoints
// --------------------------------------------------------------------------

app.get('/api/version', authenticate, async (req, res) => {
    try {
        const pkg = JSON.parse(await fs.promises.readFile(path.join(__dirname, 'package.json'), 'utf8'));
        res.json({ version: pkg.version });
    } catch { res.status(500).json({ error: 'Could not read version' }); }
});

app.get('/api/logs', authenticate, requireRole('admin'), (req, res) => {
    res.json(logger.getHistory());
});

// --------------------------------------------------------------------------
// Central error handler
// --------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(err.status || 500).json({
        error: isProd ? 'Une erreur interne est survenue' : err.message,
    });
});

// ==========================================================================
// Socket.io — Board rooms (isolation par board)
// ==========================================================================

// Socket auth middleware
io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie;
    if (!cookie) return next(new Error('Authentication error'));

    const tokenPart = cookie.split(';').find(c => c.trim().startsWith('token='));
    if (!tokenPart) return next(new Error('Authentication error'));

    const jwtToken = tokenPart.split('=')[1];

    jwt.verify(jwtToken, JWT_SECRET, async (err, decoded) => {
        if (err) return next(new Error('Authentication error'));

        try {
            const instanceId = await getInstanceId();
            if (decoded.iid !== instanceId) return next(new Error('Authentication error'));

            db.get('SELECT role, email, avatar_url, first_name, last_name, token_version FROM users WHERE id = ?',
                [decoded.id], (dbErr, row) => {
                    if (dbErr || !row) return next(new Error('Authentication error'));
                    const expectedVersion = row.token_version || 1;
                    if ((decoded.tv || 1) !== expectedVersion) return next(new Error('Authentication error'));
                    decoded.role       = row.role;
                    decoded.email      = row.email;
                    decoded.avatar_url = row.avatar_url;
                    decoded.first_name = row.first_name;
                    decoded.last_name  = row.last_name;
                    decoded.name       = row.first_name ? `${row.first_name} ${row.last_name}`.trim() : (decoded.name || row.email);
                    socket.user = decoded;
                    next();
                });
        } catch { next(new Error('Authentication error')); }
    });
});

const onlineUsers = new Map(); // socket.id → user info

function getBoardPresenceMap() {
    const presence = {};
    if (!io || !io.sockets) return presence;
    for (const [_, s] of io.sockets.sockets) {
        if (s.currentBoardId && s.user) {
            if (!presence[s.currentBoardId]) {
                presence[s.currentBoardId] = [];
            }
            if (!presence[s.currentBoardId].some(u => u.id === s.user.id)) {
                presence[s.currentBoardId].push({
                    id:         s.user.id,
                    name:       s.user.name,
                    first_name: s.user.first_name,
                    last_name:  s.user.last_name,
                    avatar_url: s.user.avatar_url,
                    role:       s.user.role,
                    email:      s.user.email,
                });
            }
        }
    }
    return presence;
}

function broadcastBoardPresence() {
    io.emit('boardPresence', getBoardPresenceMap());
}

io.on('connection', (socket) => {
    socket.currentBoardId = null;
    logger.socket(`User connected: ${socket.user.name} (${socket.user.role}) [${socket.id}]`);

    onlineUsers.set(socket.id, {
        id:         socket.user.id,
        name:       socket.user.name,
        role:       socket.user.role,
        avatar_url: socket.user.avatar_url,
        email:      socket.user.email,
    });

    broadcastOnlineUsers();
    socket.emit('boardPresence', getBoardPresenceMap());

    // ── joinBoard — subscribe to a board room ──────────────────────────────
    socket.on('joinBoard', async (boardId) => {
        if (!boardId) return;

        try {
            const isGlobalAdmin = ['admin', 'owner'].includes(socket.user.role);
            const hasAccess = isGlobalAdmin
                || await memberRepository.hasAccess(boardId, socket.user.id);

            if (!hasAccess) {
                logger.warn(`Socket joinBoard denied: user=${socket.user.id} board=${boardId}`);
                socket.emit('error', { code: 403, message: 'Accès refusé à ce board' });
                return;
            }

            // Leave any previously joined board rooms
            const currentRooms = [...socket.rooms].filter(r => r.startsWith('board:'));
            for (const room of currentRooms) socket.leave(room);

            socket.join(`board:${boardId}`);
            socket.currentBoardId = boardId;

            // Send current board data only to this socket
            const board = await boardRepository.findById(boardId);
            if (board) socket.emit('boardUpdate', board);

            logger.socket(`User ${socket.user.name} joined board ${boardId}`);
            broadcastBoardPresence();
        } catch (err) {
            logger.error(`joinBoard error: ${err.message}`);
        }
    });

    // ── leaveBoard — leave currently joined board room ─────────────────────
    socket.on('leaveBoard', () => {
        if (!socket.currentBoardId) return;
        const currentRooms = [...socket.rooms].filter(r => r.startsWith('board:'));
        for (const room of currentRooms) socket.leave(room);
        const prevBoard = socket.currentBoardId;
        socket.currentBoardId = null;
        logger.socket(`User ${socket.user.name} left board ${prevBoard}`);
        broadcastBoardPresence();
    });

    // ── updateBoard — save board and broadcast to room ─────────────────────
    socket.on('updateBoard', async (newBoardData) => {
        const boardId = socket.currentBoardId;
        if (!boardId) return;

        const canEdit = ['editor', 'admin', 'owner'].includes(socket.user.role);
        if (!canEdit) {
            // Also check board-level role
            try {
                const member = await memberRepository.findByBoardAndUser(boardId, socket.user.id);
                if (!member || member.role === 'reader') {
                    logger.warn(`Unauthorized board edit: user=${socket.user.id} board=${boardId}`);
                    return;
                }
            } catch { return; }
        }

        try {
            const oldBoard = await boardRepository.findById(boardId);
            processBoardBackground(newBoardData, oldBoard?.data);

            const changes = describeChanges(oldBoard?.data || {}, newBoardData);
            await boardRepository.updateData(boardId, newBoardData);

            if (changes.length > 0) {
                changes.forEach(c => logger.info(`[Board:${boardId}] ${socket.user.name}: ${c}`));
            } else {
                logger.info(`[Board:${boardId}] Minor update by ${socket.user.name}`);
            }

            // Broadcast ONLY to members of this board room
            io.to(`board:${boardId}`).emit('boardUpdate', newBoardData);
        } catch (err) {
            logger.error(`updateBoard socket error: ${err.message}`);
        }
    });

    // ── updateTask — atomic task update ────────────────────────────────────
    socket.on('updateTask', async ({ task, workflowId }) => {
        const boardId = socket.currentBoardId;
        if (!boardId || !task || !workflowId) return;

        const canEdit = ['editor', 'admin', 'owner'].includes(socket.user.role);
        if (!canEdit) return;

        try {
            const board = await boardRepository.findById(boardId);
            if (!board?.data?.workflows) return;

            const boardData = board.data;

            // Remove task from its current column
            let oldIndex = -1;
            let oldWfId  = null;
            for (const wf of boardData.workflows) {
                const idx = wf.tasks.findIndex(t => t.id === task.id);
                if (idx !== -1) { oldWfId = wf.id; oldIndex = idx; wf.tasks.splice(idx, 1); break; }
            }

            // Insert into target column
            const targetWf = boardData.workflows.find(w => w.id === workflowId);
            if (targetWf) {
                if (oldWfId === workflowId && oldIndex !== -1) {
                    targetWf.tasks.splice(oldIndex, 0, task);
                } else {
                    targetWf.tasks.push(task);
                }
            }

            await boardRepository.updateData(boardId, boardData);
            logger.info(`[Board:${boardId}] Task "${task.title}" updated by ${socket.user.name}`);
            io.to(`board:${boardId}`).emit('boardUpdate', boardData);
        } catch (err) {
            logger.error(`updateTask socket error: ${err.message}`);
        }
    });

    // ── profileUpdated — refresh online user info ──────────────────────────
    socket.on('profileUpdated', () => {
        db.get('SELECT role, email, avatar_url, first_name, last_name FROM users WHERE id = ?',
            [socket.user.id], (err, row) => {
                if (err || !row) return;
                socket.user.role      = row.role;
                socket.user.email     = row.email;
                socket.user.avatar_url = row.avatar_url;
                socket.user.name      = row.first_name
                    ? `${row.first_name} ${row.last_name}`
                    : row.email;

                onlineUsers.set(socket.id, {
                    id:         socket.user.id,
                    name:       socket.user.name,
                    role:       socket.user.role,
                    avatar_url: socket.user.avatar_url,
                    email:      socket.user.email,
                });
                broadcastOnlineUsers();
                broadcastBoardPresence();
            });
    });

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
        onlineUsers.delete(socket.id);
        broadcastOnlineUsers();
        broadcastBoardPresence();
        logger.socket(`User disconnected: ${socket.user.name} (${reason})`);
    });

    function broadcastOnlineUsers() {
        io.emit('onlineUsers', Array.from(onlineUsers.values()));
    }
});

// --------------------------------------------------------------------------
// Start server
// --------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.success(`Ananke v3.0 running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

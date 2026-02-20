require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./src/config/database');
const { router: authRouter, authenticateToken } = require('./src/routes/auth');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const logger = require('./src/utils/logger');
const { describeChanges } = require('./src/utils/boardDiff');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100MB
});

const JWT_SECRET = process.env.JWT_SECRET || 'ananke-secret-key-prod-rev2';

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// HTTP Logging
app.use(morgan((tokens, req, res) => {
    const status = tokens.status(req, res);
    const color = status >= 500 ? 'red' : status >= 400 ? 'yellow' : status >= 300 ? 'cyan' : 'green';
    return [
        require('picocolors').gray(`[${new Date().toISOString()}]`),
        require('picocolors').cyan('HTTP:'),
        tokens.method(req, res),
        tokens.url(req, res),
        require('picocolors')[color](status),
        tokens['response-time'](req, res), 'ms'
    ].join(' ');
}));

// Routes
app.use('/api/auth', authRouter);

// Basic API Routes (Protected example)
app.get('/api/board', authenticateToken, (req, res) => {
    db.get("SELECT data FROM board_store WHERE id = 1", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row ? JSON.parse(row.data) : {});
    });
});

// Save Board API (for fallback or specific actions)
app.post('/api/board', authenticateToken, (req, res) => {
    // Determine permissions based on role? (Editors+)
    const roles = ['editor', 'admin', 'owner'];
    if (!roles.includes(req.user.role)) return res.sendStatus(403);

    const newBoardData = req.body;

    // Get current board to compare changes
    db.get("SELECT data FROM board_store WHERE id = 1", (err, row) => {
        if (err) {
            logger.error(`Error fetching board for diff (API): ${err.message}`);
            return res.status(500).json({ error: err.message });
        }

        const oldBoardData = row ? JSON.parse(row.data) : { workflows: [] };
        const changes = describeChanges(oldBoardData, newBoardData);

        const dataStr = JSON.stringify(newBoardData);
        db.run("UPDATE board_store SET data = ? WHERE id = 1", [dataStr], (err) => {
            if (err) {
                logger.error(`Error saving board to DB (API): ${err.message}`);
                return res.status(500).json({ error: err.message });
            }

            // Log the changes
            if (changes.length > 0) {
                changes.forEach(change => {
                    logger.info(`Modification via API by ${req.user.name}: ${change}`);
                });
            } else {
                logger.info(`Board updated via API by ${req.user.name}`);
            }

            res.json({ success: true });
            io.emit('boardUpdate', newBoardData);
        });
    });
});

// Socket.io Middleware for Auth
io.use((socket, next) => {
    // Extract token from cookie
    const cookie = socket.handshake.headers.cookie;
    if (!cookie) return next(new Error("Authentication error"));

    // Simple cookie parser for this specific use case
    const token = cookie.split(';').find(c => c.trim().startsWith('token='));
    if (!token) return next(new Error("Authentication error"));

    const jwtToken = token.split('=')[1];

    jwt.verify(jwtToken, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Authentication error"));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    logger.socket(`User connected: ${socket.user.name} (${socket.user.role}) [ID: ${socket.id}]`);

    // Send initial board data
    db.get("SELECT data FROM board_store WHERE id = 1", (err, row) => {
        if (row) {
            socket.emit('boardUpdate', JSON.parse(row.data));
        }
    });

    // Handle Board Updates from Clients
    socket.on('updateBoard', (newBoardData) => {
        // RBAC Check for Edit
        const canEdit = ['editor', 'admin', 'owner'].includes(socket.user.role);
        if (!canEdit) {
            logger.warn(`Unauthorized edit attempt: User ${socket.user.name} tried to update board but is ${socket.user.role}`);
            return;
        }

        // Get current board to compare changes
        db.get("SELECT data FROM board_store WHERE id = 1", (err, row) => {
            if (err) {
                logger.error(`Error fetching board for diff: ${err.message}`);
                return;
            }

            const oldBoardData = row ? JSON.parse(row.data) : { workflows: [] };
            const changes = describeChanges(oldBoardData, newBoardData);

            // Save to DB
            const dataStr = JSON.stringify(newBoardData);
            db.run("UPDATE board_store SET data = ? WHERE id = 1", [dataStr], (err) => {
                if (err) {
                    logger.error(`Error saving board to DB: ${err.message}`);
                    return;
                }

                // Log the changes
                if (changes.length > 0) {
                    changes.forEach(change => {
                        logger.info(`Modification by ${socket.user.name}: ${change}`);
                    });
                } else {
                    // Could be a minor change not caught by describeChanges (like colors)
                    logger.info(`Board updated by ${socket.user.name} (minor changes)`);
                }

                // Broadcast to all clients
                io.emit('boardUpdate', newBoardData);
            });
        });
    });

    socket.on('disconnect', (reason) => {
        logger.socket(`User disconnected: ${socket.user.name} (${reason})`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.success(`Server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

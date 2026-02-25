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
const multer = require('multer');

const fs = require('fs');
if (!fs.existsSync(path.join(__dirname, 'public', 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'public', 'uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100MB
});

logger.onLogCallback = (logEntry) => {
    if (io && io.sockets && io.sockets.sockets) {
        io.sockets.sockets.forEach(socket => {
            if (socket.user && (socket.user.role === 'admin' || socket.user.role === 'owner')) {
                socket.emit('serverLog', logEntry);
            }
        });
    }
};

const JWT_SECRET = process.env.JWT_SECRET || 'ananke-secret-key-prod-rev2';

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// HTTP Logging
app.use(morgan((tokens, req, res) => {
    const status = tokens.status(req, res);
    return [
        tokens.method(req, res),
        tokens.url(req, res),
        status,
        tokens['response-time'](req, res), 'ms'
    ].join(' ');
}, {
    stream: {
        write: (message) => {
            logger.http(message.trim());
        }
    }
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

// File Upload API
app.post('/api/upload', authenticateToken, upload.array('files', 10), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded.' });
        }
        const fileUrls = req.files.map(file => `/uploads/${file.filename}`);
        res.json({ urls: fileUrls });
    } catch (err) {
        logger.error(`Upload error: ${err.message}`);
        res.status(500).json({ error: 'Failed to upload files.' });
    }
});

app.delete('/api/media', authenticateToken, (req, res) => {
    try {
        const { url } = req.body;
        if (!url || !url.startsWith('/uploads/')) return res.status(400).json({ error: 'Invalid URL' });

        const filename = path.basename(url);
        const filepath = path.join(__dirname, 'public', 'uploads', filename);

        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            logger.info(`Media deleted explicitly: ${filename}`);
        }
        res.json({ success: true });
    } catch (err) {
        logger.error(`Delete media error: ${err.message}`);
        res.status(500).json({ error: 'Failed to delete media.' });
    }
});

app.get('/api/version', async (req, res) => {
    try {
        const pkgData = await fs.promises.readFile(path.join(__dirname, 'package.json'), 'utf8');
        const pkg = JSON.parse(pkgData);
        res.json({ version: pkg.version });
    } catch (e) {
        res.status(500).json({ error: 'Could not read version' });
    }
});

app.get('/api/logs', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(logger.getHistory());
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

        // Handle background
        if (newBoardData.background && newBoardData.background.type === 'image' && typeof newBoardData.background.value === 'string' && newBoardData.background.value.startsWith('data:image')) {
            const matches = newBoardData.background.value.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const ext = matches[1].split('/')[1];
                const bgPath = path.join(__dirname, 'public', 'uploads', 'background');
                if (!fs.existsSync(bgPath)) fs.mkdirSync(bgPath, { recursive: true });
                const fileName = `bg_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(bgPath, fileName), Buffer.from(matches[2], 'base64'));
                newBoardData.background.value = `/uploads/background/${fileName}`;
            }
        }

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

            res.json({ success: true, updatedBoard: newBoardData });
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

            // Check for base64 background and convert
            if (newBoardData.background && newBoardData.background.type === 'image' && typeof newBoardData.background.value === 'string' && newBoardData.background.value.startsWith('data:image')) {
                const matches = newBoardData.background.value.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const ext = matches[1].split('/')[1];
                    const bgPath = path.join(__dirname, 'public', 'uploads', 'background');
                    if (!fs.existsSync(bgPath)) fs.mkdirSync(bgPath, { recursive: true });
                    const fileName = `bg_${Date.now()}.${ext}`;
                    fs.writeFileSync(path.join(bgPath, fileName), Buffer.from(matches[2], 'base64'));
                    newBoardData.background.value = `/uploads/background/${fileName}`;
                }
            }

            // Cleanup base64 avatars in tasks if they are passed
            if (newBoardData.workflows) {
                newBoardData.workflows.forEach(w => {
                    if (w.tasks) {
                        w.tasks.forEach(t => {
                            if (t.assignees) {
                                t.assignees.forEach(a => {
                                    if (a.avatar_url && typeof a.avatar_url === 'string' && a.avatar_url.startsWith('data:image')) {
                                        const matches = a.avatar_url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                                        if (matches && matches.length === 3) {
                                            const ext = matches[1].split('/')[1];
                                            const personPath = path.join(__dirname, 'public', 'uploads', 'Person');
                                            if (!fs.existsSync(personPath)) fs.mkdirSync(personPath, { recursive: true });
                                            const personName = (a.name || a.email || 'user').replace(/[^a-z0-9]/gi, '_');
                                            const fileName = `${personName}.${ext}`;
                                            fs.writeFileSync(path.join(personPath, fileName), Buffer.from(matches[2], 'base64'));
                                            a.avatar_url = `/uploads/Person/${fileName}`;
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            }

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

            });
        });
    });

    socket.on('updateTask', ({ task, workflowId }) => {
        const canEdit = ['editor', 'admin', 'owner'].includes(socket.user.role);
        if (!canEdit) {
            logger.warn(`Unauthorized task edit attempt: User ${socket.user.name}`);
            return;
        }

        db.get("SELECT data FROM board_store WHERE id = 1", (err, row) => {
            if (err) {
                logger.error(`Error fetching board for task update: ${err.message}`);
                return;
            }

            const boardData = row ? JSON.parse(row.data) : { workflows: [] };

            // Cleanup base64 avatars in the updated task if passed
            if (task && task.assignees) {
                task.assignees.forEach(a => {
                    if (a.avatar_url && typeof a.avatar_url === 'string' && a.avatar_url.startsWith('data:image')) {
                        const matches = a.avatar_url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                        if (matches && matches.length === 3) {
                            const ext = matches[1].split('/')[1];
                            const personPath = path.join(__dirname, 'public', 'uploads', 'Person');
                            if (!fs.existsSync(personPath)) fs.mkdirSync(personPath, { recursive: true });
                            const personName = (a.name || a.email || 'user').replace(/[^a-z0-9]/gi, '_');
                            const fileName = `${personName}.${ext}`;
                            fs.writeFileSync(path.join(personPath, fileName), Buffer.from(matches[2], 'base64'));
                            a.avatar_url = `/uploads/Person/${fileName}`;
                        }
                    }
                });
            }

            if (boardData.workflows) {
                let oldWfId = null;
                let oldIndex = -1;
                // Remove task from previous workflow
                for (const wf of boardData.workflows) {
                    const idx = wf.tasks.findIndex(t => t.id == task.id);
                    if (idx !== -1) {
                        oldWfId = wf.id;
                        oldIndex = idx;
                        wf.tasks.splice(idx, 1);
                        break;
                    }
                }

                // Add task to target workflow
                const targetWf = boardData.workflows.find(w => w.id == workflowId);
                if (targetWf) {
                    if (oldWfId == workflowId && oldIndex !== -1) {
                        targetWf.tasks.splice(oldIndex, 0, task);
                    } else {
                        targetWf.tasks.push(task);
                    }
                }
            }

            const dataStr = JSON.stringify(boardData);
            db.run("UPDATE board_store SET data = ? WHERE id = 1", [dataStr], (err) => {
                if (err) {
                    logger.error(`Error saving board to DB after task update: ${err.message}`);
                    return;
                }
                logger.info(`Task ${task.title} updated by ${socket.user.name}`);
                io.emit('boardUpdate', boardData);
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

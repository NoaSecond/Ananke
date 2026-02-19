require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./src/config/database');
const { router: authRouter, authenticateToken } = require('./src/routes/auth');
const jwt = require('jsonwebtoken');

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

    const data = JSON.stringify(req.body);
    db.run("UPDATE board_store SET data = ? WHERE id = 1", [data], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
        // Also broadcast? usually handled via socket
        io.emit('boardUpdate', req.body);
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
    console.log(`User connected: ${socket.user.name} (${socket.user.role})`);

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
            console.log(`User ${socket.user.name} tried to edit but is ${socket.user.role}`);
            return; // Ignore
        }

        // Save to DB
        const dataStr = JSON.stringify(newBoardData);
        db.run("UPDATE board_store SET data = ? WHERE id = 1", [dataStr], (err) => {
            if (err) console.error(err);
            // Broadcast to all OTHER clients (or all?)
            // Usually we broadcast to all including sender to confirm sync, or just others.
            // Let's broadcast to all to ensure consistency.
            io.emit('boardUpdate', newBoardData);
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

/**
 * boards.js (routes) — Ananke v3.0
 *
 * Responsabilité unique (S) : CRUD boards + gestion des membres.
 * Utilise les repositories via DIP.
 * Chaque route a exactement les middlewares nécessaires (I — Interface Segregation).
 *
 * Cybersécurité :
 * - Chaque route board passe par requireBoardRole (anti-IDOR)
 * - Validation stricte des inputs via validate.js
 * - Audit log sur toutes les actions sensibles
 */

const express    = require('express');
const rateLimit  = require('express-rate-limit');
const fs         = require('fs');
const path       = require('path');

const authenticate              = require('../middleware/authenticate');
const { requireRole }           = require('../middleware/requireRole');
const { requireBoardRole }      = require('../middleware/boardAccess');
const { validateBoard, validateBoardMemberRole } = require('../middleware/validate');
const boardRepository           = require('../repositories/boardRepository');
const memberRepository          = require('../repositories/memberRepository');
const userRepository            = require('../repositories/userRepository');
const { getDefaultBoardData }   = require('../utils/boardDefaults');
const { processBoardBackground } = require('../utils/fileHelper');
const { describeChanges }       = require('../utils/boardDiff');
const logger                    = require('../utils/logger');

const router = express.Router();

// --------------------------------------------------------------------------
// GET /api/boards/icons  — List available SVG icons from public/assets/board-icons
// (Publicly accessible so modals and UI can load icons freely)
// --------------------------------------------------------------------------

router.get('/icons', async (req, res) => {
    try {
        const iconsDir = path.join(__dirname, '..', '..', 'public', 'assets', 'board-icons');
        if (!fs.existsSync(iconsDir)) {
            await fs.promises.mkdir(iconsDir, { recursive: true });
        }
        const files = await fs.promises.readdir(iconsDir);
        const svgFiles = files
            .filter(f => f.toLowerCase().endsWith('.svg'))
            .sort((a, b) => a.localeCompare(b));

        const icons = svgFiles.map(file => {
            const id = file.replace(/\.svg$/i, '');
            const name = id
                .replace(/[_-]+/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
            return {
                id,
                filename: file,
                name,
                url: `/assets/board-icons/${file}`,
            };
        });

        res.json({ icons });
    } catch (err) {
        logger.error(`List board icons error: ${err.message}`);
        res.status(500).json({ error: 'Erreur lors de la lecture des icônes de board' });
    }
});

// All other board routes require authentication
router.use(authenticate);

// --------------------------------------------------------------------------
// Rate limiting
// --------------------------------------------------------------------------

const createBoardLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Trop de boards créés. Réessayez dans 15 minutes.' },
});

const memberLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Trop de requêtes membres. Veuillez patienter.' },
});

// --------------------------------------------------------------------------
// GET /api/boards  — List accessible boards
// --------------------------------------------------------------------------

router.get('/', async (req, res) => {
    try {
        const boards = await boardRepository.findAllForUser(req.user.id, req.user.role);
        const boardIds = boards.map(b => b.id);
        const membersMap = await memberRepository.findByBoardIds(boardIds);
        boards.forEach(b => {
            b.members = membersMap[b.id] || [];
        });
        res.json({ boards });
    } catch (err) {
        logger.error(`List boards error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// POST /api/boards  — Create a new board (admin+)
// --------------------------------------------------------------------------

router.post('/', requireRole('admin'), createBoardLimiter, validateBoard, async (req, res) => {
    const { name, description, icon, color } = req.body;

    try {
        const board = await boardRepository.create({
            name,
            description,
            icon:      icon || 'dashboard',
            color:     color || '#6366f1',
            data:      getDefaultBoardData(),
            createdBy: req.user.id,
        });

        // Creator becomes board_admin automatically
        await memberRepository.add(board.id, req.user.id, 'board_admin');

        logger.info(`Board created: "${name}" (id: ${board.id}) by ${req.user.name}`);
        res.status(201).json({ board });
    } catch (err) {
        logger.error(`Create board error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// GET /api/boards/:boardId  — Get board data (reader+)
// --------------------------------------------------------------------------

router.get('/:boardId', requireBoardRole('reader'), async (req, res) => {
    res.json({ board: req.board });
});

// --------------------------------------------------------------------------
// PUT /api/boards/:boardId  — Update board metadata (board_admin)
// --------------------------------------------------------------------------

router.put('/:boardId', requireBoardRole('board_admin'), validateBoard, async (req, res) => {
    const { name, description, icon, color } = req.body;

    try {
        const { changed } = await boardRepository.updateMeta(req.params.boardId, { name, description, icon, color });
        if (!changed) return res.status(404).json({ error: 'Board non trouvé' });

        logger.info(`Board "${name}" updated by ${req.user.name}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Update board meta error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// DELETE /api/boards/:boardId  — Delete a board (admin+)
// --------------------------------------------------------------------------

router.delete('/:boardId', requireRole('admin'), requireBoardRole('board_admin'), async (req, res) => {
    try {
        const { changed } = await boardRepository.remove(req.params.boardId);
        if (!changed) return res.status(404).json({ error: 'Board non trouvé' });

        logger.info(`Board deleted: ${req.params.boardId} by ${req.user.name}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Delete board error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// POST /api/boards/:boardId/data  — Save kanban content (editor+)
// --------------------------------------------------------------------------

router.post('/:boardId/data', requireBoardRole('editor'), async (req, res) => {
    const boardId    = req.params.boardId;
    const newData    = req.body;
    const oldBoard   = req.board; // already fetched by requireBoardRole

    try {
        processBoardBackground(newData, oldBoard.data);

        const changes = describeChanges(oldBoard.data || {}, newData);
        await boardRepository.updateData(boardId, newData);

        if (changes.length > 0) {
            changes.forEach(c => logger.info(`[Board:${boardId}] ${req.user.name}: ${c}`));
        } else {
            logger.info(`[Board:${boardId}] Data updated by ${req.user.name}`);
        }

        res.json({ success: true });
    } catch (err) {
        logger.error(`Save board data error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// ==========================================================================
// MEMBER ROUTES
// ==========================================================================

// --------------------------------------------------------------------------
// GET /api/boards/:boardId/members  — List members (reader+)
// --------------------------------------------------------------------------

router.get('/:boardId/members', requireBoardRole('reader'), async (req, res) => {
    try {
        const members = await memberRepository.findByBoard(req.params.boardId);
        res.json({ members });
    } catch (err) {
        logger.error(`List members error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// POST /api/boards/:boardId/members  — Add a member (board_admin)
// --------------------------------------------------------------------------

router.post('/:boardId/members', requireBoardRole('board_admin'), memberLimiter, validateBoardMemberRole, async (req, res) => {
    const { userId, role } = req.body;
    const boardId = req.params.boardId;

    if (!userId) return res.status(400).json({ error: 'userId requis.' });

    try {
        const targetUser = await userRepository.findById(userId);
        if (!targetUser) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        await memberRepository.add(boardId, userId, role || 'reader');

        logger.info(`User ${targetUser.email} added to board ${boardId} as ${role || 'reader'} by ${req.user.name}`);
        res.status(201).json({ success: true });
    } catch (err) {
        logger.error(`Add member error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// PUT /api/boards/:boardId/members/:userId  — Change member role (board_admin)
// --------------------------------------------------------------------------

router.put('/:boardId/members/:userId', requireBoardRole('board_admin'), memberLimiter, validateBoardMemberRole, async (req, res) => {
    const { boardId, userId } = req.params;
    const { role } = req.body;

    // Prevent a board_admin from demoting themselves if they are the last admin
    // (simple check — no full quorum logic in v3.0)
    if (userId === req.user.id && role !== 'board_admin') {
        return res.status(400).json({ error: 'Vous ne pouvez pas réduire votre propre rôle d\'administrateur du board.' });
    }

    try {
        const targetUser = await userRepository.findById(userId);
        if (!targetUser) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        const { changed } = await memberRepository.updateRole(boardId, userId, role);
        if (!changed) return res.status(404).json({ error: 'Membre non trouvé' });

        logger.info(`Role of ${targetUser.email} changed to ${role} on board ${boardId} by ${req.user.name}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Update member role error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// --------------------------------------------------------------------------
// DELETE /api/boards/:boardId/members/:userId  — Remove a member (board_admin)
// --------------------------------------------------------------------------

router.delete('/:boardId/members/:userId', requireBoardRole('board_admin'), memberLimiter, async (req, res) => {
    const { boardId, userId } = req.params;

    try {
        const targetUser = await userRepository.findById(userId);
        if (!targetUser) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        const { changed } = await memberRepository.remove(boardId, userId);
        if (!changed) return res.status(404).json({ error: 'Membre non trouvé' });

        logger.info(`User ${targetUser.email} removed from board ${boardId} by ${req.user.name}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Remove member error: ${err.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

module.exports = router;

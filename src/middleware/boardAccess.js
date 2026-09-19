/**
 * boardAccess.js — Ananke v3.0
 *
 * Responsabilité unique (S) : RBAC par board (anti-IDOR).
 * Ouvert à l'extension (O) : ajouter un rôle board = ajouter une entrée dans BOARD_ROLE_HIERARCHY.
 *
 * Défense en profondeur :
 * - Vérifie l'existence du board (404 sur ID inconnu, pas de fuite d'info sur boards privés)
 * - Vérifie l'appartenance avant tout accès (prévention IDOR)
 * - Les admin/owner globaux ont accès automatique à tous les boards
 */

const boardRepository  = require('../repositories/boardRepository');
const memberRepository = require('../repositories/memberRepository');
const logger           = require('../utils/logger');

// Hierarchy for board-level roles (higher index = more privileged)
const BOARD_ROLE_HIERARCHY = {
    reader:      0,
    editor:      1,
    board_admin: 2,
};

// Global roles that bypass board-level checks
const GLOBAL_OVERRIDE_ROLES = ['admin', 'owner'];

/**
 * Returns an Express middleware that:
 * 1. Verifies the board exists.
 * 2. Verifies the caller has at least `minRole` access on that board.
 * 3. Attaches `req.board` and `req.boardRole` for downstream use.
 *
 * @param {string} minRole - 'reader' | 'editor' | 'board_admin'
 */
function requireBoardRole(minRole) {
    return async (req, res, next) => {
        const boardId = req.params.boardId;

        if (!boardId) {
            return res.status(400).json({ error: 'Missing boardId parameter' });
        }

        try {
            const board = await boardRepository.findById(boardId);
            if (!board) {
                // Return 403 (not 404) to avoid leaking board existence to unauthorized users
                logger.warn(`Board access denied (not found or unauthorized): user=${req.user?.id} board=${boardId}`);
                return res.status(403).json({ error: 'Accès refusé à ce board' });
            }

            // Global admins/owners bypass board-level membership check
            if (GLOBAL_OVERRIDE_ROLES.includes(req.user.role)) {
                req.board     = board;
                req.boardRole = 'board_admin';
                return next();
            }

            const member = await memberRepository.findByBoardAndUser(boardId, req.user.id);

            if (!member) {
                logger.warn(`Unauthorized board access: user=${req.user.id} board=${boardId}`);
                return res.status(403).json({ error: 'Accès refusé à ce board' });
            }

            const userLevel = BOARD_ROLE_HIERARCHY[member.role]  ?? -1;
            const minLevel  = BOARD_ROLE_HIERARCHY[minRole]       ?? 999;

            if (userLevel < minLevel) {
                logger.warn(`Insufficient board role: user=${req.user.id} role=${member.role} required=${minRole} board=${boardId}`);
                return res.status(403).json({ error: `Accès insuffisant (requis : ${minRole})` });
            }

            req.board     = board;
            req.boardRole = member.role;
            next();
        } catch (err) {
            logger.error(`boardAccess middleware error: ${err.message}`);
            res.status(500).json({ error: 'Erreur interne du serveur' });
        }
    };
}

module.exports = { requireBoardRole, BOARD_ROLE_HIERARCHY, GLOBAL_OVERRIDE_ROLES };

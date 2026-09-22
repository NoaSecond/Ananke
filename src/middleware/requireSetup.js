/**
 * requireSetup.js — Ananke v3.0
 *
 * Bloque l'accès aux ressources métier (upload, gestion de boards, listes)
 * si l'utilisateur n'a pas encore finalisé la configuration initiale de son profil
 * (is_setup_complete === 0).
 */

function requireSetup(req, res, next) {
    if (req.user && req.user.is_setup_complete === 0) {
        return res.status(403).json({
            error: 'Veuillez finaliser votre profil avant d\'accéder à cette ressource.',
            require_setup: true,
        });
    }
    next();
}

module.exports = requireSetup;

/**
 * board-icons.js — Ananke v3.0
 *
 * Responsabilité unique : gestion centralisée des icônes SVG de tableau.
 * Charge UNIQUEMENT depuis l'API (GET /api/boards/icons), qui elle-même
 * scanne dynamiquement public/assets/board-icons/.
 *
 * Pour ajouter une icône : déposer un fichier .svg dans public/assets/board-icons/.
 * Pour en supprimer une : retirer le fichier du dossier.
 * Aucune liste n'est codée en dur ici.
 */

import { getFullUrl } from './state.js';

// État interne — initialisé à vide, rempli par loadBoardIcons()
let _iconsMeta = [];

/** IDs d'icônes actuellement disponibles (mis à jour par loadBoardIcons) */
export let BOARD_ICONS = [];

/** Nom par défaut si aucune icône n'est encore chargée */
const FALLBACK_ICON = 'dashboard';

/**
 * Charge la liste des icônes disponibles depuis le serveur.
 * Scanne dynamiquement public/assets/board-icons/ côté serveur.
 * À appeler une fois au démarrage, et à chaque ouverture d'un sélecteur.
 * @returns {Promise<Array<{id: string, name: string, filename: string, url: string}>>}
 */
export async function loadBoardIcons() {
    try {
        const res = await fetch(getFullUrl('/api/boards/icons'));
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.icons) && data.icons.length > 0) {
                _iconsMeta = data.icons;
                BOARD_ICONS = _iconsMeta.map(i => i.id);
                return _iconsMeta;
            }
        }
    } catch {
        // Réseau indisponible : on retourne la liste déjà en mémoire (peut être vide au 1er appel)
    }
    return _iconsMeta;
}

/**
 * Retourne les icônes actuellement connues (résultat du dernier loadBoardIcons).
 * @returns {Array<{id: string, name: string, filename: string, url: string}>}
 */
export function getAvailableIcons() {
    return _iconsMeta;
}

/**
 * Retourne le premier ID d'icône disponible, ou le fallback par défaut.
 * @returns {string}
 */
export function getDefaultIconId() {
    return _iconsMeta[0]?.id ?? FALLBACK_ICON;
}

/**
 * Génère le HTML d'une icône SVG via masque CSS.
 * Compatible dark mode / light mode (hérite de `color`).
 * @param {string} iconName  ID ou nom de fichier (avec ou sans .svg)
 * @param {string} [extraClass='']
 * @returns {string}
 */
export function renderBoardIconHtml(iconName, extraClass = '') {
    const id = ((iconName || FALLBACK_ICON).trim()).replace(/\.svg$/i, '');
    const iconUrl = getFullUrl(`/assets/board-icons/${id}.svg`);
    return `<span class="board-icon-mask${extraClass ? ' ' + extraClass : ''}" style="--icon-url: url('${iconUrl}');" data-icon="${id}" aria-hidden="true"></span>`;
}

/**
 * Génère le HTML des swatches d'icônes pour les modales de création/édition.
 * Se base sur _iconsMeta (résultat du dernier loadBoardIcons).
 * @param {string} selectedIcon  ID de l'icône actuellement sélectionnée
 * @returns {string}
 */
export function renderIconSwatchesHtml(selectedIcon) {
    const current = ((selectedIcon || FALLBACK_ICON).trim()).replace(/\.svg$/i, '');
    return _iconsMeta.map(item => `
        <div class="icon-swatch${item.id === current ? ' selected' : ''}" data-icon="${item.id}" title="${item.name}">
            ${renderBoardIconHtml(item.id)}
        </div>
    `).join('');
}

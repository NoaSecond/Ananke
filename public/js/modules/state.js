/**
 * state.js — Ananke v3.0
 *
 * Responsabilité unique (S) : état global partagé de l'application.
 * Ajout de currentBoardId, boards[], boardMembers[] pour le multi-board.
 */

export const basePath = window.location.pathname.replace(/\/$/, '');
export const API_URL  = basePath + '/api';

export function getFullUrl(url) {
    if (url && url.startsWith('/')) return basePath + url;
    return url;
}

export const state = {
    // Auth
    socket:      null,
    currentUser: null,

    // Multi-board
    boards:         [],      // list of boards returned by /api/boards
    currentBoardId: null,    // UUID of the currently active board
    boardMembers:   [],      // members of the current board
    boardPresence:  {},      // boardId -> array of active users currently viewing the board

    // Kanban (per board)
    boardData: {
        workflows:   [],
        tags:        [],
        background:  { type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    },

    // Current view
    currentView: 'dashboard', // 'dashboard' | 'board' | 'board-settings'

    // Drag state
    isDraggingInternal: false,
    columnSortable:     null,
    taskSortables:      [],
};

export const getDefaultBoardData = () => ({
    workflows: [
        { id: crypto.randomUUID(), title: 'To Do',       color: '#ef4444', tasks: [] },
        { id: crypto.randomUUID(), title: 'In Progress', color: '#f97316', tasks: [] },
        { id: crypto.randomUUID(), title: 'Testing',     color: '#3b82f6', tasks: [] },
        { id: crypto.randomUUID(), title: 'Done',        color: '#22c55e', tasks: [] },
    ],
    tags:       [],
    background: { type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
});

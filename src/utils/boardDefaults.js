/**
 * boardDefaults.js — Ananke v3.0
 *
 * Responsabilité unique (S) : fournie les données par défaut pour un nouveau board.
 */

const crypto = require('crypto');

function getDefaultBoardData() {
    return {
        workflows: [
            { id: crypto.randomUUID(), title: 'To Do',       color: '#ef4444', tasks: [] },
            { id: crypto.randomUUID(), title: 'In Progress', color: '#f97316', tasks: [] },
            { id: crypto.randomUUID(), title: 'To Test',     color: '#3b82f6', tasks: [] },
            { id: crypto.randomUUID(), title: 'Done',        color: '#22c55e', tasks: [] },
        ],
        tags: [],
        background: { type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    };
}

module.exports = { getDefaultBoardData };

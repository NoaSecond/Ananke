export const basePath = window.location.pathname.replace(/\/$/, '');
export const API_URL = basePath + '/api';

export function getFullUrl(url) {
    if (url && url.startsWith('/')) {
        return basePath + url;
    }
    return url;
}

export const state = {
    socket: null,
    currentUser: null,
    isDraggingInternal: false,
    columnSortable: null,
    taskSortables: [],
    boardData: {
        projectName: 'Nouveau Projet',
        workflows: [],
        tags: [],
        background: { type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
    }
};

export const getDefaultData = () => ({
    projectName: 'Nouveau Projet',
    tags: [],
    workflows: [
        { id: crypto.randomUUID(), title: 'To Do', color: '#ef4444', tasks: [] },
        { id: crypto.randomUUID(), title: 'In Progress', color: '#f97316', tasks: [] },
        { id: crypto.randomUUID(), title: 'Testing', color: '#3b82f6', tasks: [] },
        { id: crypto.randomUUID(), title: 'Done', color: '#22c55e', tasks: [] }
    ],
    background: { type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
});

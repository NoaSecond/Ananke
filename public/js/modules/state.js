export const API_URL = '/api';

export const state = {
    socket: null,
    currentUser: null,
    isDraggingInternal: false,
    columnSortable: null,
    taskSortables: [],
    boardData: {
        projectName: 'Nouveau Projet',
        workflows: [],
        tags: []
    }
};

export const getDefaultData = () => ({
    projectName: 'Nouveau Projet',
    tags: [],
    workflows: [
        { id: Date.now() + 1, title: 'To Do', color: '#ef4444', tasks: [] },
        { id: Date.now() + 2, title: 'In Progress', color: '#f97316', tasks: [] },
        { id: Date.now() + 3, title: 'Testing', color: '#3b82f6', tasks: [] },
        { id: Date.now() + 4, title: 'Done', color: '#22c55e', tasks: [] }
    ]
});

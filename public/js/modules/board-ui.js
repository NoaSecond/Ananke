import { state } from './state.js';
import { elements } from './dom.js';
import { Logger, ErrorHandler } from './utils.js';
import { openTaskEditModal, openViewTaskModal } from './task-ui.js';
import { openWorkflowModal } from './workflow-ui.js';
import { showConfirm, openModal, closeModal } from './modals.js';
import { handleSearch } from './search-ui.js';

export const trackEvent = (action, category = 'Kanban', label = null, value = null) => {
    if (typeof gtag !== 'undefined') {
        gtag('event', action, { event_category: category, event_label: label, value: value });
    }
    Logger.debug('📊 Event tracked', { action });
};

export const saveData = ErrorHandler.wrapSync(() => {
    if (state.socket) {
        state.socket.emit('updateBoard', state.boardData);
    }
}, 'Data saving');

const updateProjectTitle = ErrorHandler.wrapSync(() => {
    if (state.boardData.projectName) {
        elements.projectNameDisplay.textContent = state.boardData.projectName;
        document.title = `${state.boardData.projectName} - Ananke`;

        // Dynamic Meta Tags
        const description = `Manage your project "${state.boardData.projectName}" with our free Kanban tool.`;
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) metaDescription.setAttribute('content', description);
    }
}, 'Project title update');

const generateDynamicKeywords = () => {
    const keywords = ['kanban', 'project management', 'tasks', 'productivity'];
    if (state.boardData.workflows) {
        state.boardData.workflows.forEach(workflow => {
            if (workflow.title && workflow.title.length > 2) {
                keywords.push(workflow.title.toLowerCase());
            }
        });
    }
    if (state.boardData.projectName) {
        keywords.push(state.boardData.projectName.toLowerCase());
    }
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        metaKeywords.setAttribute('content', keywords.join(', '));
    }
};

export const renderBoard = ErrorHandler.wrapSync(() => {
    Logger.debug('🎨 Rendering Kanban board');
    const isReader = state.currentUser?.role === 'reader';

    // Toggle global controls based on role
    if (elements.addWorkflowBtn) {
        elements.addWorkflowBtn.style.display = isReader ? 'none' : 'inline-flex';
    }
    if (elements.projectTitle) {
        const editIcon = elements.projectTitle.querySelector('.edit-icon');
        if (editIcon) editIcon.style.display = isReader ? 'none' : 'inline-block';
        elements.projectTitle.style.cursor = isReader ? 'default' : 'pointer';
    }

    elements.kanbanBoard.innerHTML = '';
    if (!state.boardData.workflows || state.boardData.workflows.length === 0) {
        elements.kanbanBoard.innerHTML = '<p style="text-align: center; width: 100%; opacity: 0.7;">Your board is empty. Add a column to start!</p>';
    } else {
        state.boardData.workflows.forEach(workflow => {
            const columnEl = document.createElement('div');
            columnEl.className = 'workflow-column';
            columnEl.dataset.workflowId = workflow.id;

            const isLocked = workflow.locked || false;
            const lockIcon = isLocked ? ' <span class="material-symbols-outlined" style="font-size: 1.2em; vertical-align: bottom; opacity: 0.6;" title="Locked">lock</span>' : '';
            const headerClass = isLocked ? 'workflow-header locked' : 'workflow-header';

            const columnActionsHtml = isReader ? '' : `
                <div class="workflow-actions">
                    <button class="workflow-menu-btn" title="Column Options" onmousedown="event.stopPropagation()">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                    <div class="workflow-menu">
                        <button class="edit-workflow-btn" data-workflow-id="${workflow.id}" ${isLocked ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                            <span class="material-symbols-outlined">edit</span> Edit
                        </button>
                        <button class="lock-workflow-btn" data-workflow-id="${workflow.id}">
                            <span class="material-symbols-outlined">${isLocked ? 'lock_open' : 'lock'}</span> ${isLocked ? 'Unlock' : 'Lock'}
                        </button>
                        <button class="duplicate-workflow-btn" data-workflow-id="${workflow.id}">
                            <span class="material-symbols-outlined">content_copy</span> Duplicate
                        </button>
                        <button class="add-task-btn-menu" data-workflow-id="${workflow.id}" ${isLocked ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                            <span class="material-symbols-outlined">add_task</span> Add Task
                        </button>
                        <button class="delete-workflow-btn delete" data-workflow-id="${workflow.id}" ${isLocked ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                            <span class="material-symbols-outlined">delete</span> Delete
                        </button>
                    </div>
                </div>`;

            columnEl.innerHTML = `
                <div class="${headerClass}" style="border-left: 4px solid ${workflow.color || '#1a73e8'}">
                    <h3 style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${workflow.title}${lockIcon}</h3>
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
                        ${workflow.tasks.length > 0 ? `<span class="card-count">${workflow.tasks.length}</span>` : ''}
                        ${columnActionsHtml}
                    </div>
                </div>
                <div class="task-list-wrapper">
                    <div class="task-list" data-workflow-id="${workflow.id}"></div>
                </div>
            `;

            const taskList = columnEl.querySelector('.task-list');
            workflow.tasks.forEach(task => {
                const taskCard = document.createElement('div');
                taskCard.className = 'task-card';
                taskCard.dataset.taskId = task.id;
                taskCard.style.borderLeftColor = task.color;

                const taskActionsHtml = isReader ? '' : (isLocked ? `
                    <div class="task-actions">
                        <button class="task-card-action-btn edit-btn" title="Edit Task">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                    </div>` : `
                    <div class="task-actions">
                        <button class="task-card-action-btn edit-btn" title="Edit Task">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="task-card-action-btn duplicate-btn" title="Duplicate Task">
                            <span class="material-symbols-outlined">content_copy</span>
                        </button>
                        <button class="task-card-action-btn delete-btn" title="Delete Task">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>`);

                const assigneesHtml = (task.assignees || []).map(a => `
                    <div class="task-assignee-avatar" title="${a.name}">${a.name[0]}</div>
                `).join('');

                const commentsCount = (task.comments || []).length;
                const commentsHtml = commentsCount > 0 ? `
                    <div class="task-card-footer-item" title="${commentsCount} comments">
                        <span class="material-symbols-outlined" style="font-size: 1rem;">forum</span>
                        <span>${commentsCount}</span>
                    </div>` : '';

                taskCard.innerHTML = `
                    ${taskActionsHtml}
                    <h4>${task.title}</h4>
                    <div class="task-tags-display">
                        ${task.showTags !== false ? (task.tags || []).map(tag => `<span class="tag-pill-small" style="background-color: ${tag.color};" title="${tag.name}">${tag.name}</span>`).join('') : ''}
                    </div>
                    <div class="task-card-footer">
                        ${task.showAssigneesOnCard !== false ? `<div class="task-assignees-display">${assigneesHtml}</div>` : ''}
                        ${commentsHtml}
                    </div>
                    ${(task.showDescriptionOnCard !== false && task.description) ? `<div class="task-card-description">${marked.parse(task.description)}</div>` : ''}
                    ${(task.customFields || []).filter(f => f.showOnCard).map(f => {
                    const val = f.type === 'link' ? `<a href="${f.value}" target="_blank" onclick="event.stopPropagation()" style="color: var(--primary-color); text-decoration: underline;">${f.value}</a>` : f.value;
                    return `<div class="task-custom-field-small"><strong>${f.name}:</strong> ${val}</div>`;
                }).join('')}
                `;
                taskList.appendChild(taskCard);
            });
            elements.kanbanBoard.appendChild(columnEl);
        });
    }
    Logger.success('✨ Board rendered successfully');
    initDragAndDrop();
    generateDynamicKeywords();
    updateProjectTitle();
    handleSearch();
}, 'Board rendering');

export const initDragAndDrop = () => {
    if (state.columnSortable) {
        state.columnSortable.destroy();
        state.columnSortable = null;
    }
    state.taskSortables.forEach(s => s.destroy());
    state.taskSortables = [];

    const isReader = state.currentUser?.role === 'reader';

    state.columnSortable = new Sortable(elements.kanbanBoard, {
        group: 'columns',
        animation: 150,
        handle: '.workflow-header',
        draggable: '.workflow-column',
        disabled: isReader,
        filter: '.locked, .workflow-actions, .workflow-menu-btn, .workflow-menu',
        preventOnFilter: false,
        onStart: () => { state.isDraggingInternal = true; },
        onMove: (evt) => {
            // Prevent dragging column into a task list or any other nested container
            if (evt.to !== elements.kanbanBoard) return false;
        },
        onEnd: (evt) => {
            state.isDraggingInternal = false;
            const [movedItem] = state.boardData.workflows.splice(evt.oldIndex, 1);
            state.boardData.workflows.splice(evt.newIndex, 0, movedItem);
            renderBoard();
            saveData();
        }
    });

    document.querySelectorAll('.task-list').forEach(list => {
        const workflowId = list.dataset.workflowId;
        const workflow = state.boardData.workflows.find(w => w.id == workflowId);
        const isLocked = (workflow && workflow.locked) || isReader;

        const sortable = new Sortable(list, {
            group: {
                name: 'tasks',
                pull: !isLocked,
                put: !isLocked
            },
            sort: !isLocked,
            draggable: '.task-card',
            disabled: isReader,
            animation: 150,
            onStart: () => { state.isDraggingInternal = true; },
            onMove: (evt) => {
                // Prevent dragging a task into something that is not a task list
                if (!evt.to.classList.contains('task-list')) return false;
            },
            onEnd: (evt) => {
                state.isDraggingInternal = false;
                const taskId = evt.item.dataset.taskId;
                const oldWorkflow = state.boardData.workflows.find(w => w.id == evt.from.dataset.workflowId);
                const taskIndex = oldWorkflow.tasks.findIndex(t => t.id == taskId);
                const [task] = oldWorkflow.tasks.splice(taskIndex, 1);
                const newWorkflow = state.boardData.workflows.find(w => w.id == evt.to.dataset.workflowId);
                newWorkflow.tasks.splice(evt.newIndex, 0, task);
                renderBoard();
                saveData();
            }
        });
        state.taskSortables.push(sortable);
    });
};

const openAddModal = (type, workflowId = null) => {
    elements.addModalType.value = type;
    elements.addModalInput.value = '';
    elements.addModalTitle.textContent = type === 'workflow' ? 'Add Column' : 'Add Task';
    elements.addModalInput.placeholder = type === 'workflow' ? 'New column name' : 'New task title';
    if (workflowId) elements.addModalWorkflowId.value = workflowId;
    openModal(elements.addModal);
    elements.addModalInput.focus();
};

export const initBoardListeners = () => {
    elements.kanbanBoard.addEventListener('click', (e) => {
        const menuBtn = e.target.closest('.workflow-menu-btn');
        if (menuBtn) {
            const menu = menuBtn.nextElementSibling;
            const isVisible = menu.classList.contains('visible');
            document.querySelectorAll('.workflow-menu').forEach(m => m.classList.remove('visible'));
            if (!isVisible) menu.classList.add('visible');
            return;
        }

        const editWorkflowBtn = e.target.closest('.edit-workflow-btn');
        if (editWorkflowBtn && !editWorkflowBtn.disabled) {
            const workflow = state.boardData.workflows.find(w => w.id == editWorkflowBtn.dataset.workflowId);
            if (workflow) {
                openWorkflowModal(workflow);
            }
        }

        const unlockWorkflowBtn = e.target.closest('.lock-workflow-btn');
        if (unlockWorkflowBtn) {
            const workflow = state.boardData.workflows.find(w => w.id == unlockWorkflowBtn.dataset.workflowId);
            if (workflow) {
                workflow.locked = !workflow.locked;
                saveData();
                renderBoard();
            }
        }

        const deleteWorkflowBtn = e.target.closest('.delete-workflow-btn');
        if (deleteWorkflowBtn && !deleteWorkflowBtn.disabled) {
            showConfirm('Delete column?', () => {
                state.boardData.workflows = state.boardData.workflows.filter(w => w.id != deleteWorkflowBtn.dataset.workflowId);
                saveData();
                renderBoard();
            });
        }

        const addTaskBtn = e.target.closest('.add-task-btn-menu');
        if (addTaskBtn && !addTaskBtn.disabled) {
            openAddModal('task', addTaskBtn.dataset.workflowId);
        }

        const duplicateWorkflowBtn = e.target.closest('.duplicate-workflow-btn');
        if (duplicateWorkflowBtn) {
            const workflow = state.boardData.workflows.find(w => w.id == duplicateWorkflowBtn.dataset.workflowId);
            if (workflow) {
                const newWorkflow = JSON.parse(JSON.stringify(workflow));
                newWorkflow.id = Date.now();
                newWorkflow.title = `${workflow.title} (Copy)`;
                newWorkflow.tasks.forEach((t, i) => { t.id = Date.now() + i + 1; });
                state.boardData.workflows.push(newWorkflow);
                renderBoard();
                saveData();
            }
        }

        // Task Actions
        const taskCard = e.target.closest('.task-card');
        const editTaskBtn = e.target.closest('.edit-btn');
        const duplicateTaskBtn = e.target.closest('.duplicate-btn');
        const deleteTaskBtn = e.target.closest('.delete-btn');

        if (taskCard || editTaskBtn || duplicateTaskBtn || deleteTaskBtn) {
            const targetCard = taskCard || (editTaskBtn || duplicateTaskBtn || deleteTaskBtn).closest('.task-card');
            const workflowId = targetCard.parentElement.dataset.workflowId;
            const workflow = state.boardData.workflows.find(w => w.id == workflowId);
            if (!workflow) return;

            const task = workflow.tasks.find(t => t.id == targetCard.dataset.taskId);
            if (!task) return;

            if (deleteTaskBtn) {
                showConfirm('Delete task?', () => {
                    workflow.tasks = workflow.tasks.filter(t => t.id != task.id);
                    saveData();
                    renderBoard();
                });
                return;
            }
            if (duplicateTaskBtn) {
                const newTask = JSON.parse(JSON.stringify(task));
                newTask.id = Date.now();
                newTask.title = `${task.title} (Copy)`;
                workflow.tasks.push(newTask);
                saveData();
                renderBoard();
                return;
            }
            if (editTaskBtn) {
                openTaskEditModal(task, workflow);
                return;
            }
            // View task
            openViewTaskModal(task, workflow);
        }
    });

    if (elements.addWorkflowBtn) {
        elements.addWorkflowBtn.addEventListener('click', () => {
            openAddModal('workflow');
        });
    }

    elements.saveAddBtn.addEventListener('click', ErrorHandler.wrapSync(() => {
        const type = elements.addModalType.value;
        const title = elements.addModalInput.value.trim();
        if (title) {
            if (type === 'workflow') {
                const newWorkflow = {
                    id: Date.now(),
                    title,
                    color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
                    tasks: []
                };
                state.boardData.workflows.push(newWorkflow);
                trackEvent('create_workflow', 'Workflow', title);
            } else {
                const workflow = state.boardData.workflows.find(w => w.id == elements.addModalWorkflowId.value);
                if (workflow) {
                    const newTask = { id: Date.now(), title, description: 'Click to edit...', color: '#6b7280' };
                    workflow.tasks.push(newTask);
                    trackEvent('create_task', 'Task', title);
                }
            }
            saveData();
            renderBoard();
            closeModal(elements.addModal);
        }
    }, 'Adding item'));

    elements.addModalInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') elements.saveAddBtn.click() });

    // Export/Import Listeners
    if (elements.exportBtn) {
        elements.exportBtn.addEventListener('click', (e) => {
            elements.settingsMenu.classList.add('hidden');
            if (!state.boardData) return;
            try {
                const dataStr = JSON.stringify(state.boardData, null, 2);
                const blob = new Blob([dataStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${state.boardData.projectName || 'ananke-project'}-${new Date().toISOString().slice(0, 10)}.kanban`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                Logger.success('Project exported successfully');
            } catch (err) {
                Logger.error('Export failed', err);
            }
        });
    }

    if (elements.importInput) {
        elements.importInput.addEventListener('change', (e) => {
            elements.settingsMenu.classList.add('hidden');
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (importedData.workflows && Array.isArray(importedData.workflows)) {
                        state.boardData = importedData;
                        saveData();
                        renderBoard();
                        Logger.success('Project imported successfully');
                    } else {
                        throw new Error('Invalid file structure');
                    }
                } catch (err) {
                    Logger.error('Import failed', err);
                    alert('Invalid file format. Please upload a valid .kanban file.');
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });
    }

    // Project Title Edit
    elements.projectTitle.addEventListener('click', () => {
        if (state.currentUser?.role === 'reader') return;
        elements.projectNameInput.value = state.boardData.projectName || 'Ananke';
        openModal(elements.projectModal);
    });

    elements.saveProjectBtn.addEventListener('click', () => {
        const newName = elements.projectNameInput.value.trim();
        if (newName) {
            state.boardData.projectName = newName;
            saveData();
            renderBoard();
            closeModal(elements.projectModal);
        }
    });
};

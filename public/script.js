document.addEventListener('DOMContentLoaded', () => {
    // --- Log System & Error Handling ---
    const Logger = {
        levels: {
            ERROR: { emoji: '🚨', color: '#ef4444', level: 0 },
            WARN: { emoji: '⚠️', color: '#f97316', level: 1 },
            INFO: { emoji: 'ℹ️', color: '#3b82f6', level: 2 },
            SUCCESS: { emoji: '✅', color: '#22c55e', level: 3 },
            DEBUG: { emoji: '🔍', color: '#8b5cf6', level: 4 }
        },

        // Log level for production (2 = INFO and below)
        currentLevel: window.location.hostname === 'localhost' ? 4 : 2,

        log(level, message, data = null) {
            const logLevel = this.levels[level];
            if (!logLevel || logLevel.level > this.currentLevel) return;

            const timestamp = new Date().toLocaleTimeString();
            const logMessage = `${logLevel.emoji} [${timestamp}] ${message}`;

            console.log(
                `%c${logMessage}`,
                `color: ${logLevel.color}; font-weight: bold;`
            );

            if (data) {
                console.log('📊 Associated data:', data);
            }
        },

        error(message, error = null) {
            this.log('ERROR', message, error);
            if (error && error.stack) {
                console.error('📋 Stack trace:', error.stack);
            }
        },

        warn(message, data = null) {
            this.log('WARN', message, data);
        },

        info(message, data = null) {
            this.log('INFO', message, data);
        },

        success(message, data = null) {
            this.log('SUCCESS', message, data);
        },

        debug(message, data = null) {
            this.log('DEBUG', message, data);
        }
    };

    // --- Global Error Handler ---
    const ErrorHandler = {
        handle(error, context = 'Application') {
            Logger.error(`Error in ${context}`, error);

            // Show notification to user if necessary
            if (error.userFacing) {
                this.showUserNotification(error.message, 'error');
            }
        },

        showUserNotification(message, type = 'info') {
            // Create temporary notification
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.innerHTML = `
                <span class="notification-icon">${type === 'error' ? '🚨' : type === 'success' ? '' : 'ℹ️'}</span>
                <span class="notification-message">${message}</span>
            `;

            document.body.appendChild(notification);

            // Remove after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        },

        wrapAsync(fn, context) {
            return async (...args) => {
                try {
                    return await fn(...args);
                } catch (error) {
                    this.handle(error, context);
                    throw error;
                }
            };
        },

        wrapSync(fn, context) {
            return (...args) => {
                try {
                    return fn(...args);
                } catch (error) {
                    this.handle(error, context);
                    throw error;
                }
            };
        }
    };

    Logger.info('🚀 OnlineKanban application started');

    // --- DOM Elements ---
    const kanbanBoard = document.getElementById('kanban-board');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const exportBtn = document.getElementById('export-btn');
    const importInput = document.getElementById('import-input');
    const addWorkflowBtn = document.getElementById('add-workflow-btn');
    const addModal = document.getElementById('add-modal');
    const addModalTitle = document.getElementById('add-modal-title');
    const addModalInput = document.getElementById('add-modal-input');
    const addModalType = document.getElementById('add-modal-type');
    const addModalWorkflowId = document.getElementById('add-modal-workflow-id');
    const projectTitle = document.getElementById('project-title');
    const projectModal = document.getElementById('project-modal');
    const projectNameInput = document.getElementById('project-name-input');
    const saveProjectBtn = document.getElementById('save-project-btn');
    const saveAddBtn = document.getElementById('save-add-btn');
    const taskModal = document.getElementById('task-modal');
    const taskForm = {
        id: document.getElementById('task-id-input'),
        title: document.getElementById('task-title-input'),
        description: document.getElementById('task-desc-input'),
        color: document.getElementById('task-color-input'),
        saveBtn: document.getElementById('save-task-btn'),
        deleteBtn: document.getElementById('delete-task-btn'),
        duplicateBtn: document.getElementById('duplicate-task-btn'),
    };
    const workflowModal = document.getElementById('workflow-modal');
    const workflowForm = {
        id: document.getElementById('workflow-id-input'),
        title: document.getElementById('workflow-title-input'),
        color: document.getElementById('workflow-color-input'),
        saveBtn: document.getElementById('save-workflow-btn'),
        deleteBtn: document.getElementById('delete-workflow-btn'),
    };
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirm-modal-message');
    const confirmOkBtn = document.getElementById('confirm-modal-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-modal-cancel-btn');
    let confirmCallback = null;

    // --- Default Data ---
    const getDefaultData = () => ({
        projectName: 'Online Kanban',
        workflows: [
            { id: Date.now() + 1, title: 'To Do', color: '#ef4444', tasks: [] },
            { id: Date.now() + 2, title: 'In Progress', color: '#f97316', tasks: [] },
            { id: Date.now() + 3, title: 'Testing', color: '#3b82f6', tasks: [] },
            { id: Date.now() + 4, title: 'Done', color: '#22c55e', tasks: [] }
        ]
    });

    // --- Application State ---
    let boardData;
    try {
        Logger.debug('🔄 Loading data from localStorage');
        const savedData = JSON.parse(localStorage.getItem('kanbanBoard'));
        if (savedData && savedData.workflows && Array.isArray(savedData.workflows)) {
            boardData = savedData;
            // Handle legacy data without project name
            if (!boardData.projectName) {
                boardData.projectName = 'Online Kanban';
            }
            // Migrate French titles if necessary (optional improvement)
            const mapFrenchToEnglish = {
                'À faire': 'To Do',
                'En cours': 'In Progress',
                'À tester': 'Testing',
                'Terminé': 'Done'
            };
            boardData.workflows.forEach(w => {
                if (mapFrenchToEnglish[w.title]) {
                    w.title = mapFrenchToEnglish[w.title];
                }
                // Migrate French task descriptions
                if (w.tasks) {
                    w.tasks.forEach(t => {
                        if (t.description === 'Cliquez pour modifier...' || t.description === 'Cliquez pour éditer...') {
                            t.description = 'Click to edit...';
                        }
                    });
                }
            });
            Logger.success('📂 Data loaded successfully', { workflows: savedData.workflows.length });
        } else {
            Logger.warn('⚠️ Invalid or non-existent data, using defaults');
            boardData = getDefaultData();
            Logger.info('🔄 Default data loaded');
        }
    } catch (e) {
        Logger.error('💥 Error while loading data', e);
        boardData = getDefaultData();
        Logger.info('🔄 Default data loaded');
    }

    // Update project title
    const updateProjectTitle = ErrorHandler.wrapSync(() => {
        if (boardData.projectName) {
            projectTitle.textContent = boardData.projectName;
            // Dynamic SEO update of page title
            document.title = `${boardData.projectName} - Online Kanban`;

            // Dynamic meta tags update
            updateMetaTags(boardData.projectName);

            Logger.debug('🏷️ Project title updated', { title: boardData.projectName });
        }
    }, 'Project title update');

    // Function to update meta tags dynamically
    const updateMetaTags = (projectName) => {
        if (updateMetaTags.lastProjectName === projectName) return;
        updateMetaTags.lastProjectName = projectName;

        const description = `Manage your project "${projectName}" with our free Kanban tool. Intuitive interface, drag & drop, customizable columns for optimal productivity.`;

        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            metaDescription.setAttribute('content', description);
        }

        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
            ogTitle.setAttribute('content', `${projectName} - Online Kanban`);
        }

        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) {
            ogDescription.setAttribute('content', description);
        }

        const twitterTitle = document.querySelector('meta[property="twitter:title"]');
        if (twitterTitle) {
            twitterTitle.setAttribute('content', `${projectName} - Online Kanban`);
        }

        const twitterDescription = document.querySelector('meta[property="twitter:description"]');
        if (twitterDescription) {
            twitterDescription.setAttribute('content', description);
        }

        Logger.debug('🔍 SEO Meta tags updated', { projectName, description });
    };

    // Generate dynamic keywords based on content
    const generateDynamicKeywords = () => {
        const keywords = ['kanban', 'project management', 'tasks', 'productivity'];

        if (boardData.workflows) {
            boardData.workflows.forEach(workflow => {
                if (workflow.title && workflow.title.length > 2) {
                    keywords.push(workflow.title.toLowerCase());
                }
            });
        }

        if (boardData.projectName && boardData.projectName !== 'Online Kanban') {
            keywords.push(boardData.projectName.toLowerCase());
        }

        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords) {
            metaKeywords.setAttribute('content', keywords.join(', '));
        }

        Logger.debug('🔍 Dynamic keywords generated', { keywords });
    };

    // Track events (Google Analytics ready)
    const trackEvent = (action, category = 'Kanban', label = null, value = null) => {
        if (typeof gtag !== 'undefined') {
            gtag('event', action, {
                event_category: category,
                event_label: label,
                value: value
            });
        }

        if (Logger.currentLevel >= 4) {
            Logger.debug('📊 Event tracked', { action, category, label, value });
        }
    };

    // --- Functions ---
    const saveData = ErrorHandler.wrapSync(() => {
        Logger.debug('💾 Saving data');
        localStorage.setItem('kanbanBoard', JSON.stringify(boardData));
        Logger.success('✅ Data saved successfully');
    }, 'Data saving');

    const renderBoard = ErrorHandler.wrapSync(() => {
        Logger.debug('🎨 Rendering Kanban board');
        kanbanBoard.innerHTML = '';
        if (!boardData.workflows || boardData.workflows.length === 0) {
            Logger.info('📋 No columns to display');
            kanbanBoard.innerHTML = '<p style="text-align: center; width: 100%; opacity: 0.7;">Your board is empty. Add a column to start!</p>';
        } else {
            Logger.debug('🏗️ Rendering columns', { count: boardData.workflows.length });
            boardData.workflows.forEach(workflow => {
                const columnEl = document.createElement('div');
                columnEl.className = 'workflow-column';
                columnEl.dataset.workflowId = workflow.id;

                const isLocked = workflow.locked || false;
                const lockIcon = isLocked ? ' <span class="material-symbols-outlined" style="font-size: 1.2em; vertical-align: bottom; opacity: 0.6;" title="Locked">lock</span>' : '';
                const headerClass = isLocked ? 'workflow-header locked' : 'workflow-header';

                columnEl.innerHTML = `
                    <div class="${headerClass}" style="border-left: 4px solid ${workflow.color || '#1a73e8'}">
                        <h3>${workflow.title}${lockIcon}</h3>
                        <div class="workflow-actions">
                            <button class="workflow-menu-btn" title="Column Options">
                                <span class="material-symbols-outlined">more_vert</span>
                            </button>
                            <div class="workflow-menu">
                                <button class="edit-workflow-btn" data-workflow-id="${workflow.id}">
                                    <span class="material-symbols-outlined">edit</span> Edit
                                </button>
                                <button class="lock-workflow-btn" data-workflow-id="${workflow.id}">
                                    <span class="material-symbols-outlined">${isLocked ? 'lock_open' : 'lock'}</span> ${isLocked ? 'Unlock' : 'Lock'}
                                </button>
                                <button class="duplicate-workflow-btn" data-workflow-id="${workflow.id}">
                                    <span class="material-symbols-outlined">content_copy</span> Duplicate
                                </button>
                                <button class="add-task-btn-menu" data-workflow-id="${workflow.id}">
                                    <span class="material-symbols-outlined">add_task</span> Add Task
                                </button>
                                <button class="delete-workflow-btn delete" data-workflow-id="${workflow.id}">
                                    <span class="material-symbols-outlined">delete</span> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="task-list" data-workflow-id="${workflow.id}"></div>
                `;

                const taskList = columnEl.querySelector('.task-list');
                workflow.tasks.forEach(task => {
                    const taskCard = document.createElement('div');
                    taskCard.className = 'task-card';
                    taskCard.dataset.taskId = task.id;
                    taskCard.style.borderLeftColor = task.color;
                    taskCard.innerHTML = `
                        <button class="task-card-edit-btn" title="Edit Task">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <h4>${task.title}</h4>
                        <p>${task.description}</p>
                    `;
                    taskList.appendChild(taskCard);
                });
                kanbanBoard.appendChild(columnEl);
            });
        }
        Logger.success('✨ Board rendered successfully');
        initDragAndDrop();
        generateDynamicKeywords();
        saveData();
    }, 'Board rendering');

    const initDragAndDrop = () => {
        new Sortable(kanbanBoard, {
            group: 'columns',
            animation: 150,
            handle: '.workflow-header',
            filter: '.locked', // Disable dragging if element has class .locked
            onStart: () => {
                isDraggingInternal = true;
            },
            onEnd: (evt) => {
                isDraggingInternal = false;
                const [movedItem] = boardData.workflows.splice(evt.oldIndex, 1);
                boardData.workflows.splice(evt.newIndex, 0, movedItem);
                renderBoard();
            }
        });
        document.querySelectorAll('.task-list').forEach(list => {
            new Sortable(list, {
                group: 'tasks', animation: 150,
                onStart: () => {
                    isDraggingInternal = true;
                },
                onEnd: (evt) => {
                    isDraggingInternal = false;
                    const taskId = evt.item.dataset.taskId;
                    const oldWorkflow = boardData.workflows.find(w => w.id == evt.from.dataset.workflowId);
                    const taskIndex = oldWorkflow.tasks.findIndex(t => t.id == taskId);
                    const [task] = oldWorkflow.tasks.splice(taskIndex, 1);
                    const newWorkflow = boardData.workflows.find(w => w.id == evt.to.dataset.workflowId);
                    newWorkflow.tasks.splice(evt.newIndex, 0, task);
                    renderBoard();
                }
            });
        });
    };

    const openModal = (modal) => modal.classList.add('visible');
    const closeModal = (modal) => modal.classList.remove('visible');

    const openAddModal = (type, workflowId = null) => {
        addModalType.value = type;
        addModalInput.value = '';
        addModalTitle.textContent = type === 'workflow' ? 'Add Column' : 'Add Task';
        addModalInput.placeholder = type === 'workflow' ? 'New column name' : 'New task title';
        if (workflowId) addModalWorkflowId.value = workflowId;
        openModal(addModal);
        addModalInput.focus();
    };

    const showConfirm = (message, onConfirm) => {
        confirmMessage.textContent = message;
        confirmCallback = onConfirm;
        openModal(confirmModal);
    };

    confirmOkBtn.addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeModal(confirmModal);
        confirmCallback = null;
    });

    confirmCancelBtn.addEventListener('click', () => {
        closeModal(confirmModal);
        confirmCallback = null;
    });

    // --- CRUD Logic ---
    saveAddBtn.addEventListener('click', ErrorHandler.wrapSync(() => {
        const type = addModalType.value;
        const title = addModalInput.value.trim();
        if (title) {
            if (type === 'workflow') {
                const newWorkflow = {
                    id: Date.now(),
                    title,
                    color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
                    tasks: []
                };
                boardData.workflows.push(newWorkflow);
                trackEvent('create_workflow', 'Workflow', title);
                Logger.success('🆕 New column created', { id: newWorkflow.id, title, color: newWorkflow.color });
                ErrorHandler.showUserNotification(`Column "${title}" created!`, 'success');
            } else {
                const workflow = boardData.workflows.find(w => w.id == addModalWorkflowId.value);
                if (workflow) {
                    const newTask = { id: Date.now(), title, description: 'Click to edit...', color: '#6b7280' };
                    workflow.tasks.push(newTask);
                    trackEvent('create_task', 'Task', title);
                    Logger.success('📝 New task created', {
                        taskId: newTask.id,
                        title,
                        workflowTitle: workflow.title
                    });
                    ErrorHandler.showUserNotification(`Task "${title}" created!`, 'success');
                } else {
                    Logger.error('❌ Could not find column to add task');
                }
            }
            renderBoard();
            closeModal(addModal);
        } else {
            Logger.warn('⚠️ Attempted to add with empty title');
            ErrorHandler.showUserNotification('⚠️ Please enter a title', 'error');
        }
    }, 'Adding item'));

    workflowForm.saveBtn.addEventListener('click', ErrorHandler.wrapSync(() => {
        const workflow = boardData.workflows.find(w => w.id == workflowForm.id.value);
        if (workflow) {
            const oldTitle = workflow.title;
            workflow.title = workflowForm.title.value;
            workflow.color = workflowForm.color.value;
            Logger.success('✏️ Column modified', {
                id: workflow.id,
                oldTitle,
                newTitle: workflow.title
            });
            renderBoard();
            ErrorHandler.showUserNotification(`Column "${workflow.title}" modified!`, 'success');
        } else {
            Logger.error('❌ Could not find column to modify');
            ErrorHandler.showUserNotification('❌ Error while modifying column', 'error');
        }
        closeModal(workflowModal);
    }, 'Modifying column'));

    workflowForm.deleteBtn.addEventListener('click', ErrorHandler.wrapSync(() => {
        showConfirm('Are you sure you want to delete this column and all its tasks?', () => {
            const deletedWorkflow = boardData.workflows.find(w => w.id == workflowForm.id.value);
            const deletedWorkflowTitle = deletedWorkflow ? deletedWorkflow.title : 'Column';
            const deletedTasksCount = deletedWorkflow ? deletedWorkflow.tasks.length : 0;

            boardData.workflows = boardData.workflows.filter(w => w.id != workflowForm.id.value);
            Logger.success('🗑️ Column deleted from modal', {
                title: deletedWorkflowTitle,
                tasksDeleted: deletedTasksCount
            });
            renderBoard();
            ErrorHandler.showUserNotification(
                `Column "${deletedWorkflowTitle}" and ${deletedTasksCount} task(s) deleted`,
                'success'
            );
            closeModal(workflowModal);
        });
    }, 'Deleting column from modal'));

    taskForm.saveBtn.addEventListener('click', () => {
        for (const workflow of boardData.workflows) {
            const task = workflow.tasks.find(t => t.id == taskForm.id.value);
            if (task) {
                const oldTitle = task.title;
                task.title = taskForm.title.value;
                task.description = taskForm.description.value;
                task.color = taskForm.color.value;
                Logger.success('✏️ Task modified', {
                    id: task.id,
                    oldTitle,
                    newTitle: task.title
                });
                renderBoard();
                ErrorHandler.showUserNotification(`Task "${task.title}" modified!`, 'success');
                break;
            }
        }
        closeModal(taskModal);
    });

    taskForm.deleteBtn.addEventListener('click', () => {
        showConfirm('Are you sure you want to delete this task?', () => {
            let deletedTaskTitle = '';
            for (const workflow of boardData.workflows) {
                const task = workflow.tasks.find(t => t.id == taskForm.id.value);
                if (task) {
                    deletedTaskTitle = task.title;
                    break;
                }
            }

            boardData.workflows.forEach(w => { w.tasks = w.tasks.filter(t => t.id != taskForm.id.value) });
            Logger.success('🗑️ Task deleted', { title: deletedTaskTitle });
            renderBoard();
            ErrorHandler.showUserNotification(`Task "${deletedTaskTitle}" deleted`, 'success');
            closeModal(taskModal);
        });
    });

    taskForm.duplicateBtn.addEventListener('click', () => {
        for (const workflow of boardData.workflows) {
            const task = workflow.tasks.find(t => t.id == taskForm.id.value);
            if (task) {
                const newTask = JSON.parse(JSON.stringify(task));
                newTask.id = Date.now();
                newTask.title = `${task.title} (Copy)`;
                workflow.tasks.push(newTask);
                Logger.success('📋 Task duplicated', {
                    oldId: task.id,
                    newId: newTask.id,
                    title: newTask.title
                });
                renderBoard();
                ErrorHandler.showUserNotification(`Task "${task.title}" duplicated!`, 'success');
                break;
            }
        }
        closeModal(taskModal);
    });

    // --- Event Listeners ---
    addWorkflowBtn.addEventListener('click', () => openAddModal('workflow'));

    projectTitle.addEventListener('click', ErrorHandler.wrapSync(() => {
        Logger.info('✏️ Opening project rename modal');
        projectNameInput.value = boardData.projectName || 'Online Kanban';
        projectModal.classList.add('visible');
        projectNameInput.focus();
        projectNameInput.select();
    }, 'Project modal opening'));

    saveProjectBtn.addEventListener('click', ErrorHandler.wrapSync(() => {
        const newName = projectNameInput.value.trim();
        if (newName) {
            boardData.projectName = newName;
            updateProjectTitle();
            saveData();
            projectModal.classList.remove('visible');
            Logger.success('🏷️ Project name modified', { newName });
            ErrorHandler.showUserNotification('Project name modified successfully!', 'success');
        }
    }, 'Project name saving'));

    projectNameInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') saveProjectBtn.click();
        if (e.key === 'Escape') projectModal.classList.remove('visible');
    });

    kanbanBoard.addEventListener('click', (e) => {
        // Column Menu
        const menuBtn = e.target.closest('.workflow-menu-btn');
        if (menuBtn) {
            const menu = menuBtn.nextElementSibling;
            const isVisible = menu.classList.contains('visible');
            document.querySelectorAll('.workflow-menu').forEach(m => m.classList.remove('visible'));
            if (!isVisible) menu.classList.add('visible');
            return;
        }

        // Edit Column
        const editWorkflowBtn = e.target.closest('.edit-workflow-btn');
        if (editWorkflowBtn) {
            const workflow = boardData.workflows.find(w => w.id == editWorkflowBtn.dataset.workflowId);
            if (workflow) {
                workflowForm.id.value = workflow.id;
                workflowForm.title.value = workflow.title;
                workflowForm.color.value = workflow.color;
                openModal(workflowModal);
            }
        }

        // Duplicate Column
        const duplicateWorkflowBtn = e.target.closest('.duplicate-workflow-btn');
        if (duplicateWorkflowBtn) {
            const workflow = boardData.workflows.find(w => w.id == duplicateWorkflowBtn.dataset.workflowId);
            if (workflow) {
                const newWorkflow = JSON.parse(JSON.stringify(workflow));
                newWorkflow.id = Date.now();
                newWorkflow.title = `${workflow.title} (Copy)`;
                newWorkflow.tasks.forEach((t, i) => { t.id = Date.now() + i + 1; });

                boardData.workflows.push(newWorkflow);
                Logger.success('📋 Column duplicated', { title: newWorkflow.title });
                renderBoard();
                ErrorHandler.showUserNotification(`Column "${workflow.title}" duplicated!`, 'success');
            }
        }

        // Add Task Menu
        const addTaskMenuBtn = e.target.closest('.add-task-btn-menu');
        if (addTaskMenuBtn) {
            openAddModal('task', addTaskMenuBtn.dataset.workflowId);
        }

        // Delete Column
        const deleteWorkflowBtn = e.target.closest('.delete-workflow-btn');
        if (deleteWorkflowBtn) {
            showConfirm('Are you sure you want to delete this column and all its tasks?', () => {
                const deletedWorkflowId = deleteWorkflowBtn.dataset.workflowId;
                const deletedWorkflow = boardData.workflows.find(w => w.id == deletedWorkflowId);
                const deletedWorkflowTitle = deletedWorkflow ? deletedWorkflow.title : 'Column';
                const deletedTasksCount = deletedWorkflow ? deletedWorkflow.tasks.length : 0;

                boardData.workflows = boardData.workflows.filter(w => w.id != deletedWorkflowId);
                Logger.success('🗑️ Column deleted from menu', { title: deletedWorkflowTitle });
                renderBoard();
                ErrorHandler.showUserNotification(
                    `Column "${deletedWorkflowTitle}" and ${deletedTasksCount} task(s) deleted`,
                    'success'
                );
            });
        }

        // Lock/Unlock Column
        const lockWorkflowBtn = e.target.closest('.lock-workflow-btn');
        if (lockWorkflowBtn) {
            const workflow = boardData.workflows.find(w => w.id == lockWorkflowBtn.dataset.workflowId);
            if (workflow) {
                workflow.locked = !workflow.locked;
                Logger.success(`🔒 Column ${workflow.locked ? 'locked' : 'unlocked'}`, { title: workflow.title });
                renderBoard();
                ErrorHandler.showUserNotification(`Column "${workflow.title}" ${workflow.locked ? 'locked' : 'unlocked'}!`, 'success');
            }
        }

        // Edit Task (Card click or Edit button click)
        const taskCard = e.target.closest('.task-card');
        const editTaskBtn = e.target.closest('.task-card-edit-btn');

        if (taskCard || editTaskBtn) {
            // If click was on edit button, use that card
            const targetCard = editTaskBtn ? editTaskBtn.closest('.task-card') : taskCard;
            const workflowId = targetCard.parentElement.dataset.workflowId;
            const workflow = boardData.workflows.find(w => w.id == workflowId);
            if (!workflow) return;

            const task = workflow.tasks.find(t => t.id == targetCard.dataset.taskId);
            if (task) {
                taskForm.id.value = task.id;
                taskForm.title.value = task.title;
                taskForm.description.value = task.description;
                taskForm.color.value = task.color;
                openModal(taskModal);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.workflow-actions')) {
            document.querySelectorAll('.workflow-menu.visible').forEach(m => m.classList.remove('visible'));
        }
    });

    themeToggleBtn.addEventListener('click', ErrorHandler.wrapSync(() => {
        Logger.debug('🎨 Theme toggle');
        const isDark = document.body.classList.toggle('dark-mode');
        themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        Logger.success(`✅ Theme changed to ${isDark ? 'dark' : 'light'}`);
    }, 'Theme toggle'));

    exportBtn.addEventListener('click', ErrorHandler.wrapSync(() => {
        Logger.info('📤 Starting data export');
        trackEvent('export_project', 'Data', boardData.projectName);
        const dataStr = JSON.stringify(boardData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const projectName = (boardData.projectName || 'Online Kanban').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `${projectName}.kanban`;
        a.click();
        URL.revokeObjectURL(url);
        Logger.success('📦 Export successful');
        ErrorHandler.showUserNotification('Board exported successfully!', 'success');
    }, 'Data export'));

    importInput.addEventListener('change', ErrorHandler.wrapSync((e) => {
        const file = e.target.files[0];
        if (file && file.name.endsWith('.kanban')) {
            Logger.info('📥 Starting data import', { fileName: file.name });
            processImportFile(file);
        } else {
            Logger.warn('⚠️ Invalid file selected');
            ErrorHandler.showUserNotification('⚠️ Please select a valid .kanban file.', 'error');
        }
        e.target.value = '';
    }, 'Data import'));

    [addModal, taskModal, workflowModal, projectModal, confirmModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-close-btn')) {
                closeModal(modal);
            }
        });
    });

    addModalInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') saveAddBtn.click() });

    // --- Drag and Drop for Import ---
    let dragCounter = 0;
    let isDraggingInternal = false;

    const handleDragEnter = (e) => {
        if (isDraggingInternal) return;
        e.preventDefault();
        dragCounter++;
        document.body.classList.add('drag-over');
    };

    const handleDragLeave = (e) => {
        if (isDraggingInternal) return;
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            document.body.classList.remove('drag-over');
        }
    };

    const handleDragOver = (e) => {
        if (isDraggingInternal) return;
        e.preventDefault();
    };

    const handleDrop = ErrorHandler.wrapSync((e) => {
        if (isDraggingInternal) return;
        e.preventDefault();
        dragCounter = 0;
        document.body.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.kanban')) {
                Logger.info('📥 Drag & drop import', { fileName: file.name });
                processImportFile(file);
            } else {
                ErrorHandler.showUserNotification('⚠️ Only .kanban files are supported', 'error');
            }
        }
    }, 'Drag and Drop');

    const processImportFile = (file) => {
        const reader = new FileReader();
        reader.onload = ErrorHandler.wrapSync((event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (importedData.workflows && Array.isArray(importedData.workflows)) {
                    boardData = importedData;
                    if (!boardData.projectName) boardData.projectName = 'Online Kanban';
                    updateProjectTitle();
                    renderBoard();
                    trackEvent('import_project', 'Data', boardData.projectName);
                    ErrorHandler.showUserNotification('Board imported successfully!', 'success');
                } else {
                    throw new Error('Invalid file format.');
                }
            } catch (error) {
                ErrorHandler.showUserNotification(`❌ Error: ${error.message}`, 'error');
            }
        }, 'Reading import file');
        reader.readAsText(file);
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    // --- Initialization ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggleBtn.textContent = '☀️';
    }

    updateProjectTitle();
    renderBoard();
    Logger.success('🎉 OnlineKanban initialized successfully!');
});
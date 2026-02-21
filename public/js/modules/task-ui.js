import { elements } from './dom.js';
import * as API from './api.js';
import { state } from './state.js';
import { openModal, closeModal, showConfirm } from './modals.js';
import { renderBoard, saveData } from './board-ui.js';
import { Logger, getInitials } from './utils.js';
import { trackEvent } from './board-ui.js';

let tempTags = [];
let tempCustomFields = [];
let tempAssignees = [];
let tempMedia = [];
let currentViewingTask = null;
let currentViewingWorkflow = null;

// --- Task Editing Logic ---
export const openTaskEditModal = (task, workflow) => {
    elements.taskForm.id.value = task.id;
    elements.taskForm.title.value = task.title;
    elements.taskForm.description.value = task.description;
    elements.taskForm.color.value = task.color;
    elements.taskForm.showTags.checked = task.showTags !== false;
    elements.taskForm.showDesc.checked = task.showDescriptionOnCard !== false;
    elements.taskForm.showAssignees.checked = task.showAssigneesOnCard !== false;

    // Trigger auto-resize
    autoResizeTextarea(elements.taskForm.description);

    tempTags = task.tags ? [...task.tags] : [];
    tempCustomFields = task.customFields ? JSON.parse(JSON.stringify(task.customFields)) : [];
    tempAssignees = task.assignees ? [...task.assignees] : [];
    tempMedia = task.media ? [...task.media] : [];

    renderTags(tempTags);
    renderCustomFields(tempCustomFields);
    renderTaskAssignees();
    renderAvailableTags();
    renderMediaGallery(tempMedia, elements.taskForm.mediaGallery, true);

    elements.taskForm.columnSelect.innerHTML = '';
    state.boardData.workflows.forEach(w => {
        const option = document.createElement('option');
        option.value = w.id;
        option.textContent = w.title + (w.locked ? ' (🔒)' : '');
        if (w.id == workflow.id) option.selected = true;
        elements.taskForm.columnSelect.appendChild(option);
    });

    openModal(elements.taskModal);
};

export const initTaskListeners = () => {
    elements.taskForm.saveBtn.addEventListener('click', () => {
        const taskId = elements.taskForm.id.value;
        // Find task across workflows
        for (const workflow of state.boardData.workflows) {
            const tIndex = workflow.tasks.findIndex(t => t.id == taskId);
            if (tIndex !== -1) {
                const task = workflow.tasks[tIndex];
                const newWorkflowId = elements.taskForm.columnSelect.value;
                const targetWorkflow = state.boardData.workflows.find(w => w.id == newWorkflowId);

                task.title = elements.taskForm.title.value;
                task.description = elements.taskForm.description.value;
                task.color = elements.taskForm.color.value;
                task.tags = [...tempTags];
                task.customFields = [...tempCustomFields];
                task.assignees = [...tempAssignees];
                task.media = [...tempMedia];
                task.showTags = elements.taskForm.showTags.checked;
                task.showDescriptionOnCard = elements.taskForm.showDesc.checked;
                task.showAssigneesOnCard = elements.taskForm.showAssignees.checked;

                if (workflow.id != newWorkflowId && targetWorkflow) {
                    workflow.tasks.splice(tIndex, 1);
                    targetWorkflow.tasks.push(task);
                }
                break;
            }
        }
        saveData();
        renderBoard();
        closeModal(elements.taskModal);
    });

    elements.taskForm.deleteBtn.addEventListener('click', () => {
        const taskId = elements.taskForm.id.value;
        showConfirm('Delete task?', () => {
            for (const workflow of state.boardData.workflows) {
                const tIndex = workflow.tasks.findIndex(t => t.id == taskId);
                if (tIndex !== -1) {
                    workflow.tasks.splice(tIndex, 1);
                    break;
                }
            }
            saveData();
            renderBoard();
            closeModal(elements.taskModal);
        });
    });

    elements.taskForm.duplicateBtn.addEventListener('click', () => {
        const taskId = elements.taskForm.id.value;
        for (const workflow of state.boardData.workflows) {
            const task = workflow.tasks.find(t => t.id == taskId);
            if (task) {
                const newTask = JSON.parse(JSON.stringify(task));
                newTask.id = Date.now();
                newTask.title = `${task.title} (Copy)`;
                workflow.tasks.push(newTask);
                saveData();
                renderBoard();
                closeModal(elements.taskModal);
                break;
            }
        }
    });

    // Tag Logic
    elements.taskForm.showTagPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = elements.taskForm.tagPicker.classList.contains('hidden');
        toggleTagPicker(!isHidden); // FIX: !isHidden means if TRUE (hidden), show it.
        // Actually toggleTagPicker param name is 'show'?
        // Original code: toggleTagPicker(isHidden);
        // if isHidden is true, we want to show.
        if (isHidden) {
            toggleTagPicker(true);
        } else {
            toggleTagPicker(false);
        }
    });

    elements.taskForm.addTagBtn.addEventListener('click', () => {
        const name = elements.taskForm.newTagName.value.trim();
        const color = elements.taskForm.newTagColor.value;
        if (name) {
            const newTag = { name, color };
            if (!state.boardData.tags) state.boardData.tags = [];
            if (!state.boardData.tags.find(t => t.name === name)) {
                state.boardData.tags.push(newTag);
            }
            tempTags.push(newTag);
            renderTags(tempTags);
            elements.taskForm.newTagName.value = '';
            toggleTagPicker(false);
        }
    });

    // Close tag picker when clicking outside
    document.addEventListener('click', (e) => {
        if (elements.taskForm.tagPicker && !elements.taskForm.tagPicker.classList.contains('hidden') &&
            !elements.taskForm.tagPicker.contains(e.target) &&
            e.target !== elements.taskForm.showTagPickerBtn &&
            !elements.taskForm.showTagPickerBtn.contains(e.target)) {
            toggleTagPicker(false);
        }

        if (elements.assigneePicker && !elements.assigneePicker.classList.contains('hidden') &&
            !elements.assigneePicker.contains(e.target) &&
            e.target !== elements.addAssigneeBtn &&
            !elements.addAssigneeBtn.contains(e.target)) {
            elements.assigneePicker.classList.add('hidden');
        }
    });

    // Custom Fields Listeners
    elements.taskForm.addCustomFieldBtn.addEventListener('click', () => {
        tempCustomFields.push({ name: 'New Field', value: '', type: 'text', showOnCard: false });
        renderCustomFields(tempCustomFields);
    });

    // Assignee Listeners
    elements.addAssigneeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.assigneePicker.classList.remove('hidden');
        renderAssigneePickerList();
    });

    // View Task Listeners
    elements.viewTaskDisplay.editBtn.addEventListener('click', () => {
        closeModal(elements.viewTaskModal);
        openTaskEditModal(currentViewingTask, currentViewingWorkflow);
    });

    // Auto-resize textarea listener
    elements.taskForm.description.addEventListener('input', (e) => {
        autoResizeTextarea(e.target);
    });

    // Media Upload
    if (elements.taskForm.mediaUpload) {
        const processFiles = (files) => {
            Array.from(files).forEach(file => {
                const type = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : null);
                if (!type) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    tempMedia.push({ type, data: event.target.result });
                    renderMediaGallery(tempMedia, elements.taskForm.mediaGallery, true);
                };
                reader.readAsDataURL(file);
            });
        };

        elements.taskForm.mediaUpload.addEventListener('change', (e) => {
            processFiles(e.target.files);
            e.target.value = '';
        });

        const mediaDropzone = document.querySelector('.media-upload-label[for="task-media-upload"]');
        if (mediaDropzone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                mediaDropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                mediaDropzone.addEventListener(eventName, () => mediaDropzone.classList.add('drag-active'), false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                mediaDropzone.addEventListener(eventName, () => mediaDropzone.classList.remove('drag-active'), false);
            });

            mediaDropzone.addEventListener('drop', (e) => {
                processFiles(e.dataTransfer.files);
            }, false);
        }
    }

    // Discussion Listeners
    if (elements.viewTaskDisplay.sendCommentBtn) {
        elements.viewTaskDisplay.sendCommentBtn.addEventListener('click', () => {
            const text = elements.viewTaskDisplay.commentInput.value.trim();
            if (text && currentViewingTask) {
                // Find task in current board data to avoid stale reference
                let taskToUpdate = null;
                for (const workflow of state.boardData.workflows) {
                    taskToUpdate = workflow.tasks.find(t => t.id == currentViewingTask.id);
                    if (taskToUpdate) break;
                }

                if (taskToUpdate) {
                    if (!taskToUpdate.comments) taskToUpdate.comments = [];
                    taskToUpdate.comments.push({
                        author: state.currentUser?.name || 'Anonymous',
                        text: text,
                        timestamp: Date.now()
                    });
                    elements.viewTaskDisplay.commentInput.value = '';
                    renderComments(taskToUpdate);
                    saveData();
                    // Update the reference we hold to the new one
                    currentViewingTask = taskToUpdate;
                }
            }
        });
    }

    if (elements.viewTaskDisplay.commentInput) {
        elements.viewTaskDisplay.commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                elements.viewTaskDisplay.sendCommentBtn.click();
            }
        });
    }

    // Toggle checklist item from view modal
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('checklist-view-toggle')) {
            const fieldName = e.target.dataset.field;
            const idx = e.target.dataset.idx;
            const isChecked = e.target.checked;

            if (currentViewingTask) {
                for (const workflow of state.boardData.workflows) {
                    const taskToUpdate = workflow.tasks.find(t => t.id == currentViewingTask.id);
                    if (taskToUpdate && taskToUpdate.customFields) {
                        const field = taskToUpdate.customFields.find(f => f.name === fieldName);
                        if (field && field.type === 'checklist') {
                            let items = [];
                            try { items = typeof field.value === 'string' ? JSON.parse(field.value) : (field.value || []); } catch (err) { items = []; }
                            if (items[idx]) {
                                items[idx].checked = isChecked;
                                field.value = JSON.stringify(items);
                                saveData();
                                renderBoard();
                                openViewTaskModal(taskToUpdate, workflow);
                            }
                        }
                        break;
                    }
                }
            }
        }
    });

};

const autoResizeTextarea = (el) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
};

// --- View Task Logic ---
export const openViewTaskModal = (task, workflow) => {
    currentViewingTask = task;
    currentViewingWorkflow = workflow;

    // Hide edit button for readers
    if (elements.viewTaskDisplay.editBtn) {
        elements.viewTaskDisplay.editBtn.style.display = state.currentUser?.role === 'reader' ? 'none' : 'flex';
    }

    elements.viewTaskDisplay.title.textContent = task.title;

    // Conditionally show/hide sections
    const hasDesc = !!task.description;
    elements.viewTaskDisplay.descSection.style.display = hasDesc ? 'block' : 'none';
    if (hasDesc) elements.viewTaskDisplay.desc.innerHTML = marked.parse(task.description);

    elements.viewTaskAssignees.innerHTML = (task.assignees || []).map(a => {
        const isCurrentUser = state.currentUser && (a.id === state.currentUser.id || a.name === state.currentUser.name);
        const currentUserObj = isCurrentUser ? state.currentUser : a;
        const avatarUrl = isCurrentUser && state.currentUser.avatar_url ? state.currentUser.avatar_url : a.avatar_url;
        return `
            ${avatarUrl ? `<img src="${avatarUrl}" class="task-assignee-avatar" title="${currentUserObj.name}" style="object-fit: cover;">` : `<div class="task-assignee-avatar" title="${currentUserObj.name}">${getInitials(currentUserObj)}</div>`}
            <span style="font-size:0.9rem;">${currentUserObj.name}</span>
        `;
    }).join('');

    const hasTags = (task.tags || []).length > 0;
    elements.viewTaskDisplay.tagsSection.style.display = hasTags ? 'block' : 'none';
    if (hasTags) {
        elements.viewTaskDisplay.tags.innerHTML = task.tags.map(tag => `<span class="tag-pill" style="background:${tag.color}">${tag.name}</span>`).join('');
    }

    const hasCustomFields = (task.customFields || []).length > 0;
    elements.viewTaskDisplay.customFieldsSection.style.display = hasCustomFields ? 'block' : 'none';
    if (hasCustomFields) {
        elements.viewTaskDisplay.customFields.innerHTML = task.customFields.map(f => {
            let val = f.value;
            if (f.type === 'link') {
                val = `<a href="${f.value}" target="_blank" class="text-primary hover:underline">${f.value}</a>`;
            } else if (f.type === 'checklist') {
                let items = [];
                try { items = typeof f.value === 'string' ? JSON.parse(f.value) : (f.value || []); } catch (e) { items = []; }
                let progress = items.length ? Math.round((items.filter(i => i.checked).length / items.length) * 100) : 0;

                val = `
                <div style="margin-top: 4px; width: 100%;">
                    <div style="font-size: 0.8rem; background: var(--border-color); border-radius: 4px; height: 6px; overflow: hidden; margin-bottom: 8px;">
                        <div style="background: var(--primary-color); width: ${progress}%; height: 100%; transition: width 0.3s;"></div>
                    </div>
                    ${items.map((item, i) => `
                        <div style="display:flex; align-items:flex-start; gap:6px; margin-bottom: 4px;">
                            <input type="checkbox" class="checklist-view-toggle cursor-pointer" style="margin-top:2px; width:16px; height:16px; flex-shrink:0;" data-field="${f.name.replace(/"/g, '&quot;')}" data-idx="${i}" ${item.checked ? 'checked' : ''} ${state.currentUser?.role === 'reader' ? 'disabled' : ''}>
                            <span style="font-size: 0.9rem; line-height: 1.2; padding-top:2px; ${item.checked ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${item.text}</span>
                        </div>
                    `).join('')}
                </div>`;
            }

            return `<div class="custom-field-view" ${f.type === 'checklist' ? 'style="flex-direction: column; align-items: flex-start;"' : ''}>
                 <span class="field-name">${f.name}:</span>
                 <span class="field-value" style="${f.type === 'checklist' ? 'width: 100%;' : ''}">${val}</span>
             </div>`;
        }).join('');
    }

    const hasMedia = (task.media || []).length > 0;
    elements.viewTaskDisplay.mediaSection.style.display = hasMedia ? 'block' : 'none';
    if (hasMedia) {
        renderMediaGallery(task.media, elements.viewTaskDisplay.mediaGallery, false);
    }
    renderComments(task);

    openModal(elements.viewTaskModal);
};

export const refreshTaskView = () => {
    if (!currentViewingTask || !elements.viewTaskModal.classList.contains('visible')) return;

    let latestTask = null;
    let latestWorkflow = null;
    for (const workflow of state.boardData.workflows) {
        latestTask = workflow.tasks.find(t => t.id == currentViewingTask.id);
        if (latestTask) {
            latestWorkflow = workflow;
            break;
        }
    }

    if (latestTask) {
        currentViewingTask = latestTask;
        currentViewingWorkflow = latestWorkflow;
        renderComments(latestTask);
        // Also update comment count on the task card if we want to be thorough, 
        // but renderBoard() already does that.
    } else {
        closeModal(elements.viewTaskModal);
    }
};



// --- Helpers ---
const renderTags = (tags) => {
    elements.taskForm.tagsContainer.innerHTML = '';
    tags.forEach((tag, index) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag-pill';
        tagEl.style.backgroundColor = tag.color;
        tagEl.style.display = 'flex';
        tagEl.style.alignItems = 'center';
        tagEl.innerHTML = `
            <span class="material-symbols-outlined drag-handle" style="font-size: 14px; margin-right: 4px;">drag_indicator</span>
            ${tag.name} 
            <span class="remove-tag" data-index="${index}">&times;</span>
        `;
        tagEl.querySelector('.remove-tag').onclick = (e) => {
            e.stopPropagation(); // Stop propagation to prevent issues
            tempTags.splice(index, 1);
            renderTags(tempTags);
        };
        elements.taskForm.tagsContainer.appendChild(tagEl);
    });

    if (tags.length > 1) {
        new Sortable(elements.taskForm.tagsContainer, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: (evt) => {
                const [movedItem] = tempTags.splice(evt.oldIndex, 1);
                tempTags.splice(evt.newIndex, 0, movedItem);
                // We don't re-render here to keep the drag-and-drop smooth,
                // but the tempTags array is now in the correct order.
            }
        });
    }
};

const toggleTagPicker = (show) => {
    if (show) {
        elements.taskForm.tagPicker.classList.remove('hidden');
        renderAvailableTags();
    } else {
        elements.taskForm.tagPicker.classList.add('hidden');
    }
};

const renderAvailableTags = () => {
    if (!elements.taskForm.availableTagsList) return;
    const allTags = state.boardData.tags || [];
    elements.taskForm.availableTagsList.innerHTML = '';

    allTags.forEach((tag, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'tag-option';
        tagEl.style.backgroundColor = tag.color;
        tagEl.innerHTML = `
            <span class="material-symbols-outlined drag-handle" style="font-size: 18px; opacity: 0.7;" onmousedown="event.stopPropagation()">drag_indicator</span>
            <span style="flex: 1;">${tag.name}</span>
        `;
        tagEl.onclick = () => {
            // Check if already added
            if (!tempTags.find(t => t.name === tag.name)) {
                tempTags.push(tag);
                renderTags(tempTags);
            }
            toggleTagPicker(false);
        };
        elements.taskForm.availableTagsList.appendChild(tagEl);
    });

    if (allTags.length > 1) {
        new Sortable(elements.taskForm.availableTagsList, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: (evt) => {
                const [movedItem] = state.boardData.tags.splice(evt.oldIndex, 1);
                state.boardData.tags.splice(evt.newIndex, 0, movedItem);
                saveData();
                renderBoard();
            }
        });
    }

    if (elements.taskForm.availableTagsList.children.length === 0) {
        elements.taskForm.availableTagsList.innerHTML = '<span style="font-size:0.8rem; opacity:0.6; padding:0.5rem;">No other tags available</span>';
    }
};

const renderCustomFields = (fields) => {
    elements.taskForm.customFieldsContainer.innerHTML = '';
    fields.forEach((field, index) => {
        const fieldEl = document.createElement('div');
        fieldEl.className = 'custom-field-item';
        fieldEl.style.cssText = 'border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 8px; margin-bottom: 0.5rem; background: var(--card-bg);';

        let valueContent = '';
        if (field.type === 'checklist') {
            let items = [];
            try { items = typeof field.value === 'string' ? JSON.parse(field.value) : (field.value || []); } catch (e) { items = []; }
            valueContent = `
                <div style="flex-grow:1; display:flex; flex-direction:column; gap:4px; margin-top: 4px;">
                    ${items.map((item, i) => `
                        <div style="display:flex; gap:4px; align-items:center;">
                            <input type="text" value="${item.text.replace(/"/g, '&quot;')}" class="chk-text small-input" data-idx="${i}" style="flex:1; padding: 0.2rem 0.4rem; min-width: 0;">
                            <input type="checkbox" ${item.checked ? 'checked' : ''} class="chk-state" data-idx="${i}" style="margin:0; width:18px; height:18px; flex-shrink:0; cursor:pointer;">
                            <button class="remove-chk-btn" data-idx="${i}" style="background:none; border:none; color:var(--danger-color); cursor:pointer; font-size:1.2rem; flex-shrink:0;">&times;</button>
                        </div>
                    `).join('')}
                    <button class="add-chk-btn secondary-btn small-btn" style="align-self:flex-start; margin-top:4px;">+ Add Item</button>
                    <!-- hidden input to store actual value for generic pipelines if needed -->
                    <input type="hidden" class="field-value" value='${field.value.replace(/'/g, '&#39;')}'>
                </div>
            `;
        } else {
            valueContent = `<input type="text" class="small-input field-value" value="${field.value.replace(/"/g, '&quot;')}" placeholder="Value" style="flex-grow: 1; font-size: 0.9rem; padding: 0.4rem 0.6rem; width: 100%;">`;
        }

        fieldEl.innerHTML = `
            <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
                <span class="material-symbols-outlined drag-handle" style="font-size: 18px; color: var(--text-color); opacity: 0.5;">drag_indicator</span>
                <input type="text" class="small-input field-name" value="${field.name.replace(/"/g, '&quot;')}" placeholder="Field Name" style="flex: 1; font-weight: 500; font-size: 0.9rem; padding: 0.4rem 0.6rem;">
                <label class="checkbox-wrapper" title="Show on card" style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.8rem; opacity: 0.8; white-space: nowrap;">
                     <input type="checkbox" class="field-show" ${field.showOnCard ? 'checked' : ''} style="margin:0;">
                     Show
                </label>
                <button class="remove-field-btn" title="Delete" style="background:none; border:none; cursor:pointer; font-size: 1.1rem; display: flex; align-items: center; padding: 4px; color: #ef4444 !important;">
                    <span class="material-symbols-outlined" style="color: #ef4444 !important;">delete</span>
                </button>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: stretch;">
                 <select class="small-input field-type" style="width: auto; flex-shrink: 0; padding: 0.4rem 0.2rem; font-size: 0.85rem; max-width: 80px;">
                    <option value="text" ${field.type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="number" ${field.type === 'number' ? 'selected' : ''}>Number</option>
                    <option value="link" ${field.type === 'link' ? 'selected' : ''}>Link</option>
                    <option value="date" ${field.type === 'date' ? 'selected' : ''}>Date</option>
                    <option value="checklist" ${field.type === 'checklist' ? 'selected' : ''}>Checklist</option>
                </select>
                ${valueContent}
            </div>
        `;

        // Bind events
        fieldEl.querySelector('.field-name').oninput = (e) => field.name = e.target.value;
        if (field.type === 'checklist') {
            let items = [];
            try { items = typeof field.value === 'string' ? JSON.parse(field.value) : (field.value || []); } catch (e) { items = []; }

            fieldEl.querySelectorAll('.chk-state').forEach(el => {
                el.onchange = (e) => { items[e.target.dataset.idx].checked = e.target.checked; field.value = JSON.stringify(items); };
            });
            fieldEl.querySelectorAll('.chk-text').forEach(el => {
                el.oninput = (e) => { items[e.target.dataset.idx].text = e.target.value; field.value = JSON.stringify(items); };
            });
            fieldEl.querySelectorAll('.remove-chk-btn').forEach(el => {
                el.onclick = (e) => { e.preventDefault(); items.splice(e.target.dataset.idx, 1); field.value = JSON.stringify(items); renderCustomFields(tempCustomFields); };
            });
            const addBtn = fieldEl.querySelector('.add-chk-btn');
            if (addBtn) {
                addBtn.onclick = (e) => { e.preventDefault(); items.push({ text: '', checked: false }); field.value = JSON.stringify(items); renderCustomFields(tempCustomFields); };
            }
        } else {
            const valInput = fieldEl.querySelector('.field-value');
            if (valInput) valInput.oninput = (e) => field.value = e.target.value;
        }

        fieldEl.querySelector('.field-type').onchange = (e) => {
            field.type = e.target.value;
            if (field.type === 'checklist' && (!field.value || typeof field.value !== 'string' || !field.value.startsWith('['))) {
                field.value = JSON.stringify([{ text: 'Item 1', checked: false }]); // Default
            } else if (field.type !== 'checklist') {
                field.value = ''; // Reset value to avoid json breaking text input
            }
            renderCustomFields(tempCustomFields);
        };

        fieldEl.querySelector('.field-show').onchange = (e) => field.showOnCard = e.target.checked;
        fieldEl.querySelector('.remove-field-btn').onclick = () => {
            tempCustomFields.splice(index, 1);
            renderCustomFields(tempCustomFields);
        };

        elements.taskForm.customFieldsContainer.appendChild(fieldEl);
    });

    if (fields.length > 1) {
        new Sortable(elements.taskForm.customFieldsContainer, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: (evt) => {
                const [movedItem] = tempCustomFields.splice(evt.oldIndex, 1);
                tempCustomFields.splice(evt.newIndex, 0, movedItem);
            }
        });
    }
};

const renderTaskAssignees = () => {
    elements.taskAssigneesContainer.innerHTML = '';
    tempAssignees.forEach((user, index) => {
        const el = document.createElement('div');
        el.className = 'assignee-chip';
        const isCurrentUser = state.currentUser && (user.id === state.currentUser.id || user.name === state.currentUser.name);
        const currentUserObj = isCurrentUser ? state.currentUser : user;
        const avatarUrl = isCurrentUser && state.currentUser.avatar_url ? state.currentUser.avatar_url : user.avatar_url;
        el.innerHTML = `
            ${avatarUrl ? `<img src="${avatarUrl}" class="assignee-avatar-small" style="object-fit: cover;">` : `<div class="assignee-avatar-small">${getInitials(currentUserObj)}</div>`}
            <span>${currentUserObj.name}</span>
            <span class="remove-assignee">&times;</span>
        `;
        el.querySelector('.remove-assignee').onclick = () => {
            tempAssignees.splice(index, 1);
            renderTaskAssignees();
        };
        elements.taskAssigneesContainer.appendChild(el);
    });
};

const renderAssigneePickerList = async () => {
    elements.assigneeListEl.innerHTML = 'Loading...';
    try {
        // We need a list of all users, let's fetch simple list
        // Assuming API is imported, wait, API is not imported yet. 
        // I should import API or use existing list if available?
        // Let's use API.
        const data = await API.getSimpleList();
        // Dynamic import to avoid top-level circular dep if any? No, static import is fine generally.
        // Let's stick to import * as API at top. (Check file imports)

        const users = data.users || [];
        elements.assigneeListEl.innerHTML = '';
        users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'assignee-item';
            const isCurrentUser = state.currentUser && (u.id === state.currentUser.id || u.name === state.currentUser.name);
            const currentUserObj = isCurrentUser ? state.currentUser : u;
            const avatarUrl = isCurrentUser && state.currentUser.avatar_url ? state.currentUser.avatar_url : u.avatar_url;
            div.innerHTML = `
                ${avatarUrl ? `<img src="${avatarUrl}" class="assignee-avatar-small" style="object-fit: cover;">` : `<div class="assignee-avatar-small">${getInitials(currentUserObj)}</div>`}
                <span>${currentUserObj.name}</span>
             `;
            div.onclick = () => {
                addTempAssignee(u);
                elements.assigneePicker.classList.add('hidden');
            };
            elements.assigneeListEl.appendChild(div);
        });
    } catch (e) {
        elements.assigneeListEl.innerHTML = 'Error loading users';
    }
};

const addTempAssignee = (user) => {
    if (!tempAssignees.find(u => u.id === user.id)) {
        tempAssignees.push(user);
        renderTaskAssignees();
    }
};

const renderMediaGallery = (media, container, isEditable = false) => {
    if (!container) return;
    container.innerHTML = '';
    media.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = isEditable ? 'media-item' : 'media-view-item';

        let content = '';
        if (item.type === 'image') {
            content = `<img src="${item.data}" alt="Media ${index}">`;
        } else if (item.type === 'video') {
            content = `<video src="${item.data}" ${!isEditable ? 'controls' : ''}></video>`;
        }

        // Actions Overlay
        content += `
            <div class="media-actions-overlay">
                <button class="media-btn download-btn" title="Download">
                    <span class="material-symbols-outlined">download</span>
                </button>
                ${isEditable ? `
                <button class="media-btn delete-btn delete" title="Delete">
                    <span class="material-symbols-outlined">delete</span>
                </button>` : ''}
            </div>`;

        div.innerHTML = content;

        // Download Logic
        div.querySelector('.download-btn').onclick = (e) => {
            e.stopPropagation();
            const a = document.createElement('a');
            a.href = item.data;
            a.download = `media-${index}-${Date.now()}.${item.type === 'image' ? 'png' : 'mp4'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };

        if (isEditable) {
            div.querySelector('.delete-btn').onclick = (e) => {
                e.stopPropagation();
                tempMedia.splice(index, 1);
                renderMediaGallery(tempMedia, container, true);
            };
        } else {
            // Only open preview if clicking the actual image/video, not the overlay/buttons
            const mediaEl = div.querySelector('img, video');
            if (mediaEl) {
                mediaEl.style.cursor = 'pointer';
                mediaEl.onclick = (e) => {
                    e.stopPropagation();
                    if (item.type === 'image') {
                        const win = window.open();
                        win.document.write(`<body style="margin:0; background:#000; display:flex; align-items:center; justify-content:center; height:100vh;"><img src="${item.data}" style="max-width:100%; max-height:100%; object-fit:contain;"></body>`);
                    }
                };
            }
        }

        container.appendChild(div);
    });
};
const renderComments = (task) => {
    const container = elements.viewTaskDisplay.commentsList;
    if (!container) return;

    const comments = task.comments || [];
    container.innerHTML = comments.length === 0 ?
        `<p style="opacity: 0.5; font-size: 0.9rem; font-style: italic;">${localStorage.getItem('lang') === 'fr' ? 'Aucun commentaire pour le moment.' : 'No comments yet.'}</p>` : '';

    comments.forEach(comment => {
        const div = document.createElement('div');
        div.className = 'comment-item';
        div.style.cssText = 'background: var(--card-bg); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color);';

        const date = new Date(comment.timestamp).toLocaleString();

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                <strong style="font-size: 0.85rem; color: var(--primary-color);">${comment.author}</strong>
                <small style="opacity: 0.5; font-size: 0.75rem;">${date}</small>
            </div>
            <div style="font-size: 0.9rem; line-height: 1.4; white-space: pre-wrap;">${comment.text}</div>
        `;
        container.appendChild(div);
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
};

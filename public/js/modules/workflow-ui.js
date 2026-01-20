import { elements } from './dom.js';
import { state } from './state.js';
import { openModal, closeModal, showConfirm } from './modals.js';
import { renderBoard, saveData } from './board-ui.js';

export const openWorkflowModal = (workflow) => {
    elements.workflowForm.id.value = workflow.id;
    elements.workflowForm.title.value = workflow.title;
    elements.workflowForm.color.value = workflow.color;
    elements.workflowForm.locked.checked = !!workflow.locked;
    openModal(elements.workflowModal);
};

export const initWorkflowListeners = () => {
    elements.workflowForm.saveBtn.addEventListener('click', () => {
        const id = elements.workflowForm.id.value;
        const title = elements.workflowForm.title.value.trim();
        const color = elements.workflowForm.color.value;
        const locked = elements.workflowForm.locked.checked;

        const workflow = state.boardData.workflows.find(w => w.id == id);
        if (workflow) {
            workflow.title = title;
            workflow.color = color;
            workflow.locked = locked;
            saveData();
            renderBoard();
            closeModal(elements.workflowModal);
        }
    });

    elements.workflowForm.deleteBtn.addEventListener('click', () => {
        const id = elements.workflowForm.id.value;
        showConfirm('Delete column? All tasks in it will be lost.', () => {
            state.boardData.workflows = state.boardData.workflows.filter(w => w.id != id);
            saveData();
            renderBoard();
            closeModal(elements.workflowModal);
        });
    });
};

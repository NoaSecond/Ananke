import { elements } from './dom.js';

export const openModal = (modal) => {
    if (modal) modal.classList.add('visible');
};

export const closeModal = (modal) => {
    if (modal) modal.classList.remove('visible');
};

export const initModals = () => {
    [elements.addModal, elements.viewTaskModal, elements.taskModal, elements.workflowModal, elements.projectModal, elements.confirmModal, elements.userManagementModal, elements.bgModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('.modal-close-btn');
            if (e.target === modal || closeBtn) {
                closeModal(modal);
            }
        });
    });
};

export const showConfirm = (message, onConfirm) => {
    elements.confirmMessage.textContent = message;
    openModal(elements.confirmModal);

    // Remove previous listeners to avoid stacking
    const newOkBtn = elements.confirmOkBtn.cloneNode(true);
    elements.confirmOkBtn.parentNode.replaceChild(newOkBtn, elements.confirmOkBtn);
    elements.confirmOkBtn = newOkBtn; // Update reference if possible, or just re-select. 
    // Wait, updating elements.confirmOkBtn in dom.js isn't possible directly as it's an export const object property but the object is mutable.
    // Better strategy: Use a one-time listener or a persistent variable for the callback.

    newOkBtn.addEventListener('click', () => {
        onConfirm();
        closeModal(elements.confirmModal);
    });

    const newCancelBtn = elements.confirmCancelBtn.cloneNode(true);
    elements.confirmCancelBtn.parentNode.replaceChild(newCancelBtn, elements.confirmCancelBtn);

    newCancelBtn.addEventListener('click', () => {
        closeModal(elements.confirmModal);
    });
};

import { elements } from './dom.js';
import { t } from './i18n.js';

export const openModal = (modal) => {
    if (modal) modal.classList.add('visible');
};

export const closeModal = (modal) => {
    if (modal) modal.classList.remove('visible');
};

export const initModals = () => {
    [elements.addModal, elements.viewTaskModal, elements.taskModal, elements.workflowModal, elements.projectModal, elements.confirmModal, elements.userManagementModal, elements.bgModal, elements.logsModal, elements.resetPasswordModal].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('mousedown', (e) => {
            modal._mouseDownTarget = e.target;
        });

        modal.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('.modal-close-btn');
            if ((e.target === modal && modal._mouseDownTarget === modal) || closeBtn) {
                if (modal === elements.taskModal && typeof window.checkTaskDirty === 'function' && window.checkTaskDirty()) {
                    showConfirm(
                        t('modal.unsaved_changes') || "You have unsaved changes. Discard them?",
                        () => {
                            closeModal(modal);
                        },
                        {
                            okText: t('modal.btn_discard') || 'Discard',
                            cancelText: t('modal.btn_cancel') || 'Cancel',
                            title: t('modal.confirm_title') || 'Confirmation',
                            danger: true
                        }
                    );
                } else {
                    closeModal(modal);
                }
            }
        });
    });
};

export const showConfirm = (message, onConfirm, options = {}) => {
    if (typeof options === 'string') {
        options = { okText: options };
    }

    const titleEl = document.getElementById('confirm-modal-title');
    if (titleEl) {
        titleEl.textContent = options.title || t('modal.confirm_title') || 'Confirmation';
    }

    elements.confirmMessage.textContent = message;
    openModal(elements.confirmModal);

    // Remove previous listeners to avoid stacking
    const newOkBtn = elements.confirmOkBtn.cloneNode(true);
    elements.confirmOkBtn.parentNode.replaceChild(newOkBtn, elements.confirmOkBtn);
    elements.confirmOkBtn = newOkBtn;

    const msgLower = typeof message === 'string' ? message.toLowerCase() : '';
    const isDelete = msgLower.includes('delete') || msgLower.includes('supprim') || msgLower.includes('remove');
    const defaultOk = isDelete ? (t('modal.btn_delete') || 'Delete') : (t('modal.btn_confirm') || 'Confirm');

    newOkBtn.textContent = options.okText || defaultOk;
    if (options.danger !== false) {
        newOkBtn.className = 'danger-btn';
    } else {
        newOkBtn.className = 'action-btn';
    }

    newOkBtn.addEventListener('click', () => {
        closeModal(elements.confirmModal);
        try {
            onConfirm();
        } catch (err) {
            console.error('Confirm action error:', err);
        }
    });

    const newCancelBtn = elements.confirmCancelBtn.cloneNode(true);
    elements.confirmCancelBtn.parentNode.replaceChild(newCancelBtn, elements.confirmCancelBtn);
    elements.confirmCancelBtn = newCancelBtn;
    newCancelBtn.textContent = options.cancelText || t('modal.btn_cancel') || 'Cancel';

    newCancelBtn.addEventListener('click', () => {
        closeModal(elements.confirmModal);
    });
};

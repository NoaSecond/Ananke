import { elements } from './dom.js';
import { state } from './state.js';
import { renderBoard } from './board-ui.js';
import { openModal, closeModal } from './modals.js';
import { Logger } from './utils.js';

let tempBg = null;

export function initThemeListeners() {
    if (elements.bgCustomizeBtn) {
        elements.bgCustomizeBtn.onclick = () => {
            tempBg = state.boardData.background ? { ...state.boardData.background } : { type: 'default', value: '' };
            updatePreview(tempBg);
            openModal(elements.bgModal);
            elements.settingsMenu.classList.add('hidden');
        };
    }

    // Color picker
    if (elements.bgColorPicker) {
        elements.bgColorPicker.oninput = (e) => {
            tempBg = { type: 'color', value: e.target.value };
            updatePreview(tempBg);
        };
    }

    // Gradients
    elements.bgGradientBtns.forEach(btn => {
        btn.onclick = () => {
            elements.bgGradientBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tempBg = { type: 'gradient', value: btn.dataset.value };
            updatePreview(tempBg);
        };
    });

    // Image URL
    if (elements.bgImageApplyBtn) {
        elements.bgImageApplyBtn.onclick = () => {
            const url = elements.bgImageUrlInput.value.trim();
            if (url) {
                tempBg = { type: 'image', value: url };
                updatePreview(tempBg);
            }
        };
    }

    // Image Upload
    if (elements.bgImageUpload) {
        const handleFile = (file) => {
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    tempBg = { type: 'image', value: event.target.result };
                    updatePreview(tempBg);
                };
                reader.readAsDataURL(file);
            }
        };

        elements.bgImageUpload.onchange = (e) => {
            handleFile(e.target.files[0]);
        };

        const dropzone = document.getElementById('bg-upload-dropzone');
        if (dropzone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-active'), false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-active'), false);
            });

            dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const file = dt.files[0];
                handleFile(file);
            }, false);
        }
    }

    // Reset
    if (elements.resetBgBtn) {
        elements.resetBgBtn.onclick = () => {
            tempBg = { type: 'default', value: '' };
            updatePreview(tempBg);
        };
    }

    // Save
    if (elements.saveBgBtn) {
        elements.saveBgBtn.onclick = () => {
            state.boardData.background = tempBg;
            applyBackground(state.boardData.background);

            // Broadcast update
            if (state.socket) {
                state.socket.emit('updateBoard', state.boardData);
            }

            closeModal(elements.bgModal);
            Logger.success('Background updated');
        };
    }
}

function updatePreview(bg) {
    const preview = elements.bgPreview;
    if (!preview) return;

    preview.style.background = '';
    preview.style.backgroundImage = '';
    preview.textContent = '';

    if (bg.type === 'color') {
        preview.style.backgroundColor = bg.value;
    } else if (bg.type === 'gradient') {
        preview.style.background = bg.value;
    } else if (bg.type === 'image') {
        preview.style.backgroundImage = `url("${bg.value}")`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
    } else {
        preview.textContent = 'Default';
        preview.style.background = 'var(--bg-color)';
    }
}

export function applyBackground(bg) {
    if (!bg || bg.type === 'default') {
        document.body.classList.remove('has-custom-bg');
        document.body.style.background = '';
        return;
    }

    document.body.classList.add('has-custom-bg');
    if (bg.type === 'color') {
        document.body.style.background = bg.value;
    } else if (bg.type === 'gradient') {
        document.body.style.background = bg.value;
    } else if (bg.type === 'image') {
        document.body.style.backgroundImage = `url("${bg.value}")`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
    }
}

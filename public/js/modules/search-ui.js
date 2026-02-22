import { elements } from './dom.js';
import { state } from './state.js';
import { getUsers, getSimpleList } from './api.js';

let users = [];
let selectedIndex = -1;

export async function initSearch() {
    const searchInput = document.getElementById('global-search');
    const autocompleteList = document.getElementById('search-autocomplete-list');

    if (!searchInput || !autocompleteList) return;

    // Extend elements with search ones
    elements.searchInput = searchInput;
    elements.searchAutocomplete = autocompleteList;

    // Fetch users for autocompletion
    await refreshSearchUsers();

    searchInput.addEventListener('input', () => {
        handleSearch();
        handleAutocomplete();
    });

    searchInput.addEventListener('focus', () => {
        if (!searchInput.value) {
            showSearchTips();
        } else {
            handleAutocomplete();
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        const items = autocompleteList.querySelectorAll('.autocomplete-item');

        if (e.key === 'ArrowDown') {
            if (autocompleteList.classList.contains('hidden')) return;
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            if (autocompleteList.classList.contains('hidden')) return;
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelection(items);
        } else if (e.key === 'Enter') {
            if (selectedIndex > -1 && items[selectedIndex]) {
                e.preventDefault();
                items[selectedIndex].click();
            }
        } else if (e.key === 'Escape') {
            closeAutocomplete();
        }
    });

    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !autocompleteList.contains(e.target)) {
            closeAutocomplete();
        }
    });

    // Shortcut Ctrl+K
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

export async function refreshSearchUsers() {
    try {
        const response = await getSimpleList();
        if (response && response.users) {
            users = response.users;
        }
    } catch (e) {
        console.error('Failed to fetch users for search', e);
    }
}

export function handleSearch() {
    if (!elements.searchInput) return;
    const query = elements.searchInput.value.toLowerCase().trim();
    const taskCards = document.querySelectorAll('.task-card');

    if (!query) {
        taskCards.forEach(card => card.classList.remove('hidden-by-search'));
        return;
    }

    // Parse query for tags and persons
    // Format: Tag:Blabla Person:Blabla Text
    const tagsMatch = query.match(/tag:([^\s]*)/g);
    const personsMatch = query.match(/person:([^\s]*)/g);

    // Remote prefixes to get literal search text
    let plainText = query;
    const requiredTags = [];
    if (tagsMatch) {
        tagsMatch.forEach(m => {
            plainText = plainText.replace(m, '');
            const val = m.split(':')[1];
            if (val) requiredTags.push(val.toLowerCase());
        });
    }

    const requiredPersons = [];
    if (personsMatch) {
        personsMatch.forEach(m => {
            plainText = plainText.replace(m, '');
            const val = m.split(':')[1];
            if (val) requiredPersons.push(val.toLowerCase());
        });
    }

    plainText = plainText.trim();

    taskCards.forEach(card => {
        const taskId = card.dataset.taskId;
        // Find task in state
        let task = null;
        for (const workflow of state.boardData.workflows) {
            task = workflow.tasks.find(t => t.id == taskId);
            if (task) break;
        }

        if (!task) return;

        let matchesTags = true;
        if (requiredTags.length > 0) {
            const taskTags = (task.tags || []).map(t => t.name.toLowerCase());
            matchesTags = requiredTags.every(rt => taskTags.some(tt => tt.includes(rt)));
        }

        let matchesPersons = true;
        if (requiredPersons.length > 0) {
            const taskAssignees = (task.assignees || []).map(a => a.name.toLowerCase());
            matchesPersons = requiredPersons.every(rp => taskAssignees.some(ta => ta.includes(rp)));
        }

        let matchesText = true;
        if (plainText) {
            const title = task.title.toLowerCase();
            const desc = (task.description || '').toLowerCase();
            matchesText = title.includes(plainText) || desc.includes(plainText);
        }

        if (matchesTags && matchesPersons && matchesText) {
            card.classList.remove('hidden-by-search');
        } else {
            card.classList.add('hidden-by-search');
        }
    });
}

function handleAutocomplete() {
    const input = elements.searchInput;
    const value = input.value;

    if (!value) {
        showSearchTips();
        return;
    }

    const cursorPosition = input.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);

    const tagMatch = textBeforeCursor.match(/tag:([^\s]*)$/i);
    const personMatch = textBeforeCursor.match(/person:([^\s]*)$/i);

    if (tagMatch) {
        const query = tagMatch[1].toLowerCase();
        const availableTags = state.boardData.tags || [];
        const filteredTags = availableTags.filter(t => t.name.toLowerCase().includes(query));
        const tagsWithOptions = filteredTags.map(t => {
            let count = 0;
            (state.boardData.workflows || []).forEach(w => (w.tasks || []).forEach(task => {
                if ((task.tags || []).some(taskTag => taskTag.name === t.name)) count++;
            }));
            return { type: 'Tag', name: t.name, count };
        });
        showAutocomplete(tagsWithOptions, tagMatch[0], tagMatch.index);
    } else if (personMatch) {
        const query = personMatch[1].toLowerCase();
        const filteredUsers = users.filter(u =>
            (u.name && u.name.toLowerCase().includes(query)) ||
            (u.firstname && u.firstname.toLowerCase().includes(query)) ||
            (u.lastname && u.lastname.toLowerCase().includes(query)) ||
            (u.email && u.email.toLowerCase().includes(query))
        );
        const personsWithOptions = filteredUsers.map(u => {
            const personName = u.name || `${u.firstname} ${u.lastname}`;
            let count = 0;
            (state.boardData.workflows || []).forEach(w => (w.tasks || []).forEach(task => {
                if ((task.assignees || []).some(a => a.name === personName)) count++;
            }));
            return { type: 'Person', name: personName, count };
        });
        showAutocomplete(personsWithOptions, personMatch[0], personMatch.index);
    } else {
        closeAutocomplete();
    }
}

function showSearchTips() {
    const list = elements.searchAutocomplete;
    list.innerHTML = `
        <div style="padding: 1rem; font-size: 0.85rem; border-bottom: 1px solid var(--border-color); opacity: 0.8;">
            <div style="margin-bottom: 0.5rem; font-weight: bold; color: var(--primary-color);">Search Options:</div>
            <div style="display: grid; gap: 0.4rem;">
                <div>• Type <code style="background: var(--bg-color); padding: 2px 4px; border-radius: 4px;">tag:</code> for autocompletion</div>
                <div>• Type <code style="background: var(--bg-color); padding: 2px 4px; border-radius: 4px;">person:</code> for assignees</div>
                <div>• Combine options and text freely</div>
            </div>
        </div>
    `;
    list.classList.remove('hidden');
}

function showAutocomplete(options, matchText, matchIndex) {
    const list = elements.searchAutocomplete;
    list.innerHTML = '';
    selectedIndex = -1;

    if (options.length === 0) {
        closeAutocomplete();
        return;
    }

    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div>
                    <span class="item-type">${opt.type}</span>
                    <span class="item-value">${opt.name}</span>
                </div>
                ${opt.count !== undefined ? `<span style="opacity: 0.6; font-size: 0.8rem;">${opt.count} card${opt.count !== 1 ? 's' : ''}</span>` : ''}
            </div>
        `;
        item.onclick = () => {
            applyAutocomplete(opt.type.toLowerCase(), opt.name, matchText, matchIndex);
        };
        list.appendChild(item);
    });

    list.classList.remove('hidden');
}

function applyAutocomplete(type, name, matchText, matchIndex) {
    const input = elements.searchInput;
    const value = input.value;

    // Replace the "type:query" with "type:name "
    const before = value.substring(0, matchIndex);
    const after = value.substring(matchIndex + matchText.length);

    input.value = before + type + ':' + name + ' ' + after;
    input.focus();
    input.setSelectionRange(before.length + type.length + name.length + 2, before.length + type.length + name.length + 2);

    closeAutocomplete();
    handleSearch();
}

function updateSelection(items) {
    items.forEach((item, idx) => {
        if (idx === selectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function closeAutocomplete() {
    elements.searchAutocomplete.classList.add('hidden');
    selectedIndex = -1;
}

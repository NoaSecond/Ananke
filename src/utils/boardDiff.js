function describeChanges(oldBoard, newBoard) {
    const changes = [];

    if (!oldBoard || !newBoard || !oldBoard.workflows || !newBoard.workflows) {
        return ['updated board infrastructure'];
    }

    // 1. Check Project Name
    if (oldBoard.projectName !== newBoard.projectName) {
        changes.push(`renamed project from "${oldBoard.projectName}" to "${newBoard.projectName}"`);
    }

    // 2. Map tasks by ID for easy comparison
    const oldTasks = new Map();
    const newTasks = new Map();

    oldBoard.workflows.forEach(w => {
        w.tasks.forEach(t => oldTasks.set(t.id, { ...t, workflowTitle: w.title }));
    });

    newBoard.workflows.forEach(w => {
        w.tasks.forEach(t => newTasks.set(t.id, { ...t, workflowTitle: w.title }));
    });

    // Detect deletions
    for (const [id, task] of oldTasks) {
        if (!newTasks.has(id)) {
            changes.push(`deleted task "${task.title}"`);
        }
    }

    // Detect additions and moves
    for (const [id, task] of newTasks) {
        if (!oldTasks.has(id)) {
            changes.push(`created task "${task.title}" in "${task.workflowTitle}"`);
        } else {
            const oldTask = oldTasks.get(id);
            if (oldTask.workflowTitle !== task.workflowTitle) {
                changes.push(`moved task "${task.title}" from "${oldTask.workflowTitle}" to "${task.workflowTitle}"`);
            } else if (oldTask.title !== task.title) {
                changes.push(`renamed task from "${oldTask.title}" to "${task.title}"`);
            }
            // Could add more detail like description changes, but let's keep it concise
        }
    }

    // Detect Workflow changes
    const oldWorkflows = oldBoard.workflows.map(w => w.id);
    const newWorkflows = newBoard.workflows.map(w => w.id);

    newBoard.workflows.forEach(w => {
        if (!oldBoard.workflows.find(ow => ow.id === w.id)) {
            changes.push(`added column "${w.title}"`);
        }
    });

    oldBoard.workflows.forEach(w => {
        if (!newBoard.workflows.find(nw => nw.id === w.id)) {
            changes.push(`removed column "${w.title}"`);
        }
    });

    return changes;
}

module.exports = { describeChanges };

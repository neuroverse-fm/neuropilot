import * as vscode from 'vscode';

import { NEURO } from "./constants";
import { logOutput, formatActionID, hasPermissions } from './utils';
import { ActionData, ActionResult, actionResultAccept, actionResultFailure, actionResultNoPermission, actionResultRetry, PERMISSION_STRINGS } from './neuro_client_helper';

export const taskHandlers: { [key: string]: (actionData: ActionData) => ActionResult } = {
    // handleRunTask is used separately and not on this list
    'terminate_task': handleTerminateTask,
}

export function registerTaskActions() {
    if(hasPermissions('runTasks')) {
        NEURO.client?.registerActions([
            {
                name: 'terminate_task',
                description: 'Terminate the currently running task',
            },
        ]);
        // Tasks are registered asynchronously in reloadTasks()
    }
}

export function handleTerminateTask(actionData: ActionData): ActionResult {
    if(!hasPermissions('runTasks'))
        return actionResultNoPermission(PERMISSION_STRINGS.runTasks);

    if(NEURO.currentTaskExecution === null)
        return actionResultFailure('No task to terminate.');

    const exe = NEURO.currentTaskExecution;
    NEURO.currentTaskExecution = null;
    exe.terminate();
    logOutput('INFO', 'Terminated current task');
    return actionResultAccept('Terminated current task');
}

export function handleRunTask(actionData: ActionData): ActionResult {
    if(!hasPermissions('runTasks'))
        return actionResultNoPermission(PERMISSION_STRINGS.runTasks);

    if(NEURO.currentTaskExecution !== null)
        return actionResultFailure('A task is already running.');

    const task = NEURO.tasks.find(task => task.id === actionData.name);
    if(task === undefined)
        return actionResultRetry(`Task ${actionData.name} not found.`);

    try {
        vscode.tasks.executeTask(task.task).then(value => {
            logOutput('INFO', `Executing task ${task.id}`);
            NEURO.currentTaskExecution = value;
        });
        return actionResultAccept(`Executing task ${task.id}`);
    } catch(erm) {
        logOutput('DEBUG', JSON.stringify(erm));
        return actionResultFailure(`Failed to execute task ${task.id}.`, 'ERROR');
    }
}

export function taskEndedHandler(event: vscode.TaskEndEvent) {
    if(NEURO.connected && NEURO.client !== null && NEURO.currentTaskExecution !== null) {
        if(event.execution === NEURO.currentTaskExecution) {
            logOutput('INFO', 'Neuro task finished');
            NEURO.currentTaskExecution = null;
            vscode.commands.executeCommand('workbench.action.terminal.copyLastCommandOutput')
                .then(
                    _ => vscode.env.clipboard.readText()
                ).then(
                    text => NEURO.client?.sendContext(`Task finished! Output:\n\n\`\`\`${text}\n\`\`\``)
                );
        }
    }
}

export function reloadTasks() {
    NEURO.client?.unregisterActions(NEURO.tasks.map((task) => task.id));

    NEURO.tasks = [];

    if(!hasPermissions('runTasks')) {
        return;
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        for(const task of tasks) {
            // Only allow tasks whose details start with '[Neuro]'
            if(task.detail?.toLowerCase().startsWith('[neuro]')) {
                const detail = task.detail?.substring(7).trim();
                logOutput('INFO', `Adding Neuro task: ${task.name}`);
                NEURO.tasks.push({
                    id: formatActionID(task.name),
                    description: detail.length > 0 ? detail : task.name,
                    task: task,
                });
            }
            else {
                logOutput('INFO', `Ignoring task: ${task.name}`);
            }
        }

        if(!hasPermissions('runTasks')) {
            return;
        }

        NEURO.client?.registerActions(NEURO.tasks.map((task) => {
            return {
                name: task.id,
                description: task.description,
            }
        }));
    });
}
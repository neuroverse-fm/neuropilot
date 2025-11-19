import { useState } from 'preact/hooks';
import type { ActionNode, ActionsViewMessage, ActionsViewProviderMessage, SettingsContext } from '@/views/actions';

interface State {
    actions: ActionNode[];
    context: SettingsContext;
}

export function ActionsView() {
    const vscode = acquireVsCodeApi<State>();
    const oldState = vscode.getState();
    const state: State = oldState ?? {
        actions: [],
        context: 'workspace',
    };
    if (!oldState) vscode.setState(state)
    vscode.postMessage({
        type: 'requestInitialization',
        currentContext: state.context,
    } satisfies ActionsViewMessage);
    const [actions, updateActions] = useState<ActionNode[]>(state.actions);
    const [context, updateContext] = useState<SettingsContext>(state.context);
}

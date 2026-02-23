import { addTaskActions } from '@/tasks';
import { addTerminalActions } from '@/pseudoterminal';
import { addChatAction } from '@/chat';
import { addCompleteCodeAction } from '@/completions';
import { addCommonUnsupervisedActions } from '@entry/shared/unsupervised';

export function addUnsupervisedActions() {
    addCommonUnsupervisedActions();
    addTaskActions();
    addTerminalActions();
    addChatAction();
    addCompleteCodeAction();
}

import * as vscode from 'vscode';
import { ActionData } from '../neuro_client_helper';

/** Thinking of maybe having a class object that is attached instead of defining one singular function */
export class RCEPreviewEffect {
    /** The disposable class */
    public disposable: vscode.Disposable;
    /** Function to call on Copilot previews */
    public copilot?: (actionData: ActionData) => void;
    /** Function to call on delayed Autopilot calls */
    public latency?: (actionData: ActionData) => void;
    /** Function to call on async validators (awaiting async validator implementation) */
    public async?: (actionData: ActionData) => void;
    /** Any resources stored by the preview effect */
    private resources: unknown[] = [];
}

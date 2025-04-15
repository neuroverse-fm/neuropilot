import * as vscode from "vscode";
import { NEURO } from "./constants";

export const terminalActions: { [key: string]: (actionData: any) => void } = {
  execute_in_terminal: handleExecuteInTerminal,
};

export function handleExecuteInTerminal(actionData: any) {
  if (
    !vscode.workspace
      .getConfiguration("neuropilot")
      .get("permission.terminalAccess", false)
  ) {
    NEURO.client?.sendActionResult(actionData.id, true, "You are not allowed to run commands in the terminal.",);
    return;
  }

  const command = actionData.params?.command;
  if (!command) {
    NEURO.client?.sendActionResult(actionData.id, false, "No command was provided to execute.",);
    return;
  }

  NEURO.client?.sendActionResult(actionData.id, true);

  const terminal = vscode.window.createTerminal("NeuroPilot Dedicated Terminal");

  terminal.sendText(command);
  vscode.commands
    .executeCommand("workbench.action.terminal.copyLastCommandOutput")
    .then((_) => vscode.env.clipboard.readText())
    .then((output) => NEURO.client?.sendContext(`Terminal output: ${output}`));
}

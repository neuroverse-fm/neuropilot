import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as os from 'os';
import { NEURO } from './constants';
import { TerminalSession, logOutput } from './utils';

export const terminalAccessHandlers: { [key: string]: (actionData: any) => void } = {
    "execute_in_terminal": handleRunCommand
}

export function registerTerminalAction() {
    NEURO.client?.unregisterActions(["execute_in_terminal"])

    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.terminalAccess', false)) {
        NEURO.client?.registerActions([
            {
                name: "execute_in_terminal",
                description: "Run a command directly in the terminal.",
                schema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string' },
                        shell: { type: 'string', enum: getAvailableShellProfileNames() }
                    },
                    required: ['command', 'shell']
                }
            }
        ])
    }
}

export function getAvailableShellProfileNames(): string[] {
  const config = vscode.workspace.getConfiguration('terminal.integrated');
  const platform = os.platform();
  let profilesObj: Record<string, any> | undefined;

  if (platform === 'win32') {
    profilesObj = config.get('profiles.windows') as Record<string, any> | undefined;
  } else if (platform === 'darwin') {
    profilesObj = config.get('profiles.osx') as Record<string, any> | undefined;
  } else {
    profilesObj = config.get('profiles.linux') as Record<string, any> | undefined;
  }

  const profileNames = profilesObj ? Object.keys(profilesObj) : [];
  // Prepend "default" to the array so that Neuro sees it as a valid option.
  return ["default", ...profileNames];
}

/**
 * Returns the default shell profile for the current platform.
 * Adjust this function to merge user settings or custom profiles as needed.
 */
function getDefaultShellProfile(): { shellPath: string; shellArgs?: string[] } {
  const platform = os.platform();
  if (platform === 'win32') {
    // For example, using Git Bash on Windows.
    return { shellPath: "C:\\Program Files\\Git\\bin\\bash.exe", shellArgs: [] };
  } else {
    return { shellPath: "/bin/bash", shellArgs: ["-l"] };
  }
}

/**
 * Creates a new pseudoterminal-based session.
 * This version captures output in separate STDOUT and STDERR properties.
 */
function createPseudoterminal(shellType: string, terminalName: string): TerminalSession {
  const emitter = new vscode.EventEmitter<string>();

  // Define the pseudoterminal.
  const pty: vscode.Pseudoterminal = {
    onDidWrite: emitter.event,
    open: () => {
      // Write an initial message when the terminal opens.
      emitter.fire(`Terminal "${terminalName}" ready. Waiting for command...\r\n`);
    },
    close: () => {
      // On terminal close, kill the spawned process if it exists.
      if (session.shellProcess) {
        session.shellProcess.kill();
      }
    }
  };

  // Create the terminal using VS Code's API.
  const terminal = vscode.window.createTerminal({
    name: terminalName,
    pty: pty
  });

  // Create the session object.
  const session: TerminalSession = {
    terminal,
    pty,
    emitter,
    outputStdout: "",
    outputStderr: "",
    processStarted: false,
    shellProcess: undefined
  };

  return session;
}

/**
 * Returns an existing session for the given shell type or creates a new one.
 * Uses the global NEURO.terminalRegistry.
 */
function getOrCreateTerminal(shellType: string, terminalName: string): TerminalSession {
  let session = NEURO.terminalRegistry.get(shellType);
  if (!session) {
    session = createPseudoterminal(shellType, terminalName);
    NEURO.terminalRegistry.set(shellType, session);
    session.terminal.show();
  } else {
    session.terminal.show();
  }
  return session;
}

/**
 * Main command handler.
 * Checks permissions, executes the command in the requested shell,
 * captures STDOUT and STDERR, logs the output, and sends it via NEURO.client.
 */
export function handleRunCommand(actionData: any) {
  // Check terminal access permission.
  if (!vscode.workspace.getConfiguration("neuropilot").get("permission.terminalAccess", false)) {
    NEURO.client?.sendActionResult(actionData.id, true, "You are not allowed to run commands.");
    return;
  }

  // Validate command parameter.
  const command: string = actionData.params?.command;
  if (!command) {
    NEURO.client?.sendActionResult(actionData.id, false, "You didn't give a command to execute.");
    return;
  }

  // Determine the shell type.
  let shellType: string = actionData.params?.shell;
  if (!shellType) {
    NEURO.client?.sendActionResult(actionData.id, false, "You didn't give a shell profile to run this in.")
    return;
  } else if (!getAvailableShellProfileNames().includes(shellType)) {
    NEURO.client?.sendActionResult(actionData.id, false, "Invalid shell type.")
    return;
  }

  NEURO.client?.sendActionResult(actionData.id, true)

  // Get or create the terminal session for this shell.
  const session = getOrCreateTerminal(shellType, `Terminal: ${shellType}`);

  // Reset previous outputs.
  session.outputStdout = "";
  session.outputStderr = "";

  // Helper to send captured output via NEURO.client.
  const sendCapturedOutput = () => {
    NEURO.client?.sendContext(`Terminal output: ${session.outputStdout}\nstderr: ${session.outputStderr}`);
  };

  // If no process has been started, spawn it.
  if (!session.processStarted) {
    session.processStarted = true;
    const { shellPath, shellArgs } = getDefaultShellProfile();
    const args = shellArgs ? [...shellArgs] : [];
    // For most shells, use -c to execute the command.
    args.push('-c', command);

    const shellProcess = spawn(shellPath, args);
    session.shellProcess = shellProcess;

    shellProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      session.outputStdout += text;
      session.emitter.fire(text);
      logOutput("DEBUG", `STDOUT: ${text}`);
    });

    shellProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      session.outputStderr += text;
      session.emitter.fire(text);
      logOutput("ERROR", `STDERR: ${text}`);
    });

    shellProcess.on('exit', (code) => {
      logOutput("INFO", `Process exited with code ${code}`);
      sendCapturedOutput();
    });
  } else {
    // Process is already running; send the new command via stdin.
    const shellProcess = session.shellProcess;
    if (shellProcess && shellProcess.stdin.writable) {
      shellProcess.stdin.write(command + "\n");
      logOutput("DEBUG", `Sent command: ${command}`);
      // Optionally delay before sending output.
      setTimeout(sendCapturedOutput, 1000);
    } else {
      logOutput("ERROR", "Shell process stdin is not writable.");
      NEURO.client?.sendContext("Error: Unable to write to shell process.");
    }
  }
}

/**
 * Returns the captured output (STDOUT and STDERR) for the given shell type.
 * If no active session exists for that shell, returns undefined.
 */
export function getTerminalOutput(shellType: string): string | undefined {
  const session = NEURO.terminalRegistry.get(shellType);
  if (!session) {
    return undefined;
  }
  return `STDOUT: ${session.outputStdout}\nSTDERR: ${session.outputStderr}`;
}

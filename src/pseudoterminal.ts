import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as os from 'os';
import { NEURO } from './constants';
import { TerminalSession, logOutput } from './utils';

export const terminalAccessHandlers: { [key: string]: (actionData: any) => void } = {
    "execute_in_terminal": handleRunCommand,
    "kill_terminal_process": handleKillTerminal
}

export function registerTerminalAction() {
    NEURO.client?.unregisterActions(["execute_in_terminal"])

    if (vscode.workspace.getConfiguration('neuropilot').get('permission.terminalAccess') === true) {
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
            },
            {
              name: "kill_terminal_process",
              description: "Kill an already running terminal process.",
              schema: {
                type: 'object',
                properties: {
                  shell: { type: 'string' }
                },
                enum: ["shell"]
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
 * Returns the shell profile (path and args) for a given shellType.
 * If shellType is "default", returns the default shell profile.
 * Otherwise, it attempts to fetch the profile from the user's configuration.
 */
function getShellProfileForType(shellType: string): { shellPath: string; shellArgs?: string[] } {
  if (shellType === "default") {
    return getDefaultShellProfile();
  }

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

  if (profilesObj && profilesObj[shellType]) {
    const profile = profilesObj[shellType];
    return { shellPath: profile.path, shellArgs: profile.args };
  }
  // Fallback
  return getDefaultShellProfile();
}

/**
 * Creates a new pseudoterminal-based session.
 * Fixes the crash by declaring `session` up‐front, and remembers the shellType.
 */
function createPseudoterminal(shellType: string, terminalName: string): TerminalSession {
  // We declare `session` first so that `pty.close` can see it.
  let session!: TerminalSession;

  const emitter = new vscode.EventEmitter<string>();
  let procRef: ChildProcessWithoutNullStreams | undefined;

  const pty: vscode.Pseudoterminal = {
    onDidWrite: emitter.event,
    open: () => {
      emitter.fire(`Terminal "${terminalName}" ready. Waiting for command...\r\n`);
    },
    close: () => {
      if (procRef) {
        procRef.kill();
      }
    }
  };

  const terminal = vscode.window.createTerminal({
    name: terminalName,
    pty: pty
  });

  session = {
    terminal,
    pty,
    emitter,
    outputStdout: "",
    outputStderr: "",
    processStarted: false,
    shellProcess: undefined,
    shellType  // now stored
  };

  return session;
}


/**
 * Returns an existing session for the given shell type or creates a new one.
 * Uses the global NEURO.terminalRegistry and enforces the user-defined maxTerminalCount.
 * If the max count is reached and no session exists for the given shellType, returns undefined.
 */
function getOrCreateTerminal(shellType: string, terminalName: string): TerminalSession | undefined {
  let session = NEURO.terminalRegistry.get(shellType);
  if (!session) {
    // Check against the maximum allowed terminal count.
    const maxTerminalCount = vscode.workspace
      .getConfiguration("neuropilot")
      .get("maxTerminalCount", 3) as number;
    if (NEURO.terminalRegistry.size >= maxTerminalCount) {
      // Maximum reached; send a message and return undefined.
      return undefined;
    } else {
      session = createPseudoterminal(shellType, terminalName);
      NEURO.terminalRegistry.set(shellType, session);
      session.terminal.show();
    }
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
  if (!vscode.workspace
        .getConfiguration("neuropilot")
        .get("permission.terminalAccess", false)) {
    NEURO.client?.sendActionResult(
      actionData.id,
      true,
      "You are not allowed to run commands."
    );
    return;
  }

  const command: string = actionData.params?.command;
  if (!command) {
    NEURO.client?.sendActionResult(
      actionData.id,
      false,
      "You didn't give a command to execute."
    );
    return;
  }

  NEURO.client?.sendActionResult(actionData.id, true)

  // Determine the shell type; default to "bash" if unspecified.
  let shellType: string = actionData.params?.shell;
  if (!shellType) {
    shellType = "bash";
  }

  // Get or create the terminal session for this shell.
  const session = getOrCreateTerminal(shellType, `Terminal: ${shellType}`);
  if (!session) {
    // Hit maxTerminalCount and could not create new session.
    return;
  }

  // Reset previous outputs.
  session.outputStdout = "";
  session.outputStderr = "";

  // First‐time launch: spawn the shell process using the right profile.
  if (!session.processStarted) {
    session.processStarted = true;

    const profile = getShellProfileForType(session.shellType);
    const args = profile.shellArgs ? [...profile.shellArgs] : [];
    args.push("-c", command);

    const shellProcess = spawn(profile.shellPath, args);
    session.shellProcess = shellProcess;

    shellProcess.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      session.outputStdout += text;
      session.emitter.fire(text);
      logOutput("DEBUG", `STDOUT: ${text}`);
    });

    shellProcess.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      session.outputStderr += text;
      session.emitter.fire(text);
      logOutput("ERROR", `STDERR: ${text}`);
    });

    shellProcess.on("exit", (code) => {
      logOutput("INFO", `Process exited with code ${code}`);
      NEURO.client?.sendContext(
        `Terminal output: ${session.outputStdout}\n` +
        `stderr: ${session.outputStderr}\n` +
        `Exit code: ${code}`
      );
    });

  } else {
    // Already running: send the command via stdin.
    const shellProcess = session.shellProcess;
    if (shellProcess && shellProcess.stdin.writable) {
      shellProcess.stdin.write(command + "\n");
      logOutput("DEBUG", `Sent command: ${command}`);
      setTimeout(() => {
        NEURO.client?.sendContext(
          `Terminal output: ${session.outputStdout}\n` +
          `stderr: ${session.outputStderr}\n` +
          `Exit code: Running`
        );
      }, 1000);
    } else {
      logOutput("ERROR", "Shell process stdin is not writable.");
      NEURO.client?.sendContext("Error: Unable to write to shell process.");
    }
  }
}

export function handleKillTerminal(actionData: any) {
  if (!vscode.workspace.getConfiguration("neuropilot").get("permission.terminalAccess", false)) {
    NEURO.client?.sendActionResult(actionData.id, true, "You are not allowed to run commands.");
    return;
  }

  const sessionToKill = actionData.params?.shell
  if (!sessionToKill) {
    NEURO.client?.sendActionResult(actionData.id, false, "You didn't specify a shell type to kill.")
    return;
  }
  const session = NEURO.terminalRegistry.get(sessionToKill);
  if (!session) {
    NEURO.client?.sendActionResult(actionData.id, true, `No terminal session found for shell type "${sessionToKill}".`);
    return;
  }

  NEURO.client?.sendActionResult(actionData.id, true)

  // Dispose the VS Code terminal (which will trigger pty.close()).
  session.terminal.dispose();
  // Kill the underlying process if it exists.
  if (session.shellProcess) {
    session.shellProcess.kill();
  }
  // Remove from the registry.
  NEURO.terminalRegistry.delete(sessionToKill);
  NEURO.client?.sendContext(`Terminal session for shell type "${sessionToKill}" has been terminated.`);
}

export function emergencyKill() {
  const sessions = NEURO.terminalRegistry
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

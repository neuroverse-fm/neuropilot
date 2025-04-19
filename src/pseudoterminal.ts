import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as os from 'os';
import { NEURO } from './constants';
import { TerminalSession, logOutput } from './utils';

export const terminalAccessHandlers: { [key: string]: (actionData: any) => void } = {
    "execute_in_terminal": handleRunCommand,
    //"kill_terminal_process": handleKillTerminal
}

export function registerTerminalAction() {
    NEURO.client?.unregisterActions(["execute_in_terminal"])

    if (vscode.workspace.getConfiguration('neuropilot').get('permission.terminalAccess')) {
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
  logOutput("DEBUG", `terminal.integrated config: ${JSON.stringify(config)}`);
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
 * Look up the shell executable + args for a given profile name.
 * Falls back to getDefaultShellProfile() if nothing is found.
 */
function getShellProfileForType(shellType: string): { shellPath: string; shellArgs?: string[] } {
  if (shellType === "default") {
    return getDefaultShellProfile();
  }

  const cfg = vscode.workspace.getConfiguration('terminal.integrated');
  type ProfilesConfig = {
    windows?: Record<string, any>;
    osx?: Record<string, any>;
    linux?: Record<string, any>;
  };
  const profilesSection = cfg.get<ProfilesConfig>('profiles') 
    || { windows: {}, osx: {}, linux: {} };
  const platform = os.platform();
  const platformProfiles = platform === 'win32'
    ? profilesSection.windows
    : platform === 'darwin'
      ? profilesSection.osx
      : profilesSection.linux;

  const p = platformProfiles?.[shellType];
  if (p) {
    // pick real path if present
    let shellPath: string|undefined;
    if (typeof p.path === 'string') {
      shellPath = p.path;
    } else if (Array.isArray(p.path) && p.path.length) {
      shellPath = p.path[0];
    } else if (typeof p.source === 'string') {
      shellPath = p.source;
    }
    if (shellPath) {
      return { shellPath, shellArgs: p.args };
    }
  }

  // fallback
  return getDefaultShellProfile();
}

/**
 * Returns the default shell profile for the current platform.
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
      emitter.fire(`Terminal "${terminalName}" ready.\r\n`);
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
    shellProcess: undefined,
    shellType
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
  const session = getOrCreateTerminal(shellType, `NeuroPilot: ${shellType}`);

  // Reset previous outputs.
  session.outputStdout = "";
  session.outputStderr = "";

  // Helper to send captured output via NEURO.client.
  const sendCapturedOutput = () => {
    NEURO.client?.sendContext(`The ${shellType} terminal outputted the following. ${session.outputStdout ? `\nstdout: ${session.outputStdout}` : ""}${session.outputStderr ? `\nstderr: ${session.outputStderr}` : ""}`, false);
  };

  // If no process has been started, spawn it.
  if (!session.processStarted) {
    session.processStarted = true;
    const { shellPath, shellArgs } = getShellProfileForType(shellType);

    logOutput("DEBUG", `Shell: ${shellPath} ${shellArgs}`)

    if (!shellPath || typeof shellPath !== "string") {
      NEURO.client?.sendContext(`Error: couldn't determine executable for shell profile ${shellType}`, false);
      return;
    }
    
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    session.shellProcess = spawn(
      shellPath,
      shellArgs || [],
      { cwd, env: process.env }
    );
    const proc = session.shellProcess;

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      session.outputStdout += text;
      session.emitter.fire(text.replace(/(?<!\r)\n/g, "\r\n"));
      logOutput("DEBUG", `STDOUT: ${text}`);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      session.outputStderr += text;
      session.emitter.fire(text);
      logOutput("ERROR", `STDERR: ${text}`);
    });

    proc.on('exit', (code) => {
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
      NEURO.client?.sendContext("Error: Unable to write to shell process.", false);
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

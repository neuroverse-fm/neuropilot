import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { NEURO } from './constants';
import { TerminalSession, logOutput, delayAsync } from './utils';

export const terminalAccessHandlers: { [key: string]: (actionData: any) => void } = {
	"execute_in_terminal": handleRunCommand,
	"kill_terminal_process": handleKillTerminal,
	"get_currently_running_shells": handleGetCurrentlyRunningShells
}

export function registerTerminalActions() {
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
			},
			{
				name: "kill_terminal_process",
				description: "Kill a terminal process that is running.",
				schema: {
					type: 'object',
					properties: {
						shell: { type: 'string' }
					},
					required: ['shell']
				}
			},
			{
				name: "get_currently_running_shells",
				description: "Get the list of terminal processes that are spawned.",
				schema: {}
			}
		])
	}
}

/**
* Fetches the list of terminal configurations from the `neuropilot.terminals` setting.
*/
function getCustomTerminalConfigs(): Array<{ name: string; path: string; args?: string[] }> {
	const config = vscode.workspace.getConfiguration('neuropilot');
	const terminals = config.get<Array<{ name: string; path: string; args?: string[] }>>('terminals', []);
	return terminals;
}

/**
* Returns the names of all available terminal profiles from the custom configuration.
*/
export function getAvailableShellProfileNames(): string[] {
	const terminalConfigs = getCustomTerminalConfigs();
	return terminalConfigs.map((terminal) => terminal.name);
}

/**
* Look up the shell executable and arguments for a given profile name.
* Falls back to the first terminal in the list if the profile name is not found.
*/
function getShellProfileForType(shellType: string): { shellPath: string; shellArgs?: string[] } {
	const terminalConfigs = getCustomTerminalConfigs();
	const terminal = terminalConfigs.find((t) => t.name === shellType);
	
	if (terminal) {
		return { shellPath: terminal.path, shellArgs: terminal.args || [] };
	}
	
	// Fallback to the first terminal in the list if no match is found
	if (terminalConfigs.length > 0) {
		return { shellPath: terminalConfigs[0].path, shellArgs: terminalConfigs[0].args || [] };
	}
	
	throw new Error(`No terminal configuration found for shell type: ${shellType}`);
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
* Run command handler.
* Checks permissions, executes the command in the requested shell,
* captures STDOUT and STDERR, logs the output, and sends it to nwero.
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
		NEURO.client?.sendActionResult(actionData.id, false, "You didn't give a shell profile to run this in.");
		return;
	} else if (!getAvailableShellProfileNames().includes(shellType)) {
		NEURO.client?.sendActionResult(actionData.id, false, "Invalid shell type.");
		return;
	}
	
	NEURO.client?.sendActionResult(actionData.id, true);
	
	// Get or create the terminal session for this shell.
	const session = getOrCreateTerminal(shellType, `NeuroPilot: ${shellType}`);
	
	// Reset previous outputs.
	session.outputStdout = "";
	session.outputStderr = "";
	
	// Helper to send captured output via NEURO.client.
	const sendCapturedOutput = () => {
		NEURO.client?.sendContext(
			`The ${shellType} terminal outputted the following. ${
				session.outputStdout ? `\nstdout: ${session.outputStdout}` : ""
			}${session.outputStderr ? `\nstderr: ${session.outputStderr}` : ""}`,
			false
		);
	};
	
	async function sendStdoutIfUnchangedAsync(delay: number) {
		const cachedOutput = session.outputStdout;
		await delayAsync(delay);
		if (session.outputStdout === cachedOutput) {
			NEURO.client?.sendContext(
				`The ${shellType} terminal outputted the following to stdout:\n\n\`\`\`\n${session.outputStdout}\n\`\`\``,
				false
			);
			session.outputStdout = "";
		}
	}
	
	async function sendStderrIfUnchangedAsync(delay: number) {
		const cachedOutput = session.outputStderr;
		await delayAsync(delay);
		if (session.outputStderr === cachedOutput) {
			NEURO.client?.sendContext(
				`The ${shellType} terminal outputted the following to stderr:\n\n\`\`\`\n${session.outputStderr}\n\`\`\``,
				false
			);
			session.outputStderr = "";
		}
	}
	
	// If no process has been started, spawn it.
	if (!session.processStarted) {
		session.processStarted = true;
		const { shellPath, shellArgs } = getShellProfileForType(shellType);
		
		logOutput("DEBUG", `Shell: ${shellPath} ${shellArgs}`);
		
		if (!shellPath || typeof shellPath !== "string") {
			NEURO.client?.sendContext(`Error: couldn't determine executable for shell profile ${shellType}`, false);
			return;
		}
		
		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		session.shellProcess = spawn(shellPath, shellArgs || [], { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
		const proc = session.shellProcess;
		
		proc.stdin.write(command + "\n");
		logOutput("DEBUG", `Sent command: ${command}`);
		
		proc.stdout.on("data", (data: Buffer) => {
			const text = data.toString().replace(/\n/g, "\r\n");
			session.outputStdout += text;
			session.emitter.fire(text.replace(/(?<!\r)\n/g, "\r\n"));
			sendStdoutIfUnchangedAsync(250);
			logOutput("DEBUG", `STDOUT: ${text}`);
		});
		
		proc.stderr.on("data", (data: Buffer) => {
			const text = data.toString().replace(/\n/g, "\r\n");
			session.outputStderr += text;
			session.emitter.fire(text.replace(/(?<!\r)\n/g, "\r\n"));
			sendStderrIfUnchangedAsync(250);
			logOutput("ERROR", `STDERR: ${text}`);
		});
		
		proc.on("exit", (code) => {
			logOutput("INFO", `Process exited with code ${code}`);
			sendCapturedOutput();
		});
	} else {
		// Process is already running; send the new command via stdin.
		const shellProcess = session.shellProcess;
		if (shellProcess && shellProcess.stdin.writable) {
			shellProcess.stdin.write(command + "\n");
			logOutput("DEBUG", `Sent command: ${command}`);
			setTimeout(sendCapturedOutput, 1000);
		} else {
			logOutput("ERROR", "Shell process stdin is not writable.");
			NEURO.client?.sendContext("Error: Unable to write to shell process.", false);
		}
	}
}

/**
 * Kill terminal handler.
 * Checks if the terminal registry contains the open shell and forcefully kills the shell if found.
 */
export function handleKillTerminal(actionData: any) {
    // Check terminal access permission.
    if (!vscode.workspace.getConfiguration("neuropilot").get("permission.terminalAccess", false)) {
        NEURO.client?.sendActionResult(actionData.id, true, "You are not allowed to manage terminals.");
        return;
    }

    // Validate shell type parameter.
    const shellType: string = actionData.params?.shell;
    if (!shellType) {
        NEURO.client?.sendActionResult(actionData.id, false, "You didn't specify a shell type to kill.");
        return;
    }

    // Check if the terminal session exists in the registry.
    const session = NEURO.terminalRegistry.get(shellType);
    if (!session) {
        NEURO.client?.sendActionResult(actionData.id, true, `No terminal session found for shell type "${shellType}".`);
        return;
    }

	NEURO.client?.sendActionResult(actionData.id, true)

    // Dispose of the terminal and remove it from the registry.
    session.terminal.dispose();
    NEURO.terminalRegistry.delete(shellType);

    // Notify Neuro and the user.
    NEURO.client?.sendContext(`Terminal session for shell type "${shellType}" has been terminated.`);
    logOutput("INFO", `Terminal session for shell type "${shellType}" has been terminated.`);
}

/**
 * Returns a list of currently running shell types.
 * Each entry includes the shell type and its status.
 */
export function handleGetCurrentlyRunningShells(): Array<{ shellType: string; status: string }> {
    const runningShells: Array<{ shellType: string; status: string }> = [];

    for (const [shellType, session] of NEURO.terminalRegistry.entries()) {
        const status = session.shellProcess && !session.shellProcess.killed ? "Running" : "Stopped";
        runningShells.push({ shellType, status });
    }

    logOutput("INFO", `Currently running shells: ${JSON.stringify(runningShells)}`);
    return runningShells;
}

/**
 * Forcefully kills all active terminals in the NEURO.terminalRegistry.
 * This function is intended for emergency use and will terminate all terminals regardless of their state.
 * Use with caution. Killing multiple active shells can corrupt your files.
 */
export function emergencyTerminalShutdown() {
    // Check if there are any active terminals in the registry.
    if (NEURO.terminalRegistry.size === 0) {
        logOutput("INFO", "No active terminals to shut down.");
        return;
    }

    logOutput("INFO", "Initiating emergency shutdown of all terminals...");

	let failedShutdownCount: number = 0

    // Iterate through all terminal sessions in the registry.
    for (const [shellType, session] of NEURO.terminalRegistry.entries()) {
        try {
            // Dispose of the terminal.
            session.terminal.dispose();
            logOutput("INFO", `Terminal session for shell type "${shellType}" has been terminated.`);
        } catch (error) {
            logOutput("ERROR", `Failed to terminate terminal session for shell type "${shellType}": ${error}`);
			failedShutdownCount += 1
        }
    }

    // Clear the terminal registry.
    NEURO.terminalRegistry.clear();

    // Notify Neuro and log the shutdown.
    NEURO.client?.sendContext("Emergency shutdown: All terminal sessions have been forcefully terminated.");
	if (failedShutdownCount == 0) {
    	logOutput("INFO", "Emergency shutdown complete. All terminals have been terminated.");
	} else {
		logOutput("WARN", `Failed to terminate ${failedShutdownCount} shells.`)
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

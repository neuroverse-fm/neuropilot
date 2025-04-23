import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { NEURO } from './constants';
import { TerminalSession, logOutput, delayAsync } from './utils';

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

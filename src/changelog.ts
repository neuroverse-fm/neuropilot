import * as vscode from 'vscode';

import { NEURO } from '@/constants';
import { getFence, logOutput } from '@/utils';
import { ActionData, RCEAction, stripToActions } from '@/neuro_client_helper';
import { PermissionLevel } from '@/config';

const MEMENTO_KEY = 'lastDeliveredChangelogVersion';

interface ChangelogSection {
    version: string;
    body: string;
}

export const changelogActions = {
    read_changelog: {
        name: 'read_changelog',
        description: 'Send selected changelog entries for insert_turtle_here. If fromVersion is omitted, defaults are applied based on saved state.',
        schema: {
            type: 'object',
            properties: {
                fromVersion: { type: 'string', description: 'Version (e.g., 2.2.1) to start including entries from, inclusive.' },
            },
            additionalProperties: false,
        },
        permissions: [],
        defaultPermission: PermissionLevel.COPILOT,
        handler: handleReadChangelog,
        promptGenerator: (actionData: ActionData) => actionData.params?.fromVersion
            ? `send changelog entries from version ${actionData.params.fromVersion} (inclusive) for summarization.`
            : 'send the new changelog entries for summarization.',
    },
} satisfies Record<string, RCEAction>;

export function registerChangelogActions(): void {
    NEURO.client?.registerActions(stripToActions([changelogActions.read_changelog]));
}

export async function readChangelogAndSendToNeuro(fromVersion?: string): Promise<void> {
    try {
        if (!NEURO.connected) {
            vscode.window.showErrorMessage('Not connected to Neuro API.');
            return;
        }

        const { sections, latest } = await readAndParseChangelog();
        if (sections.length === 0) {
            NEURO.client?.sendContext('Could not find any version entries in the changelog.');
            return;
        }

        const saved = NEURO.context?.globalState.get<string>(MEMENTO_KEY);
        const { selected, startVersion, endVersion, note } = computeSelection(sections, latest, saved, fromVersion);

        if (selected.length === 0) {
            NEURO.client?.sendContext('No matching changelog entries to summarize.');
            return;
        }

        const md = selected.map(s => `## ${s.version}\n\n${s.body.trim()}`).join('\n\n');
        const fence = getFence(md);
        const messageParts: string[] = [];
        messageParts.push(`Changelog entries from ${startVersion} to ${endVersion}:`);
        if (note) messageParts.push(note);
        messageParts.push('\n');
        messageParts.push(`${fence}markdown\n${md}\n${fence}`);

        NEURO.client?.sendContext(messageParts.join('\n'));

        // Update memento to latest delivered
        await NEURO.context?.globalState.update(MEMENTO_KEY, endVersion);
    } catch (erm) {
        logOutput('ERROR', `Failed to read changelog for summary: ${erm}`);
        vscode.window.showErrorMessage('Failed to read changelog for summary. See logs for details.');
    }
}

function handleReadChangelog(actionData: ActionData): string | undefined {
    void readChangelogAndSendToNeuro(actionData.params?.fromVersion);
    return undefined;
}

async function readAndParseChangelog(): Promise<{ sections: ChangelogSection[]; latest: string; }> {
    const uri = vscode.Uri.joinPath(NEURO.context!.extensionUri, 'CHANGELOG.md');
    const data = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder('utf-8').decode(data);
    const sections = parseChangelog(text);
    const latest = sections[0]?.version ?? '0.0.0';
    return { sections, latest };
}

function parseChangelog(text: string): ChangelogSection[] {
    const headerRegex = /^##\s+(\d+\.\d+\.\d+)\s*$/gm;
    const matches: { version: string; index: number; }[] = [];
    let m: RegExpExecArray | null;
    while ((m = headerRegex.exec(text)) !== null) {
        matches.push({ version: m[1], index: m.index });
    }
    const sections: ChangelogSection[] = [];
    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const block = text.slice(start, end).trim();
        // Remove the "## x.y.z" line from body when storing
        const body = block.replace(/^##\s+\d+\.\d+\.\d+\s*\r?\n/, '');
        sections.push({ version: matches[i].version, body });
    }
    // The file is latest-first already; preserve that order here
    return sections;
}

function computeSelection(
    latestFirst: ChangelogSection[],
    latest: string,
    saved: string | undefined,
    provided?: string,
): { selected: ChangelogSection[]; startVersion: string; endVersion: string; note?: string } {
    const versions = latestFirst.map(s => s.version);

    let startIdx: number | undefined;
    let startVersion: string | undefined;
    let note: string | undefined;

    // 1) If provided and found, start there; if provided but not found, fall back to default and note it
    if (provided) {
        const idx = versions.indexOf(provided);
        if (idx !== -1) {
            startIdx = idx;
            startVersion = provided;
        } else {
            note = `Note: requested start version ${provided} was not found; using defaults.`;
        }
    }

    // 2) Defaults if not decided yet
    if (startIdx === undefined) {
        if (!saved) {
            // Default to 2.2.1 if present; otherwise, oldest available
            const idx221 = versions.indexOf('2.2.1');
            startIdx = idx221 !== -1 ? idx221 : versions.length - 1;
            startVersion = versions[startIdx];
        } else {
            const savedIdx = versions.indexOf(saved);
            if (savedIdx === -1) {
                const idx221 = versions.indexOf('2.2.1');
                startIdx = idx221 !== -1 ? idx221 : versions.length - 1;
                startVersion = versions[startIdx];
            } else if (saved === latest) {
                // If saved is latest, deliver latest again
                startIdx = versions.indexOf(latest);
                startVersion = latest;
            } else {
                // New versions after saved: indices [0..savedIdx-1]; start from the oldest among them
                startIdx = Math.max(0, savedIdx - 1);
                startVersion = versions[startIdx];
            }
        }
    }

    // Build selection from startIdx to 0 (toward latest), but output oldest→latest
    const endIdx = 0; // latest index in latest-first ordering
    const slice = latestFirst.slice(endIdx, startIdx! + 1); // indices [0..startIdx]
    const subsetLatestFirst = slice.reverse(); // now oldest→latest

    const selected = subsetLatestFirst;
    const endVersion = selected[selected.length - 1].version;
    return { selected, startVersion: startVersion!, endVersion, note };
}



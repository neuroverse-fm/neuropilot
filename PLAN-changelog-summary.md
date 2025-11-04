## Plan: Changelog Summary Action and Version Popup Update

### Goal
- Add a new action that composes and sends selected `CHANGELOG.md` entries (from the extension install directory) to the connected AI for summarization.
- The action should accept an optional `fromVersion` parameter to choose the starting version, then include all entries from that version onward, ordered oldest → latest, in a single response.
- Track the last delivered latest version via Memento; default behavior without a parameter should send only new versions after the saved version, except when saved is already the latest, in which case send the latest again. If nothing is saved yet, default `fromVersion` should be `2.2.1`.
- Update the update-reminder popup to include a button: "Ask {AI} to Summarize" (dynamic AI name), which triggers this new functionality using defaults, and mention that a command exists for repeating this later.

### Design
- Parsing source: `CHANGELOG.md` at `NEURO.context.extensionUri` root.
- Parser finds Level 2 markdown headers matching /^##\s+\d+\.\d+\.\d+/ and captures text until the next Level 2 header.
- Ordering: file is latest-first; selected subset should be reversed to oldest-first before sending.
- Memento key: `lastDeliveredChangelogVersion` (globalState). Update to the latest version included in the delivery.
- Default start logic when param not provided:
  - If memento unset: use `2.2.1`.
  - Else if memento === latestInFile: use that latest version (repeat latest).
  - Else: use the version immediately after the saved version in the file order.
- Message format sent to AI: a succinct instruction to summarize for the user, include dynamic names, and then a fenced markdown block containing the concatenated changelog entries.

### Implementation
- New module: `src/changelog.ts`
  - Export RCE action `summarize_changelog` with optional schema `{ fromVersion?: string }` and defaultPermission COPILOT.
  - Implement helper `sendChangelogSummaryToNeuro(fromVersion?: string)` used by both the action handler and VS Code command.
  - Use memento via `NEURO.context.globalState`.
- Register actions
  - `src/desktop/unsupervised.ts` and `src/web/unsupervised.ts`: spread actions and call `registerChangelogActions()`.
- VS Code command
  - Contribution: `neuropilot.askNeuroToSummarizeChangelog` in `package.json`.
  - Register in `registerCommonCommands()` and implement handler to call `sendChangelogSummaryToNeuro(undefined)`.
- Update popup
  - `src/shared/extension.ts` → `showUpdateReminder`: add third button `Ask ${CONNECTION.nameOfAPI} to Summarize` that runs the command with no args. Also adjust message to mention the new command exists.

### Edge Cases / Notes
- If `fromVersion` not found in changelog, fall back to default logic and inform AI in the message preamble.
- If selected range is empty (e.g., nothing newer than saved), send latest entry as per default rule.
- Respect style: TypeScript, 4-space indent, semicolons, single quotes; avoid dotfiles/external paths concerns since extension files are safe.
- Use `getFence` for message fences and keep output under Neuro’s context size expectations.

### Progress
- [x] Draft plan
- [ ] Implement action module
- [ ] Register actions (desktop/web)
- [ ] Add VS Code command and contribute it
- [ ] Update version popup
- [ ] Lint and fix



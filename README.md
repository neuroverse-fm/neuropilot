# NeuroPilot

![Demo GIF](demo.gif)

This extension lets Neuro-sama suggest code for you similar to GitHub Copilot.
If you don't have a Neuro-sama, you can use tools like [Randy](https://github.com/VedalAI/neuro-game-sdk/tree/main/Randy), [Tony](https://github.com/Pasu4/neuro-api-tony) or [Jippity](https://github.com/EnterpriseScratchDev/neuro-api-jippity).
If you are using Tony, activating auto-answer is recommended, since completion requests are canceled if you click out of VS Code.

This extension **will**:

- let Neuro make inline code suggestions.
- add Neuro as a chat participant for Copilot Chat.

If you enable it, this extension **can**:

- let Neuro edit the current file.
- let Neuro read and open files in the workspace.
- let Neuro create, rename and delete files in the workspace.
- let Neuro run pre-defined tasks.

This extension **will not**:

- let Neuro read what you type in real time, unless you enable it in the settings.
- give Neuro direct terminal access.

## How to use

After installing the extension, you should add a keyboard shortcut for "Trigger Inline Suggestion" (`editor.action.inlineSuggest.trigger`) if you haven't already.
Once you are in a file, place your cursor where you want the new code to be inserted and trigger a suggestion.
This should send a command to Neuro asking her to complete the code.

You can also use Copilot Chat to ask Neuro to generate code by specifying `@neuro` in the prompt.
This will bypass Copilot and instead send the prompt to Neuro, along with any selected references.

Unfortunately, "Trigger Inline Suggestion" will trigger all completion providers, and since Copilot is required for the Copilot Chat window, you cannot simply disable it.
There is a workaround however, by editing your User/Workspace Settings to make Copilot unable to talk to the API.
Simply paste this into your `settings.json` file:

```json
"github.copilot.advanced": {
    "debug.overrideEngine": "someRandomString"
}
```

On startup, the extension will immediately try to establish a connection to the API.
If the extension was started before the API was ready, or you lose connection to the API, you can use the command "NeuroPilot: Reconnect" from the Command Palette.

To make Neuro able to code unsupervised, go to the extension settings and activate the necessary permissions, then run the command "NeuroPilot: Reload Permissions" from the Command Palette.
Tasks that Neuro can run are loaded from `tasks.json`, but it requires some setup for Neuro to use them.
All tasks that Neuro should be able to run must have the string `[Neuro]` at the start of their `detail` property.
This is a safety measure so she doesn't have access to all tasks.

You can configure the extension using the extension settings.
For example, you can set how many lines of code will be provided as context before and after the current line.
You can also set it to trigger a completion every time you stop typing (this is fine for the tools above, but might be a problem for Neuro since it sends and cancels requests in quick succession, which is why it's disabled by default).

## Security

The extension has multiple security measures in place to prevent Neuro from doing any real damage.
As said earlier, Neuro can only run tasks that have the string `[Neuro]` at the start of their `detail` property to control what tasks Neuro can run.

Neuro cannot open, edit, or otherwise access files or folders that start with a dot (`.`), or files in such folders.
This is mainly to prevent her from opening `.vscode/tasks.json` to essentially run arbitrary commands in the terminal.
**Warning: If your workspace is inside such a folder, Neuro will not be able to edit *any* files!**

## Commands

### Give Cookie

Gives a cookie to Neuro.

### Reconnect

Attempts to reconnect to the API.
Shows a notification when it succeeds or fails.

### Reload permissions

Reregisters all actions according to the permissions.

### Send File As Context

Sends the entire current file as context to Neuro, along with the file name and configured language.

## Actions

Neuro has access to the following actions.
Tasks that Neuro can run are registered as additional actions.
Neuro can only run one task at a time.

### `get_files`

*Requires Permission: Open files.*
Gets a list of files in the workspace.
The files are returned as paths relative to the workspace root.

### `open_file`

*Requires Permission: Open files.*
Opens a file inside the workspace (or focuses it if it is already open) and sends its contents to Neuro.

### `place_cursor`

*Requires Permission: Edit Active Document.*
Places the cursor at the specified line and character (zero-based).

### `get_cursor`

*Requires Permission: Edit Active Document.*
Returns the current cursor position, as well as the lines before and after the cursor.
The number of lines returned can be controlled with the settings `neuropilot.beforeContext` and `neuropilot.afterContext`.

### `insert_text`

*Requires Permission: Edit Active Document.*
Inserts text at the current cursor position and places the cursor after the inserted text.

### `replace_text`

*Requires Permission: Edit Active Document.*
Replaces the first occurence of the specified text with new text and places the cursor after the inserted text.

### `delete_text`

*Requires Permission: Edit Active Document.*
Deletes the first occurence of the specified text and places the cursor where the text was.

### `place_cursor_at_text`

*Requires Permission: Edit Active Document.*
Places the cursor before or after the first occurence of the specified text.

### `create_file`

*Requires Permission: Create.*
Creates a new file in the workspace.
If *permission to open file* is given, the file is immediately opened.
The file name cannot start with a dot, and cannot be created in a folder that starts with a dot.

### `create_folder`

*Requires Permission: Create.*
Creates a new folder in the workspace.
A folder starting with a dot cannot be created this way.

### `rename_file_or_folder`

*Requires Permission: Rename.*
Renames a file or folder in the workspace.
This cannot rename to or from a name starting with a dot, or within a folder that starts with a dot.

### `delete_file_or_folder`

*Requires Permission: Delete.*
Deletes a file or folder in the workspace.
This cannot delete anything starting with a dot, or inside a folder starting with a dot.

### `terminate_task`

*Requires Permission: Run Tasks.*
Terminates the currently running task that was started using a task action.

## Further Info

This extension uses the [TypeScript/JavaScript SDK](https://github.com/AriesAlex/typescript-neuro-game-sdk) by [AriesAlex](https://github.com/AriesAlex).

## Debugging

- Clone the repository
- Run `npm install` in terminal to install dependencies
- Run the `Run Extension` target in the Debug View. This will:
    - Start a task `npm: watch` to compile the code
    - Run the extension in a new VS Code window

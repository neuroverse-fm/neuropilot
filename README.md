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
- let Neuro read and open files in the workspace (planned feature).
- let Neuro create, rename and delete files in the workspace (planned feature).
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

## Commands

### Give Cookie

Gives a cookie to Neuro.

### Reconnect

Attempts to reconnect to the API.
Shows a notification when it succeeds or fails.

### Send File As Context

Sends the entire current file as context to Neuro, along with the file name and configured language.

## Further Info

This extension uses the [TypeScript/JavaScript SDK](https://github.com/AriesAlex/typescript-neuro-game-sdk) by [AriesAlex](https://github.com/AriesAlex).

## Debugging

- Clone the repository
- Run `npm install` in terminal to install dependencies
- Run the `Run Extension` target in the Debug View. This will:
    - Start a task `npm: watch` to compile the code
    - Run the extension in a new VS Code window

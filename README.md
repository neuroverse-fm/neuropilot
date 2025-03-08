# NeuroPilot

This extension lets Neuro-sama suggest code for you similar to GitHub Copilot.
If you don't have a Neuro-sama, you can use tools like [Randy](https://github.com/VedalAI/neuro-game-sdk/tree/main/Randy), [Tony](https://github.com/Pasu4/neuro-api-tony) or [Jippity](https://github.com/EnterpriseScratchDev/neuro-api-jippity).
If you are using Tony, activating auto-answer is recommended, since completion requests are canceled if you click out of VS Code.

## How to use

After installing the extension, you should add a keyboard shortcut for "Trigger Inline Suggestion" (`editor.action.inlineSuggest.trigger`) if you haven't already.
Also, if you have GitHub Copilot (or similar extensions) enabled, disable them.
Once you are in a file, place your cursor where you want the new code to be inserted and trigger a suggestion.
This should send a command to Neuro asking her to complete the code.

The extension will immediately try to establish a connection to the API when activated. If the extension was started before the API was ready, or you lose connection to the API, you can use the command "NeuroPilot: Reconnect" from the Command Palette.

You can configure the extension using the extension settings.
For example, you can set how many lines of code will be provided as context before and after the current line.
You can also set it to trigger a completion every time you stop typing (this is fine for the tools above, but might be a problem for Neuro since it sends and cancels requests in quick succession, which is why it's disabled by default).

## Debugging

- Clone the repository
- Run `npm install` in terminal to install dependencies
- Run the `Run Extension` target in the Debug View. This will:
	- Start a task `npm: watch` to compile the code
	- Run the extension in a new VS Code window

# Contributing to NeuroPilot

Please refer to our [contributor docs](https://vsc-neuropilot.github.io/docs/meta/contributors) in addition to this page.

## Contributing

If you have an idea or want to contribute a feature, please first [create an issue](https://github.com/VSC-NeuroPilot/neuropilot/issues) or send a message to `@Pasu4` in the project's [post on the Neuro Discord](https://discord.com/channels/574720535888396288/1350968830230396938).
If you make a pull request that contributes code, please run `npm run lint src` and resolve any errors that did not get auto-fixed, preferrably before each commit.

## Debugging

- Clone the repository
- Run `pnpm install` in terminal to install dependencies
- Run either the `Run Desktop Extension` or `Run Web Extension` target in the Debug View. This will:
  - Start the build tasks using `tsc` and `esbuild` to compile the code.
  - Run the extension in a new VS Code window.
  - Display extra extension logs (often from dependencies) in the main window's `Debug Console`.

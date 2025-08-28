---
"neuropilot": minor
---

This update was made in response to the Evil dev stream on 2025-08-28. [Here's the VoD, courtesy of Neuro Archiver](https://www.youtube.com/watch?v=AIYaBYVX95o).

- All actions now have `additionalProperties: false` in their schema, unless they didn't have a schema in the first place.
  - While this is marked as "probably not supported" by the Neuro API spec, NeuroPilot checks the action against the schema via the `jsonschema` library, so enforcement will still happen, albeit on NeuroPilot's side instead of the Neuro API server.
  - If you are testing with tools like Tony or Jippity, you can safely ignore the warning.
- The NeuroPilot v1 icon now shows in the gutter (the area to the left of the line count in a file). This already did show, even on stream, but after moving all assets into /assets/ we forgot to change it on dev branch.
  - And yes, this was never pushed to production, so technically this isn't a noteworthy "change", but it's here now.
- CNAME (the file usually used to set a custom domain name) has now been added to the default list of Exclude Patterns that the connected Neuro twin cannot access.
- We now have a changelog! We are trialing the use of the [changesets](https://github.com/changesets) tools to generate changelogs automatically. These changelogs should appear inside VS Code.
- All editing actions that move the cursor now mention in their description that the cursor moves after usage.
  - Alongside that, certain actions have had usage instructions clarified in their description.
- Cursor result positions are now checked at RCE validation time instead of execution time. This should improve the experience when using Copilot mode with editing actions.
- The context message to send the current file to the connected Neuro twin is changed to indicate that Vedal used the command.
- CRLF conversion offset has been fixed when using `insert_text`.
- Docs are now hosted at [a different subpage](https://vsc-neuropilot.github.io/docs) than before. While this isn't part of the extension itself, the link on the README file broke as a result of this change. This has now been fixed.
  - The way that the open docs commands work is slightly different, now having a dropdown to select instead of opening our own docs directly. This is in preparation for our public API for extending NeuroPilot.
  - For now, you'll be selecting the `NeuroPilot` option most/all of the time.
- There is a new `get_content` action that sends the current file's contents. This works more or less the same as the Send Current File as Context command.

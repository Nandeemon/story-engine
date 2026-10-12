# Story Engine

A tool for making image-driven interactive stories, in the tradition of Ren'Py, that anyone can start using by trying things.

**Dead simple to build, deep when you go looking.** You place a backdrop and characters by clicking in the picture, write conversations like a script, and press Play to see exactly what the player gets.

The editor is built and tested in the browser first, and will be packaged as a desktop program for Windows, Mac and Linux from the same code. Finished games always run in a browser.

## Run it

Requires Node 20 or newer.

```sh
npm install
npm run dev      # editor at http://localhost:5173
npm run check    # type-check, tests and build
```

## Layout

| Package | What it is |
| --- | --- |
| `packages/engine-core` | The project format, the conversation parser (writing mode) and the runner. No DOM, fully tested. |
| `packages/runtime` | Draws a room and runs a story in the browser. Used by the editor's Play button and by published games, so they cannot drift apart. Holds the starter art and game themes. |
| `packages/editor` | The editor web app. |

## Writing a conversation

```
Mara: You came back.
Choice
  "I missed this place."  affection + 8
    Mara (smiling): So did I.
  "Just passing through."
    Mara (sad): Of course you are.
Only if affection is at least 5
  Mara: Stay a while.
Otherwise
  Go to Street, night
```

- `Name: text` is a line, `Name (expression): text` changes the expression, and a line with no name is narration.
- `Choice` takes answers in quotes on the indented lines below it, each with optional changes such as `affection + 8`.
- `Only if <fact> is at least <n>` runs the indented lines when true, and `Otherwise` runs the lines under it when not.
- `Change gold - 10` changes a story fact, `Go to <room name>` moves to another room, and `End` closes the conversation.

## Status

Step 1 of the v1 build order is in place: rooms, characters and objects, writing mode, Play, the look of the game, and the story map. Next up: publishing, the character builder, stats and on-screen display, story testing tools and simulation.

The design lives in two documents: the project brief and the design document.

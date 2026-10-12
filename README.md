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

## Your work

The editor keeps your story in this browser and warns you if it stops being able to save. **Save to file** on the Story map downloads the whole project, images included, as one `.story.json` file, and **Open a file** brings it back. Undo and Redo (Ctrl+Z, Ctrl+Shift+Z) cover every change to the project. Renaming a room updates every `Go to` that points at it, and renaming a character updates their lines.

## Characters and looks

Add a character with **Use your own picture**: that picture is the character's base. **Add looks** takes one or more pictures (expressions or poses), named after their files (`lin_happy.png` becomes `happy`). Click a look to line it up over the base picture, so the character stays still when the look changes. In a conversation, pick a look per line, or write `Lin (happy): Hi.` in the script; **Use a different picture here** gives one line a picture of its own. A character made from your pictures can be placed in any room and keeps its looks.

## Staging a conversation

When a conversation starts, characters who take no part step aside until it ends (or choose "The room stays as it is"). Click a line in the map: the picture at the top of the panel shows the scene at that line. Drag a character there, or use the place buttons, size, and turn around; the place holds until it changes. Pick an effect for the line (shake, bounce, jump, flash), bring someone in or take someone out. Someone who speaks but is not on stage comes in by themselves.

In the script these are plain lines:

```
Show Lin as happy at left with fade
Lin (sad, shake): I thought you forgot.
Move Lin to center size 70 flipped
Hide Lin with slide to right
```

Places are far left, left, center, right, far right, or a number such as `40%` (and `40% 90%` to set the height too).

## Layout

| Package | What it is |
| --- | --- |
| `packages/engine-core` | The project format, the conversation parser (writing mode) and the runner. No DOM, fully tested. |
| `packages/runtime` | Draws a room and runs a story in the browser. Used by the editor's Play button and by published games, so they cannot drift apart. Holds the starter art and game themes. |
| `packages/editor` | The editor web app. |

## Writing a conversation

Every conversation can be shown two ways, switched at the top of the conversation view. **Map** (the default) draws it as boxes: click a box to change it, click + to add a step there. **Script** shows it as text. Both edit the same conversation.

```
Mara: You came back.
Choice
  "I missed this place."  affection + 8
    Mara (smiling): So did I.
    Go to part Stay
  "Just passing through."
    Mara (sad): Of course you are.
    Go to Street, night
Part: Stay
Only if affection is at least 5
  Mara: Stay a while.
Otherwise
  Mara: Drink your coffee.
```

- `Name: text` is a line, `Name (expression): text` changes the expression, and a line with no name is narration.
- `Choice` takes answers in quotes on the indented lines below it, each with optional changes such as `affection + 8`.
- `Only if <fact> is at least <n>` runs the indented lines when true, and `Otherwise` runs the lines under it when not.
- Lines indented under an answer run only for that answer. Lines that are not indented run after every answer, so paths meet again. End a path with `End` or `Go to` to keep it apart.
- `Change gold - 10` changes a story fact, `Go to <room name>` moves to another room, and `End` closes the conversation.
- `Part: Stay` names a point at the left edge, and `Go to part Stay` continues from there, forwards or back.
- `# text` is a note only the author sees. `Narration: text` forces a line to be narration when it would otherwise read as a command.

## Status

Step 1 of the v1 build order is in place: rooms, characters and objects, the conversation map and writing mode, Play, the look of the game, and the story map. Next up: publishing, the character builder, stats and on-screen display, story testing tools and simulation.

The design lives in two documents: the project brief and the design document.

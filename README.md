# Story Engine

A tool for making image-driven interactive stories, in the tradition of Ren'Py, that anyone can start using by trying things.

**Dead simple to build, deep when you go looking.** You place a backdrop and characters by clicking in the picture, write conversations like a script, and press Play to see exactly what the player gets.

The editor is built and tested in the browser first, and will be packaged as a desktop program for Windows, Mac and Linux from the same code. Finished games always run in a browser.

## Run it

Requires Node 20 or newer.

```sh
npm install
npm run dev      # editor at http://localhost:5173
npm run dev:phone  # the same, and reachable from a phone on the same Wi-Fi (open the Network address it prints)
npm run check    # type-check, tests and build
```

## Your work

The editor opens where you left off, or on **Your stories**: every story kept in this browser, each saved on its own. Make a **New story**, open one, **Duplicate** it to try something out, or **Delete** it. Click Story Engine at the top left to get back. Inside a story, the rail on the left goes to the story-wide places (Story map, Characters, Pictures & sounds, Look and Check; it folds to icons only), and the path at the top shows where you are: Story › Room › Conversation. On a phone the header is one row (back, title, ⋯ and Play) and the ⋯ menu holds the rail. The editor warns you if the browser stops being able to save. **Save to file** under **Share** downloads the story, images included, as one `.story.json` file, and **Open a file** on Your stories adds such a file as a new story. Undo and Redo (Ctrl+Z, Ctrl+Shift+Z) cover every change to the project. Renaming a room updates every `Go to` that points at it, and renaming a character updates their lines.

**The sample story**, *The Hoshino House* (Open the sample story, or Add the sample story on Your stories), is a weekend with a family of five: calm, secretly terrifying Mum, pun-loving Dad, and three sisters, Akane (21, the planner), Sora (19, the gamer) and Hina (18, pure energy). Five rooms and two quests, "The missing console" and "Mum's birthday", show conversations that change with the quest stage, room situations, items with an inventory (I) and a quest log (Q), marks, line effects, variations, Ask, the camera and two endings.

## Sharing your game

Press **Share** in the top bar, give the story a name and press **Make a game file**. You get one `.html` file with the whole game inside: the story, the pictures and the player, behind a start screen. Open it in any browser, send it to someone, or upload it to itch.io or any web host. Nothing of the editor is in it. (A link that plays the game straight from the editor would need a server, and is not built yet.)

## Testing your story

**Check** lists what would otherwise only show up while playing: doors to rooms that do not exist, looks a character does not have, names that are on no stage, steps that can never be reached, and rooms that nothing leads to. **Show** takes you to the step (**Open the room** for a room). Errors are red, warnings amber; the badge counts both and is red only when something needs fixing. Rooms changed in the last few minutes are listed in grey as still being built, not as problems. A room nothing leads to offers **Make a door here from …**: it adds a clickable area in the room you pick that goes to this room, ready to drag into place.

**Play** in the top bar opens a small menu: **From here** (the room you are in, or the conversation, from the marked step when one is marked) and **From the start**. On the Story map and in the start room it simply plays from the start.

Under **Test values** (folded away at the bottom of Check) you can set story facts before playing, for example `affection = 12` to test a line that needs affection 10. Play says when it is using test values. In the conversation map, **Play from here** starts at the selected line, with the scene as it stands at that point.

## Script view

The script keeps what you wrote. Changing a line in the map rewrites only that line; notes, blank lines and your indentation stay. Line numbers run down the side and the line with a problem is marked. Enter keeps the indentation (and goes one step in after `Choice`, an answer, `Only if` or `Otherwise`), Tab and Shift+Tab indent and outdent.

## On-screen display

In **Look › Interface**, the **One value** panel shows a single story fact (affection as a meter, gold as a number) with no box around it; drag it into place on the picture. Stories made before panels had "single values": they open with each one turned into a One value panel.

## Items

Things the player can have, such as an old key, are **Items** of the whole story. Make one in a conversation with the step **Give or take an item** (the map shows "Gives: old key" or "Takes: old key"), or under Pictures & sounds › Items, where each item gets a name and an icon. Whether the player has an item is a story fact underneath, so **Only if** can test it, and an inventory panel shows every item the player has, with its icon.

## Rooms that react

- **Clickable area:** with **+ Clickable area** in the room's panel, a clickable area is an invisible box you put over a door, a window or a sign in the backdrop. Drag it, drag its corner to resize it, and pick where clicking it goes (or give it a conversation of its own); an area that leads somewhere is named after it, such as "Door to Kitchen", until you rename it. Under **Shape**, **Draw shape** lets you click point by point around any shape (close it on the first point or press Enter); later, drag the dots to adjust it, or pick **Box** to go back to a box. In the game only the inside of the shape takes clicks. **Text by the mouse** shows a short label next to the pointer while the player holds it over the area (or any clickable thing, under More), and it can hold story facts like `{gold}`. **Clickable: Only if…** takes one or more conditions that must all hold; characters and objects have the same under More, as **In the room**.
- **Only if:** under More, anything in a room can be there only while a story fact says so, for example Jon only `if met_jon is yes`. A conversation brings him in with a Change.
- **Once:** a conversation can happen every time, or once, after which the thing cannot be clicked or is gone.
- **When the player enters:** a room can start a conversation straight away, on every visit or only the first.

## Interface panels

Look › **Interface** builds the game's own interface. **+ Panel** offers a status bar, an inventory, a character card, a quest log, a button row or an empty panel; it lands in the picture, where you drag it, drag its corner to resize it (in percent, so it holds at any size) and click a block to change it. A panel is built from blocks: **Text** (with facts in braces, `{gold} gold`), **Number**, **Meter**, **Picture**, **Button** (runs a few lines of script, such as `Change hp = 10` or `Show panel Inventory`, while the player looks around), **Items the player has** (every item the player has, with its icon from the story's Items) and **Portrait**. Every block can show only if a story fact says so.

When a panel shows: always, only in some rooms, only during conversations, or only while looking around, and under More, only if a story fact says so. The player can open and close it with a key (I for the inventory) and a small button, and conversations can with `Show panel Inventory` and `Hide panel Inventory` (also a step in the map). Panels take the dialogue box's look, or none, or a frame picture of your own whose corners stay sharp at any size. In Look every panel shows, the hidden ones see-through; the side panel says when each one shows.

## Paths you draw

Pick a line, open **Stage** and press **Draw a path**, then draw with the mouse in the scene: the character moves along that line while the conversation goes on. Set how long it takes, whether it runs once, loops or goes back and forth, and a smooth or steady tempo. Click a dot on the path to change things as the character passes it: size, turning around, an effect (shake, bounce, pop…), how visible, or the look. Drag dots to adjust the line, and play it in the scene. In the script: `Path Mara over 4s back and forth: 30 98, 50 90 size 60 bounce, 70 98 flip`.

## In the game

Every game has small buttons in the corner (Look can turn them off): **back** a line, **history** of what was said (the wheel up opens it too), **settings** for text speed, music and sound volume, auto, skipping lines already read and reading lines aloud, and in the game file three **save slots**. Endings (`Ending: A quiet goodbye`) show an ending card, and the title screen counts the endings a player has found.

## More ways to tell it

- **Ask the player** for an answer (`Ask "What is your name?" as name`) and use any story fact in a line: `Nice to meet you, {name}.`
- **Answers** can be gone once picked, or show only when nothing else is left (`"Leave"  fallback`).
- **Other ways to say a line**, at random or in turn: `Mara (in turn): Hi. || Back again? || You again.`
- **Camera**: zoom in on a spot, shake, flash, or back to the whole picture. **Go to** a room with a fade, through black, or a slide.
- **Look**: lines as speech bubbles over the speaker, narration over the whole picture.
- **Voice**: record a line with the microphone on its Sound page. **Video backdrops**: Change the backdrop → Use a video.

## Marks and movement

**Marks** are small pictures on a character: twelve starter marks (anger, sweat, puff, hearts, sparkle, shock, question, music note, sleepy, gloom, blush, tears), each animated (pulses, floats up, glides out, drips down…), and your own pictures, where a GIF animates by itself. Pick marks for one line in the line's panel (`Mara (angry, mark anger): …`), or keep one on with **Put a mark on someone** (`Mark Mara with puff`, `Unmark Mara`). Drag a mark in the scene to move it on that character, and use the wheel over it to resize it. The Story map lists the marks, to change their animation, speed and size.

Characters can **move while standing**: breathe, sway, bob, float or bounce, with strength and speed. Set it on a character's page or under More on a placed character, or change it in a conversation with **Change how someone moves** (`Loop Mara with sway speed 4`, `Loop Mara with none`).

## Music and volume

Add music on the Story map (up to 15 MB a track; MP3 or OGG keeps it small). A room can start its own music when the player enters, looping or once, or go silent; left alone, whatever plays goes on. A conversation can change it with a **Music** step (`Music: rain theme`, `Music once: sting`, `Music: off`). Every sound and track has its own volume slider.

## Effects and sounds

A line can give the speaker an effect: shake, tremble, pulse, pop, bounce, jump or flash, each with Strength, Speed and Times (1 to 5). Upload your own sounds (a laugh, a gasp, a door) and play them with a line or when something is clicked. In the script: `Mara (happy, pulse strength 4 x2, sound laugh): Ha!`. A line's sound plays as the line appears, or, set to **When the player moves on**, as the player clicks on (`sound laugh at the end`). A sound can also be a step of its own: **Sound** plays one, once or looping until stopped (`Sound: door creak`, `Sound: rain (loops)`), and the same step can stop one sound (`Stop sound: rain`) or every sound, with the music too if you like (`Stop sounds`, `Stop sounds and music`). Looping sounds stop when the player leaves the room. **Pictures & sounds** shows everything the story shows and plays as a grid, filtered by Backdrops, Characters, Objects, Marks, Sounds, Music or Items: click a picture to go where it is used, click a mark to change its animation, speed and size, and listen to, rename or remove sounds.

## Characters

**Characters** in the rail lists everyone who speaks: your main characters (made from your own pictures) and the starter figures such as Mara and Jon, marked as starter figures. Open a main character to see and rename their looks, which lines use each look, the rooms they are in, every conversation they take part in, and the story facts used there, with notes of your own. Make a new character there, give a starter figure or a voice your own picture, or pick **+ New character from a picture** when bringing someone in during a conversation.

## The dialogue box

The box fits its text, and the speaker's name always shows in full. In **Look**: seven themes, the box as **Solid**, **Glass**, **Outline** or **Band**, the name as a tag, inside the box or as coloured text, and under More the width (fits the text or full), how see-through it is, text that appears letter by letter (players can click to show the rest), corners, text size and your own colours.

## Story facts and milestones on characters

On a character's page, keep track of what matters for them: a **Number** (trust, affection), a **Milestone** (heard the secret), or a **Word** (mood), each with a value at the start of a new game. `talked.<name>` counts the conversations had with a character by itself. The character's lines in the conversation map get one-click buttons (+1 trust, ✓ heard the secret) that add the Change right after the line. A character can also have a small sound library (a laugh, a sigh): their sounds come first and as one-click buttons on their lines, and a sound can be tied to a look so it plays whenever a line switches to that look.

**Play from the marked step** above the conversation map plays from whatever step is marked.

## Characters and looks

Add a character with **Use your own picture**: that picture is the character's base. **Add looks** takes one or more pictures (expressions or poses), named after their files (`lin_happy.png` becomes `happy`). Click a look to line it up over the base picture, so the character stays still when the look changes. In a conversation, pick a look per line, or write `Lin (happy): Hi.` in the script; **Use a different picture here** gives one line a picture of its own. A character made from your pictures can be placed in any room and keeps its looks.

## Staging a conversation

When a conversation starts, characters who take no part step aside until it ends (or choose "The room stays as it is"). Click a step in the map: the scene beside it shows the stage at that step. A line's panel shows who speaks, the text and the look; Effect, Marks, Sound, Stage, Variations and Story facts are small pills that show what is set; each opens its own page in the panel, with **‹ Line** (or Escape) to go back. Drag anyone there to place them from that step on, or use the place buttons, size, and turn around; the place holds until it changes. Pick an effect for the line (shake, bounce, jump, flash), bring someone in or take someone out. Someone who speaks but is not on stage comes in by themselves.

In the script these are plain lines:

```
Show Lin as happy at left with fade
Lin (sad, shake): I thought you forgot.
Move Lin to center size 70 flipped
Hide Lin with slide to right
```

Places are far left, left, center, right, far right, or a number such as `40%` (and `40% 90%` to set the height too).

## Choices and backdrops

Answers to a choice appear in the dialogue box, under the question that was just asked, and number keys pick them. Look can move them to the middle of the screen instead.

Each backdrop can **Fill** the stage (drag the backdrop in the room to choose which part shows, and zoom in), **Fit** the whole picture in (with soft or coloured edges), or **Stretch**.

## Layout

| Package | What it is |
| --- | --- |
| `packages/engine-core` | The project format, the conversation parser (writing mode) and the runner. No DOM, fully tested. |
| `packages/runtime` | Draws a room and runs a story in the browser. Used by the editor's Play button and by published games, so they cannot drift apart. Holds the starter art and game themes. |
| `packages/editor` | The editor web app. |

## Writing a conversation

Every conversation can be shown two ways, switched at the top of the conversation view. **Map** (the default) draws it as boxes: click a box to change it, click + to add a step there. **Add a step** has a box to find a step by name, the four used most, then the rest in groups. The map opens at actual size on its start; the mouse wheel zooms around the pointer (Shift with the wheel scrolls sideways) and **Fit** shows it all. On a wide screen the scene sits beside the map, both using the whole window; drag the bar between them to make the scene wider or narrower. **Script** shows it as text, with an **Insert** menu in the same groups and a **Cheat sheet** that opens when wanted. Both edit the same conversation.

Double-click a line in the map to type in it there: Enter keeps it and starts the next line by the same speaker, Enter on an empty line stops, Escape leaves it as it was. With a box selected, ↑ and ↓ go through the steps in reading order, ← and → go between answers or the two paths of an Only if, Enter goes to the panel, Delete removes the step (Undo brings it back), `/` or `a` adds a step after it, and Escape lets go.

Lines that follow each other share one box. Hold a row (or its ⋮⋮ handle) and drag it up or down to change the order in its box; drag an answer sideways to change the order of the answers. The ▾ on a box (shown on hover) makes it smaller, a line each and the first rows only; **Smaller boxes** beside the zoom does it for all of them, to see the shape of a long conversation.

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

## Quests and situations

One room can serve many moments of the story without copies.

- **Quests** have a name and stages in order; a new quest starts with Not started, Started and Done. `Quest Lost cat: Started` moves a quest to a stage. The stage is kept as the story fact `quest.lost_cat`, and an unset quest is at its first stage.
- Anywhere a condition goes, quests can be tested: `Only if quest Lost cat is Started`, `is not Done`, `is at least Started` or `is before Done`. "At least" and "before" follow the order of the stages. Check points out quest and stage names that do not exist.
- **More than one conversation** per character or thing: each has its own conditions, and they are tried in order. The first one whose conditions all hold runs, and the thing's own conversation is used otherwise.
- **Situations** of a room (night, after the fire) are active while their conditions hold, and several can be active at once. A situation can have its own backdrop and music; when several are active, the one latest in the list wins. A thing can belong to a situation, so it is there only while that situation is active, or it can hide while certain situations are active. The room updates after each conversation.

## Status

Step 1 of the v1 build order is in place: rooms, characters and objects, the conversation map and writing mode, Play, the look of the game, and the story map. Characters with looks, staged conversations, choices in the dialogue box, backdrop framing, game files, the problem list and test values, and the on-screen display are in place too. Next up: built looks from parts, saving progress in published games, and simulation.

The design lives in two documents: the project brief and the design document.

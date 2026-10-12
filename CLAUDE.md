# Story Engine: working notes

## Principles
- Dead simple to build, deep when you go looking. Every feature is judged against this.
- Click in the picture first. A form is never the first way to do something.
- One surface at a time. Panels open with their three most used settings; the rest goes under "More".
- Plain words in the interface: Conversation, Only if, Change something, Story facts, Go to another room.
- Nothing of the editor appears in the game: no breadcrumbs, trails or tool chrome inside or around the game frame. Editor-only info sits outside the stage and is labelled "Only you see this".

## Code
- Code, UI text and docs are in English.
- `engine-core` has no DOM access and no dependencies. Story logic goes here, with tests.
- `runtime` is shared by the editor's Play and published games. Game visuals go here; editor chrome does not.
- `editor` imports both. Editor-only styling lives in `editor.css`, game styling in `runtime/src/game.css`.
- Positions and sizes on the stage are percentages of the stage, so layouts hold at any size.
- Projects are plain JSON (`Project` in `engine-core/src/types.ts`). Load anything from storage or import through `normalizeProject`.
- Run `npm run check` before committing.

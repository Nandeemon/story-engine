/** A value the story remembers. */
export type FactValue = number | boolean | string;
export type Facts = Record<string, FactValue>;

export interface Effect {
  fact: string;
  op: '+' | '-' | '=';
  value: FactValue;
}

export type CompareOp = '>=' | '<=' | '>' | '<' | '!=' | '=' | 'truthy';

export interface Condition {
  fact: string;
  op: CompareOp;
  value: FactValue;
}

export interface SayStep {
  t: 'say';
  who: string;
  /** The look (or expression) the speaker shows from this line on. */
  expr: string;
  text: string;
  /** An effect on the speaker for this line: shake, tremble, pulse, pop, bounce, jump or flash. */
  fx?: string;
  /** How the effect plays; anything left out is normal. */
  fxOpts?: { strength?: number; speed?: number; times?: number };
  /** A sound from the story's sounds, by name, played as the line appears. */
  sound?: string;
  /** Marks (an anger sign, a sweat drop, a puff) on the speaker for this line only. */
  marks?: string[];
  /** Other ways to say it: one is picked at random each time, or they come in turn (the last one stays). */
  alts?: string[];
  altMode?: 'random' | 'turn';
  /** A recorded voice for the line, by sound name. */
  voice?: string;
}

/** Where a character stands on stage: x and y are the bottom centre in percent of the stage, size is height in percent. */
export interface Placement { x?: number; y?: number; size?: number; flip?: boolean }
/** Bring a character on stage during a conversation. */
export interface ShowStep { t: 'show'; who: string; look: string; at: Placement; fx: string }
/** Move, resize or turn a character on stage. */
export interface MoveStep { t: 'move'; who: string; at: Placement }
/** Take a character off stage. */
export interface HideStep { t: 'hide'; who: string; fx: string }
/** Put a mark on someone until it is taken off (off), or take all their marks off (off with no mark). */
export interface MarkStep { t: 'mark'; who: string; mark: string; off?: boolean }
/** How someone moves while standing, from here on: breathe, sway, bob, float, bounce, or none. */
export interface LoopStep { t: 'loop'; who: string; move: Idle }
/** A point on a drawn path, in percent of the stage. A point can change things as the character passes it. */
export interface PathPoint {
  x: number;
  y: number;
  /** Height in percent of the stage from here on (eased between points). */
  size?: number;
  /** Turn around (true) or face forward (false) here. */
  flip?: boolean;
  /** A line effect played here: shake, bounce, pop… */
  fx?: string;
  /** How visible, 0 to 100, from here on (eased between points). */
  fade?: number;
  /** A look the character switches to here. */
  look?: string;
}
/** Move someone along a drawn path over a time, once, in a loop or back and forth. It goes on while lines are read. */
export interface PathStep { t: 'path'; who: string; points: PathPoint[]; secs: number; repeat?: 'loop' | 'pingpong'; ease?: 'steady' }
/** A movement a character repeats while standing. Strength and speed run from 1 to 5 (3 is normal). */
export interface Idle { move: string; strength?: number; speed?: number }
export interface ChoiceOption {
  text: string;
  effects: Effect[];
  steps: Step[];
  /** Gone once it has been picked. */
  once?: boolean;
  /** Only shown when no other answer is left. */
  fallback?: boolean;
}
export interface ChoiceStep { t: 'choice'; options: ChoiceOption[] }
export interface IfStep { t: 'if'; cond: Condition; then: Step[]; else: Step[] }
export interface ChangeStep { t: 'change'; effects: Effect[] }
export interface DoorStep { t: 'door'; room: string; /** How the picture changes to the next room. */ fx?: 'fade' | 'black' | 'slide left' | 'slide right' }
/** Ask the player to type an answer, kept as a story fact (a name, say). */
export interface AskStep { t: 'ask'; prompt: string; fact: string }
/** One of the story's endings: the conversation closes and the ending is shown and remembered. */
export interface EndingStep { t: 'ending'; name: string }
/** Move the camera: zoom in on a point, shake, flash, or back to the whole picture. */
export interface CameraStep { t: 'camera'; action: 'zoom' | 'shake' | 'flash' | 'reset'; scale?: number; x?: number; y?: number }
export interface EndStep { t: 'end' }
/** A named point in a conversation that "Go to part" can jump to. Only at the top level. */
export interface PartStep { t: 'part'; name: string }
/** Continue from a named part of the same conversation. */
export interface JumpStep { t: 'jump'; part: string }
/** Background music from here on: a track by name (looping unless once), or silence when track is empty. */
export interface MusicStep { t: 'music'; track: string; once?: boolean }
/** An author's note (a line starting with #). The player never sees it. */
export interface NoteStep { t: 'note'; text: string }

/** One step of a conversation. */
export type Step = SayStep | ChoiceStep | IfStep | ChangeStep | DoorStep | EndStep | PartStep | JumpStep | NoteStep | ShowStep | MoveStep | HideStep | MusicStep | MarkStep | LoopStep | PathStep | AskStep | EndingStep | CameraStep;
export type StageStep = ShowStep | MoveStep | HideStep | MarkStep | LoopStep | PathStep | CameraStep;

export interface ScriptError {
  /** 1-based line number in the written script. */
  n: number;
  msg: string;
}

export interface ParseResult {
  steps: Step[];
  errors: ScriptError[];
}

/* ---------- Project format ---------- */

export interface Backdrop {
  /** A starter backdrop id, such as "cafe". */
  preset?: string;
  /** An imported image as a data URL. */
  img?: string;
  /** A video backdrop (MP4 or WebM) as a data URL; it loops without sound. */
  video?: string;
  /** How the picture fills the stage: cover and crop (default), show whole, or stretch. */
  fit?: 'fill' | 'fit' | 'stretch';
  /** With fill: which point of the picture stays in view, in percent (50, 50 is the middle). */
  fx?: number;
  fy?: number;
  /** With fill: zoom into the picture, 1 to 3. */
  zoom?: number;
  /** With fit: what fills the edges, a blurred copy of the picture or a colour. */
  edge?: 'blur' | 'color';
  color?: string;
}

/** A character, an object with a picture, or an invisible area the player can click (over a door, say). */
export type ElementKind = 'char' | 'object' | 'area';

/**
 * One picture of a character: an expression or a pose. Lines pick a look by name.
 * dx and dy move the picture by a share of its own width and height, and scale
 * resizes it, so it lines up with the character's base picture.
 */
export interface CharacterLook {
  id: string;
  name: string;
  img: string;
  dx: number;
  dy: number;
  scale: number;
  /** A picture used for one moment only; kept out of the character's look list. */
  once?: boolean;
  /** A sound, by name, that plays when a line switches to this look (unless the line has a sound of its own). */
  sound?: string;
}

/**
 * A story fact the author keeps track of for a character: a number (affection),
 * a milestone (gave her the letter), an item the player can have, or a word (mood).
 */
export interface FactDef {
  fact: string;
  kind: 'number' | 'milestone' | 'item' | 'word';
  /** The value at the start of a new game; unset when left out. */
  start?: FactValue;
  /** The author's note on what it means. */
  about?: string;
}

/** A character made from the author's own pictures, shared by every room it appears in. */
export interface Character {
  id: string;
  name: string;
  /** The author's own notes about the character: who they are, what they want. */
  about?: string;
  /** Story facts the author keeps track of for this character. */
  facts?: FactDef[];
  /** How the character moves while standing, wherever they are placed. */
  idle?: Idle;
  /** Where marks sit on this character, by mark name, when moved from the mark's own spot. */
  markAt?: Record<string, MarkSpot>;
  /** The base picture, shown as the look called "default". */
  base: string;
  looks: CharacterLook[];
}

export interface StoryElement {
  id: string;
  kind: ElementKind;
  name: string;
  /** Starter art id, such as "mara" or "cup". */
  preset?: string;
  /** For characters made from the author's pictures: the character in project.characters. */
  characterId?: string;
  /** An imported image as a data URL. */
  img?: string;
  /** Bottom-centre position as a percentage of the stage width. */
  x: number;
  /** Bottom-centre position as a percentage of the stage height. */
  y: number;
  /** Height as a percentage of the stage height. */
  size: number;
  /** For areas: width as a percentage of the stage width. */
  w?: number;
  /** Only in the room while this is true; otherwise the player does not see it. */
  cond?: Condition;
  /** A conversation for one time only: afterwards it stays but cannot be clicked, or it is gone. */
  once?: 'stay' | 'hide';
  /** A sound from the story's sounds, by name, played when the player clicks it. */
  sound?: string;
  /** Not drawn in the room: holds the conversation a room starts with when the player enters. */
  offstage?: boolean;
  /** For characters: how they move while standing; the character's own setting when left out. */
  idle?: Idle;
  /** Starting expression or look for characters. */
  expr?: string;
  /** How this element's conversation opens: other characters step aside (default) or the room stays. */
  staging?: 'aside' | 'room';
  /** The written conversation opened by clicking this element. */
  script: string;
}

export interface Room {
  id: string;
  name: string;
  bg: Backdrop | null;
  /** Start a conversation as soon as the player enters. */
  auto: boolean;
  /** The element whose conversation starts on entering; the first one with a conversation when not set. */
  autoEl?: string;
  /** Start it on the first visit only, instead of every visit. */
  autoOnce?: boolean;
  /** Music when the player enters: a track by name, or "off" for silence. Left out, whatever plays goes on. */
  music?: string;
  /** Play the room's music once instead of looping it. */
  musicOnce?: boolean;
  els: StoryElement[];
}

export interface Look {
  theme: string;
  font: string;
  /** Corner radius in pixels. */
  radius: number;
  /** Text size as a share of the stage width (1 = 1%). */
  size: number;
  /** Where answers appear: in the dialogue box under the question (default), or in the middle of the screen. */
  choices?: 'box' | 'center';
  /** The dialogue box: solid (default), frosted glass, outlined, or a soft band across the bottom. */
  box?: 'solid' | 'glass' | 'outline' | 'band';
  /** How the speaker's name shows: a tag on the box (default), inside the box, or as coloured text. */
  names?: 'tag' | 'inside' | 'plain';
  /** How see-through the box is, 20 to 100 (percent covered). */
  opacity?: number;
  /** The box fits its text (default) or always spans the stage. */
  width?: 'fit' | 'full';
  /** Colours of the author's own, overriding the theme. */
  boxColor?: string;
  textColor?: string;
  accentColor?: string;
  /** Letters per second when text appears letter by letter; 0 or unset shows it at once. */
  typing?: number;
  /** Lines as speech bubbles over the speaker instead of the box. */
  bubbles?: boolean;
  /** Narration over the whole picture instead of the box. */
  narration?: 'screen';
  /** The buttons players get in the game (history, back, settings); shown unless turned off. */
  gameMenu?: false;
}

/** Something shown over the game all the time: a story fact as a label or a meter. */
export interface HudWidget {
  id: string;
  kind: 'label' | 'meter';
  fact: string;
  /** Words shown with the value, such as "Affection". */
  text: string;
  /** For meters: the value that fills the bar. */
  max: number;
  /** Top-left corner in percent of the stage. */
  x: number;
  y: number;
  /** For meters: width in percent of the stage. */
  w: number;
  /** Hidden until the fact has been set in the story. */
  hideUnset?: boolean;
}

/** Where a mark sits on a character: its centre in percent of the character's picture, and its height in percent of it. */
export interface MarkSpot { x: number; y: number; size: number }

/**
 * A small picture shown on a character, such as an anger sign or a puff of air:
 * a starter mark (preset) or the author's own picture (a GIF animates by itself),
 * with an animation and the spot it takes on a character.
 */
export interface MarkDef extends MarkSpot {
  id: string;
  name: string;
  preset?: string;
  img?: string;
  anim: 'none' | 'pulse' | 'float' | 'drift' | 'bob' | 'spin' | 'pop' | 'shake' | 'drip' | 'fade';
  /** 1 to 5, 3 is normal. */
  speed?: number;
}

/** A sound the author uploaded, played by name. */
export interface Sound {
  id: string;
  name: string;
  /** The sound as a data URL. */
  data: string;
  /** The character whose sound library it belongs to, if any. */
  owner?: string;
  /** How loud it plays, 0 to 100 (100 when left out). */
  volume?: number;
  /** A music track rather than a sound effect. */
  music?: boolean;
}

export interface Project {
  version: 1;
  /** The story's name, shown on the start screen of the game. */
  title?: string;
  rooms: Room[];
  look: Look;
  characters: Character[];
  /** The on-screen display. */
  hud?: HudWidget[];
  /** Sounds the author uploaded. */
  sounds?: Sound[];
  /** Marks the author added, or starter marks they changed. */
  marks?: MarkDef[];
}

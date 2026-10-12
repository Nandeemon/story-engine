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

export interface SayStep { t: 'say'; who: string; expr: string; text: string }
export interface ChoiceOption { text: string; effects: Effect[]; steps: Step[] }
export interface ChoiceStep { t: 'choice'; options: ChoiceOption[] }
export interface IfStep { t: 'if'; cond: Condition; then: Step[]; else: Step[] }
export interface ChangeStep { t: 'change'; effects: Effect[] }
export interface DoorStep { t: 'door'; room: string }
export interface EndStep { t: 'end' }
/** A named point in a conversation that "Go to part" can jump to. Only at the top level. */
export interface PartStep { t: 'part'; name: string }
/** Continue from a named part of the same conversation. */
export interface JumpStep { t: 'jump'; part: string }
/** An author's note (a line starting with #). The player never sees it. */
export interface NoteStep { t: 'note'; text: string }

/** One step of a conversation. */
export type Step = SayStep | ChoiceStep | IfStep | ChangeStep | DoorStep | EndStep | PartStep | JumpStep | NoteStep;

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
}

export type ElementKind = 'char' | 'object';

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
}

/** A character made from the author's own pictures, shared by every room it appears in. */
export interface Character {
  id: string;
  name: string;
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
  /** Starting expression or look for characters. */
  expr?: string;
  /** The written conversation opened by clicking this element. */
  script: string;
}

export interface Room {
  id: string;
  name: string;
  bg: Backdrop | null;
  /** Start the first conversation as soon as the player enters. */
  auto: boolean;
  els: StoryElement[];
}

export interface Look {
  theme: string;
  font: string;
  /** Corner radius in pixels. */
  radius: number;
  /** Text size as a share of the stage width (1 = 1%). */
  size: number;
}

export interface Project {
  version: 1;
  rooms: Room[];
  look: Look;
  characters: Character[];
}

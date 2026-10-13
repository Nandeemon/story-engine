import type { CompareOp, Condition, Effect, FactValue, ParseResult, Placement, ScriptError, Step } from './types';
import { lineFxText, parseLineFx, parsePlace, placeText } from './staging';

/**
 * Writing mode: turns a conversation written like a script into steps, and back.
 *
 *   Mara: You came back.
 *   Choice
 *     "I missed this place."  affection + 8
 *       Mara (smiling): So did I.
 *   Only if affection is at least 5
 *     Mara: Stay a while.
 *   Otherwise
 *     Go to Street, night
 *   Part: Goodbye
 *   Mara: See you.
 *
 * Indentation (two spaces, or a tab) puts lines under a choice answer or a condition.
 * The script text is what a project stores; the map edits the steps and writes the
 * text back with writeScript, so both views always show the same conversation.
 */

export function toValue(raw: string): FactValue {
  const v = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^(true|yes)$/i.test(v)) return true;
  if (/^(false|no)$/i.test(v)) return false;
  return v.replace(/^["']|["']$/g, '');
}

function parseEffects(text: string, n: number, errors: ScriptError[]): Effect[] {
  const out: Effect[] = [];
  for (const part of text.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^([\w.]+)\s*([+\-=])\s*(.+)$/);
    if (m) out.push({ fact: m[1], op: m[2] as Effect['op'], value: toValue(m[3]) });
    else errors.push({ n, msg: `Could not read the change "${part}". Write it like: affection + 5` });
  }
  return out;
}

/** Comparison words, in the order they are tried, with the symbol each means. */
export const CONDITION_WORDS: [string, CompareOp][] = [
  ['is at least', '>='], ['is at most', '<='], ['is more than', '>'], ['is less than', '<'], ['is not', '!='], ['is', '=']
];

function parseCondition(text: string, n: number, errors: ScriptError[]): Condition {
  const lower = text.toLowerCase();
  for (const [word, op] of CONDITION_WORDS) {
    const i = lower.indexOf(` ${word} `);
    if (i > 0) {
      const fact = text.slice(0, i).trim();
      if (/^[\w.]+$/.test(fact)) return { fact, op, value: toValue(text.slice(i + word.length + 2)) };
    }
  }
  const m = text.match(/^([\w.]+)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
  if (m) return { fact: m[1], op: m[2] as CompareOp, value: toValue(m[3]) };
  if (/^[\w.]+$/.test(text)) return { fact: text, op: 'truthy', value: true };
  errors.push({ n, msg: `Could not read the condition "${text}". Write it like: Only if affection is at least 5` });
  return { fact: '_', op: 'truthy', value: true };
}

interface Line { n: number; indent: number; text: string }

/**
 * Where a step came from in the author's text: its line as written, the blank or
 * comment lines just above it, and how it read when parsed. writeScript uses this
 * to change only the lines an edit touches, keeping the author's own layout.
 */
interface Source { raw: string; lead: string[]; header?: string; elseRaw?: string; elseLead?: string[] }
const sources = new WeakMap<object, Source>();
const tails = new WeakMap<object, string[]>();

export function parseScript(src: string): ParseResult {
  return parse(src, true);
}

function parse(src: string, noteSources: boolean): ParseResult {
  const errors: ScriptError[] = [];
  const rawLines = String(src ?? '').split('\n');
  const lines: Line[] = rawLines
    .map((raw, i) => ({ n: i + 1, indent: (raw.replace(/\t/g, '  ').match(/^ */) ?? [''])[0].length, text: raw.trim() }))
    .filter(l => l.text);
  let pos = 0;
  const parts = new Set<string>();
  let consumed = -1;
  /** Marks a line as read for a step, and returns it with the untouched lines above it. */
  const take = (l: Line): Source => {
    const lead = rawLines.slice(consumed + 1, l.n - 1);
    consumed = l.n - 1;
    return { raw: rawLines[l.n - 1], lead };
  };
  const mark = <T extends object>(obj: T, l: Line): T => { sources.set(obj, take(l)); return obj; };

  function block(parentIndent: number): Step[] {
    const steps: Step[] = [];
    while (pos < lines.length && lines[pos].indent > parentIndent) {
      const l = lines[pos];
      let m: RegExpMatchArray | null;

      if (l.text.startsWith('#')) {
        pos++;
        steps.push(mark({ t: 'note', text: l.text.replace(/^#+\s*/, '') }, l));
      } else if (/^choice$/i.test(l.text)) {
        pos++;
        const choiceSrc = take(l);
        const options = [];
        while (pos < lines.length && lines[pos].indent > l.indent) {
          const o = lines[pos];
          const q = o.text.match(/^["“](.+?)["”]\s*(.*)$/);
          pos++;
          if (!q) {
            if (!o.text.startsWith('#')) errors.push({ n: o.n, msg: 'An answer under Choice starts with quotes, like "Yes, I will."' });
            block(o.indent);
            continue;
          }
          const optSrc = take(o);
          const option = { text: q[1], effects: q[2] ? parseEffects(q[2], o.n, errors) : [], steps: [] as Step[] };
          sources.set(option, optSrc);
          option.steps = block(o.indent);
          options.push(option);
        }
        if (options.length) { const c: Step = { t: 'choice', options }; sources.set(c, choiceSrc); steps.push(c); }
        else errors.push({ n: l.n, msg: 'Choice needs at least one answer on the lines below it, indented.' });
      } else if ((m = l.text.match(/^only if\s+(.+)$/i))) {
        pos++;
        const ifSrc = take(l);
        const step: Step = { t: 'if', cond: parseCondition(m[1], l.n, errors), then: block(l.indent), else: [] };
        if (pos < lines.length && lines[pos].indent === l.indent && /^otherwise$/i.test(lines[pos].text)) {
          const o = take(lines[pos]);
          ifSrc.elseRaw = o.raw;
          ifSrc.elseLead = o.lead;
          pos++;
          step.else = block(l.indent);
        }
        sources.set(step, ifSrc);
        steps.push(step);
      } else if (/^otherwise$/i.test(l.text)) {
        errors.push({ n: l.n, msg: 'Otherwise only works right after an "Only if" block, at the same indent.' });
        pos++;
        block(l.indent);
      } else if ((m = l.text.match(/^part\s*:\s*(.+)$/i))) {
        pos++;
        const name = m[1].trim();
        if (parentIndent >= 0 || l.indent > 0) errors.push({ n: l.n, msg: 'A part starts at the left edge, not indented under something else.' });
        else if (parts.has(name.toLowerCase())) errors.push({ n: l.n, msg: `There is already a part called "${name}". Give each part its own name.` });
        else { parts.add(name.toLowerCase()); steps.push(mark({ t: 'part', name }, l)); }
      } else if (/^change\s+[\w.]+\s*[+\-=]/i.test(l.text)) {
        pos++;
        steps.push(mark({ t: 'change', effects: parseEffects(l.text.replace(/^change\s+/i, ''), l.n, errors) }, l));
      } else if ((m = l.text.match(/^go to part\s+(.+)$/i))) {
        pos++;
        steps.push(mark({ t: 'jump', part: m[1].trim() }, l));
      } else if ((m = l.text.match(/^go to\s+(.+)$/i))) {
        pos++;
        steps.push(mark({ t: 'door', room: m[1].trim() }, l));
      } else if ((m = l.text.match(/^music(\s+once)?\s*:\s*(.+)$/i))) {
        pos++;
        const track = m[2].trim();
        steps.push(mark(/^(off|none|stop|silence)$/i.test(track) ? { t: 'music', track: '' } : { t: 'music', track, ...(m[1] ? { once: true } : {}) }, l));
      } else if (/^end$/i.test(l.text)) {
        pos++;
        steps.push(mark({ t: 'end' }, l));
      } else if ((m = l.text.match(/^show\s+(.+?)(?:\s+as\s+(.+?))?(?:\s+at\s+(.+?))?(?:\s+size\s+(\d+(?:\.\d+)?))?(\s+flipped)?(?:\s+with\s+(.+?))?$/i)) && looksLikeName(m[1])) {
        pos++;
        const at = placeOf(m[3], l.n, errors);
        if (m[4]) at.size = Number(m[4]);
        if (m[5]) at.flip = true;
        steps.push(mark({ t: 'show', who: m[1].trim(), look: (m[2] ?? '').trim(), at, fx: (m[6] ?? '').trim().toLowerCase() }, l));
      } else if ((m = l.text.match(/^move\s+(.+?)(?:\s+to\s+(.+?))?(?:\s+size\s+(\d+(?:\.\d+)?))?(\s+(?:flipped|unflipped))?$/i)) && !m[1].includes(',') && ((m[2] && parsePlace(m[2])) || (!m[2] && (m[3] || m[4])))) {
        pos++;
        const at = placeOf(m[2], l.n, errors);
        if (m[3]) at.size = Number(m[3]);
        if (m[4]) at.flip = /^\s*flipped/i.test(m[4]);
        steps.push(mark({ t: 'move', who: m[1].trim(), at }, l));
      } else if ((m = l.text.match(/^hide\s+(.+?)(?:\s+with\s+(.+?))?$/i)) && looksLikeName(m[1]) && !/[.!?]$/.test(l.text)) {
        pos++;
        steps.push(mark({ t: 'hide', who: m[1].trim(), fx: (m[2] ?? '').trim().toLowerCase() }, l));
      } else if ((m = l.text.match(/^([^:"()]{1,40}?)\s*(?:\(([^)]+)\))?\s*:\s*(.+)$/))) {
        pos++;
        const who = m[1].trim();
        // "(sad, shake strength 4, sound laugh)": a look, a line effect and a sound, in any order.
        const parts = (m[2] ?? '').split(',').map(x => x.trim()).filter(Boolean);
        let fx: ReturnType<typeof parseLineFx> = null, sound = '';
        const looks: string[] = [];
        for (const part of parts) {
          const f: ReturnType<typeof parseLineFx> = !fx ? parseLineFx(part) : null;
          const snd = part.match(/^sound\s+(.+)$/i);
          if (f) fx = f; else if (snd && !sound) sound = snd[1].trim(); else looks.push(part);
        }
        const expr = looks.join(', ');
        const say: Step = /^narration$/i.test(who) ? { t: 'say', who: '', expr: '', text: m[3] } : { t: 'say', who, expr, text: m[3] };
        if (fx && say.who) { say.fx = fx.fx; if (Object.keys(fx.opts).length) say.fxOpts = fx.opts; }
        if (sound) say.sound = sound;
        steps.push(mark(say, l));
      } else {
        pos++;
        steps.push(mark({ t: 'say', who: '', expr: '', text: l.text }, l));
      }
    }
    return steps;
  }

  const steps = block(-1);
  tails.set(steps, rawLines.slice(consumed + 1));
  // How each line read when parsed: an edit that leaves it reading the same keeps it as written.
  const noteHeaders = (list: Step[]): void => {
    for (const st of list) {
      const src = sources.get(st);
      if (src) src.header = headerOf(st) ?? undefined;
      if (st.t === 'choice') st.options.forEach(o => { const os = sources.get(o); if (os) os.header = optionHeader(o); noteHeaders(o.steps); });
      if (st.t === 'if') { noteHeaders(st.then); noteHeaders(st.else); }
    }
  };
  if (noteSources) noteHeaders(steps);
  for (const target of jumpTargets(steps)) {
    if (!parts.has(target.toLowerCase())) {
      const n = lines.find(l => new RegExp(`^go to part\\s+${escapeRe(target)}$`, 'i').test(l.text))?.n ?? 0;
      errors.push({ n, msg: `There is no part called "${target}" in this conversation.` });
    }
  }
  return { steps, errors };
}

/** A stage command names a character: a few words, no commas, not ending like a sentence. */
function looksLikeName(who: string): boolean {
  const w = who.trim();
  return !!w && !/[,;!?]/.test(w) && !/\.$/.test(w) && w.split(/\s+/).length <= 3 && !/^(and|the|a|an|your|my|his|her|their|our|it|me|him|them|us)$/i.test(w.split(/\s+/)[0]);
}

function placeOf(text: string | undefined, n: number, errors: ScriptError[]): Placement {
  if (!text) return {};
  const at = parsePlace(text);
  if (at) return at;
  errors.push({ n, msg: `Could not read the place "${text}". Use far left, left, center, right, far right, or a number like 40%.` });
  return {};
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function jumpTargets(steps: Step[]): string[] {
  const out: string[] = [];
  walkSteps(steps, s => { if (s.t === 'jump') out.push(s.part); });
  return out;
}

/** Visits every step, including those under answers and conditions. */
export function walkSteps(steps: Step[], visit: (s: Step) => void): void {
  for (const s of steps) {
    visit(s);
    if (s.t === 'choice') s.options.forEach(o => walkSteps(o.steps, visit));
    if (s.t === 'if') { walkSteps(s.then, visit); walkSteps(s.else, visit); }
  }
}

/* ---------- Writing steps back to text ---------- */

export function valueText(v: FactValue): string {
  return v === true ? 'yes' : v === false ? 'no' : String(v);
}

export function effectText(e: Effect): string {
  if (e.op !== '=' && typeof e.value === 'number' && e.value < 0) return `${e.fact} ${e.op === '+' ? '-' : '+'} ${-e.value}`;
  return `${e.fact} ${e.op} ${valueText(e.value)}`;
}

export function conditionText(c: Condition): string {
  if (c.op === 'truthy') return c.fact;
  const word = CONDITION_WORDS.find(([, op]) => op === c.op)?.[0] ?? 'is';
  return `${c.fact} ${word} ${valueText(c.value)}`;
}

const oneLine = (s: string) => String(s).replace(/\s*\n\s*/g, ' ').trim();
const cleanName = (s: string) => oneLine(s).replace(/[:"()]/g, '').trim();

/** True when a line of narration reads back as narration and not as a command. */
function plainNarration(text: string): boolean {
  const { steps, errors } = parse(text, false);
  return !errors.length && steps.length === 1 && steps[0].t === 'say' && steps[0].who === '' && steps[0].text === text;
}

/** A step's own line, without indentation; null when the step writes no line. */
function headerOf(s: Step): string | null {
  switch (s.t) {
    case 'say': {
      const text = oneLine(s.text) || '...';
      const who = cleanName(s.who);
      const sound = s.sound ? `sound ${cleanName(s.sound).replace(/,/g, ' ')}` : '';
      const paren = [cleanName(s.expr).replace(/,/g, ' '), s.fx && who ? lineFxText(s.fx, s.fxOpts) : '', sound].filter(Boolean).join(', ');
      if (who) return `${who}${paren ? ` (${paren})` : ''}: ${text}`;
      if (sound) return `Narration (${sound}): ${text}`;
      return plainNarration(text) ? text : `Narration: ${text}`;
    }
    case 'choice': return 'Choice';
    case 'if': return `Only if ${conditionText(s.cond)}`;
    case 'change': return s.effects.length ? `Change ${s.effects.map(effectText).join(', ')}` : null;
    case 'door': return `Go to ${oneLine(s.room)}`;
    case 'jump': return `Go to part ${oneLine(s.part)}`;
    case 'end': return 'End';
    case 'part': return `Part: ${oneLine(s.name)}`;
    case 'note': return `# ${oneLine(s.text)}`;
    case 'show': {
      const where = placeText(s.at);
      return `Show ${cleanName(s.who)}${s.look ? ` as ${oneLine(s.look)}` : ''}${where ? ` at ${where}` : ''}${s.at.size !== undefined ? ` size ${s.at.size}` : ''}${s.at.flip ? ' flipped' : ''}${s.fx ? ` with ${s.fx}` : ''}`;
    }
    case 'move': {
      const where = placeText(s.at);
      const flip = s.at.flip === undefined ? '' : s.at.flip ? ' flipped' : ' unflipped';
      if (!where && s.at.size === undefined && !flip) return null;
      return `Move ${cleanName(s.who)}${where ? ` to ${where}` : ''}${s.at.size !== undefined ? ` size ${s.at.size}` : ''}${flip}`;
    }
    case 'hide': return `Hide ${cleanName(s.who)}${s.fx ? ` with ${s.fx}` : ''}`;
    case 'music': return s.track ? `Music${s.once ? ' once' : ''}: ${oneLine(s.track)}` : 'Music: off';
  }
}

function optionHeader(o: { text: string; effects: Effect[] }): string {
  const effects = o.effects.length ? `  ${o.effects.map(effectText).join(', ')}` : '';
  return `"${oneLine(o.text).replace(/["\u201c\u201d]/g, "'") || '...'}"${effects}`;
}

const indentOf = (raw: string) => (raw.match(/^[ \t]*/) ?? [''])[0];

/**
 * Writes steps as script text. Steps that came from parseScript and still read
 * the same are written exactly as the author wrote them, with the blank lines and
 * comments around them; only changed or new steps get freshly written lines, in
 * the indentation of the lines around them.
 */
export function writeScript(steps: Step[]): string {
  const out: string[] = [];
  const write = (list: Step[], pad: string): void => {
    const sibling = list.map(x => sources.get(x)).find(Boolean);
    const listPad = sibling ? indentOf(sibling.raw) : pad;
    for (const s of list) {
      const src = sources.get(s);
      if (src) out.push(...src.lead);
      const myPad = src ? indentOf(src.raw) : listPad;
      const head = headerOf(s);
      if (head !== null) out.push(src && src.header === head ? src.raw : myPad + head);
      if (s.t === 'choice') {
        const optSibling = s.options.map(o => sources.get(o)).find(Boolean);
        const optPad = optSibling ? indentOf(optSibling.raw) : `${myPad}  `;
        for (const o of s.options) {
          const os = sources.get(o);
          if (os) out.push(...os.lead);
          const oPad = os ? indentOf(os.raw) : optPad;
          const oh = optionHeader(o);
          out.push(os && os.header === oh ? os.raw : oPad + oh);
          write(o.steps, `${oPad}  `);
        }
      }
      if (s.t === 'if') {
        write(s.then, `${myPad}  `);
        if (s.else.length) {
          if (src?.elseLead) out.push(...src.elseLead);
          out.push(src?.elseRaw ?? `${myPad}Otherwise`);
          write(s.else, `${myPad}  `);
        }
      }
    }
  };
  write(steps, '');
  const tail = tails.get(steps);
  if (tail) out.push(...tail);
  return out.join('\n');
}

/* ---------- Summary ---------- */

export interface ScriptSummary {
  lines: number;
  choices: number;
  conditions: number;
  doors: number;
  /** Story facts read or changed, in order of first use. */
  facts: string[];
  /** Room names that doors point to. */
  doorTargets: string[];
  /** Named parts, in order. */
  parts: string[];
}

export function summarize(steps: Step[]): ScriptSummary {
  const c = { lines: 0, choices: 0, conditions: 0, doors: 0 };
  const facts = new Set<string>();
  const doorTargets = new Set<string>();
  const parts: string[] = [];
  walkSteps(steps, s => {
    switch (s.t) {
      case 'say': c.lines++; break;
      case 'door': c.doors++; doorTargets.add(s.room); break;
      case 'change': s.effects.forEach(e => facts.add(e.fact)); break;
      case 'choice': c.choices++; s.options.forEach(o => o.effects.forEach(e => facts.add(e.fact))); break;
      case 'if': c.conditions++; facts.add(s.cond.fact); break;
      case 'part': parts.push(s.name); break;
    }
  });
  facts.delete('_');
  return { ...c, facts: [...facts], doorTargets: [...doorTargets], parts };
}

import type { CompareOp, Condition, Effect, FactValue, ParseResult, Placement, ScriptError, Step } from './types';
import { isLineEffect, parsePlace, placeText } from './staging';

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

export function parseScript(src: string): ParseResult {
  const errors: ScriptError[] = [];
  const lines: Line[] = String(src ?? '')
    .replace(/\t/g, '  ')
    .split('\n')
    .map((raw, i) => ({ n: i + 1, indent: (raw.match(/^ */) ?? [''])[0].length, text: raw.trim() }))
    .filter(l => l.text);
  let pos = 0;
  const parts = new Set<string>();

  function block(parentIndent: number): Step[] {
    const steps: Step[] = [];
    while (pos < lines.length && lines[pos].indent > parentIndent) {
      const l = lines[pos];
      let m: RegExpMatchArray | null;

      if (l.text.startsWith('#')) {
        pos++;
        steps.push({ t: 'note', text: l.text.replace(/^#+\s*/, '') });
      } else if (/^choice$/i.test(l.text)) {
        pos++;
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
          options.push({ text: q[1], effects: q[2] ? parseEffects(q[2], o.n, errors) : [], steps: block(o.indent) });
        }
        if (options.length) steps.push({ t: 'choice', options });
        else errors.push({ n: l.n, msg: 'Choice needs at least one answer on the lines below it, indented.' });
      } else if ((m = l.text.match(/^only if\s+(.+)$/i))) {
        pos++;
        const step: Step = { t: 'if', cond: parseCondition(m[1], l.n, errors), then: block(l.indent), else: [] };
        if (pos < lines.length && lines[pos].indent === l.indent && /^otherwise$/i.test(lines[pos].text)) {
          pos++;
          step.else = block(l.indent);
        }
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
        else { parts.add(name.toLowerCase()); steps.push({ t: 'part', name }); }
      } else if (/^change\s+[\w.]+\s*[+\-=]/i.test(l.text)) {
        pos++;
        steps.push({ t: 'change', effects: parseEffects(l.text.replace(/^change\s+/i, ''), l.n, errors) });
      } else if ((m = l.text.match(/^go to part\s+(.+)$/i))) {
        pos++;
        steps.push({ t: 'jump', part: m[1].trim() });
      } else if ((m = l.text.match(/^go to\s+(.+)$/i))) {
        pos++;
        steps.push({ t: 'door', room: m[1].trim() });
      } else if (/^end$/i.test(l.text)) {
        pos++;
        steps.push({ t: 'end' });
      } else if ((m = l.text.match(/^show\s+(.+?)(?:\s+as\s+(.+?))?(?:\s+at\s+(.+?))?(?:\s+size\s+(\d+(?:\.\d+)?))?(\s+flipped)?(?:\s+with\s+(.+?))?$/i)) && looksLikeName(m[1])) {
        pos++;
        const at = placeOf(m[3], l.n, errors);
        if (m[4]) at.size = Number(m[4]);
        if (m[5]) at.flip = true;
        steps.push({ t: 'show', who: m[1].trim(), look: (m[2] ?? '').trim(), at, fx: (m[6] ?? '').trim().toLowerCase() });
      } else if ((m = l.text.match(/^move\s+(.+?)(?:\s+to\s+(.+?))?(?:\s+size\s+(\d+(?:\.\d+)?))?(\s+(?:flipped|unflipped))?$/i)) && !m[1].includes(',') && ((m[2] && parsePlace(m[2])) || (!m[2] && (m[3] || m[4])))) {
        pos++;
        const at = placeOf(m[2], l.n, errors);
        if (m[3]) at.size = Number(m[3]);
        if (m[4]) at.flip = /^\s*flipped/i.test(m[4]);
        steps.push({ t: 'move', who: m[1].trim(), at });
      } else if ((m = l.text.match(/^hide\s+(.+?)(?:\s+with\s+(.+?))?$/i)) && looksLikeName(m[1]) && !/[.!?]$/.test(l.text)) {
        pos++;
        steps.push({ t: 'hide', who: m[1].trim(), fx: (m[2] ?? '').trim().toLowerCase() });
      } else if ((m = l.text.match(/^([^:"()]{1,40}?)\s*(?:\(([^)]+)\))?\s*:\s*(.+)$/))) {
        pos++;
        const who = m[1].trim();
        // "(sad, shake)": a look and a line effect, in any order.
        const parts = (m[2] ?? '').split(',').map(x => x.trim()).filter(Boolean);
        const fx = parts.find(isLineEffect);
        const expr = parts.filter(x => x !== fx).join(', ');
        const say: Step = /^narration$/i.test(who) ? { t: 'say', who: '', expr: '', text: m[3] } : { t: 'say', who, expr, text: m[3] };
        if (fx && say.who) say.fx = fx.toLowerCase();
        steps.push(say);
      } else {
        pos++;
        steps.push({ t: 'say', who: '', expr: '', text: l.text });
      }
    }
    return steps;
  }

  const steps = block(-1);
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
  const { steps, errors } = parseScript(text);
  return !errors.length && steps.length === 1 && steps[0].t === 'say' && steps[0].who === '' && steps[0].text === text;
}

export function writeScript(steps: Step[]): string {
  const out: string[] = [];
  const write = (list: Step[], depth: number): void => {
    const pad = '  '.repeat(depth);
    for (const s of list) {
      switch (s.t) {
        case 'say': {
          const text = oneLine(s.text) || '...';
          const who = cleanName(s.who);
          const paren = [cleanName(s.expr).replace(/,/g, ' '), s.fx ?? ''].filter(Boolean).join(', ');
          if (who) out.push(`${pad}${who}${paren ? ` (${paren})` : ''}: ${text}`);
          else out.push(pad + (plainNarration(text) ? text : `Narration: ${text}`));
          break;
        }
        case 'choice':
          out.push(`${pad}Choice`);
          for (const o of s.options) {
            const effects = o.effects.length ? `  ${o.effects.map(effectText).join(', ')}` : '';
            out.push(`${pad}  "${oneLine(o.text).replace(/["“”]/g, "'") || '...'}"${effects}`);
            write(o.steps, depth + 2);
          }
          break;
        case 'if':
          out.push(`${pad}Only if ${conditionText(s.cond)}`);
          write(s.then, depth + 1);
          if (s.else.length) { out.push(`${pad}Otherwise`); write(s.else, depth + 1); }
          break;
        case 'change': if (s.effects.length) out.push(`${pad}Change ${s.effects.map(effectText).join(', ')}`); break;
        case 'door': out.push(`${pad}Go to ${oneLine(s.room)}`); break;
        case 'jump': out.push(`${pad}Go to part ${oneLine(s.part)}`); break;
        case 'end': out.push(`${pad}End`); break;
        case 'part': out.push(`${pad}Part: ${oneLine(s.name)}`); break;
        case 'note': out.push(`${pad}# ${oneLine(s.text)}`); break;
        case 'show': {
          const where = placeText(s.at);
          out.push(`${pad}Show ${cleanName(s.who)}${s.look ? ` as ${oneLine(s.look)}` : ''}${where ? ` at ${where}` : ''}${s.at.size !== undefined ? ` size ${s.at.size}` : ''}${s.at.flip ? ' flipped' : ''}${s.fx ? ` with ${s.fx}` : ''}`);
          break;
        }
        case 'move': {
          const where = placeText(s.at);
          const flip = s.at.flip === undefined ? '' : s.at.flip ? ' flipped' : ' unflipped';
          const line = `${pad}Move ${cleanName(s.who)}${where ? ` to ${where}` : ''}${s.at.size !== undefined ? ` size ${s.at.size}` : ''}${flip}`;
          if (where || s.at.size !== undefined || flip) out.push(line);
          break;
        }
        case 'hide': out.push(`${pad}Hide ${cleanName(s.who)}${s.fx ? ` with ${s.fx}` : ''}`); break;
      }
    }
  };
  write(steps, 0);
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

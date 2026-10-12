import type { CompareOp, Condition, Effect, FactValue, ParseResult, ScriptError, Step } from './types';

/**
 * Writing mode: turns a conversation written like a script into steps.
 *
 *   Mara: You came back.
 *   Choice
 *     "I missed this place."  affection + 8
 *       Mara (smiling): So did I.
 *   Only if affection is at least 5
 *     Mara: Stay a while.
 *   Otherwise
 *     Go to Street, night
 *
 * Indentation (two spaces, or a tab) puts lines under a choice answer or a condition.
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

const WORD_OPS: [string, CompareOp][] = [
  ['is at least', '>='], ['is at most', '<='], ['is more than', '>'], ['is less than', '<'], ['is not', '!='], ['is', '=']
];

function parseCondition(text: string, n: number, errors: ScriptError[]): Condition {
  const lower = text.toLowerCase();
  for (const [word, op] of WORD_OPS) {
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
    .filter(l => l.text && !l.text.startsWith('#'));
  let pos = 0;

  function block(parentIndent: number): Step[] {
    const steps: Step[] = [];
    while (pos < lines.length && lines[pos].indent > parentIndent) {
      const l = lines[pos];
      let m: RegExpMatchArray | null;

      if (/^choice$/i.test(l.text)) {
        pos++;
        const options = [];
        while (pos < lines.length && lines[pos].indent > l.indent) {
          const o = lines[pos];
          const q = o.text.match(/^["“](.+?)["”]\s*(.*)$/);
          pos++;
          if (!q) {
            errors.push({ n: o.n, msg: 'An answer under Choice starts with quotes, like "Yes, I will."' });
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
      } else if ((m = l.text.match(/^change\s+(.+)$/i))) {
        pos++;
        steps.push({ t: 'change', effects: parseEffects(m[1], l.n, errors) });
      } else if ((m = l.text.match(/^go to\s+(.+)$/i))) {
        pos++;
        steps.push({ t: 'door', room: m[1].trim() });
      } else if (/^end$/i.test(l.text)) {
        pos++;
        steps.push({ t: 'end' });
      } else if ((m = l.text.match(/^([^:"()]{1,40}?)\s*(?:\(([^)]+)\))?\s*:\s*(.+)$/))) {
        pos++;
        steps.push({ t: 'say', who: m[1].trim(), expr: (m[2] ?? '').trim(), text: m[3] });
      } else {
        pos++;
        steps.push({ t: 'say', who: '', expr: '', text: l.text });
      }
    }
    return steps;
  }

  return { steps: block(-1), errors };
}

export interface ScriptSummary {
  lines: number;
  choices: number;
  conditions: number;
  doors: number;
  /** Story facts read or changed, in order of first use. */
  facts: string[];
  /** Room names that doors point to. */
  doorTargets: string[];
}

export function summarize(steps: Step[]): ScriptSummary {
  const c = { lines: 0, choices: 0, conditions: 0, doors: 0 };
  const facts = new Set<string>();
  const doorTargets = new Set<string>();
  const walk = (list: Step[]): void => {
    for (const s of list) {
      switch (s.t) {
        case 'say': c.lines++; break;
        case 'door': c.doors++; doorTargets.add(s.room); break;
        case 'change': s.effects.forEach(e => facts.add(e.fact)); break;
        case 'choice':
          c.choices++;
          s.options.forEach(o => { o.effects.forEach(e => facts.add(e.fact)); walk(o.steps); });
          break;
        case 'if': c.conditions++; facts.add(s.cond.fact); walk(s.then); walk(s.else); break;
      }
    }
  };
  walk(steps);
  facts.delete('_');
  return { ...c, facts: [...facts], doorTargets: [...doorTargets] };
}

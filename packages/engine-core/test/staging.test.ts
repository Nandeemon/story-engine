import { describe, expect, it } from 'vitest';
import { createRunner, parsePlace, parseScript, placeText, snapToSpot, stepsBefore, writeScript } from '../src';

const SCENE = `Show Lin as happy at left with fade
Lin (sad, shake): I thought you forgot.
Move Lin to center size 70 flipped
Choice
  "Stay"
    Show Jon at 80% 95% with slide from right
    Jon: Hi.
  "Go"
    Hide Lin with slide to left
Lin: Still here.`;

describe('stage steps', () => {
  it('reads show, move, hide and line effects', () => {
    const { steps, errors } = parseScript(SCENE);
    expect(errors).toEqual([]);
    expect(steps[0]).toEqual({ t: 'show', who: 'Lin', look: 'happy', at: { x: 30 }, fx: 'fade' });
    expect(steps[1]).toEqual({ t: 'say', who: 'Lin', expr: 'sad', text: 'I thought you forgot.', fx: 'shake' });
    expect(steps[2]).toEqual({ t: 'move', who: 'Lin', at: { x: 50, size: 70, flip: true } });
  });

  it('writes them back so they read the same', () => {
    const steps = parseScript(SCENE).steps;
    const text = writeScript(steps);
    expect(parseScript(text)).toEqual({ steps, errors: [] });
    expect(text.split('\n')[0]).toBe('Show Lin as happy at left with fade');
  });

  it('keeps narration that only starts like a command', () => {
    const { steps } = parseScript('Move along, nothing to see.\nHide and seek was her favourite game.\nShow your ticket, please.\nHide the gun.\nHide Lin');
    expect(steps.map(s => s.t)).toEqual(['say', 'say', 'say', 'say', 'hide']);
  });

  it('reports a place it cannot read', () => {
    expect(parseScript('Show Lin at the window').errors[0].msg).toContain('far left');
  });

  it('tells the player about stage steps as they pass', () => {
    const seen: string[] = [];
    const runner = createRunner(parseScript(SCENE).steps, {}, s => seen.push(s.t === 'music' ? `music ${s.track}` : `${s.t} ${s.who}`));
    const ev = runner.next();
    expect(ev).toMatchObject({ t: 'say', fx: 'shake' });
    expect(seen).toEqual(['show Lin']);
  });
});

describe('places', () => {
  it('reads and writes spots and numbers', () => {
    expect(parsePlace('Far Left')).toEqual({ x: 15 });
    expect(parsePlace('42%')).toEqual({ x: 42 });
    expect(parsePlace('42.5% 90%')).toEqual({ x: 42.5, y: 90 });
    expect(parsePlace('window')).toBeNull();
    expect(placeText({ x: 70 })).toBe('right');
    expect(placeText({ x: 70, y: 90 })).toBe('70% 90%');
    expect(snapToSpot(31.5)).toBe(30);
    expect(snapToSpot(40)).toBe(40);
  });
});

describe('stepsBefore', () => {
  it('follows the branch to a line and skips other branches', () => {
    const steps = parseScript(SCENE).steps;
    expect(stepsBefore(steps, '3.o0.1').map(s => s.t)).toEqual(['show', 'say', 'move', 'show']);
    expect(stepsBefore(steps, '4').map(s => s.t)).toEqual(['show', 'say', 'move', 'choice']);
  });
});

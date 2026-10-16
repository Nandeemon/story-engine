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
    const runner = createRunner(parseScript(SCENE).steps, {}, s => seen.push(s.t === 'music' ? `music ${s.track}` : s.t === 'camera' || s.t === 'sound' ? s.t : `${s.t} ${s.who}`));
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

describe('drawn paths', async () => {
  const { parseScript, writeScript, pathAt, simplifyPath } = await import('../src');
  it('reads and writes a path with checkpoints', () => {
    const src = 'Path Mara over 4s back and forth steady: 30 98, 50 90 size 60 shake, 70 98 flip fade 40 as happy';
    const { steps, errors } = parseScript(src);
    expect(errors).toEqual([]);
    expect(steps[0]).toEqual({ t: 'path', who: 'Mara', secs: 4, repeat: 'pingpong', ease: 'steady', points: [{ x: 30, y: 98 }, { x: 50, y: 90, size: 60, fx: 'shake' }, { x: 70, y: 98, flip: true, fade: 40, look: 'happy' }] });
    expect(writeScript(steps)).toBe(src);
  });
  it('moves along the path at the right time', () => {
    const pts = [{ x: 0, y: 50 }, { x: 100, y: 50, size: 80 }];
    const mid = pathAt(pts, 2, undefined, 'steady', 40, 1);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.size).toBeCloseTo(60);
    expect(pathAt(pts, 2, undefined, 'steady', 40, 5)).toMatchObject({ x: 100, done: true });
    expect(pathAt(pts, 2, 'pingpong', 'steady', 40, 3).x).toBeCloseTo(50);
  });
  it('simplifies a drawn line', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 50 }));
    expect(simplifyPath(line)).toEqual([{ x: 0, y: 50 }, { x: 49, y: 50 }]);
  });
});

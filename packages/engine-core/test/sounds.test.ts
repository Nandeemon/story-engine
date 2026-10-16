import { describe, expect, it } from 'vitest';
import { createRunner, parseScript, writeScript } from '../src';
import type { Step } from '../src';

describe('sounds in a conversation', () => {
  it('reads and writes sound steps', () => {
    const text = `Sound: door creak
Sound: rain (loops)
Mara: Listen.
Stop sound: rain
Stop sounds
Stop sounds and music`;
    const { steps, errors } = parseScript(text);
    expect(errors).toEqual([]);
    expect(steps).toEqual([
      { t: 'sound', name: 'door creak' },
      { t: 'sound', name: 'rain', loop: true },
      { t: 'say', who: 'Mara', expr: '', text: 'Listen.' },
      { t: 'sound', name: 'rain', stop: true },
      { t: 'sound', name: '', stop: true },
      { t: 'sound', name: '', stop: true, music: true }
    ]);
    const fresh: Step[] = JSON.parse(JSON.stringify(steps));
    expect(writeScript(fresh)).toBe(text);
  });

  it('plays a line sound at the end when asked', () => {
    const { steps } = parseScript('Mara (sound laugh at the end): Ha.\nNarration (sound bell at the end): Ding.');
    expect(steps[0]).toMatchObject({ sound: 'laugh', soundAtEnd: true });
    expect(steps[1]).toMatchObject({ who: '', sound: 'bell', soundAtEnd: true });
    const fresh: Step[] = JSON.parse(JSON.stringify(steps));
    expect(writeScript(fresh)).toBe('Mara (sound laugh at the end): Ha.\nNarration (sound bell at the end): Ding.');
  });

  it('passes sound steps to the player as they come', () => {
    const seen: string[] = [];
    const runner = createRunner(parseScript('Sound: bell\nMara: Hi.\nStop sounds').steps, {}, s => seen.push(s.t === 'sound' ? `${s.stop ? 'stop' : 'play'} ${s.name}` : s.t));
    expect(runner.next()).toMatchObject({ t: 'say' });
    expect(seen).toEqual(['play bell']);
    runner.next();
    expect(seen).toEqual(['play bell', 'stop ']);
  });
});

describe('renaming a sound', () => {
  it('follows the sound into steps and end-of-line sounds', async () => {
    const { renameSoundInScript } = await import('../src');
    const text = 'Sound: rain (loops)\nMara (sad, sound rain at the end): Wet.\nStop sound: rain\nSound: rainbow';
    expect(renameSoundInScript(text, 'rain', 'storm')).toBe('Sound: storm (loops)\nMara (sad, sound storm at the end): Wet.\nStop sound: storm\nSound: rainbow');
  });
});

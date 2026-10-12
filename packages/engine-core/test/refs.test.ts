import { describe, expect, it } from 'vitest';
import { renameRoomInScript, renameSpeakerInScript } from '../src';

const SCRIPT = `# Mara walks out
Mara (smiling): See you on the street.
Choice
  "Follow her"

    Go to Street, night
  "Stay"
    Go to part Street, night
    Narration: Go to street, night is what the sign says.
Marabel: Not me.`;

describe('renameRoomInScript', () => {
  it('updates doors and leaves everything else as written', () => {
    const out = renameRoomInScript(SCRIPT, 'street, NIGHT', 'Harbour');
    expect(out).toBe(SCRIPT.replace('    Go to Street, night\n', '    Go to Harbour\n'));
    expect(out).toContain('Go to part Street, night');
    expect(out).toContain('\n\n');
  });

  it('does nothing for an empty or unchanged name', () => {
    expect(renameRoomInScript(SCRIPT, 'Street, night', '  ')).toBe(SCRIPT);
    expect(renameRoomInScript(SCRIPT, 'Street, night', 'street, night')).toBe(SCRIPT);
  });
});

describe('renameSpeakerInScript', () => {
  it('renames the speaker and keeps the expression', () => {
    const out = renameSpeakerInScript(SCRIPT, 'Mara', 'Mira');
    expect(out).toContain('Mira (smiling): See you on the street.');
    expect(out).toContain('Marabel: Not me.');
    expect(out).toContain('# Mara walks out');
  });

  it('refuses names that are commands', () => {
    expect(renameSpeakerInScript('Part: A', 'Part', 'Bob')).toBe('Part: A');
    expect(renameSpeakerInScript('Mara: hi', 'Mara', 'Narration')).toBe('Mara: hi');
  });
});

describe('renameLookInScript', () => {
  it('renames the look on that speaker\'s lines only', async () => {
    const { renameLookInScript } = await import('../src');
    const src = 'Lin (happy): Hi.\n  Lin (Happy, shake): Hey!\nMara (happy): Hello.\nLin: Plain.';
    expect(renameLookInScript(src, 'lin', 'happy', 'glad')).toBe('Lin (glad): Hi.\n  Lin (glad, shake): Hey!\nMara (happy): Hello.\nLin: Plain.');
  });
});

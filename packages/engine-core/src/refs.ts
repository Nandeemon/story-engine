/**
 * Keeping links intact when something is renamed. These work on the script text
 * line by line, so the author's own layout, notes and blank lines are left alone.
 */

const lower = (s: string) => s.trim().toLowerCase();

/** Words that start a command line; a speaker with one of these names cannot be renamed safely. */
const RESERVED = new Set(['part', 'narration', 'choice', 'otherwise', 'end']);

/** Points every "Go to <old room>" at the new room name. */
export function renameRoomInScript(script: string, oldName: string, newName: string): string {
  const from = lower(oldName);
  const to = newName.trim();
  if (!from || !to || from === lower(to)) return script;
  return script.split('\n').map(line => {
    const m = line.match(/^(\s*)go to\s+(.+?)\s*$/i);
    if (!m || /^part\s/i.test(m[2]) || lower(m[2]) !== from) return line;
    return `${m[1]}Go to ${to}`;
  }).join('\n');
}

/** Gives every line spoken by the old name to the new name, keeping expressions. */
export function renameSpeakerInScript(script: string, oldName: string, newName: string): string {
  const from = lower(oldName);
  const to = newName.trim().replace(/[:"()]/g, '');
  if (!from || !to || from === lower(to) || RESERVED.has(from) || RESERVED.has(lower(to))) return script;
  return script.split('\n').map(line => {
    const m = line.match(/^(\s*)([^:"()#]{1,40}?)(\s*(?:\([^)]*\))?\s*:.*)$/);
    if (!m || lower(m[2]) !== from) return line;
    return `${m[1]}${to}${m[3]}`;
  }).join('\n');
}

/** Points every line where the speaker shows the old look at the new look name. */
export function renameLookInScript(script: string, speaker: string, oldLook: string, newLook: string): string {
  const who = lower(speaker), from = lower(oldLook), to = newLook.trim();
  if (!who || !from || !to || from === lower(to)) return script;
  return script.split('\n').map(line => {
    const m = line.match(/^(\s*)([^:"()#]{1,40}?)(\s*\()([^)]*)(\)\s*:.*)$/);
    if (!m || lower(m[2]) !== who) return line;
    const parts = m[4].split(',');
    if (lower(parts[0]) !== from) return line;
    parts[0] = parts[0].replace(/\S.*\S|\S/, to);
    return `${m[1]}${m[2]}${m[3]}${parts.join(',')}${m[5]}`;
  }).join('\n');
}

/** Points every "(sound <old>)" on a line at the new sound name; an empty new name takes the sound off. */
export function renameSoundInScript(script: string, oldName: string, newName: string): string {
  const from = lower(oldName), to = newName.trim().replace(/[():,"]/g, ' ').trim();
  if (!from || from === lower(to)) return script;
  return script.split('\n').map(line => {
    const m = line.match(/^(\s*[^:"()#]{1,40}?\s*\()([^)]*)(\)\s*:.*)$/);
    if (!m) return line;
    const parts = m[2].split(',');
    const i = parts.findIndex(p => { const s = p.trim().match(/^sound\s+(.+)$/i); return !!s && lower(s[1]) === from; });
    if (i < 0) return line;
    if (to) parts[i] = parts[i].replace(/sound\s+.+/i, `sound ${to}`);
    else parts.splice(i, 1);
    const inner = parts.join(',').trim();
    return inner ? `${m[1]}${parts.join(',').replace(/^\s+/, '')}${m[3]}` : `${m[1].replace(/\s*\($/, '')}${m[3].replace(/^\)/, '')}`;
  }).join('\n');
}

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

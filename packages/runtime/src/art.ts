/**
 * Starter art and game themes. Placeholders drawn as SVG so a first story can be
 * made before the author has images of their own.
 */

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface Preset { name: string; svg: string }

export const BACKDROPS: Record<string, Preset> = {
  cafe: { name: 'Café, dusk', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="dsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a63"/><stop offset=".55" stop-color="#c8577a"/><stop offset="1" stop-color="#f6b26b"/></linearGradient></defs><rect width="320" height="180" fill="#4a2f45"/><rect x="26" y="20" width="268" height="96" rx="4" fill="url(#dsk)"/><path d="M26 96 l40 -22 30 14 44 -30 50 26 40 -18 64 30 v20 H26z" fill="#2c2148" opacity=".7"/><g stroke="#35202f" stroke-width="5"><path d="M115 20v96M205 20v96"/></g><rect x="20" y="14" width="280" height="108" rx="6" fill="none" stroke="#35202f" stroke-width="7"/><rect y="132" width="320" height="48" fill="#2b1b28"/><rect y="124" width="320" height="10" fill="#6a4350"/><g fill="#f9d58a"><circle cx="70" cy="6" r="7"/><circle cx="160" cy="6" r="7"/><circle cx="250" cy="6" r="7"/></g><g fill="#f9d58a" opacity=".13"><path d="M70 6 40 124h60z"/><path d="M160 6 130 124h60z"/><path d="M250 6 220 124h60z"/></g></svg>` },
  street: { name: 'Street, night', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="#101a3a"/><g fill="#e9ecff"><circle cx="40" cy="22" r="1"/><circle cx="96" cy="12" r="1.2"/><circle cx="150" cy="30" r=".9"/><circle cx="214" cy="16" r="1.1"/><circle cx="290" cy="28" r="1"/></g><circle cx="262" cy="34" r="13" fill="#f3efd6"/><path d="M0 60h50v-18h44v30h36V34h58v40h40V52h52v-14h40v102H0z" fill="#1b2752"/><g fill="#f6c453"><rect x="10" y="72" width="9" height="12"/><rect x="30" y="94" width="9" height="12"/><rect x="62" y="54" width="9" height="12"/><rect x="140" y="48" width="10" height="13"/><rect x="164" y="76" width="10" height="13"/><rect x="238" y="66" width="9" height="12"/><rect x="286" y="52" width="9" height="12"/><rect x="286" y="90" width="9" height="12"/></g><rect y="138" width="320" height="42" fill="#0b1026"/><rect y="134" width="320" height="6" fill="#2c3a6e"/><rect x="204" y="62" width="4" height="76" fill="#0b1026"/><circle cx="206" cy="58" r="7" fill="#ffe7a3"/><path d="M206 58 168 138h76z" fill="#ffe7a3" opacity=".12"/></svg>` },
  room: { name: 'Room, morning', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="#dfe6da"/><rect x="186" y="22" width="96" height="74" fill="#bfe3f2"/><path d="M186 78q24 -18 48 -4t48 -10v32h-96z" fill="#8fc49a"/><circle cx="258" cy="42" r="10" fill="#fff6c9"/><g stroke="#f4f1e6" stroke-width="5" fill="none"><rect x="186" y="22" width="96" height="74"/><path d="M234 22v74"/></g><path d="M282 22 320 60v120H180z" fill="#fff6c9" opacity=".18"/><rect y="128" width="320" height="52" fill="#b98f6c"/><rect y="124" width="320" height="5" fill="#f4f1e6"/><rect x="22" y="96" width="120" height="40" rx="5" fill="#6f8fb8"/><rect x="18" y="84" width="34" height="22" rx="6" fill="#f4f1e6"/><rect x="14" y="74" width="8" height="66" fill="#7a5a43"/><ellipse cx="210" cy="156" rx="58" ry="11" fill="#c8566b" opacity=".8"/></svg>` }
};

export interface CharacterArt { name: string; body: string; skin: string; hair: string; long: boolean }

export const CHARACTERS: Record<string, CharacterArt> = {
  mara: { name: 'Mara', body: '#7b2d5b', skin: '#f0c9a8', hair: '#2a1c2e', long: true },
  jon: { name: 'Jon', body: '#1f6f78', skin: '#c99872', hair: '#4a3020', long: false },
  ines: { name: 'Ines', body: '#d59a1c', skin: '#f5d7c0', hair: '#a2381f', long: true }
};

export const EXPRESSIONS = ['neutral', 'smiling', 'sad', 'angry', 'surprised'] as const;

const EXPR_ALIASES: Record<string, string> = { smiling: 'smile', smile: 'smile', happy: 'smile', sad: 'sad', angry: 'angry', surprised: 'surprised', neutral: 'neutral' };

export function characterSVG(c: CharacterArt, expr?: string): string {
  const e = EXPR_ALIASES[String(expr ?? '').toLowerCase()] ?? 'neutral';
  const mouth: Record<string, string> = {
    neutral: '<path d="M52 67h16"/>',
    smile: '<path d="M49 63q11 10 22 0"/>',
    sad: '<path d="M50 70q10 -8 20 0"/>',
    angry: '<path d="M52 69h16"/>',
    surprised: '<circle cx="60" cy="68" r="4.5" fill="#3a1f2b" stroke="none"/>'
  };
  const brows = e === 'angry' ? '<path d="M41 40l13 5M79 40l-13 5"/>' : e === 'sad' ? '<path d="M42 43l11 -4M78 43l-11 -4"/>' : '';
  const back = c.long ? `<path d="M22 56a38 38 0 0 1 76 0v70H22z" fill="${c.hair}"/>` : '';
  const fringe = c.long ? 'q-30 -20 -66 0z' : 'q-33 -12 -66 0z';
  return `<svg viewBox="0 0 120 300" role="img" aria-label="${esc(c.name)}">${back}<path d="M60 96C20 100 12 150 8 300h104C108 150 100 100 60 96z" fill="${c.body}"/><rect x="51" y="76" width="18" height="26" rx="6" fill="${c.skin}"/><circle cx="60" cy="52" r="32" fill="${c.skin}"/><path d="M27 48a33 33 0 0 1 66 0${fringe}" fill="${c.hair}"/><g fill="#3a1f2b"><circle cx="48" cy="52" r="3.2"/><circle cx="72" cy="52" r="3.2"/></g><g fill="none" stroke="#3a1f2b" stroke-width="3" stroke-linecap="round">${mouth[e]}${brows}</g></svg>`;
}

export const OBJECTS: Record<string, Preset> = {
  cup: { name: 'Coffee cup', svg: `<svg viewBox="0 0 100 100" role="img" aria-label="Coffee cup"><path d="M18 34h52v30a22 22 0 0 1-22 22h-8a22 22 0 0 1-22-22z" fill="#f4efe6"/><path d="M70 42h8a11 11 0 0 1 0 22h-8" fill="none" stroke="#f4efe6" stroke-width="7"/><rect x="18" y="34" width="52" height="8" fill="#5a3a2a"/><path d="M34 26q-6 -8 0 -16M52 26q-6 -8 0 -16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>` },
  key: { name: 'Brass key', svg: `<svg viewBox="0 0 100 100" role="img" aria-label="Brass key"><circle cx="30" cy="50" r="18" fill="none" stroke="#d9a53a" stroke-width="9"/><path d="M48 50h42M74 50v14M88 50v10" stroke="#d9a53a" stroke-width="9" stroke-linecap="round"/></svg>` },
  letter: { name: 'Letter', svg: `<svg viewBox="0 0 100 100" role="img" aria-label="Letter"><rect x="10" y="24" width="80" height="54" rx="4" fill="#f6efdc"/><path d="M10 28l40 28 40 -28" fill="none" stroke="#b9a988" stroke-width="4"/><circle cx="50" cy="60" r="8" fill="#b3261e"/></svg>` }
};

export interface GameTheme { name: string; box: string; fg: string; accent: string; on: string }

export const THEMES: Record<string, GameTheme> = {
  velvet: { name: 'Velvet', box: 'rgba(44,22,54,.92)', fg: '#F6EBDD', accent: '#E9B949', on: '#2C1636' },
  paper: { name: 'Paper', box: 'rgba(250,246,236,.96)', fg: '#2A2420', accent: '#C2412D', on: '#FFFFFF' },
  neon: { name: 'Neon', box: 'rgba(10,14,24,.9)', fg: '#E6F7FF', accent: '#4DE2E8', on: '#06222A' }
};

/** Font stacks use single quotes so they can sit inside a style attribute. */
export const FONTS: Record<string, string> = {
  Lora: "'Lora',Georgia,serif",
  Figtree: "'Figtree',system-ui,sans-serif",
  'Courier Prime': "'Courier Prime','Courier New',monospace",
  'Bricolage Grotesque': "'Bricolage Grotesque','Trebuchet MS',sans-serif"
};

/**
 * Starter art and game themes. Placeholders drawn as SVG so a first story can be
 * made before the author has images of their own.
 */

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface Preset { name: string; svg: string }

/** The family living room; the party look adds decorations on top. */
const livingRoom = (party: boolean) => `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="${party ? '#f6dcc4' : '#f3e3cc'}"/><rect y="104" width="320" height="30" fill="#e8d1b0"/><rect y="132" width="320" height="48" fill="#c08a5a"/><g stroke="#a87448" stroke-width="1"><path d="M0 146h320M0 162h320M60 132v14M150 146v16M240 132v14M100 162v18M280 162v18"/></g><path d="M0 40h8v92H0z" fill="#9b6b44"/><g fill="#b98057"><rect y="120" width="30" height="12"/><rect y="108" width="24" height="12"/><rect y="96" width="18" height="12"/><rect y="84" width="12" height="12"/></g><path d="M30 126 4 70" stroke="#7a5236" stroke-width="3"/><rect x="36" y="24" width="62" height="108" fill="#fff"/><rect x="40" y="28" width="26" height="102" fill="#cdeefa"/><rect x="70" y="28" width="24" height="102" fill="#cdeefa"/><path d="M40 98q14 -12 26 -2v34H40zM70 94q12 -12 24 0v36H70z" fill="#7cc46f"/><g fill="#ff9ab3"><circle cx="48" cy="104" r="2.5"/><circle cx="82" cy="100" r="2.5"/></g><rect x="150" y="38" width="52" height="34" rx="2" fill="#fff" stroke="#8a5a3a" stroke-width="3"/><path d="M153 69h46" stroke="#9fd18b" stroke-width="5"/><circle cx="160" cy="56" r="4" fill="#6b3a2a"/><circle cx="170" cy="54" r="4.5" fill="#2b2b33"/><circle cx="180" cy="57" r="3.6" fill="#1d1a2e"/><circle cx="188" cy="58" r="3.4" fill="#7657c9"/><circle cx="195" cy="59" r="3.2" fill="#e8875a"/><ellipse cx="160" cy="160" rx="72" ry="12" fill="#e8a0a8" opacity=".7"/><rect x="104" y="92" width="102" height="28" rx="10" fill="#5a7fb8"/><rect x="100" y="112" width="110" height="22" rx="8" fill="#6f95cc"/><rect x="96" y="104" width="16" height="32" rx="7" fill="#4f71a8"/><rect x="198" y="104" width="16" height="32" rx="7" fill="#4f71a8"/><rect x="118" y="100" width="22" height="16" rx="5" fill="#f2c14e"/><rect x="170" y="100" width="22" height="16" rx="5" fill="#ff8aa0"/><g fill="#4a3424"><rect x="104" y="134" width="5" height="5"/><rect x="201" y="134" width="5" height="5"/></g><rect x="221" y="70" width="3" height="62" fill="#5a4a3a"/><path d="M212 70h20l-5 -16h-10z" fill="#ffe7a3"/><rect x="234" y="112" width="52" height="22" rx="3" fill="#8a5a3a"/><rect x="238" y="70" width="44" height="34" rx="3" fill="#222533"/><rect x="241" y="73" width="38" height="28" fill="${party ? '#6a4a8a' : '#3a4a6a'}"/><rect x="256" y="104" width="8" height="8" fill="#222533"/><rect x="284" y="44" width="34" height="90" fill="#fff"/><rect x="287" y="47" width="28" height="86" fill="#d9a066"/><rect x="292" y="56" width="18" height="8" rx="2" fill="#fff"/><circle cx="309" cy="92" r="2.2" fill="#8a5a3a"/><rect x="2" y="152" width="40" height="20" rx="2" fill="#8a5a3a"/><rect x="6" y="147" width="10" height="5" rx="2" fill="#e04a4a"/><rect x="19" y="147" width="10" height="5" rx="2" fill="#3d6e9e"/><rect x="31" y="147" width="9" height="5" rx="2" fill="#f2c14e"/>${party ? `<rect width="320" height="180" fill="#ffb36b" opacity=".1"/><path d="M0 10q40 22 80 0t80 0 80 0 80 0" fill="none" stroke="#ff8aa0" stroke-width="2"/><g fill="#f2c14e"><path d="M18 16l6 10 6 -10z"/><path d="M98 16l6 10 6 -10z"/><path d="M178 16l6 10 6 -10z"/><path d="M258 16l6 10 6 -10z"/></g><g fill="#7cc8f0"><path d="M58 16l6 10 6 -10z"/><path d="M138 16l6 10 6 -10z"/><path d="M218 16l6 10 6 -10z"/><path d="M298 16l6 10 6 -10z"/></g><rect x="104" y="76" width="112" height="14" rx="3" fill="#fff6c9" stroke="#e0a800" stroke-width="1.5"/><text x="160" y="86.3" text-anchor="middle" font-family="Trebuchet MS,sans-serif" font-size="8.5" font-weight="700" fill="#c2185b">HAPPY BIRTHDAY MUM</text><g stroke="#8a7a6a" stroke-width=".8" fill="none"><path d="M24 74q-4 30 2 60M36 70q4 30 -2 64M296 74q4 30 -2 60M284 70q-4 30 2 64"/></g><ellipse cx="24" cy="62" rx="10" ry="12" fill="#ff5c8a"/><ellipse cx="38" cy="58" rx="10" ry="12" fill="#f2c14e"/><ellipse cx="296" cy="62" rx="10" ry="12" fill="#7cc8f0"/><ellipse cx="282" cy="58" rx="10" ry="12" fill="#a98bf0"/><g fill="#fff" opacity=".6"><ellipse cx="21" cy="57" rx="2.5" ry="4"/><ellipse cx="35" cy="53" rx="2.5" ry="4"/><ellipse cx="293" cy="57" rx="2.5" ry="4"/><ellipse cx="279" cy="53" rx="2.5" ry="4"/></g><g fill="#ff5c8a"><circle cx="70" cy="150" r="1.6"/><circle cx="130" cy="170" r="1.6"/><circle cx="250" cy="154" r="1.6"/></g><g fill="#7cc8f0"><circle cx="96" cy="166" r="1.6"/><circle cx="210" cy="168" r="1.6"/></g><g fill="#f2c14e"><circle cx="180" cy="150" r="1.6"/><circle cx="270" cy="172" r="1.6"/></g>` : ''}</svg>`;

export const BACKDROPS: Record<string, Preset> = {
  cafe: { name: 'Café, dusk', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="dsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a63"/><stop offset=".55" stop-color="#c8577a"/><stop offset="1" stop-color="#f6b26b"/></linearGradient></defs><rect width="320" height="180" fill="#4a2f45"/><rect x="26" y="20" width="268" height="96" rx="4" fill="url(#dsk)"/><path d="M26 96 l40 -22 30 14 44 -30 50 26 40 -18 64 30 v20 H26z" fill="#2c2148" opacity=".7"/><g stroke="#35202f" stroke-width="5"><path d="M115 20v96M205 20v96"/></g><rect x="20" y="14" width="280" height="108" rx="6" fill="none" stroke="#35202f" stroke-width="7"/><rect y="132" width="320" height="48" fill="#2b1b28"/><rect y="124" width="320" height="10" fill="#6a4350"/><g fill="#f9d58a"><circle cx="70" cy="6" r="7"/><circle cx="160" cy="6" r="7"/><circle cx="250" cy="6" r="7"/></g><g fill="#f9d58a" opacity=".13"><path d="M70 6 40 124h60z"/><path d="M160 6 130 124h60z"/><path d="M250 6 220 124h60z"/></g></svg>` },
  street: { name: 'Street, night', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="#101a3a"/><g fill="#e9ecff"><circle cx="40" cy="22" r="1"/><circle cx="96" cy="12" r="1.2"/><circle cx="150" cy="30" r=".9"/><circle cx="214" cy="16" r="1.1"/><circle cx="290" cy="28" r="1"/></g><circle cx="262" cy="34" r="13" fill="#f3efd6"/><path d="M0 60h50v-18h44v30h36V34h58v40h40V52h52v-14h40v102H0z" fill="#1b2752"/><g fill="#f6c453"><rect x="10" y="72" width="9" height="12"/><rect x="30" y="94" width="9" height="12"/><rect x="62" y="54" width="9" height="12"/><rect x="140" y="48" width="10" height="13"/><rect x="164" y="76" width="10" height="13"/><rect x="238" y="66" width="9" height="12"/><rect x="286" y="52" width="9" height="12"/><rect x="286" y="90" width="9" height="12"/></g><rect y="138" width="320" height="42" fill="#0b1026"/><rect y="134" width="320" height="6" fill="#2c3a6e"/><rect x="204" y="62" width="4" height="76" fill="#0b1026"/><circle cx="206" cy="58" r="7" fill="#ffe7a3"/><path d="M206 58 168 138h76z" fill="#ffe7a3" opacity=".12"/></svg>` },
  room: { name: 'Room, morning', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="#dfe6da"/><rect x="186" y="22" width="96" height="74" fill="#bfe3f2"/><path d="M186 78q24 -18 48 -4t48 -10v32h-96z" fill="#8fc49a"/><circle cx="258" cy="42" r="10" fill="#fff6c9"/><g stroke="#f4f1e6" stroke-width="5" fill="none"><rect x="186" y="22" width="96" height="74"/><path d="M234 22v74"/></g><path d="M282 22 320 60v120H180z" fill="#fff6c9" opacity=".18"/><rect y="128" width="320" height="52" fill="#b98f6c"/><rect y="124" width="320" height="5" fill="#f4f1e6"/><rect x="22" y="96" width="120" height="40" rx="5" fill="#6f8fb8"/><rect x="18" y="84" width="34" height="22" rx="6" fill="#f4f1e6"/><rect x="14" y="74" width="8" height="66" fill="#7a5a43"/><ellipse cx="210" cy="156" rx="58" ry="11" fill="#c8566b" opacity=".8"/></svg>` },
  house: { name: 'House, front', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0f5"/><stop offset="1" stop-color="#e2f4fb"/></linearGradient></defs><rect width="320" height="180" fill="url(#hsky)"/><g fill="#fff" opacity=".92"><ellipse cx="50" cy="28" rx="22" ry="8"/><ellipse cx="64" cy="22" rx="14" ry="8"/><ellipse cx="262" cy="20" rx="20" ry="7"/><ellipse cx="248" cy="16" rx="12" ry="7"/></g><path d="M0 124q20 -26 40 -6q16 -24 36 -4v36H0z" fill="#7cbf7a"/><path d="M250 122q16 -22 34 -6q14 -18 36 -4v38h-70z" fill="#7cbf7a"/><rect x="76" y="62" width="168" height="88" fill="#f6ead8"/><path d="M64 66 160 20 256 66z" fill="#c4544f"/><path d="M64 66h192v6H64z" fill="#9e3b3a"/><rect x="146" y="36" width="28" height="20" rx="3" fill="#bfe3f2" stroke="#fff" stroke-width="3"/><g fill="#bfe3f2" stroke="#fff" stroke-width="3"><rect x="92" y="84" width="38" height="30" rx="2"/><rect x="190" y="84" width="38" height="30" rx="2"/></g><g fill="#f7b6c2"><path d="M93 85h8v28h-8zM121 85h8v28h-8zM191 85h8v28h-8zM219 85h8v28h-8z"/></g><rect x="146" y="94" width="28" height="56" rx="3" fill="#d9774a"/><rect x="152" y="100" width="16" height="12" rx="2" fill="#bfe3f2"/><circle cx="168" cy="124" r="2" fill="#ffd36b"/><rect x="132" y="100" width="10" height="14" rx="1" fill="#fffaf0" stroke="#b9a988"/><path d="M134 105h6M134 109h6" stroke="#8a7a6a"/><rect x="140" y="148" width="40" height="5" fill="#cfc2b0"/><rect y="150" width="320" height="30" fill="#8cc56f"/><path d="M146 152h28l22 28h-72z" fill="#e8dcc6"/><g fill="#5fa65a"><rect x="70" y="134" width="70" height="18" rx="9"/><rect x="180" y="134" width="70" height="18" rx="9"/></g><g fill="#ff9ab3"><circle cx="84" cy="138" r="2.5"/><circle cx="110" cy="142" r="2.5"/><circle cx="200" cy="140" r="2.5"/><circle cx="232" cy="138" r="2.5"/></g><rect x="269" y="112" width="5" height="40" fill="#7a5a43"/><rect x="256" y="98" width="31" height="18" rx="8" fill="#e04a4a"/><path d="M287 112V92h8v6h-8" fill="#ffd36b"/><path d="M262 106h18" stroke="#a83232" stroke-width="2"/></svg>` },
  living: { name: 'Living room', svg: livingRoom(false) },
  party: { name: 'Living room, party', svg: livingRoom(true) },
  kitchen: { name: 'Kitchen', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><defs><pattern id="ktile" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#eef5f2"/><path d="M12 0V12H0" fill="none" stroke="#d3e0dc"/></pattern><pattern id="kfloor" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#f4e8d4"/><rect width="10" height="10" fill="#e6d3b5"/><rect x="10" y="10" width="10" height="10" fill="#e6d3b5"/></pattern></defs><rect width="320" height="180" fill="#f6efe2"/><rect y="60" width="320" height="40" fill="url(#ktile)"/><rect y="134" width="320" height="46" fill="url(#kfloor)"/><rect x="120" y="14" width="80" height="42" fill="#cdeefa" stroke="#fff" stroke-width="4"/><path d="M160 14v42" stroke="#fff" stroke-width="3"/><rect x="116" y="56" width="88" height="4" fill="#fff"/><path d="M134 56q2 -12 8 -14q0 8 -4 14z" fill="#5fa65a"/><rect x="132" y="50" width="10" height="7" fill="#d9774a"/><rect x="214" y="10" width="62" height="34" rx="2" fill="#f2c79a"/><path d="M245 10v34" stroke="#d9a066"/><g fill="#8a5a3a"><circle cx="240" cy="30" r="1.6"/><circle cx="250" cy="30" r="1.6"/></g><rect x="80" y="98" width="200" height="36" fill="#f2c79a"/><rect x="78" y="94" width="204" height="6" fill="#8a9aa8"/><g stroke="#d9a066"><path d="M80 112h126M130 98v36M180 98v36"/></g><g fill="#8a5a3a"><rect x="100" y="104" width="12" height="3" rx="1.5"/><rect x="150" y="104" width="12" height="3" rx="1.5"/><rect x="190" y="104" width="10" height="3" rx="1.5"/></g><rect x="206" y="98" width="40" height="36" fill="#d8dde2"/><rect x="211" y="104" width="30" height="20" rx="2" fill="#2b2f36"/><rect x="214" y="80" width="24" height="14" rx="3" fill="#c4544f"/><rect x="210" y="82" width="4" height="3" fill="#c4544f"/><rect x="36" y="28" width="40" height="106" rx="5" fill="#fbfbfb" stroke="#c9d3d8" stroke-width="2"/><path d="M36 64h40" stroke="#c9d3d8" stroke-width="2"/><g fill="#9aa8b4"><rect x="68" y="40" width="3" height="16" rx="1.5"/><rect x="68" y="72" width="3" height="22" rx="1.5"/></g><rect x="44" y="76" width="18" height="15" fill="#fff6c9" transform="rotate(-6 53 83)"/><g fill="#e8875a"><circle cx="49" cy="83" r="2.4"/><circle cx="54" cy="82" r="2.4"/><circle cx="59" cy="84" r="2.4"/></g><circle cx="53" cy="76" r="2" fill="#e04a4a"/><path d="M0 40h24q6 0 6 6v88H0z" fill="#c9a77e"/><path d="M0 46h20v88H0z" fill="#8a6a4a"/><rect x="280" y="38" width="36" height="96" fill="#fff"/><rect x="284" y="42" width="28" height="92" fill="#7fb0a0"/><rect x="288" y="48" width="20" height="30" fill="#cdeefa"/><circle cx="306" cy="92" r="2" fill="#f4f1e6"/></svg>` },
  hallway: { name: "Sisters' hallway", svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="#efe6f3"/><rect y="132" width="320" height="8" fill="#fff"/><rect y="140" width="320" height="40" fill="#b98f6c"/><path d="M44 158h250l16 22H28z" fill="#c8566b" opacity=".7"/><rect y="96" width="38" height="6" fill="#7a5236"/><rect y="102" width="38" height="38" fill="#5a4030" opacity=".3"/><g stroke="#7a5236" stroke-width="3"><path d="M6 102v38M17 102v38M28 102v38"/></g><rect x="276" y="30" width="36" height="58" fill="#cdeefa" stroke="#fff" stroke-width="4"/><path d="M294 30v58" stroke="#fff" stroke-width="3"/><g fill="#fff"><rect x="58" y="44" width="54" height="96"/><rect x="133" y="44" width="54" height="96"/><rect x="208" y="44" width="54" height="96"/></g><rect x="62" y="48" width="46" height="92" fill="#5a6f9e"/><rect x="72" y="58" width="26" height="14" rx="1" fill="#fffaf0"/><path d="M76 63h18M76 67h12" stroke="#5a6f9e" stroke-width="1.5"/><circle cx="101" cy="98" r="2.4" fill="#f2c14e"/><rect x="137" y="48" width="46" height="92" fill="#4f8a5b"/><rect x="146" y="58" width="28" height="13" rx="1" fill="#1d1a2e"/><g fill="#2fd0c0"><rect x="150" y="62" width="3" height="3"/><rect x="155" y="62" width="3" height="3"/><rect x="160" y="62" width="3" height="3"/><rect x="167" y="62" width="3" height="3"/></g><rect x="152" y="126" width="16" height="10" fill="#3b6a45"/><circle cx="176" cy="98" r="2.4" fill="#f2c14e"/><rect x="212" y="48" width="46" height="92" fill="#f7a8c4"/><g fill="#fff6a0" stroke="#e0a800" stroke-width=".8"><path d="M224 60l2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0z"/><path d="M244 78l1.6 4 4 0 -3 2.4 1.4 4 -4 -2.4 -4 2.4 1.4 -4 -3 -2.4 4 0z"/><path d="M226 104l1.6 4 4 0 -3 2.4 1.4 4 -4 -2.4 -4 2.4 1.4 -4 -3 -2.4 4 0z"/></g><path d="M238 64q4 -6 8 0q-4 6 -8 0z" fill="#ff5c8a"/><circle cx="251" cy="98" r="2.4" fill="#f2c14e"/><g fill="#fff" stroke="#c9b6d3" stroke-width="2"><rect x="118" y="60" width="10" height="13"/><rect x="194" y="62" width="10" height="10"/></g></svg>` },
  garden: { name: 'Garden', svg: `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fc8f2"/><stop offset="1" stop-color="#d9f1fb"/></linearGradient><pattern id="gfence" width="12" height="34" patternUnits="userSpaceOnUse"><rect width="12" height="34" fill="#e8d2a8"/><path d="M11.5 0v34" stroke="#cdb184"/></pattern></defs><rect width="320" height="180" fill="url(#gsky)"/><circle cx="196" cy="26" r="13" fill="#fff3b0"/><g fill="#fff" opacity=".9"><ellipse cx="120" cy="24" rx="20" ry="7"/><ellipse cx="132" cy="19" rx="12" ry="7"/></g><rect y="96" width="320" height="36" fill="url(#gfence)"/><rect x="88" y="62" width="10" height="70" fill="#7a5a43"/><circle cx="93" cy="54" r="30" fill="#5fa65a"/><circle cx="76" cy="66" r="16" fill="#6cb566"/><circle cx="112" cy="64" r="15" fill="#6cb566"/><rect x="0" y="20" width="42" height="120" fill="#f6ead8"/><rect x="8" y="64" width="26" height="76" fill="#d9774a"/><rect x="13" y="70" width="16" height="20" fill="#bfe3f2"/><circle cx="29" cy="104" r="2" fill="#ffd36b"/><rect y="130" width="320" height="50" fill="#8cc56f"/><rect x="230" y="74" width="72" height="66" fill="#9c6b4a"/><path d="M222 78 266 52 310 78z" fill="#5a4a6a"/><rect x="254" y="94" width="24" height="46" fill="#7a5236"/><circle cx="273" cy="118" r="1.8" fill="#ffd36b"/><rect x="250" y="80" width="32" height="10" rx="1" fill="#f6efdc"/><path d="M254 85h24" stroke="#8a5a3a" stroke-width="1.5"/><rect x="236" y="88" width="12" height="12" fill="#bfe3f2"/><g fill="#ff9ab3"><circle cx="130" cy="126" r="3"/><circle cx="150" cy="122" r="3"/><circle cx="196" cy="126" r="3"/></g><g fill="#fff6a0"><circle cx="140" cy="128" r="3"/><circle cx="182" cy="122" r="3"/><circle cx="212" cy="127" r="3"/></g><rect x="40" y="146" width="92" height="20" rx="6" fill="#7a5236"/><g fill="#3f8f3f"><circle cx="52" cy="146" r="7"/><circle cx="68" cy="144" r="7"/><circle cx="84" cy="146" r="7"/><circle cx="100" cy="144" r="7"/><circle cx="118" cy="146" r="7"/></g><g fill="#e0263a"><circle cx="56" cy="152" r="3.2"/><circle cx="72" cy="151" r="3.2"/><circle cx="88" cy="153" r="3.2"/><circle cx="104" cy="151" r="3.2"/><circle cx="121" cy="153" r="3.2"/><circle cx="62" cy="158" r="3"/><circle cx="96" cy="158" r="3"/><circle cx="112" cy="159" r="3"/></g></svg>` }
};

/** Hair for the starter figures that have a style; figures without one keep the plain long or short hair. */
export type HairStyle = 'short' | 'spiky' | 'long' | 'bob' | 'ponytail' | 'twintails' | 'bun';
/** Small extras drawn on a starter figure. */
export type Accessory = 'glasses' | 'bow' | 'mustache' | 'apron' | 'headphones' | 'hood';

export interface CharacterArt {
  name: string;
  body: string;
  skin: string;
  hair: string;
  long: boolean;
  /** A hair style; with a style (or extras) the figure gets the larger, expressive eyes. */
  style?: HairStyle;
  acc?: Accessory[];
  /** Eye colour for the expressive eyes. */
  eyes?: string;
  /** The colour of a bow, hair ties or headphones. */
  accent?: string;
}

export const CHARACTERS: Record<string, CharacterArt> = {
  mara: { name: 'Mara', body: '#7b2d5b', skin: '#f0c9a8', hair: '#2a1c2e', long: true },
  jon: { name: 'Jon', body: '#1f6f78', skin: '#c99872', hair: '#4a3020', long: false },
  ines: { name: 'Ines', body: '#d59a1c', skin: '#f5d7c0', hair: '#a2381f', long: true },
  mum: { name: 'Mum', body: '#c9607f', skin: '#f3d2b8', hair: '#6b3a2a', long: false, style: 'bun', acc: ['apron'], eyes: '#7a4a2a', accent: '#f6e7c8' },
  dad: { name: 'Dad', body: '#3d6e9e', skin: '#dfae86', hair: '#2b2b33', long: false, style: 'spiky', acc: ['mustache'], eyes: '#3b2a1e' },
  akane: { name: 'Akane', body: '#a8323f', skin: '#f6dcc6', hair: '#1d1a2e', long: true, style: 'ponytail', acc: ['glasses'], eyes: '#6a2433', accent: '#f2c14e' },
  sora: { name: 'Sora', body: '#4f8a5b', skin: '#eac3a0', hair: '#7657c9', long: false, style: 'bob', acc: ['hood', 'headphones'], eyes: '#4b3a8a', accent: '#2fd0c0' },
  hina: { name: 'Hina', body: '#f0ad32', skin: '#fbe3cf', hair: '#e8875a', long: true, style: 'twintails', acc: ['bow'], eyes: '#b0502a', accent: '#ff5c8a' }
};

export const EXPRESSIONS = ['neutral', 'smiling', 'sad', 'angry', 'surprised'] as const;

const EXPR_ALIASES: Record<string, string> = { smiling: 'smile', smile: 'smile', happy: 'smile', sad: 'sad', angry: 'angry', surprised: 'surprised', neutral: 'neutral' };

export function characterSVG(c: CharacterArt, expr?: string): string {
  const e = EXPR_ALIASES[String(expr ?? '').toLowerCase()] ?? 'neutral';
  if (c.style || c.acc?.length) return expressiveSVG(c, e);
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

const INK = '#2a1626';

/** A small bow centred on x, y. */
const bow = (x: number, y: number, s: number, fill: string) =>
  `<g fill="${fill}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"><path d="M${x} ${y}l${-11 * s} ${-7 * s}v${14 * s}z"/><path d="M${x} ${y}l${11 * s} ${-7 * s}v${14 * s}z"/><circle cx="${x}" cy="${y}" r="${3.2 * s}"/></g>`;

/**
 * Starter figures with a hair style: the same body and head as the plain ones
 * (so marks sit in the same spots), with hair, extras and anime-style eyes.
 */
function expressiveSVG(c: CharacterArt, e: string): string {
  const H = c.hair, A = c.accent ?? '#ff5c8a', E = c.eyes ?? '#3a1f2b', acc = new Set(c.acc ?? []);
  const style = c.style ?? (c.long ? 'long' : 'short');
  const sideLocks = `<path d="M29 46q-5 22 1 40l7 -2q-4 -18 -1 -36z" fill="${H}"/><path d="M91 46q5 22 -1 40l-7 -2q4 -18 1 -36z" fill="${H}"/>`;
  const bangs = `<path d="M27 50a33 33 0 0 1 66 0L87 40 81 48 74 36 67 46 59 34 51 46 44 36 37 47 31 40z" fill="${H}"/>`;
  const back: Record<HairStyle, string> = {
    short: '',
    spiky: '',
    long: `<path d="M22 56a38 38 0 0 1 76 0v84q-8 6 -16 0H38q-8 6 -16 0z" fill="${H}"/>`,
    bob: `<path d="M23 54a37 37 0 0 1 74 0v32q-7 6 -14 0v-4H37v4q-7 6 -14 0z" fill="${H}"/>`,
    ponytail: `<path d="M80 30q34 2 30 50q-2 26 -18 46q6 -36 -8 -62z" fill="${H}"/><circle cx="85" cy="31" r="4.5" fill="${A}"/>`,
    twintails: `<path d="M32 36q-28 4 -26 48q1 30 14 48q-4 -44 20 -80z" fill="${H}"/><path d="M88 36q28 4 26 48q-1 30 -14 48q4 -44 -20 -80z" fill="${H}"/>`,
    bun: `<circle cx="60" cy="17" r="14" fill="${H}"/><path d="M50 12q10 -6 20 0" fill="none" stroke="${A}" stroke-width="2.5" stroke-linecap="round"/>`
  };
  const front: Record<HairStyle, string> = {
    short: `<path d="M27 48a33 33 0 0 1 66 0q-33 -12 -66 0z" fill="${H}"/>`,
    spiky: `<path d="M26 50 24 37 31 31 29 21 41 23 45 12 55 18 61 7 67 18 78 12 80 24 91 22 89 34 96 40 94 50q-34 -14 -68 0z" fill="${H}"/>`,
    long: sideLocks + bangs,
    bob: sideLocks + `<path d="M27 50a33 33 0 0 1 66 0V45H27z" fill="${H}"/>`,
    ponytail: `<path d="M27 50a33 33 0 0 1 66 0q-18 -16 -40 -8q-14 4 -26 8z" fill="${H}"/><path d="M29 46q-4 18 0 30l5 -2q-3 -14 0 -28z" fill="${H}"/>`,
    twintails: sideLocks + bangs,
    bun: `<path d="M27 50a33 33 0 0 1 66 0q-12 -18 -33 -16q-21 -2 -33 16z" fill="${H}"/><path d="M29 46q-4 18 1 30l5 -2q-3 -14 0 -28z" fill="${H}"/>`
  };
  const eye = (x: number): string => {
    if (e === 'smile') return `<path d="M${x - 5.5} 55q5.5 -7 11 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    if (e === 'surprised') return `<circle cx="${x}" cy="52" r="6.6" fill="#fff" stroke="${INK}" stroke-width="1.8"/><circle cx="${x}" cy="52.5" r="2.6" fill="${E}"/>`;
    const ry = e === 'sad' ? 5.6 : 6.2;
    const lid = e === 'angry' ? (x < 60 ? `<path d="M${x - 7} 44L${x + 8} 50.5V44z" fill="${c.skin}"/>` : `<path d="M${x + 7} 44L${x - 8} 50.5V44z" fill="${c.skin}"/>`) : '';
    const shine = e === 'sad' ? `<circle cx="${x + 1.6}" cy="51" r="1.9" fill="#fff"/><circle cx="${x - 1.4}" cy="56" r="1.2" fill="#fff"/>` : `<circle cx="${x + 1.6}" cy="50.6" r="1.7" fill="#fff"/>`;
    return `<ellipse cx="${x}" cy="53" rx="4.6" ry="${ry}" fill="${E}"/><ellipse cx="${x}" cy="54.6" rx="2.5" ry="3.4" fill="#1d1020"/>${shine}<path d="M${x - 6} 47.4q6 -3.6 12 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>${lid}`;
  };
  const brows = e === 'angry' ? `<path d="M40 41l13 6M80 41l-13 6"/>` : e === 'sad' ? `<path d="M41 45l11 -4M79 45l-11 -4"/>` : e === 'surprised' ? `<path d="M41 41q6 -4 12 0M67 41q6 -4 12 0"/>` : '';
  const mouth: Record<string, string> = {
    neutral: `<path d="M55 69q5 2 10 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
    smile: `<path d="M51 65h18q-2 9 -9 9t-9 -9z" fill="#7a2a35"/><path d="M55 71.5q5 -3 10 0q-2 2.5 -5 2.5t-5 -2.5z" fill="#e86a7a"/>`,
    sad: `<path d="M53 72q7 -6 14 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
    angry: `<rect x="51" y="66" width="18" height="6.5" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.8"/><path d="M57 66v6.5M63 66v6.5" stroke="${INK}" stroke-width="1.2"/>`,
    surprised: `<ellipse cx="60" cy="69" rx="4" ry="5.4" fill="#7a2a35"/>`
  };
  const darker = shade(c.body, -0.22);
  const under = (acc.has('hood') ? `<path d="M30 104q30 -22 60 0q-6 18 -30 20q-24 -2 -30 -20z" fill="${darker}"/>` : '');
  const clothes = (acc.has('apron') ? `<path d="M40 124h40v150q-20 8 -40 0z" fill="#fffaf2"/><path d="M40 125q-7 -14 2 -26M80 125q7 -14 -2 -26" fill="none" stroke="#fffaf2" stroke-width="3.5"/><rect x="50" y="160" width="20" height="14" rx="3" fill="none" stroke="#e7c9b0" stroke-width="2"/>` : '')
    + (acc.has('hood') ? `<path d="M52 108v34M68 108v34" stroke="#f4f1e6" stroke-width="2.5" stroke-linecap="round"/><path d="M36 210h48v26H36z" fill="${darker}" opacity=".6"/>` : '');
  const face = `<g fill="none" stroke="${shade(H, -0.2)}" stroke-width="3" stroke-linecap="round">${brows}</g>`;
  const extras = (acc.has('mustache') ? `<path d="M60 61.5q-6 -3.5 -12 0.5q-4 3 -8 0q3 6 10 5q6 -1 10 -4q4 3 10 4q7 1 10 -5q-4 3 -8 0q-6 -4 -12 -0.5z" fill="${H}"/>` : '')
    + (acc.has('glasses') ? `<g fill="rgba(255,255,255,.16)" stroke="#2a2440" stroke-width="2.2"><rect x="39" y="45" width="18" height="15" rx="5"/><rect x="63" y="45" width="18" height="15" rx="5"/></g><path d="M57 51h6M39 50l-10 -3M81 50l10 -3" fill="none" stroke="#2a2440" stroke-width="2.2"/>` : '')
    + (acc.has('headphones') ? `<path d="M25 54a35 35 0 0 1 70 0" fill="none" stroke="#2b2b38" stroke-width="5"/><rect x="19" y="46" width="11" height="20" rx="5" fill="${A}" stroke="#2b2b38" stroke-width="2"/><rect x="90" y="46" width="11" height="20" rx="5" fill="${A}" stroke="#2b2b38" stroke-width="2"/>` : '')
    + (acc.has('bow') ? (style === 'twintails' ? bow(32, 37, 0.8, A) + bow(88, 37, 0.8, A) : bow(82, 26, 1, A)) : '');
  const blush = `<g fill="#ff8aa0" opacity=".35"><ellipse cx="42" cy="62" rx="6" ry="3"/><ellipse cx="78" cy="62" rx="6" ry="3"/></g>`;
  return `<svg viewBox="0 0 120 300" role="img" aria-label="${esc(c.name)}">${back[style]}${under}<path d="M60 96C20 100 12 150 8 300h104C108 150 100 100 60 96z" fill="${c.body}"/>${clothes}<rect x="51" y="76" width="18" height="26" rx="6" fill="${c.skin}"/><circle cx="60" cy="52" r="32" fill="${c.skin}"/>${blush}${eye(48)}${eye(72)}${front[style]}${face}${mouth[e]}${extras}</svg>`;
}

/** A hex colour made lighter (amount above 0) or darker (below 0). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, amount < 0 ? v * (1 + amount) : v + (255 - v) * amount))).toString(16).padStart(2, '0');
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

export const OBJECTS: Record<string, Preset> = {
  cup: { name: 'Coffee cup', svg: `<svg viewBox="0 0 100 100" role="img" aria-label="Coffee cup"><path d="M18 34h52v30a22 22 0 0 1-22 22h-8a22 22 0 0 1-22-22z" fill="#f4efe6"/><path d="M70 42h8a11 11 0 0 1 0 22h-8" fill="none" stroke="#f4efe6" stroke-width="7"/><rect x="18" y="34" width="52" height="8" fill="#5a3a2a"/><path d="M34 26q-6 -8 0 -16M52 26q-6 -8 0 -16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>` },
  key: { name: 'Brass key', svg: `<svg viewBox="0 0 100 100" role="img" aria-label="Brass key"><circle cx="30" cy="50" r="18" fill="none" stroke="#d9a53a" stroke-width="9"/><path d="M48 50h42M74 50v14M88 50v10" stroke="#d9a53a" stroke-width="9" stroke-linecap="round"/></svg>` },
  cake: { name: 'Birthday cake', svg: `<svg viewBox="0 0 100 100" role="img" aria-label="Birthday cake"><ellipse cx="50" cy="90" rx="44" ry="7" fill="#f4f1e6" stroke="#c9c2b0" stroke-width="2"/><g transform="rotate(-5 50 88)"><rect x="18" y="58" width="64" height="30" rx="5" fill="#f6dfc0"/><path d="M18 64q8 8 16 0t16 0 16 0 16 0v-6H18z" fill="#fff"/><rect x="30" y="36" width="40" height="24" rx="4" fill="#f6dfc0"/><path d="M30 42q5 6 10 0t10 0 10 0 10 0v-6H30z" fill="#fff"/><g fill="#e0263a"><circle cx="26" cy="74" r="4"/><circle cx="42" cy="76" r="4"/><circle cx="58" cy="76" r="4"/><circle cx="74" cy="74" r="4"/><circle cx="40" cy="50" r="3.4"/><circle cx="60" cy="50" r="3.4"/></g><g fill="#7cc8f0"><rect x="38" y="20" width="4" height="16"/><rect x="58" y="20" width="4" height="16"/></g><path d="M47 30q3 -6 8 -3l4 -3v8l-4 -3q-5 3 -8 1z" fill="#f2a03d"/><g fill="#ffd36b"><path d="M40 12q4 5 0 8q-4 -3 0 -8z"/><path d="M60 12q4 5 0 8q-4 -3 0 -8z"/><path d="M52 18q4 5 0 8q-4 -3 0 -8z"/></g></g></svg>` },
  letter: { name: 'Letter', svg: `<svg viewBox="0 0 100 100" role="img" aria-label="Letter"><rect x="10" y="24" width="80" height="54" rx="4" fill="#f6efdc"/><path d="M10 28l40 28 40 -28" fill="none" stroke="#b9a988" stroke-width="4"/><circle cx="50" cy="60" r="8" fill="#b3261e"/></svg>` }
};

export interface GameTheme { name: string; box: string; fg: string; accent: string; on: string }

export const THEMES: Record<string, GameTheme> = {
  velvet: { name: 'Velvet', box: 'rgba(44,22,54,.92)', fg: '#F6EBDD', accent: '#E9B949', on: '#2C1636' },
  paper: { name: 'Paper', box: 'rgba(250,246,236,.96)', fg: '#2A2420', accent: '#C2412D', on: '#FFFFFF' },
  neon: { name: 'Neon', box: 'rgba(10,14,24,.9)', fg: '#E6F7FF', accent: '#4DE2E8', on: '#06222A' },
  night: { name: 'Night', box: 'rgba(16,22,44,.9)', fg: '#E8ECFF', accent: '#8EA2FF', on: '#0E1430' },
  rose: { name: 'Rose', box: 'rgba(255,240,244,.95)', fg: '#4A2030', accent: '#D9567B', on: '#FFFFFF' },
  forest: { name: 'Forest', box: 'rgba(22,38,30,.92)', fg: '#ECF3E6', accent: '#9BCB6B', on: '#14251B' },
  mono: { name: 'Mono', box: 'rgba(12,12,12,.88)', fg: '#FFFFFF', accent: '#FFFFFF', on: '#111111' }
};

/** Font stacks use single quotes so they can sit inside a style attribute. */
export const FONTS: Record<string, string> = {
  Lora: "'Lora',Georgia,serif",
  Figtree: "'Figtree',system-ui,sans-serif",
  'Courier Prime': "'Courier Prime','Courier New',monospace",
  'Bricolage Grotesque': "'Bricolage Grotesque','Trebuchet MS',sans-serif"
};

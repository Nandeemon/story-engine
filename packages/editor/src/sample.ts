import { createProject, parseCondition } from '@story-engine/engine-core';
import type { Condition, Conversation, Item, Panel, PanelBlock, Project, Room, StoryElement } from '@story-engine/engine-core';

/*
 * The sample story: one weekend with the Hoshino family. It shows every feature:
 * rooms that react, quests with stages, more than one conversation per figure,
 * room situations, items and panels, marks, line effects, variations, Ask,
 * the camera, paths and two endings.
 */

const CONSOLE = 'The missing console';
const BDAY = "Mum's birthday";

/** A condition written the way the script writes one. */
function C(text: string): Condition {
  const c = parseCondition(text);
  if (!c) throw new Error(`Sample: cannot read the condition "${text}"`);
  return c;
}
const qc = (quest: string, rest: string) => C(`quest ${quest} ${rest}`);
const lines = (...l: string[]) => l.join('\n');
const convo = (id: string, label: string, conds: Condition[], script: string): Conversation => ({ id, label, conds, script });

type El = Omit<StoryElement, 'x' | 'y' | 'size' | 'script'> & Partial<Pick<StoryElement, 'x' | 'y' | 'size' | 'script'>>;
const el = (e: El): StoryElement => ({ x: 50, y: 98, size: 74, script: '', ...e });
/** An invisible clickable area: x is its centre, y its bottom, size its height and w its width, in percent of the stage. */
const area = (id: string, name: string, x: number, y: number, size: number, w: number, hover: string, rest: Partial<StoryElement> = {}): StoryElement =>
  ({ id, kind: 'area', name, x, y, size, w, hover, script: '', ...rest });
const door = (id: string, name: string, x: number, y: number, size: number, w: number, to: string, fx = 'fade') =>
  area(id, name, x, y, size, w, name, { script: `Go to ${to} with ${fx}` });

const svgIcon = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${body}</svg>`)}`;

const ITEMS: Item[] = [
  { id: 'strawberries', name: 'Strawberries', icon: svgIcon('<path d="M20 36C8 28 6 18 10 13c3-3 7-3 10 0 3-3 7-3 10 0 4 5 2 15-10 23z" fill="#e0263a"/><path d="M12 11l8 4 8-4-4-3-4 3-4-3z" fill="#3f8f3f"/><g fill="#ffe066"><circle cx="15" cy="20" r="1"/><circle cx="24" cy="19" r="1"/><circle cx="20" cy="26" r="1"/><circle cx="26" cy="25" r="1"/></g>') },
  { id: 'candles', name: 'Birthday candles', icon: svgIcon('<g fill="#7cc8f0"><rect x="9" y="16" width="5" height="20" rx="1"/><rect x="26" y="16" width="5" height="20" rx="1"/></g><path d="M16 26q4-7 9-3l4-3v10l-4-3q-5 3-9-1z" fill="#f2a03d"/><g fill="#ffb020"><path d="M11.5 6q4 5 0 8-4-3 0-8z"/><path d="M28.5 6q4 5 0 8-4-3 0-8z"/></g>') },
  { id: 'glitter_pen', name: 'Glitter pen', icon: svgIcon('<path d="M10 32l18-22 4 3-18 22-5 1z" fill="#ff5c8a" stroke="#c2185b" stroke-width="1.5"/><g fill="#ffe066"><path d="M30 26l1.5 3.5L35 31l-3.5 1.5L30 36l-1.5-3.5L25 31l3.5-1.5z"/><circle cx="8" cy="10" r="2"/><circle cx="16" cy="6" r="1.4"/></g>') },
  { id: 'birthday_card', name: 'Birthday card', icon: svgIcon('<path d="M6 10l14 3v22L6 32z" fill="#fff6c9" stroke="#e0a800" stroke-width="1.5"/><path d="M20 13l14-3v22l-14 3z" fill="#ffe9f0" stroke="#e0a800" stroke-width="1.5"/><path d="M27 27c-5-3-5-7-3-8 1.5-1 3 0 3 1 0-1 1.5-2 3-1 2 1 2 5-3 8z" fill="#ff5c8a"/><g fill="#ffe066"><circle cx="11" cy="18" r="1.2"/><circle cx="15" cy="25" r="1.2"/><circle cx="10" cy="28" r="1"/></g>') },
  { id: 'game_console', name: 'Game console', icon: svgIcon('<rect x="3" y="12" width="34" height="18" rx="7" fill="#3a3f55"/><rect x="13" y="14" width="14" height="10" rx="1.5" fill="#7cd6e8"/><path d="M8 20h4M10 18v4" stroke="#fff" stroke-width="1.8"/><g fill="#ff5c8a"><circle cx="31" cy="18" r="1.6"/><circle cx="31" cy="23" r="1.6"/></g>') },
  { id: 'golden_sticker', name: 'Golden sticker', icon: svgIcon('<circle cx="20" cy="20" r="16" fill="#ffd34d" stroke="#e0a800" stroke-width="2"/><ellipse cx="20" cy="21" rx="9" ry="7" fill="#c98f4a"/><g fill="#8a5a2a"><circle cx="17" cy="19" r="1"/><circle cx="23" cy="22" r="1"/><circle cx="19" cy="24" r="0.8"/></g>') },
  { id: 'cake_slice', name: 'Slice of cake', icon: svgIcon('<path d="M5 30l28-14v14z" fill="#f6dfc0"/><path d="M5 30l28-14v4L5 32z" fill="#fff"/><path d="M5 32h28v4H5z" fill="#f6dfc0"/><circle cx="25" cy="15" r="4" fill="#e0263a"/><path d="M24 11l1-3 2 2z" fill="#3f8f3f"/>') }
];

function panels(): Panel[] {
  let n = 0;
  const text = (t: string, cond?: Condition): PanelBlock => ({ id: `pb${n++}`, kind: 'text', text: t, ...(cond ? { cond } : {}) });
  return [
    {
      id: 'pn-quests', name: 'Quest log', x: 1.5, y: 2.5, w: 44, h: 18, layout: 'column', style: 'theme', when: 'explore', key: 'q', button: true,
      blocks: [
        text('Quest log'),
        text('Akane wants a word in the living room.', qc(BDAY, 'is before Gathering')),
        text("Mum's birthday: strawberries, candles, card.", qc(BDAY, 'is Gathering')),
        text("Mum's birthday: bring Mum in at the front door!", qc(BDAY, 'is Ready')),
        text("★ Mum's birthday: the best party ever.", qc(BDAY, 'is at least Surprise')),
        text('Sora looks miserable. Ask her why.', qc(CONSOLE, 'is before Searching')),
        text("Sora's console is gone. Ask around.", qc(CONSOLE, 'is Searching')),
        text('Rice cracker crumbs lead to the garden…', qc(CONSOLE, 'is Following the crumbs')),
        text('Bring the console back to Sora!', qc(CONSOLE, 'is Found')),
        text('★ Console back. Sora lives again.', qc(CONSOLE, 'is Done'))
      ]
    },
    {
      id: 'pn-inv', name: 'Inventory', x: 66, y: 14, w: 31, h: 40, layout: 'column', style: 'theme', when: 'always', startHidden: true, key: 'i', button: true,
      blocks: [text('Your things'), { id: 'pb-list', kind: 'list', prefix: 'has.', empty: 'Your pockets are empty.' }]
    },
    {
      id: 'pn-jokes', name: 'Dad jokes', x: 48, y: 3, w: 24, h: 8, layout: 'row', style: 'none', when: 'explore', cond: C('dad_jokes'),
      blocks: [{ id: 'pb-jokes', kind: 'number', fact: 'dad_jokes', label: 'Dad jokes survived' }]
    }
  ];
}

/* ---------- Front door ---------- */

function frontDoor(): Room {
  return {
    id: 'r-front', name: 'Front door', bg: { preset: 'house' }, auto: true, autoEl: 'fd-arrival', autoOnce: true,
    situations: [{ id: 'fd-back', name: 'Back from the walk', conds: [qc(BDAY, 'is Ready')] }],
    els: [
      el({
        id: 'fd-arrival', kind: 'object', name: 'Arrival', offstage: true, script: lines(
          "Narration: Summer holidays. You haul your suitcase up the path to the Hoshino house: your cousins' house, for a whole weekend.",
          'Narration: You reach for the doorbell...',
          'Show Hina at center with pop',
          'Camera shake',
          "Hina (surprised, jump strength 5 x2, mark shock): AAAH! You're here! You're actually, really here!",
          'Hina (smiling, bounce x2, mark sparkle): Wait, wait! Mum says I have to do this properly.',
          'Hina (neutral): Ahem. Welcome to the Hoshino house, dear cousin... um...',
          `Ask "What's your name?" as name`,
          'Hina (smiling, pop strength 4, mark sparkle): {name}! Of course! I totally knew that! Ehehe~',
          "Hina (smiling, bounce strength 4 x3, mark note): Hina-power, maximum! I'm eighteen now, you know. Basically a grown-up!",
          'Camera zoom 1.8 at 50% 40%',
          'Hina (sad, tremble, mark sweat): ...Oh! And don\'t say "birthday" in front of Mum. Or "cake". Or "tomorrow". Or "surprise".',
          "Hina (surprised, shake strength 2, mark shock): I just said all of them out loud, didn't I.",
          'Camera reset',
          'Hina (smiling, mark sparkle): Big sis Akane will explain everything! Living room! Go go go!',
          'Hide Hina with slide to right',
          'Narration: Click the front door to go in. Press I for your things and Q for the quest log.'
        )
      }),
      door('fd-door', 'Go inside', 50, 84, 32, 11, 'Living room'),
      area('fd-mailbox', 'Mailbox', 84.5, 85, 34, 12, 'Mailbox', {
        convos: [convo('clue', 'A clue', [qc(CONSOLE, 'is Searching')], lines(
          'Narration: Inside the mailbox: a receipt.',
          'Narration: "Fishing Legends: Golden Tuna Bait Pack. Bought at 3:12 a.m. by user BEST_DAD_EVER."',
          'Narration: Somebody in this house was awake at 3 a.m. Mum notices everything. Maybe ask her.'
        ))],
        script: lines(
          'Narration: Bills, a pizza flyer and a postcard from Grandma.',
          'Narration: "Happy birthday for tomorrow, dear! Keep your husband away from the oven. Love, Mother."',
          `Only if quest ${BDAY} is at least Surprise`,
          '  Narration: Too late, Grandma. The cake leaned, but it stood.'
        )
      }),
      el({
        id: 'fd-mum', kind: 'char', preset: 'mum', name: 'Mum', x: 32, size: 74, expr: 'smiling', situation: 'fd-back', idle: { move: 'breathe' }, script: lines(
          'Mum (smiling, mark question): Ara, {name}~ Why are you standing in front of the door like a bouncer?',
          'Dad (smiling, tremble, mark sweat): Ha ha! Kids! Always standing in front of doors! What are they like!',
          'Part: Stall',
          'Choice',
          '  "The door is... resting."  once',
          '    Mum (smiling, mark sweat): Doors need their rest too, I suppose~',
          '    Go to part Stall',
          '  "Look! That cloud looks like a fish!"  once',
          '    Dad (surprised, jump strength 4, mark shock): WHERE?! A FISH?!',
          '    Mum (angry, pulse x2, mark anger): Dear. Mum is not angry. Mum would simply like to know why you are so interested in fish lately.',
          '    Dad (sad, tremble x3, mark sweat): No reason!',
          '    Go to part Stall',
          '  "Did you know our doorbell plays three songs?"  once',
          '    Narration: You play all three songs. They are the same song. Mum listens politely to every one.',
          '    Mum (smiling, mark note): How lovely~',
          '    Go to part Stall',
          '  "...Okay. Come on in."  fallback',
          '    Mum (smiling, mark sparkle): Now, now~ Let\'s go in. Mum would love a cup of tea.',
          `    Quest ${BDAY}: Surprise`,
          '    Go to Living room with black'
        )
      }),
      el({
        id: 'fd-dad', kind: 'char', preset: 'dad', name: 'Dad', x: 68, size: 78, expr: 'smiling', situation: 'fd-back', idle: { move: 'sway', strength: 2 }, script: lines(
          "Dad (smiling, mark sweat, in turn): Psst! {name}! Is Operation Cake a go? || Dad walked Mum round the block four times. Dad's legs are jelly. || ...I've run out of things to point at. Help.",
          'Dad (smiling, mark sparkle): Talk to Mum when you are ready. Leave it to Dad! Dad will... stand here.'
        )
      })
    ]
  };
}

/* ---------- Living room ---------- */

function livingRoom(): Room {
  return {
    id: 'r-living', name: 'Living room', bg: { preset: 'living' }, auto: true, autoEl: 'lr-surprise',
    situations: [
      { id: 'lr-mourning', name: 'Sora in mourning', conds: [qc(CONSOLE, 'is before Done')] },
      { id: 'lr-prep', name: 'Party prep', conds: [qc(BDAY, 'is Ready')], bg: { preset: 'party' } },
      { id: 'lr-party', name: 'Party', conds: [qc(BDAY, 'is at least Surprise')], bg: { preset: 'party' } }
    ],
    els: [
      el({
        id: 'lr-surprise', kind: 'object', name: 'Surprise!', offstage: true,
        convos: [convo('surprise', 'The surprise', [qc(BDAY, 'is Surprise')], lines(
          'Narration: The lights are off. Someone giggles. Someone else shushes the giggle.',
          'Mum (surprised, mark question): Hm? Why is it so dark in here? Did a fuse go again, dear—',
          'Camera flash',
          'Hina (smiling, jump strength 5 x3, mark sparkle): SURPRIIIIISE!',
          'Akane (smiling, pop strength 4, mark sparkle): Surprise!',
          'Sora (smiling, mark note): ...Surprise. Woo. Confetti.',
          'Dad (smiling, bounce strength 4 x2, mark sparkle): SURPRISE! Leave it to Dad! Dad did the walk!',
          'Camera shake',
          'Mum (surprised, tremble strength 2 x3, mark shock): Oh my... oh my goodness...',
          'Camera zoom 1.8 at 28% 40%',
          "Mum (sad, mark tears): Mum is not crying. Mum's eyes are simply... very happy.",
          'Camera reset',
          "Akane (smiling): The strawberries are from your own garden. Don't ask how we got them.",
          "Dad (smiling, mark sweat): The cake leans a little. That's a design choice.",
          'Hina (smiling, bounce x3, mark hearts): And the card is from ALL of us! I did the glitter! All of the glitter!',
          'Sora (smiling): The playlist has your enka songs. And three boss battle themes. For drama.',
          'Mum (smiling, pulse strength 4 x2, mark hearts): You are all... the very best present.',
          'Mum (smiling, mark sparkle): And you too, {name}. Thank you for helping my silly family.',
          'Narration: Mum blows out every candle in one breath. Every candle except the fish one, which lights itself again.',
          "Dad (surprised, shake strength 5 x2, mark shock): IT'S A TRICK CANDLE?!",
          'Camera shake',
          'Hina (smiling, jump x2, mark sparkle): Ehehe~ I swapped it! Hina-power, maximum!',
          `Quest ${BDAY}: Done`,
          'Change has.cake_slice = yes',
          'Narration: You got a slice of cake.'
        ))]
      }),
      door('lr-stairs', 'Upstairs', 5, 73, 40, 10, "Sisters' hallway"),
      door('lr-garden', 'Garden', 21, 73, 60, 19, 'Garden', 'slide left'),
      door('lr-kitchen', 'Kitchen', 94, 74, 49, 9.5, 'Kitchen', 'slide right'),
      door('lr-front', 'Front door', 7, 96, 16, 13, 'Front door'),
      area('lr-tv', 'TV', 81, 58, 20, 13, 'TV', {
        convos: [convo('nosignal', 'No console', [qc(CONSOLE, 'is before Done')], 'Narration: The TV says NO SIGNAL. Sora stares at it like it is a gravestone.')],
        script: 'Narration: Paused on a giant golden tuna. Sora has renamed it "Dad\'s Shame".'
      }),
      area('lr-cushion', 'Sofa cushions', 36, 66, 15, 10, 'Sofa cushions', {
        cond: qc(BDAY, 'is Gathering'), once: 'hide', script: lines(
          'Narration: You dig between the sofa cushions. A coin. A sock. Half a rice cracker. And...',
          'Change has.glitter_pen = yes',
          "Narration: A glitter pen! It sheds glitter all over your hands. You'll be sparkly for days.",
          `Only if quest ${CONSOLE} is not Done`,
          "  Sora (sad, mark gloom): ...Don't mind me. I'm part of the sofa now.",
          'Otherwise',
          "  Sora (smiling): Oh, that's where it went. Hina has been looking for that all morning."
        )
      }),
      el({
        id: 'lr-sora-sad', kind: 'char', preset: 'sora', name: 'Sora', x: 52, size: 70, expr: 'sad', situation: 'lr-mourning', idle: { move: 'breathe', speed: 2 },
        convos: [
          convo('gone', 'Console gone', [qc(CONSOLE, 'is before Searching')], lines(
            'Sora (sad, mark gloom): ...',
            "Sora (sad, mark gloom): It's gone, {name}. My console. My precious. My three-hundred-hour save file.",
            'Choice',
            '  "Did you check under the sofa?"',
            '    Sora (angry, mark anger): I checked under the sofa. I checked IN the sofa. I am basically the sofa now.',
            '  "Maybe go outside for a bit?"',
            '    Sora (surprised, tremble strength 4, mark shock): Outside? The graphics are great but the gameplay is terrible.',
            'Sora (sad): Last night it was right here. This morning: gone. Just crumbs. Rice cracker crumbs.',
            "Sora (neutral): Find it and I'll do the music for Akane's party thing. And you get my rarest sticker.",
            `Quest ${CONSOLE}: Searching`,
            'Loop Sora with sway speed 2'
          )),
          convo('found', 'Console found', [qc(CONSOLE, 'is Found')], lines(
            'Only if has.game_console',
            '  Sora (surprised, jump strength 4, mark shock): Is that... IS THAT...',
            '  Change has.game_console = no',
            "  Sora (smiling, pulse strength 4 x3, mark hearts): MY PRECIOUS. You came back. You're warm. Why are you warm?",
            '  Narration: Because Dad played it all night. You decide not to mention that.',
            "  Sora (smiling, mark sparkle): {name}. You're a real one. Here. My rarest sticker.",
            '  Change has.golden_sticker = yes',
            "  Narration: You got the golden sticker. It's a sticker of a potato. It is, somehow, gold.",
            `  Quest ${CONSOLE}: Done`,
            "  Sora (smiling, mark note): Okay. Playlist time. Tell Akane I'm back.",
            'Otherwise',
            '  Sora (sad, mark question): You found it... and then you lost it again? Go and find it again. Please.'
          ))
        ],
        script: lines(
          "Sora (sad, mark gloom, in turn): Any news? ...No? Okay. || I've started talking to the remote. It doesn't talk back. Good listener, though. || Five more minutes of hope. Then I become one with the sofa. || Still here. Still sad. Still sofa.",
          `Only if quest ${CONSOLE} is Following the crumbs`,
          '  Sora (surprised, mark question): Crumbs going out to the garden? ...Dad has a shed in the garden. Just saying.'
        )
      }),
      el({
        id: 'lr-sora', kind: 'char', preset: 'sora', name: 'Sora', x: 52, size: 70, expr: 'smiling', hideIn: ['lr-mourning'], idle: { move: 'sway', strength: 2, speed: 2 },
        convos: [
          convo('prep', 'Party prep', [qc(BDAY, 'is Ready')], lines(
            'Sora (smiling, mark note, in turn): Playlist loaded. Track one: "Final Boss, Mum\'s Birthday Remix". It slaps. || Akane says no boss music. Akane is not the boss of the playlist. || Shh. Practising my surprised face. ...This is it. This is my surprised face.'
          )),
          convo('after', 'After the party', [qc(BDAY, 'is at least Surprise')], lines(
            "Sora (smiling, mark sparkle, in turn): Mum danced to the boss battle theme. I'll never recover. || Dad wants to visit his tuna again. I've set up visiting hours. || Best party. Don't tell anyone I said that.",
            'Only if has.golden_sticker',
            "  Sora (smiling): Keep that potato sticker safe. It's worth more than my save file. ...Almost."
          ))
        ],
        script: lines(
          'Sora (smiling, in turn): Console is back. Life is good. || Do not touch the console. It has been through a lot. || ...Thanks again, {name}. Really.',
          `Only if quest ${BDAY} is Gathering`,
          "  Sora (smiling, mark note): Playlist's done. Forty-seven songs. Twelve are Mum's enka. The rest are boss battle themes. Tell Akane.",
          'Otherwise',
          `  Only if quest ${BDAY} is before Gathering`,
          "    Sora (neutral): Akane's looking for you. She has her plan face on."
        )
      }),
      el({
        id: 'lr-akane', kind: 'char', preset: 'akane', name: 'Akane', x: 72, size: 76, expr: 'neutral',
        convos: [
          convo('plan', 'The plan', [qc(BDAY, 'is before Gathering')], lines(
            "Akane (neutral): Ah. {name}. Good. You're here. Sit. ...Actually, don't sit. There's no time.",
            'Akane (smiling, mark sparkle): Tomorrow is Mum\'s birthday. We are throwing her a surprise party.',
            'Akane (smiling): I have a plan. I always have a plan.',
            'Camera zoom 1.6 at 72% 40%',
            'Akane (angry, shake strength 2, mark anger): The plan requires that NOBODY tells Mum. Looking at you, Hina.',
            'Camera reset',
            'Narration: From upstairs, faintly: "I HEARD THAT!"',
            "Akane (neutral): We need three things. Strawberries from Mum's garden, for the cake. The birthday candles Dad hid somewhere. And Hina's card.",
            "Akane (sad, mark sweat): And music. Which is Sora's job. Except Sora is... in mourning.",
            'Choice',
            '  "Leave it to me!"',
            '    Akane (smiling, mark sparkle): Good. Report back to me when you have everything.',
            '  "What\'s in it for me?"',
            "    Akane (angry, pulse x2, mark anger): Cake. Eternal gratitude. And I won't tell Mum you ate the last pudding.",
            '    Narration: You did not eat the last pudding. Dad did. But she has that look.',
            `Quest ${BDAY}: Gathering`
          )),
          convo('check', 'Checklist', [qc(BDAY, 'is Gathering')], lines(
            'Akane (neutral): Report, {name}. What have we got?',
            'Only if has.strawberries',
            '  Akane (smiling): Strawberries. Check.',
            'Otherwise',
            "  Akane (neutral): Strawberries: missing. Mum's patch in the garden. Do NOT get caught.",
            'Only if has.candles',
            '  Akane (smiling, mark question): Candles. Check. ...Why is one of them shaped like a fish?',
            'Otherwise',
            '  Akane (neutral): Candles: missing. Dad hides things in the kitchen. Ask him.',
            'Only if has.birthday_card',
            "  Akane (smiling): Hina's card. Check. It's... very sparkly.",
            'Otherwise',
            '  Akane (neutral): The card: missing. Hina is still "finishing" it upstairs.',
            `Only if quest ${CONSOLE} is not Done`,
            "  Akane (angry, pulse, mark anger): And Sora won't do the music until her console turns up. Ugh. Help her too.",
            '  End',
            'Only if has.strawberries',
            '  Only if has.candles',
            '    Only if has.birthday_card',
            '      Go to part Ready',
            "Akane (neutral, mark sweat): We're not ready yet. Come back when you have everything.",
            'End',
            'Part: Ready',
            'Akane (smiling, pop strength 4, mark sparkle): Strawberries. Candles. Card. Music. Everything is here.',
            'Akane (smiling, mark sparkle): I have a plan. I always have a plan.',
            'Change has.strawberries = no',
            'Change has.candles = no',
            'Change has.birthday_card = no',
            `Quest ${BDAY}: Ready`,
            'Narration: Akane takes the strawberries, the candles and the card, and throws open the window.',
            'Akane (angry, shake strength 3, mark anger): DAD! OPERATION WALKIES! NOW!',
            'Narration: From the garden: "Darling! Let\'s go for a walk! For no reason! A completely normal walk!"',
            'Akane (sad, mark sweat): ...He said "for no reason". Mum definitely knows.',
            "Akane (neutral): Doesn't matter. We decorate. You wait at the front door and bring Mum in when they get back.",
            'Hina (smiling, jump strength 4 x2, mark sparkle): Decoration time! Glitter time!'
          )),
          convo('prep', 'Party prep', [qc(BDAY, 'is Ready')], lines(
            'Akane (neutral, mark sweat, in turn): Streamers, check. Cake, check. Hina\'s glitter levels... unsafe. || Why are you still here? Front door! Bring Mum in! || Go! Before Hina finds more glitter!'
          )),
          convo('after', 'After the party', [qc(BDAY, 'is at least Surprise')], lines(
            'Akane (smiling, pop, mark sparkle, in turn): The plan worked. Of course it worked. I always have a plan. || Mum cried twice. Dad cried four times. I counted. For the records. || Next year: a bigger plan.',
            'Akane (sad, mark sweat): ...I did not plan the fish candle, though.',
            "Akane (neutral, mark blush): It's not like I wanted to say thank you or anything. ...Thank you, {name}."
          ))
        ],
        script: 'Akane (neutral): I have a plan. I always have a plan.'
      }),
      el({
        id: 'lr-hina-prep', kind: 'char', preset: 'hina', name: 'Hina', x: 40, size: 66, expr: 'smiling', situation: 'lr-prep', idle: { move: 'bounce', strength: 2, speed: 4 }, script: lines(
          'Path Hina over 2.5s back and forth: 34 98, 46 98',
          'Hina (smiling, jump x2, mark note, in turn): Streamers! Balloons! Glitter! So! Much! Glitter! || I hung the banner! It only fell down twice! || {name}! Go and get Mum! Front door! Go go go!',
          'Akane (angry, mark anger): Hina. Less glitter.',
          "Hina (smiling, bounce strength 4, mark sparkle): There's no such thing as less glitter!"
        )
      }),
      el({
        id: 'lr-hina-party', kind: 'char', preset: 'hina', name: 'Hina', x: 41, size: 66, expr: 'smiling', situation: 'lr-party', idle: { move: 'bounce', strength: 2, speed: 4 },
        convos: [convo('after', 'After the party', [qc(BDAY, 'is Done')], lines(
          'Hina (smiling, bounce strength 4 x3, mark hearts, in turn): Best! Day! EVER! Hina-power, MAXIMUM! || Mum hugged me SO hard. I think my back went "crack". Ehehe~ || Next year I\'m making two cakes. One for eating and one for leaning!',
          'Only if has.cake_slice',
          '  Hina (neutral, mark question): ...Are you going to eat that cake? Can I have the strawberry on top?',
          '  Choice',
          '    "Here, have it."',
          '      Change has.cake_slice = no',
          "      Hina (smiling, jump strength 4 x2, mark hearts): KYAA! You're the best cousin in the whole world!",
          '    "Sorry, it\'s mine."',
          '      Hina (sad, tremble, mark tears): Noooo... okay. Ehehe. I respect it.'
        ))],
        script: 'Hina (smiling, mark sparkle): Shhh! Surprise!'
      }),
      el({
        id: 'lr-mum', kind: 'char', preset: 'mum', name: 'Mum', x: 28, size: 74, expr: 'smiling', situation: 'lr-party', idle: { move: 'breathe' },
        convos: [convo('photo', 'Family photo', [qc(BDAY, 'is Done')], lines(
          'Mum (smiling, mark sparkle): Now, now~ Before the cake disappears... how about a family photo?',
          'Choice',
          '  "Say cheese!"',
          '    Narration: Everyone squeezes together. Dad sets the timer and runs. Hina makes a peace sign. Sora almost smiles.',
          '    Camera zoom 1.4 at 45% 45%',
          "    Dad (surprised, jump strength 4, mark sweat): Wait, wait, I'm not in yet—",
          '    Camera flash',
          '    Camera reset',
          "    Mum (smiling, mark hearts): Perfect. Dad's only half in it. That's how Mum will remember today.",
          '    Ending: The best birthday ever',
          '  "In a minute!"',
          '    Mum (smiling, mark note): Take your time, dear~ Mum is in no hurry today.'
        ))],
        script: 'Mum (smiling): Ara~'
      }),
      el({
        id: 'lr-dad', kind: 'char', preset: 'dad', name: 'Dad', x: 14, size: 78, expr: 'smiling', situation: 'lr-party', idle: { move: 'sway', strength: 2 }, script: lines(
          "Dad (smiling, mark tears, in turn): Best. Birthday. Ever. Dad's not crying, Dad's eyes are just very proud. || Did you see Mum's face? Dad's framing it. Not her face. A photo of her face. || Sora let me visit my tuna. We had a moment.",
          'Choice',
          '  "One more joke?"  once',
          '    Dad (smiling, pop, mark sparkle): Why did the birthday cake go to the doctor? It was feeling crummy!',
          '    Change dad_jokes + 1',
          '    Akane (angry, shake, mark anger): DAD.',
          '  "Great walk, Dad."',
          '    Dad (smiling, bounce x2): Leave it to Dad!'
        )
      }),
      el({ id: 'lr-cake', kind: 'object', preset: 'cake', name: 'Birthday cake', x: 81, y: 63, size: 14, situation: 'lr-party', script: lines(
        'Narration: The leaning tower of cake. Strawberries from the garden, glitter from Hina, and one fish candle that will not go out.',
        'Only if has.cake_slice',
        '  Narration: You already have a slice. Leave some for Dad.'
      ) })
    ]
  };
}

/* ---------- Kitchen ---------- */

function kitchen(): Room {
  return {
    id: 'r-kitchen', name: 'Kitchen', bg: { preset: 'kitchen' }, auto: false,
    situations: [
      { id: 'k-gone', name: 'Dad has slipped out', conds: [qc(CONSOLE, 'is Following the crumbs')] },
      { id: 'k-away', name: 'Dad is out', conds: [qc(BDAY, 'is at least Ready')] },
      { id: 'k-cake', name: 'Cake cooling', conds: [qc(BDAY, 'is Ready')] }
    ],
    els: [
      door('k-living', 'Living room', 5, 74, 52, 9, 'Living room', 'slide left'),
      door('k-back', 'Garden', 93, 74, 52, 10, 'Garden'),
      area('k-fridge', 'Fridge', 17.5, 74, 59, 12.5, 'Fridge', {
        convos: [convo('crumbs', 'Crumbs', [qc(CONSOLE, 'is Searching')], lines(
          'Narration: On top of the fridge: an empty bag of rice crackers. Licked clean.',
          'Narration: Crumbs lead across the floor and out of the back door. Whoever did this snacks like a raccoon.',
          'Narration: Mum is out in the garden. She notices everything.'
        ))],
        script: lines(
          "Narration: A drawing by Hina, age six: the whole family as potatoes. Dad's potato is holding a fish.",
          `Only if quest ${CONSOLE} is at least Found`,
          '  Narration: Somehow, that makes a lot more sense now.'
        )
      }),
      el({ id: 'k-note', kind: 'object', preset: 'letter', name: 'Note', x: 46, y: 55, size: 10, situation: 'k-gone', script: lines(
        "Narration: A note on the counter, in Dad's handwriting:",
        'Narration: "Gone to the garden. For gardening. Do NOT look in the shed. There is nothing in the shed. Love, Dad (not hiding)"'
      ) }),
      el({ id: 'k-cake', kind: 'object', preset: 'cake', name: 'Cake', x: 58, y: 55, size: 16, situation: 'k-cake', script: lines(
        "Narration: Dad's cake, cooling. It leans to the left like it is listening for something.",
        'Narration: Hina has stuck the strawberries on in the shape of a smiley face. The smiley face is also leaning.'
      ) }),
      el({
        id: 'k-dad', kind: 'char', preset: 'dad', name: 'Dad', x: 56, size: 78, expr: 'smiling', hideIn: ['k-gone', 'k-away'], idle: { move: 'sway', strength: 2 }, script: lines(
          "Dad (smiling, mark sparkle, in turn): Leave it to Dad! || Ah, {name}! Dad's kitchen is open for business! || Back again? Dad's charm is irresistible.",
          'Part: Ask',
          'Choice',
          '  "Any birthday candles?"',
          `    Only if quest ${BDAY} is Gathering`,
          '      Only if has.candles',
          '        Dad (smiling): Dad gave you all of them! Even the fish one. Especially the fish one.',
          '      Otherwise',
          '        Dad (surprised, jump, mark shock): Shh! Shh shh shh!',
          '        Dad (smiling, mark sparkle): Top drawer, under the takeaway menus. Dad\'s secret stash.',
          '        Change has.candles = yes',
          '        Narration: You got the birthday candles. One of them is shaped like a fish.',
          '        Dad (smiling, bounce x2): Why do candles never feel lonely? Because they always find their match!',
          '        Change dad_jokes + 1',
          '    Otherwise',
          `      Only if quest ${BDAY} is before Gathering`,
          "        Dad (surprised, tremble, mark sweat): Birthday? Whose birthday? Nobody's birthday! Go and talk to Akane!",
          '      Otherwise',
          '        Dad (smiling): Candles? All gone! On the best cake Dad ever leaned.',
          '  "Where were you at 3 a.m.?"',
          `    Only if quest ${CONSOLE} is Searching`,
          '      Dad (surprised, tremble strength 4 x3, mark sweat): Asleep! Snoring! Like a log! A big, sleepy, innocent log!',
          '      Narration: There is a controller-shaped dent in his cheek.',
          '    Otherwise',
          `      Only if quest ${CONSOLE} is at least Found`,
          "        Dad (sad, mark gloom): We don't talk about 3 a.m. in this house any more.",
          '      Otherwise',
          '        Dad (smiling): Asleep, like a responsible father! Why do you ask?',
          '  "Tell me a joke, Dad."  once',
          '    Dad (smiling, pop, mark sparkle): What do you call a fake noodle? An impasta!',
          '    Change dad_jokes + 1',
          '    Narration: Somewhere upstairs, Akane groans loud enough to hear.',
          '    Go to part Ask',
          '  "Another one!"  once',
          '    Dad (smiling, bounce, mark sparkle): Dad used to hate facial hair. But then it grew on him!',
          '    Change dad_jokes + 1',
          '    Go to part Ask',
          '  "Bye, Dad!"',
          '    Dad (smiling): Bye! Mind the floor, it\'s... mostly clean!'
        )
      })
    ]
  };
}

/* ---------- Garden ---------- */

function garden(): Room {
  return {
    id: 'r-garden', name: 'Garden', bg: { preset: 'garden' }, auto: false,
    situations: [
      { id: 'g-shed', name: 'Dad by the shed', conds: [qc(CONSOLE, 'is Following the crumbs')] },
      { id: 'g-away', name: 'Mum is out', conds: [qc(BDAY, 'is at least Ready')] }
    ],
    els: [
      door('g-back', 'Back inside', 6.6, 78, 42, 9, 'Living room', 'slide right'),
      area('g-shed', "Dad's shed", 83, 78, 50, 25, "Dad's shed", {
        convos: [
          convo('guarded', 'Guarded', [qc(CONSOLE, 'is Following the crumbs')], 'Narration: The shed door is shut. From inside comes a tiny, tinny "bloop... bloop...". Dad is standing in front of it, whistling very badly.'),
          convo('after', 'After 3 a.m.', [qc(CONSOLE, 'is at least Found')], "Narration: The shed. It smells of rice crackers and regret. Dad's fishing hat hangs on a nail, looking guilty.")
        ],
        script: 'Narration: Dad\'s shed. A sign says "DAD\'S WORKSHOP". Someone has crossed out WORKSHOP and written NAP ROOM.'
      }),
      area('g-berries', 'Strawberries', 27, 93, 18, 30, 'Strawberries', {
        cond: qc(BDAY, 'is Gathering'), once: 'hide', script: lines(
          "Narration: Mum's strawberry patch. Big, red, perfect strawberries. Perfect for a birthday cake.",
          "Mum (smiling, mark question): Ara? Is someone in Mum's strawberries~?",
          'Choice',
          '  "They\'re for... a smoothie!"',
          '    Mum (smiling, mark sparkle): A smoothie! How healthy~ Take as many as you like.',
          '  "Look! A rare butterfly!"',
          '    Mum (surprised, jump, mark sparkle): Where?!',
          '    Narration: You grab a handful while she looks the other way.',
          '    Mum (sad, mark sweat): It flew away... Hm? Are there fewer strawberries than before?',
          '  "Tell her everything."',
          '    Narration: You crack. You tell Mum everything: the party, the cake, the candles, the card.',
          '    Mum (surprised, tremble x2, mark shock): ...',
          '    Mum (smiling, mark hearts): Ara ara. Then tomorrow, Mum will be very, very surprised. Mum promises~',
          '    Change has.strawberries = yes',
          '    Camera zoom 2 at 52% 35%',
          '    Narration: Somewhere inside the house, Akane senses a disturbance in the plan.',
          '    Akane (angry, shake strength 5 x3, mark anger): {name}!!!',
          '    Camera shake',
          '    Ending: Worst secret-keeper',
          'Change has.strawberries = yes',
          'Narration: You got strawberries.'
        )
      }),
      el({
        id: 'g-mum', kind: 'char', preset: 'mum', name: 'Mum', x: 52, size: 74, expr: 'smiling', hideIn: ['g-away'], idle: { move: 'breathe' },
        convos: [
          convo('clue', 'The crumbs', [qc(CONSOLE, 'is Searching')], lines(
            'Mum (smiling, mark sparkle): Ara, {name}~ Looking for something?',
            'Mum (smiling): Somebody ate a whole bag of rice crackers in the night. There are crumbs from the kitchen all the way out here.',
            'Camera zoom 1.6 at 52% 40%',
            'Mum (angry, tremble, mark anger): Mum is not angry. Mum is simply... keeping a list.',
            'Narration: The garden suddenly feels three degrees colder.',
            'Camera reset',
            "Mum (smiling, mark note): The crumbs go behind Dad's shed. Isn't that funny~?",
            `Quest ${CONSOLE}: Following the crumbs`
          )),
          convo('suspicious', 'Suspicious', [qc(BDAY, 'is Gathering')], lines(
            'Mum (smiling, mark question): Ara~ Everyone is whispering today. Akane has a clipboard. Hina is covered in glitter.',
            'Mum (smiling, mark sparkle): Is something happening tomorrow, {name}~?',
            'Choice',
            '  "Nothing! Nothing is happening. Ever."',
            '    Mum (smiling, mark sweat): My, my. Nothing at all~',
            '  "What\'s tomorrow? Is it... Tuesday?"',
            "    Mum (smiling): It's Sunday, dear~",
            '    Narration: She smiles like someone who has been a mum for twenty-one years.',
            '  "Can I help in the garden?"  once',
            '    Mum (smiling, pop, mark hearts): What a good child! Here, hold this weed.',
            '    Narration: You hold the weed. It is a very ordinary weed.'
          ))
        ],
        script: lines(
          'Mum (smiling, mark sparkle, one of): Now, now~ The tomatoes are doing wonderfully this year. || Ara, {name}~ Have you eaten? You look thin. Have a tomato. || Hm hm hm~ Weeding is so relaxing. || Mum always knows. Mum always knows everything~',
          `Only if quest ${CONSOLE} is at least Found`,
          '  Mum (smiling, mark anger): Mum heard about the console. Dad and Mum will have a little chat later. A little, little chat~'
        )
      }),
      el({
        id: 'g-dad', kind: 'char', preset: 'dad', name: 'Dad', x: 66, size: 78, expr: 'smiling', situation: 'g-shed', idle: { move: 'sway', strength: 3, speed: 4 }, script: lines(
          'Mark Dad with sweat',
          "Dad (smiling): Oh! {name}! What a lovely, normal day. Nothing in the shed. Dad's just... guarding the nothing.",
          'Choice',
          '  "Dad. The crumbs lead right to you."',
          '    Dad (surprised, tremble strength 5 x3, mark shock): The crumbs BETRAYED me?!',
          '  "Is that fishing music coming from the shed?"',
          "    Dad (surprised): Bloop bloop? No. That's... a bird. A bloop bird.",
          '    Dad (sad): ...Okay. There is no bloop bird.',
          'Camera zoom 1.7 at 66% 40%',
          "Dad (sad, tremble x3, mark tears): Dad only wanted to fix the stick drift on her controller! Then Dad saw a fishing game! Then it was 4 a.m. and Dad had caught a legendary golden tuna!",
          'Dad (smiling, pop strength 4, mark sparkle): It was BEAUTIFUL, {name}.',
          'Camera reset',
          'Unmark Dad',
          'Dad (sad): Please give it back to Sora. And tell her... the tuna is in her save file now. She can visit it.',
          'Change has.game_console = yes',
          'Narration: You got the game console.',
          `Quest ${CONSOLE}: Found`
        )
      })
    ]
  };
}

/* ---------- The sisters' hallway ---------- */

function hallway(): Room {
  return {
    id: 'r-hall', name: "Sisters' hallway", bg: { preset: 'hallway' }, auto: false,
    situations: [{ id: 'h-down', name: "Everyone's downstairs", conds: [qc(BDAY, 'is at least Ready')] }],
    els: [
      door('h-stairs', 'Downstairs', 5.6, 78, 25, 11, 'Living room'),
      area('h-akane-door', "Akane's room", 26.6, 78, 51, 14.4, "Akane's room", { script: lines(
        'Narration: A neat sign: "STUDYING. DO NOT ENTER. This means you, Dad." Under it, smaller: "Hina, this also means you."',
        `Only if quest ${BDAY} is Gathering`,
        '  Narration: A sticky note has been added: "PARTY HQ. Password: cake." Crossed out underneath: "Password changed. Hina."'
      ) }),
      area('h-sora-door', "Sora's room", 50, 78, 51, 14.4, "Sora's room", { script: lines(
        'Narration: "GAMING. DO NOT DISTURB. (Unless snacks.)" There is a little flap at the bottom of the door. For snacks.',
        `Only if quest ${CONSOLE} is before Done`,
        '  Narration: The room behind it is quiet. Too quiet. No clicking. No muttering. Just sadness.'
      ) }),
      area('h-hina-door', "Hina's room", 73.4, 78, 51, 14.4, "Hina's room", { script:
        'Narration: Covered in star stickers. A sign: "HINA\'S ROOM! Knock three times! Say the password! The password is Hina!"' }),
      el({
        id: 'h-hina', kind: 'char', preset: 'hina', name: 'Hina', x: 88, size: 68, expr: 'smiling', hideIn: ['h-down'], idle: { move: 'bounce', strength: 2, speed: 4 },
        convos: [convo('card', 'The card', [qc(BDAY, 'is Gathering')], lines(
          'Only if has.birthday_card',
          '  Hina (smiling, mark sparkle): You have the card! Guard it with your life! Or at least with your pocket!',
          'Otherwise',
          '  Only if has.glitter_pen',
          '    Hina (surprised, jump strength 5 x2, mark shock): MY GLITTER PEN! Where was it?!',
          '    Change has.glitter_pen = no',
          '    Narration: Hina scribbles at the speed of light. Glitter goes everywhere. Some of it will be in your hair for a week.',
          '    Hina (smiling, bounce x3, mark hearts): Done! Give it to Akane-nee! Hina-power, maximum!',
          '    Change has.birthday_card = yes',
          '    Narration: You got the birthday card. It sparkles aggressively.',
          '  Otherwise',
          '    Hina (sad, tremble x2, mark tears): The card is almost done, but my glitter pen is GONE! A card without glitter is just... paper!',
          '    Hina (neutral, mark question): The last time I had it, I was watching TV with Sora... on the sofa...'
        ))],
        script: lines(
          'Hina (smiling, bounce x2, mark sparkle, one of): Hina-power, maximum! || Ehehe~ Did you see my door? The stars glow in the dark! On purpose! || {name}! Wanna hear a secret? ...I forgot it. Ehehe~',
          `Only if quest ${CONSOLE} is Searching`,
          '  Hina (surprised, tremble, mark shock): Oh! Oh! Last night I heard spooky music! "Bloop... bloop..." like a fishing game! At 3 a.m.!',
          `Only if quest ${BDAY} is before Gathering`,
          '  Hina (sad, mark sweat): Akane-nee is waiting in the living room. She has her clipboard face on.'
        )
      })
    ]
  };
}

/** The sample story: a weekend with the Hoshino family, showing every feature. */
export function sampleProject(): Project {
  const p = createProject();
  p.title = 'The Hoshino House';
  p.look = { ...p.look, theme: 'rose', font: 'Figtree', radius: 16, typing: 50 };
  p.quests = [
    { id: 'q-console', name: CONSOLE, stages: ['Not started', 'Searching', 'Following the crumbs', 'Found', 'Done'] },
    { id: 'q-bday', name: BDAY, stages: ['Not started', 'Gathering', 'Ready', 'Surprise', 'Done'] }
  ];
  p.items = ITEMS.map(x => ({ ...x }));
  p.panels = panels();
  p.rooms = [frontDoor(), livingRoom(), kitchen(), garden(), hallway()];
  return p;
}

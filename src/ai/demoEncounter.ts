/**
 * Deterministic offline demo content for Phases 6-7 (encounter generation and
 * combat dialogue). Same contract as a live provider: structured data in,
 * validated shapes out — the app cannot tell the difference except by label.
 */
import type { DialogueRequest, DialogueResponse, StructuredResponse } from './provider';
import { ENCOUNTER_SPEC_KIND, ENCOUNTER_SPEC_VERSION, type EncounterSpec } from '../game/encounter/spec';

/**
 * §72 encounter: three masked students corner the player in a school
 * hallway. Melee x2 + one powered enemy, each with a stated intent
 * (PRD §68 enemy intent). Layout exercises lockers, desks, a door, a barrel,
 * a hazard, and difficult terrain.
 */
export function demoEncounterSpec(request: { prompt: string }): EncounterSpec {
  // Best-effort player-name extraction from the structured prompt's JSON.
  let playerName = 'Alex';
  try {
    const parsed: unknown = JSON.parse(request.prompt);
    if (parsed !== null && typeof parsed === 'object' && 'playerName' in parsed) {
      const name = (parsed as { playerName: unknown }).playerName;
      if (typeof name === 'string' && name.trim() !== '') playerName = name.trim();
    }
  } catch {
    // Non-JSON prompt: keep the default.
  }

  return {
    kind: ENCOUNTER_SPEC_KIND,
    version: ENCOUNTER_SPEC_VERSION,
    title: 'Ambush in the West Hallway',
    narrativeContext:
      'Three masked students corner the player in the school hallway after last bell. They want to make an example of them — the lights failing earlier was their distraction.',
    width: 14,
    height: 8,
    objects: [
      // Border walls with an east door.
      ...Array.from({ length: 14 }, (_, x) => ({ kind: 'WALL' as const, x, y: 0 })),
      ...Array.from({ length: 14 }, (_, x) => ({ kind: 'WALL' as const, x, y: 7 })),
      ...Array.from({ length: 7 }, (_, i) => ({ kind: 'WALL' as const, x: 0, y: i + 1 })),
      ...Array.from({ length: 7 }, (_, i) => ({ kind: 'WALL' as const, x: 13, y: i + 1 })),
      { kind: 'DOOR', x: 13, y: 3 },
      // Hallway furniture.
      { kind: 'LOCKER', x: 4, y: 1 },
      { kind: 'LOCKER', x: 5, y: 1 },
      { kind: 'LOCKER', x: 6, y: 1 },
      { kind: 'DESK', x: 5, y: 4 },
      { kind: 'DESK', x: 8, y: 3 },
      { kind: 'LOCKER', x: 10, y: 6 },
      { kind: 'BARREL', x: 11, y: 1 },
      { kind: 'HAZARD', x: 7, y: 5 },
    ],
    terrain: [
      { x: 3, y: 5 },
      { x: 9, y: 2 },
      { x: 12, y: 5 },
    ],
    units: [
      {
        id: 'player',
        name: playerName,
        role: 'PLAYER',
        hp: 14,
        movement: 3,
        x: 2,
        y: 4,
        abilities: ['fireball', 'punch', 'force-push'],
        intent: 'Get out of the hallway in one piece and show the masks they picked the wrong student.',
      },
      {
        id: 'mask-bruiser',
        name: 'Masked Bruiser',
        role: 'ENEMY',
        hp: 4,
        movement: 3,
        x: 9,
        y: 4,
        abilities: ['punch'],
        intent: 'Corner the fire-starter and drag them to whoever sent the masks — intimidation first, violence second.',
      },
      {
        id: 'mask-brawler',
        name: 'Masked Brawler',
        role: 'ENEMY',
        hp: 4,
        movement: 3,
        x: 11,
        y: 5,
        abilities: ['punch'],
        intent: 'Cut off the west exit and back up the bruiser no matter what it costs.',
      },
      {
        id: 'mask-volt',
        name: 'Volt',
        role: 'ENEMY',
        hp: 3,
        movement: 3,
        x: 12,
        y: 2,
        abilities: ['fireball', 'punch'],
        intent: 'A powered student showing off stolen electricity — wants a spectacle and an audience.',
      },
    ],
  };
}

/**
 * Deterministic combat dialogue: keyword rules over the player's quoted line,
 * with a speaker-flavored default. One line, in character, no randomness.
 */
export function demoDialogue(request: DialogueRequest): DialogueResponse {
  const quoted = /"([^"]{2,})"/.exec(request.prompt);
  const playerLine = (quoted?.[1] ?? '').toLowerCase();
  const speaker = request.speaker.toLowerCase();

  let line: string;
  if (playerLine !== '') {
    if (/(why|who sent|what do you want)/.test(playerLine)) {
      line = 'You know enough to be dangerous. That\'s the problem.';
    } else if (/(sorry|wait|please|stop)/.test(playerLine)) {
      line = 'Too late for sorry. You should have stayed home.';
    } else if (/(walk away|leave|let go|done)/.test(playerLine)) {
      line = 'Nobody walks away until the message is delivered.';
    } else {
      line = 'Big words. Let\'s see if you can back them up.';
    }
  } else if (speaker.includes('volt')) {
    line = 'Feel that hum? That\'s the sound of you losing.';
  } else {
    line = 'Nothing personal. You\'re just the example.';
  }
  return { lines: [line] };
}

export function demoStructured(request: { prompt: string }): StructuredResponse {
  return { data: demoEncounterSpec(request) as unknown as Record<string, unknown> };
}

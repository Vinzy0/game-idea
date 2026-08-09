import type { Ability } from './types';

export const PUNCH_ID = 'punch';
export const FIREBALL_ID = 'fireball';
export const FORCE_PUSH_ID = 'force-push';

export const PUNCH: Ability = {
  id: PUNCH_ID,
  name: 'Punch',
  description: 'Strike an adjacent enemy for 1 damage.',
  actionCost: 'ACTION',
  targeting: { kind: 'UNIT', team: 'ENEMY', range: 1 },
  area: { shape: 'SINGLE' },
  requirements: [],
  effects: [{ kind: 'DAMAGE', amount: 1 }],
  presentation: { color: 0xff7777, verb: 'attacks' },
};

export const FIREBALL: Ability = {
  id: FIREBALL_ID,
  name: 'Fireball',
  description: 'Blast enemies within 1 tile of a target tile for 2 damage.',
  actionCost: 'ACTION',
  targeting: { kind: 'TILE', range: 6 },
  area: { shape: 'RADIUS', radius: 1, affects: 'ENEMY' },
  requirements: [],
  effects: [{ kind: 'DAMAGE', amount: 2 }],
  presentation: { color: 0xffa657, verb: 'blasts' },
};

export const FORCE_PUSH: Ability = {
  id: FORCE_PUSH_ID,
  name: 'Force Push',
  description: 'Push an enemy up to 2 tiles directly away from the caster.',
  actionCost: 'ACTION',
  targeting: { kind: 'UNIT', team: 'ENEMY', range: 4 },
  area: { shape: 'SINGLE' },
  requirements: [],
  effects: [{ kind: 'PUSH', distance: 2, origin: 'CASTER' }],
  presentation: { color: 0xc297ff, verb: 'pushes' },
};

export const CORE_ABILITIES: readonly Ability[] = [PUNCH, FIREBALL, FORCE_PUSH];

import { describe, expect, it } from 'vitest';
import { planEnemyAction } from '../enemyBrain';
import type { AiQueries } from '../enemyBrain';
import type { Ability } from '../../abilities/types';
import type { GridPosition, Unit } from '../../combat/types';

function makeUnit(id: string, x: number, y: number, hp = 3): Unit {
  return {
    id,
    name: id.toUpperCase(),
    team: 'PLAYER',
    controller: 'PLAYER',
    hp,
    maxHp: hp,
    movement: 3,
    position: { x, y },
    abilityIds: [],
    statuses: [],
  };
}

function makeAbility(id: string, damage: number, targeting: 'UNIT' | 'TILE' = 'UNIT'): Ability {
  return {
    id,
    name: id,
    description: id,
    actionCost: 'ACTION',
    targeting:
      targeting === 'UNIT' ? { kind: 'UNIT', team: 'ENEMY', range: 1 } : { kind: 'TILE', range: 6 },
    area:
      targeting === 'UNIT' ? { shape: 'SINGLE' } : { shape: 'RADIUS', radius: 1, affects: 'ENEMY' },
    requirements: [],
    effects: damage > 0 ? [{ kind: 'DAMAGE', amount: damage }] : [],
    presentation: { color: 0xff7777, verb: 'attacks' },
  };
}

function makeQueries(overrides: Partial<AiQueries>): AiQueries {
  return {
    alivePlayers: () => [],
    getAbilitiesForUnit: () => [],
    canUseAbility: () => false,
    firstStepToward: () => null,
    moveUnit: () => false,
    useAbility: () => false,
    ...overrides,
  };
}

describe('planEnemyAction', () => {
  it('returns null when no players are alive', () => {
    const unit = makeUnit('e1', 0, 0);
    const queries = makeQueries({ alivePlayers: () => [] });

    expect(planEnemyAction(unit, queries)).toBeNull();
  });

  it('uses an in-range ability against the chosen hostile target', () => {
    const punch = makeAbility('punch', 1);
    const unit = makeUnit('e1', 0, 0);
    const player = makeUnit('p1', 1, 0);
    const queries = makeQueries({
      alivePlayers: () => [player],
      getAbilitiesForUnit: () => [punch],
      canUseAbility: () => true,
    });

    expect(planEnemyAction(unit, queries)).toEqual({
      type: 'USE_ABILITY',
      abilityId: 'punch',
      target: { kind: 'UNIT', unitId: 'p1' },
    });
  });

  it('picks the highest-damage ability when several are in range', () => {
    const punch = makeAbility('punch', 1);
    const fireball = makeAbility('fireball', 2, 'TILE');
    const unit = makeUnit('e1', 0, 0);
    const player = makeUnit('p1', 2, 0);
    const queries = makeQueries({
      alivePlayers: () => [player],
      getAbilitiesForUnit: () => [punch, fireball],
      canUseAbility: () => true,
    });

    expect(planEnemyAction(unit, queries)).toEqual({
      type: 'USE_ABILITY',
      abilityId: 'fireball',
      target: { kind: 'TILE', x: 2, y: 0 },
    });
  });

  it('moves one step toward the nearest player when nothing is in range', () => {
    const punch = makeAbility('punch', 1);
    const unit = makeUnit('e1', 0, 0);
    const player = makeUnit('p1', 3, 0);
    const queries = makeQueries({
      alivePlayers: () => [player],
      getAbilitiesForUnit: () => [punch],
      canUseAbility: () => false,
      firstStepToward: () => ({ x: 1, y: 0 }),
    });

    expect(planEnemyAction(unit, queries)).toEqual({ type: 'MOVE', x: 1, y: 0 });
  });

  it('targets the lower-hp player when two players are equidistant', () => {
    const unit = makeUnit('e1', 0, 0);
    const healthy = makeUnit('p1', 2, 0, 5);
    const hurt = makeUnit('p2', 0, 2, 1);
    let stepTo: GridPosition | null = null;
    const queries = makeQueries({
      alivePlayers: () => [healthy, hurt],
      firstStepToward: (_from, to) => {
        stepTo = to;
        return null;
      },
    });

    expect(planEnemyAction(unit, queries)).toBeNull();
    expect(stepTo).toEqual({ x: 0, y: 2 });
  });

  it('returns null when no step toward the target exists', () => {
    const unit = makeUnit('e1', 0, 0);
    const player = makeUnit('p1', 3, 0);
    const queries = makeQueries({
      alivePlayers: () => [player],
      firstStepToward: () => null,
    });

    expect(planEnemyAction(unit, queries)).toBeNull();
  });

  it('ignores abilities without valid targets and falls through to movement', () => {
    const punch = makeAbility('punch', 1);
    const unit = makeUnit('e1', 0, 0);
    const player = makeUnit('p1', 3, 0);
    const queries = makeQueries({
      alivePlayers: () => [player],
      getAbilitiesForUnit: () => [punch],
      canUseAbility: () => false,
      firstStepToward: () => ({ x: 0, y: 1 }),
    });

    expect(planEnemyAction(unit, queries)).toEqual({ type: 'MOVE', x: 0, y: 1 });
  });

  it('prefers the first ability in list order when damages tie', () => {
    const punch = makeAbility('punch', 1);
    const push = makeAbility('force-push', 1);
    const unit = makeUnit('e1', 0, 0);
    const player = makeUnit('p1', 1, 0);
    const queries = makeQueries({
      alivePlayers: () => [player],
      getAbilitiesForUnit: () => [punch, push],
      canUseAbility: () => true,
    });

    expect(planEnemyAction(unit, queries)).toEqual({
      type: 'USE_ABILITY',
      abilityId: 'punch',
      target: { kind: 'UNIT', unitId: 'p1' },
    });
  });

  it('does not spend an action on a non-damaging ability', () => {
    const utility = makeAbility('utility', 0);
    const unit = makeUnit('e1', 0, 0);
    const player = makeUnit('p1', 3, 0);
    const queries = makeQueries({
      alivePlayers: () => [player],
      getAbilitiesForUnit: () => [utility],
      canUseAbility: () => true,
      firstStepToward: () => ({ x: 1, y: 0 }),
    });

    expect(planEnemyAction(unit, queries)).toEqual({ type: 'MOVE', x: 1, y: 0 });
  });
});

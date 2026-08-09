import { describe, expect, it } from 'vitest';
import { FIREBALL_ID, FORCE_PUSH_ID, PUNCH_ID } from '../catalog';
import type { Ability } from '../types';
import { TacticalEngine } from '../../combat/engine';
import type { Team, UnitConfig } from '../../combat/types';

function makeUnit(
  id: string,
  team: Team,
  x: number,
  y: number,
  options: Partial<UnitConfig> = {},
): UnitConfig {
  const hp = options.hp ?? 5;
  return {
    id,
    name: id.toUpperCase(),
    team,
    controller: team === 'PLAYER' ? 'PLAYER' : 'AI',
    hp,
    maxHp: options.maxHp ?? hp,
    movement: options.movement ?? 3,
    position: { x, y },
    abilityIds: options.abilityIds ?? [PUNCH_ID],
    statuses: options.statuses ?? [],
  };
}

describe('data-driven ability system', () => {
  it('routes Punch through generic targeting, damage, and action cost', () => {
    const engine = new TacticalEngine({
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: [PUNCH_ID] }),
        makeUnit('enemy', 'ENEMY', 1, 0),
      ],
    });
    const target = { kind: 'UNIT', unitId: 'enemy' } as const;

    expect(engine.canUseAbility('hero', PUNCH_ID, target)).toBe(true);
    expect(engine.useAbility('hero', PUNCH_ID, target)).toBe(true);
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.hp).toBe(4);
    expect(engine.state.turnResources.hero.actionRemaining).toBe(0);
    expect(engine.canUseAbility('hero', PUNCH_ID, target)).toBe(false);
  });

  it('uses Fireball tile targeting and a reusable radius area', () => {
    const engine = new TacticalEngine({
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: [FIREBALL_ID] }),
        makeUnit('ally', 'PLAYER', 2, 0),
        makeUnit('e1', 'ENEMY', 3, 0),
        makeUnit('e2', 'ENEMY', 3, 1),
        makeUnit('e3', 'ENEMY', 5, 0),
      ],
    });
    const target = { kind: 'TILE', x: 3, y: 0 } as const;

    expect(engine.getAffectedUnitIds('hero', FIREBALL_ID, target).sort()).toEqual(['e1', 'e2']);
    expect(engine.useAbility('hero', FIREBALL_ID, target)).toBe(true);
    expect(engine.state.units.find((unit) => unit.id === 'e1')!.hp).toBe(3);
    expect(engine.state.units.find((unit) => unit.id === 'e2')!.hp).toBe(3);
    expect(engine.state.units.find((unit) => unit.id === 'e3')!.hp).toBe(5);
    expect(engine.state.units.find((unit) => unit.id === 'ally')!.hp).toBe(5);
  });

  it('uses Force Push through the generic push primitive', () => {
    const engine = new TacticalEngine({
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: [FORCE_PUSH_ID] }),
        makeUnit('enemy', 'ENEMY', 2, 0),
      ],
    });

    expect(engine.useAbility('hero', FORCE_PUSH_ID, { kind: 'UNIT', unitId: 'enemy' })).toBe(true);
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.position).toEqual({
      x: 4,
      y: 0,
    });
  });

  it('stops push movement at blocked tiles and occupied tiles', () => {
    const engine = new TacticalEngine({
      objects: [{ id: 'wall-4-0', kind: 'WALL', x: 4, y: 0 }],
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: [FORCE_PUSH_ID] }),
        makeUnit('enemy', 'ENEMY', 2, 0),
        makeUnit('blocker', 'ENEMY', 5, 0),
      ],
    });

    engine.useAbility('hero', FORCE_PUSH_ID, { kind: 'UNIT', unitId: 'enemy' });
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.position).toEqual({
      x: 3,
      y: 0,
    });
  });

  it('supports a new healing bonus action entirely through ability data', () => {
    const mend: Ability = {
      id: 'mend',
      name: 'Mend',
      description: 'Restore 2 HP to a damaged ally.',
      actionCost: 'BONUS_ACTION',
      targeting: { kind: 'UNIT', team: 'ALLY', range: 2 },
      area: { shape: 'SINGLE' },
      requirements: [{ kind: 'TARGET_DAMAGED' }],
      effects: [{ kind: 'HEAL', amount: 2 }],
      presentation: { color: 0x55cc88, verb: 'heals' },
    };
    const engine = new TacticalEngine({
      abilities: [mend],
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: ['mend', PUNCH_ID] }),
        makeUnit('ally', 'PLAYER', 0, 1, { hp: 2, maxHp: 5 }),
        makeUnit('enemy', 'ENEMY', 1, 0),
      ],
    });

    expect(engine.useAbility('hero', 'mend', { kind: 'UNIT', unitId: 'ally' })).toBe(true);
    expect(engine.state.units.find((unit) => unit.id === 'ally')!.hp).toBe(4);
    expect(engine.state.turnResources.hero).toMatchObject({
      actionRemaining: 1,
      bonusActionRemaining: 0,
    });
    expect(engine.attack('hero', 'enemy')).toBe(true);
  });

  it('applies, refreshes, and expires statuses through generic status data', () => {
    const mark: Ability = {
      id: 'mark',
      name: 'Mark',
      description: 'Mark an enemy for two of its turns.',
      actionCost: 'ACTION',
      targeting: { kind: 'UNIT', team: 'ENEMY', range: 4 },
      area: { shape: 'SINGLE' },
      requirements: [],
      effects: [
        {
          kind: 'APPLY_STATUS',
          status: { id: 'marked', name: 'Marked', durationTurns: 2 },
        },
      ],
      presentation: { color: 0xffdd66, verb: 'marks' },
    };
    const engine = new TacticalEngine({
      abilities: [mark],
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: ['mark'] }),
        makeUnit('enemy', 'ENEMY', 3, 0, { movement: 0 }),
      ],
    });

    engine.useAbility('hero', 'mark', { kind: 'UNIT', unitId: 'enemy' });
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.statuses).toMatchObject([
      { id: 'marked', remainingTurns: 2, sourceUnitId: 'hero' },
    ]);

    engine.endTurn();
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.statuses[0].remainingTurns).toBe(
      1,
    );

    engine.useAbility('hero', 'mark', { kind: 'UNIT', unitId: 'enemy' });
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.statuses[0].remainingTurns).toBe(
      2,
    );
    engine.endTurn();
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.statuses[0].remainingTurns).toBe(
      1,
    );
    engine.endTurn();
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.statuses).toEqual([]);
    expect(engine.state.log).toContain('Marked expired on ENEMY');
  });

  it('filters valid targets by target kind, allegiance, range, and requirements', () => {
    const mend: Ability = {
      id: 'mend',
      name: 'Mend',
      description: 'Restore health.',
      actionCost: 'BONUS_ACTION',
      targeting: { kind: 'UNIT', team: 'ALLY', range: 2 },
      area: { shape: 'SINGLE' },
      requirements: [{ kind: 'TARGET_DAMAGED' }],
      effects: [{ kind: 'HEAL', amount: 1 }],
      presentation: { color: 0x55cc88, verb: 'heals' },
    };
    const engine = new TacticalEngine({
      abilities: [mend],
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: ['mend'] }),
        makeUnit('hurt', 'PLAYER', 1, 0, { hp: 2, maxHp: 3 }),
        makeUnit('full', 'PLAYER', 0, 2),
        makeUnit('far', 'PLAYER', 5, 0, { hp: 2, maxHp: 3 }),
        makeUnit('enemy', 'ENEMY', 1, 1, { hp: 2, maxHp: 3 }),
      ],
    });

    expect(engine.getValidAbilityTargets('hero', 'mend')).toEqual([
      { kind: 'UNIT', unitId: 'hurt' },
    ]);
  });

  it('can add a simple damaging ability as data with no engine branch', () => {
    const arcBolt: Ability = {
      id: 'arc-bolt',
      name: 'Arc Bolt',
      description: 'Deal 3 damage at range.',
      actionCost: 'ACTION',
      targeting: { kind: 'UNIT', team: 'ENEMY', range: 4 },
      area: { shape: 'SINGLE' },
      requirements: [],
      effects: [{ kind: 'DAMAGE', amount: 3 }],
      presentation: { color: 0x66ddff, verb: 'shocks' },
    };
    const engine = new TacticalEngine({
      abilities: [arcBolt],
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: ['arc-bolt'] }),
        makeUnit('enemy', 'ENEMY', 3, 0),
      ],
    });

    expect(engine.useAbility('hero', 'arc-bolt', { kind: 'UNIT', unitId: 'enemy' })).toBe(true);
    expect(engine.state.units.find((unit) => unit.id === 'enemy')!.hp).toBe(2);
    expect(engine.state.log).toContain('HERO shocks ENEMY for 3 damage');
  });

  it('does not spend resources when a target is invalid', () => {
    const engine = new TacticalEngine({
      objects: [{ id: 'wall-2-0', kind: 'WALL', x: 2, y: 0 }],
      units: [
        makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: [FIREBALL_ID] }),
        makeUnit('enemy', 'ENEMY', 4, 0),
      ],
    });

    expect(engine.useAbility('hero', FIREBALL_ID, { kind: 'TILE', x: 2, y: 0 })).toBe(false);
    expect(engine.state.turnResources.hero.actionRemaining).toBe(1);
  });

  it('spends movement by path distance and refreshes it on the next turn', () => {
    const engine = new TacticalEngine({
      units: [makeUnit('hero', 'PLAYER', 0, 0), makeUnit('enemy', 'ENEMY', 9, 9, { movement: 0 })],
    });

    expect(engine.moveUnit('hero', 2, 0)).toBe(true);
    expect(engine.state.turnResources.hero.movementRemaining).toBe(1);
    expect(engine.moveUnit('hero', 2, 1)).toBe(true);
    expect(engine.state.turnResources.hero.movementRemaining).toBe(0);
    expect(engine.moveUnit('hero', 2, 2)).toBe(false);

    engine.endTurn();
    expect(engine.state.turnResources.hero.movementRemaining).toBe(3);
  });

  it('fails fast when a unit references an unknown ability id', () => {
    expect(
      () =>
        new TacticalEngine({
          units: [makeUnit('hero', 'PLAYER', 0, 0, { abilityIds: ['missing'] })],
        }),
    ).toThrow('Unit hero references unknown ability: missing');
  });
});

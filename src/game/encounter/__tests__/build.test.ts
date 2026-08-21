import { describe, expect, it } from 'vitest';
import { TacticalEngine } from '../../combat/engine';
import { buildEncounter } from '../build';
import { demoEncounterSpec } from '../../../ai/demoEncounter';
import { parseEncounterSpec, type EncounterSpec } from '../spec';

function validSpec(overrides: Partial<EncounterSpec> = {}): EncounterSpec {
  return {
    kind: 'encounter-spec',
    version: 1,
    title: 'Test Fight',
    narrativeContext: 'A test.',
    width: 10,
    height: 8,
    objects: [],
    terrain: [],
    units: [
      { id: 'p1', name: 'Hero', role: 'PLAYER', hp: 10, movement: 3, x: 2, y: 4, abilities: ['punch'], intent: 'survive' },
      { id: 'e1', name: 'Thug', role: 'ENEMY', hp: 3, movement: 2, x: 7, y: 4, abilities: ['punch'], intent: 'win' },
    ],
    ...overrides,
  };
}

describe('parseEncounterSpec', () => {
  it('accepts a valid spec and rejects garbage', () => {
    expect(parseEncounterSpec(validSpec())).not.toBeNull();
    expect(parseEncounterSpec({ nope: true })).toBeNull();
    expect(parseEncounterSpec(validSpec({ kind: 'other' as never }))).toBeNull();
    expect(parseEncounterSpec(validSpec({ units: 'no' as never }))).toBeNull();
    expect(
      parseEncounterSpec(validSpec({ units: [{ ...validSpec().units[0], hp: 'many' as never }] })),
    ).toBeNull();
  });
});

describe('buildEncounter', () => {
  it('builds an engine-runnable config from the demo spec', () => {
    const built = buildEncounter(demoEncounterSpec({ prompt: '{"playerName":"Alex"}' }));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // The engine accepts the config without throwing — that is the contract.
    expect(() => new TacticalEngine(built.encounter.config)).not.toThrow();
    expect(built.encounter.playerUnitIds).toEqual(['player']);
    expect(built.encounter.enemyUnitIds).toHaveLength(3);
    expect(built.encounter.intents['mask-volt']).toContain('electricity');
  });

  it('rejects out-of-bounds unit spawns', () => {
    const built = buildEncounter(validSpec({ units: validSpec().units.map((u) => ({ ...u, x: 99 })) }));
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.errors.join(' ')).toMatch(/out of bounds/);
  });

  it('rejects enemies walled off from the player', () => {
    const wallRow = Array.from({ length: 10 }, (_, x) => ({ kind: 'WALL' as const, x, y: 4 }));
    const spec = validSpec({
      objects: wallRow,
      units: [
        { id: 'p1', name: 'Hero', role: 'PLAYER', hp: 10, movement: 3, x: 2, y: 2, abilities: ['punch'], intent: 'survive' },
        { id: 'e1', name: 'Thug', role: 'ENEMY', hp: 3, movement: 2, x: 7, y: 6, abilities: ['punch'], intent: 'win' },
      ],
    });
    const built = buildEncounter(spec);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.errors.join(' ')).toMatch(/reachable/);
  });

  it('repairs overlapping spawns with a warning instead of failing', () => {
    const spec = validSpec({
      units: [
        { id: 'p1', name: 'Hero', role: 'PLAYER', hp: 10, movement: 3, x: 4, y: 4, abilities: ['punch'], intent: 'a' },
        { id: 'e1', name: 'Thug', role: 'ENEMY', hp: 3, movement: 2, x: 4, y: 4, abilities: ['punch'], intent: 'b' },
      ],
    });
    const built = buildEncounter(spec);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.report.warnings.join(' ')).toMatch(/moved/);
    const positions = built.encounter.config.units.map((u) => `${u.position.x},${u.position.y}`);
    expect(new Set(positions).size).toBe(2);
  });

  it('drops unknown abilities and clamps absurd stats with warnings', () => {
    const spec = validSpec({
      units: [
        { id: 'p1', name: 'Hero', role: 'PLAYER', hp: 999, movement: 99, x: 2, y: 4, abilities: ['teleport'], intent: 'a' },
        { id: 'e1', name: 'Thug', role: 'ENEMY', hp: 3, movement: 2, x: 7, y: 4, abilities: ['punch'], intent: 'b' },
      ],
    });
    const built = buildEncounter(spec);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const hero = built.encounter.config.units.find((u) => u.id === 'p1')!;
    expect(hero.maxHp).toBe(30);
    expect(hero.movement).toBe(6);
    expect(hero.abilityIds).toEqual(['punch']); // unknown dropped -> fallback Punch
    expect(built.report.warnings.length).toBeGreaterThan(0);
  });
});

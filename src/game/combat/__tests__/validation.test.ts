import { describe, expect, it } from 'vitest';
import { PUNCH_ID } from '../../abilities/catalog';
import { TacticalEngine } from '../engine';
import { createObject } from '../environment';
import type { Unit } from '../types';
import { validateEncounterSetup } from '../validation';

function unit(id: string, x: number, y: number): Unit {
  return {
    id,
    name: id.toUpperCase(),
    team: 'PLAYER',
    controller: 'PLAYER',
    hp: 3,
    maxHp: 3,
    movement: 3,
    position: { x, y },
    abilityIds: [PUNCH_ID],
    statuses: [],
  };
}

describe('validateEncounterSetup', () => {
  it('accepts a mechanically valid encounter setup', () => {
    expect(
      validateEncounterSetup({
        width: 4,
        height: 4,
        objects: [createObject({ id: 'wall', kind: 'WALL', x: 2, y: 2 })],
        terrain: [{ x: 1, y: 1 }],
        units: [unit('hero', 0, 0)],
      }),
    ).toEqual([]);
  });

  it('reports identifiers, coordinates, spawns, and numeric invariants together', () => {
    const first = unit('hero', 1, 1);
    const second = {
      ...unit('hero', 1, 1),
      hp: 4,
      maxHp: 3,
      movement: -1,
      abilityIds: [PUNCH_ID, PUNCH_ID],
    };
    const errors = validateEncounterSetup({
      width: 4,
      height: 4,
      objects: [
        createObject({ id: 'wall', kind: 'WALL', x: 1, y: 1 }),
        createObject({ id: 'wall', kind: 'WALL', x: 2, y: 2 }),
      ],
      terrain: [
        { x: 0, y: 3 },
        { x: 0, y: 3 },
      ],
      units: [first, second],
    });

    expect(errors).toContain('Duplicate object id: wall');
    expect(errors).toContain('Duplicate terrain tile at (0,3)');
    expect(errors).toContain('Duplicate unit id: hero');
    expect(errors).toContain('Multiple units at (1,1)');
    expect(errors).toContain('Unit hero spawns inside blocking object wall');
    expect(errors).toContain('Unit hero hp must be an integer between 0 and maxHp');
    expect(errors).toContain('Unit hero movement must be a non-negative integer');
    expect(errors).toContain('Unit hero references ability punch more than once');
  });

  it('makes the engine reject invalid dimensions instead of silently clamping them', () => {
    expect(() => new TacticalEngine({ width: 0, height: 4, units: [unit('hero', 0, 0)] })).toThrow(
      /Invalid encounter: Map width must be a positive integer/,
    );
  });

  it('rejects unknown object kinds with a deterministic message', () => {
    expect(() => createObject({ id: 'mystery', kind: 'WINDOW' as never, x: 0, y: 0 })).toThrow(
      'Unknown map object kind: WINDOW',
    );
  });
});

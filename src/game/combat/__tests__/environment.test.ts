import { describe, expect, it } from 'vitest';
import {
  createObject,
  movementCostAt,
  objectBlocksMovement,
  validateEnvironment,
} from '../environment';
import type { MapObject, ObjectKind } from '../environment';

const KINDS: readonly ObjectKind[] = ['WALL', 'DESK', 'LOCKER', 'DOOR', 'BARREL', 'HAZARD'];

interface ExpectedDefaults {
  destructible: boolean;
  interactable: boolean;
  blocksMovement: boolean;
  hp: number;
  open: boolean;
}

const EXPECTED_DEFAULTS: Record<ObjectKind, ExpectedDefaults> = {
  WALL: { destructible: false, interactable: false, blocksMovement: true, hp: 0, open: false },
  DESK: { destructible: true, interactable: false, blocksMovement: true, hp: 3, open: false },
  LOCKER: { destructible: true, interactable: false, blocksMovement: true, hp: 4, open: false },
  DOOR: { destructible: false, interactable: true, blocksMovement: true, hp: 0, open: false },
  BARREL: { destructible: true, interactable: false, blocksMovement: true, hp: 2, open: false },
  HAZARD: { destructible: false, interactable: false, blocksMovement: false, hp: 0, open: false },
};

function makeObject(kind: ObjectKind, x: number, y: number, hp?: number): MapObject {
  return createObject({ id: kind.toLowerCase(), kind, x, y, hp });
}

describe('createObject', () => {
  it('applies the kind defaults for every kind', () => {
    for (const kind of KINDS) {
      const object = makeObject(kind, 1, 2);
      const expected = EXPECTED_DEFAULTS[kind];
      expect(object.kind).toBe(kind);
      expect(object.position).toEqual({ x: 1, y: 2 });
      expect(object.destructible).toBe(expected.destructible);
      expect(object.interactable).toBe(expected.interactable);
      expect(object.blocksMovement).toBe(expected.blocksMovement);
      expect(object.hp).toBe(expected.hp);
      expect(object.maxHp).toBe(expected.hp);
      expect(object.open).toBe(expected.open);
    }
  });

  it('honors an explicit hp override on destructible kinds and ignores hp otherwise', () => {
    const barrel = makeObject('BARREL', 3, 3, 5);
    expect(barrel.hp).toBe(5);
    expect(barrel.maxHp).toBe(5);

    const wall = makeObject('WALL', 0, 0, 99);
    expect(wall.hp).toBe(0);
    expect(wall.maxHp).toBe(0);
    expect(wall.destructible).toBe(false);
  });
});

describe('movementCostAt', () => {
  it('costs 1 on a normal tile and 2 on a difficult terrain tile', () => {
    const terrain = [
      { x: 2, y: 2 },
      { x: 5, y: 0 },
    ];
    expect(movementCostAt(1, 1, terrain)).toBe(1);
    expect(movementCostAt(2, 2, terrain)).toBe(2);
    expect(movementCostAt(5, 0, terrain)).toBe(2);
    expect(movementCostAt(2, 3, terrain)).toBe(1);
    expect(movementCostAt(0, 0, [])).toBe(1);
  });
});

describe('objectBlocksMovement', () => {
  it('treats closed doors as blocking and open doors as passable', () => {
    const door = makeObject('DOOR', 4, 4);
    expect(objectBlocksMovement(door)).toBe(true);
    expect(objectBlocksMovement({ ...door, open: true })).toBe(false);
  });

  it('defers to the blocksMovement flag for every other kind', () => {
    expect(objectBlocksMovement(makeObject('WALL', 0, 0))).toBe(true);
    expect(objectBlocksMovement(makeObject('DESK', 1, 1))).toBe(true);
    expect(objectBlocksMovement(makeObject('HAZARD', 2, 2))).toBe(false);
  });
});

describe('validateEnvironment', () => {
  it('returns no errors for a valid layout', () => {
    const objects = [
      makeObject('WALL', 0, 0),
      makeObject('BARREL', 2, 2),
      makeObject('DOOR', 5, 5),
    ];
    const terrain = [{ x: 1, y: 1 }];
    expect(validateEnvironment(objects, terrain, 10, 10)).toEqual([]);
  });

  it('flags an out-of-bounds object position', () => {
    const errors = validateEnvironment([makeObject('WALL', 10, 0)], [], 10, 10);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('out of bounds');
  });

  it('flags an out-of-bounds terrain tile', () => {
    const errors = validateEnvironment([], [{ x: 0, y: -1 }], 10, 10);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('out of bounds');
  });

  it('flags two objects at the same position', () => {
    const errors = validateEnvironment(
      [makeObject('WALL', 3, 3), makeObject('DESK', 3, 3)],
      [],
      10,
      10,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Multiple objects');
  });

  it('flags a destructible object with hp below 1', () => {
    const errors = validateEnvironment([makeObject('BARREL', 4, 4, 0)], [], 10, 10);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('maxHp');
  });

  it('flags terrain tiles that overlap an object position', () => {
    const errors = validateEnvironment([makeObject('WALL', 6, 6)], [{ x: 6, y: 6 }], 10, 10);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('overlaps');
  });
});

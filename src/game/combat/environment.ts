import type { GridPosition } from './types';

export type ObjectKind = 'WALL' | 'DESK' | 'LOCKER' | 'DOOR' | 'BARREL' | 'HAZARD';

export interface MapObject {
  id: string;
  kind: ObjectKind;
  position: GridPosition;
  hp: number; // >0 only for destructible kinds
  maxHp: number;
  destructible: boolean;
  blocksMovement: boolean;
  interactable: boolean;
  open: boolean; // doors only
}

export interface MapObjectConfig {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  hp?: number;
}

interface KindDefaults {
  destructible: boolean;
  interactable: boolean;
  blocksMovement: boolean;
  defaultHp: number;
}

const KIND_DEFAULTS: Record<ObjectKind, KindDefaults> = {
  WALL: { destructible: false, interactable: false, blocksMovement: true, defaultHp: 0 },
  DESK: { destructible: true, interactable: false, blocksMovement: true, defaultHp: 3 },
  LOCKER: { destructible: true, interactable: false, blocksMovement: true, defaultHp: 4 },
  DOOR: { destructible: false, interactable: true, blocksMovement: true, defaultHp: 0 },
  BARREL: { destructible: true, interactable: false, blocksMovement: true, defaultHp: 2 },
  HAZARD: { destructible: false, interactable: false, blocksMovement: false, defaultHp: 0 },
};

export function createObject(config: MapObjectConfig): MapObject {
  const defaults = KIND_DEFAULTS[config.kind];
  if (defaults === undefined) {
    throw new Error(`Unknown map object kind: ${String(config.kind)}`);
  }
  const hp = defaults.destructible ? (config.hp ?? defaults.defaultHp) : 0;
  return {
    id: config.id,
    kind: config.kind,
    position: { x: config.x, y: config.y },
    hp,
    maxHp: hp,
    destructible: defaults.destructible,
    blocksMovement: defaults.blocksMovement,
    interactable: defaults.interactable,
    open: false,
  };
}

export function movementCostAt(x: number, y: number, terrain: readonly GridPosition[]): number {
  return terrain.some((tile) => tile.x === x && tile.y === y) ? 2 : 1;
}

export function objectBlocksMovement(object: MapObject): boolean {
  if (object.kind === 'DOOR') return !object.open;
  return object.blocksMovement;
}

export function validateEnvironment(
  objects: readonly MapObject[],
  terrain: readonly GridPosition[],
  width: number,
  height: number,
): string[] {
  const errors: string[] = [];
  const isInBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;

  for (const object of objects) {
    if (!isInBounds(object.position.x, object.position.y)) {
      errors.push(
        `Object ${object.id} at (${object.position.x},${object.position.y}) is out of bounds`,
      );
    }
    if (object.destructible && object.maxHp < 1) {
      errors.push(`Destructible object ${object.id} must have maxHp >= 1`);
    }
  }

  for (const tile of terrain) {
    if (!isInBounds(tile.x, tile.y)) {
      errors.push(`Terrain tile at (${tile.x},${tile.y}) is out of bounds`);
    }
  }

  const seen = new Set<string>();
  for (const object of objects) {
    const key = `${object.position.x},${object.position.y}`;
    if (seen.has(key)) {
      errors.push(`Multiple objects at (${object.position.x},${object.position.y})`);
    }
    seen.add(key);
  }

  const objectKeys = new Set(objects.map((object) => `${object.position.x},${object.position.y}`));
  for (const tile of terrain) {
    if (objectKeys.has(`${tile.x},${tile.y}`)) {
      errors.push(`Terrain tile at (${tile.x},${tile.y}) overlaps an object`);
    }
  }

  return errors;
}

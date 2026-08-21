import { FIREBALL_ID, FORCE_PUSH_ID, PUNCH_ID } from '../abilities/catalog';
import { createObject, objectBlocksMovement } from '../combat/environment';
import type { MapObject } from '../combat/environment';
import type { GameConfig, GridPosition } from '../combat/types';

/**
 * Phase 6A persistent-scene fixture: a permanent 32x32 school hallway that
 * starts in EXPLORATION. This is the hand-authored ancestor of the Phase 6C.1
 * template compiler — every design decision here (walls, door chokepoint,
 * prop slots, spawn slots, exit markers) is the seed of `school_hallway_v1`.
 *
 * Layout:
 * - North wall with a door at (16,0), south wall, and short side stubs.
 * - A divider wall at x=20 (y=2..13) with a closed door at (20,8); the south
 *   corridor below y=14 stays open.
 * - West half: hero spawn, neutral civilian, desks, lockers, a barrel, a
 *   chemical hazard, and the exit marker toward the science wing.
 * - East half: two brawlers + a Firebrand, desks, lockers, a barrel, a
 *   hazard, and the exit marker toward the classroom wing.
 */

export const HALLWAY_SCENE_ID = 'school-hallway-a1';
export const HALLWAY_TITLE = 'West Wing Hallway';
export const HALLWAY_DESCRIPTION =
  'A long second-floor hallway of Westfield High: lockers to the west, the science wing through a half-open door in the middle divider, and trouble gathering in the east corridor.';

export interface SceneExitMarker {
  id: string;
  label: string;
  position: GridPosition;
  arrivalPosition: GridPosition;
  destinationHint: string;
  destinationScope: 'SAME_LOCATION' | 'NEW_LOCATION';
  destinationSceneId: string | null;
}

export interface SceneTemplate {
  sceneId: string;
  title: string;
  description: string;
  config: GameConfig;
  exits: SceneExitMarker[];
}

function wall(id: string, x: number, y: number) {
  return { id, kind: 'WALL' as const, x, y };
}

export function createSchoolHallwayScene(): SceneTemplate {
  const objects: GameConfig['objects'] = [];
  const add = (object: NonNullable<GameConfig['objects']>[number]) => {
    objects.push(object);
  };

  // North wall with the door gap at x=16.
  for (let x = 0; x < 32; x += 1) {
    if (x === 16) continue;
    add(wall(`wall-n-${x}`, x, 0));
  }
  add({ id: 'door-main', kind: 'DOOR', x: 16, y: 0 });
  // South wall.
  for (let x = 0; x < 32; x += 1) add(wall(`wall-s-${x}`, x, 31));
  // Short side stubs anchor the corridor visually.
  for (let y = 1; y <= 6; y += 1) {
    add(wall(`wall-w-${y}`, 0, y));
    add(wall(`wall-e-${y}`, 31, y));
  }
  // Divider wall with a chokepoint door at (20,8).
  for (let y = 2; y <= 13; y += 1) {
    if (y === 8) continue;
    add(wall(`wall-div-${y}`, 20, y));
  }
  add({ id: 'door-divider', kind: 'DOOR', x: 20, y: 8 });

  // West-half props.
  add({ id: 'desk-w1', kind: 'DESK', x: 8, y: 10 });
  add({ id: 'desk-w2', kind: 'DESK', x: 8, y: 11 });
  add({ id: 'desk-w3', kind: 'DESK', x: 8, y: 12 });
  add({ id: 'desk-w4', kind: 'DESK', x: 13, y: 22 });
  add({ id: 'locker-w1', kind: 'LOCKER', x: 5, y: 14 });
  add({ id: 'locker-w2', kind: 'LOCKER', x: 5, y: 15 });
  add({ id: 'locker-w3', kind: 'LOCKER', x: 5, y: 16 });
  add({ id: 'barrel-w1', kind: 'BARREL', x: 15, y: 26 });
  add({ id: 'hazard-w1', kind: 'HAZARD', x: 10, y: 24 });

  // East-half props.
  add({ id: 'desk-e1', kind: 'DESK', x: 24, y: 10 });
  add({ id: 'desk-e2', kind: 'DESK', x: 25, y: 10 });
  add({ id: 'desk-e3', kind: 'DESK', x: 24, y: 11 });
  add({ id: 'locker-e1', kind: 'LOCKER', x: 27, y: 18 });
  add({ id: 'locker-e2', kind: 'LOCKER', x: 27, y: 19 });
  add({ id: 'barrel-e1', kind: 'BARREL', x: 24, y: 20 });
  add({ id: 'hazard-e1', kind: 'HAZARD', x: 27, y: 24 });

  const terrain: GridPosition[] = [
    { x: 3, y: 25 },
    { x: 7, y: 22 },
    { x: 14, y: 10 },
    { x: 23, y: 9 },
    { x: 28, y: 26 },
  ];

  const units: GameConfig['units'] = [
    {
      id: 'hero',
      name: 'Maya',
      team: 'PLAYER',
      controller: 'PLAYER',
      hp: 16,
      maxHp: 16,
      movement: 3,
      position: { x: 4, y: 26 },
      abilityIds: [PUNCH_ID, FIREBALL_ID, FORCE_PUSH_ID],
    },
    {
      id: 'sam',
      name: 'Sam',
      team: 'NEUTRAL',
      controller: 'AI',
      hp: 4,
      maxHp: 4,
      movement: 3,
      position: { x: 6, y: 25 },
      abilityIds: [],
    },
    {
      id: 'brawler-1',
      name: 'Roughneck',
      team: 'ENEMY',
      controller: 'AI',
      hp: 3,
      maxHp: 3,
      movement: 2,
      position: { x: 23, y: 12 },
      abilityIds: [PUNCH_ID],
    },
    {
      id: 'brawler-2',
      name: 'Tough',
      team: 'ENEMY',
      controller: 'AI',
      hp: 3,
      maxHp: 3,
      movement: 2,
      position: { x: 26, y: 22 },
      abilityIds: [PUNCH_ID],
    },
    {
      id: 'firebrand',
      name: 'Firebrand',
      team: 'ENEMY',
      controller: 'AI',
      hp: 3,
      maxHp: 3,
      movement: 2,
      position: { x: 29, y: 10 },
      abilityIds: [FIREBALL_ID, PUNCH_ID],
    },
  ];

  return {
    sceneId: HALLWAY_SCENE_ID,
    title: HALLWAY_TITLE,
    description: HALLWAY_DESCRIPTION,
    config: {
      width: 32,
      height: 32,
      sceneId: HALLWAY_SCENE_ID,
      initialPhase: 'EXPLORATION',
      objects,
      terrain,
      units,
    },
    exits: [
      {
        id: 'exit-science',
        label: 'Science Wing',
        position: { x: 1, y: 16 },
        arrivalPosition: { x: 2, y: 16 },
        destinationHint: 'The science wing, west',
        destinationScope: 'NEW_LOCATION',
        destinationSceneId: null,
      },
      {
        id: 'exit-classroom',
        label: 'Classroom Wing',
        position: { x: 30, y: 16 },
        arrivalPosition: { x: 29, y: 16 },
        destinationHint: 'The classroom wing, east',
        destinationScope: 'SAME_LOCATION',
        destinationSceneId: null,
      },
    ],
  };
}

function isWalkable(tile: GridPosition, objects: readonly MapObject[]): boolean {
  return !objects.some(
    (object) =>
      object.position.x === tile.x &&
      object.position.y === tile.y &&
      // Doors are interactable passages for template reachability: the flood
      // assumes they can be opened. Runtime pathfinding uses their live state.
      object.kind !== 'DOOR' &&
      objectBlocksMovement(object),
  );
}

/**
 * Deterministic mechanical playability checks for a 32x32 scene template
 * (Phase 6A fixture; the Phase 6C.1 compiler will formalize this contract).
 */
export function validateSceneTemplate(template: SceneTemplate): string[] {
  const { config, exits } = template;
  const errors: string[] = [];
  const { width, height, objects = [], units = [] } = config;
  const sceneObjects = objects.map((object) => createObject(object));

  if (width !== 32 || height !== 32) {
    errors.push(`Scene ${template.sceneId} must be exactly 32x32`);
    return errors;
  }
  if (units.length === 0) errors.push('Scene must contain at least one unit');
  if (units.length > 16) errors.push('Scene exceeds the 16-actor limit');
  if (units.filter((unit) => unit.team === 'ENEMY').length > 8) {
    errors.push('Scene exceeds the 8-enemy limit');
  }
  if (sceneObjects.length > 128) errors.push('Scene exceeds the 128-object limit');
  if (exits.length < 1 || exits.length > 4) errors.push('Scene must have 1-4 exits');

  const blockers = sceneObjects.filter((object) => object.kind !== 'DOOR');
  const exitTiles = new Set<string>();
  for (const exit of exits) {
    exitTiles.add(`${exit.position.x},${exit.position.y}`);
    if (!isWalkable(exit.position, blockers)) {
      errors.push(`Exit ${exit.id} marker is not walkable`);
    }
    if (!isWalkable(exit.arrivalPosition, blockers)) {
      errors.push(`Exit ${exit.id} arrival is not walkable`);
    }
    if (
      exit.position.x < 0 ||
      exit.position.y < 0 ||
      exit.position.x >= width ||
      exit.position.y >= height
    ) {
      errors.push(`Exit ${exit.id} is out of bounds`);
    }
  }
  if (exitTiles.size !== exits.length) errors.push('Duplicate exit positions');

  const playerSpawn = units.find((unit) => unit.team === 'PLAYER' && unit.controller === 'PLAYER');
  if (playerSpawn === undefined) {
    errors.push('Scene must contain a player-controlled unit');
    return errors;
  }
  if (!isWalkable(playerSpawn.position, blockers)) {
    errors.push('Player spawn is not walkable');
  }

  // Flood fill from the player spawn; doors are treated as passable.
  const walkableCache = new Map<string, boolean>();
  const walkable = (x: number, y: number): boolean => {
    const key = `${x},${y}`;
    const cached = walkableCache.get(key);
    if (cached !== undefined) return cached;
    const result =
      x >= 0 && y >= 0 && x < width && y < height && isWalkable({ x, y }, blockers);
    walkableCache.set(key, result);
    return result;
  };

  const reached = new Set<string>([`${playerSpawn.position.x},${playerSpawn.position.y}`]);
  const queue: GridPosition[] = [{ ...playerSpawn.position }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (reached.has(key) || !walkable(next.x, next.y)) continue;
      reached.add(key);
      queue.push(next);
    }
  }

  for (const unit of units) {
    if (!reached.has(`${unit.position.x},${unit.position.y}`)) {
      errors.push(`Unit ${unit.id} spawn is not reachable from the player spawn`);
    }
  }
  for (const exit of exits) {
    if (!reached.has(`${exit.position.x},${exit.position.y}`)) {
      errors.push(`Exit ${exit.id} marker is not reachable`);
    }
  }

  // At least 35% of tiles walkable.
  let walkableCount = 0;
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      if (walkable(x, y)) walkableCount += 1;
    }
  }
  if (walkableCount / (width * height) < 0.35) {
    errors.push('Fewer than 35% of tiles are walkable');
  }

  // At least one reachable 4x4 open area (blocking objects only; terrain and
  // units do not count against openness).
  let hasOpenArea = false;
  for (let x = 0; x <= width - 4 && !hasOpenArea; x += 1) {
    for (let y = 0; y <= height - 4; y += 1) {
      let open = true;
      for (let dx = 0; dx < 4 && open; dx += 1) {
        for (let dy = 0; dy < 4; dy += 1) {
          if (!walkable(x + dx, y + dy) || !reached.has(`${x + dx},${y + dy}`)) {
            open = false;
            break;
          }
        }
      }
      if (open) {
        hasOpenArea = true;
        break;
      }
    }
  }
  if (!hasOpenArea) errors.push('No reachable 4x4 open area');

  return errors;
}

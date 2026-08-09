import { FIREBALL_ID, FORCE_PUSH_ID, PUNCH_ID } from '../abilities/catalog';
import type { MapObjectConfig } from './environment';
import type { GameConfig, UnitConfig } from './types';

/**
 * Phase 4 demo: a school hallway. Walls frame the corridor with a door in the
 * top wall, desks and a locker for cover, a destructible barrel, and a spilled
 * chemical hazard. The hero exercises all three core abilities while enemy
 * thugs use Punch and the Firebrand uses its ranged Fireball, all driven by
 * the shared enemy brain through the same public engine API.
 */
export function createDemoScenario(): GameConfig {
  const units: UnitConfig[] = [
    {
      id: 'hero',
      name: 'Hero',
      team: 'PLAYER',
      controller: 'PLAYER',
      hp: 16,
      maxHp: 16,
      movement: 3,
      position: { x: 2, y: 6 },
      abilityIds: [PUNCH_ID, FIREBALL_ID, FORCE_PUSH_ID],
    },
    {
      id: 'e1',
      name: 'Thug 1',
      team: 'ENEMY',
      controller: 'AI',
      hp: 3,
      maxHp: 3,
      movement: 2,
      position: { x: 9, y: 1 },
      abilityIds: [PUNCH_ID],
    },
    {
      id: 'e2',
      name: 'Thug 2',
      team: 'ENEMY',
      controller: 'AI',
      hp: 3,
      maxHp: 3,
      movement: 2,
      position: { x: 6, y: 4 },
      abilityIds: [PUNCH_ID],
    },
    {
      id: 'e3',
      name: 'Firebrand',
      team: 'ENEMY',
      controller: 'AI',
      hp: 3,
      maxHp: 3,
      movement: 2,
      position: { x: 10, y: 1 },
      abilityIds: [FIREBALL_ID, PUNCH_ID],
    },
  ];

  const objects: MapObjectConfig[] = [
    // Top wall with a gap at x=6 (the door) and bottom wall
    ...Array.from({ length: 6 }, (_, x) => ({
      id: `wall-top-${x}`,
      kind: 'WALL' as const,
      x,
      y: 0,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `wall-top-${i + 7}`,
      kind: 'WALL' as const,
      x: i + 7,
      y: 0,
    })),
    ...Array.from({ length: 12 }, (_, x) => ({
      id: `wall-bottom-${x}`,
      kind: 'WALL' as const,
      x,
      y: 7,
    })),
    // Side walls
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `wall-left-${i + 1}`,
      kind: 'WALL' as const,
      x: 0,
      y: i + 1,
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `wall-right-${i + 1}`,
      kind: 'WALL' as const,
      x: 11,
      y: i + 1,
    })),
    // Door in the top wall gap
    { id: 'door', kind: 'DOOR', x: 6, y: 0 },
    // Cover and destructibles
    { id: 'desk-1', kind: 'DESK', x: 3, y: 2 },
    { id: 'desk-2', kind: 'DESK', x: 8, y: 3 },
    { id: 'locker-1', kind: 'LOCKER', x: 1, y: 4 },
    { id: 'barrel-1', kind: 'BARREL', x: 9, y: 4 },
    // Spilled chemicals
    { id: 'hazard-1', kind: 'HAZARD', x: 5, y: 3 },
  ];

  const terrain = [
    { x: 2, y: 4 },
    { x: 4, y: 6 },
    { x: 9, y: 5 },
  ];

  return { width: 12, height: 8, objects, terrain, units };
}

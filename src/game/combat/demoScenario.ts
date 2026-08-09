import { FIREBALL_ID, FORCE_PUSH_ID, PUNCH_ID } from '../abilities/catalog';
import type { GameConfig, UnitConfig } from './types';

/**
 * Phase 2 demo: the hero exercises all three core abilities while enemy thugs
 * continue to use the same data-defined Punch through the generic engine path.
 */
export function createDemoScenario(): GameConfig {
  const units: UnitConfig[] = [
    {
      id: 'hero',
      name: 'Hero',
      team: 'PLAYER',
      controller: 'PLAYER',
      hp: 8,
      maxHp: 8,
      movement: 3,
      position: { x: 1, y: 8 },
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
      position: { x: 8, y: 2 },
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
      position: { x: 7, y: 7 },
      abilityIds: [PUNCH_ID],
    },
  ];

  const blocked = [
    // central pillar
    { x: 4, y: 4 },
    { x: 4, y: 5 },
    { x: 5, y: 4 },
    { x: 5, y: 5 },
    // corner clutter
    { x: 0, y: 0 },
    { x: 9, y: 0 },
    { x: 0, y: 9 },
  ];

  return { width: 10, height: 10, blocked, units };
}

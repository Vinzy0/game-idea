import type { GameConfig, Unit } from './types';

/**
 * Demo scenario for the Phase 1 ugly chess prototype.
 * One player hero vs three AI thugs, with a central pillar and corner clutter.
 */
export function createDemoScenario(): GameConfig {
  const units: Unit[] = [
    {
      id: 'hero',
      name: 'Hero',
      team: 'PLAYER',
      controller: 'PLAYER',
      hp: 8,
      maxHp: 8,
      movement: 3,
      position: { x: 1, y: 8 },
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

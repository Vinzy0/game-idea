import { describe, expect, it } from 'vitest';
import { TacticalEngine, aliveUnits } from '../engine';
import type { GridPosition, Team, Unit } from '../types';

function makeUnit(id: string, team: Team, x: number, y: number, hp = 3, movement = 3): Unit {
  return {
    id,
    name: id.toUpperCase(),
    team,
    controller: team === 'PLAYER' ? 'PLAYER' : 'AI',
    hp,
    maxHp: hp,
    movement,
    position: { x, y },
  };
}

function makeEngine(
  units: Unit[],
  blocked: GridPosition[] = [],
  width = 10,
  height = 10,
): TacticalEngine {
  return new TacticalEngine({ width, height, blocked, units });
}

describe('TacticalEngine', () => {
  describe('initial state', () => {
    it('defaults to a 10x10 grid and PLAYER_TURN', () => {
      const engine = new TacticalEngine({ units: [makeUnit('p1', 'PLAYER', 0, 0)] });
      expect(engine.state.width).toBe(10);
      expect(engine.state.height).toBe(10);
      expect(engine.state.phase).toBe('PLAYER_TURN');
      expect(engine.state.winner).toBeNull();
      expect(engine.state.selectedUnitId).toBeNull();
      expect(engine.state.log).toEqual([]);
    });

    it('returns a snapshot from the state getter that cannot corrupt the engine', () => {
      const engine = new TacticalEngine({ units: [makeUnit('p1', 'PLAYER', 0, 0)] });
      const snapshot = engine.state;
      snapshot.units[0].hp = 999;
      snapshot.log.push('tampered');
      expect(engine.state.units[0].hp).toBe(3);
      expect(engine.state.log).toEqual([]);
    });
  });

  describe('getMovementRange', () => {
    it('returns every tile within the movement allowance on an open grid', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 4, 4, 2, 2),
      ]);
      const keys = engine.getMovementRange('p1').map((p) => `${p.x},${p.y}`).sort();
      expect(keys).toEqual(
        ['0,1', '0,2', '0,3', '1,0', '1,1', '1,2', '2,0', '2,1', '3,0'].sort(),
      );
    });

    it('excludes blocked tiles', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3), makeUnit('e1', 'ENEMY', 4, 4, 2, 2)],
        [{ x: 1, y: 0 }],
      );
      const range = engine.getMovementRange('p1');
      expect(range.some((p) => p.x === 1 && p.y === 0)).toBe(false);
      expect(range.some((p) => p.x === 0 && p.y === 1)).toBe(true);
    });

    it('excludes tiles occupied by other alive units and tiles only reachable through them', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 2, 0, 2, 2),
      ]);
      const range = engine.getMovementRange('p1');
      expect(range.some((p) => p.x === 2 && p.y === 0)).toBe(false); // occupied
      expect(range.some((p) => p.x === 3 && p.y === 0)).toBe(false); // behind the occupant
      expect(range.some((p) => p.x === 2 && p.y === 1)).toBe(true); // reachable around it
    });

    it('never includes out-of-bounds tiles', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 9, 9, 3, 3),
        makeUnit('e1', 'ENEMY', 0, 0, 2, 2),
      ]);
      const range = engine.getMovementRange('p1');
      expect(range).toHaveLength(9); // dx + dy in [1..3] from the corner
      expect(range.every((p) => p.x >= 0 && p.y >= 0 && p.x < 10 && p.y < 10)).toBe(true);
    });

    it('respects the movement allowance (no tile beyond it)', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 4, 4, 2, 2),
      ]);
      const range = engine.getMovementRange('p1');
      expect(range.some((p) => p.x === 0 && p.y === 4)).toBe(false);
      expect(range.some((p) => p.x === 4 && p.y === 0)).toBe(false);
      expect(range.some((p) => p.x === 1 && p.y === 3)).toBe(false);
      expect(range.every((p) => Math.abs(p.x) + Math.abs(p.y) <= 3)).toBe(true);
    });

    it('returns an empty range for unknown or downed units', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 1, 3),
        makeUnit('p2', 'PLAYER', 4, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
      ]);
      engine.endTurn(); // e1 downs the adjacent p1; p2 keeps the game alive
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(0);
      expect(engine.getMovementRange('p1')).toEqual([]);
      expect(engine.getMovementRange('nope')).toEqual([]);
    });
  });

  describe('canMove / moveUnit', () => {
    it('applies a legal move and logs it', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 4, 4, 2, 2),
      ]);
      expect(engine.canMove('p1', 1, 0)).toBe(true);
      expect(engine.moveUnit('p1', 1, 0)).toBe(true);
      expect(engine.state.units.find((u) => u.id === 'p1')!.position).toEqual({ x: 1, y: 0 });
      expect(engine.state.log).toContain('P1 moved to (1,0)');
    });

    it('rejects moves onto blocked tiles', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3), makeUnit('e1', 'ENEMY', 4, 4, 2, 2)],
        [{ x: 1, y: 0 }],
      );
      expect(engine.moveUnit('p1', 1, 0)).toBe(false);
      expect(engine.state.units.find((u) => u.id === 'p1')!.position).toEqual({ x: 0, y: 0 });
    });

    it('rejects moves onto tiles occupied by other units', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
      ]);
      expect(engine.moveUnit('p1', 1, 0)).toBe(false);
    });

    it('rejects moves beyond the movement allowance', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 4, 4, 2, 2),
      ]);
      expect(engine.moveUnit('p1', 0, 4)).toBe(false);
    });

    it('rejects moves from unknown or downed units', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 1, 3),
        makeUnit('p2', 'PLAYER', 4, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
      ]);
      engine.endTurn(); // e1 downs p1, game continues
      expect(engine.state.phase).toBe('PLAYER_TURN');
      expect(engine.moveUnit('p1', 0, 1)).toBe(false);
      expect(engine.moveUnit('nope', 0, 1)).toBe(false);
    });
  });

  describe('canAttack / attack', () => {
    it('requires 4-directional adjacency, different teams, and living units', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('p2', 'PLAYER', 2, 2, 3, 3), // diagonal to p1: not 4-adjacent
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2), // adjacent to p1
        makeUnit('e2', 'ENEMY', 3, 3, 2, 2), // far away
      ]);
      expect(engine.canAttack('p1', 'e1')).toBe(true);
      expect(engine.canAttack('p1', 'e2')).toBe(false); // not adjacent
      expect(engine.canAttack('p2', 'e1')).toBe(false); // diagonal is not adjacent
      expect(engine.canAttack('p1', 'p2')).toBe(false); // same team
      expect(engine.canAttack('e1', 'p1')).toBe(false); // enemy cannot act during the player turn
      expect(engine.canAttack('p1', 'nope')).toBe(false); // unknown target
      expect(engine.canAttack('nope', 'e1')).toBe(false); // unknown attacker
    });

    it('deals exactly 1 damage and logs the attack', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
      ]);
      expect(engine.attack('p1', 'e1')).toBe(true);
      expect(engine.state.units.find((u) => u.id === 'e1')!.hp).toBe(1);
      expect(engine.state.log).toContain('P1 attacks E1 for 1 damage');
    });

    it('downs a unit at 0 hp, keeps it in units[], and refuses further attacks on it', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
        makeUnit('e2', 'ENEMY', 5, 5, 2, 2),
      ]);
      expect(engine.attack('p1', 'e1')).toBe(true); // 2 -> 1
      expect(engine.attack('p1', 'e1')).toBe(true); // 1 -> 0, downed
      expect(engine.state.units.find((u) => u.id === 'e1')!.hp).toBe(0);
      expect(engine.unitAt(1, 0)?.id).toBe('e1'); // still present on the board
      expect(engine.state.phase).toBe('PLAYER_TURN'); // e2 keeps the game running
      expect(engine.state.log).toContain('E1 is downed');
      expect(engine.canAttack('p1', 'e1')).toBe(false);
      expect(engine.attack('p1', 'e1')).toBe(false);
    });
  });

  describe('downed units', () => {
    function downedPlayerScenario(): TacticalEngine {
      return makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 1, 3),
        makeUnit('p2', 'PLAYER', 4, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
      ]);
    }

    it('cannot act and cannot be targeted while the game continues', () => {
      const engine = downedPlayerScenario();
      engine.endTurn(); // e1 attacks the adjacent lowest-hp player (p1) and downs it
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(0);
      expect(engine.state.phase).toBe('PLAYER_TURN'); // p2 is still alive
      expect(engine.canMove('p1', 0, 1)).toBe(false);
      expect(engine.moveUnit('p1', 0, 1)).toBe(false);
      expect(engine.canAttack('p1', 'e1')).toBe(false);
      expect(engine.getMovementRange('p1')).toEqual([]);
    });

    it('are ignored by the enemy AI as targets', () => {
      const engine = downedPlayerScenario();
      engine.endTurn(); // downs p1
      engine.endTurn(); // second enemy turn: e1 must chase p2, not hit the corpse
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 3, y: 0 });
      // e1 walked to (3,0), became adjacent, and attacked p2 — but never p1
      expect(engine.state.units.find((u) => u.id === 'p2')!.hp).toBe(2);
      expect(engine.state.log).toContain('E1 attacks P2 for 1 damage');
      expect(engine.state.log.filter((l) => l === 'E1 attacks P1 for 1 damage')).toHaveLength(1);
    });

    it('do not block movement', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('p2', 'PLAYER', 2, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 1, 2),
        makeUnit('e2', 'ENEMY', 5, 5, 2, 2),
      ]);
      expect(engine.attack('p1', 'e1')).toBe(true); // e1 hp 1 -> downed
      expect(engine.state.units.find((u) => u.id === 'e1')!.hp).toBe(0);
      expect(engine.state.phase).toBe('PLAYER_TURN');
      expect(engine.canMove('p1', 1, 0)).toBe(true); // the downed e1's tile is passable
      expect(engine.unitAt(1, 0)?.id).toBe('e1');
      expect(engine.canMove('e1', 0, 1)).toBe(false);
      expect(engine.canAttack('p1', 'e1')).toBe(false);
    });
  });

  describe('selectUnit', () => {
    it('selects an existing unit and clears the selection for unknown ids', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 4, 4, 2, 2),
      ]);
      engine.selectUnit('p1');
      expect(engine.state.selectedUnitId).toBe('p1');
      engine.selectUnit('nope');
      expect(engine.state.selectedUnitId).toBeNull();
    });
  });

  describe('endTurn and enemy AI', () => {
    it('cycles PLAYER_TURN -> ENEMY_TURN -> PLAYER_TURN with log markers', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 5, 5, 2, 2),
      ]);
      expect(engine.state.phase).toBe('PLAYER_TURN');
      engine.endTurn();
      expect(engine.state.phase).toBe('PLAYER_TURN');
      expect(engine.state.log).toContain('--- ENEMY TURN ---');
      expect(engine.state.log).toContain('--- PLAYER TURN ---');
      // BFS takes the deterministic shortest path: (5,5) -> (4,5) -> (3,5)
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 3, y: 5 });
      expect(engine.state.log).toContain('E1 moved to (4,5)');
      expect(engine.state.log).toContain('E1 moved to (3,5)');
    });

    it('runs the enemy AI exactly once per endTurn', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
      ]);
      engine.endTurn();
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(1); // 3 -> 2 -> 1
      expect(engine.state.log.filter((l) => l === 'E1 attacks P1 for 1 damage')).toHaveLength(2);
    });

    it('attacks the adjacent player unit with the lowest hp', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('p2', 'PLAYER', 1, 1, 1, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
      ]);
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'p2')!.hp).toBe(0);
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(3);
      expect(engine.state.log).toContain('E1 attacks P2 for 1 damage');
      expect(engine.state.log).toContain('P2 is downed');
    });

    it('moves toward the nearest player unit', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 0, 4, 2, 2),
      ]);
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 0, y: 2 });
      expect(engine.state.log).toContain('E1 moved to (0,3)');
      expect(engine.state.log).toContain('E1 moved to (0,2)');
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(3);
    });

    it('moves into range and then attacks', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 2, 3, 3),
        makeUnit('e1', 'ENEMY', 0, 0, 2, 2),
      ]);
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 0, y: 1 });
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(2);
      expect(engine.state.log).toContain('E1 moved to (0,1)');
      expect(engine.state.log).toContain('E1 attacks P1 for 1 damage');
    });

    it('detours around blocked tiles instead of walking through them', () => {
      const engine = makeEngine(
        [
          makeUnit('p1', 'PLAYER', 2, 0, 3, 3),
          makeUnit('e1', 'ENEMY', 0, 0, 2, 2),
        ],
        [{ x: 1, y: 0 }],
      );
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 1, y: 1 });
      expect(engine.state.log).toContain('E1 moved to (0,1)');
      expect(engine.state.log).toContain('E1 moved to (1,1)');
    });

    it('breaks equidistant targets deterministically (first in unit order)', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 2, 0, 3, 3),
        makeUnit('p2', 'PLAYER', 0, 2, 3, 3),
        makeUnit('e1', 'ENEMY', 0, 0, 2, 1),
      ]);
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 1, y: 0 });
    });

    it('does nothing when no path to the player exists', () => {
      const engine = makeEngine(
        [
          makeUnit('p1', 'PLAYER', 2, 2, 3, 3),
          makeUnit('e1', 'ENEMY', 0, 0, 2, 2),
        ],
        [
          { x: 0, y: 1 },
          { x: 1, y: 0 },
        ],
      );
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 0, y: 0 });
      expect(engine.state.phase).toBe('PLAYER_TURN');
    });
  });

  describe('victory and defeat', () => {
    it('sets VICTORY when all enemies are downed and locks further actions', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 1, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 0, 0, 1, 2),
      ]);
      expect(engine.attack('p1', 'e1')).toBe(true);
      expect(engine.state.phase).toBe('VICTORY');
      expect(engine.state.winner).toBe('PLAYER');
      expect(engine.state.log.some((l) => l.includes('Victory'))).toBe(true);
      expect(engine.canMove('p1', 2, 0)).toBe(false);
      expect(engine.attack('p1', 'e1')).toBe(false);
      const logLength = engine.state.log.length;
      engine.endTurn(); // no-op once the game is over
      expect(engine.state.phase).toBe('VICTORY');
      expect(engine.state.log).toHaveLength(logLength);
    });

    it('sets DEFEAT when the last player unit is downed by the enemy AI', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 1, 1, 3),
        makeUnit('e1', 'ENEMY', 0, 0, 2, 2),
      ]);
      engine.endTurn();
      expect(engine.state.phase).toBe('DEFEAT');
      expect(engine.state.winner).toBe('ENEMY');
      expect(engine.state.log).toContain('E1 attacks P1 for 1 damage');
      expect(engine.state.log).toContain('P1 is downed');
      expect(engine.state.log.some((l) => l.includes('Defeat'))).toBe(true);
      expect(engine.state.log.some((l) => l === '--- PLAYER TURN ---')).toBe(false);
    });
  });

  describe('board helpers', () => {
    it('unitAt and isBlocked report board contents', () => {
      const engine = makeEngine(
        [
          makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
          makeUnit('e1', 'ENEMY', 4, 4, 2, 2),
        ],
        [{ x: 3, y: 3 }],
      );
      expect(engine.unitAt(0, 0)?.id).toBe('p1');
      expect(engine.unitAt(0, 0)?.name).toBe('P1');
      expect(engine.unitAt(5, 5)).toBeNull();
      expect(engine.isBlocked(3, 3)).toBe(true);
      expect(engine.isBlocked(2, 2)).toBe(false);
    });
  });

  describe('reset', () => {
    it('restores the initial configuration', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 4, 4, 2, 2),
      ]);
      engine.moveUnit('p1', 1, 1);
      engine.endTurn(); // e1 advances
      engine.selectUnit('e1');
      engine.reset();
      const state = engine.state;
      expect(state.phase).toBe('PLAYER_TURN');
      expect(state.winner).toBeNull();
      expect(state.selectedUnitId).toBeNull();
      expect(state.log).toEqual([]);
      expect(state.units.find((u) => u.id === 'p1')!.position).toEqual({ x: 0, y: 0 });
      expect(state.units.find((u) => u.id === 'p1')!.hp).toBe(3);
      expect(state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 4, y: 4 });
      expect(state.units.find((u) => u.id === 'e1')!.hp).toBe(2);
    });
  });

  describe('aliveUnits', () => {
    it('filters by team and excludes downed units', () => {
      const p1 = makeUnit('p1', 'PLAYER', 0, 0, 3, 3);
      const p2 = { ...makeUnit('p2', 'PLAYER', 1, 0, 3, 3), hp: 0 };
      const e1 = makeUnit('e1', 'ENEMY', 5, 5, 2, 2);
      const units = [p1, p2, e1];
      expect(aliveUnits(units, 'PLAYER').map((u) => u.id)).toEqual(['p1']);
      expect(aliveUnits(units, 'ENEMY').map((u) => u.id)).toEqual(['e1']);
      expect(aliveUnits([], 'PLAYER')).toEqual([]);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { FIREBALL_ID, PUNCH_ID } from '../../abilities/catalog';
import { TacticalEngine, aliveUnits } from '../engine';
import type { MapObjectConfig } from '../environment';
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
    abilityIds: [PUNCH_ID],
    statuses: [],
  };
}

function wallAt(x: number, y: number): MapObjectConfig {
  return { id: `wall-${x}-${y}`, kind: 'WALL', x, y };
}

function makeEngine(
  units: Unit[],
  objects: MapObjectConfig[] = [],
  terrain: GridPosition[] = [],
  width = 10,
  height = 10,
): TacticalEngine {
  return new TacticalEngine({ width, height, objects, terrain, units });
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
      expect(engine.state.selectedAbilityId).toBeNull();
      expect(engine.state.turnResources.p1).toEqual({
        movementRemaining: 3,
        actionRemaining: 1,
        bonusActionRemaining: 1,
      });
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

    it('deep-clones objects and terrain in the state getter', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3)],
        [{ id: 'door', kind: 'DOOR', x: 1, y: 0 }],
        [{ x: 2, y: 2 }],
      );
      const snapshot = engine.state;
      snapshot.objects[0].hp = 99;
      snapshot.objects[0].open = true;
      snapshot.objects[0].position.x = 9;
      snapshot.terrain[0].x = 9;
      expect(engine.state.objects[0].hp).toBe(0);
      expect(engine.state.objects[0].open).toBe(false);
      expect(engine.state.objects[0].position).toEqual({ x: 1, y: 0 });
      expect(engine.state.terrain[0]).toEqual({ x: 2, y: 2 });
    });
  });

  describe('getMovementRange', () => {
    it('returns every tile within the movement allowance on an open grid', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 4, 4, 2, 2),
      ]);
      const keys = engine
        .getMovementRange('p1')
        .map((p) => `${p.x},${p.y}`)
        .sort();
      expect(keys).toEqual(['0,1', '0,2', '0,3', '1,0', '1,1', '1,2', '2,0', '2,1', '3,0'].sort());
    });

    it('excludes blocked tiles', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3), makeUnit('e1', 'ENEMY', 4, 4, 2, 2)],
        [wallAt(1, 0)],
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

  describe('difficult terrain', () => {
    it('charges 2 movement per difficult tile and finds cheaper detours', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3)],
        [],
        [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      );
      const range = engine.getMovementRange('p1');
      // one difficult tile away: cost 2, within movement 3
      expect(range.some((p) => p.x === 1 && p.y === 0)).toBe(true);
      // two difficult tiles in a row: cost 4 > 3, unreachable
      expect(range.some((p) => p.x === 2 && p.y === 0)).toBe(false);
      // a longer route around the difficult pair reaches (2,1) at cost 3
      expect(range.some((p) => p.x === 2 && p.y === 1)).toBe(true);
      // movement consumes the true terrain cost
      expect(engine.moveUnit('p1', 1, 0)).toBe(true);
      expect(engine.state.turnResources.p1.movementRemaining).toBe(1);
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
        [wallAt(1, 0)],
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

  describe('interact', () => {
    it('closed doors block movement and interact() opens them', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3)],
        [{ id: 'door', kind: 'DOOR', x: 1, y: 0 }],
      );
      expect(engine.canMove('p1', 1, 0)).toBe(false);
      expect(engine.canMove('p1', 2, 0)).toBe(false); // through the closed door
      expect(engine.interact('p1', 'door')).toBe(true);
      expect(engine.state.log).toContain('P1 opens the door');
      expect(engine.state.objects.find((o) => o.id === 'door')!.open).toBe(true);
      expect(engine.canMove('p1', 1, 0)).toBe(true);
      expect(engine.moveUnit('p1', 1, 0)).toBe(true);
    });

    it('requires adjacency, costs an Action, and toggles the door closed again', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3)],
        [{ id: 'door', kind: 'DOOR', x: 2, y: 0 }],
      );
      expect(engine.interact('p1', 'door')).toBe(false); // two tiles away
      expect(engine.interact('nope', 'door')).toBe(false); // unknown unit
      expect(engine.interact('p1', 'nope')).toBe(false); // unknown object
      expect(engine.moveUnit('p1', 1, 0)).toBe(true); // now adjacent
      expect(engine.interact('p1', 'door')).toBe(true);
      expect(engine.state.turnResources.p1.actionRemaining).toBe(0);
      expect(engine.interact('p1', 'door')).toBe(false); // no Action left
      expect(engine.state.objects.find((o) => o.id === 'door')!.open).toBe(true);
      engine.endTurn(); // no enemies: refreshes p1 resources
      expect(engine.state.phase).toBe('PLAYER_TURN');
      expect(engine.interact('p1', 'door')).toBe(true); // toggles back closed
      expect(engine.state.objects.find((o) => o.id === 'door')!.open).toBe(false);
      expect(engine.state.log).toContain('P1 closes the door');
    });
  });

  describe('destructible objects', () => {
    it('Fireball destroys a barrel and its tile becomes passable', () => {
      const engine = makeEngine(
        [
          { ...makeUnit('p1', 'PLAYER', 0, 0, 3, 3), abilityIds: [FIREBALL_ID] },
          makeUnit('e1', 'ENEMY', 6, 6, 3, 2),
        ],
        [{ id: 'barrel-1', kind: 'BARREL', x: 2, y: 0 }],
      );
      expect(engine.isBlocked(2, 0)).toBe(true);
      expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 1, y: 0 })).toBe(true);
      expect(engine.state.objects.find((o) => o.id === 'barrel-1')).toBeUndefined();
      expect(engine.state.log).toContain('P1 destroys the barrel');
      expect(engine.isBlocked(2, 0)).toBe(false);
      expect(engine.canMove('p1', 2, 0)).toBe(true);
    });

    it('UNIT-targeting abilities like Punch never damage objects', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3), makeUnit('e1', 'ENEMY', 1, 0, 3, 2)],
        [{ id: 'barrel-1', kind: 'BARREL', x: 2, y: 0 }],
      );
      expect(engine.attack('p1', 'e1')).toBe(true);
      const barrel = engine.state.objects.find((o) => o.id === 'barrel-1')!;
      expect(barrel.hp).toBe(2);
      expect(engine.state.log.some((l) => l.includes('destroys the barrel'))).toBe(false);
    });

    it('TILE abilities can target a destructible object tile directly', () => {
      const engine = makeEngine(
        [
          { ...makeUnit('p1', 'PLAYER', 0, 0, 3, 3), abilityIds: [FIREBALL_ID] },
          makeUnit('e1', 'ENEMY', 6, 6, 3, 2),
        ],
        [{ id: 'barrel-1', kind: 'BARREL', x: 2, y: 0 }],
      );
      // The barrel's own tile is a legal Fireball target even though it blocks movement.
      expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 2, y: 0 })).toBe(true);
      expect(engine.state.objects.find((o) => o.id === 'barrel-1')).toBeUndefined();
      expect(engine.state.log).toContain('P1 destroys the barrel');
      expect(engine.isBlocked(2, 0)).toBe(false);
    });

    it('TILE abilities cannot target indestructible blockers (walls, closed doors)', () => {
      const engine = makeEngine(
        [
          { ...makeUnit('p1', 'PLAYER', 0, 0, 3, 3), abilityIds: [FIREBALL_ID] },
          makeUnit('e1', 'ENEMY', 6, 6, 3, 2),
        ],
        [
          { id: 'wall-1', kind: 'WALL', x: 1, y: 0 },
          { id: 'door', kind: 'DOOR', x: 3, y: 0 },
        ],
      );
      expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 1, y: 0 })).toBe(false);
      expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 3, y: 0 })).toBe(false);
      // A free tile next to them stays targetable.
      expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 2, y: 0 })).toBe(true);
    });
  });

  describe('hazards', () => {
    it('deals 1 damage to a unit standing on it at that team turn start', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3), makeUnit('e1', 'ENEMY', 5, 5, 3, 2)],
        [{ id: 'hazard-1', kind: 'HAZARD', x: 0, y: 0 }],
      );
      engine.endTurn(); // the enemy turn runs first; the hazard ticks on the player turn start
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(2);
      expect(engine.state.log).toContain('P1 takes 1 damage from the hazard');
    });

    it('damages an enemy standing on it at the enemy turn start', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 5, 3), makeUnit('e1', 'ENEMY', 1, 0, 3, 2)],
        [{ id: 'hazard-1', kind: 'HAZARD', x: 1, y: 0 }],
      );
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'e1')!.hp).toBe(2);
      expect(engine.state.log).toContain('E1 takes 1 damage from the hazard');
    });

    it('lets a hazard down the last player and ends the game in DEFEAT', () => {
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 0, 0, 1, 3)],
        [{ id: 'hazard-1', kind: 'HAZARD', x: 0, y: 0 }],
      );
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(0);
      expect(engine.state.phase).toBe('DEFEAT');
      expect(engine.state.winner).toBe('ENEMY');
      expect(engine.state.log).toContain('P1 takes 1 damage from the hazard');
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
        makeUnit('e1', 'ENEMY', 1, 0, 1, 2),
        makeUnit('e2', 'ENEMY', 5, 5, 2, 2),
      ]);
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

    it('attacks the lower-hp player when two players are equidistant', () => {
      const engine = makeEngine([
        makeUnit('p2', 'PLAYER', 2, 0, 1, 3), // lower HP, listed first
        makeUnit('p1', 'PLAYER', 0, 0, 3, 3),
        makeUnit('e1', 'ENEMY', 1, 0, 2, 2),
      ]);
      engine.endTurn();
      // Both players are 1 tile away; the enemy hits the lower-HP one (p2),
      // which is also the first valid target in unit order.
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
        [makeUnit('p1', 'PLAYER', 2, 0, 3, 3), makeUnit('e1', 'ENEMY', 0, 0, 2, 2)],
        [wallAt(1, 0)],
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
        [makeUnit('p1', 'PLAYER', 2, 2, 3, 3), makeUnit('e1', 'ENEMY', 0, 0, 2, 2)],
        [wallAt(0, 1), wallAt(1, 0)],
      );
      engine.endTurn();
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 0, y: 0 });
      expect(engine.state.phase).toBe('PLAYER_TURN');
    });

    it('has Firebrand attack from range with Fireball instead of closing in', () => {
      // A wall separates the two, so closing in is impossible; Fireball has no
      // line-of-sight check yet (Phase 4 boundary) and still connects.
      const wall = Array.from({ length: 10 }, (_, y) => ({
        id: `wall-6-${y}`,
        kind: 'WALL' as const,
        x: 6,
        y,
      }));
      const engine = makeEngine(
        [
          makeUnit('hero', 'PLAYER', 3, 6, 3, 3),
          {
            ...makeUnit('e3', 'ENEMY', 8, 6, 3, 2),
            name: 'Firebrand',
            abilityIds: [FIREBALL_ID, PUNCH_ID],
          },
        ],
        wall,
      );
      engine.endTurn();
      // Fireball is in range 5, so the brain blasts instead of approaching.
      expect(engine.state.units.find((u) => u.id === 'hero')!.hp).toBe(1); // 3 - 2
      expect(engine.state.units.find((u) => u.id === 'e3')!.position).toEqual({ x: 8, y: 6 });
      expect(engine.state.log).toContain('Firebrand blasts HERO for 2 damage');
      expect(engine.state.log.some((l) => l.includes('Firebrand moved to'))).toBe(false);
    });

    it('prefers Fireball over Punch when both are in range (higher damage)', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 1, 0, 3, 3),
        {
          ...makeUnit('e1', 'ENEMY', 0, 0, 3, 3),
          abilityIds: [PUNCH_ID, FIREBALL_ID],
        },
      ]);
      engine.endTurn();
      // Row-major tile targeting makes (0,0) Fireball's first valid target; the
      // player at (1,0) sits inside its radius, so the 2-damage Fireball wins.
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(1); // 3 - 2
      expect(engine.state.log).toContain('E1 blasts P1 for 2 damage');
      expect(engine.state.log).not.toContain('E1 attacks P1');
    });

    it('moves toward the nearest player when no ability is in range', () => {
      const engine = makeEngine([
        makeUnit('p1', 'PLAYER', 5, 9, 3, 3),
        makeUnit('e1', 'ENEMY', 5, 5, 3, 2),
      ]);
      engine.endTurn();
      // Punch (range 1) cannot reach, so the brain takes steps along the path.
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 5, y: 7 });
      expect(engine.state.log).toContain('E1 moved to (5,6)');
      expect(engine.state.log).toContain('E1 moved to (5,7)');
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(3); // never reached melee
    });

    it('navigates difficult terrain to reach and attack the player', () => {
      // The only path to the hero crosses the difficult tile at (1,1): walls
      // close (1,0) and (1,2). The cost-aware brain steps onto it and pushes on.
      const engine = makeEngine(
        [makeUnit('p1', 'PLAYER', 3, 0, 3, 3), makeUnit('e1', 'ENEMY', 0, 0, 3, 2)],
        [wallAt(1, 0), wallAt(1, 2)],
        [{ x: 1, y: 1 }],
      );
      engine.endTurn(); // (0,1)
      engine.endTurn(); // (1,1) — the difficult tile, costing the full 2 movement
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 1, y: 1 });
      engine.endTurn(); // (2,1) -> (3,1), then attacks the adjacent hero
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 3, y: 1 });
      expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(2);
      expect(engine.state.log).toContain('E1 attacks P1 for 1 damage');
    });

    it('performs no actions when no players are alive', () => {
      const engine = makeEngine([makeUnit('e1', 'ENEMY', 0, 0, 3, 2)]);
      engine.endTurn();
      expect(engine.state.phase).toBe('PLAYER_TURN');
      expect(engine.state.units.find((u) => u.id === 'e1')!.position).toEqual({ x: 0, y: 0 });
      expect(engine.state.log.some((l) => l.includes('moved to'))).toBe(false);
      expect(engine.state.log.some((l) => l.includes('attacks'))).toBe(false);
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
        [makeUnit('p1', 'PLAYER', 0, 0, 3, 3), makeUnit('e1', 'ENEMY', 4, 4, 2, 2)],
        [wallAt(3, 3)],
      );
      expect(engine.unitAt(0, 0)?.id).toBe('p1');
      expect(engine.unitAt(0, 0)?.name).toBe('P1');
      expect(engine.unitAt(5, 5)).toBeNull();
      expect(engine.isBlocked(3, 3)).toBe(true);
      expect(engine.isBlocked(2, 2)).toBe(false);
    });
  });

  describe('environment validation', () => {
    it('throws at construction when an object is out of bounds', () => {
      expect(
        () =>
          new TacticalEngine({
            units: [makeUnit('p1', 'PLAYER', 0, 0, 3, 3)],
            objects: [{ id: 'wall-1', kind: 'WALL', x: 10, y: 0 }],
          }),
      ).toThrow(/Invalid environment:.*out of bounds/);
    });

    it('throws at construction when terrain overlaps an object', () => {
      expect(
        () =>
          new TacticalEngine({
            units: [makeUnit('p1', 'PLAYER', 0, 0, 3, 3)],
            objects: [{ id: 'barrel-1', kind: 'BARREL', x: 2, y: 2 }],
            terrain: [{ x: 2, y: 2 }],
          }),
      ).toThrow(/Invalid environment:.*overlaps/);
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

    it('restores doors and destructible objects to their initial state', () => {
      const engine = makeEngine(
        [
          { ...makeUnit('p1', 'PLAYER', 0, 0, 3, 3), abilityIds: [FIREBALL_ID] },
          makeUnit('e1', 'ENEMY', 8, 8, 3, 2), // keeps the game running
        ],
        [
          { id: 'door', kind: 'DOOR', x: 1, y: 0 },
          { id: 'barrel-1', kind: 'BARREL', x: 3, y: 0 },
        ],
      );
      engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 2, y: 0 }); // destroys the barrel
      expect(engine.state.objects.find((o) => o.id === 'barrel-1')).toBeUndefined();
      engine.endTurn(); // no enemies: refreshes p1's Action
      expect(engine.interact('p1', 'door')).toBe(true); // opens the door
      expect(engine.state.objects.find((o) => o.id === 'door')!.open).toBe(true);
      engine.reset();
      expect(engine.state.objects.find((o) => o.id === 'door')!.open).toBe(false);
      expect(engine.state.objects.find((o) => o.id === 'barrel-1')!.hp).toBe(2);
      expect(engine.state.objects).toHaveLength(2);
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

import { describe, expect, it } from 'vitest';
import { FIREBALL_ID, PUNCH_ID } from '../../abilities/catalog';
import { selectImportantEvents } from '../events';
import type { SceneEvent } from '../events';
import { TacticalEngine } from '../engine';
import type { MapObjectConfig } from '../environment';
import type { GridPosition, Team, Unit } from '../types';

function makeUnit(
  id: string,
  team: Team,
  x: number,
  y: number,
  hp = 3,
  movement = 3,
): Unit {
  return {
    id,
    name: id.toUpperCase(),
    team,
    controller: team === 'PLAYER' ? 'PLAYER' : 'AI',
    hp,
    maxHp: hp,
    movement,
    position: { x, y },
    abilityIds: team === 'NEUTRAL' ? [] : [PUNCH_ID],
    statuses: [],
  };
}

function makeEngine(
  units: Unit[],
  objects: MapObjectConfig[] = [],
  terrain: GridPosition[] = [],
  width = 10,
  height = 10,
): TacticalEngine {
  return new TacticalEngine({
    width,
    height,
    objects,
    terrain,
    units,
    initialPhase: 'EXPLORATION',
  });
}

function wallAt(x: number, y: number): MapObjectConfig {
  return { id: `wall-${x}-${y}`, kind: 'WALL', x, y };
}

function allParticipants(engine: TacticalEngine): string[] {
  return engine.state.units
    .filter((unit) => unit.hp > 0 && (unit.team === 'PLAYER' || unit.team === 'ENEMY'))
    .map((unit) => unit.id);
}

describe('Phase 6A scene phases', () => {
  it('defaults to PLAYER_TURN so the combat demo behavior is preserved', () => {
    const engine = new TacticalEngine({ units: [makeUnit('p1', 'PLAYER', 0, 0)] });
    expect(engine.state.phase).toBe('PLAYER_TURN');
  });

  it('starts in EXPLORATION when requested (persistent scenes)', () => {
    const engine = makeEngine([makeUnit('p1', 'PLAYER', 0, 0)]);
    expect(engine.state.phase).toBe('EXPLORATION');
    expect(engine.state.winner).toBeNull();
    expect(engine.state.combatParticipants).toEqual([]);
    expect(engine.state.combatObjective).toBeNull();
  });

  it('locks combat commands during EXPLORATION', () => {
    const engine = makeEngine([
      makeUnit('p1', 'PLAYER', 0, 0),
      makeUnit('e1', 'ENEMY', 1, 0),
    ]);
    expect(engine.canMove('p1', 1, 1)).toBe(false);
    expect(engine.moveUnit('p1', 1, 1)).toBe(false);
    expect(engine.canAttack('p1', 'e1')).toBe(false);
    expect(engine.attack('p1', 'e1')).toBe(false);
    expect(engine.canSelectAbility('p1', PUNCH_ID)).toBe(false);
    engine.endTurn(); // no-op in exploration
    expect(engine.state.phase).toBe('EXPLORATION');
  });
});

describe('exploration movement', () => {
  it('moves along the cheapest path without consuming movement or action', () => {
    const engine = makeEngine(
      [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 9, 9)],
      [wallAt(1, 0)],
    );
    expect(engine.moveExplorationUnit('p1', 2, 0)).toBe(true);
    expect(engine.state.units.find((u) => u.id === 'p1')!.position).toEqual({ x: 2, y: 0 });
    expect(engine.state.turnResources.p1.movementRemaining).toBe(3); // untouched
    expect(engine.state.turnResources.p1.actionRemaining).toBe(1); // untouched
    const move = engine.state.events.find((event) => event.type === 'UNIT_MOVED');
    expect(move).toBeDefined();
    if (move?.type === 'UNIT_MOVED') {
      expect(move.from).toEqual({ x: 0, y: 0 });
      expect(move.to).toEqual({ x: 2, y: 0 });
      expect(move.distance).toBe(4); // detour around the wall
    }
  });

  it('applies terrain path costs but no movement allowance cap', () => {
    const engine = makeEngine(
      [makeUnit('p1', 'PLAYER', 0, 0, 3, 3)], // movement 3
      [],
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    );
    // Path cost 4 > movement 3: combat movement would reject this; exploration allows it.
    expect(engine.canMoveExploration('p1', 3, 0)).toBe(true);
    expect(engine.moveExplorationUnit('p1', 3, 0)).toBe(true);
    expect(engine.state.units.find((u) => u.id === 'p1')!.position).toEqual({ x: 3, y: 0 });
  });

  it('rejects blocked, occupied, out-of-bounds, and unreachable destinations', () => {
    const walled = makeEngine(
      [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 2, 0)],
      [wallAt(1, 0)],
    );
    expect(walled.moveExplorationUnit('p1', 1, 0)).toBe(false); // wall tile
    expect(walled.moveExplorationUnit('p1', 2, 0)).toBe(false); // occupied by e1
    expect(walled.moveExplorationUnit('p1', 10, 0)).toBe(false); // out of bounds
    expect(walled.moveExplorationUnit('p1', 0, 0)).toBe(false); // already there

    const boxed = makeEngine(
      [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 9, 9)],
      [wallAt(1, 0), wallAt(0, 1), wallAt(1, 1)],
    );
    expect(boxed.canMoveExploration('p1', 2, 1)).toBe(false);
    expect(boxed.moveExplorationUnit('p1', 2, 1)).toBe(false);
  });

  it('only living player-controlled units may use exploration movement', () => {
    const engine = makeEngine([
      { ...makeUnit('p1', 'PLAYER', 0, 0), hp: 0 }, // downed
      makeUnit('p2', 'PLAYER', 2, 0),
      { ...makeUnit('e1', 'ENEMY', 5, 5), controller: 'PLAYER' },
      makeUnit('n1', 'NEUTRAL', 6, 6),
    ]);
    expect(engine.moveExplorationUnit('p1', 0, 1)).toBe(false); // downed
    expect(engine.moveExplorationUnit('e1', 5, 4)).toBe(false); // enemy team
    expect(engine.moveExplorationUnit('n1', 6, 5)).toBe(false); // neutral
    expect(engine.moveExplorationUnit('nope', 1, 0)).toBe(false); // unknown
    expect(engine.moveExplorationUnit('p2', 3, 0)).toBe(true); // the hero can
  });

  it('units and closed doors still block exploration paths', () => {
    // The neutral seals the only route out of the corner: detours are walled off.
    const throughUnit = makeEngine(
      [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('n1', 'NEUTRAL', 1, 0)],
      [wallAt(0, 1), wallAt(1, 1)],
    );
    expect(throughUnit.moveExplorationUnit('p1', 2, 0)).toBe(false); // through the neutral

    const throughDoor = makeEngine(
      [makeUnit('p1', 'PLAYER', 2, 0), makeUnit('e1', 'ENEMY', 9, 9)],
      [
        { id: 'door', kind: 'DOOR', x: 3, y: 0 },
        wallAt(0, 1),
        wallAt(1, 1),
        wallAt(2, 1),
        wallAt(3, 1),
      ],
    );
    expect(throughDoor.moveExplorationUnit('p1', 4, 0)).toBe(false); // through the closed door
    expect(throughDoor.interact('p1', 'door')).toBe(true); // open it for free
    expect(throughDoor.moveExplorationUnit('p1', 4, 0)).toBe(true); // now passable
  });
});

describe('exploration interaction', () => {
  it('opens a door without spending an Action', () => {
    const engine = makeEngine(
      [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 9, 9)],
      [{ id: 'door', kind: 'DOOR', x: 1, y: 0 }],
    );
    expect(engine.canInteract('p1', 'door')).toBe(true);
    expect(engine.interact('p1', 'door')).toBe(true);
    expect(engine.state.objects.find((o) => o.id === 'door')!.open).toBe(true);
    expect(engine.state.turnResources.p1.actionRemaining).toBe(1); // free in exploration
    expect(engine.state.log).toContain('P1 opens the door');
    const event = engine.state.events.find((e) => e.type === 'OBJECT_INTERACTED');
    expect(event).toBeDefined();
    if (event?.type === 'OBJECT_INTERACTED') {
      expect(event.open).toBe(true);
      expect(event.objectKind).toBe('DOOR');
      expect(event.unitId).toBe('p1');
    }
  });

  it('requires adjacency and rejects non-player-controlled units in exploration', () => {
    const engine = makeEngine(
      [
        makeUnit('p1', 'PLAYER', 0, 0),
        makeUnit('n1', 'NEUTRAL', 2, 0),
        makeUnit('e1', 'ENEMY', 5, 5),
      ],
      [{ id: 'door', kind: 'DOOR', x: 1, y: 0 }],
    );
    expect(engine.canInteract('n1', 'door')).toBe(false); // neutral
    expect(engine.canInteract('e1', 'door')).toBe(false); // enemy team
    expect(engine.interact('p1', 'door')).toBe(true);
    // Interacting does not move the unit: walk away first, then adjacency fails.
    expect(engine.moveExplorationUnit('p1', 0, 1)).toBe(true);
    expect(engine.canInteract('p1', 'door')).toBe(false);
    expect(engine.interact('p1', 'door')).toBe(false);
    const far = makeEngine(
      [makeUnit('p1', 'PLAYER', 0, 0)],
      [{ id: 'door', kind: 'DOOR', x: 2, y: 0 }],
    );
    expect(far.interact('p1', 'door')).toBe(false);
  });

  it('combat interaction still costs one Action (regression)', () => {
    const engine = new TacticalEngine({
      units: [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 9, 9)],
      objects: [{ id: 'door', kind: 'DOOR', x: 1, y: 0 }],
    });
    expect(engine.state.phase).toBe('PLAYER_TURN');
    expect(engine.interact('p1', 'door')).toBe(true);
    expect(engine.state.turnResources.p1.actionRemaining).toBe(0);
  });
});

describe('startCombat', () => {
  it('transitions EXPLORATION to PLAYER_TURN, initializes resources, emits COMBAT_STARTED', () => {
    const engine = makeEngine([
      makeUnit('p1', 'PLAYER', 0, 0),
      makeUnit('e1', 'ENEMY', 1, 0),
      makeUnit('n1', 'NEUTRAL', 3, 0),
    ]);
    const participants = ['p1', 'e1'];
    expect(engine.canStartCombat()).toBe(true);
    expect(
      engine.startCombat({ participantIds: participants, objective: 'DEFEAT_ALL_HOSTILES' }),
    ).toBe(true);
    const state = engine.state;
    expect(state.phase).toBe('PLAYER_TURN');
    expect(state.combatParticipants).toEqual(participants);
    expect(state.combatObjective).toBe('DEFEAT_ALL_HOSTILES');
    expect(state.turnResources.p1.movementRemaining).toBe(3);
    expect(state.turnResources.e1.actionRemaining).toBe(1);
    const started = state.events.find((event) => event.type === 'COMBAT_STARTED');
    expect(started).toBeDefined();
    if (started?.type === 'COMBAT_STARTED') {
      expect(started.participantIds).toEqual(participants);
      expect(started.objective).toBe('DEFEAT_ALL_HOSTILES');
    }
    expect(
      state.events.some((event) => event.type === 'TURN_STARTED' && event.team === 'PLAYER'),
    ).toBe(true);
  });

  it('rejects invalid participant specs and leaves the scene untouched', () => {
    const base = [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 1, 0)];
    const cases: Array<{ engine: TacticalEngine; spec: string[]; label: string }> = [
      { engine: makeEngine(base), spec: ['p1'], label: 'no living enemy' },
      { engine: makeEngine(base), spec: ['e1'], label: 'no living player' },
      {
        engine: makeEngine([...base, makeUnit('n1', 'NEUTRAL', 3, 0)]),
        spec: ['p1', 'e1', 'n1'],
        label: 'neutral participant',
      },
      { engine: makeEngine(base), spec: ['p1', 'nope'], label: 'unknown id' },
      { engine: makeEngine(base), spec: ['p1', 'p1'], label: 'duplicate id' },
      {
        engine: makeEngine([{ ...base[0], hp: 0 }, base[1]]),
        spec: ['p1', 'e1'],
        label: 'downed player participant',
      },
    ];
    for (const { engine, spec, label } of cases) {
      expect(
        engine.startCombat({ participantIds: spec, objective: 'DEFEAT_ALL_HOSTILES' }),
        label,
      ).toBe(false);
      expect(engine.state.phase, label).toBe('EXPLORATION');
      expect(engine.state.combatParticipants, label).toEqual([]);
    }
    // Unknown objective is rejected.
    const engine = makeEngine(base);
    expect(
      engine.startCombat({
        participantIds: ['p1', 'e1'],
        objective: 'CONQUER_THE_SCHOOL' as 'DEFEAT_ALL_HOSTILES',
      }),
    ).toBe(false);
    expect(engine.state.phase).toBe('EXPLORATION');
    // Once in combat, startCombat fails.
    expect(
      engine.startCombat({ participantIds: ['p1', 'e1'], objective: 'DEFEAT_ALL_HOSTILES' }),
    ).toBe(true);
    expect(
      engine.startCombat({ participantIds: ['p1', 'e1'], objective: 'DEFEAT_ALL_HOSTILES' }),
    ).toBe(false);
  });

  it('non-participant enemies receive no resources and never act', () => {
    const engine = makeEngine([
      makeUnit('p1', 'PLAYER', 0, 0),
      makeUnit('e1', 'ENEMY', 1, 0),
      makeUnit('e2', 'ENEMY', 9, 9),
    ]);
    engine.startCombat({
      participantIds: ['p1', 'e1'],
      objective: 'DEFEAT_ALL_HOSTILES',
    });
    expect(engine.state.turnResources.e2).toBeUndefined(); // participants only
    expect(engine.state.turnResources.p1).toBeDefined();
    engine.endTurn(); // e2 must not move or attack
    expect(engine.state.units.find((u) => u.id === 'e2')!.position).toEqual({ x: 9, y: 9 });
    expect(engine.state.log.some((l) => l.includes('E2'))).toBe(false);
  });
});

describe('explicit participant victory and defeat', () => {
  it('victory counts only explicit participants, not every actor in the scene', () => {
    const engine = makeEngine([
      makeUnit('p1', 'PLAYER', 0, 0),
      makeUnit('e1', 'ENEMY', 1, 0, 1),
      makeUnit('e2', 'ENEMY', 5, 5), // alive but NOT a participant
      makeUnit('n1', 'NEUTRAL', 3, 0),
    ]);
    engine.startCombat({
      participantIds: ['p1', 'e1'],
      objective: 'DEFEAT_ALL_HOSTILES',
    });
    expect(engine.attack('p1', 'e1')).toBe(true);
    expect(engine.state.phase).toBe('VICTORY');
    expect(engine.state.winner).toBe('PLAYER');
    expect(engine.state.combatParticipants).toEqual(['p1', 'e1']);
    const result = engine.state.encounterResult!;
    expect(result.outcome).toBe('VICTORY');
    expect(result.participantIds).toEqual(['p1', 'e1']);
    expect(result.survivors.map((s) => s.characterId)).toContain('p1');
    expect(result.downedCharacterIds).toEqual(['e1']);
    expect(result.objectiveCompleted).toBe(true);
    expect(result.importantEvents.some((event) => event.type === 'COMBAT_ENDED')).toBe(true);
    expect(engine.state.units.find((u) => u.id === 'e2')!.hp).toBe(3); // untouched
  });

  it('defeat when the last player participant is downed, even with other players alive', () => {
    const engine = makeEngine([
      makeUnit('p1', 'PLAYER', 0, 1, 1),
      makeUnit('p2', 'PLAYER', 5, 5), // alive but NOT a participant
      makeUnit('e1', 'ENEMY', 0, 0),
    ]);
    engine.startCombat({
      participantIds: ['p1', 'e1'],
      objective: 'DEFEAT_ALL_HOSTILES',
    });
    engine.endTurn(); // e1 attacks and downs p1
    expect(engine.state.phase).toBe('DEFEAT');
    expect(engine.state.winner).toBe('ENEMY');
    expect(engine.state.encounterResult!.outcome).toBe('DEFEAT');
    expect(engine.state.encounterResult!.objectiveCompleted).toBe(false);
    expect(engine.state.units.find((u) => u.id === 'p2')!.hp).toBe(3);
  });

  it('the app layer can start combat against every living combatant', () => {
    const engine = makeEngine([
      makeUnit('p1', 'PLAYER', 0, 0),
      makeUnit('e1', 'ENEMY', 1, 0, 1),
      makeUnit('e2', 'ENEMY', 9, 9),
    ]);
    engine.startCombat({
      participantIds: allParticipants(engine),
      objective: 'DEFEAT_ALL_HOSTILES',
    });
    expect(engine.state.combatParticipants.sort()).toEqual(['e1', 'e2', 'p1']);
  });
});

describe('acknowledgeVictory', () => {
  it('returns to EXPLORATION on the same scene, preserving all resulting state', () => {
    const engine = makeEngine(
      [
        { ...makeUnit('p1', 'PLAYER', 0, 0), abilityIds: [FIREBALL_ID, PUNCH_ID] },
        makeUnit('e1', 'ENEMY', 2, 0, 1),
        makeUnit('n1', 'NEUTRAL', 7, 0),
      ],
      [
        { id: 'door', kind: 'DOOR', x: 6, y: 0 },
        { id: 'barrel-1', kind: 'BARREL', x: 3, y: 0 },
      ],
    );
    engine.startCombat({
      participantIds: ['p1', 'e1'],
      objective: 'DEFEAT_ALL_HOSTILES',
    });
    // Fireball the barrel: destroys it and downs the adjacent e1.
    expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 3, y: 0 })).toBe(true);
    expect(engine.state.objects.find((o) => o.id === 'barrel-1')).toBeUndefined();
    expect(engine.state.phase).toBe('VICTORY');

    expect(engine.acknowledgeVictory()).toBe(true);
    const state = engine.state;
    expect(state.phase).toBe('EXPLORATION');
    expect(state.winner).toBeNull();
    expect(state.combatParticipants).toEqual([]);
    expect(state.combatObjective).toBeNull();
    expect(state.encounterResult!.outcome).toBe('VICTORY'); // retained for display
    expect(state.objects.find((o) => o.id === 'barrel-1')).toBeUndefined(); // preserved
    expect(state.objects.find((o) => o.id === 'door')!.open).toBe(false); // preserved
    expect(state.units.find((u) => u.id === 'e1')!.hp).toBe(0); // preserved
    // The same engine is back in free exploration: walk through the wreckage,
    // then open the door — with zero Actions left from combat, proving the
    // exploration interaction costs nothing (it does not restore, it does not consume).
    expect(engine.moveExplorationUnit('p1', 5, 0)).toBe(true);
    expect(engine.state.turnResources.p1.actionRemaining).toBe(0);
    expect(engine.interact('p1', 'door')).toBe(true);
    expect(engine.state.turnResources.p1.actionRemaining).toBe(0);
  });

  it('fails unless the scene is in VICTORY', () => {
    const engine = makeEngine([makeUnit('p1', 'PLAYER', 0, 0)]);
    expect(engine.acknowledgeVictory()).toBe(false);
    expect(engine.state.phase).toBe('EXPLORATION');
  });
});

describe('restoreCombatCheckpoint (defeat retry)', () => {
  it('restores the exact pre-combat scene after defeat', () => {
    const engine = makeEngine(
      [
        makeUnit('p1', 'PLAYER', 0, 0, 1),
        makeUnit('e1', 'ENEMY', 1, 0),
        makeUnit('e2', 'ENEMY', 2, 0, 1),
        makeUnit('n1', 'NEUTRAL', 4, 0),
      ],
      [{ id: 'door', kind: 'DOOR', x: 6, y: 0 }],
    );
    engine.startCombat({
      participantIds: ['p1', 'e1', 'e2'],
      objective: 'DEFEAT_ALL_HOSTILES',
    });
    engine.endTurn(); // e1 punches p1 down -> DEFEAT
    expect(engine.state.phase).toBe('DEFEAT');

    expect(engine.restoreCombatCheckpoint()).toBe(true);
    const state = engine.state;
    expect(state.phase).toBe('EXPLORATION');
    expect(state.winner).toBeNull();
    expect(state.combatParticipants).toEqual([]);
    expect(state.encounterResult).toBeNull();
    expect(state.units.find((u) => u.id === 'p1')!.hp).toBe(1);
    expect(state.units.find((u) => u.id === 'p1')!.position).toEqual({ x: 0, y: 0 });
    expect(state.units.find((u) => u.id === 'e1')!.hp).toBe(3);
    expect(state.units.find((u) => u.id === 'e2')!.hp).toBe(1);
    expect(state.units.find((u) => u.id === 'n1')!.hp).toBe(3);
    expect(state.objects.find((o) => o.id === 'door')!.open).toBe(false);
    // Structured events rewind to the pre-combat log (no combat events remain).
    expect(state.events.some((event) => event.type === 'COMBAT_STARTED')).toBe(false);
    expect(state.events.some((event) => event.type === 'CHARACTER_DAMAGED')).toBe(false);
    expect(state.log.some((l) => l.includes('rewinds'))).toBe(true);
    // The retried encounter is fully playable again.
    expect(
      engine.startCombat({ participantIds: ['p1', 'e1', 'e2'], objective: 'DEFEAT_ALL_HOSTILES' }),
    ).toBe(true);
    expect(engine.state.units.find((u) => u.id === 'p1')!.hp).toBe(1);
  });

  it('never rewinds a committed victory through the checkpoint', () => {
    const engine = makeEngine(
      [
        { ...makeUnit('p1', 'PLAYER', 0, 0), abilityIds: [FIREBALL_ID, PUNCH_ID] },
        makeUnit('e1', 'ENEMY', 2, 0, 1),
        makeUnit('e2', 'ENEMY', 9, 9),
      ],
      [{ id: 'barrel-1', kind: 'BARREL', x: 3, y: 0 }],
    );
    engine.startCombat({
      participantIds: ['p1', 'e1'], // e2 stays in the scene but out of the fight
      objective: 'DEFEAT_ALL_HOSTILES',
    });
    expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 3, y: 0 })).toBe(true);
    expect(engine.state.phase).toBe('VICTORY'); // e1 downed by the blast
    expect(engine.restoreCombatCheckpoint()).toBe(false); // victory is committed, not retried
    expect(engine.acknowledgeVictory()).toBe(true);
    expect(engine.state.objects.find((o) => o.id === 'barrel-1')).toBeUndefined(); // preserved
  });

  it('fails unless the scene is in DEFEAT with a checkpoint', () => {
    const engine = makeEngine([makeUnit('p1', 'PLAYER', 0, 0)]);
    expect(engine.restoreCombatCheckpoint()).toBe(false);
  });
});

describe('Neutral actors', () => {
  it('cannot be targeted directly by combat abilities', () => {
    const engine = new TacticalEngine({
      units: [
        makeUnit('p1', 'PLAYER', 0, 0),
        makeUnit('n1', 'NEUTRAL', 2, 0),
        makeUnit('e1', 'ENEMY', 1, 0),
      ],
    });
    expect(engine.canAttack('p1', 'n1')).toBe(false);
    expect(engine.attack('p1', 'n1')).toBe(false);
    const targets = engine
      .getValidAbilityTargets('p1', PUNCH_ID)
      .filter((target): target is { kind: 'UNIT'; unitId: string } => target.kind === 'UNIT')
      .map((target) => target.unitId);
    expect(targets).toEqual(['e1']);
    expect(engine.state.units.find((u) => u.id === 'n1')!.hp).toBe(3);
  });

  it('are ignored by Fireball area effects, including splash overlap', () => {
    const engine = new TacticalEngine({
      units: [
        { ...makeUnit('p1', 'PLAYER', 0, 0), abilityIds: [FIREBALL_ID] },
        makeUnit('n1', 'NEUTRAL', 2, 0), // inside the blast radius
        makeUnit('e1', 'ENEMY', 1, 0),
        makeUnit('e2', 'ENEMY', 3, 0), // inside the blast radius
      ],
    });
    expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 2, y: 0 })).toBe(true);
    expect(engine.state.units.find((u) => u.id === 'n1')!.hp).toBe(3); // immune
    expect(engine.state.units.find((u) => u.id === 'e1')!.hp).toBe(1); // 3 - 2
    expect(engine.state.units.find((u) => u.id === 'e2')!.hp).toBe(1); // 3 - 2
    expect(
      engine.state.events.filter((event) => event.type === 'CHARACTER_DAMAGED').length,
    ).toBe(2); // only the two enemies were damaged
  });

  it('a neutral on the exact target tile is never resolved as a recipient', () => {
    const engine = new TacticalEngine({
      units: [
        { ...makeUnit('p1', 'PLAYER', 0, 0), abilityIds: [FIREBALL_ID] },
        makeUnit('n1', 'NEUTRAL', 2, 0),
        makeUnit('e1', 'ENEMY', 4, 4),
      ],
    });
    expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 2, y: 0 })).toBe(true);
    expect(engine.state.units.find((u) => u.id === 'n1')!.hp).toBe(3);
    expect(
      engine.state.events.filter((event) => event.type === 'CHARACTER_DAMAGED'),
    ).toHaveLength(0);
  });

  it('block movement and stay visible in the scene', () => {
    const engine = makeEngine(
      [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('n1', 'NEUTRAL', 1, 0), makeUnit('e1', 'ENEMY', 9, 9)],
      [wallAt(0, 1), wallAt(1, 1)], // seal the detour so the neutral truly blocks
    );
    expect(engine.canMoveExploration('p1', 2, 0)).toBe(false); // through the neutral
    expect(engine.unitAt(1, 0)?.id).toBe('n1');
    expect(engine.state.units).toHaveLength(3);
  });

  it('are excluded from combat entirely: no resources, no turns, no hazard ticks', () => {
    const engine = makeEngine(
      [
        makeUnit('p1', 'PLAYER', 0, 0),
        makeUnit('e1', 'ENEMY', 9, 9),
        makeUnit('n1', 'NEUTRAL', 5, 0),
      ],
      [{ id: 'hazard-1', kind: 'HAZARD', x: 5, y: 0 }],
    );
    engine.startCombat({
      participantIds: ['p1', 'e1'],
      objective: 'DEFEAT_ALL_HOSTILES',
    });
    expect(engine.state.turnResources.n1).toBeUndefined();
    engine.endTurn();
    engine.endTurn();
    expect(engine.state.units.find((u) => u.id === 'n1')!.hp).toBe(3); // no hazard tick
    expect(engine.state.units.find((u) => u.id === 'n1')!.position).toEqual({ x: 5, y: 0 });
  });
});

describe('structured scene events', () => {
  it('emits ordered events with monotonically increasing sequence numbers and factual values', () => {
    const engine = new TacticalEngine({
      units: [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 1, 1, 1)],
    });
    expect(engine.moveUnit('p1', 0, 1)).toBe(true);
    expect(engine.attack('p1', 'e1')).toBe(true); // adjacent at (1,1)
    const events = engine.state.events;
    expect(events.length).toBeGreaterThanOrEqual(5);
    const seqs = events.map((event) => event.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(events[0].type).toBe('UNIT_MOVED');
    expect(events[1].type).toBe('ABILITY_USED');
    const damaged = events.find((event) => event.type === 'CHARACTER_DAMAGED');
    if (damaged?.type === 'CHARACTER_DAMAGED') {
      expect(damaged.hpBefore).toBe(1);
      expect(damaged.hpAfter).toBe(0);
      expect(damaged.amount).toBe(1);
      expect(damaged.sourceUnitId).toBe('p1');
    }
    const downed = events.find((event) => event.type === 'CHARACTER_DOWNED');
    if (downed?.type === 'CHARACTER_DOWNED') {
      expect(downed.characterId).toBe('e1');
      expect(downed.hpBefore).toBe(1);
    }
    const ability = events.find((event) => event.type === 'ABILITY_USED');
    if (ability?.type === 'ABILITY_USED') {
      expect(ability.casterId).toBe('p1');
      expect(ability.abilityId).toBe(PUNCH_ID);
      expect(ability.actionCost).toBe('ACTION');
    }
    expect(engine.state.phase).toBe('VICTORY');
    expect(
      events.some((event) => event.type === 'COMBAT_ENDED' && event.outcome === 'VICTORY'),
    ).toBe(true);
  });

  it('emits turn boundary events around endTurn', () => {
    const engine = new TacticalEngine({
      units: [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 9, 9)],
    });
    engine.endTurn();
    const types = engine.state.events.map((event) =>
      event.type === 'TURN_STARTED' || event.type === 'TURN_ENDED'
        ? `${event.type}:${event.team}`
        : event.type,
    );
    expect(types).toContain('TURN_ENDED:PLAYER');
    expect(types).toContain('TURN_STARTED:ENEMY');
    expect(types).toContain('TURN_ENDED:ENEMY');
    expect(types).toContain('TURN_STARTED:PLAYER');
  });

  it('emits OBJECT_DESTROYED with position and source when a barrel explodes', () => {
    const engine = new TacticalEngine({
      units: [
        { ...makeUnit('p1', 'PLAYER', 0, 0), abilityIds: [FIREBALL_ID] },
        makeUnit('e1', 'ENEMY', 9, 9),
      ],
      objects: [{ id: 'barrel-1', kind: 'BARREL', x: 2, y: 0 }],
    });
    expect(engine.useAbility('p1', FIREBALL_ID, { kind: 'TILE', x: 2, y: 0 })).toBe(true);
    const event = engine.state.events.find((e) => e.type === 'OBJECT_DESTROYED');
    expect(event).toBeDefined();
    if (event?.type === 'OBJECT_DESTROYED') {
      expect(event.objectId).toBe('barrel-1');
      expect(event.objectKind).toBe('BARREL');
      expect(event.position).toEqual({ x: 2, y: 0 });
      expect(event.sourceUnitId).toBe('p1');
    }
  });

  it('returns cloned events from the state getter so callers cannot corrupt the engine', () => {
    const engine = new TacticalEngine({
      units: [makeUnit('p1', 'PLAYER', 0, 0), makeUnit('e1', 'ENEMY', 9, 9)],
    });
    engine.moveUnit('p1', 1, 0);
    const snapshot = engine.state;
    const moved = snapshot.events.find((event) => event.type === 'UNIT_MOVED');
    if (moved?.type === 'UNIT_MOVED') moved.to.x = 99;
    expect(engine.state.events.find((event) => event.type === 'UNIT_MOVED')).toMatchObject({
      to: { x: 1, y: 0 },
    });
  });

  it('selectImportantEvents keeps combat markers, downings, destructions, and the last five damage events', () => {
    const events: SceneEvent[] = [
      {
        seq: 0,
        type: 'COMBAT_STARTED',
        participantIds: ['p1', 'e1'],
        objective: 'DEFEAT_ALL_HOSTILES',
      },
      { seq: 1, type: 'TURN_STARTED', team: 'PLAYER' },
      {
        seq: 2,
        type: 'UNIT_MOVED',
        unitId: 'p1',
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
        distance: 1,
      },
      {
        seq: 3,
        type: 'ABILITY_USED',
        casterId: 'p1',
        abilityId: 'punch',
        abilityName: 'Punch',
        target: { kind: 'UNIT', unitId: 'e1' },
        actionCost: 'ACTION',
      },
      { seq: 4, type: 'CHARACTER_DAMAGED', targetId: 'e1', sourceUnitId: 'p1', amount: 1, hpBefore: 3, hpAfter: 2 },
      { seq: 5, type: 'CHARACTER_DAMAGED', targetId: 'e1', sourceUnitId: 'p1', amount: 1, hpBefore: 2, hpAfter: 1 },
      { seq: 6, type: 'CHARACTER_DAMAGED', targetId: 'e1', sourceUnitId: 'p1', amount: 1, hpBefore: 1, hpAfter: 0 },
      { seq: 7, type: 'CHARACTER_DOWNED', characterId: 'e1', hpBefore: 1 },
      {
        seq: 8,
        type: 'OBJECT_DESTROYED',
        objectId: 'barrel-1',
        objectKind: 'BARREL',
        position: { x: 2, y: 0 },
        sourceUnitId: 'p1',
      },
      { seq: 9, type: 'COMBAT_ENDED', outcome: 'VICTORY' },
      { seq: 10, type: 'CHARACTER_DAMAGED', targetId: 'p1', sourceUnitId: null, amount: 1, hpBefore: 3, hpAfter: 2 },
      { seq: 11, type: 'CHARACTER_DAMAGED', targetId: 'p1', sourceUnitId: null, amount: 1, hpBefore: 2, hpAfter: 1 },
      { seq: 12, type: 'CHARACTER_DAMAGED', targetId: 'p1', sourceUnitId: null, amount: 1, hpBefore: 1, hpAfter: 0 },
    ];
    const important = selectImportantEvents(events).map((event) => event.seq);
    // 0 combat start, 3 ability use, 7 downing, 8 destruction, 9 combat end,
    // plus the last five damage events (5, 6, 10, 11, 12), in original order.
    expect(important).toEqual([0, 3, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(important).not.toContain(1); // turn markers
    expect(important).not.toContain(2); // routine movement
    expect(important).not.toContain(4); // earlier damage
  });
});

describe('mechanical determinism', () => {
  it('never uses Math.random() anywhere in src/game mechanics', () => {
    const sources = import.meta.glob('../../**/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const offenders = Object.entries(sources)
      .filter(([path, content]) => !path.includes('__tests__') && /Math\.random\(/.test(content))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

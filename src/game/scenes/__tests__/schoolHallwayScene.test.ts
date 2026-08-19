import { describe, expect, it } from 'vitest';
import { TacticalEngine } from '../../combat/engine';
import {
  createSchoolHallwayScene,
  validateSceneTemplate,
} from '../schoolHallwayScene';

describe('school hallway scene template (Phase 6A)', () => {
  it('is a valid 32x32 template with all sockets reachable', () => {
    const template = createSchoolHallwayScene();
    const errors = validateSceneTemplate(template);
    expect(errors).toEqual([]);
    expect(template.config.width).toBe(32);
    expect(template.config.height).toBe(32);
    expect(template.config.initialPhase).toBe('EXPLORATION');
    expect(template.exits.length).toBeGreaterThanOrEqual(1);
    expect(template.exits.length).toBeLessThanOrEqual(4);
  });

  it('constructs into a playable engine with the hero, a neutral, and hostiles', () => {
    const template = createSchoolHallwayScene();
    const engine = new TacticalEngine(template.config);
    const state = engine.state;
    expect(state.phase).toBe('EXPLORATION');
    expect(state.width).toBe(32);
    expect(state.height).toBe(32);
    expect(state.units).toHaveLength(5);
    expect(state.units.find((u) => u.id === 'hero')!.team).toBe('PLAYER');
    expect(state.units.find((u) => u.id === 'sam')!.team).toBe('NEUTRAL');
    expect(state.units.filter((u) => u.team === 'ENEMY')).toHaveLength(3);
    expect(state.objects.length).toBeLessThanOrEqual(128);
  });

  it('lets the hero explore the hallway and open the divider door for free', () => {
    const template = createSchoolHallwayScene();
    const engine = new TacticalEngine(template.config);
    // Walk from the spawn to the tile west of the divider door. The divider
    // wall runs x=20, y=2..13 with the door at (20,8), so the door is
    // approached from the corridor tile (19,8) next to it.
    expect(engine.moveExplorationUnit('hero', 19, 8)).toBe(true);
    expect(engine.state.turnResources.hero.actionRemaining).toBe(1);
    // Open the divider door (adjacent at (19,8) next to door (20,8)) for free.
    expect(engine.canInteract('hero', 'door-divider')).toBe(true);
    expect(engine.interact('hero', 'door-divider')).toBe(true);
    expect(engine.state.objects.find((o) => o.id === 'door-divider')!.open).toBe(true);
    expect(engine.state.turnResources.hero.actionRemaining).toBe(1);
    // Walk through the open door into the east wing.
    expect(engine.moveExplorationUnit('hero', 23, 9)).toBe(true);
    expect(engine.state.units.find((u) => u.id === 'hero')!.position).toEqual({ x: 23, y: 9 });
  });

  it('starts combat on the same board with all living combatants', () => {
    const template = createSchoolHallwayScene();
    const engine = new TacticalEngine(template.config);
    const participants = engine.state.units
      .filter((u) => u.hp > 0 && (u.team === 'PLAYER' || u.team === 'ENEMY'))
      .map((u) => u.id);
    expect(engine.canStartCombat()).toBe(true);
    expect(
      engine.startCombat({ participantIds: participants, objective: 'DEFEAT_ALL_HOSTILES' }),
    ).toBe(true);
    const state = engine.state;
    expect(state.phase).toBe('PLAYER_TURN');
    expect(state.combatParticipants.sort()).toEqual(
      ['brawler-1', 'brawler-2', 'firebrand', 'hero'].sort(),
    );
    // The neutral is never a participant and holds no turn resources.
    expect(state.combatParticipants).not.toContain('sam');
    expect(state.turnResources.sam).toBeUndefined();
  });

  it('runs combat on the same board: turns cycle, enemies advance, the neutral is untouched', () => {
    const template = createSchoolHallwayScene();
    const engine = new TacticalEngine(template.config);
    const participants = ['hero', 'brawler-1', 'brawler-2', 'firebrand'];
    expect(
      engine.startCombat({ participantIds: participants, objective: 'DEFEAT_ALL_HOSTILES' }),
    ).toBe(true);
    expect(engine.state.turnResources.hero.movementRemaining).toBe(3);

    // Hero marches east through the open corridor; enemies converge.
    let heroEast = 0;
    for (let turn = 0; turn < 8 && engine.state.phase === 'PLAYER_TURN'; turn += 1) {
      const hero = engine.state.units.find((u) => u.id === 'hero')!;
      if (hero.position.x < 22) {
        engine.moveUnit('hero', hero.position.x + 3, hero.position.y);
      }
      heroEast = engine.state.units.find((u) => u.id === 'hero')!.position.x;
      engine.endTurn();
    }
    expect(engine.state.phase).toBe('PLAYER_TURN'); // nobody downed yet
    expect(heroEast).toBeGreaterThan(4); // the hero advanced east
    expect(engine.state.units.find((u) => u.id === 'sam')!.hp).toBe(4); // neutral untouched
    expect(engine.state.units.find((u) => u.id === 'sam')!.position).toEqual({ x: 6, y: 25 });
    expect(engine.state.combatParticipants.sort()).toEqual(
      ['brawler-1', 'brawler-2', 'firebrand', 'hero'].sort(),
    );
    // The structured event log contains combat and movement evidence.
    expect(engine.state.events.some((e) => e.type === 'COMBAT_STARTED')).toBe(true);
    expect(engine.state.events.some((e) => e.type === 'TURN_STARTED' && e.team === 'ENEMY')).toBe(
      true,
    );
    // A full victory/defeat/retry loop is exercised in browser QA on this scene.
  });
});

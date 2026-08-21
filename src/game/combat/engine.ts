import { planEnemyAction } from '../ai/enemyBrain';
import { CORE_ABILITIES, PUNCH_ID } from '../abilities/catalog';
import type {
  Ability,
  AbilityEffect,
  AbilityTarget,
  TargetTeam,
  TurnResources,
} from '../abilities/types';
import { createObject, movementCostAt, objectBlocksMovement } from './environment';
import type { MapObject } from './environment';
import { cloneSceneEvent, selectImportantEvents } from './events';
import type { EncounterResult, SceneEvent, SceneEventInput } from './events';
import type {
  CombatStartSpec,
  EngineState,
  GameConfig,
  GridPosition,
  ScenePhase,
  Team,
  Unit,
} from './types';
import { validateEncounterSetup } from './validation';

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Safety cap on brain-driven actions per enemy per turn (guards against AI bugs). */
const MAX_ENEMY_ACTIONS = 32;

export function aliveUnits(units: Unit[], team: Team): Unit[] {
  return units.filter((unit) => unit.team === team && unit.hp > 0);
}

function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Target-team semantics (Phase 6A): `ALLY` means the caster's own team,
 * `ENEMY` means the opposing combat team, `ANY` means either combat team.
 * Neutral actors are excluded from all three filters in the first version.
 */
function matchesTeamFilter(caster: Unit, target: Unit, filter: TargetTeam): boolean {
  if (target.team === 'NEUTRAL') return false;
  if (filter === 'ANY') return true;
  if (filter === 'ALLY') return caster.team === target.team;
  return caster.team !== target.team;
}

interface Checkpoint {
  units: Unit[];
  objects: MapObject[];
  terrain: GridPosition[];
  phase: ScenePhase;
  selectedUnitId: string | null;
  selectedAbilityId: string | null;
  winner: Team | null;
  turnResources: Record<string, TurnResources>;
  log: string[];
  events: SceneEvent[];
  combatParticipants: string[];
  combatObjective: 'DEFEAT_ALL_HOSTILES' | null;
  encounterResult: EncounterResult | null;
  nextSeq: number;
}

export class TacticalEngine {
  private readonly initial: {
    width: number;
    height: number;
    objects: MapObject[];
    terrain: GridPosition[];
    units: Unit[];
    phase: ScenePhase;
  };
  private readonly sceneId: string;
  private readonly createdAt = Date.now();
  private readonly abilitiesById = new Map<string, Ability>();
  private readonly listeners = new Set<() => void>();
  private current: EngineState;
  private nextSeq = 0;
  private resultCounter = 0;
  private combatStartedAt: number | null = null;
  private checkpoint: Checkpoint | null = null;

  constructor(config: GameConfig) {
    for (const ability of [...CORE_ABILITIES, ...(config.abilities ?? [])]) {
      if (this.abilitiesById.has(ability.id)) {
        throw new Error(`Duplicate ability id: ${ability.id}`);
      }
      this.abilitiesById.set(ability.id, ability);
    }

    const units: Unit[] = config.units.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      abilityIds: [...(unit.abilityIds ?? [PUNCH_ID])],
      statuses: (unit.statuses ?? []).map((status) => ({ ...status })),
    }));

    for (const unit of units) {
      for (const abilityId of unit.abilityIds) {
        if (!this.abilitiesById.has(abilityId)) {
          throw new Error(`Unit ${unit.id} references unknown ability: ${abilityId}`);
        }
      }
    }

    const width = config.width ?? 10;
    const height = config.height ?? 10;
    const objects = (config.objects ?? []).map((objectConfig) => createObject(objectConfig));
    const terrain = (config.terrain ?? []).map((position) => ({ ...position }));
    const encounterErrors = validateEncounterSetup({ width, height, objects, terrain, units });
    if (encounterErrors.length > 0) {
      throw new Error(`Invalid encounter: ${encounterErrors.join('; ')}`);
    }

    this.sceneId = config.sceneId ?? 'scene';
    // Legacy Phase 0-5 behavior starts in PLAYER_TURN; persistent scenes pass EXPLORATION.
    const phase: ScenePhase = config.initialPhase === 'EXPLORATION' ? 'EXPLORATION' : 'PLAYER_TURN';
    this.initial = {
      width,
      height,
      objects,
      terrain,
      units,
      phase,
    };
    this.current = this.buildInitialState();
  }

  get state(): EngineState {
    const turnResources: Record<string, TurnResources> = {};
    for (const [unitId, resources] of Object.entries(this.current.turnResources)) {
      turnResources[unitId] = { ...resources };
    }

    return {
      ...this.current,
      objects: this.current.objects.map((object) => ({
        ...object,
        position: { ...object.position },
      })),
      terrain: this.current.terrain.map((position) => ({ ...position })),
      units: this.current.units.map((unit) => ({
        ...unit,
        position: { ...unit.position },
        abilityIds: [...unit.abilityIds],
        statuses: unit.statuses.map((status) => ({ ...status })),
      })),
      turnResources,
      log: [...this.current.log],
      events: this.current.events.map((event) => cloneSceneEvent(event)),
      combatParticipants: [...this.current.combatParticipants],
      encounterResult:
        this.current.encounterResult === null
          ? null
          : this.cloneEncounterResult(this.current.encounterResult),
    };
  }

  /** Framework-agnostic state subscription for React, Phaser, and future app controllers. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getAbility(abilityId: string): Ability | null {
    return this.abilitiesById.get(abilityId) ?? null;
  }

  getAbilitiesForUnit(unitId: string): Ability[] {
    const unit = this.findUnit(unitId);
    if (unit === null) return [];
    return unit.abilityIds.flatMap((abilityId) => {
      const ability = this.getAbility(abilityId);
      return ability === null ? [] : [ability];
    });
  }

  /** Living player units — the enemy brain's view of valid targets. */
  alivePlayers(): Unit[] {
    return aliveUnits(this.current.units, 'PLAYER');
  }

  /** First step of the shortest legal path from `from` to `to`, or null. */
  firstStepToward(from: GridPosition, to: GridPosition): GridPosition | null {
    const path = this.computePath(from, to);
    return path === null || path.length === 0 ? null : path[0];
  }

  /**
   * Full shortest legal path between two points (same collision and path-cost
   * rules as combat movement). Used for exploration movement and for
   * presentation-only path animation; the engine remains the path authority.
   */
  pathBetween(from: GridPosition, to: GridPosition): GridPosition[] | null {
    return this.computePath(from, to);
  }

  isBlocked(x: number, y: number): boolean {
    return this.current.objects.some(
      (object) =>
        object.position.x === x && object.position.y === y && objectBlocksMovement(object),
    );
  }

  unitAt(x: number, y: number): Unit | null {
    const units = this.current.units.filter(
      (unit) => unit.position.x === x && unit.position.y === y,
    );
    return units.find((unit) => unit.hp > 0) ?? units[0] ?? null;
  }

  getMovementRange(unitId: string): GridPosition[] {
    return this.getMovementOptions(unitId).map(({ position }) => position);
  }

  canMove(unitId: string, x: number, y: number): boolean {
    const unit = this.findUnit(unitId);
    if (unit === null || unit.hp <= 0) return false;
    if (this.activeTeam() !== unit.team) return false;
    return this.getMovementOptions(unitId).some(
      ({ position }) => position.x === x && position.y === y,
    );
  }

  moveUnit(unitId: string, x: number, y: number): boolean {
    if (!this.canMove(unitId, x, y)) return false;
    const option = this.getMovementOptions(unitId).find(
      ({ position }) => position.x === x && position.y === y,
    );
    if (option === undefined) return false;

    const unit = this.findUnit(unitId)!;
    const from = { ...unit.position };
    unit.position = { x, y };
    this.current.turnResources[unit.id].movementRemaining -= option.distance;
    this.current.log.push(`${unit.name} moved to (${x},${y})`);
    this.emit({
      type: 'UNIT_MOVED',
      unitId: unit.id,
      from,
      to: { x, y },
      distance: option.distance,
    });
    this.notifyListeners();
    return true;
  }

  // ---- exploration commands (Phase 6A) ----

  /**
   * Exploration click-to-move: valid only in EXPLORATION, only for a living
   * player-controlled unit, and the destination must be reachable by the same
   * collision/path-cost rules as combat. No movement allowance or action is
   * consumed; the unit moves along the computed path (animation is
   * presentation only).
   */
  canMoveExploration(unitId: string, x: number, y: number): boolean {
    const unit = this.findUnit(unitId);
    if (unit === null || unit.hp <= 0) return false;
    if (unit.team !== 'PLAYER' || unit.controller !== 'PLAYER') return false;
    if (this.current.phase !== 'EXPLORATION') return false;
    if (this.isOccupiedByAliveUnit(x, y)) return false;
    return this.computePath(unit.position, { x, y }) !== null;
  }

  /**
   * Full path the player-controlled unit would take in exploration, or null
   * when the destination is not reachable. Rendering uses this for
   * presentation-only animation; the engine's position update is immediate.
   */
  getExplorationPath(unitId: string, x: number, y: number): GridPosition[] | null {
    const unit = this.findUnit(unitId);
    if (unit === null || unit.hp <= 0) return null;
    if (unit.team !== 'PLAYER' || unit.controller !== 'PLAYER') return null;
    if (this.current.phase !== 'EXPLORATION') return null;
    if (this.isOccupiedByAliveUnit(x, y)) return null;
    return this.computePath(unit.position, { x, y });
  }

  moveExplorationUnit(unitId: string, x: number, y: number): boolean {
    const unit = this.findUnit(unitId);
    if (unit === null || unit.hp <= 0) return false;
    if (unit.team !== 'PLAYER' || unit.controller !== 'PLAYER') return false;
    if (this.current.phase !== 'EXPLORATION') return false;
    if (this.isOccupiedByAliveUnit(x, y)) return false;
    const path = this.computePath(unit.position, { x, y });
    if (path === null) return false;

    const from = { ...unit.position };
    unit.position = { x, y };
    this.current.log.push(`${unit.name} moves to (${x},${y})`);
    this.emit({
      type: 'UNIT_MOVED',
      unitId: unit.id,
      from,
      to: { x, y },
      distance: path.length,
    });
    this.notifyListeners();
    return true;
  }

  // ---- combat lifecycle (Phase 6A) ----

  /** Combat may start from exploration only when both sides have living units. */
  canStartCombat(): boolean {
    if (this.current.phase !== 'EXPLORATION') return false;
    return (
      aliveUnits(this.current.units, 'PLAYER').length > 0 &&
      aliveUnits(this.current.units, 'ENEMY').length > 0
    );
  }

  /**
   * Start turn-based combat on the current scene with explicit participants.
   * Snapshots the complete pre-combat scene (Retry restores it exactly),
   * initializes turn resources for participants only, and emits COMBAT_STARTED.
   */
  startCombat(spec: CombatStartSpec): boolean {
    if (this.current.phase !== 'EXPLORATION') return false;
    if (spec.objective !== 'DEFEAT_ALL_HOSTILES') return false;
    if (new Set(spec.participantIds).size !== spec.participantIds.length) return false;

    const participants = spec.participantIds.map((id) => this.findUnit(id));
    if (participants.some((unit) => unit === null)) return false;
    if (participants.some((unit) => unit!.team === 'NEUTRAL')) return false;
    const livingPlayers = participants.filter(
      (unit) => unit!.team === 'PLAYER' && unit!.hp > 0,
    );
    const livingEnemies = participants.filter(
      (unit) => unit!.team === 'ENEMY' && unit!.hp > 0,
    );
    if (livingPlayers.length === 0 || livingEnemies.length === 0) return false;

    this.checkpoint = this.snapshotCheckpoint();
    this.combatStartedAt = Date.now();
    this.current.combatParticipants = [...spec.participantIds];
    this.current.combatObjective = spec.objective;
    for (const unit of this.current.units) {
      if (this.current.combatParticipants.includes(unit.id)) {
        this.current.turnResources[unit.id] = this.freshResources(unit);
      } else {
        // Only explicit participants hold combat resources.
        delete this.current.turnResources[unit.id];
      }
    }
    this.current.selectedUnitId = null;
    this.current.selectedAbilityId = null;
    this.current.phase = 'PLAYER_TURN';
    this.current.log.push('--- COMBAT START ---');
    this.emit({
      type: 'COMBAT_STARTED',
      participantIds: [...spec.participantIds],
      objective: spec.objective,
    });
    this.emit({ type: 'TURN_STARTED', team: 'PLAYER' });
    this.notifyListeners();
    return true;
  }

  /**
   * Victory acknowledgment: returns the same engine and scene to
   * EXPLORATION while preserving all resulting HP, statuses, positions,
   * destroyed objects, door state, and the encounter result for display.
   */
  acknowledgeVictory(): boolean {
    if (this.current.phase !== 'VICTORY') return false;
    this.current.phase = 'EXPLORATION';
    this.current.winner = null;
    this.current.selectedUnitId = null;
    this.current.selectedAbilityId = null;
    this.current.combatParticipants = [];
    this.current.combatObjective = null;
    this.current.log.push('The fight is over. The scene returns to exploration.');
    this.notifyListeners();
    return true;
  }

  /**
   * Defeat Retry: restores the exact pre-combat checkpoint (units, objects,
   * terrain, phase, selection, resources, log, and structured events). No
   * defeat state becomes canon in this vertical slice.
   */
  restoreCombatCheckpoint(): boolean {
    if (this.current.phase !== 'DEFEAT' || this.checkpoint === null) return false;
    const cp = this.checkpoint;
    this.current = {
      width: this.current.width,
      height: this.current.height,
      objects: cp.objects.map((object) => ({
        ...object,
        position: { ...object.position },
      })),
      terrain: cp.terrain.map((position) => ({ ...position })),
      units: cp.units.map((unit) => ({
        ...unit,
        position: { ...unit.position },
        abilityIds: [...unit.abilityIds],
        statuses: unit.statuses.map((status) => ({ ...status })),
      })),
      phase: cp.phase,
      selectedUnitId: cp.selectedUnitId,
      selectedAbilityId: cp.selectedAbilityId,
      winner: cp.winner,
      turnResources: Object.fromEntries(
        Object.entries(cp.turnResources).map(([id, resources]) => [id, { ...resources }]),
      ),
      log: [...cp.log],
      events: cp.events.map((event) => cloneSceneEvent(event)),
      combatParticipants: [...cp.combatParticipants],
      combatObjective: cp.combatObjective,
      encounterResult:
        cp.encounterResult === null ? null : this.cloneEncounterResult(cp.encounterResult),
    };
    this.nextSeq = cp.nextSeq;
    this.combatStartedAt = null;
    this.current.log.push('The scene rewinds to just before the fight. Retry the encounter.');
    this.notifyListeners();
    return true;
  }

  canSelectAbility(unitId: string, abilityId: string): boolean {
    const unit = this.findUnit(unitId);
    const ability = this.getAbility(abilityId);
    return unit !== null && ability !== null && this.canPrepareAbility(unit, ability);
  }

  selectAbility(abilityId: string | null): boolean {
    if (abilityId === null) {
      this.current.selectedAbilityId = null;
      this.notifyListeners();
      return true;
    }

    const selected =
      this.current.selectedUnitId === null ? null : this.findUnit(this.current.selectedUnitId);
    if (selected === null || !this.canSelectAbility(selected.id, abilityId)) return false;
    this.current.selectedAbilityId = abilityId;
    this.notifyListeners();
    return true;
  }

  getValidAbilityTargets(casterId: string, abilityId: string): AbilityTarget[] {
    const caster = this.findUnit(casterId);
    const ability = this.getAbility(abilityId);
    if (caster === null || ability === null || !this.canPrepareAbility(caster, ability)) return [];

    const candidates: AbilityTarget[] = [];
    if (ability.targeting.kind === 'SELF') {
      candidates.push({ kind: 'UNIT', unitId: caster.id });
    } else if (ability.targeting.kind === 'UNIT') {
      for (const unit of this.current.units) {
        if (unit.hp > 0) candidates.push({ kind: 'UNIT', unitId: unit.id });
      }
    } else {
      for (let x = 0; x < this.current.width; x += 1) {
        for (let y = 0; y < this.current.height; y += 1) {
          candidates.push({ kind: 'TILE', x, y });
        }
      }
    }

    return candidates.filter((target) => this.isAbilityTargetValid(caster, ability, target, true));
  }

  getAffectedUnitIds(casterId: string, abilityId: string, target: AbilityTarget): string[] {
    const caster = this.findUnit(casterId);
    const ability = this.getAbility(abilityId);
    if (caster === null || ability === null) return [];
    if (!this.isAbilityTargetValid(caster, ability, target, false)) return [];
    return this.resolveRecipients(caster, ability, target).map((unit) => unit.id);
  }

  canUseAbility(casterId: string, abilityId: string, target: AbilityTarget): boolean {
    const caster = this.findUnit(casterId);
    const ability = this.getAbility(abilityId);
    if (caster === null || ability === null || !this.canPrepareAbility(caster, ability))
      return false;
    return this.isAbilityTargetValid(caster, ability, target, true);
  }

  useAbility(casterId: string, abilityId: string, target: AbilityTarget): boolean {
    if (!this.canUseAbility(casterId, abilityId, target)) return false;
    const caster = this.findUnit(casterId)!;
    const ability = this.getAbility(abilityId)!;
    const recipients = this.resolveRecipients(caster, ability, target);
    const targetPosition = this.targetPosition(target)!;
    const objectRecipients = this.resolveObjectRecipients(ability, targetPosition);

    this.consumeActionCost(caster.id, ability);
    this.emit({
      type: 'ABILITY_USED',
      casterId: caster.id,
      abilityId: ability.id,
      abilityName: ability.name,
      target,
      actionCost: ability.actionCost,
    });
    for (const effect of ability.effects) {
      this.applyEffect(caster, ability, effect, recipients, targetPosition);
      // Destructible objects take damage only from TILE-targeting abilities.
      if (effect.kind === 'DAMAGE') {
        for (const object of objectRecipients) {
          this.damageObject(caster, object, effect.amount);
        }
      }
    }
    this.checkGameOver();
    this.current.selectedAbilityId = null;
    this.notifyListeners();
    return true;
  }

  /**
   * Phase-aware interaction legality (Phase 6A): in EXPLORATION any living
   * player-controlled unit may interact for free; in combat the active team's
   * units pay one Action. Adjacency and door-occupancy rules are shared.
   */
  canInteract(unitId: string, objectId: string): boolean {
    const unit = this.findUnit(unitId);
    const object = this.current.objects.find((candidate) => candidate.id === objectId);
    if (unit === null || object === undefined) return false;
    if (unit.hp <= 0) return false;
    if (!object.interactable) return false;
    if (manhattanDistance(unit.position, object.position) !== 1) return false;

    if (this.current.phase === 'EXPLORATION') {
      if (unit.team !== 'PLAYER' || unit.controller !== 'PLAYER') return false;
    } else {
      if (this.activeTeam() !== unit.team) return false;
      const resources = this.current.turnResources[unit.id];
      if (resources === undefined || resources.actionRemaining <= 0) return false;
    }
    if (
      object.kind === 'DOOR' &&
      object.open &&
      this.isOccupiedByAliveUnit(object.position.x, object.position.y)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Interact with an adjacent interactable object (currently doors). Costs one
   * Action in combat; exploration interaction is free.
   */
  interact(unitId: string, objectId: string): boolean {
    if (!this.canInteract(unitId, objectId)) return false;
    const unit = this.findUnit(unitId)!;
    const object = this.current.objects.find((candidate) => candidate.id === objectId)!;

    if (this.current.phase !== 'EXPLORATION') {
      this.current.turnResources[unit.id].actionRemaining -= 1;
    }
    if (object.kind === 'DOOR') {
      object.open = !object.open;
      this.current.log.push(
        object.open ? `${unit.name} opens the door` : `${unit.name} closes the door`,
      );
    }
    this.emit({
      type: 'OBJECT_INTERACTED',
      unitId: unit.id,
      objectId: object.id,
      objectKind: object.kind,
      open: object.open,
    });
    this.notifyListeners();
    return true;
  }

  /** Phase 1 compatibility: a basic attack is now the data-defined Punch ability. */
  canAttack(attackerId: string, targetId: string): boolean {
    return this.canUseAbility(attackerId, PUNCH_ID, { kind: 'UNIT', unitId: targetId });
  }

  /** Phase 1 compatibility: all validation and damage flow through useAbility. */
  attack(attackerId: string, targetId: string): boolean {
    return this.useAbility(attackerId, PUNCH_ID, { kind: 'UNIT', unitId: targetId });
  }

  selectUnit(unitId: string): void {
    this.current.selectedUnitId = this.findUnit(unitId) === null ? null : unitId;
    this.current.selectedAbilityId = null;
    this.notifyListeners();
  }

  endTurn(): void {
    if (this.current.phase !== 'PLAYER_TURN') return;

    this.tickStatuses('PLAYER');
    this.current.selectedUnitId = null;
    this.current.selectedAbilityId = null;
    this.emit({ type: 'TURN_ENDED', team: 'PLAYER' });
    this.current.phase = 'ENEMY_TURN';
    this.startTurn('ENEMY');
    this.current.log.push('--- ENEMY TURN ---');
    this.emit({ type: 'TURN_STARTED', team: 'ENEMY' });
    this.runEnemyAI();

    if (this.current.phase === 'ENEMY_TURN') {
      this.tickStatuses('ENEMY');
      this.emit({ type: 'TURN_ENDED', team: 'ENEMY' });
      this.current.phase = 'PLAYER_TURN';
      this.startTurn('PLAYER');
      this.current.log.push('--- PLAYER TURN ---');
      this.emit({ type: 'TURN_STARTED', team: 'PLAYER' });
    }
    this.notifyListeners();
  }

  reset(): void {
    this.nextSeq = 0;
    this.resultCounter = 0;
    this.combatStartedAt = null;
    this.checkpoint = null;
    this.current = this.buildInitialState();
    this.notifyListeners();
  }

  // ---- ability internals ----

  private canPrepareAbility(caster: Unit, ability: Ability): boolean {
    if (caster.hp <= 0 || this.activeTeam() !== caster.team) return false;
    if (!caster.abilityIds.includes(ability.id)) return false;
    const resources = this.current.turnResources[caster.id];
    if (resources === undefined) return false;
    if (ability.actionCost === 'ACTION') return resources.actionRemaining > 0;
    if (ability.actionCost === 'BONUS_ACTION') return resources.bonusActionRemaining > 0;
    return true;
  }

  private consumeActionCost(casterId: string, ability: Ability): void {
    const resources = this.current.turnResources[casterId];
    if (ability.actionCost === 'ACTION') resources.actionRemaining -= 1;
    if (ability.actionCost === 'BONUS_ACTION') resources.bonusActionRemaining -= 1;
  }

  private isAbilityTargetValid(
    caster: Unit,
    ability: Ability,
    target: AbilityTarget,
    checkRequirements: boolean,
  ): boolean {
    const position = this.targetPosition(target);
    if (position === null) return false;

    if (ability.targeting.kind === 'SELF') {
      if (target.kind !== 'UNIT' || target.unitId !== caster.id) return false;
    } else if (ability.targeting.kind === 'UNIT') {
      if (target.kind !== 'UNIT') return false;
      const targetUnit = this.findUnit(target.unitId);
      if (targetUnit === null || targetUnit.hp <= 0) return false;
      if (!matchesTeamFilter(caster, targetUnit, ability.targeting.team)) return false;
    } else {
      if (target.kind !== 'TILE') return false;
      if (!this.isTileTargetable(target.x, target.y)) return false;
    }

    if (manhattanDistance(caster.position, position) > ability.targeting.range) return false;
    if (!checkRequirements) return true;

    const recipients = this.resolveRecipients(caster, ability, target);
    return ability.requirements.every((requirement) => {
      if (requirement.kind === 'TARGET_DAMAGED') {
        return recipients.some((unit) => unit.hp < unit.maxHp);
      }
      return recipients.some((unit) =>
        unit.statuses.some((status) => status.id === requirement.statusId),
      );
    });
  }

  private targetPosition(target: AbilityTarget): GridPosition | null {
    if (target.kind === 'TILE') return { x: target.x, y: target.y };
    const unit = this.findUnit(target.unitId);
    return unit === null ? null : { ...unit.position };
  }

  private resolveRecipients(caster: Unit, ability: Ability, target: AbilityTarget): Unit[] {
    const center = this.targetPosition(target);
    if (center === null) return [];

    if (ability.area.shape === 'SINGLE') {
      if (target.kind === 'UNIT') {
        const unit = this.findUnit(target.unitId);
        return unit !== null && unit.hp > 0 ? [unit] : [];
      }
      // Tile-targeted single units: neutrals are never combat recipients.
      const unit = this.current.units.find(
        (candidate) =>
          candidate.hp > 0 &&
          candidate.team !== 'NEUTRAL' &&
          candidate.position.x === target.x &&
          candidate.position.y === target.y,
      );
      return unit === undefined ? [] : [unit];
    }

    const area = ability.area;
    return this.current.units.filter(
      (unit) =>
        unit.hp > 0 &&
        manhattanDistance(unit.position, center) <= area.radius &&
        matchesTeamFilter(caster, unit, area.affects),
    );
  }

  /** Destructible objects hit by a TILE-targeting ability, per its area shape. */
  private resolveObjectRecipients(ability: Ability, center: GridPosition): MapObject[] {
    if (ability.targeting.kind !== 'TILE') return [];
    const destructible = this.current.objects.filter((object) => object.destructible);
    const area = ability.area;
    if (area.shape === 'SINGLE') {
      return destructible.filter(
        (object) => object.position.x === center.x && object.position.y === center.y,
      );
    }
    return destructible.filter(
      (object) => manhattanDistance(object.position, center) <= area.radius,
    );
  }

  private damageObject(caster: Unit, object: MapObject, amount: number): void {
    if (object.hp <= 0) return;
    const damage = Math.max(0, Math.floor(amount));
    object.hp = Math.max(0, object.hp - damage);
    this.current.log.push(
      `${caster.name} damages the ${object.kind.toLowerCase()} for ${damage} damage`,
    );
    if (object.hp <= 0) {
      this.current.log.push(`${caster.name} destroys the ${object.kind.toLowerCase()}`);
      const position = { ...object.position };
      this.current.objects = this.current.objects.filter((candidate) => candidate.id !== object.id);
      this.emit({
        type: 'OBJECT_DESTROYED',
        objectId: object.id,
        objectKind: object.kind,
        position,
        sourceUnitId: caster.id,
      });
    }
  }

  private applyEffect(
    caster: Unit,
    ability: Ability,
    effect: AbilityEffect,
    recipients: Unit[],
    targetPosition: GridPosition,
  ): void {
    for (const recipient of recipients) {
      if (effect.kind === 'DAMAGE') {
        this.applyDamage(caster, ability, recipient, effect.amount);
      } else if (effect.kind === 'HEAL') {
        this.applyHeal(caster, ability, recipient, effect.amount);
      } else if (effect.kind === 'PUSH') {
        const origin = effect.origin === 'CASTER' ? caster.position : targetPosition;
        this.applyPush(caster, ability, recipient, effect.distance, origin);
      } else {
        this.applyStatus(caster, ability, recipient, effect.status);
      }
    }
  }

  private applyDamage(caster: Unit, ability: Ability, target: Unit, amount: number): void {
    if (target.hp <= 0) return;
    const hpBefore = target.hp;
    const damage = Math.max(0, Math.floor(amount));
    target.hp = Math.max(0, target.hp - damage);
    this.current.log.push(
      `${caster.name} ${ability.presentation.verb} ${target.name} for ${damage} damage`,
    );
    this.emit({
      type: 'CHARACTER_DAMAGED',
      targetId: target.id,
      sourceUnitId: caster.id,
      amount: damage,
      hpBefore,
      hpAfter: target.hp,
    });
    if (target.hp === 0) {
      this.current.log.push(`${target.name} is downed`);
      this.emit({ type: 'CHARACTER_DOWNED', characterId: target.id, hpBefore });
    }
  }

  private applyHeal(caster: Unit, ability: Ability, target: Unit, amount: number): void {
    if (target.hp <= 0) return;
    const hpBefore = target.hp;
    const healed = Math.min(Math.max(0, Math.floor(amount)), target.maxHp - target.hp);
    target.hp += healed;
    this.current.log.push(
      `${caster.name} ${ability.presentation.verb} ${target.name} for ${healed} HP`,
    );
    this.emit({
      type: 'CHARACTER_HEALED',
      targetId: target.id,
      sourceUnitId: caster.id,
      amount: healed,
      hpBefore,
      hpAfter: target.hp,
    });
  }

  private applyPush(
    caster: Unit,
    ability: Ability,
    target: Unit,
    distance: number,
    origin: GridPosition,
  ): void {
    if (target.hp <= 0) return;
    const dx = target.position.x - origin.x;
    const dy = target.position.y - origin.y;
    if (dx === 0 && dy === 0) return;

    const step =
      Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    let moved = 0;
    for (let index = 0; index < Math.max(0, Math.floor(distance)); index += 1) {
      const next = { x: target.position.x + step.x, y: target.position.y + step.y };
      if (!this.isInBounds(next.x, next.y) || this.isBlocked(next.x, next.y)) break;
      if (this.isOccupiedByAliveUnit(next.x, next.y, target.id)) break;
      target.position = next;
      moved += 1;
    }
    this.current.log.push(
      `${caster.name} ${ability.presentation.verb} ${target.name} ${moved} ${moved === 1 ? 'tile' : 'tiles'}`,
    );
  }

  private applyStatus(
    caster: Unit,
    ability: Ability,
    target: Unit,
    definition: { id: string; name: string; durationTurns: number },
  ): void {
    if (target.hp <= 0) return;
    const duration = Math.max(1, Math.floor(definition.durationTurns));
    const existing = target.statuses.find((status) => status.id === definition.id);
    if (existing === undefined) {
      target.statuses.push({
        id: definition.id,
        name: definition.name,
        remainingTurns: duration,
        sourceUnitId: caster.id,
      });
    } else {
      existing.remainingTurns = Math.max(existing.remainingTurns, duration);
      existing.sourceUnitId = caster.id;
    }
    this.current.log.push(
      `${caster.name} ${ability.presentation.verb} ${target.name} with ${definition.name}`,
    );
    this.emit({
      type: 'STATUS_APPLIED',
      targetId: target.id,
      sourceUnitId: caster.id,
      statusId: definition.id,
      statusName: definition.name,
      durationTurns: duration,
    });
  }

  // ---- turn, movement, and board internals ----

  private buildInitialState(): EngineState {
    const units = this.initial.units.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      abilityIds: [...unit.abilityIds],
      statuses: unit.statuses.map((status) => ({ ...status })),
    }));
    const turnResources: Record<string, TurnResources> = {};
    // Neutral actors are not combat participants and hold no turn resources.
    for (const unit of units) {
      if (unit.team !== 'NEUTRAL') turnResources[unit.id] = this.freshResources(unit);
    }

    return {
      width: this.initial.width,
      height: this.initial.height,
      objects: this.initial.objects.map((object) => ({
        ...object,
        position: { ...object.position },
      })),
      terrain: this.initial.terrain.map((position) => ({ ...position })),
      units,
      phase: this.initial.phase,
      selectedUnitId: null,
      selectedAbilityId: null,
      winner: null,
      turnResources,
      log: [],
      events: [],
      combatParticipants: [],
      combatObjective: null,
      encounterResult: null,
    };
  }

  private freshResources(unit: Unit): TurnResources {
    return { movementRemaining: unit.movement, actionRemaining: 1, bonusActionRemaining: 1 };
  }

  private startTurn(team: Team): void {
    for (const unit of aliveUnits(this.current.units, team)) {
      this.current.turnResources[unit.id] = this.freshResources(unit);
    }
    // Hazard damage can end the battle (e.g. the last player downed by a hazard).
    if (this.tickHazards(team)) this.checkGameOver();
  }

  private tickHazards(team: Team): boolean {
    let damaged = false;
    for (const unit of aliveUnits(this.current.units, team)) {
      const hazard = this.current.objects.some(
        (object) =>
          object.kind === 'HAZARD' &&
          object.position.x === unit.position.x &&
          object.position.y === unit.position.y,
      );
      if (!hazard) continue;
      const hpBefore = unit.hp;
      unit.hp = Math.max(0, unit.hp - 1);
      this.current.log.push(`${unit.name} takes 1 damage from the hazard`);
      this.emit({
        type: 'CHARACTER_DAMAGED',
        targetId: unit.id,
        sourceUnitId: null,
        amount: 1,
        hpBefore,
        hpAfter: unit.hp,
      });
      if (unit.hp === 0) {
        this.emit({ type: 'CHARACTER_DOWNED', characterId: unit.id, hpBefore });
      }
      damaged = true;
    }
    return damaged;
  }

  private tickStatuses(team: Team): void {
    for (const unit of aliveUnits(this.current.units, team)) {
      for (const status of unit.statuses) status.remainingTurns -= 1;
      const expired = unit.statuses.filter((status) => status.remainingTurns <= 0);
      unit.statuses = unit.statuses.filter((status) => status.remainingTurns > 0);
      for (const status of expired) {
        this.current.log.push(`${status.name} expired on ${unit.name}`);
      }
    }
  }

  private getMovementOptions(unitId: string): Array<{ position: GridPosition; distance: number }> {
    const unit = this.findUnit(unitId);
    if (unit === null || unit.hp <= 0) return [];
    const movementRemaining = this.current.turnResources[unit.id]?.movementRemaining ?? 0;
    if (movementRemaining <= 0) return [];

    // Cost-aware Dijkstra: entering a difficult-terrain tile costs 2 movement,
    // so a tile may be reachable at a lower cost via a longer path.
    const startKey = `${unit.position.x},${unit.position.y}`;
    const best = new Map<string, number>([[startKey, 0]]);
    const queue: Array<{ x: number; y: number; cost: number }> = [
      { x: unit.position.x, y: unit.position.y, cost: 0 },
    ];

    while (queue.length > 0) {
      const current = this.popCheapest(queue);
      if (best.get(`${current.x},${current.y}`) !== current.cost) continue; // stale entry
      for (const [dx, dy] of NEIGHBORS) {
        const next = { x: current.x + dx, y: current.y + dy };
        if (!this.isInBounds(next.x, next.y) || this.isBlocked(next.x, next.y)) continue;
        if (this.isOccupiedByAliveUnit(next.x, next.y)) continue;
        const cost = current.cost + movementCostAt(next.x, next.y, this.current.terrain);
        if (cost > movementRemaining) continue;
        const key = `${next.x},${next.y}`;
        const known = best.get(key);
        if (known !== undefined && known <= cost) continue;
        best.set(key, cost);
        queue.push({ ...next, cost });
      }
    }

    const reachable: Array<{ position: GridPosition; distance: number }> = [];
    for (const [key, cost] of best) {
      if (cost <= 0) continue;
      const [x, y] = key.split(',').map(Number);
      reachable.push({ position: { x, y }, distance: cost });
    }
    return reachable;
  }

  /** Removes and returns the lowest-cost entry (ties: first inserted). */
  private popCheapest<T extends { cost: number }>(queue: T[]): T {
    let bestIndex = 0;
    for (let index = 1; index < queue.length; index += 1) {
      if (queue[index].cost < queue[bestIndex].cost) bestIndex = index;
    }
    return queue.splice(bestIndex, 1)[0];
  }

  /**
   * Cost-aware Dijkstra with parent reconstruction. The destination itself may
   * be occupied (chase semantics); intermediate tiles must be free. Doors are
   * treated by their live state: closed doors block, open doors pass.
   */
  private computePath(from: GridPosition, to: GridPosition): GridPosition[] | null {
    const startKey = `${from.x},${from.y}`;
    const goalKey = `${to.x},${to.y}`;
    if (startKey === goalKey) return [];

    const best = new Map<string, number>([[startKey, 0]]);
    const parent = new Map<string, string>();
    const queue: Array<{ key: string; x: number; y: number; cost: number }> = [
      { key: startKey, x: from.x, y: from.y, cost: 0 },
    ];

    while (queue.length > 0) {
      const current = this.popCheapest(queue);
      if (best.get(current.key) !== current.cost) continue; // stale entry
      if (current.key === goalKey) {
        const path: GridPosition[] = [];
        let key = goalKey;
        while (key !== startKey) {
          const [x, y] = key.split(',').map(Number);
          path.push({ x, y });
          key = parent.get(key)!;
        }
        return path.reverse();
      }
      for (const [dx, dy] of NEIGHBORS) {
        const next = { x: current.x + dx, y: current.y + dy };
        const key = `${next.x},${next.y}`;
        if (!this.isInBounds(next.x, next.y) || this.isBlocked(next.x, next.y)) continue;
        if (key !== goalKey && this.isOccupiedByAliveUnit(next.x, next.y)) continue;
        const cost = current.cost + movementCostAt(next.x, next.y, this.current.terrain);
        const known = best.get(key);
        if (known !== undefined && known <= cost) continue;
        best.set(key, cost);
        parent.set(key, current.key);
        queue.push({ key, x: next.x, y: next.y, cost });
      }
    }
    return null;
  }

  private findUnit(unitId: string): Unit | null {
    return this.current.units.find((unit) => unit.id === unitId) ?? null;
  }

  /**
   * A tile is a legal TILE target when it is in bounds and not sealed by an
   * indestructible blocker. Destructible objects (e.g. barrels) are valid
   * targets so area abilities can destroy them; walls and closed doors are not.
   */
  private isTileTargetable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    return !this.current.objects.some(
      (object) =>
        object.position.x === x &&
        object.position.y === y &&
        objectBlocksMovement(object) &&
        !object.destructible,
    );
  }

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.current.width && y < this.current.height;
  }

  private isOccupiedByAliveUnit(x: number, y: number, exceptUnitId?: string): boolean {
    return this.current.units.some(
      (unit) =>
        unit.id !== exceptUnitId && unit.hp > 0 && unit.position.x === x && unit.position.y === y,
    );
  }

  /** The team whose turn it is to act; null once the game is over or exploring. */
  private activeTeam(): Team | null {
    if (this.current.phase === 'PLAYER_TURN') return 'PLAYER';
    if (this.current.phase === 'ENEMY_TURN') return 'ENEMY';
    return null;
  }

  /**
   * Victory/defeat checks only explicit combat participants (Phase 6A). The
   * legacy path (engine started in PLAYER_TURN without startCombat) falls back
   * to the full PLAYER/ENEMY rosters, preserving Phase 0-5 behavior.
   */
  private checkGameOver(): void {
    if (this.current.phase === 'VICTORY' || this.current.phase === 'DEFEAT') return;
    const participants =
      this.current.combatParticipants.length > 0
        ? this.current.combatParticipants
        : this.current.units
            .filter((unit) => unit.team === 'PLAYER' || unit.team === 'ENEMY')
            .map((unit) => unit.id);
    const aliveOnTeam = (team: Team): boolean =>
      participants.some((id) => {
        const unit = this.findUnit(id);
        return unit !== null && unit.team === team && unit.hp > 0;
      });

    if (!aliveOnTeam('PLAYER')) {
      this.current.phase = 'DEFEAT';
      this.current.winner = 'ENEMY';
      this.current.log.push('Defeat! All player units are downed');
      this.finishEncounter('DEFEAT');
    } else if (!aliveOnTeam('ENEMY')) {
      this.current.phase = 'VICTORY';
      this.current.winner = 'PLAYER';
      this.current.log.push('Victory! All enemy units are downed');
      this.finishEncounter('VICTORY');
    }
  }

  private finishEncounter(outcome: 'VICTORY' | 'DEFEAT'): void {
    this.emit({ type: 'COMBAT_ENDED', outcome });
    const state = this.current;
    const participants =
      state.combatParticipants.length > 0
        ? state.combatParticipants
        : state.units
            .filter((unit) => unit.team === 'PLAYER' || unit.team === 'ENEMY')
            .map((unit) => unit.id);
    const survivors = state.units
      .filter((unit) => participants.includes(unit.id) && unit.hp > 0)
      .map((unit) => ({ characterId: unit.id, hp: unit.hp, maxHp: unit.maxHp }));
    const downedCharacterIds = state.units
      .filter((unit) => participants.includes(unit.id) && unit.hp <= 0)
      .map((unit) => unit.id);
    const destroyedObjectIds: string[] = [];
    for (const event of state.events) {
      if (event.type === 'OBJECT_DESTROYED') destroyedObjectIds.push(event.objectId);
    }
    const finalPositions: Record<string, GridPosition> = {};
    for (const unit of state.units) {
      if (participants.includes(unit.id)) finalPositions[unit.id] = { ...unit.position };
    }

    this.current.encounterResult = {
      id: this.newResultId(),
      sceneId: this.sceneId,
      outcome,
      participantIds: [...participants],
      survivors,
      downedCharacterIds,
      destroyedObjectIds,
      finalPositions,
      objective: state.combatObjective ?? 'DEFEAT_ALL_HOSTILES',
      objectiveCompleted: outcome === 'VICTORY',
      importantEvents: selectImportantEvents(state.events),
      startedAt: this.combatStartedAt ?? this.createdAt,
      endedAt: Date.now(),
    };
  }

  private newResultId(): string {
    this.resultCounter += 1;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `enc-${crypto.randomUUID()}`;
    }
    return `enc-${this.createdAt}-${this.resultCounter}`;
  }

  private cloneEncounterResult(result: EncounterResult): EncounterResult {
    return {
      ...result,
      participantIds: [...result.participantIds],
      survivors: result.survivors.map((survivor) => ({ ...survivor })),
      downedCharacterIds: [...result.downedCharacterIds],
      destroyedObjectIds: [...result.destroyedObjectIds],
      finalPositions: Object.fromEntries(
        Object.entries(result.finalPositions).map(([id, position]) => [id, { ...position }]),
      ),
      importantEvents: result.importantEvents.map((event) => cloneSceneEvent(event)),
    };
  }

  private snapshotCheckpoint(): Checkpoint {
    const state = this.current;
    return {
      units: state.units.map((unit) => ({
        ...unit,
        position: { ...unit.position },
        abilityIds: [...unit.abilityIds],
        statuses: unit.statuses.map((status) => ({ ...status })),
      })),
      objects: state.objects.map((object) => ({
        ...object,
        position: { ...object.position },
      })),
      terrain: state.terrain.map((position) => ({ ...position })),
      phase: state.phase,
      selectedUnitId: state.selectedUnitId,
      selectedAbilityId: state.selectedAbilityId,
      winner: state.winner,
      turnResources: Object.fromEntries(
        Object.entries(state.turnResources).map(([id, resources]) => [id, { ...resources }]),
      ),
      log: [...state.log],
      events: state.events.map((event) => cloneSceneEvent(event)),
      combatParticipants: [...state.combatParticipants],
      combatObjective: state.combatObjective,
      encounterResult:
        state.encounterResult === null ? null : this.cloneEncounterResult(state.encounterResult),
      nextSeq: this.nextSeq,
    };
  }

  private emit(event: SceneEventInput): void {
    this.current.events.push({ ...event, seq: this.nextSeq } as SceneEvent);
    this.nextSeq += 1;
  }

  private notifyListeners(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * Brain-driven enemy turns: repeatedly ask the shared enemy brain for the next
   * action and execute it until the brain is done, the phase changes (victory,
   * defeat), or the per-enemy safety cap is hit. Only explicit ENEMY
   * participants act (legacy: every living ENEMY when combat started without
   * startCombat).
   */
  private runEnemyAI(): void {
    const enemyIds =
      this.current.combatParticipants.length > 0
        ? this.current.combatParticipants.filter(
            (id) => this.findUnit(id)?.team === 'ENEMY',
          )
        : this.current.units.filter((unit) => unit.team === 'ENEMY').map((unit) => unit.id);
    for (const enemyId of enemyIds) {
      const enemy = this.findUnit(enemyId);
      if (enemy === null || enemy.hp <= 0) continue;
      if (this.current.phase !== 'ENEMY_TURN') break;
      let actions = 0;
      while (actions < MAX_ENEMY_ACTIONS && this.current.phase === 'ENEMY_TURN') {
        const action = planEnemyAction(enemy, this);
        if (action === null) break;
        const executed =
          action.type === 'MOVE'
            ? this.moveUnit(enemy.id, action.x, action.y)
            : this.useAbility(enemy.id, action.abilityId, action.target);
        if (!executed) break;
        actions += 1;
      }
    }
  }
}

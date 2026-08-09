import { planEnemyAction } from '../ai/enemyBrain';
import { CORE_ABILITIES, PUNCH_ID } from '../abilities/catalog';
import type {
  Ability,
  AbilityEffect,
  AbilityTarget,
  TargetTeam,
  TurnResources,
} from '../abilities/types';
import {
  createObject,
  movementCostAt,
  objectBlocksMovement,
  validateEnvironment,
} from './environment';
import type { MapObject } from './environment';
import type { EngineState, GameConfig, GridPosition, Team, Unit } from './types';

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

function matchesTeamFilter(caster: Unit, target: Unit, filter: TargetTeam): boolean {
  if (filter === 'ANY') return true;
  if (filter === 'ALLY') return caster.team === target.team;
  return caster.team !== target.team;
}

export class TacticalEngine {
  private readonly initial: {
    width: number;
    height: number;
    objects: MapObject[];
    terrain: GridPosition[];
    units: Unit[];
  };
  private readonly abilitiesById = new Map<string, Ability>();
  private current: EngineState;

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

    const width = Math.max(1, config.width ?? 10);
    const height = Math.max(1, config.height ?? 10);
    const objects = (config.objects ?? []).map((objectConfig) => createObject(objectConfig));
    const terrain = (config.terrain ?? []).map((position) => ({ ...position }));
    const environmentErrors = validateEnvironment(objects, terrain, width, height);
    if (environmentErrors.length > 0) {
      throw new Error(`Invalid environment: ${environmentErrors.join('; ')}`);
    }

    this.initial = {
      width,
      height,
      objects,
      terrain,
      units,
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
    };
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
    return this.firstStepOnPath(from, to);
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
    unit.position = { x, y };
    this.current.turnResources[unit.id].movementRemaining -= option.distance;
    this.current.log.push(`${unit.name} moved to (${x},${y})`);
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
      return true;
    }

    const selected =
      this.current.selectedUnitId === null ? null : this.findUnit(this.current.selectedUnitId);
    if (selected === null || !this.canSelectAbility(selected.id, abilityId)) return false;
    this.current.selectedAbilityId = abilityId;
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
    return true;
  }

  /**
   * Interact with an adjacent interactable object (currently doors). Costs one
   * Action; other interactable kinds consume the cost without extra effect.
   */
  interact(unitId: string, objectId: string): boolean {
    const unit = this.findUnit(unitId);
    const object = this.current.objects.find((candidate) => candidate.id === objectId);
    if (unit === null || object === undefined) return false;
    if (unit.hp <= 0 || this.activeTeam() !== unit.team) return false;
    if (this.current.phase !== 'PLAYER_TURN') return false;
    if (!object.interactable) return false;
    if (manhattanDistance(unit.position, object.position) !== 1) return false;
    const resources = this.current.turnResources[unit.id];
    if (resources === undefined || resources.actionRemaining <= 0) return false;

    resources.actionRemaining -= 1;
    if (object.kind === 'DOOR') {
      object.open = !object.open;
      this.current.log.push(
        object.open ? `${unit.name} opens the door` : `${unit.name} closes the door`,
      );
    }
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
  }

  endTurn(): void {
    if (this.current.phase !== 'PLAYER_TURN') return;

    this.tickStatuses('PLAYER');
    this.current.selectedUnitId = null;
    this.current.selectedAbilityId = null;
    this.current.phase = 'ENEMY_TURN';
    this.startTurn('ENEMY');
    this.current.log.push('--- ENEMY TURN ---');
    this.runEnemyAI();

    if (this.current.phase === 'ENEMY_TURN') {
      this.tickStatuses('ENEMY');
      this.current.phase = 'PLAYER_TURN';
      this.startTurn('PLAYER');
      this.current.log.push('--- PLAYER TURN ---');
    }
  }

  reset(): void {
    this.current = this.buildInitialState();
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
      const unit = this.current.units.find(
        (candidate) =>
          candidate.hp > 0 &&
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
    const damage = Math.max(0, Math.floor(amount));
    object.hp = Math.max(0, object.hp - damage);
    this.current.log.push(
      `${caster.name} damages the ${object.kind.toLowerCase()} for ${damage} damage`,
    );
    if (object.hp <= 0) {
      this.current.log.push(`${caster.name} destroys the ${object.kind.toLowerCase()}`);
      this.current.objects = this.current.objects.filter((candidate) => candidate.id !== object.id);
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
    const damage = Math.max(0, Math.floor(amount));
    target.hp = Math.max(0, target.hp - damage);
    this.current.log.push(
      `${caster.name} ${ability.presentation.verb} ${target.name} for ${damage} damage`,
    );
    if (target.hp === 0) this.current.log.push(`${target.name} is downed`);
  }

  private applyHeal(caster: Unit, ability: Ability, target: Unit, amount: number): void {
    if (target.hp <= 0) return;
    const healed = Math.min(Math.max(0, Math.floor(amount)), target.maxHp - target.hp);
    target.hp += healed;
    this.current.log.push(
      `${caster.name} ${ability.presentation.verb} ${target.name} for ${healed} HP`,
    );
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
    for (const unit of units) turnResources[unit.id] = this.freshResources(unit);

    return {
      width: this.initial.width,
      height: this.initial.height,
      objects: this.initial.objects.map((object) => ({
        ...object,
        position: { ...object.position },
      })),
      terrain: this.initial.terrain.map((position) => ({ ...position })),
      units,
      phase: 'PLAYER_TURN',
      selectedUnitId: null,
      selectedAbilityId: null,
      winner: null,
      turnResources,
      log: [],
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
      unit.hp = Math.max(0, unit.hp - 1);
      this.current.log.push(`${unit.name} takes 1 damage from the hazard`);
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

  /** The team whose turn it is to act; null once the game is over. */
  private activeTeam(): Team | null {
    if (this.current.phase === 'PLAYER_TURN') return 'PLAYER';
    if (this.current.phase === 'ENEMY_TURN') return 'ENEMY';
    return null;
  }

  private checkGameOver(): void {
    const playerAlive = aliveUnits(this.current.units, 'PLAYER').length > 0;
    const enemyAlive = aliveUnits(this.current.units, 'ENEMY').length > 0;
    if (!playerAlive) {
      this.current.phase = 'DEFEAT';
      this.current.winner = 'ENEMY';
      this.current.log.push('Defeat! All player units are downed');
    } else if (!enemyAlive) {
      this.current.phase = 'VICTORY';
      this.current.winner = 'PLAYER';
      this.current.log.push('Victory! All enemy units are downed');
    }
  }

  /**
   * Brain-driven enemy turns: repeatedly ask the shared enemy brain for the next
   * action and execute it until the brain is done, the phase changes (victory,
   * defeat), or the per-enemy safety cap is hit.
   */
  private runEnemyAI(): void {
    const enemies = aliveUnits(this.current.units, 'ENEMY');
    for (const enemy of enemies) {
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

  private firstStepOnPath(from: GridPosition, to: GridPosition): GridPosition | null {
    const startKey = `${from.x},${from.y}`;
    const goalKey = `${to.x},${to.y}`;
    if (startKey === goalKey) return null;

    // Cost-aware Dijkstra with parent reconstruction: the returned step is the
    // first tile of the cheapest path (difficult terrain costs 2).
    const best = new Map<string, number>([[startKey, 0]]);
    const parent = new Map<string, string>();
    const queue: Array<{ key: string; x: number; y: number; cost: number }> = [
      { key: startKey, x: from.x, y: from.y, cost: 0 },
    ];

    while (queue.length > 0) {
      const current = this.popCheapest(queue);
      if (best.get(current.key) !== current.cost) continue; // stale entry
      if (current.key === goalKey) {
        let childKey = goalKey;
        while (parent.get(childKey) !== startKey) childKey = parent.get(childKey)!;
        const [x, y] = childKey.split(',').map(Number);
        return { x, y };
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
}

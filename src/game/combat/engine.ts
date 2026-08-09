import type { EngineState, GameConfig, GridPosition, Team, Unit } from './types';

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function aliveUnits(units: Unit[], team: Team): Unit[] {
  return units.filter((unit) => unit.team === team && unit.hp > 0);
}

export class TacticalEngine {
  private readonly initial: {
    width: number;
    height: number;
    blocked: GridPosition[];
    units: Unit[];
  };
  private current: EngineState;

  constructor(config: GameConfig) {
    this.initial = {
      width: Math.max(1, config.width ?? 10),
      height: Math.max(1, config.height ?? 10),
      blocked: (config.blocked ?? []).map((p) => ({ x: p.x, y: p.y })),
      units: config.units.map((u) => ({
        ...u,
        position: { x: u.position.x, y: u.position.y },
      })),
    };
    this.current = this.buildInitialState();
  }

  get state(): EngineState {
    return {
      ...this.current,
      blocked: this.current.blocked.map((p) => ({ ...p })),
      units: this.current.units.map((u) => ({ ...u, position: { ...u.position } })),
      log: [...this.current.log],
    };
  }

  isBlocked(x: number, y: number): boolean {
    return this.current.blocked.some((p) => p.x === x && p.y === y);
  }

  unitAt(x: number, y: number): Unit | null {
    return this.current.units.find((u) => u.position.x === x && u.position.y === y) ?? null;
  }

  getMovementRange(unitId: string): GridPosition[] {
    const unit = this.findUnit(unitId);
    if (unit === null || unit.hp <= 0) return [];
    const start = unit.position;
    const reachable: GridPosition[] = [];
    const visited = new Set<string>([`${start.x},${start.y}`]);
    const queue: Array<{ x: number; y: number; dist: number }> = [
      { x: start.x, y: start.y, dist: 0 },
    ];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (!this.isInBounds(nx, ny)) continue;
        if (this.isBlocked(nx, ny)) continue;
        if (this.isOccupiedByAliveUnit(nx, ny)) continue;
        visited.add(key);
        if (current.dist + 1 <= unit.movement) {
          reachable.push({ x: nx, y: ny });
          queue.push({ x: nx, y: ny, dist: current.dist + 1 });
        }
      }
    }
    return reachable;
  }

  canMove(unitId: string, x: number, y: number): boolean {
    const unit = this.findUnit(unitId);
    if (unit === null || unit.hp <= 0) return false;
    if (this.activeTeam() !== unit.team) return false;
    return this.getMovementRange(unitId).some((p) => p.x === x && p.y === y);
  }

  moveUnit(unitId: string, x: number, y: number): boolean {
    if (!this.canMove(unitId, x, y)) return false;
    const unit = this.findUnit(unitId)!;
    unit.position = { x, y };
    this.current.log.push(`${unit.name} moved to (${x},${y})`);
    return true;
  }

  canAttack(attackerId: string, targetId: string): boolean {
    const attacker = this.findUnit(attackerId);
    const target = this.findUnit(targetId);
    if (attacker === null || target === null) return false;
    if (attacker.hp <= 0 || target.hp <= 0) return false;
    if (this.activeTeam() !== attacker.team) return false;
    if (attacker.team === target.team) return false;
    return this.isAdjacent(attacker.position, target.position);
  }

  attack(attackerId: string, targetId: string): boolean {
    if (!this.canAttack(attackerId, targetId)) return false;
    const attacker = this.findUnit(attackerId)!;
    const target = this.findUnit(targetId)!;
    target.hp -= 1;
    this.current.log.push(`${attacker.name} attacks ${target.name} for 1 damage`);
    if (target.hp <= 0) {
      this.current.log.push(`${target.name} is downed`);
      this.checkGameOver();
    }
    return true;
  }

  selectUnit(unitId: string): void {
    this.current.selectedUnitId = this.findUnit(unitId) === null ? null : unitId;
  }

  endTurn(): void {
    if (this.current.phase !== 'PLAYER_TURN') return;
    this.current.phase = 'ENEMY_TURN';
    this.current.log.push('--- ENEMY TURN ---');
    this.runEnemyAI();
    if (this.current.phase === 'ENEMY_TURN') {
      this.current.phase = 'PLAYER_TURN';
      this.current.log.push('--- PLAYER TURN ---');
    }
  }

  reset(): void {
    this.current = this.buildInitialState();
  }

  // ---- internals ----

  private buildInitialState(): EngineState {
    return {
      width: this.initial.width,
      height: this.initial.height,
      blocked: this.initial.blocked.map((p) => ({ ...p })),
      units: this.initial.units.map((u) => ({ ...u, position: { ...u.position } })),
      phase: 'PLAYER_TURN',
      selectedUnitId: null,
      winner: null,
      log: [],
    };
  }

  private findUnit(unitId: string): Unit | null {
    return this.current.units.find((u) => u.id === unitId) ?? null;
  }

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.current.width && y < this.current.height;
  }

  private isOccupiedByAliveUnit(x: number, y: number): boolean {
    return this.current.units.some((u) => u.hp > 0 && u.position.x === x && u.position.y === y);
  }

  private isAdjacent(a: GridPosition, b: GridPosition): boolean {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
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

  private runEnemyAI(): void {
    const enemies = aliveUnits(this.current.units, 'ENEMY');
    for (const enemy of enemies) {
      if (this.current.phase !== 'ENEMY_TURN') break;
      let movementLeft = enemy.movement;
      let attacked = false;
      while (movementLeft > 0 && this.current.phase === 'ENEMY_TURN') {
        if (this.tryAdjacentAttack(enemy)) {
          attacked = true;
          break;
        }
        const step = this.nextStepTowardNearestPlayer(enemy);
        if (step === null) break;
        enemy.position = step;
        movementLeft -= 1;
        this.current.log.push(`${enemy.name} moved to (${step.x},${step.y})`);
      }
      if (!attacked && this.current.phase === 'ENEMY_TURN') {
        this.tryAdjacentAttack(enemy);
      }
    }
  }

  private tryAdjacentAttack(enemy: Unit): boolean {
    const targets = aliveUnits(this.current.units, 'PLAYER').filter((u) =>
      this.isAdjacent(enemy.position, u.position),
    );
    if (targets.length === 0) return false;
    let best = targets[0];
    for (const target of targets) {
      if (target.hp < best.hp) best = target;
    }
    best.hp -= 1;
    this.current.log.push(`${enemy.name} attacks ${best.name} for 1 damage`);
    if (best.hp <= 0) {
      this.current.log.push(`${best.name} is downed`);
      this.checkGameOver();
    }
    return true;
  }

  private nextStepTowardNearestPlayer(enemy: Unit): GridPosition | null {
    const players = aliveUnits(this.current.units, 'PLAYER');
    if (players.length === 0) return null;
    let nearest: Unit | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const player of players) {
      const distance =
        Math.abs(player.position.x - enemy.position.x) +
        Math.abs(player.position.y - enemy.position.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = player;
      }
    }
    if (nearest === null) return null;
    const step = this.firstStepOnPath(enemy.position, nearest.position);
    if (step === null) return null;
    if (!this.isInBounds(step.x, step.y)) return null;
    if (this.isBlocked(step.x, step.y)) return null;
    if (this.isOccupiedByAliveUnit(step.x, step.y)) return null;
    return step;
  }

  private firstStepOnPath(from: GridPosition, to: GridPosition): GridPosition | null {
    const startKey = `${from.x},${from.y}`;
    const goalKey = `${to.x},${to.y}`;
    if (startKey === goalKey) return null;
    const visited = new Set<string>([startKey]);
    const parent = new Map<string, string>();
    const queue: GridPosition[] = [{ x: from.x, y: from.y }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (!this.isInBounds(nx, ny)) continue;
        if (this.isBlocked(nx, ny)) continue;
        if (key !== goalKey && this.isOccupiedByAliveUnit(nx, ny)) continue;
        visited.add(key);
        parent.set(key, `${current.x},${current.y}`);
        if (key === goalKey) {
          let childKey = key;
          while (parent.get(childKey) !== startKey) {
            childKey = parent.get(childKey)!;
          }
          const parts = childKey.split(',');
          return { x: Number(parts[0]), y: Number(parts[1]) };
        }
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }
}

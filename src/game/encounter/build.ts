/**
 * Deterministic encounter construction (PRD §37, §50): an AI-parsed
 * EncounterSpec becomes a playable GameConfig here or not at all. The
 * validator owns mechanical truth — bounds, overlaps, spawns, reachability —
 * and every AI decision is clamped to engine-known primitives (PRD §3).
 */
import { CORE_ABILITIES, PUNCH_ID } from '../abilities/catalog';
import type { Ability } from '../abilities/types';
import type { MapObjectConfig } from '../combat/environment';
import type { GameConfig, GridPosition, UnitConfig } from '../combat/types';
import type { EncounterSpec, UnitRole } from './spec';

export interface BuiltEncounter {
  config: GameConfig;
  /** Player-side unit ids (role PLAYER or ALLY). */
  playerUnitIds: string[];
  enemyUnitIds: string[];
  title: string;
  narrativeContext: string;
  /** Unit id -> AI-stated motivation (PRD §68 enemy intent), for combat dialogue. */
  intents: Record<string, string>;
}

export interface BuildReport {
  warnings: string[];
}

const KNOWN_ABILITIES: ReadonlyMap<string, Ability> = new Map(
  CORE_ABILITIES.map((ability) => [ability.id, ability]),
);

const MAX_DIMENSION = 40;
const MAX_UNITS = 12;
const MIN_HP = 1;
const MAX_HP = 30;
const MIN_MOVE = 1;
const MAX_MOVE = 6;

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function inBounds(spec: EncounterSpec, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < spec.width && y < spec.height;
}

/**
 * Deterministic reachability flood fill over non-blocking tiles. Closed
 * doors count as passable (they can be opened or destroyed); hazards count
 * as passable (they hurt but do not block).
 */
function reachableTiles(
  width: number,
  height: number,
  blocked: Set<string>,
  start: GridPosition,
): Set<string> {
  const seen = new Set<string>([key(start.x, start.y)]);
  const queue: GridPosition[] = [start];
  while (queue.length > 0) {
    const tile = queue.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      const id = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (blocked.has(id) || seen.has(id)) continue;
      seen.add(id);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

/**
 * Validate and convert an EncounterSpec into an engine-ready GameConfig.
 * Returns null plus the reasons when the spec cannot be made mechanically
 * playable — callers may repair/regenerate (PRD §37) or fall back to a
 * deterministic template.
 */
export function buildEncounter(
  spec: EncounterSpec,
): { ok: true; encounter: BuiltEncounter; report: BuildReport } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Size limits -------------------------------------------------------
  if (!Number.isInteger(spec.width) || !Number.isInteger(spec.height)) {
    errors.push('width and height must be integers');
    return { ok: false, errors };
  }
  if (spec.width < 6 || spec.height < 6 || spec.width > MAX_DIMENSION || spec.height > MAX_DIMENSION) {
    errors.push(`grid must be 6-40 tiles per side (got ${spec.width}x${spec.height})`);
    return { ok: false, errors };
  }
  if (spec.units.length < 2 || spec.units.length > MAX_UNITS) {
    errors.push(`encounter needs 2-${MAX_UNITS} units (got ${spec.units.length})`);
    return { ok: false, errors };
  }

  const blocked = new Set<string>();
  const occupied = new Map<string, string>();
  const objects: MapObjectConfig[] = [];
  const seenObjectIds = new Set<string>();

  // --- Objects: dedupe, clamp hp, bounds, overlap -------------------------
  spec.objects.forEach((object, index) => {
    const { x, y } = object;
    if (!inBounds(spec, x, y)) {
      warnings.push(`${object.kind} #${index} out of bounds — dropped`);
      return;
    }
    const id = `${object.kind.toLowerCase()}-${x}-${y}`;
    const spot = key(x, y);
    if (blocked.has(spot)) {
      warnings.push(`${object.kind} at (${x},${y}) overlaps another object — dropped`);
      return;
    }
    if (seenObjectIds.has(id)) return;
    seenObjectIds.add(id);
    blocked.add(spot);
    objects.push({ id, kind: object.kind, x, y });
  });

  // --- Units: bounds, clamps, overlap resolution, role balance -----------
  const units: UnitConfig[] = [];
  const playerUnitIds: string[] = [];
  const enemyUnitIds: string[] = [];
  const spawnBlocked = (x: number, y: number): boolean => blocked.has(key(x, y));
  const unitAt = (x: number, y: number): string | null => occupied.get(key(x, y)) ?? null;

  for (const unit of spec.units) {
    let { x, y } = unit;
    if (!inBounds(spec, x, y)) {
      errors.push(`unit ${unit.id} spawns out of bounds (${x},${y})`);
      continue;
    }
    if (spawnBlocked(x, y)) {
      const free = findNearbyFreeTile(spec, spawnBlocked, unitAt, x, y);
      if (free === null) {
        errors.push(`unit ${unit.id} has no free spawn tile near (${x},${y})`);
        continue;
      }
      warnings.push(`unit ${unit.id} spawn moved from (${x},${y}) to (${free.x},${free.y})`);
      x = free.x;
      y = free.y;
    } else {
      const occupant = unitAt(x, y);
      if (occupant !== null) {
        const free = findNearbyFreeTile(spec, spawnBlocked, unitAt, x, y);
        if (free === null) {
          errors.push(`unit ${unit.id} overlaps ${occupant} with no free tile nearby`);
          continue;
        }
        warnings.push(`unit ${unit.id} overlapped ${occupant} — moved to (${free.x},${free.y})`);
        x = free.x;
        y = free.y;
      }
    }

    const hp = clampInt(unit.hp, MIN_HP, MAX_HP, `unit ${unit.id} hp`, warnings);
    const movement = clampInt(unit.movement, MIN_MOVE, MAX_MOVE, `unit ${unit.id} movement`, warnings);
    const abilities = dedupeAbilities(unit.abilities, unit.id, warnings);

    units.push({
      id: unit.id,
      name: unit.name,
      team: roleToTeam(unit.role),
      controller: unit.role === 'ENEMY' ? 'AI' : 'PLAYER',
      hp,
      maxHp: hp,
      movement,
      position: { x, y },
      abilityIds: abilities,
    });
    occupied.set(key(x, y), unit.id);
    if (unit.role === 'ENEMY') {
      enemyUnitIds.push(unit.id);
    } else {
      playerUnitIds.push(unit.id);
    }
  }

  if (playerUnitIds.length === 0) errors.push('encounter needs at least one player-side unit');
  if (enemyUnitIds.length === 0) errors.push('encounter needs at least one enemy');

  // --- Reachability (PRD §37: opposing sides in connected regions) --------
  if (errors.length === 0 && playerUnitIds.length > 0 && enemyUnitIds.length > 0) {
    // Closed doors count as passable for reachability (openable/destroyable).
    const blockedForFlood = new Set<string>();
    for (const object of objects) {
      if (object.kind === 'DOOR') continue;
      blockedForFlood.add(key(object.x, object.y));
    }
    const firstPlayer = units.find((u) => u.id === playerUnitIds[0])!.position;
    const firstEnemy = units.find((u) => u.id === enemyUnitIds[0])!.position;
    const reachable = reachableTiles(spec.width, spec.height, blockedForFlood, firstPlayer);
    if (!reachable.has(key(firstEnemy.x, firstEnemy.y))) {
      errors.push('enemies are not reachable from the player spawn (walled off)');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const config: GameConfig = {
    width: spec.width,
    height: spec.height,
    objects,
    terrain: spec.terrain.filter((tile) => {
      const okTile = inBounds(spec, tile.x, tile.y) && !blocked.has(key(tile.x, tile.y));
      if (!okTile) warnings.push(`difficult terrain at (${tile.x},${tile.y}) dropped (blocked/out of bounds)`);
      return okTile;
    }),
    units,
    initialPhase: 'PLAYER_TURN',
    sceneId: 'ai-encounter',
  };

  return {
    ok: true,
    encounter: {
      config,
      playerUnitIds,
      enemyUnitIds,
      title: spec.title,
      narrativeContext: spec.narrativeContext,
      intents: Object.fromEntries(spec.units.map((unit) => [unit.id, unit.intent])),
    },
    report: { warnings },
  };
}

/** Spiral outward from (x,y) for the nearest tile that is free and unoccupied. */
function findNearbyFreeTile(
  spec: EncounterSpec,
  spawnBlocked: (x: number, y: number) => boolean,
  unitAt: (x: number, y: number) => string | null,
  x: number,
  y: number,
): GridPosition | null {
  for (let radius = 1; radius <= Math.max(spec.width, spec.height); radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(spec, nx, ny)) continue;
        if (spawnBlocked(nx, ny) || unitAt(nx, ny) !== null) continue;
        return { x: nx, y: ny };
      }
    }
  }
  return null;
}

function clampInt(
  value: number,
  min: number,
  max: number,
  label: string,
  warnings: string[],
): number {
  const clamped = Math.max(min, Math.min(max, Math.round(value)));
  if (clamped !== value) warnings.push(`${label} clamped to ${clamped}`);
  return clamped;
}

function dedupeAbilities(abilities: string[], unitId: string, warnings: string[]): string[] {
  const out = new Set<string>();
  for (const id of abilities) {
    const known = KNOWN_ABILITIES.get(id);
    if (known === undefined) {
      warnings.push(`unit ${unitId}: unknown ability "${id}" dropped`);
      continue;
    }
    out.add(id);
  }
  if (out.size === 0) {
    warnings.push(`unit ${unitId}: no known abilities — given Punch`);
    out.add(PUNCH_ID);
  }
  return [...out];
}

function roleToTeam(role: UnitRole): GameConfig['units'][number]['team'] {
  return role === 'ENEMY' ? 'ENEMY' : 'PLAYER';
}

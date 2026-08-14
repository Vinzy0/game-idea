import { objectBlocksMovement, validateEnvironment } from './environment';
import type { MapObject } from './environment';
import type { GridPosition, Team, Controller, Unit } from './types';

export interface EncounterSetup {
  width: number;
  height: number;
  objects: readonly MapObject[];
  terrain: readonly GridPosition[];
  units: readonly Unit[];
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

/**
 * Mechanical construction invariants for a tactical encounter.
 *
 * This is intentionally narrower than Phase 6 ScenarioSpec validation: it
 * rejects corrupt engine input, while future scenario validation will also
 * judge reachability, objectives, exits, and sufficient playable space.
 */
export function validateEncounterSetup(setup: EncounterSetup): string[] {
  const { width, height, objects, terrain, units } = setup;
  const errors: string[] = [];
  const dimensionsValid = isPositiveInteger(width) && isPositiveInteger(height);

  if (!isPositiveInteger(width)) errors.push('Map width must be a positive integer');
  if (!isPositiveInteger(height)) errors.push('Map height must be a positive integer');
  if (units.length === 0) errors.push('Encounter must contain at least one unit');

  if (dimensionsValid) errors.push(...validateEnvironment(objects, terrain, width, height));

  for (const duplicate of duplicateValues(objects.map((object) => object.id))) {
    errors.push(`Duplicate object id: ${duplicate}`);
  }
  for (const object of objects) {
    if (object.id.trim().length === 0) errors.push('Object id must not be empty');
    if (!Number.isInteger(object.position.x) || !Number.isInteger(object.position.y)) {
      errors.push(`Object ${object.id || '<empty>'} must use integer coordinates`);
    }
  }

  for (const duplicate of duplicateValues(terrain.map((tile) => `${tile.x},${tile.y}`))) {
    errors.push(`Duplicate terrain tile at (${duplicate})`);
  }
  for (const tile of terrain) {
    if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
      errors.push(`Terrain tile at (${tile.x},${tile.y}) must use integer coordinates`);
    }
  }

  for (const duplicate of duplicateValues(units.map((unit) => unit.id))) {
    errors.push(`Duplicate unit id: ${duplicate}`);
  }

  const validTeams: readonly Team[] = ['PLAYER', 'ENEMY'];
  const validControllers: readonly Controller[] = ['PLAYER', 'AI'];
  const occupied = new Set<string>();
  for (const unit of units) {
    const label = unit.id || '<empty>';
    if (unit.id.trim().length === 0) errors.push('Unit id must not be empty');
    if (!validTeams.includes(unit.team)) errors.push(`Unit ${label} has an invalid team`);
    if (!validControllers.includes(unit.controller)) {
      errors.push(`Unit ${label} has an invalid controller`);
    }
    if (!isPositiveInteger(unit.maxHp)) {
      errors.push(`Unit ${label} maxHp must be a positive integer`);
    }
    if (!isNonNegativeInteger(unit.hp) || unit.hp > unit.maxHp) {
      errors.push(`Unit ${label} hp must be an integer between 0 and maxHp`);
    }
    if (!isNonNegativeInteger(unit.movement)) {
      errors.push(`Unit ${label} movement must be a non-negative integer`);
    }
    if (!Number.isInteger(unit.position.x) || !Number.isInteger(unit.position.y)) {
      errors.push(`Unit ${label} must use integer coordinates`);
      continue;
    }
    if (
      dimensionsValid &&
      (unit.position.x < 0 ||
        unit.position.y < 0 ||
        unit.position.x >= width ||
        unit.position.y >= height)
    ) {
      errors.push(`Unit ${label} at (${unit.position.x},${unit.position.y}) is out of bounds`);
    }

    const key = `${unit.position.x},${unit.position.y}`;
    if (occupied.has(key)) errors.push(`Multiple units at (${key})`);
    occupied.add(key);

    const blocker = objects.find(
      (object) =>
        object.position.x === unit.position.x &&
        object.position.y === unit.position.y &&
        objectBlocksMovement(object),
    );
    if (blocker !== undefined) {
      errors.push(`Unit ${label} spawns inside blocking object ${blocker.id}`);
    }

    for (const duplicate of duplicateValues(unit.abilityIds)) {
      errors.push(`Unit ${label} references ability ${duplicate} more than once`);
    }
  }

  return errors;
}

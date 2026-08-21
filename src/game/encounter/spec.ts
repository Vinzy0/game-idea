/**
 * Encounter spec (PRD §36-§38): the AI's structured, untrusted proposal for
 * turning the current story scene into a playable tactical encounter. Pure
 * data plus a deterministic parser — the tactical engine never sees any of
 * this until `buildEncounter` has validated and converted it (PRD §3, §50).
 */
import type { ObjectKind } from '../combat/environment';
import type { GridPosition } from '../combat/types';
import { isFiniteNumber, isNonEmptyString, isRecord, isStringArray } from '../../ai/validate';

export const ENCOUNTER_SPEC_KIND = 'encounter-spec' as const;
export const ENCOUNTER_SPEC_VERSION = 1;

export const OBJECT_KINDS = [
  'WALL',
  'DESK',
  'LOCKER',
  'DOOR',
  'BARREL',
  'HAZARD',
] as const satisfies readonly ObjectKind[];

export const UNIT_ROLES = ['PLAYER', 'ALLY', 'ENEMY'] as const;
export type UnitRole = (typeof UNIT_ROLES)[number];

export interface EncounterObjectSpec {
  kind: ObjectKind;
  x: number;
  y: number;
}

export interface EncounterUnitSpec {
  id: string;
  name: string;
  role: UnitRole;
  hp: number;
  movement: number;
  x: number;
  y: number;
  /** Ability ids from the known catalog; unknown ids are dropped with a warning at build time. */
  abilities: string[];
  /** AI creativity: what this combatant wants (PRD §68 enemy intent). */
  intent: string;
}

export interface EncounterSpec {
  kind: typeof ENCOUNTER_SPEC_KIND;
  version: typeof ENCOUNTER_SPEC_VERSION;
  title: string;
  /** Why this fight happens — feeds post-battle narration (PRD §38 Narrative Context). */
  narrativeContext: string;
  width: number;
  height: number;
  objects: EncounterObjectSpec[];
  terrain: GridPosition[];
  units: EncounterUnitSpec[];
}

/** Strict, throw-free parser. Returns null on any schema violation. */
export function parseEncounterSpec(input: unknown): EncounterSpec | null {
  if (!isRecord(input)) return null;
  if (input.kind !== ENCOUNTER_SPEC_KIND || input.version !== ENCOUNTER_SPEC_VERSION) return null;
  if (!isNonEmptyString(input.title)) return null;
  if (!isNonEmptyString(input.narrativeContext)) return null;
  if (!isFiniteNumber(input.width) || !isFiniteNumber(input.height)) return null;
  if (!Array.isArray(input.objects) || !Array.isArray(input.terrain) || !Array.isArray(input.units)) {
    return null;
  }

  const objects: EncounterObjectSpec[] = [];
  for (const raw of input.objects) {
    if (!isRecord(raw)) return null;
    if (!(OBJECT_KINDS as readonly string[]).includes(String(raw.kind))) return null;
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return null;
    objects.push({ kind: raw.kind as ObjectKind, x: raw.x, y: raw.y });
  }

  const terrain: GridPosition[] = [];
  for (const raw of input.terrain) {
    if (!isRecord(raw) || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return null;
    terrain.push({ x: raw.x, y: raw.y });
  }

  const units: EncounterUnitSpec[] = [];
  for (const raw of input.units) {
    if (!isRecord(raw)) return null;
    if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) return null;
    if (!(UNIT_ROLES as readonly string[]).includes(String(raw.role))) return null;
    if (!isFiniteNumber(raw.hp) || !isFiniteNumber(raw.movement)) return null;
    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return null;
    if (!isNonEmptyString(raw.intent)) return null;
    if (!isStringArray(raw.abilities)) return null;
    units.push({
      id: raw.id,
      name: raw.name,
      role: raw.role as UnitRole,
      hp: raw.hp,
      movement: raw.movement,
      x: raw.x,
      y: raw.y,
      abilities: [...raw.abilities],
      intent: raw.intent,
    });
  }

  return {
    kind: ENCOUNTER_SPEC_KIND,
    version: ENCOUNTER_SPEC_VERSION,
    title: input.title,
    narrativeContext: input.narrativeContext,
    width: input.width,
    height: input.height,
    objects,
    terrain,
    units,
  };
}

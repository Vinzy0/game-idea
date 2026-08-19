import type { AbilityTarget, ActionCost } from '../abilities/types';
import type { CombatObjective, GridPosition, Team } from './types';

/**
 * Fine-grained structured mechanical evidence for the active scene/encounter.
 * These are engine-internal records with stable IDs and factual before/after
 * values; human-readable log strings are presentation derived alongside them
 * and are never parsed to construct results. `WorldEvent` (durable canon
 * history) is a different layer introduced with the world save in Phase 6B.
 */
export type SceneEventType =
  | 'UNIT_MOVED'
  | 'ABILITY_USED'
  | 'CHARACTER_DAMAGED'
  | 'CHARACTER_HEALED'
  | 'CHARACTER_DOWNED'
  | 'STATUS_APPLIED'
  | 'OBJECT_INTERACTED'
  | 'OBJECT_DESTROYED'
  | 'TURN_STARTED'
  | 'TURN_ENDED'
  | 'COMBAT_STARTED'
  | 'COMBAT_ENDED'
  | 'EXIT_USED';

interface SceneEventBase {
  /** Monotonically increasing per-scene sequence number (0-based). */
  seq: number;
}

export type SceneEvent =
  | (SceneEventBase & {
      type: 'UNIT_MOVED';
      unitId: string;
      from: GridPosition;
      to: GridPosition;
      /** Number of tiles along the executed path. */
      distance: number;
    })
  | (SceneEventBase & {
      type: 'ABILITY_USED';
      casterId: string;
      abilityId: string;
      abilityName: string;
      target: AbilityTarget;
      actionCost: ActionCost;
    })
  | (SceneEventBase & {
      type: 'CHARACTER_DAMAGED';
      targetId: string;
      /** Unit responsible, or null for environmental damage (e.g. hazards). */
      sourceUnitId: string | null;
      amount: number;
      hpBefore: number;
      hpAfter: number;
    })
  | (SceneEventBase & {
      type: 'CHARACTER_HEALED';
      targetId: string;
      sourceUnitId: string;
      amount: number;
      hpBefore: number;
      hpAfter: number;
    })
  | (SceneEventBase & {
      type: 'CHARACTER_DOWNED';
      characterId: string;
      hpBefore: number;
    })
  | (SceneEventBase & {
      type: 'STATUS_APPLIED';
      targetId: string;
      sourceUnitId: string;
      statusId: string;
      statusName: string;
      durationTurns: number;
    })
  | (SceneEventBase & {
      type: 'OBJECT_INTERACTED';
      unitId: string;
      objectId: string;
      objectKind: string;
      /** Door state after the interaction (false for non-door objects). */
      open: boolean;
    })
  | (SceneEventBase & {
      type: 'OBJECT_DESTROYED';
      objectId: string;
      objectKind: string;
      position: GridPosition;
      sourceUnitId: string;
    })
  | (SceneEventBase & { type: 'TURN_STARTED'; team: Team })
  | (SceneEventBase & { type: 'TURN_ENDED'; team: Team })
  | (SceneEventBase & {
      type: 'COMBAT_STARTED';
      participantIds: string[];
      objective: CombatObjective;
    })
  | (SceneEventBase & { type: 'COMBAT_ENDED'; outcome: 'VICTORY' | 'DEFEAT' })
  | (SceneEventBase & {
      type: 'EXIT_USED';
      unitId: string;
      exitId: string;
      destinationSceneId: string | null;
    });

/** `SceneEvent` without the engine-assigned sequence number (distributed over the union). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type SceneEventInput = DistributiveOmit<SceneEvent, 'seq'>;

export function cloneSceneEvent(event: SceneEvent): SceneEvent {
  if (event.type === 'UNIT_MOVED') {
    return { ...event, from: { ...event.from }, to: { ...event.to } };
  }
  if (event.type === 'OBJECT_DESTROYED') {
    return { ...event, position: { ...event.position } };
  }
  return { ...event };
}

/**
 * Deterministic selection of the encounter-defining events: combat start/end,
 * ability uses, downings, object destruction, and the final five damage
 * events, in original order.
 */
export function selectImportantEvents(events: readonly SceneEvent[]): SceneEvent[] {
  const damageEvents = events.filter((event) => event.type === 'CHARACTER_DAMAGED');
  const lastDamage = damageEvents.slice(-5);
  const keep = new Set<number>();
  for (const event of events) {
    if (
      event.type === 'COMBAT_STARTED' ||
      event.type === 'COMBAT_ENDED' ||
      event.type === 'ABILITY_USED' ||
      event.type === 'CHARACTER_DOWNED' ||
      event.type === 'OBJECT_DESTROYED'
    ) {
      keep.add(event.seq);
    }
  }
  for (const event of lastDamage) keep.add(event.seq);
  return events.filter((event) => keep.has(event.seq));
}

/**
 * Structured combat outcome, derived only from engine state and structured
 * events. `startedAt`/`endedAt` are wall-clock bookkeeping; everything else is
 * deterministic mechanical fact.
 */
export interface EncounterResult {
  id: string;
  sceneId: string;
  outcome: 'VICTORY' | 'DEFEAT';
  participantIds: string[];
  survivors: Array<{ characterId: string; hp: number; maxHp: number }>;
  downedCharacterIds: string[];
  destroyedObjectIds: string[];
  finalPositions: Record<string, GridPosition>;
  objective: CombatObjective;
  objectiveCompleted: boolean;
  importantEvents: SceneEvent[];
  startedAt: number;
  endedAt: number;
}

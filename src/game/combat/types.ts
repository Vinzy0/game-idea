import type { Ability, ActiveStatus, TurnResources } from '../abilities/types';
import type { MapObject, MapObjectConfig } from './environment';
import type { EncounterResult, SceneEvent } from './events';

export type Team = 'PLAYER' | 'ENEMY' | 'NEUTRAL';
export type Controller = 'PLAYER' | 'AI';

/**
 * Scene phases. New persistent scenes start in `EXPLORATION`; the legacy
 * combat demo explicitly starts in `PLAYER_TURN` so Phase 0-5 behavior stays
 * testable. `VICTORY`/`DEFEAT` remain visible until the application
 * acknowledges the result (victory) or retries from the pre-combat checkpoint
 * (defeat).
 */
export type ScenePhase =
  | 'EXPLORATION'
  | 'PLAYER_TURN'
  | 'ENEMY_TURN'
  | 'VICTORY'
  | 'DEFEAT';

/** @deprecated Phase 0-5 alias; use {@link ScenePhase}. */
export type TurnPhase = ScenePhase;

export type CombatObjective = 'DEFEAT_ALL_HOSTILES';

export interface CombatStartSpec {
  /**
   * Explicit combat participants by scene actor ID. Must contain at least one
   * living PLAYER unit and one living ENEMY unit; NEUTRAL actors cannot be
   * participants in this vertical slice.
   */
  participantIds: string[];
  objective: CombatObjective;
}

export interface GridPosition {
  x: number;
  y: number;
}

export interface Unit {
  id: string;
  name: string;
  team: Team;
  controller: Controller;
  hp: number;
  maxHp: number;
  movement: number;
  position: GridPosition;
  abilityIds: string[];
  statuses: ActiveStatus[];
}

export type UnitConfig = Omit<Unit, 'abilityIds' | 'statuses'> & {
  abilityIds?: string[];
  statuses?: ActiveStatus[];
};

export interface EngineState {
  width: number;
  height: number;
  objects: MapObject[];
  terrain: GridPosition[];
  units: Unit[]; // all units, including downed (hp 0) ones
  phase: ScenePhase;
  selectedUnitId: string | null;
  selectedAbilityId: string | null;
  winner: Team | null;
  turnResources: Record<string, TurnResources>;
  log: string[];
  /** Ordered structured mechanical evidence for the active scene/encounter. */
  events: SceneEvent[];
  /** Explicit combat participants; empty while exploring or in the legacy demo. */
  combatParticipants: string[];
  combatObjective: CombatObjective | null;
  /** Built when combat ends; retained until the application acknowledges/retries. */
  encounterResult: EncounterResult | null;
}

export interface GameConfig {
  width?: number;
  height?: number;
  objects?: MapObjectConfig[];
  terrain?: GridPosition[];
  units: UnitConfig[];
  /** Additional data-defined abilities available to this encounter. */
  abilities?: readonly Ability[];
  /**
   * `PLAYER_TURN` (default) preserves the legacy combat-demo behavior.
   * Persistent scenes pass `EXPLORATION` so the board starts in free movement.
   */
  initialPhase?: 'EXPLORATION' | 'PLAYER_TURN';
  /** Stable scene identifier used by encounter results. */
  sceneId?: string;
}

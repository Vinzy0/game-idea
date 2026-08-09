import type { Ability, ActiveStatus, TurnResources } from '../abilities/types';
import type { MapObject, MapObjectConfig } from './environment';

export type Team = 'PLAYER' | 'ENEMY';
export type Controller = 'PLAYER' | 'AI';
export type TurnPhase = 'PLAYER_TURN' | 'ENEMY_TURN' | 'VICTORY' | 'DEFEAT';

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
  phase: TurnPhase;
  selectedUnitId: string | null;
  selectedAbilityId: string | null;
  winner: Team | null;
  turnResources: Record<string, TurnResources>;
  log: string[];
}

export interface GameConfig {
  width?: number;
  height?: number;
  objects?: MapObjectConfig[];
  terrain?: GridPosition[];
  units: UnitConfig[];
  /** Additional data-defined abilities available to this encounter. */
  abilities?: readonly Ability[];
}

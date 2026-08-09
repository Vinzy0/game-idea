export type Team = 'PLAYER' | 'ENEMY';
export type Controller = 'PLAYER' | 'AI';
export type TurnPhase = 'PLAYER_TURN' | 'ENEMY_TURN' | 'VICTORY' | 'DEFEAT';
export interface GridPosition { x: number; y: number }
export interface Unit {
  id: string; name: string; team: Team; controller: Controller;
  hp: number; maxHp: number; movement: number; position: GridPosition;
}
export interface EngineState {
  width: number; height: number;
  blocked: GridPosition[];
  units: Unit[];            // all units, including downed (hp 0) ones
  phase: TurnPhase;
  selectedUnitId: string | null;
  winner: Team | null;
  log: string[];            // human-readable event log: moves, attacks, downs, victory/defeat
}
export interface GameConfig {
  width?: number; height?: number;   // default 10
  blocked?: GridPosition[];
  units: Unit[];
}

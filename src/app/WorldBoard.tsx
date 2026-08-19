import type { TacticalEngine } from '../game/combat/engine';
import type { SceneExitMarker } from '../game/scenes/schoolHallwayScene';
import GameCanvas from './GameCanvas';
import TacticalHud from './TacticalHud';

/**
 * The always-on board (Phase 6A): mounts Phaser + the context-sensitive HUD
 * for the permanent 32x32 school hallway. The engine is authoritative and is
 * owned by the app shell (shared with the Details and World panels); Phaser
 * renders and routes input; React presents.
 */
export default function WorldBoard({
  engine,
  exits = [],
  dimmed = false,
}: {
  engine: TacticalEngine;
  exits?: SceneExitMarker[];
  dimmed?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        boxSizing: 'border-box',
        padding: 8,
        gap: 4,
      }}
    >
      <div
        aria-label="Board"
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          background: '#1a1a2e',
          border: '1px solid #30363d',
          borderRadius: 8,
          overflow: 'hidden',
          opacity: dimmed ? 0.35 : 1,
          transition: 'opacity 0.3s ease',
        }}
      >
        <GameCanvas engine={engine} exits={exits} />
      </div>
      <TacticalHud engine={engine} />
    </div>
  );
}

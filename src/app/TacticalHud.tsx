import { useEffect, useState } from 'react';
import type { TacticalEngine } from '../game/combat/engine';
import { watchEngine } from '../game/rendering/engineEvents';

/**
 * Minimal HUD for the Phase 1 prototype: turn banner, selected unit readout,
 * End Turn / New Game buttons, and the engine event log.
 */
export default function TacticalHud({ engine }: { engine: TacticalEngine }) {
  const [, setTick] = useState(0);

  useEffect(() => watchEngine(engine, () => setTick((t) => t + 1)), [engine]);

  const state = engine.state;
  const selected = state.units.find((u) => u.id === state.selectedUnitId) ?? null;

  const banner =
    state.phase === 'VICTORY'
      ? 'Victory!'
      : state.phase === 'DEFEAT'
        ? 'Defeat!'
        : state.phase === 'ENEMY_TURN'
          ? 'Enemy Turn…'
          : 'Your Turn';
  const bannerColor =
    state.phase === 'VICTORY'
      ? '#7ee787'
      : state.phase === 'DEFEAT'
        ? '#ff7b72'
        : '#e6edf3';

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        padding: '8px 0',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <strong style={{ color: bannerColor, minWidth: 90 }}>{banner}</strong>
      {selected && selected.hp > 0 && (
        <span style={{ fontSize: 13 }}>
          Selected: {selected.name} — HP {selected.hp}/{selected.maxHp} · Move {selected.movement}
        </span>
      )}
      <button
        onClick={() => engine.endTurn()}
        disabled={state.phase !== 'PLAYER_TURN'}
        style={{ padding: '4px 12px' }}
      >
        End Turn
      </button>
      {(state.phase === 'VICTORY' || state.phase === 'DEFEAT') && (
        <button onClick={() => engine.reset()} style={{ padding: '4px 12px' }}>
          New Game
        </button>
      )}
      <div
        style={{
          fontSize: 12,
          color: '#8b949e',
          fontFamily: 'monospace',
          maxWidth: 380,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={state.log.join('\n')}
      >
        {state.log.length > 0 ? state.log[state.log.length - 1] : '—'}
      </div>
    </div>
  );
}

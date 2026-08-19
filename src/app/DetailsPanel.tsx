import { useEffect, useState } from 'react';
import type { TacticalEngine } from '../game/combat/engine';

/**
 * Details tab: the selected actor, object, or exit and its available actions.
 * React presents engine facts; action legality always comes from the engine.
 */
export default function DetailsPanel({ engine }: { engine: TacticalEngine }) {
  const [, setTick] = useState(0);
  useEffect(() => engine.subscribe(() => setTick((tick) => tick + 1)), [engine]);

  const state = engine.state;
  const selected = state.units.find((unit) => unit.id === state.selectedUnitId) ?? null;

  if (selected === null) {
    return (
      <div style={{ fontSize: 13, color: '#8b949e', padding: 4 }}>
        Click any actor on the board to inspect them here.
      </div>
    );
  }

  const resources = state.turnResources[selected.id];
  const abilities = engine.getAbilitiesForUnit(selected.id);
  const canTalk = false; // Phase 7

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
      <div>
        <strong style={{ fontSize: 15 }}>{selected.name}</strong>
        <span
          style={{
            marginLeft: 8,
            fontSize: 11,
            color: '#e6edf3',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 999,
            padding: '1px 8px',
          }}
        >
          {selected.team.toLowerCase()}
        </span>
      </div>
      <div style={{ color: '#c9d1d9' }}>
        HP {selected.hp}/{selected.maxHp}
        {resources !== undefined &&
          ` · Move ${resources.movementRemaining}/${selected.movement} · Action ${resources.actionRemaining} · Bonus ${resources.bonusActionRemaining}`}
      </div>
      <div style={{ color: '#8b949e' }}>
        Position ({selected.position.x}, {selected.position.y}) ·{' '}
        {selected.hp > 0 ? 'standing' : 'downed'}
      </div>
      {abilities.length > 0 && (
        <div>
          <div style={{ color: '#8b949e', fontSize: 12 }}>Abilities</div>
          <ul style={{ margin: '2px 0 0', paddingLeft: 18, color: '#c9d1d9' }}>
            {abilities.map((ability) => (
              <li key={ability.id}>{ability.name}</li>
            ))}
          </ul>
        </div>
      )}
      {selected.statuses.length > 0 && (
        <div>
          <div style={{ color: '#8b949e', fontSize: 12 }}>Statuses</div>
          <ul style={{ margin: '2px 0 0', paddingLeft: 18, color: '#c9d1d9' }}>
            {selected.statuses.map((status) => (
              <li key={status.id}>
                {status.name} ({status.remainingTurns} turns)
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" disabled={!canTalk} title="Talking to characters arrives in Phase 7">
          Talk
        </button>
        {selected.team === 'PLAYER' && selected.controller === 'PLAYER' && selected.hp > 0 && (
          <span style={{ fontSize: 12, color: '#8b949e', alignSelf: 'center' }}>
            Click a tile to move · click an adjacent door to interact
          </span>
        )}
      </div>
    </div>
  );
}

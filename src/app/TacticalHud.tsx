import { useEffect, useState } from 'react';
import type { TacticalEngine } from '../game/combat/engine';
import { watchEngine } from '../game/rendering/engineEvents';

/** React command surface for turn resources and data-defined abilities. */
export default function TacticalHud({ engine }: { engine: TacticalEngine }) {
  const [, setTick] = useState(0);

  useEffect(() => watchEngine(engine, () => setTick((tick) => tick + 1)), [engine]);

  const state = engine.state;
  const selected = state.units.find((unit) => unit.id === state.selectedUnitId) ?? null;
  const selectedAbility =
    state.selectedAbilityId === null ? null : engine.getAbility(state.selectedAbilityId);
  const resources = selected === null ? null : state.turnResources[selected.id];
  const abilities = selected === null ? [] : engine.getAbilitiesForUnit(selected.id);

  // Interactable objects adjacent to the selected living player unit, in state order.
  const adjacentInteractables =
    selected === null || selected.hp <= 0 || selected.team !== 'PLAYER'
      ? []
      : state.objects.filter((object) => {
          if (!object.interactable) return false;
          const distance =
            Math.abs(selected.position.x - object.position.x) +
            Math.abs(selected.position.y - object.position.y);
          return distance === 1;
        });
  const interactTarget = adjacentInteractables[0] ?? null;

  const banner =
    state.phase === 'VICTORY'
      ? 'Victory!'
      : state.phase === 'DEFEAT'
        ? 'Defeat!'
        : state.phase === 'ENEMY_TURN'
          ? 'Enemy Turn…'
          : 'Your Turn';
  const bannerColor =
    state.phase === 'VICTORY' ? '#7ee787' : state.phase === 'DEFEAT' ? '#ff7b72' : '#e6edf3';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '8px 0 12px',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 800,
      }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', minHeight: 30 }}>
        <strong style={{ color: bannerColor, minWidth: 90 }}>{banner}</strong>
        {selected && selected.hp > 0 && resources && (
          <span style={{ fontSize: 13 }}>
            {selected.name} · HP {selected.hp}/{selected.maxHp} · Move {resources.movementRemaining}
            /{selected.movement} · Action {resources.actionRemaining} · Bonus{' '}
            {resources.bonusActionRemaining}
          </span>
        )}
        <button
          onClick={() => interactTarget !== null && engine.interact(selected!.id, interactTarget.id)}
          disabled={interactTarget === null}
          title={
            adjacentInteractables.length > 0
              ? `Interact with ${adjacentInteractables
                  .map((object) => object.kind.toLowerCase())
                  .join(', ')}`
              : 'No interactable object adjacent to the selected unit'
          }
          style={{ padding: '4px 12px' }}
        >
          Interact
        </button>
        <button
          onClick={() => engine.endTurn()}
          disabled={state.phase !== 'PLAYER_TURN'}
          style={{ padding: '4px 12px', marginLeft: 'auto' }}
        >
          End Turn
        </button>
        {(state.phase === 'VICTORY' || state.phase === 'DEFEAT') && (
          <button onClick={() => engine.reset()} style={{ padding: '4px 12px' }}>
            New Game
          </button>
        )}
      </div>

      <div
        aria-label="Abilities"
        style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 34, flexWrap: 'wrap' }}
      >
        <span style={{ color: '#8b949e', fontSize: 12, minWidth: 58 }}>Abilities</span>
        {selected === null || selected.team !== 'PLAYER' || selected.hp <= 0 ? (
          <span style={{ color: '#6e7681', fontSize: 12 }}>Select a blue unit.</span>
        ) : (
          abilities.map((ability) => {
            const active = selectedAbility?.id === ability.id;
            const enabled = engine.canSelectAbility(selected.id, ability.id);
            const color = `#${ability.presentation.color.toString(16).padStart(6, '0')}`;
            return (
              <button
                key={ability.id}
                type="button"
                aria-pressed={active}
                title={ability.description}
                disabled={!enabled}
                onClick={() => engine.selectAbility(active ? null : ability.id)}
                style={{
                  padding: '5px 10px',
                  border: `1px solid ${active ? '#ffffff' : color}`,
                  borderRadius: 4,
                  background: active ? color : '#161b22',
                  color: '#ffffff',
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  opacity: enabled ? 1 : 0.45,
                }}
              >
                {ability.name} ·{' '}
                {ability.actionCost === 'BONUS_ACTION' ? 'Bonus' : ability.actionCost}
              </button>
            );
          })
        )}
        {selectedAbility && (
          <span style={{ color: '#c9d1d9', fontSize: 12 }}>{selectedAbility.description}</span>
        )}
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#8b949e',
          fontFamily: 'monospace',
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

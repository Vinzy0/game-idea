import { useEffect, useState } from 'react';
import type { TacticalEngine } from '../game/combat/engine';

const button: React.CSSProperties = { padding: '4px 12px' };

/**
 * Context-sensitive board HUD (Phase 6A): exploration shows click-to-move
 * guidance plus Begin Combat; combat retains movement, abilities, Interact,
 * Talk (Phase 7 placeholder), and End Turn; victory/defeat show the
 * acknowledge/retry flow. React owns no engine rules — every command is
 * validated by the engine.
 */
export default function TacticalHud({ engine }: { engine: TacticalEngine }) {
  const [, setTick] = useState(0);

  useEffect(() => engine.subscribe(() => setTick((tick) => tick + 1)), [engine]);

  const state = engine.state;
  const selected = state.units.find((unit) => unit.id === state.selectedUnitId) ?? null;
  const selectedAbility =
    state.selectedAbilityId === null ? null : engine.getAbility(state.selectedAbilityId);
  const resources = selected === null ? null : state.turnResources[selected.id];
  const abilities = selected === null ? [] : engine.getAbilitiesForUnit(selected.id);

  // Engine-authorized interactions in state order; React owns no interaction rules.
  const adjacentInteractables =
    selected === null
      ? []
      : state.objects.filter((object) => engine.canInteract(selected.id, object.id));
  const interactTarget = adjacentInteractables[0] ?? null;

  const inCombat =
    state.phase === 'PLAYER_TURN' || state.phase === 'ENEMY_TURN';
  const canBeginCombat = engine.canStartCombat();
  const beginCombat = () => {
    const participants = state.units
      .filter((unit) => unit.hp > 0 && (unit.team === 'PLAYER' || unit.team === 'ENEMY'))
      .map((unit) => unit.id);
    engine.startCombat({ participantIds: participants, objective: 'DEFEAT_ALL_HOSTILES' });
  };

  const banner =
    state.phase === 'EXPLORATION'
      ? 'Exploring'
      : state.phase === 'VICTORY'
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
        : state.phase === 'ENEMY_TURN'
          ? '#d29922'
          : '#e6edf3';

  const result = state.encounterResult;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '8px 0 12px',
        fontFamily: 'system-ui, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', minHeight: 30, flexWrap: 'wrap' }}>
        <strong style={{ color: bannerColor, minWidth: 90 }}>{banner}</strong>
        {selected && selected.hp > 0 && resources && inCombat && (
          <span style={{ fontSize: 13 }}>
            {selected.name} · HP {selected.hp}/{selected.maxHp} · Move {resources.movementRemaining}
            /{selected.movement} · Action {resources.actionRemaining} · Bonus{' '}
            {resources.bonusActionRemaining}
          </span>
        )}
        {state.phase === 'EXPLORATION' && (
          <span style={{ fontSize: 12, color: '#8b949e' }}>
            Click a tile to move · Click actors to inspect · Wheel: zoom · Middle/right-drag or
            WASD/arrows: pan · F: focus hero
          </span>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {state.phase === 'EXPLORATION' && (
            <button
              type="button"
              onClick={beginCombat}
              disabled={!canBeginCombat}
              title={
                canBeginCombat
                  ? 'Start turn-based combat with every hostile in this scene'
                  : 'Both a living hero and living hostiles are required to start combat'
              }
              style={{ ...button, border: '1px solid #d29922' }}
            >
              Begin Combat
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              interactTarget !== null && engine.interact(selected!.id, interactTarget.id)
            }
            disabled={interactTarget === null}
            title={
              adjacentInteractables.length > 0
                ? `Interact with ${adjacentInteractables
                    .map((object) => object.kind.toLowerCase())
                    .join(', ')}`
                : 'No interactable object adjacent to the selected unit'
            }
            style={button}
          >
            Interact
          </button>
          {inCombat && (
            <button
              type="button"
              onClick={() => engine.endTurn()}
              disabled={state.phase !== 'PLAYER_TURN'}
              style={button}
            >
              End Turn
            </button>
          )}
          {state.phase === 'VICTORY' && (
            <button
              type="button"
              onClick={() => engine.acknowledgeVictory()}
              style={{ ...button, border: '1px solid #7ee787' }}
            >
              Return to Exploration
            </button>
          )}
          {state.phase === 'DEFEAT' && (
            <button
              type="button"
              onClick={() => engine.restoreCombatCheckpoint()}
              style={{ ...button, border: '1px solid #ff7b72' }}
            >
              Retry Encounter
            </button>
          )}
          {(state.phase === 'VICTORY' || state.phase === 'DEFEAT') && (
            <button type="button" onClick={() => engine.reset()} style={button}>
              New Scene
            </button>
          )}
        </div>
      </div>

      {state.phase === 'EXPLORATION' ? (
        <div aria-label="Exploration HUD" style={{ fontSize: 12, color: '#8b949e', minHeight: 26 }}>
          {selected === null
            ? 'Select the hero to inspect her, or click anywhere walkable to explore.'
            : `${selected.name} · ${selected.team.toLowerCase()} · HP ${selected.hp}/${selected.maxHp} · ${
                selected.hp > 0 ? 'click a tile to move' : 'downed'
              }`}
          {interactTarget !== null && (
            <span style={{ color: '#c9d1d9' }}> · Interact available: {interactTarget.kind.toLowerCase()}</span>
          )}
        </div>
      ) : (
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
      )}

      {(state.phase === 'VICTORY' || state.phase === 'DEFEAT') && result !== null && (
        <div
          aria-label="Encounter result"
          style={{
            fontSize: 12,
            color: '#c9d1d9',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
            padding: '6px 10px',
          }}
        >
          <strong>{result.outcome === 'VICTORY' ? 'Fight won' : 'Fight lost'}</strong> · survivors:{' '}
          {result.survivors.map((s) => `${s.characterId} (${s.hp}/${s.maxHp})`).join(', ') || 'none'} ·
          downed: {result.downedCharacterIds.join(', ') || 'none'}
          {result.destroyedObjectIds.length > 0 &&
            ` · destroyed: ${result.destroyedObjectIds.join(', ')}`}
        </div>
      )}

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

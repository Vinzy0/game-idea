import { useEffect, useState } from 'react';
import type { TacticalEngine } from '../game/combat/engine';
import { HALLWAY_DESCRIPTION, HALLWAY_TITLE } from '../game/scenes/schoolHallwayScene';

export interface StoryDigest {
  situation: string;
  unresolvedThreads: string[];
}

/**
 * World tab: current location, known connections, current situation, and
 * unresolved threads. Scene facts come from the board engine; narrative facts
 * come from the Phase 5 story digest.
 */
export default function WorldPanel({
  engine,
  digest,
}: {
  engine: TacticalEngine;
  digest: StoryDigest | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => engine.subscribe(() => setTick((tick) => tick + 1)), [engine]);
  const state = engine.state;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
      <section aria-label="Current location">
        <strong style={{ fontSize: 14 }}>{HALLWAY_TITLE}</strong>
        <p style={{ margin: '4px 0 0', color: '#c9d1d9' }}>{HALLWAY_DESCRIPTION}</p>
        <p style={{ margin: '4px 0 0', color: '#8b949e', fontSize: 12 }}>
          Scene {state.width}×{state.height} · {state.phase.toLowerCase()} ·{' '}
          {state.units.filter((unit) => unit.hp > 0).length} actors present
        </p>
      </section>

      <section aria-label="Known connections">
        <strong style={{ fontSize: 13 }}>Known connections</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#c9d1d9' }}>
          <li>Science Wing — unlinked exit (travel arrives in Phase 6B)</li>
          <li>Classroom Wing — unlinked exit (travel arrives in Phase 6B)</li>
        </ul>
      </section>

      <section aria-label="Current situation">
        <strong style={{ fontSize: 13 }}>Current situation</strong>
        <p style={{ margin: '4px 0 0', color: '#c9d1d9' }}>
          {digest === null ? 'No story started yet.' : digest.situation || '—'}
        </p>
      </section>

      <section aria-label="Unresolved threads">
        <strong style={{ fontSize: 13 }}>Unresolved threads</strong>
        {digest === null || digest.unresolvedThreads.length === 0 ? (
          <p style={{ margin: '4px 0 0', color: '#c9d1d9' }}>—</p>
        ) : (
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#c9d1d9' }}>
            {digest.unresolvedThreads.map((thread) => (
              <li key={thread}>{thread}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Camera help" style={{ fontSize: 12, color: '#8b949e' }}>
        <strong style={{ color: '#c9d1d9' }}>Camera</strong>
        <p style={{ margin: '4px 0 0' }}>
          Mouse wheel zooms toward the pointer · middle/right-button drag pans · WASD and arrow
          keys pan (when no text field is focused) · F focuses the hero.
        </p>
      </section>
    </div>
  );
}

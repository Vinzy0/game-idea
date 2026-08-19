import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createProvider, loadProviderConfig } from './ai/factory';
import NarrativeDm from './app/NarrativeDm';
import WorldBoard from './app/WorldBoard';
import WorldPanel, { type StoryDigest } from './app/WorldPanel';
import DetailsPanel from './app/DetailsPanel';
import { createSchoolHallwayScene } from './game/scenes/schoolHallwayScene';
import { TacticalEngine } from './game/combat/engine';

// Phase 5's tactical demo remains available as a development fixture (lazy
// chunk), not as a production tab.
const CombatDemo = lazy(() => import('./app/CombatDemo'));

type RightTab = 'story' | 'details' | 'world';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 6,
  border: '1px solid #30363d',
  background: active ? '#1f6feb' : '#161b22',
  color: '#e6edf3',
  cursor: 'pointer',
  fontSize: 13,
});

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 900px)').matches;
  });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 900px)');
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

function App() {
  const [tab, setTab] = useState<RightTab>('story');
  const [digest, setDigest] = useState<StoryDigest | null>(null);
  const [showDevFixture, setShowDevFixture] = useState(false);
  const provider = useMemo(() => createProvider(loadProviderConfig()), []);
  const narrow = useNarrowViewport();

  // One always-on board: the scene engine lives here and is shared by the
  // board, the Details panel, and the World panel.
  const scene = useMemo(() => createSchoolHallwayScene(), []);
  const engine = useMemo(() => new TacticalEngine(scene.config), [scene]);

  if (showDevFixture) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
          <strong style={{ fontSize: 13 }}>Combat Demo — development fixture</strong>
          <button type="button" onClick={() => setShowDevFixture(false)} style={tabStyle(false)}>
            Back to the World Board
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: '0 8px 8px' }}>
          <Suspense fallback={<p style={{ color: '#8b949e' }}>Loading combat demo…</p>}>
            <CombatDemo />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#0d1117',
        color: '#e6edf3',
        height: '100dvh',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <header
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: 17, margin: 0 }}>AI-DM Tactical RPG</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#8b949e' }}>
          {import.meta.env.DEV && (
            <button type="button" onClick={() => setShowDevFixture(true)} style={tabStyle(false)}>
              Combat Demo (dev fixture)
            </button>
          )}
          <span>Provider: {provider.label}</span>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: narrow ? 'column' : 'row',
          gap: 8,
        }}
      >
        <section
          aria-label="World board"
          style={
            narrow
              ? { height: '60vh', minHeight: 0, flexShrink: 0 }
              : { flex: 1, minWidth: 0, minHeight: 0 }
          }
        >
          <WorldBoard engine={engine} exits={scene.exits} dimmed={digest === null} />
        </section>

        <aside
          aria-label="Story, details, and world context"
          style={
            narrow
              ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
              : { width: 360, flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }
          }
        >
          <div role="tablist" aria-label="Context panel" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'story'}
              onClick={() => setTab('story')}
              style={tabStyle(tab === 'story')}
            >
              Story
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'details'}
              onClick={() => setTab('details')}
              style={tabStyle(tab === 'details')}
            >
              Details
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'world'}
              onClick={() => setTab('world')}
              style={tabStyle(tab === 'world')}
            >
              World
            </button>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              padding: 10,
              boxSizing: 'border-box',
              marginTop: 6,
            }}
          >
            {tab === 'story' && <NarrativeDm provider={provider} onStoryDigestChange={setDigest} />}
            {tab === 'details' && <DetailsPanel engine={engine} />}
            {tab === 'world' && <WorldPanel engine={engine} digest={digest} />}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;

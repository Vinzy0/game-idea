import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createProvider, loadProviderConfig } from './ai/factory';
import NarrativeDm from './app/NarrativeDm';
import { useNarrativeDm } from './app/useNarrativeDm';
import { useEncounter } from './app/useEncounter';
import WorldBoard from './app/WorldBoard';
import WorldPanel, { type StoryDigest } from './app/WorldPanel';
import DetailsPanel from './app/DetailsPanel';
import { BubbleManager } from './game/dialogue/bubbles';
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

/** Mid-combat talk box (Phase 7): one input, nearest living enemy answers. */
function TalkBox({
  engine,
  targetName,
  busy,
  onTalk,
}: {
  engine: TacticalEngine;
  targetName: string | null;
  busy: boolean;
  onTalk: (line: string) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => engine.subscribe(() => setTick((tick) => tick + 1)), [engine]);
  const [draft, setDraft] = useState('');

  const inCombat = engine.state.phase === 'PLAYER_TURN' || engine.state.phase === 'ENEMY_TURN';
  const heroAlive = engine.state.units.some((unit) => unit.team === 'PLAYER' && unit.hp > 0);
  if (!inCombat || !heroAlive || targetName === null) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim() === '' || busy) return;
    onTalk(draft);
    setDraft('');
  };

  return (
    <form
      onSubmit={submit}
      aria-label="Combat talk"
      style={{ display: 'flex', gap: 6, padding: '0 0 6px', alignItems: 'center' }}
    >
      <span style={{ fontSize: 12, color: '#8b949e', flexShrink: 0 }}>Talk to {targetName}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Say something mid-fight…"
        disabled={busy}
        style={{
          flex: 1,
          minWidth: 0,
          background: '#161b22',
          color: '#e6edf3',
          border: '1px solid #30363d',
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 13,
        }}
      />
      <button type="submit" disabled={busy || draft.trim() === ''} style={{ padding: '4px 12px' }}>
        {busy ? '…' : 'Say'}
      </button>
    </form>
  );
}

function App() {
  const [tab, setTab] = useState<RightTab>('story');
  const [digest, setDigest] = useState<StoryDigest | null>(null);
  const [showDevFixture, setShowDevFixture] = useState(false);
  const provider = useMemo(() => createProvider(loadProviderConfig()), []);
  const narrow = useNarrowViewport();

  // One DM chat lifecycle at the shell level so encounters can talk to it.
  const dm = useNarrativeDm(provider);
  const bubbles = useMemo(() => new BubbleManager(), []);
  const encounter = useEncounter(provider, dm, bubbles);

  // Legacy exploration scene owns the board until an AI encounter replaces it.
  const scene = useMemo(() => createSchoolHallwayScene(), []);
  const legacyEngine = useMemo(() => new TacticalEngine(scene.config), [scene]);
  const readyStage = encounter.stage.kind === 'ready' ? encounter.stage : null;
  const encounterActive = readyStage !== null;
  const boardEngine = readyStage?.engine ?? legacyEngine;

  const storyIdle = dm.story !== null && dm.story.phase === 'IDLE';

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
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }}>
            {encounterActive && (
              <div
                aria-label="Encounter banner"
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  fontSize: 13,
                  background: '#161b22',
                  border: '1px solid #d29922',
                  borderRadius: 8,
                  padding: '4px 10px',
                }}
              >
                <strong>⚔ {readyStage.encounter.title}</strong>
                {readyStage.warnings.length > 0 && (
                  <span style={{ color: '#d29922', fontSize: 12 }} title={readyStage.warnings.join('\n')}>
                    {readyStage.warnings.length} validator adjustment(s)
                  </span>
                )}
                <button
                  type="button"
                  onClick={encounter.dismiss}
                  style={{ ...tabStyle(false), marginLeft: 'auto' }}
                >
                  Return to Story
                </button>
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
              <WorldBoard
                engine={boardEngine}
                exits={encounterActive ? [] : scene.exits}
                dimmed={digest === null && !encounterActive}
                bubbles={bubbles}
              />
            </div>
            {readyStage !== null && (
              <TalkBox
                engine={readyStage.engine}
                targetName={encounter.talkTargetName}
                busy={encounter.talkBusy}
                onTalk={encounter.talk}
              />
            )}
          </div>
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
            {tab === 'story' && (
              <NarrativeDm
                provider={provider}
                dm={dm}
                onStoryDigestChange={setDigest}
                encounterOffer={{
                  visible: storyIdle && !encounterActive,
                  busy: encounter.stage.kind === 'generating',
                  error: encounter.stage.kind === 'error' ? encounter.stage.message : null,
                  onAccept: encounter.generate,
                }}
              />
            )}
            {tab === 'details' && <DetailsPanel engine={boardEngine} />}
            {tab === 'world' && <WorldPanel engine={boardEngine} digest={digest} />}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;

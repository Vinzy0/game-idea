import { lazy, Suspense, useMemo, useState } from 'react';
import { createProvider, loadProviderConfig } from './ai/factory';
import NarrativeDm from './app/NarrativeDm';

const CombatDemo = lazy(() => import('./app/CombatDemo'));

type AppMode = 'narrative' | 'combat';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 14px',
  borderRadius: 6,
  border: '1px solid #30363d',
  background: active ? '#1f6feb' : '#161b22',
  color: '#e6edf3',
  cursor: 'pointer',
  fontSize: 13,
});

function App() {
  const [mode, setMode] = useState<AppMode>('narrative');
  const provider = useMemo(() => createProvider(loadProviderConfig()), []);

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#0d1117',
        color: '#e6edf3',
        minHeight: '100vh',
        width: '100%',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>AI-DM Tactical RPG</h1>
      <div
        role="tablist"
        aria-label="App mode"
        style={{ display: 'flex', gap: 8, marginBottom: 12 }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'narrative'}
          aria-pressed={mode === 'narrative'}
          onClick={() => setMode('narrative')}
          style={tabStyle(mode === 'narrative')}
        >
          Narrative DM
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'combat'}
          aria-pressed={mode === 'combat'}
          onClick={() => setMode('combat')}
          style={tabStyle(mode === 'combat')}
        >
          Combat Demo
        </button>
      </div>
      {mode === 'narrative' ? (
        <NarrativeDm provider={provider} />
      ) : (
        <Suspense fallback={<p style={{ color: '#8b949e' }}>Loading combat demo…</p>}>
          <CombatDemo />
        </Suspense>
      )}
    </div>
  );
}

export default App;

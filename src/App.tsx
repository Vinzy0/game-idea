import { useMemo } from 'react';
import GameCanvas from './app/GameCanvas';
import TacticalHud from './app/TacticalHud';
import { TacticalEngine } from './game/combat/engine';
import { createDemoScenario } from './game/combat/demoScenario';

function App() {
  const engine = useMemo(() => new TacticalEngine(createDemoScenario()), []);

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#0d1117',
        color: '#e6edf3',
        minHeight: '100vh',
        padding: 16,
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>AI-DM Tactical RPG</h1>
      <p style={{ fontSize: 13, color: '#8b949e', marginTop: 0 }}>
        Phase 4 — Tactical Environment. Select your blue hero, move on green tiles (dark striped =
        difficult terrain), pick Punch, Fireball, or Force Push and click a highlighted target,
        click the door to interact, and watch the enemy AI come at you.
      </p>
      <TacticalHud engine={engine} />
      <GameCanvas engine={engine} />
    </div>
  );
}

export default App;

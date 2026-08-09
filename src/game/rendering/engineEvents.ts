import type { TacticalEngine } from '../combat/engine';

type EngineMethod =
  'selectUnit' | 'selectAbility' | 'moveUnit' | 'attack' | 'useAbility' | 'endTurn' | 'reset';

const MUTATING_METHODS: EngineMethod[] = [
  'selectUnit',
  'selectAbility',
  'moveUnit',
  'attack',
  'useAbility',
  'endTurn',
  'reset',
];

/**
 * Wraps the engine's mutating methods so React can subscribe to state changes
 * without the engine itself depending on any framework. Returns an unsubscribe fn.
 */
export function watchEngine(engine: TacticalEngine, listener: () => void): () => void {
  const originals = new Map<EngineMethod, (...args: unknown[]) => unknown>();

  for (const method of MUTATING_METHODS) {
    const original = engine[method].bind(engine) as (...args: unknown[]) => unknown;
    originals.set(method, original);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (engine as any)[method] = (...args: any[]) => {
      const result = original(...args);
      listener();
      return result;
    };
  }

  return () => {
    for (const [method, original] of originals) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (engine as any)[method] = original;
    }
  };
}

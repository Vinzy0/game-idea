import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { TacticalEngine } from '../game/combat/engine';
import { CombatScene } from '../game/rendering/CombatScene';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

/**
 * Owns the Phaser game instance for the component's lifetime.
 * The game is created on mount and fully destroyed on unmount —
 * no global Phaser instances (safe under React StrictMode double-mount).
 */
export default function GameCanvas({ engine }: { engine: TacticalEngine }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: '#1a1a2e',
      parent: container,
    });
    game.scene.add('CombatScene', CombatScene, true, { engine });

    // Dev affordance: expose the game instance for automated QA/playthrough drives.
    if (import.meta.env.DEV) {
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    }

    return () => {
      game.destroy(true);
    };
  }, [engine]);

  return <div ref={containerRef} />;
}

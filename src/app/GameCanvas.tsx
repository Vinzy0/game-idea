import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { TacticalEngine } from '../game/combat/engine';
import { CombatScene } from '../game/rendering/CombatScene';
import type { SceneExitMarker } from '../game/scenes/schoolHallwayScene';
import type { BubbleManager } from '../game/dialogue/bubbles';

const NO_EXITS: SceneExitMarker[] = [];

/**
 * Owns the Phaser game instance for the component's lifetime. The game fills
 * its container and resizes with it; it is fully destroyed on unmount (safe
 * under React StrictMode double-mount). In headless test environments
 * (jsdom without canvas), Phaser is skipped entirely.
 */
export default function GameCanvas({
  engine,
  exits = NO_EXITS,
  bubbles,
}: {
  engine: TacticalEngine;
  exits?: SceneExitMarker[];
  bubbles?: BubbleManager;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Encounter renders pass an empty array. Collapse equivalent empty values to
  // one identity so unrelated React state updates do not recreate Phaser.
  const sceneExits = exits.length === 0 ? NO_EXITS : exits;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // jsdom/headless guard: no canvas 2D context means no Phaser.
    const probe = document.createElement('canvas');
    if (probe.getContext('2d') === null) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      backgroundColor: '#1a1a2e',
      parent: container,
    });
    game.scene.add('CombatScene', CombatScene, true, { engine, exits: sceneExits, bubbles });

    // Dev affordance: expose the game instance for automated QA/playthrough drives.
    if (import.meta.env.DEV) {
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    }

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) game.scale.resize(width, height);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      game.destroy(true);
    };
  }, [engine, sceneExits, bubbles]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

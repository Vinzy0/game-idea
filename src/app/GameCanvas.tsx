import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

class SmokeScene extends Phaser.Scene {
  constructor() {
    super('SmokeScene');
  }

  create() {
    this.add.rectangle(400, 300, 200, 150, 0x2a6f97);
    this.add
      .text(400, 300, 'Phaser OK', { color: '#ffffff', fontSize: '24px' })
      .setOrigin(0.5);
  }
}

/**
 * Owns the Phaser game instance for the component's lifetime.
 * The game is created on mount and fully destroyed on unmount —
 * no global Phaser instances (safe under React StrictMode double-mount).
 */
export default function GameCanvas() {
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
      scene: [SmokeScene],
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} />;
}

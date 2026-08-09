import Phaser from 'phaser';
import type { TacticalEngine } from '../combat/engine';
import type { EngineState, GridPosition } from '../combat/types';

const TILE = 48;
const ORIGIN_X = 160;
const ORIGIN_Y = 60;

const COLORS = {
  floor: 0x23233a,
  floorLine: 0x2e2e4a,
  blocked: 0x12121f,
  range: 0x2f9e63,
  player: 0x4e9af1,
  enemy: 0xd45555,
  downed: 0x555566,
  selection: 0xffffff,
  attackable: 0xff7777,
  hpBack: 0x000000,
};

/**
 * Phaser scene that renders TacticalEngine state and translates pointer
 * clicks into engine commands. Contains no game rules — only presentation.
 */
export class CombatScene extends Phaser.Scene {
  private engine: TacticalEngine | null = null;
  private graphics!: Phaser.GameObjects.Graphics;
  private hpTexts: Phaser.GameObjects.Text[] = [];
  private signature = '';

  constructor() {
    super('CombatScene');
  }

  init(data: { engine: TacticalEngine }) {
    this.engine = data.engine;
  }

  create() {
    this.graphics = this.add.graphics();
    this.input.on('pointerdown', this.handleClick, this);
    // Poll for state changes (e.g. End Turn via the React HUD) and redraw.
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.drawIfChanged() });
    this.drawIfChanged();
  }

  private tileFromPointer(pointer: Phaser.Input.Pointer): GridPosition | null {
    const engine = this.engine;
    if (!engine) return null;
    const x = Math.floor((pointer.worldX - ORIGIN_X) / TILE);
    const y = Math.floor((pointer.worldY - ORIGIN_Y) / TILE);
    const state = engine.state;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
    return { x, y };
  }

  private handleClick(pointer: Phaser.Input.Pointer) {
    const engine = this.engine;
    if (!engine) return;
    const tile = this.tileFromPointer(pointer);
    if (!tile) return;
    const state = engine.state;
    const unit = engine.unitAt(tile.x, tile.y);

    if (state.phase === 'PLAYER_TURN') {
      if (unit && unit.team === 'PLAYER' && unit.hp > 0) {
        engine.selectUnit(unit.id);
      } else if (state.selectedUnitId) {
        const selected = state.units.find((u) => u.id === state.selectedUnitId);
        if (selected && unit && engine.canAttack(selected.id, unit.id)) {
          engine.attack(selected.id, unit.id);
        } else if (selected && engine.canMove(selected.id, tile.x, tile.y)) {
          engine.moveUnit(selected.id, tile.x, tile.y);
        } else {
          engine.selectUnit(''); // deselect (unknown id => null)
        }
      }
    }
    this.drawIfChanged();
  }

  private stateSignature(s: EngineState): string {
    return [
      s.phase,
      s.winner ?? '-',
      s.selectedUnitId ?? '-',
      s.log.length,
      ...s.units.map((u) => `${u.id}:${u.hp}:${u.position.x},${u.position.y}`),
    ].join('|');
  }

  private drawIfChanged() {
    const engine = this.engine;
    if (!engine) return;
    const state = engine.state;
    const sig = this.stateSignature(state);
    if (sig === this.signature) return;
    this.signature = sig;
    this.draw(state);
  }

  private draw(state: EngineState) {
    const engine = this.engine;
    if (!engine) return;
    const g = this.graphics;
    g.clear();

    // Floor + blocked tiles
    for (let x = 0; x < state.width; x++) {
      for (let y = 0; y < state.height; y++) {
        const px = ORIGIN_X + x * TILE;
        const py = ORIGIN_Y + y * TILE;
        const blocked = state.blocked.some((b) => b.x === x && b.y === y);
        g.fillStyle(blocked ? COLORS.blocked : COLORS.floor, 1);
        g.fillRect(px, py, TILE, TILE);
        if (!blocked) {
          g.lineStyle(1, COLORS.floorLine, 0.6);
          g.strokeRect(px, py, TILE, TILE);
        }
      }
    }

    // Movement range + attackable targets for the selected unit
    const selected = state.units.find((u) => u.id === state.selectedUnitId);
    if (selected && selected.hp > 0 && state.phase === 'PLAYER_TURN' && selected.team === 'PLAYER') {
      for (const p of engine.getMovementRange(selected.id)) {
        g.fillStyle(COLORS.range, 0.4);
        g.fillRect(ORIGIN_X + p.x * TILE + 3, ORIGIN_Y + p.y * TILE + 3, TILE - 6, TILE - 6);
      }
      for (const u of state.units) {
        if (u.team === 'ENEMY' && u.hp > 0 && engine.canAttack(selected.id, u.id)) {
          g.lineStyle(3, COLORS.attackable, 1);
          g.strokeRect(
            ORIGIN_X + u.position.x * TILE + 3,
            ORIGIN_Y + u.position.y * TILE + 3,
            TILE - 6,
            TILE - 6,
          );
        }
      }
    }

    // Units
    for (const u of state.units) {
      const cx = ORIGIN_X + u.position.x * TILE + TILE / 2;
      const cy = ORIGIN_Y + u.position.y * TILE + TILE / 2;
      const downed = u.hp <= 0;
      const color = downed ? COLORS.downed : u.team === 'PLAYER' ? COLORS.player : COLORS.enemy;
      if (u.team === 'PLAYER') {
        g.fillStyle(color, downed ? 0.5 : 1);
        g.fillCircle(cx, cy, TILE * 0.34);
      } else {
        g.fillStyle(color, downed ? 0.5 : 1);
        g.fillRect(cx - TILE * 0.28, cy - TILE * 0.28, TILE * 0.56, TILE * 0.56);
      }
      if (state.selectedUnitId === u.id) {
        g.lineStyle(3, COLORS.selection, 1);
        g.strokeCircle(cx, cy, TILE * 0.4);
      }
      if (downed) {
        g.lineStyle(2, 0x000000, 0.8);
        g.lineBetween(cx - 8, cy - 8, cx + 8, cy + 8);
        g.lineBetween(cx - 8, cy + 8, cx + 8, cy - 8);
      }
    }

    // HP labels
    for (const t of this.hpTexts) t.destroy();
    this.hpTexts = [];
    for (const u of state.units) {
      const cx = ORIGIN_X + u.position.x * TILE + TILE / 2;
      const cy = ORIGIN_Y + u.position.y * TILE - 6;
      this.hpTexts.push(
        this.add
          .text(cx, cy, `${u.hp}/${u.maxHp}`, {
            color: '#ffffff',
            fontSize: '13px',
            fontFamily: 'monospace',
            backgroundColor: '#00000088',
          })
          .setOrigin(0.5),
      );
    }
  }
}

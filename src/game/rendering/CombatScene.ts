import Phaser from 'phaser';
import type { TacticalEngine } from '../combat/engine';
import type { MapObject } from '../combat/environment';
import type { EngineState, GridPosition } from '../combat/types';

const TILE = 48;

const COLORS = {
  floor: 0x23233a,
  floorLine: 0x2e2e4a,
  difficult: 0x1d1d33,
  range: 0x2f9e63,
  player: 0x4e9af1,
  enemy: 0xd45555,
  downed: 0x555566,
  selection: 0xffffff,
  hpBack: 0x000000,
  wall: 0x3d3d5c,
  desk: 0x8a6d3b,
  locker: 0x4a6fa5,
  door: 0x9c6b2f,
  doorOpen: 0x2e2e4a,
  barrel: 0x7a4a21,
  hazard: 0xff7b00,
};

/**
 * Phaser scene that renders TacticalEngine state and translates pointer
 * clicks into engine commands. Contains no game rules — only presentation.
 */
export class CombatScene extends Phaser.Scene {
  private engine: TacticalEngine | null = null;
  private graphics!: Phaser.GameObjects.Graphics;
  private hpTexts: Phaser.GameObjects.Text[] = [];
  private objectHpTexts: Phaser.GameObjects.Text[] = [];
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
    const unsubscribe = this.engine?.subscribe(() => {
      if (this.sys.isActive()) this.drawIfChanged();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => unsubscribe?.());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => unsubscribe?.());
    this.drawIfChanged();
  }

  /** Top-left pixel of the board, centered within the canvas for any map size. */
  private boardOrigin(state: { width: number; height: number }): { x: number; y: number } {
    return {
      x: Math.floor((this.scale.width - state.width * TILE) / 2),
      y: Math.floor((this.scale.height - state.height * TILE) / 2),
    };
  }

  private tileFromPointer(pointer: Phaser.Input.Pointer): GridPosition | null {
    const engine = this.engine;
    if (!engine) return null;
    const state = engine.state;
    const { x: OX, y: OY } = this.boardOrigin(state);
    const x = Math.floor((pointer.worldX - OX) / TILE);
    const y = Math.floor((pointer.worldY - OY) / TILE);
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
      const selected = state.units.find((candidate) => candidate.id === state.selectedUnitId);
      const ability =
        state.selectedAbilityId === null ? null : engine.getAbility(state.selectedAbilityId);

      if (selected && ability) {
        const target =
          ability.targeting.kind === 'TILE'
            ? ({ kind: 'TILE', x: tile.x, y: tile.y } as const)
            : unit
              ? ({ kind: 'UNIT', unitId: unit.id } as const)
              : null;
        if (target && engine.useAbility(selected.id, ability.id, target)) return;
        if (unit && unit.team === 'PLAYER' && unit.hp > 0) engine.selectUnit(unit.id);
      } else if (unit && unit.team === 'PLAYER' && unit.hp > 0) {
        engine.selectUnit(unit.id);
      } else if (selected && engine.canMove(selected.id, tile.x, tile.y)) {
        engine.moveUnit(selected.id, tile.x, tile.y);
      } else if (
        selected &&
        selected.hp > 0 &&
        selected.team === 'PLAYER' &&
        this.tryInteract(selected.id, tile.x, tile.y, state)
      ) {
        // interact() succeeded — nothing else to do.
      } else {
        engine.selectUnit(''); // deselect (unknown id => null)
      }
    }
  }

  /**
   * Click routing helper: if the clicked tile holds an interactable object and
   * the engine authorizes the selected unit's interaction, execute it.
   */
  private tryInteract(unitId: string, x: number, y: number, state: EngineState): boolean {
    const object = state.objects.find(
      (candidate) => candidate.position.x === x && candidate.position.y === y,
    );
    if (object === undefined) return false;
    return this.engine?.interact(unitId, object.id) ?? false;
  }

  private stateSignature(s: EngineState): string {
    return [
      s.phase,
      s.winner ?? '-',
      s.selectedUnitId ?? '-',
      s.selectedAbilityId ?? '-',
      s.log.length,
      ...s.units.map(
        (u) =>
          `${u.id}:${u.hp}:${u.position.x},${u.position.y}:${u.statuses
            .map((status) => `${status.id}-${status.remainingTurns}`)
            .join(',')}:${JSON.stringify(s.turnResources[u.id])}`,
      ),
      ...s.objects.map(
        (o) =>
          `${o.id}:${o.kind}:${o.hp}:${o.open ? 'open' : 'closed'}:${o.position.x},${o.position.y}`,
      ),
      ...s.terrain.map((t) => `t${t.x},${t.y}`),
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
    const { x: OX, y: OY } = this.boardOrigin(state);
    g.clear();

    // Floor: difficult-terrain tiles get a distinct tint and diagonal stripes.
    for (let x = 0; x < state.width; x++) {
      for (let y = 0; y < state.height; y++) {
        const px = OX + x * TILE;
        const py = OY + y * TILE;
        const difficult = state.terrain.some((tile) => tile.x === x && tile.y === y);
        g.fillStyle(difficult ? COLORS.difficult : COLORS.floor, 1);
        g.fillRect(px, py, TILE, TILE);
        g.lineStyle(1, COLORS.floorLine, 0.6);
        g.strokeRect(px, py, TILE, TILE);
        if (difficult) {
          g.lineStyle(2, COLORS.floorLine, 0.8);
          g.lineBetween(px + 6, py + 6, px + TILE - 6, py + TILE - 6);
          g.lineBetween(px + 6, py + TILE - 6, px + TILE - 6, py + 6);
        }
      }
    }

    // Objects (drawn under units)
    for (const object of state.objects) {
      this.drawObject(g, object, { x: OX, y: OY });
    }

    // Movement range or valid targets for the selected ability.
    const selected = state.units.find((u) => u.id === state.selectedUnitId);
    if (
      selected &&
      selected.hp > 0 &&
      state.phase === 'PLAYER_TURN' &&
      selected.team === 'PLAYER'
    ) {
      const ability =
        state.selectedAbilityId === null ? null : engine.getAbility(state.selectedAbilityId);
      if (ability) {
        for (const target of engine.getValidAbilityTargets(selected.id, ability.id)) {
          if (target.kind === 'TILE') {
            g.fillStyle(ability.presentation.color, 0.32);
            g.fillRect(OX + target.x * TILE + 3, OY + target.y * TILE + 3, TILE - 6, TILE - 6);
            continue;
          }
          const targetUnit = state.units.find((unit) => unit.id === target.unitId);
          if (!targetUnit) continue;
          g.lineStyle(3, ability.presentation.color, 1);
          g.strokeRect(
            OX + targetUnit.position.x * TILE + 3,
            OY + targetUnit.position.y * TILE + 3,
            TILE - 6,
            TILE - 6,
          );
        }
      } else {
        for (const position of engine.getMovementRange(selected.id)) {
          g.fillStyle(COLORS.range, 0.4);
          g.fillRect(OX + position.x * TILE + 3, OY + position.y * TILE + 3, TILE - 6, TILE - 6);
        }
      }
    }

    // Units
    for (const u of state.units) {
      const cx = OX + u.position.x * TILE + TILE / 2;
      const cy = OY + u.position.y * TILE + TILE / 2;
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
      const cx = OX + u.position.x * TILE + TILE / 2;
      const cy = OY + u.position.y * TILE - 6;
      this.hpTexts.push(
        this.add
          .text(
            cx,
            cy,
            `${u.hp}/${u.maxHp}${
              u.statuses.length > 0
                ? ` [${u.statuses.map((status) => status.name).join(', ')}]`
                : ''
            }`,
            {
              color: '#ffffff',
              fontSize: '13px',
              fontFamily: 'monospace',
              backgroundColor: '#00000088',
            },
          )
          .setOrigin(0.5),
      );
    }

    // Object HP labels (destructible objects only, while damaged)
    for (const t of this.objectHpTexts) t.destroy();
    this.objectHpTexts = [];
    for (const object of state.objects) {
      if (!object.destructible || object.hp >= object.maxHp) continue;
      const cx = OX + object.position.x * TILE + TILE / 2;
      const cy = OY + object.position.y * TILE - 6;
      this.objectHpTexts.push(
        this.add
          .text(cx, cy, `${object.hp}/${object.maxHp}`, {
            color: '#ffd7a1',
            fontSize: '12px',
            fontFamily: 'monospace',
            backgroundColor: '#00000088',
          })
          .setOrigin(0.5),
      );
    }
  }

  private drawObject(
    g: Phaser.GameObjects.Graphics,
    object: MapObject,
    origin: { x: number; y: number },
  ): void {
    const px = origin.x + object.position.x * TILE;
    const py = origin.y + object.position.y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    switch (object.kind) {
      case 'WALL':
        g.fillStyle(COLORS.wall, 1);
        g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        break;
      case 'DESK':
        g.fillStyle(COLORS.desk, 1);
        g.fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
        break;
      case 'LOCKER':
        g.fillStyle(COLORS.locker, 1);
        g.fillRect(px + 5, py + 5, TILE - 10, TILE - 10);
        break;
      case 'DOOR':
        if (object.open) {
          g.lineStyle(2, COLORS.doorOpen, 1);
        } else {
          g.lineStyle(8, COLORS.door, 1);
        }
        g.lineBetween(px + 4, py + 4, px + TILE - 4, py + TILE - 4);
        break;
      case 'BARREL':
        g.fillStyle(COLORS.barrel, 1);
        g.fillCircle(cx, cy, TILE * 0.3);
        break;
      case 'HAZARD':
        g.fillStyle(COLORS.hazard, 0.35);
        g.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
        g.lineStyle(2, COLORS.hazard, 0.5);
        g.strokeRect(px + 10, py + 10, TILE - 20, TILE - 20);
        break;
    }
  }
}

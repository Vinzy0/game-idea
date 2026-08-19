import Phaser from 'phaser';
import type { TacticalEngine } from '../combat/engine';
import type { MapObject } from '../combat/environment';
import type { EngineState, GridPosition } from '../combat/types';
import type { SceneExitMarker } from '../scenes/schoolHallwayScene';
import { fitZoom, screenToTile } from './camera';

export const TILE = 32;

const COLORS = {
  floor: 0x23233a,
  floorLine: 0x2e2e4a,
  difficult: 0x1d1d33,
  range: 0x2f9e63,
  player: 0x4e9af1,
  enemy: 0xd45555,
  neutral: 0x3fb950,
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
  exit: 0x58a6ff,
};

interface SceneData {
  engine: TacticalEngine;
  exits?: SceneExitMarker[];
}

interface AnimationState {
  steps: GridPosition[];
  index: number;
  lastAdvance: number;
}

const STEP_MS = 110;

/**
 * Phaser scene that renders TacticalEngine state and routes pointer input into
 * engine commands. Contains no game rules — only presentation. Render layers
 * are split logically (floor/objects/actors/overlay/labels) and each is
 * redrawn wholesale when its own signature changes.
 */
export class CombatScene extends Phaser.Scene {
  /** Public for the browser QA driver (window.__game -> scene.engine). */
  engine: TacticalEngine | null = null;
  private exits: SceneExitMarker[] = [];
  private floorLayer!: Phaser.GameObjects.Graphics;
  private objectLayer!: Phaser.GameObjects.Graphics;
  private actorLayer!: Phaser.GameObjects.Graphics;
  private overlayLayer!: Phaser.GameObjects.Graphics;
  private hpTexts: Phaser.GameObjects.Text[] = [];
  private objectHpTexts: Phaser.GameObjects.Text[] = [];
  private exitLabels: Phaser.GameObjects.Text[] = [];
  private floorSignature = '';
  private objectSignature = '';
  private actorSignature = '';
  private overlaySignature = '';
  private labelSignature = '';
  private presentation = new Map<string, GridPosition>();
  private animations = new Map<string, AnimationState>();
  private drag: { startX: number; startY: number; scrollX: number; scrollY: number } | null = null;
  private unsubscribe: (() => void) | undefined = undefined;

  constructor() {
    super('CombatScene');
  }

  init(data: SceneData) {
    this.engine = data.engine;
    this.exits = data.exits ?? [];
    this.presentation.clear();
    this.animations.clear();
    this.signaturesDirty();
  }

  create() {
    this.floorLayer = this.add.graphics();
    this.objectLayer = this.add.graphics();
    this.actorLayer = this.add.graphics();
    this.overlayLayer = this.add.graphics();

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('wheel', this.handleWheel, this);

    // Middle/right-drag panning must not open the browser context menu.
    this.game.canvas.addEventListener('contextmenu', this.preventContextMenu);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener('contextmenu', this.preventContextMenu);
      this.unsubscribe?.();
    });

    this.unsubscribe = this.engine?.subscribe(() => {
      if (this.sys.isActive()) this.drawIfChanged();
    });

    this.setupCamera();
    this.drawIfChanged();
    // Focus the player at the arrival position when a scene loads.
    this.focusPlayer();
  }

  update(_time: number, delta: number) {
    this.handleKeyboardPan(delta);
    this.advanceAnimations();
  }

  // ---- camera ----

  private worldSize(): { width: number; height: number } {
    const state = this.engine?.state;
    const width = state?.width ?? 10;
    const height = state?.height ?? 10;
    return { width: width * TILE, height: height * TILE };
  }

  private setupCamera() {
    const camera = this.cameras.main;
    const { width, height } = this.worldSize();
    camera.setBounds(0, 0, width, height);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.fitCamera();
  }

  private onResize() {
    this.fitCamera();
  }

  private fitCamera() {
    const camera = this.cameras.main;
    const { width, height } = this.worldSize();
    const zoom = fitZoom(this.scale.width, this.scale.height, width, height);
    camera.setZoom(zoom);
    camera.centerOn(width / 2, height / 2);
  }

  private handleWheel(
    pointer: Phaser.Input.Pointer,
    _over: unknown,
    _deltaX: number,
    deltaY: number,
  ) {
    const camera = this.cameras.main;
    const world = camera.getWorldPoint(pointer.x, pointer.y);
    const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
    const zoom = Phaser.Math.Clamp(camera.zoom * factor, 0.5, 1.5);
    camera.setZoom(zoom);
    // Keep the world point under the pointer fixed while zooming.
    camera.scrollX = world.x - pointer.x / zoom;
    camera.scrollY = world.y - pointer.y / zoom;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (pointer.middleButtonDown() || pointer.rightButtonDown()) {
      const camera = this.cameras.main;
      this.drag = {
        startX: pointer.x,
        startY: pointer.y,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
      };
      return;
    }
    if (pointer.leftButtonDown()) this.handleLeftClick(pointer);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (this.drag === null) return;
    const camera = this.cameras.main;
    camera.scrollX = this.drag.scrollX - (pointer.x - this.drag.startX) / camera.zoom;
    camera.scrollY = this.drag.scrollY - (pointer.y - this.drag.startY) / camera.zoom;
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (!pointer.middleButtonDown() && !pointer.rightButtonDown()) this.drag = null;
  }

  private preventContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private handleKeyboardPan(delta: number) {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
    ) {
      return; // WASD/arrows belong to the text field
    }
    const camera = this.cameras.main;
    const speed = (480 * delta) / 1000 / camera.zoom;
    const keys = this.input.keyboard;
    if (!keys) return;
    const left = keys.addKey(Phaser.Input.Keyboard.KeyCodes.A).isDown;
    const right = keys.addKey(Phaser.Input.Keyboard.KeyCodes.D).isDown;
    const up = keys.addKey(Phaser.Input.Keyboard.KeyCodes.W).isDown;
    const down = keys.addKey(Phaser.Input.Keyboard.KeyCodes.S).isDown;
    const arrowLeft = keys.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT).isDown;
    const arrowRight = keys.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT).isDown;
    const arrowUp = keys.addKey(Phaser.Input.Keyboard.KeyCodes.UP).isDown;
    const arrowDown = keys.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN).isDown;
    if (left || arrowLeft) camera.scrollX -= speed;
    if (right || arrowRight) camera.scrollX += speed;
    if (up || arrowUp) camera.scrollY -= speed;
    if (down || arrowDown) camera.scrollY += speed;

    const f = keys.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    if (Phaser.Input.Keyboard.JustDown(f)) this.focusPlayer();
  }

  /** F or scene load: center the camera on the selected/hero unit. */
  private focusPlayer() {
    const engine = this.engine;
    if (!engine) return;
    const state = engine.state;
    const unit =
      state.units.find((u) => u.id === state.selectedUnitId && u.hp > 0) ??
      state.units.find((u) => u.team === 'PLAYER' && u.hp > 0);
    if (!unit) return;
    this.cameras.main.centerOn(unit.position.x * TILE + TILE / 2, unit.position.y * TILE + TILE / 2);
  }

  // ---- input routing ----

  private tileFromPointer(pointer: Phaser.Input.Pointer): GridPosition | null {
    const state = this.engine?.state;
    if (!state) return null;
    const camera = this.cameras.main;
    return screenToTile(pointer.x, pointer.y, camera, TILE, state.width, state.height);
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer) {
    const engine = this.engine;
    if (!engine) return;
    const tile = this.tileFromPointer(pointer);
    if (!tile) return;
    const state = engine.state;
    if (state.phase === 'EXPLORATION') this.handleExplorationClick(tile);
    else if (state.phase === 'PLAYER_TURN') this.handleCombatClick(tile);
  }

  /** Exploration: select any actor, or click-to-move the hero, or interact. */
  private handleExplorationClick(tile: GridPosition) {
    const engine = this.engine!;
    const state = engine.state;
    const unit = engine.unitAt(tile.x, tile.y);
    if (unit) {
      engine.selectUnit(unit.id);
      return;
    }
    const selected = state.units.find((u) => u.id === state.selectedUnitId);
    const mover =
      selected !== undefined && selected.hp > 0 && selected.team === 'PLAYER'
        ? selected
        : state.units.find((u) => u.team === 'PLAYER' && u.controller === 'PLAYER' && u.hp > 0);
    if (mover === undefined) return;
    if (this.tryInteract(mover.id, tile.x, tile.y, state)) return;
    if (engine.moveExplorationUnit(mover.id, tile.x, tile.y)) return;
    engine.selectUnit('');
  }

  private handleCombatClick(tile: GridPosition) {
    const engine = this.engine!;
    const state = engine.state;
    const unit = engine.unitAt(tile.x, tile.y);

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

  // ---- drawing ----

  private signaturesDirty() {
    this.floorSignature = '';
    this.objectSignature = '';
    this.actorSignature = '';
    this.overlaySignature = '';
    this.labelSignature = '';
  }

  private drawIfChanged() {
    const engine = this.engine;
    if (!engine) return;
    const state = engine.state;

    const floorSig = `${state.width}x${state.height}|${state.terrain
      .map((t) => `${t.x},${t.y}`)
      .join(';')}`;
    const objectSig = `${state.objects
      .map(
        (o) => `${o.id}:${o.kind}:${o.hp}:${o.open ? 'o' : 'c'}:${o.position.x},${o.position.y}`,
      )
      .join('|')}|${this.exits
      .map((e) => `${e.id}@${e.position.x},${e.position.y}`)
      .join('|')}`;
    const actorSig = state.units
      .map((u) => `${u.id}:${u.hp}:${u.position.x},${u.position.y}:${u.statuses.length}`)
      .join('|');
    const overlaySig = `${state.phase}|${state.selectedUnitId ?? '-'}|${
      state.selectedAbilityId ?? '-'
    }`;
    const labelSig = `${actorSig}|${objectSig}`;

    if (floorSig !== this.floorSignature) {
      this.floorSignature = floorSig;
      this.drawFloor(state);
    }
    if (objectSig !== this.objectSignature) {
      this.objectSignature = objectSig;
      this.drawObjects(state);
    }
    if (actorSig !== this.actorSignature) {
      this.actorSignature = actorSig;
      this.drawActors(state);
    }
    if (overlaySig !== this.overlaySignature) {
      this.overlaySignature = overlaySig;
      this.drawOverlay(state);
    }
    if (labelSig !== this.labelSignature) {
      this.labelSignature = labelSig;
      this.drawLabels(state);
    }
  }

  private drawFloor(state: EngineState) {
    const g = this.floorLayer;
    g.clear();
    for (let x = 0; x < state.width; x++) {
      for (let y = 0; y < state.height; y++) {
        const px = x * TILE;
        const py = y * TILE;
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
  }

  private drawObjects(state: EngineState) {
    const g = this.objectLayer;
    g.clear();
    for (const object of state.objects) this.drawObject(g, object);
    // Exit markers: walkable floor glows rendered below actors.
    for (const exit of this.exits) {
      const px = exit.position.x * TILE;
      const py = exit.position.y * TILE;
      g.fillStyle(COLORS.exit, 0.22);
      g.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      g.lineStyle(2, COLORS.exit, 0.9);
      g.strokeCircle(px + TILE / 2, py + TILE / 2, TILE * 0.3);
    }
    for (const label of this.exitLabels) label.destroy();
    this.exitLabels = [];
    for (const exit of this.exits) {
      this.exitLabels.push(
        this.add
          .text(
            exit.position.x * TILE + TILE / 2,
            exit.position.y * TILE + TILE / 2,
            exit.label,
            {
              color: '#9ecbff',
              fontSize: '10px',
              fontFamily: 'monospace',
              backgroundColor: '#00000099',
            },
          )
          .setOrigin(0.5),
      );
    }
  }

  private syncPresentation(state: EngineState) {
    for (const unit of state.units) {
      if (this.presentation.has(unit.id)) continue;
      this.presentation.set(unit.id, { ...unit.position });
    }
  }

  private drawActors(state: EngineState) {
    this.syncPresentation(state);
    const g = this.actorLayer;
    g.clear();

    // Combat phase: snap any presentation lag (combat movement is instant).
    if (state.phase !== 'EXPLORATION') {
      for (const unit of state.units) {
        const current = this.presentation.get(unit.id);
        if (current && (current.x !== unit.position.x || current.y !== unit.position.y)) {
          this.presentation.set(unit.id, { ...unit.position });
        }
      }
      this.animations.clear();
    } else {
      // Exploration: animate committed moves along the engine-computed path.
      for (const unit of state.units) {
        const drawn = this.presentation.get(unit.id);
        if (
          drawn &&
          (drawn.x !== unit.position.x || drawn.y !== unit.position.y) &&
          !this.animations.has(unit.id)
        ) {
          this.startAnimation(unit.id, drawn, unit.position);
        }
      }
    }

    for (const unit of state.units) {
      const drawn = this.presentation.get(unit.id) ?? unit.position;
      const cx = drawn.x * TILE + TILE / 2;
      const cy = drawn.y * TILE + TILE / 2;
      const downed = unit.hp <= 0;
      const color = downed
        ? COLORS.downed
        : unit.team === 'PLAYER'
          ? COLORS.player
          : unit.team === 'NEUTRAL'
            ? COLORS.neutral
            : COLORS.enemy;
      if (unit.team === 'PLAYER') {
        g.fillStyle(color, downed ? 0.5 : 1);
        g.fillCircle(cx, cy, TILE * 0.34);
      } else {
        g.fillStyle(color, downed ? 0.5 : 1);
        g.fillRect(cx - TILE * 0.28, cy - TILE * 0.28, TILE * 0.56, TILE * 0.56);
      }
      if (downed) {
        g.lineStyle(2, 0x000000, 0.8);
        g.lineBetween(cx - 8, cy - 8, cx + 8, cy + 8);
        g.lineBetween(cx - 8, cy + 8, cx + 8, cy - 8);
      }
    }
  }

  private drawOverlay(state: EngineState) {
    const engine = this.engine;
    if (!engine) return;
    const g = this.overlayLayer;
    g.clear();

    const selected = state.units.find((u) => u.id === state.selectedUnitId);
    if (selected === undefined || selected.hp <= 0) return;

    // Selection ring around the drawn (possibly animating) position.
    const drawn = this.presentation.get(selected.id) ?? selected.position;
    g.lineStyle(3, COLORS.selection, 1);
    g.strokeCircle(drawn.x * TILE + TILE / 2, drawn.y * TILE + TILE / 2, TILE * 0.4);

    if (state.phase !== 'PLAYER_TURN' || selected.team !== 'PLAYER') return;

    const ability =
      state.selectedAbilityId === null ? null : engine.getAbility(state.selectedAbilityId);
    if (ability) {
      for (const target of engine.getValidAbilityTargets(selected.id, ability.id)) {
        if (target.kind === 'TILE') {
          g.fillStyle(ability.presentation.color, 0.32);
          g.fillRect(target.x * TILE + 3, target.y * TILE + 3, TILE - 6, TILE - 6);
          continue;
        }
        const targetUnit = state.units.find((unit) => unit.id === target.unitId);
        if (!targetUnit) continue;
        g.lineStyle(3, ability.presentation.color, 1);
        g.strokeRect(
          targetUnit.position.x * TILE + 3,
          targetUnit.position.y * TILE + 3,
          TILE - 6,
          TILE - 6,
        );
      }
    } else {
      for (const position of engine.getMovementRange(selected.id)) {
        g.fillStyle(COLORS.range, 0.4);
        g.fillRect(position.x * TILE + 3, position.y * TILE + 3, TILE - 6, TILE - 6);
      }
    }
  }

  private drawLabels(state: EngineState) {
    for (const t of this.hpTexts) t.destroy();
    this.hpTexts = [];
    for (const unit of state.units) {
      const drawn = this.presentation.get(unit.id) ?? unit.position;
      const cx = drawn.x * TILE + TILE / 2;
      const cy = drawn.y * TILE - 6;
      this.hpTexts.push(
        this.add
          .text(
            cx,
            cy,
            `${unit.hp}/${unit.maxHp}${
              unit.statuses.length > 0
                ? ` [${unit.statuses.map((status) => status.name).join(', ')}]`
                : ''
            }`,
            {
              color: '#ffffff',
              fontSize: '11px',
              fontFamily: 'monospace',
              backgroundColor: '#00000088',
            },
          )
          .setOrigin(0.5),
      );
    }

    // Object HP labels (destructible objects only, while damaged).
    for (const t of this.objectHpTexts) t.destroy();
    this.objectHpTexts = [];
    for (const object of state.objects) {
      if (!object.destructible || object.hp >= object.maxHp) continue;
      const cx = object.position.x * TILE + TILE / 2;
      const cy = object.position.y * TILE - 6;
      this.objectHpTexts.push(
        this.add
          .text(cx, cy, `${object.hp}/${object.maxHp}`, {
            color: '#ffd7a1',
            fontSize: '11px',
            fontFamily: 'monospace',
            backgroundColor: '#00000088',
          })
          .setOrigin(0.5),
      );
    }
  }

  private drawObject(g: Phaser.GameObjects.Graphics, object: MapObject): void {
    const px = object.position.x * TILE;
    const py = object.position.y * TILE;
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

  // ---- presentation-only exploration animation ----

  private advanceAnimations() {
    const engine = this.engine;
    if (!engine || this.animations.size === 0) return;
    let changed = false;
    const now = performance.now();

    for (const [unitId, anim] of this.animations) {
      if (now - anim.lastAdvance < STEP_MS) continue;
      anim.lastAdvance = now;
      if (anim.index < anim.steps.length) {
        const step = anim.steps[anim.index];
        anim.index += 1;
        this.presentation.set(unitId, { ...step });
        changed = true;
      }
      if (anim.index >= anim.steps.length) this.animations.delete(unitId);
    }
    if (changed) {
      // Only the presentation positions moved: force actor/overlay/label redraw.
      this.actorSignature = '';
      this.overlaySignature = '';
      this.labelSignature = '';
      this.drawIfChanged();
    }
  }

  private startAnimation(unitId: string, from: GridPosition, to: GridPosition) {
    const engine = this.engine;
    if (!engine) return;
    if (this.animations.has(unitId)) return;
    const path = engine.pathBetween(from, to);
    if (path === null || path.length === 0) return;
    this.presentation.set(unitId, { ...from });
    this.animations.set(unitId, {
      steps: path,
      index: 0,
      lastAdvance: performance.now(),
    });
  }
}

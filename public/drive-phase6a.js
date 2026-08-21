/* global window, PointerEvent */
// Phase 6A QA playthrough driver for the always-on 32x32 world board.
// Evaluated in the page console while the dev server is running (window.__game
// is exposed in DEV by GameCanvas). Covers the Phase 6A gate:
//   - permanent 32x32 scene in EXPLORATION
//   - click-to-move exploration, free door interaction
//   - camera wheel zoom (pointer-anchored) and F-focus
//   - explicit combat participants excluding the Neutral
//   - Neutral immunity to direct and Fireball area effects
//   - checkpoint retry restore
//   - full combat to VICTORY on the same board (no Phaser recreation)
//   - acknowledgeVictory -> EXPLORATION
// PASS/FAIL lines in window.__driveResult.
//
// Scenario notes (why these assertions, not the naive ones):
//   - The divider door is a single-tile chokepoint; the corridor below y=14
//     stays open, so a closed door blocks its own tile, not the whole wing.
//   - Phaser listens for PointerEvents, not MouseEvents.
//   - The camera is bounds-clamped: when the map fits the viewport (or the
//     target is near an edge), scroll clamps. Zoom/F-focus checks therefore
//     run in the free-scroll regime (zoom >= 1.35) and compare against the
//     clamped expectation.
(function () {
  const frame2 = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  async function main() {
    const out = [];
    const game = window.__game;
    if (!game) return 'no __game';
    const scene = game.scene.getScene('CombatScene');
    const eng = scene.engine;
    if (!eng) return 'no engine';

    const state = () => eng.state;
    const unit = (id) => state().units.filter((u) => u.id === id)[0];
    const obj = (id) => state().objects.filter((o) => o.id === id)[0];
    const check = (name, ok) => out.push((ok ? 'PASS' : 'FAIL') + ' ' + name);
    const TILE = 32;
    let turn = 0;

    // ---------- Phase A: exploration on the permanent 32x32 board ----------
    check('scene starts in EXPLORATION', state().phase === 'EXPLORATION');
    check('board is exactly 32x32', state().width === 32 && state().height === 32);
    check('five actors present (hero, neutral, 3 hostiles)', state().units.length === 5);
    check('no combat participants before combat', state().combatParticipants.length === 0);

    // Walk west to the divider door; exploration consumes no action.
    check('exploration walk to door tile', eng.moveExplorationUnit('hero', 21, 8) === true);
    check(
      'exploration movement leaves actions untouched',
      state().turnResources.hero.actionRemaining === 1,
    );
    check('door interaction legal when adjacent', eng.canInteract('hero', 'door-divider') === true);
    check('door opens in exploration', eng.interact('hero', 'door-divider') === true);
    check('door reports open', obj('door-divider').open === true);
    check(
      'exploration interaction costs no action',
      state().turnResources.hero.actionRemaining === 1,
    );
    check('open door tile is walkable', eng.moveExplorationUnit('hero', 20, 8) === true);
    check(
      'walk through the open door into the east wing',
      eng.moveExplorationUnit('hero', 23, 9) === true && unit('hero').position.x === 23,
    );

    // Close the door and verify its tile blocks movement (the south corridor
    // is a separate open route, so only the door tile itself must block).
    check('walk back beside the door', eng.moveExplorationUnit('hero', 21, 8) === true);
    check('door closes', eng.interact('hero', 'door-divider') === true && obj('door-divider').open === false);
    check('closed door tile blocks movement', eng.moveExplorationUnit('hero', 20, 8) === false);
    check('door reopens', eng.interact('hero', 'door-divider') === true && obj('door-divider').open === true);
    check('open door tile is walkable again', eng.moveExplorationUnit('hero', 20, 8) === true);
    check('door lets the hero back through', eng.moveExplorationUnit('hero', 19, 8) === true);

    // Position the hero beside the neutral for the fireball-immunity check.
    check(
      'free exploration walk to the west corridor',
      eng.moveExplorationUnit('hero', 7, 25) === true,
    );

    // ---------- Phase B: input path (synthetic clicks) ----------
    const cam = scene.cameras.main;
    const screenOf = (wx, wy) => ({
      x: (wx - cam.scrollX) * cam.zoom,
      y: (wy - cam.scrollY) * cam.zoom,
    });
    const canvas = game.canvas;
    const rect = canvas.getBoundingClientRect();
    const clickTile = (tx, ty) => {
      const p = screenOf(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
      const cx = rect.left + p.x;
      const cy = rect.top + p.y;
      const opts = {
        clientX: cx,
        clientY: cy,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'mouse',
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
      canvas.dispatchEvent(new PointerEvent('pointerup', opts));
    };
    clickTile(6, 25); // the neutral
    check('click selects the neutral actor', state().selectedUnitId === 'sam');
    clickTile(16, 0); // a blocked tile (north door): the hero cannot move there
    check('clicking an impassable tile deselects a neutral', state().selectedUnitId === null);
    clickTile(7, 25); // the hero
    check('click selects the hero', state().selectedUnitId === 'hero');
    clickTile(7, 26); // empty ground -> exploration move
    check(
      'click-to-move walks the hero in exploration',
      unit('hero').position.x === 7 && unit('hero').position.y === 26,
    );
    check(
      'walk back to the fireball staging tile',
      eng.moveExplorationUnit('hero', 7, 25) === true,
    );

    // ---------- Phase C: camera ----------
    check('initial fit zoom is within 0.5-1.5', cam.zoom >= 0.5 && cam.zoom <= 1.5);
    // Zoom into the free-scroll regime (map larger than the viewport).
    for (let i = 0; i < 12 && cam.zoom < 1.35; i += 1) {
      scene.input.emit('wheel', { x: 400, y: 300 }, null, 0, -120);
    }
    await frame2();
    check('wheel zoom reaches the free-scroll regime', cam.zoom >= 1.35 && cam.zoom <= 1.5);
    const worldBefore = cam.getWorldPoint(400, 300);
    scene.input.emit('wheel', { x: 400, y: 300 }, null, 0, -120);
    await frame2();
    const worldAfter = cam.getWorldPoint(400, 300);
    check(
      'zoom keeps the world point under the pointer fixed',
      Math.abs(worldBefore.x - worldAfter.x) < 0.01 && Math.abs(worldBefore.y - worldAfter.y) < 0.01,
    );
    // F-focus: center on the hero, clamped to the camera bounds.
    scene.focusPlayer();
    await frame2();
    const hero = unit('hero');
    const heroWorld = { x: hero.position.x * TILE + TILE / 2, y: hero.position.y * TILE + TILE / 2 };
    const bounds = cam.getBounds();
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const clampScroll = (value, limit) =>
      viewW >= bounds.width ? (bounds.width - viewW) / 2 : Math.min(limit, Math.max(0, value));
    const expectedX = clampScroll(heroWorld.x - viewW / 2, bounds.width - viewW);
    const expectedY = clampScroll(heroWorld.y - viewH / 2, bounds.height - viewH);
    check(
      'F-focus centers the camera on the hero (bounds-aware)',
      Math.abs(cam.scrollX - expectedX) < 1 && Math.abs(cam.scrollY - expectedY) < 1,
    );

    // ---------- Phase D: checkpoint retry restore ----------
    const participants = ['hero', 'brawler-1', 'brawler-2', 'firebrand'];
    check(
      'retry combat starts with explicit participants',
      eng.startCombat({ participantIds: participants, objective: 'DEFEAT_ALL_HOSTILES' }) === true,
    );
    check('retry combat phase is PLAYER_TURN', state().phase === 'PLAYER_TURN');
    eng.moveUnit('hero', 8, 25);
    check(
      'combat move applied',
      unit('hero').position.x === 8 && unit('hero').position.y === 25,
    );
    check('retry restores the pre-combat checkpoint', eng.restoreCombatCheckpoint() === true);
    check(
      'checkpoint restores hero position',
      unit('hero').position.x === 7 && unit('hero').position.y === 25,
    );
    check(
      'checkpoint restores enemy hp',
      unit('brawler-1').hp === 3 && unit('firebrand').hp === 3,
    );
    check('checkpoint returns to EXPLORATION', state().phase === 'EXPLORATION');
    check('checkpoint clears participants', state().combatParticipants.length === 0);

    // ---------- Phase E: same-board combat with explicit participants ----------
    check(
      'combat starts with explicit participants',
      eng.startCombat({ participantIds: participants, objective: 'DEFEAT_ALL_HOSTILES' }) === true,
    );
    check('phase is PLAYER_TURN', state().phase === 'PLAYER_TURN');
    check(
      'participants exclude the neutral',
      state().combatParticipants.length === 4 &&
        state().combatParticipants.indexOf('sam') === -1,
    );
    check('neutral holds no turn resources', state().turnResources.sam === undefined);
    check(
      'COMBAT_STARTED event recorded',
      state().events.some((e) => e.type === 'COMBAT_STARTED'),
    );

    // Neutral immunity: hero is at (7,25); sam at (6,25) is inside the radius
    // of a fireball centered at (7,25). No enemy is in that radius, so the
    // resolution must touch sam and produce nothing.
    const samHpBefore = unit('sam').hp;
    check(
      'fireball over the neutral resolves',
      eng.useAbility('hero', 'fireball', { kind: 'TILE', x: 7, y: 25 }) === true,
    );
    check('neutral hp unchanged by fireball splash', unit('sam').hp === samHpBefore);
    check(
      'no damage event targets the neutral',
      !state().events.some((e) => e.type === 'CHARACTER_DAMAGED' && e.targetId === 'sam'),
    );
    check(
      'direct ability cannot target the neutral',
      eng.canUseAbility('hero', 'punch', { kind: 'UNIT', unitId: 'sam' }) === false,
    );

    // ---------- Phase F: win the fight on the same board ----------
    const firebrandId = 'firebrand';
    const nearestEnemy = () => {
      const heroU = unit('hero');
      let best = null;
      let bestD = Infinity;
      for (const u of state().units) {
        if (u.team !== 'ENEMY' || u.hp <= 0) continue;
        const d = Math.abs(u.position.x - heroU.position.x) + Math.abs(u.position.y - heroU.position.y);
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
      return best;
    };
    for (turn = 0; turn < 30 && state().phase !== 'VICTORY' && state().phase !== 'DEFEAT'; turn += 1) {
      if (state().phase !== 'PLAYER_TURN') {
        eng.endTurn();
        continue;
      }
      const target = nearestEnemy();
      if (target === null) {
        eng.endTurn();
        continue;
      }
      const d = Math.abs(target.position.x - unit('hero').position.x) +
        Math.abs(target.position.y - unit('hero').position.y);
      if (d <= 6) {
        eng.useAbility('hero', 'fireball', { kind: 'TILE', x: target.position.x, y: target.position.y });
      } else if (eng.canMove('hero', target.position.x, target.position.y)) {
        const step = eng.firstStepToward(unit('hero').position, target.position);
        if (step) eng.moveUnit('hero', step.x, step.y);
      }
      eng.endTurn();
    }
    check('combat resolves to VICTORY', state().phase === 'VICTORY');
    check(
      'victory came within the turn cap',
      turn < 30 && state().phase === 'VICTORY',
    );
    const result = state().encounterResult;
    check('encounter result records VICTORY', result !== null && result.outcome === 'VICTORY');
    check(
      'encounter result names all three hostiles downed',
      result !== null &&
        result.downedCharacterIds.indexOf('brawler-1') !== -1 &&
        result.downedCharacterIds.indexOf('brawler-2') !== -1 &&
        result.downedCharacterIds.indexOf(firebrandId) !== -1,
    );
    check('neutral survived the whole fight', unit('sam').hp > 0);
    check(
      'COMBAT_ENDED event recorded',
      state().events.some((e) => e.type === 'COMBAT_ENDED' && e.outcome === 'VICTORY'),
    );

    // Acknowledging victory returns the SAME engine and scene to exploration.
    check('acknowledgeVictory returns to EXPLORATION', eng.acknowledgeVictory() === true);
    check('phase is EXPLORATION after victory', state().phase === 'EXPLORATION');
    check('participants cleared after victory', state().combatParticipants.length === 0);
    check('hero hp preserved after victory', unit('hero').hp > 0);

    return out.join('\n');
  }

  main()
    .then((result) => {
      window.__driveResult = result;
    })
    .catch((error) => {
      window.__driveResult =
        'DRIVER ERROR: ' + (error && error.message ? error.message : String(error));
    });
})();

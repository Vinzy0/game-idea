/* global window, document */
// QA playthrough driver for the Phase 3+4 tactical prototype (AI + environment).
// Evaluated in the page console while the dev server is running (window.__game
// is exposed in DEV by GameCanvas). Runs environment assertions (movement cost,
// walls/doors/barrels/hazards, interact) interleaved with a fight to completion.
// Priority per turn: 1) Fireball the Firebrand whenever in range (kill the
// turret), 2) advance the environment tour (outranks punches — the hero can
// absorb 1-damage thug punches while touring), 3) punch adjacent enemies,
// 4) approach the nearest enemy. PASS/FAIL lines in window.__driveResult.
(function () {
  function main() {
    const out = [];
    const game = window.__game;
    if (!game) return 'no __game';
    const scene = game.scene.getScene('CombatScene');
    const eng = scene.engine;

    // Fresh fight if the previous one ended.
    const ng = Array.prototype.slice
      .call(document.querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'New Game');
    if (ng) ng.click();

    const heroOf = () => eng.state.units.filter((u) => u.id === 'hero')[0];
    const objects = () => eng.state.objects;
    const hasObj = (id) => objects().some((o) => o.id === id);
    const obj = (id) => objects().filter((o) => o.id === id)[0];
    const logHas = (needle) => eng.state.log.some((l) => l.includes(needle));
    const rangeSet = () => {
      const s = new Set();
      eng.getMovementRange('hero').forEach((t) => s.add(t.x + ',' + t.y));
      return s;
    };
    const check = (name, ok) => out.push((ok ? 'PASS' : 'FAIL') + ' ' + name);

    // ---------- Phase 1: static environment assertions ----------
    check('door blocks movement while closed', eng.isBlocked(6, 0) === true);
    check('barrel blocks movement', eng.isBlocked(9, 4) === true);
    check('hazard tile is passable', eng.isBlocked(5, 3) === false);
    check('wall blocks movement', eng.isBlocked(2, 7) === true);

    const range = rangeSet();
    check('move range includes normal tile (3,6)', range.has('3,6'));
    check('move range includes difficult tile (4,6) at cost 3', range.has('4,6'));
    check('move range includes difficult tile (2,4) at cost 2', range.has('2,4'));
    check('move range excludes 4-cost tile (6,6)', !range.has('6,6'));
    check('move range excludes wall tile (2,7)', !range.has('2,7'));

    check('interact requires adjacency (door far away)', eng.interact('hero', 'door') === false);
    check(
      'interact rejects non-interactable object (barrel)',
      eng.interact('hero', 'barrel-1') === false,
    );
    check(
      'fireball out of range from spawn',
      eng.useAbility('hero', 'fireball', { kind: 'TILE', x: 9, y: 4 }) === false,
    );

    // ---------- Environment tour (one step per turn; retries until done) ----------
    const tour = [
      {
        name: 'move toward corridor (4,5)',
        run: () => eng.moveUnit('hero', 4, 5),
      },
      {
        name: 'fireball destroys barrel in range',
        run: () => eng.useAbility('hero', 'fireball', { kind: 'TILE', x: 9, y: 4 }),
        verify: () => {
          check('barrel removed from state', !hasObj('barrel-1'));
          check('barrel tile passable after destruction', eng.isBlocked(9, 4) === false);
          check('log reports barrel destruction', logHas('destroys the barrel'));
        },
      },
      {
        name: 'hero walks onto hazard (5,3)',
        run: () => eng.moveUnit('hero', 5, 3),
        deferredVerify: () => {
          check(
            'hero standing on hazard tile',
            heroOf().position.x === 5 && heroOf().position.y === 3,
          );
          check('hazard damage logged at turn start', logHas('takes 1 damage from the hazard'));
        },
      },
      {
        name: 'hero moves to door approach (6,1)',
        run: () => eng.moveUnit('hero', 6, 1),
      },
      {
        name: 'interact opens the door',
        run: () => eng.interact('hero', 'door'),
        verify: () => {
          check('door open in state', obj('door').open === true);
          check('door open logged', logHas('opens the door'));
        },
      },
    ];
    let tourIndex = 0;
    let deferredVerify = null;

    const firebrand = () => eng.state.units.find((u) => u.id === 'e3' && u.hp > 0);
    const tryFireballAt = (pos) =>
      eng.useAbility('hero', 'fireball', { kind: 'TILE', x: pos.x, y: pos.y });
    const canFireballAt = (pos) =>
      eng.canUseAbility('hero', 'fireball', { kind: 'TILE', x: pos.x, y: pos.y });
    const tryPunch = (e) =>
      eng.canUseAbility('hero', 'punch', { kind: 'UNIT', unitId: e.id }) &&
      eng.useAbility('hero', 'punch', { kind: 'UNIT', unitId: e.id });

    let done = false;
    for (let t = 0; t < 80 && !done; t++) {
      const s = eng.state;
      if (deferredVerify) {
        deferredVerify();
        deferredVerify = null;
      }
      if (s.winner) {
        out.push('GAME OVER after turn ' + t + ': ' + s.phase);
        done = true;
        continue;
      }
      const hero = heroOf();
      if (!hero || hero.hp <= 0) {
        out.push('hero downed');
        done = true;
        continue;
      }
      const enemies = s.units.filter((u) => u.team === 'ENEMY' && u.hp > 0);
      if (enemies.length === 0) {
        out.push('all enemies downed');
        done = true;
        continue;
      }

      let acted = false;

      // 1) Fireball the Firebrand whenever in range (kill the turret first).
      const fb = firebrand();
      if (fb && canFireballAt(fb.position)) {
        acted = tryFireballAt(fb.position);
      }

      // 2) Advance the environment tour (outranks punches).
      if (!acted && tourIndex < tour.length) {
        const step = tour[tourIndex];
        const result = step.run();
        check(step.name, result === true);
        if (result === true) {
          if (step.verify) step.verify();
          if (step.deferredVerify) deferredVerify = step.deferredVerify;
          tourIndex += 1;
          acted = true;
        }
      }

      // 3) Punch the lowest-hp adjacent enemy.
      let punchTarget = null;
      if (!acted) {
        enemies.forEach((e) => {
          if (
            eng.canUseAbility('hero', 'punch', { kind: 'UNIT', unitId: e.id }) &&
            (!punchTarget || e.hp < punchTarget.hp)
          ) {
            punchTarget = e;
          }
        });
        if (punchTarget) acted = tryPunch(punchTarget);
      }

      // 4) Approach the nearest enemy.
      if (!acted) {
        const goal = fb || enemies[0];
        let approach = null;
        let ad = 1e9;
        eng.getMovementRange('hero').forEach((tile) => {
          const d = Math.abs(tile.x - goal.position.x) + Math.abs(tile.y - goal.position.y);
          if (d < ad) {
            ad = d;
            approach = tile;
          }
        });
        if (approach && (approach.x !== hero.position.x || approach.y !== hero.position.y)) {
          eng.moveUnit('hero', approach.x, approach.y);
        }
        if (!punchTarget) {
          enemies.forEach((e) => {
            if (
              !punchTarget &&
              eng.canUseAbility('hero', 'punch', { kind: 'UNIT', unitId: e.id })
            ) {
              punchTarget = e;
            }
          });
          if (punchTarget) tryPunch(punchTarget);
        }
      }

      eng.endTurn();
      if (t % 10 === 9) {
        out.push(
          't' +
            t +
            ' heroHP=' +
            heroOf().hp +
            ' enemies=' +
            eng.state.units
              .filter((u) => u.team === 'ENEMY' && u.hp > 0)
              .map((u) => u.id + ':' + u.hp)
              .join(' '),
        );
      }
    }

    // Any tour step that never completed is a FAIL (fight ended too early or bug).
    if (tourIndex < tour.length) {
      for (let i = tourIndex; i < tour.length; i++) {
        check(tour[i].name + ' (never completed)', false);
      }
    }

    const fs = eng.state;
    out.push(
      'FINAL: ' +
        fs.phase +
        ' winner=' +
        (fs.winner || '-') +
        ' heroHP=' +
        heroOf().hp +
        ' doorOpen=' +
        (obj('door') ? obj('door').open : 'gone'),
    );
    return out.join(' | ');
  }

  window.__driveResult = main();
})();

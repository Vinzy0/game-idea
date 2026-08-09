/* global window, document */
// QA playthrough driver for the Phase 1 ugly chess prototype.
// Injected via <script src="/drive.js"> while the dev server is running.
// Runs a hit-and-run kiting fight to completion and stores the result
// in window.__driveResult. No framework deps; drives window.__game directly.
(function () {
  function main() {
    const out = [];
    const game = window.__game;
    if (!game) return 'no __game';
    const scene = game.scene.getScene('CombatScene');
    const eng = scene.engine;

    // Reset to a fresh fight if the previous one ended.
    const ng = Array.prototype.slice
      .call(document.querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'New Game');
    if (ng) ng.click();

    eng.selectUnit('hero');
    const heroOf = () => eng.state.units.filter((u) => u.id === 'hero')[0];

    let done = false;
    for (let t = 0; t < 80 && !done; t++) {
      const s = eng.state;
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

      // 1) Attack the lowest-hp reachable enemy; otherwise approach one.
      let target = null;
      enemies.forEach((e) => {
        if (eng.canAttack('hero', e.id) && (!target || e.hp < target.hp)) target = e;
      });
      if (!target) {
        const range = eng.getMovementRange('hero');
        let bestTile = null;
        let bestScore = -1;
        enemies.forEach((e) => {
          range.forEach((tile) => {
            if (Math.abs(tile.x - e.position.x) + Math.abs(tile.y - e.position.y) === 1) {
              let others = 0;
              enemies.forEach((o) => {
                others += Math.max(
                  0,
                  4 - (Math.abs(tile.x - o.position.x) + Math.abs(tile.y - o.position.y)),
                );
              });
              const score = -e.hp * 10 - others;
              if (score > bestScore) {
                bestScore = score;
                bestTile = tile;
                target = e;
              }
            }
          });
        });
        if (bestTile) {
          eng.moveUnit('hero', bestTile.x, bestTile.y);
          eng.attack('hero', target.id);
        } else {
          // Approach fallback: move to the range tile closest to any enemy.
          let approach = null;
          let ad = 1e9;
          range.forEach((tile) => {
            let md = 1e9;
            enemies.forEach((e) => {
              const d = Math.abs(tile.x - e.position.x) + Math.abs(tile.y - e.position.y);
              if (d < md) md = d;
            });
            if (md < ad) {
              ad = md;
              approach = tile;
            }
          });
          if (approach) eng.moveUnit('hero', approach.x, approach.y);
        }
      } else {
        eng.attack('hero', target.id);
      }

      // 2) Kite: retreat to a tile exactly 3 tiles from the nearest enemy.
      //    (md 3 keeps engagement reachable next turn even around the pillar;
      //    the enemy ends adjacent and trades 1 damage — acceptable.)
      let s2 = eng.state;
      if (s2.winner) {
        out.push('GAME OVER after turn ' + t + ': ' + s2.phase);
        done = true;
        continue;
      }
      const enemies2 = s2.units.filter((u) => u.team === 'ENEMY' && u.hp > 0);
      if (enemies2.length === 0) {
        done = true;
        continue;
      }
      const range2 = eng.getMovementRange('hero');
      let rt = null;
      range2.forEach((tile) => {
        let md = 1e9;
        enemies2.forEach((e) => {
          const d = Math.abs(tile.x - e.position.x) + Math.abs(tile.y - e.position.y);
          if (d < md) md = d;
        });
        if (md === 3 && !rt) rt = tile;
      });
      if (!rt) {
        let rd = -1;
        range2.forEach((tile) => {
          let md = 1e9;
          enemies2.forEach((e) => {
            const d = Math.abs(tile.x - e.position.x) + Math.abs(tile.y - e.position.y);
            if (d < md) md = d;
          });
          if (md > rd) {
            rd = md;
            rt = tile;
          }
        });
      }
      if (rt) eng.moveUnit('hero', rt.x, rt.y);
      eng.endTurn();
      if (t % 5 === 4) {
        const es = eng.state.units.filter((u) => u.team === 'ENEMY' && u.hp > 0);
        out.push('t' + t + ' heroHP=' + heroOf().hp + ' enemies=' + es.map((u) => u.id + ':' + u.hp).join(' '));
      }
    }
    const fs = eng.state;
    out.push('FINAL: ' + fs.phase + ' winner=' + (fs.winner || '-') + ' heroHP=' + heroOf().hp);
    return out.join(' | ');
  }

  window.__driveResult = main();
})();

# PLAN_Phase3-4.md

> Draft plan — **not approved**. Covers PHASES.md Phase 3 (Tactical Enemy AI) and Phase 4 (Tactical Environment) as one delivery.
> Phase 4.5 (Sol architecture review) is intentionally **excluded** from this plan; it is a separate gate that can be scheduled after Phase 4 lands.
> Precondition: the uncommitted Phase 2 working tree (12 modified + 2 untracked files) is committed as the baseline before any lane starts.

---

## 1. Goals

### Phase 3 — Tactical Enemy AI
- Battles run against several computer-controlled enemies.
- AI selects targets, checks usable abilities, moves into range, attacks, ends turn.
- AI logic lives in its own module (`src/game/ai/`) — deterministic, unit-testable, no Phaser/React imports.
- Engine owns rule enforcement (same public API the player uses — the AI cannot cheat).

### Phase 4 — Tactical Environment
- Battlefield affects tactical decisions via: walls, desks, lockers, doors, barrels, hazard tiles, difficult terrain.
- Doors are interactable (open/close). Destructible objects take damage from area/TILE abilities and can be destroyed.
- Hazard tiles damage living units that start their turn on them. Difficult terrain costs 2 movement per tile.
- Object targeting: TILE-targeting abilities (e.g. Fireball) can hit destructible objects inside their area.
- Scope kept minimal per PHASES.md — no cover damage reduction, no movable/throwable/explosive, no line-of-sight.

## 2. Non-Goals

- No cover/LOS mechanics, no throwable/movable/explosive object properties, no generated maps.
- No AI personalities, targeting priorities settings, difficulty settings, formations, or multi-enemy coordination.
- No hazard avoidance by the AI (documented known boundary; PHASES lists it as "optional later").
- No async AI planning — enemy turns stay synchronous inside `endTurn()`.
- No new dependencies.
- No Phase 4.5 review work.

## 3. Assumptions

- Phase 2 work in the working tree is correct and becomes the baseline commit.
- Manhattan grid, cardinal movement, existing ability schema stays as-is.
- `blocked: GridPosition[]` in `GameConfig`/`EngineState` is **replaced** by `objects` + `terrain` (breaking change; demoScenario + tests updated in the same lane).
- Unit `controller` field already exists and can be used for future player-controlled enemies, but is not exercised in this delivery.

## 4. Architecture Decisions

### 4.1 AI module — `src/game/ai/enemyBrain.ts` (new)

Pure decision function, no engine imports:

```ts
interface AiQueries {
  alivePlayers(): Unit[];
  getAbilitiesForUnit(unitId: string): Ability[];
  canUseAbility(casterId: string, abilityId: string, target: AbilityTarget): boolean;
  getValidAbilityTargets(casterId: string, abilityId: string): AbilityTarget[];
  firstStepToward(from: GridPosition, to: GridPosition): GridPosition | null;
  moveUnit(unitId: string, x: number, y: number): boolean;
  useAbility(casterId: string, abilityId: string, target: AbilityTarget): boolean;
}

type EnemyAction =
  | { type: 'MOVE'; x: number; y: number }
  | { type: 'USE_ABILITY'; abilityId: string; target: AbilityTarget };

function planEnemyAction(unit: Unit, q: AiQueries): EnemyAction | null;
```

Algorithm (v1):
1. No alive players → `null` (end turn).
2. Pick target: nearest by Manhattan distance; tie → lowest HP.
3. Among the enemy's abilities, find the highest-damage ability with a legal target in range (`getValidAbilityTargets`). If found → `USE_ABILITY`.
4. Else `firstStepToward` target → `MOVE` (one step; engine re-plans after each executed action, so the loop naturally attacks as soon as range is reached).
5. Cannot move → `null`.

The engine loops: while enemy resources remain and action ≠ null, execute it.

### 4.2 Environment module — `src/game/combat/environment.ts` (new)

```ts
type ObjectKind = 'WALL' | 'DESK' | 'LOCKER' | 'DOOR' | 'BARREL' | 'HAZARD';

interface MapObject {
  id: string;
  kind: ObjectKind;
  position: GridPosition;
  hp: number;          // >0 only for destructible kinds
  maxHp: number;
  destructible: boolean;
  blocksMovement: boolean;
  interactable: boolean;
  open: boolean;       // doors only
}

interface MapObjectConfig { id: string; kind: ObjectKind; x: number; y: number; hp?: number; }
```

Kind defaults (catalog helper in the same file):

| Kind   | destructible | interactable | blocksMovement | hp (default) |
|--------|-------------|--------------|----------------|--------------|
| WALL   | no          | no           | yes            | —            |
| DESK   | yes         | no           | yes            | 3            |
| LOCKER | yes         | no           | yes            | 4            |
| DOOR   | no          | yes          | !open          | —            |
| BARREL | yes         | no           | yes            | 2            |
| HAZARD | no          | no           | no             | —            |

Terrain: `terrain: GridPosition[]` in config/state = difficult tiles (movement cost 2).
Pure helpers: `movementCostAt(x, y, terrain): number`, `objectBlocksMovementAt(...)`, config validation (bounds, duplicate positions, destructible hp ≥ 1).

### 4.3 Engine changes — `src/game/combat/engine.ts`

- **Phase 3 (integration lane C):** implement `AiQueries` on `TacticalEngine`; replace `runEnemyAI()` internals with `planEnemyAction` loop; keep existing pathfinding (cost 1).
- **Phase 4 (integration lane D):**
  - Replace `blocked` with `objects` + `terrain`; `isBlocked` → object-based; `applyPush` stops at blocking objects.
  - Cost-aware BFS in `getMovementOptions` and `firstStepToward` (difficult = 2).
  - `interact(unitId, objectId)`: alive, adjacent (Manhattan 1), interactable, costs ACTION; door toggles open/closed.
  - TILE-targeting ability areas also damage destructible objects in the area (DAMAGE effect only; object removed at 0 HP with log entry). UNIT targeting unaffected.
  - Hazard tick: at each team's turn start, living units on hazard tiles take 1 damage (log entry).
  - Destructible object HP exposed in state; objects rendered from state (no rules in Phaser).

### 4.4 Rendering — `src/game/rendering/CombatScene.ts`

- Draw terrain tint + per-kind object shapes (wall = solid block, desk/locker = rectangles, door = gap/line by open state, barrel = circle with HP, hazard = orange tile).
- Click on an interactable object while a player unit is selected and adjacent → `engine.interact(...)`.
- No rule logic in the scene (per ARCHITECTURE.md boundary).

### 4.5 HUD — `src/app/TacticalHud.tsx`

- "Interact" button, enabled when the selected living player unit is adjacent to ≥1 interactable object; tooltip names the object(s).
- Nothing else changes.

### 4.6 Demo scenario — `src/game/combat/demoScenario.ts`

- Lane C: add a ranged enemy ("Firebrand", Fireball) to prove AI ability use.
- Lane D: replace with a school-hallway map: walls, a closed door, desks, a locker, a barrel, a hazard tile, difficult terrain; 2 thugs + 1 firebrand.

## 5. Ultrawork Lane Split (file-disjoint)

| Lane | Scope | Owns (files) | Runs |
|------|-------|--------------|------|
| **A — AI brain** | `enemyBrain.ts` + unit tests with fake queries | `src/game/ai/enemyBrain.ts`, `src/game/ai/__tests__/enemyBrain.test.ts` | parallel |
| **B — Environment module** | types, kind catalog, movement-cost + validation helpers + tests | `src/game/combat/environment.ts`, `src/game/combat/__tests__/environment.test.ts` | parallel |
| **C — Phase 3 integration** | engine implements `AiQueries`, brain-driven enemy turns, Firebrand enemy, engine tests, GAME_RULES.md, STATUS.md | `src/game/combat/engine.ts`, `src/game/combat/demoScenario.ts`, `src/game/combat/__tests__/engine.test.ts`, `docs/GAME_RULES.md`, `docs/STATUS.md` | sequential, after A+B |
| **D — Phase 4 integration** | engine environment (objects/terrain/interact/hazards/destructibles), CombatScene, TacticalHud, new demo map, engine tests, ARCHITECTURE.md + GAME_RULES.md + STATUS.md | `src/game/combat/engine.ts`, `src/game/combat/types.ts`, `src/game/combat/demoScenario.ts`, `src/game/combat/__tests__/engine.test.ts`, `src/game/rendering/CombatScene.ts`, `src/app/TacticalHud.tsx`, `docs/ARCHITECTURE.md`, `docs/GAME_RULES.md`, `docs/STATUS.md` | sequential, after C |
| **E — Orchestrator verification** | full gate: tests/typecheck/lint/build, update `public/drive.js` QA driver, browser QA, fix regressions, commit | `public/drive.js` (+ any regression fixes) | last |

Lanes A and B are fully disjoint and run in parallel. C then D are sequential because both own `engine.ts` + `engine.test.ts`; E is the orchestrator-owned gate (PHASES.md §6 Phase Gates).

## 6. Acceptance Criteria

### Phase 3
1. AI enemies select targets, move into range, and attack without scripted per-turn steps.
2. An enemy with a ranged ability (Firebrand) uses Fireball when in range instead of moving adjacent.
3. `planEnemyAction` unit tests cover: no players → null; attack-in-range → best-damage ability; out-of-range → move toward nearest (tie → lowest HP); immobile → null.
4. Player can complete a battle against several AI enemies (browser QA).

### Phase 4
1. Doors block movement while closed; interact (ACTION) toggles open/closed.
2. Fireball damages the barrel; barrel destroyed at 0 HP and removed; units can then walk through.
3. Hazard tile deals 1 damage at turn start to living units standing on it.
4. Difficult terrain costs 2 movement per tile (movement range and AI pathfinding respect it).
5. A tactical map with the above meaningfully affects movement/combat (browser QA: door creates a chokepoint, barrel is destroyable cover, hazard punishes standing).

## 7. Verification (per lane and final)

- Lane A/B: `npx vitest run src/game/ai src/game/combat/__tests__/environment.test.ts` (or full suite).
- Every lane: `npm run typecheck && npm run lint && npm test`.
- Final (E): `npm test && npm run typecheck && npm run lint && npm run build`, then `npm run dev` + `public/drive.js` browser QA covering: AI ability use, door interact, barrel destruction, hazard damage, difficult terrain; no console errors.
- Phase gates (PHASES.md §6): STATUS.md updated; ARCHITECTURE.md + GAME_RULES.md reflect the changes; known boundaries documented (no LOS, no cover, AI ignores hazards).

## 8. Risks / Notes

- `engine.ts` is the shared core: lane C and D are sequential by design; do not parallelize them.
- `blocked` removal is breaking — all call sites migrate inside lane D (engine, tests, scene).
- AI brain contract (`AiQueries`) must not change between lanes A→C→D; it is frozen by this plan.
- No SMART AI (Sol) escalation expected; if lane work hits a genuine architecture fork, stop and document per PHASES.md §8 instead of inventing architecture.

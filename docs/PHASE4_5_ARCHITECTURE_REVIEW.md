# Phase 4.5 Architecture Review

**Completed:** 2026-08-09  
**Gate:** SMART architecture review before Phase 5  
**Decision:** **PASS — Phase 5 is unblocked.**

## Scope

The review inspected the Phase 4 code for:

- combat/rendering separation;
- duplicated mechanics;
- ability/environment interaction;
- forced movement;
- object handling;
- manager-class sprawl;
- hardcoded assumptions;
- readiness for future AI-generated encounters.

The review followed the roadmap rule: do not refactor for cleanliness alone. Changes were made only where the current design could produce invalid combat state, let presentation code own mechanics, or make later AI integration unreliable.

## Findings Resolved

### 1. Encounter construction did not validate full mechanical invariants

**Risk:** High for Phase 6. The engine validated environment bounds and overlap, but trusted unit IDs, coordinates, numeric stats, spawns, and dimensions. Hand-authored TypeScript hid this risk; AI-generated JSON will not.

**Resolution:** Added `validateEncounterSetup()` as the engine's construction boundary. It now rejects invalid dimensions, empty or duplicate IDs, duplicate terrain, non-integer coordinates, overlapping units, units inside blocking objects, invalid HP/movement, invalid team/controller values, and duplicate unit ability references. Unknown object kinds fail with a deterministic error.

This validator intentionally covers only engine invariants. Phase 6 must still add `ScenarioSpec` schema validation, reachability, objectives/exits, sufficient walkable space, and repair/retry behavior.

### 2. Enemy TILE abilities selected arbitrary legal board coordinates

**Risk:** High. The brain selected the first valid target returned by row-major board enumeration. A Fireball could consume its Action on an empty tile instead of the chosen player, and behavior would vary with map dimensions and object placement.

**Resolution:** The brain now aims UNIT abilities at the chosen player's unit ID and TILE abilities at that player's position, then asks the engine whether the exact action is legal. It ignores zero-damage abilities in its current offensive policy and still prefers the highest-damage legal option.

### 3. Interaction rules were duplicated in React and Phaser

**Risk:** Medium. Adjacency and interactability were calculated independently in `TacticalHud` and `CombatScene`, even though the engine revalidated the command. New object interactions could make presentation behavior drift from engine behavior.

**Resolution:** Added the authoritative `TacticalEngine.canInteract()` query. React uses it to enable interaction controls; Phaser only translates a clicked object into `interact()`. The engine remains the only owner of adjacency, turn, resource, and object legality.

### 4. UI updates depended on monkey-patching engine methods

**Risk:** Medium. `engineEvents.ts` replaced methods with `any` wrappers. Multiple subscribers or changed command paths could cause nested wrappers, incomplete notifications, or unsafe unsubscribe behavior. Phaser also polled state every 250 ms.

**Resolution:** Added a framework-neutral `TacticalEngine.subscribe()` API. React and Phaser subscribe directly; polling and runtime method replacement were removed. Phaser unsubscribes on both scene shutdown and destruction so React Strict Mode cannot leave a destroyed renderer subscribed to the engine.

### 5. Two object edge cases could create incorrect state or logs

**Risk:** Medium.

- An open door could be closed while a living unit occupied the doorway, leaving a unit inside a blocking object.
- An ability with multiple DAMAGE effects could repeatedly damage and “destroy” the same object after its first removal.

**Resolution:** Occupied open doors cannot be closed, and damage resolution ignores an object once it has reached 0 HP.

## Reviewed and Retained

### TacticalEngine size

The engine is large, but its responsibilities are still one cohesive deterministic combat domain. Splitting it now would mostly move private methods without improving a real boundary. Revisit extraction when objectives, scenario loading, or persistence add a second reason for change.

### Two Dijkstra traversals

Movement-range discovery and first-step path reconstruction have similar traversal loops. They already share blocking and movement-cost rules, while their outputs and stopping conditions differ. No extraction was made because the duplication has not produced rule drift. Revisit if more terrain costs or path policies are added.

### Controller versus team

`controller` is represented in unit data, but the current UI and turn runner still implement the Phase 4 PLAYER-team-versus-ENEMY-team prototype. Full controller reassignment and “Take Control” are not required for Phase 5 or the first generated encounters. Implement them when control modes enter scope; do not create a second combat system.

### Current feature boundaries

No line of sight, cover bonuses, hazard-aware AI, damage types, or dice were added. These are documented feature limits, not architectural blockers.

### Production bundle size

The build succeeds but Vite reports a large-chunk warning because Phaser is included in the initial bundle. Code-splitting combat before a separate narrative route exists would be premature. Revisit when Phase 5 creates the DM/chat surface so the tactical renderer can be loaded only when combat begins.

## Phase 5 Handoff

Phase 5 should remain independent from tactical encounter generation and add:

- an AI provider abstraction;
- DM inputs, outputs, and authority boundaries;
- narrative chat with loading/error behavior;
- current story state and basic player context.

Do not let provider SDK types enter the tactical engine. The later Encounter Bridge should translate validated `ScenarioSpec` data into `GameConfig`, then rely on `validateEncounterSetup()` as the final mechanical construction boundary.

## Verification

The completed gate is covered by unit regressions for encounter validation, targeted TILE abilities, interaction legality, occupied doors, multi-effect object damage, and subscriptions, plus the existing tactical suite. Final verification passed with 94/94 tests, TypeScript, ESLint, and the production build. A fresh browser smoke test verified hero selection, ability selection, a complete enemy turn back to the player, React/Phaser subscription updates, and zero console warnings or errors. The build has the documented non-blocking large-chunk warning.

# Architecture

> Source: PRD §53 (High-Level Application Architecture) and §54 (Architectural Boundary: Tactical Engine vs Phaser). Copy of the PRD lives at `docs/PRD.md`.

## High-Level Application Architecture (PRD §53)

```text
┌──────────────────────────────────────────┐
│                 React UI                 │
│                                          │
│ Chat    Character    Settings    Saves   │
└───────────────────┬──────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────┐
│              Game Application            │
│                                          │
│ Story State      Characters              │
│ Scenario State   Settings                │
│ Persistence      Controller Assignment   │
└───────┬──────────────────────┬───────────┘
        │                      │
        ▼                      ▼
┌───────────────┐      ┌──────────────────┐
│  AI Director  │      │ Tactical Engine  │
│               │      │                  │
│ DM            │      │ Grid             │
│ Dialogue      │      │ Turns            │
│ Scenarios     │      │ Movement         │
│ Interpretation│      │ Abilities        │
└───────┬───────┘      │ Statuses         │
        │              │ Environment      │
        │              └────────┬─────────┘
        │                       │
        │                       ▼
        │              ┌──────────────────┐
        │              │ Phaser Renderer  │
        │              └──────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│              AI Provider Layer           │
└──────────────────────────────────────────┘
```

## Architectural Boundary: Tactical Engine vs Phaser (PRD §54)

**Rule: core game rules must never live in Phaser scenes.**

Bad:

```text
CombatScene contains:
damage math
character stats
ability definitions
turn rules
AI decisions
map rules
rendering
```

Preferred:

```text
Tactical Engine
↓
Produces game state
↓
Phaser displays game state
```

Phaser receives instructions such as:

```text
Move Character A from (3,4) to (5,4)
Play Fireball from A to B
Show 18 Damage
Remove Enemy B
```

This keeps mechanics testable and prevents the rendering layer from becoming the entire game.

## Phase 2 Ability Flow

```text
Ability data (catalog or encounter config)
  → target validation + affected-unit resolution
  → movement/action/bonus-action resource consumption
  → generic effect executor (Damage | Heal | Push | Apply Status)
  → combat state snapshot
  → React HUD + Phaser renderer
```

- `Ability` definitions are immutable data: targeting, area, requirements, effects, cost, and presentation.
- Units reference abilities by ID; encounter startup fails fast on an unknown ID.
- `TacticalEngine.useAbility()` is the only effect-resolution command. The older `attack()` method is a compatibility adapter to the data-defined Punch ability.
- Area targeting resolves recipients before effects execute, so one effect primitive works for both single-target and area abilities.
- Phaser highlights engine-provided valid targets and never calculates range, allegiance, damage, healing, pushing, statuses, or costs.

## Phase 4 Environment Flow

```text
Map object configs + terrain tiles (encounter config, e.g. demoScenario)
  → createObject() kind defaults + validateEnvironment() fail-fast validation
  → engine state (objects[] with hp/open, terrain[])
  → isBlocked() derives from blocking objects (closed doors block, open doors pass)
  → cost-aware movement/pathfinding (difficult terrain costs 2; Dijkstra)
  → interact() (doors toggle, 1 Action) / TILE-ability destructible damage / hazard tick at turn start
  → Phaser scene (terrain tint, per-kind object sprites, object HP labels) + React HUD (Interact button)
```

- `MapObject`/`MapObjectConfig` and the pure helpers (`createObject`, `movementCostAt`, `objectBlocksMovement`, `validateEnvironment`) live in `src/game/combat/environment.ts`; the engine is their only consumer.
- The engine constructor fails fast: any environment validation error (out-of-bounds object or terrain tile, duplicate object position, destructible with no HP, terrain overlapping an object) throws with the full error list.
- Movement BFS became cost-aware Dijkstra: entering a difficult-terrain tile costs 2 movement, and `moveUnit` consumes the true path cost. `firstStepToward` (used by the AI brain) shares the same semantics.
- `interact()` is a public engine command like `moveUnit`/`useAbility`: adjacency + Action validation inside the engine, so doors are testable without the scene or HUD.
- Destructible objects (desk, locker, barrel) take damage only from TILE-targeting abilities (e.g. Fireball); UNIT-targeting abilities like Punch never touch them. Hazards tick for 1 damage at each team's turn start.

## Current Layout

```text
src/
  main.tsx          React entry point
  App.tsx           Tactical prototype shell
  app/
    GameCanvas.tsx  Owns the Phaser.Game lifecycle (mount → create, unmount → destroy)
    TacticalHud.tsx React command surface for resources, abilities, and Interact
  game/
    ai/
      enemyBrain.ts Pure single-action enemy decision (Phase 3)
    abilities/
      types.ts       Ability, targeting, area, cost, effect, status schemas
      catalog.ts     Punch, Fireball, and Force Push data
    combat/
      environment.ts Map object kinds, terrain costs, validation (pure, Phase 4)
      engine.ts      Pure TypeScript rules, commands, and generic effect resolution
      demoScenario.ts Phase 4 school-hallway encounter config
      types.ts       Engine state and config schemas
    rendering/
      CombatScene.ts Phaser-only presentation and pointer translation
      engineEvents.ts React subscription wrapper over mutating engine commands
docs/               PRD + PHASES copies, architecture, rules, AI contracts, status
```

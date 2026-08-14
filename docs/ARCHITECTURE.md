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
  → createObject() kind defaults + validateEncounterSetup() fail-fast validation
  → engine state (objects[] with hp/open, terrain[])
  → isBlocked() derives from blocking objects (closed doors block, open doors pass)
  → cost-aware movement/pathfinding (difficult terrain costs 2; Dijkstra)
  → interact() (doors toggle, 1 Action) / TILE-ability destructible damage / hazard tick at turn start
  → Phaser scene (terrain tint, per-kind object sprites, object HP labels) + React HUD (Interact button)
```

- `MapObject`/`MapObjectConfig` and the pure helpers (`createObject`, `movementCostAt`, `objectBlocksMovement`, `validateEnvironment`) live in `src/game/combat/environment.ts`; the engine is their only consumer.
- The engine constructor fails fast through `validateEncounterSetup()`: environment errors plus invalid dimensions, IDs, coordinates, numeric unit state, overlapping or blocked spawns, and duplicated terrain/ability references are reported together. Phase 6 will layer creative scenario checks such as reachability and objectives above this mechanical boundary.
- Movement BFS became cost-aware Dijkstra: entering a difficult-terrain tile costs 2 movement, and `moveUnit` consumes the true path cost. `firstStepToward` (used by the AI brain) shares the same semantics.
- `interact()` is a public engine command like `moveUnit`/`useAbility`: adjacency + Action validation inside the engine, so doors are testable without the scene or HUD.
- Destructible objects (desk, locker, barrel) take damage only from TILE-targeting abilities (e.g. Fireball); UNIT-targeting abilities like Punch never touch them. Hazards tick for 1 damage at each team's turn start.

## Phase 4.5 Integration Boundaries

- `TacticalEngine.canInteract()` owns interaction legality. React and Phaser only display or route commands; they do not calculate adjacency, Action cost, or door occupancy rules.
- `TacticalEngine.subscribe()` is the framework-neutral state-change boundary used by both React and Phaser. The engine does not import either framework, and UI code does not replace engine methods or poll for changes.
- Enemy TILE abilities target the chosen hostile unit's position and still pass through `canUseAbility()` before execution. Board enumeration is never used as an AI targeting policy.
- `validateEncounterSetup()` is the final mechanical guard before state construction. Future AI output must first pass the Phase 6 `ScenarioSpec` schema and map validator, then translate into `GameConfig`.

## Phase 5 Narrative Flow

```text
Player setup / restored local story
  -> useNarrativeDm lifecycle (start, send, retry, approve, reset)
  -> bounded NarrativeRequest (digest + situation + threads + 8 prior messages)
  -> AIProvider
       -> DemoProvider, or
       -> HttpGatewayProvider -> trusted server-side gateway
  -> defensive NarrativeResponse validation
  -> pure story transition
  -> versioned localStorage save
  -> React narrative transcript + context panel
```

- `AIProvider` is the only application-facing inference contract. Provider SDKs and credentials are outside the browser.
- Narrative responses can update narrative prose, situation, digest, and unresolved threads. Their type cannot express tactical mutations.
- Major irreversible changes use `ApprovalProposal`. Protected/default stories wait for an explicit decision; unrestricted stories visibly record the player's standing authorization.
- Request context is bounded. The complete transcript stays local; Phase 9 will replace the simple rolling digest with long-term retrieval and Markdown memory.
- Narrative mode is the default React surface. `CombatDemo` is lazy-loaded, so Phaser is emitted as a separate chunk and does not enter the initial narrative bundle.
- Phase 6 must build above `generateStructured()` and validate a `ScenarioSpec` before translating it to `GameConfig`; it must not weaken the Phase 4.5 construction boundary.

## Current Layout

```text
src/
  main.tsx          React entry point
  App.tsx           Narrative-first shell with a lazy Combat Demo mode
  ai/
    provider.ts      Provider-neutral requests, responses, and authority proposal
    validate.ts      Defensive provider payload parsers
    demoProvider.ts  Deterministic, explicitly labeled offline provider
    httpGateway.ts   Credential-free browser adapter to a trusted gateway
    factory.ts       Non-secret Vite configuration and safe demo fallback
  app/
    NarrativeDm.tsx    Setup, transcript, context, approval, retry, and reset UI
    useNarrativeDm.ts  Abortable narrative request and persistence lifecycle
    CombatDemo.tsx     Lazy wrapper around the Phase 4 tactical prototype
    GameCanvas.tsx  Owns the Phaser.Game lifecycle (mount → create, unmount → destroy)
    TacticalHud.tsx React command surface for resources, abilities, and Interact
  story/
    types.ts         Versioned story state and transient request phases
    state.ts         Pure start/message/response/approval/error transitions
    context.ts       Bounded provider context construction
    storage.ts       Fail-closed single-story localStorage persistence
  game/
    ai/
      enemyBrain.ts Pure single-action enemy decision (Phase 3)
    abilities/
      types.ts       Ability, targeting, area, cost, effect, status schemas
      catalog.ts     Punch, Fireball, and Force Push data
    combat/
      environment.ts Map object kinds, terrain costs, validation (pure, Phase 4)
      validation.ts  Full mechanical encounter construction invariants (Phase 4.5)
      engine.ts      Pure TypeScript rules, commands, and generic effect resolution
      demoScenario.ts Phase 4 school-hallway encounter config
      types.ts       Engine state and config schemas
    rendering/
      CombatScene.ts Phaser-only presentation and pointer translation
docs/               PRD + PHASES copies, architecture, rules, AI contracts, status
```

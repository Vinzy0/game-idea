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

## Current Phase 0 Layout

```text
src/
  main.tsx          React entry point
  App.tsx           Minimal shell (title + GameCanvas)
  app/
    GameCanvas.tsx  Owns the Phaser.Game lifecycle (mount → create, unmount → destroy)
  game/             (Phase 1+ — engine lives here, pure TS, no Phaser imports)
docs/               PRD + PHASES copies, architecture, rules, AI contracts, status
```

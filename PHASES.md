# PHASES.md

# Development Roadmap

This document defines the required development order for the project.

Its purpose is to:

- keep development focused;
- prevent agents from implementing the entire PRD at once;
- prevent premature overengineering;
- tell agents which model should handle which type of work;
- provide clear phase boundaries and completion criteria.

The project should be developed **one phase at a time**.

Do not skip ahead unless explicitly instructed.

---

# 1. Core Development Philosophy

The project follows two major rules.

## Rule 1

> **Build the smallest working version of each system before making it flexible, pretty, or sophisticated.**

## Rule 2

> **AI decides creatively. The engine decides mechanically.**

The AI may decide things such as:

- story;
- dialogue;
- encounter concepts;
- enemy personalities;
- map composition;
- narrative consequences;
- ability flavor.

The deterministic engine decides things such as:

- legal movement;
- damage;
- action costs;
- valid targets;
- range;
- HP;
- statuses;
- collision;
- pathfinding;
- map validity.

Mechanical rules must remain deterministic and testable.

---

# 2. Model Definitions

Throughout this document, development assignments use the terms:

- **FAST AI**
- **SMART AI**

These map to specific models.

---

## FAST AI

FAST AI means:

- **Luna**
- **DeepSeek Flash**

Use either one unless a task specifically benefits from the other.

FAST AI should perform the majority of implementation work.

Use FAST AI for:

- boilerplate;
- straightforward coding;
- UI;
- rendering;
- tests;
- known algorithms;
- implementing already-designed systems;
- adding features to an existing architecture;
- repetitive development work;
- localized bug fixes;
- clearly specified refactors;
- file handling;
- CRUD-style operations;
- wiring existing systems together.

When this document says:

> **Model: FAST AI**

it means:

> **Use Luna or DeepSeek Flash.**

---

## SMART AI

SMART AI means:

- **Sol**

Use Sol for work that genuinely requires stronger reasoning.

Use Sol for:

- architecture;
- foundational system design;
- difficult cross-system decisions;
- AI contracts;
- prompt design;
- scenario schemas;
- memory/context architecture;
- difficult integration problems;
- ambiguous requirements;
- major refactors;
- architecture reviews;
- deciding how multiple mechanics should interact;
- bugs involving several systems;
- situations where the existing architecture may need to change.

When this document says:

> **Model: SMART AI**

it means:

> **Use Sol.**

---

# 3. Model Selection Rule

Use this simple rule.

If the task is:

> **"We already know what this should do. Implement it."**

Use:

**Luna or DeepSeek Flash**

If the task is:

> **"We need to decide the correct way this should work."**

Use:

**Sol**

---

# 4. Expected Model Roles

```text
SOL
│
├── Architect
├── System Designer
├── Reviewer
├── Integration Problem Solver
├── AI Behavior Designer
└── Difficult Debugger


LUNA / DEEPSEEK FLASH
│
├── Primary Developers
├── Feature Implementers
├── UI Builders
├── Test Writers
├── Routine Debuggers
├── Refactor Workers
└── Boilerplate Workers
```

The intended development pattern is:

```text
SOL
↓
Design important system

LUNA / DEEPSEEK FLASH
↓
Implement
Test
Fix
Extend

SOL
↓
Review when needed

LUNA / DEEPSEEK FLASH
↓
Continue building
```

Expected overall workload:

> **~70–80% Luna / DeepSeek Flash**

> **~20–30% Sol**

Sol should be concentrated on decisions that would be expensive to undo later.

---

# 5. Phase Overview

| Phase | Goal | Main Model |
|---|---|---|
| 0 | Project Foundation | FAST |
| 1 | Ugly Chess Prototype | FAST |
| 2 | Lego Ability System | SMART → FAST |
| 3 | Tactical Enemy AI | FAST |
| 4 | Tactical Environment | FAST |
| 5 | AI DM Prototype | SMART → FAST |
| 6 | Encounter Bridge | SMART → FAST |
| 7 | Combat Dialogue | SMART → FAST |
| 8 | Full Story → Combat → Story Loop | SMART + FAST |
| 9 | Persistent Memory | SMART → FAST |
| 10 | Player Freedom Features | FAST |
| 11 | Freeform Tactical Actions | SMART → FAST |
| 12 | Expansion | FAST by default |

Important:

> **Phase 8 is the point where the core game exists.**

Phases 9–12 deepen and expand the product afterward.

---

# Phase 0 — Project Foundation

## Goal

Create a minimal local project that runs correctly.

## Model

**FAST AI — Luna or DeepSeek Flash**

No Sol should be required unless something unusual appears.

## Required Stack

- TypeScript
- React
- Phaser
- Vite

Electron is not required yet.

The game may initially run using a local Vite development server.

## Requirements

Create:

- application bootstrap;
- React shell;
- Phaser canvas;
- TypeScript configuration;
- testing setup;
- lint/typecheck scripts;
- development scripts;
- minimal source organization.

Suggested structure:

```text
src/
├── app/
├── game/
│   ├── combat/
│   ├── entities/
│   ├── abilities/
│   └── rendering/
├── ai/
├── persistence/
└── shared/

docs/
├── PRD.md
├── PHASES.md
├── ARCHITECTURE.md
├── GAME_RULES.md
├── AI_CONTRACTS.md
└── STATUS.md
```

Do not create speculative systems merely to fill these folders.

Create files only when they are needed.

## Success Criteria

- dependencies install;
- project runs;
- React renders;
- Phaser renders;
- tests run;
- typecheck passes.

## Do Not Build Yet

- AI;
- abilities;
- story;
- saves;
- character creator;
- map generation;
- dialogue.

---

# Phase 1 — Ugly Chess Prototype

## Goal

Build the smallest possible tactical game.

It should intentionally look primitive.

Use:

- circles;
- squares;
- colored tiles;
- simple text.

Graphics do not matter.

## Model

**FAST AI — Luna or DeepSeek Flash**

## Requirements

Implement:

- small grid;
- player token;
- enemy token;
- tile selection;
- unit selection;
- movement range;
- click-to-move;
- blocked tiles;
- HP;
- one basic attack;
- player turn;
- enemy turn;
- End Turn;
- defeated/downed state.

Basic flow:

```text
Player Turn
↓
Select Character
↓
Move
↓
Attack
↓
End Turn
↓
Enemy Turn
```

## Architecture Requirement

Core combat rules should not live inside Phaser scenes.

Preferred:

```text
Tactical Engine
↓
Game State
↓
Phaser Renderer
```

Phaser displays the game.

It should not own all game rules.

## Success Criteria

The player can:

1. click their character;
2. see legal movement;
3. move;
4. attack;
5. end turn;
6. fight until one side loses.

## Do Not Build Yet

- AI DM;
- advanced abilities;
- story;
- inventory;
- generated maps;
- progression.

---

# Phase 2 — Lego Ability System

## Goal

Replace hardcoded attacks with a reusable, data-driven ability system.

This is the first architecture-critical phase.

## Models

### Initial design

**SMART AI — Sol**

### Implementation

**FAST AI — Luna or DeepSeek Flash**

## Sol Responsibilities

Sol should design the foundational relationship between:

```text
Ability
Targeting
Action Cost
Effect
Status Effect
Combat State
```

Avoid designing a giant universal RPG framework.

Support only what the game currently needs.

## Ability Structure

Conceptually:

```text
Ability
- id
- name
- description
- actionCost
- targeting
- range
- area
- requirements
- effects[]
- presentation
```

## Initial Effect Primitives

Implement only a small set:

- Damage
- Heal
- Push
- Apply Status
- Area Effect

Add more primitives only when actual features require them.

## Required Test Abilities

### Punch

- adjacent enemy;
- damage.

### Fireball

- ranged tile target;
- area damage.

### Force Push

- ranged character target;
- pushes target away.

## Success Criteria

Punch, Fireball, and Force Push all use the same generic ability/effect system.

Adding a new simple ability should mostly involve data rather than bespoke code.

## After Architecture Is Settled

Use Luna or DeepSeek Flash for:

- new effects;
- new abilities;
- targeting UI;
- previews;
- status implementation;
- tests.

Do not keep using Sol for routine ability additions.

---

# Phase 3 — Tactical Enemy AI

## Goal

Allow battles to run against computer-controlled enemies.

## Model

**FAST AI — Luna or DeepSeek Flash**

## Initial AI

Keep it intentionally simple.

Example:

```text
Choose hostile target

If attack available in range:
    attack
Else:
    move closer

End turn
```

## Requirements

Support:

- target selection;
- checking usable abilities;
- movement toward targets;
- attacking;
- ending turn.

## Optional Later Behaviors

- ranged enemies maintain distance;
- low-health enemies retreat;
- enemies avoid hazards;
- target priorities.

These are still FAST AI tasks if behavior is clearly specified.

## Success Criteria

The player can complete a battle against several AI-controlled enemies.

## When to Use Sol

Only if enemy AI begins requiring a genuinely new architecture.

Do not use Sol merely to make enemies slightly smarter.

---

# Phase 4 — Tactical Environment

## Goal

Make the battlefield affect tactical decisions.

## Primary Model

**FAST AI — Luna or DeepSeek Flash**

## Requirements

Introduce a limited environment system.

Initial features:

- walls;
- obstacles;
- doors;
- difficult terrain;
- hazards;
- destructible objects.

Possible object properties:

```text
interactable
destructible
movable
throwable
explosive
cover
```

Do not implement all properties immediately.

## Suggested Initial Objects

- wall;
- desk;
- locker;
- door;
- barrel;
- hazard tile.

## Success Criteria

A tactical map can contain environmental elements that meaningfully affect movement or combat.

At least one object should be interactable or destructible.

---

# Phase 4.5 — Architecture Review

After Phase 4, perform a review before major AI integration.

## Model

**SMART AI — Sol**

Sol should inspect:

- combat/rendering separation;
- duplicated mechanics;
- ability/environment interaction;
- forced movement;
- object handling;
- manager-class sprawl;
- hardcoded assumptions;
- anything that would make AI-generated encounters difficult later.

Do not refactor simply because code could look cleaner.

Refactor only when the architecture creates a real future problem.

Any clearly specified refactor should then be implemented by:

**Luna or DeepSeek Flash**

---

# Phase 5 — AI DM Prototype

## Goal

Build the narrative half of the game independently from encounter generation.

## Models

### Architecture

**SMART AI — Sol**

### Implementation

**FAST AI — Luna or DeepSeek Flash**

## Sol Responsibilities

Design:

- AI provider abstraction;
- DM context structure;
- DM inputs;
- DM outputs;
- narrative authority boundaries;
- structured vs freeform responses;
- basic memory behavior.

## AI Provider Interface

Conceptually:

```text
AIProvider

generateNarrative()
generateStructured()
generateDialogue()
```

The application should not depend directly on one provider SDK.

## Implementation Requirements

Build:

- AI DM chat;
- player input;
- AI responses;
- loading/error behavior;
- current story state;
- basic player context.

## Success Criteria

The player can:

1. start a story;
2. chat with the DM;
3. continue for several messages;
4. maintain basic narrative state.

## FAST AI Tasks

Use Luna / DeepSeek Flash for:

- chat UI;
- API adapters;
- loading states;
- provider configuration;
- request plumbing;
- basic persistence code.

---

# Phase 6 — Encounter Bridge

## Goal

Turn story situations into structured tactical encounters.

This is architecture-critical.

## Models

### Design

**SMART AI — Sol**

### Implementation

**FAST AI — Luna or DeepSeek Flash**

## Core Flow

```text
Story Situation
↓
AI Encounter Planner
↓
ScenarioSpec
↓
Schema Validation
↓
Map Validation
↓
Tactical Engine
```

## Sol Responsibilities

Define:

- ScenarioSpec;
- AI permissions;
- AI restrictions;
- map-generation contract;
- spawn representation;
- enemy intent;
- objective representation;
- validator behavior;
- retry/repair strategy.

## ScenarioSpec

Likely contains:

```text
id
title
narrativeContext
map
participants
spawnLocations
enemyIntent
objectives
environment
dialogueHooks
```

No arbitrary executable code may come from AI output.

## Initial Map Theme

Use only:

**School**

Possible pieces:

- floors;
- walls;
- lockers;
- desks;
- doors;
- obstacles.

## Validator

Check:

- map bounds;
- valid coordinates;
- spawn legality;
- object overlap;
- reachable important areas;
- sufficient walkable space.

## Success Criteria

A prompt such as:

> Three powered students attack me in a school hallway.

can produce a valid ScenarioSpec that loads into the tactical game.

## FAST AI Tasks

Use Luna / DeepSeek Flash for:

- schemas;
- parsing;
- map placement;
- validation code;
- retries;
- UI;
- spawn handling.

---

# Phase 7 — Combat Dialogue

## Goal

Allow narrative and character interaction to continue during combat.

This is a defining feature.

## Models

### AI behavior architecture

**SMART AI — Sol**

### UI / implementation

**FAST AI — Luna or DeepSeek Flash**

## Combat Events

Combat should emit structured events such as:

```text
ABILITY_USED
CHARACTER_DAMAGED
CHARACTER_DOWNED
OBJECT_DESTROYED
CHARACTER_MOVED
TURN_STARTED
TURN_ENDED
COMBAT_ENDED
```

Dialogue systems should listen to these events.

Do not hardcode dialogue directly into individual abilities.

---

## Dialogue Types

### Pre-generated

Prepared during encounter creation.

Examples:

- opening lines;
- important story lines;
- phase transitions;
- final lines.

### Triggered

React to meaningful combat events.

Example:

```text
Player hits Kael with Fireball
↓
Dialogue evaluator
↓
Should Kael react?
```

Most events should result in silence.

### Player-Initiated

Player presses:

**Talk**

Then writes dialogue.

Talking normally costs no combat action.

---

## Sol Responsibilities

Design:

- which events matter;
- dialogue frequency;
- when characters stay silent;
- context selection;
- dialogue priority;
- live dialogue contract;
- possible mechanical consequences of dialogue.

## FAST AI Responsibilities

Build:

- Talk button;
- speech bubbles;
- dialogue box;
- pause/resume behavior;
- event wiring;
- UI presentation.

## Success Criteria

During battle:

1. villain reacts to a meaningful event;
2. dialogue appears;
3. player presses Talk;
4. player writes a line;
5. NPC responds;
6. battle continues.

---

# Phase 8 — Full Story → Combat → Story Loop

## Goal

Connect the major systems into the first complete version of the game.

This is the first point where the project's core fantasy exists.

## Models

**SMART AI + FAST AI**

FAST AI should still write most of the code.

Sol should handle integration design and architecture review.

## Required Flow

```text
AI DM Story
↓
Conflict
↓
Play This Out
↓
Scenario Generated
↓
Tactical Battle
↓
Combat Dialogue
↓
Battle Ends
↓
EncounterResult
↓
AI Receives Result
↓
Story Continues
```

## EncounterResult

Must include structured truth such as:

- outcome;
- surviving characters;
- HP;
- downed characters;
- escaped characters;
- objectives;
- destroyed objects;
- important actions.

The AI DM must use this mechanical result as truth.

## Sol Responsibilities

Use Sol for:

- integration planning;
- state ownership questions;
- cross-system bugs;
- architecture inconsistencies;
- final core-loop review.

## FAST AI Responsibilities

Use Luna / DeepSeek Flash for:

- plumbing;
- serialization;
- UI;
- passing data between systems;
- localized bugs;
- tests;
- straightforward integration.

## Success Criteria

The player can:

1. chat with AI DM;
2. encounter a conflict;
3. start tactical mode;
4. move;
5. use powers;
6. fight enemies;
7. talk mid-fight;
8. finish the battle;
9. return to story;
10. see the AI continue based on what actually happened.

> **At Phase 8, the core game exists.**

Everything after this improves or expands it.

---

# Phase 9 — Persistent Memory

## Goal

Support long-running stories without providing the entire chat history to the AI every time.

## Models

### Architecture

**SMART AI — Sol**

### Implementation

**FAST AI — Luna or DeepSeek Flash**

## Memory Concepts

Support:

```text
world.md
timeline.md
story-log.md
where-we-left-off.md
```

Plus:

```text
characters/
locations/
factions/
encounters/
```

Mechanical truth remains structured:

```text
game-state.json
player.json
character JSON files
```

## Sol Responsibilities

Design:

- what belongs in each memory file;
- context retrieval;
- summarization;
- NPC promotion;
- location memory;
- character memory;
- long-term continuity;
- conflict/canon handling;
- context-size control.

## where-we-left-off.md

Should remain concise and answer:

- where are we;
- who is present;
- what happened recently;
- what was the last player action;
- what immediate plot threads remain.

## NPC Persistence

Minor NPCs should not automatically become major permanent entities.

Example:

A random shopkeeper may remain inside:

```text
locations/city.md
```

If they become important, promote them into:

```text
characters/
```

## FAST AI Tasks

Use Luna / DeepSeek Flash for:

- reading/writing files;
- directory creation;
- JSON serialization;
- Markdown updates;
- save/load UI;
- basic memory plumbing.

## Success Criteria

The player can stop playing and return later while the AI understands:

- current situation;
- important characters;
- relevant history;
- major unresolved events.

---

# Phase 10 — Player Freedom Features

## Goal

Add customization and control after the core game is already functional.

## Primary Model

**FAST AI — Luna or DeepSeek Flash**

## Potential Features

- Take Control;
- control modes;
- God's Blessing;
- visible dice settings;
- DM Freedom;
- manual character creator;
- AI character creator;
- lightweight leveling;
- basic inventory;
- permadeath setting.

## General Rule

Once behavior is specified, these are usually FAST AI tasks.

Example:

> Add Take Control using the existing `controller` property.

Use Luna / DeepSeek Flash.

Example:

> Decide exactly how God's Blessing should alter randomness.

Use Sol to design the rule first.

Then FAST AI implements it.

## Success Criteria

Player can meaningfully customize how much control, difficulty, randomness, and narrative freedom they want.

---

# Phase 11 — Freeform Tactical Actions

## Goal

Allow tabletop-style actions that do not have dedicated buttons.

Example:

> Grab the loose rock and throw it at the cracked ceiling.

## Models

### Architecture

**SMART AI — Sol**

### Implementation

**FAST AI — Luna or DeepSeek Flash**

## Core Flow

```text
Player describes action
↓
AI receives:
- scene state
- nearby objects
- character abilities
- engine capabilities
↓
Can engine represent it?
  ↙          ↘
No            Yes
↓              ↓
Reject       Structured Action
                ↓
             Validator
                ↓
              Execute
```

## Core Rule

The AI may only compose actions from mechanics already supported by the engine.

It may never generate arbitrary executable code.

## Sol Responsibilities

Design:

- engine capability representation;
- structured custom-action schema;
- validation;
- security boundaries;
- primitive composition;
- failure behavior;
- interaction with environment;
- interaction with rolls.

## FAST AI Responsibilities

Build:

- custom-action input UI;
- schemas;
- validators;
- API wiring;
- execution adapters;
- result display.

## Success Criteria

At least one action with no dedicated button can be interpreted and executed entirely through existing engine primitives.

---

# Phase 12 — Expansion

## Goal

Expand only after the existing game is already fun.

## Default Model

**FAST AI — Luna or DeepSeek Flash**

## Possible Additions

- new map themes;
- new effects;
- new statuses;
- more abilities;
- more environmental objects;
- better animations;
- better VFX;
- additional enemy behaviors;
- more character creation options;
- more DM settings;
- desktop packaging;
- local model support;
- UI polish.

## Model Rule

If the existing architecture already supports the feature:

**Use Luna or DeepSeek Flash.**

Example:

> Add a warehouse tileset using the existing map-generation system.

FAST AI.

If the feature requires changing a foundational system:

**Use Sol first.**

Example:

> Add time-manipulation powers, but the existing effect system cannot represent them cleanly.

Sol designs the extension.

FAST AI implements it.

---

# 6. Phase Gates

Before moving to the next phase:

1. current phase must actually run;
2. acceptance criteria must pass;
3. typecheck must pass;
4. relevant tests must pass;
5. major known bugs must be documented;
6. `STATUS.md` must be updated;
7. architecture documentation must reflect meaningful changes.

A phase is not complete merely because code exists.

It must function.

---

# 7. Agent Scope Rules

When assigned a phase:

## Do

- inspect existing architecture first;
- read `PHASES.md`;
- read `STATUS.md`;
- preserve existing working behavior;
- implement only the requested scope;
- write tests for mechanical rules;
- update relevant documentation;
- report discovered architectural problems.

## Do Not

- implement future phases without instruction;
- redesign unrelated systems;
- create speculative abstractions;
- add features simply because they seem useful;
- introduce new frameworks without strong justification;
- optimize performance prematurely;
- create giant manager classes;
- deeply couple Phaser rendering with game mechanics.

---

# 8. Architecture Escalation Rule

If Luna or DeepSeek Flash encounters a task that requires a major architectural decision:

**Do not invent the architecture casually.**

Instead document:

1. the problem;
2. affected systems;
3. why the current architecture is insufficient;
4. possible options if obvious.

Then escalate the design decision to:

**Sol**

Once Sol defines the architecture, return implementation work to:

**Luna or DeepSeek Flash**

---

# 9. Bug Escalation Rule

Use Luna / DeepSeek Flash first for:

- type errors;
- localized state bugs;
- rendering bugs;
- broken tests;
- obvious logic mistakes;
- isolated regressions.

Escalate to Sol when:

- multiple systems disagree about state;
- ownership of logic is unclear;
- repeated fixes create new regressions;
- the same bug keeps returning;
- the fix requires changing system boundaries;
- the root problem appears architectural.

---

# 10. Priority Reminder

The game is not being built to demonstrate technical complexity.

The fun comes from:

- creating your own story;
- AI-generated encounters;
- powers;
- tactical decisions;
- environmental interaction;
- reactive characters;
- mid-fight dialogue;
- persistent consequences.

A character may be represented by a circle.

A fireball may initially be an orange shape moving across the board.

That is acceptable.

Do not delay important gameplay because visuals are primitive.

---

# 11. Core Milestone

The first major target is:

```text
Open Game
↓
Talk to AI DM
↓
Conflict Begins
↓
Play This Out
↓
School Map Loads
↓
Move Character
↓
Use Fireball
↓
Enemy Reacts
↓
Talk Back
↓
Finish Fight
↓
AI Continues Story
```

If this works and is enjoyable:

> **the project's core concept is proven.**

That should happen by the end of Phase 8.

---

# 12. Final Model Summary

## Primarily Luna / DeepSeek Flash

```text
Phase 0
Phase 1
Phase 3
Phase 4
Phase 10
Phase 12
```

## Sol Designs, Luna / DeepSeek Flash Builds

```text
Phase 2
Phase 5
Phase 6
Phase 7
Phase 9
Phase 11
```

## Both Heavily Involved

```text
Phase 8
```

## Final Rule

> **Sol decides the difficult stuff.**

> **Luna and DeepSeek Flash build most of the game.**

Do not waste Sol on boilerplate.

Do not make Luna or DeepSeek Flash invent foundational architecture when the correct design is unclear.
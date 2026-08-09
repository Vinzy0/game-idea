# Product Requirements Document  
## AI-DM Tactical RPG  
**Working title:** TBD  
**Document type:** Product Requirements + Game Design + Technical Architecture  
**Status:** Initial build specification  
**Primary platform:** Local Windows desktop  
**Core stack:** TypeScript + React + Phaser + Vite + Electron

---

# 1. Executive Summary

This project is a **single-player AI-driven roleplaying game** where an AI acts as the player's personal Dungeon Master.

Most of the game takes place through natural-language interaction with the AI DM.

The player can:

- create a character;
- describe actions freely;
- talk to NPCs;
- explore;
- build relationships;
- create their own story;
- travel;
- investigate;
- make decisions;
- recruit companions;
- fight villains;
- continue an ongoing persistent narrative.

Unlike a normal text-based AI RPG, whenever a situation benefits from physical positioning and tactical gameplay, the game can transition into a **small top-down turn-based tactical map inspired by Larian-style combat**.

The AI DM takes the current story situation and constructs the encounter using pre-existing game pieces:

- terrain tiles;
- floors;
- walls;
- props;
- hazards;
- environmental objects;
- player characters;
- enemies;
- objectives;
- spawn positions.

The player then physically plays the encounter by moving characters around a grid, attacking, using powers, interacting with objects, talking during combat, and making tactical decisions.

After the encounter ends, the battle results are given back to the AI DM.

The AI continues the story from what actually happened.

The core experience is therefore:

> **AI roleplaying game + lightweight tactical sandbox + persistent personal story.**

The tactical game does not exist to provide graphical spectacle.

It exists to let the player **physically play out important scenes instead of merely asking the AI what happened.**

---

# 2. Product Vision

The game should feel like playing with action figures, toys, or imaginary characters while having an intelligent Dungeon Master controlling the world around them.

The player should be able to think:

> "My character and his friends are walking home when a group of powered students ambush them."

and simply tell the AI that.

The game should then be capable of turning that imagination into something playable.

Example:

1. Player describes the situation.
2. AI understands the situation.
3. AI creates the encounter.
4. AI selects an appropriate map theme.
5. AI arranges existing map pieces.
6. AI determines enemy composition.
7. AI assigns goals and personalities.
8. Game validates the encounter.
9. Tactical combat begins.
10. Player physically plays the scene.
11. Characters may talk during the fight.
12. The fight ends.
13. The result becomes canon.
14. AI DM continues narrating.

The player's imagination should provide the **content**.

The engine should provide the **rules**.

---

# 3. Fundamental Design Principle

The most important architectural rule in the project is:

> **AI decides creatively. The engine decides mechanically.**

The AI is allowed to decide things such as:

- who appears;
- where the encounter takes place;
- what enemies want;
- what an NPC says;
- what map pieces should be placed;
- what an invented power is called;
- what characters are feeling;
- what narrative consequences are appropriate;
- which objectives make sense;
- whether a freeform player idea can be represented by existing game systems.

The AI is **not** trusted to arbitrarily change mechanical rules.

The deterministic engine determines:

- whether movement is legal;
- whether a target is in range;
- whether tiles are occupied;
- how much HP a character has;
- whether an ability is available;
- damage calculations;
- status effects;
- movement limits;
- pathfinding;
- action costs;
- line-of-sight rules if implemented;
- whether an object can be destroyed;
- whether an encounter layout is valid.

This produces a second core rule:

> **Player imagination → AI interpretation → engine validation → gameplay.**

---

# 4. Product Priorities

Development priorities, in order:

1. **Ease of AI-assisted development**
2. **Development speed**
3. **Narrative reactivity**
4. **Player freedom**
5. **System flexibility**
6. **Maintainable architecture**
7. **Visual clarity**
8. Performance
9. Graphical fidelity

Performance optimization is intentionally low priority.

This is a small turn-based tactical game.

The expected interaction is closer to chess than an action game:

- select character;
- select destination;
- move;
- select ability;
- select target;
- resolve result.

The game does not need sophisticated rendering to succeed.

---

# 5. Core Gameplay Loop

## 5.1 Main Loop

```text
START / LOAD STORY
        ↓
AI DM CHAT
        ↓
Player speaks / acts / explores
        ↓
AI advances story
        ↓
Does situation need tactical gameplay?
      ↙       ↘
    NO         YES
    ↓           ↓
Continue     Generate
chat         encounter
                ↓
        Tactical gameplay
                ↓
        Encounter result
                ↓
       Update world/canon
                ↓
          AI DM CHAT
```

---

# 6. Primary Game Mode

The main intended experience is **one-player AI-DM mode**.

The player controls their own main character and lives through an ongoing AI-generated story.

Examples include:

- superhero story;
- high-school students with powers;
- fantasy adventure;
- modern supernatural story;
- sci-fi campaign;
- custom player-created setting.

The engine must not hardcode any single genre.

The initial test content may use a simple "high-school characters with powers" setting because it fits the original vision, but the architecture should remain setting-agnostic.

---

# 7. Story Layer

Everything that does not require tactical positioning happens primarily through chat.

Examples:

- walking through a city;
- attending school;
- talking to friends;
- speaking with villains;
- investigation;
- shopping;
- travel;
- social scenes;
- downtime;
- story exposition;
- relationship development;
- planning;
- entering locations;
- resolving minor actions.

The game should **not** initially implement:

- physical town exploration;
- large overworld maps;
- walkable cities;
- manually rendered shops;
- traditional RPG quest hubs.

Example:

```text
AI DM:
You arrive outside Westfield High shortly after sunset.
Most of the classrooms are dark, but light is still coming
from the third-floor science room.

PLAYER:
I go inside and check the science room.
```

The AI continues the scene conversationally.

If combat begins:

```text
AI DM:
As you reach the stairwell, three masked students step out
from behind the lockers.

One of them raises his hand and electricity begins crawling
across his fingers.

[Play Tactical Encounter]
```

---

# 8. Entering Tactical Gameplay

There are two ways to enter tactical gameplay.

## 8.1 AI Suggested

The AI DM identifies that the current scene may benefit from tactical gameplay.

It offers:

**Play Tactical Encounter**

The player may accept or keep the scene narrative-only.

## 8.2 Player Requested

The player may explicitly choose:

**Play This Out**

This forces the current situation into tactical gameplay when technically possible.

Example:

```text
PLAYER:
I punch him.

AI:
You knock him backward into the lockers.

PLAYER:
No. Play this out.
```

The game then generates the encounter.

---

# 9. Encounter Scale

The engine should be optimized around small, meaningful encounters.

Target:

### Major player-side characters
**1–6**

### Major villains
**1–6**

### Additional characters
Optional minor/fodder NPCs or enemies.

Examples:

- civilians;
- henchmen;
- summoned creatures;
- guards;
- monsters;
- disposable enemies.

The engine may technically support larger encounters later, but the game should be designed primarily around **small story-focused fights**.

---

# 10. Tactical Presentation

Combat is:

- top-down;
- 2D;
- tile/grid based;
- turn based;
- visually simple.

The game should prioritize readability rather than animation quality.

Examples of acceptable early visuals:

### Sword

Character briefly moves toward enemy.

A slash appears.

Damage number displays.

### Fireball

Orange projectile travels toward target.

Orange area appears.

Explosion flashes.

Damage resolves.

### Lightning

Line appears from caster to target.

Target flashes.

Damage resolves.

These effects may initially be geometric shapes.

No complex character animation system is required.

---

# 11. Grid

Combat uses a real underlying tile grid.

The grid should not necessarily dominate the visual presentation.

Player setting:

```text
Grid Display

Off
Faint
Full
```

Default:

**Faint or Off**

Even when hidden, all movement and targeting operate using grid coordinates.

---

# 12. Turn Structure

Default action economy:

### Movement
Each character has a movement allowance.

### Action
Examples:

- attack;
- cast ability;
- throw;
- interact;
- dash;
- use special power.

### Bonus Action
Certain abilities may use a bonus action.

Not every character must have useful bonus actions.

The system should support:

```text
Movement
Action
Bonus Action
```

without attempting to duplicate the full Dungeons & Dragons action system.

Reactions may be added later if useful.

---

# 13. Character Control Modes

The player should be able to choose how many major characters they personally control.

Modes:

### My Character

Player controls only their main character.

All other characters are AI-controlled.

### My Party

Player controls their main character and party members.

### Major Characters

Player may control all major participating characters.

Minor NPCs remain AI controlled.

---

# 14. Character Controller Architecture

Control mode must not be implemented as separate combat systems.

Every combat entity has a controller property:

```text
controller:
PLAYER
AI
```

Control modes simply determine which characters begin with which controller.

This enables the feature:

# Take Control

The player may take control of an AI-controlled major character during combat.

Example:

```text
[Alex]
AI Controlled

[Take Control]
```

Selecting it changes:

```text
controller = AI
```

to:

```text
controller = PLAYER
```

This should not require restarting combat.

---

# 15. Ability System

Abilities must use a **data-driven Lego-piece architecture**.

Do not create unique hardcoded combat logic for every ability.

An ability is composed from existing engine primitives.

Example structure:

```text
Ability
- ID
- Name
- Description
- Action Cost
- Target Type
- Range
- Area
- Requirements
- Effects[]
- Presentation
```

---

# 16. Ability Effects

Initial effect primitives may include:

- damage;
- healing;
- push;
- pull;
- move;
- teleport;
- apply status;
- remove status;
- spawn entity;
- create hazard;
- destroy object;
- damage object;
- modify stat;
- area effect.

Future primitives can be added when actual gameplay requires them.

---

# 17. Ability Example

```text
Fireball

Action Cost:
Action

Target:
Tile

Range:
10 tiles

Area:
Radius 2

Effects:
- Deal Fire Damage
- Apply Burning
```

A different ability may reuse the same components.

```text
Gravity Burst

Action Cost:
Action

Target:
Tile

Range:
8 tiles

Area:
Radius 2

Effects:
- Deal Force Damage
- Push affected characters 3 tiles
```

The goal is to make the majority of new abilities **data**, not new engine code.

---

# 18. Character Creation

Two creation methods should eventually exist.

## 18.1 AI Character Creation

Player describes the character naturally.

Example:

> "He's a high-school student who can manipulate gravity.  
> He's powerful but inexperienced and mostly uses his powers
> to throw enemies around."

The AI generates:

- suggested stats;
- suggested abilities;
- ability names;
- mechanical interpretations;
- character description.

All generated mechanics must use supported engine primitives.

The player may edit the generated result.

---

## 18.2 Manual Character Creator

A deliberately simple editor.

Example:

```text
Name:
Vince

Description:
[________________________]

Stats

HP        [-] 10 [+]
Power     [-]  5 [+]
Defense   [-]  4 [+]
Movement  [-]  6 [+]

Abilities

[+] Gravity Push
[+] Gravity Well
[+] Levitate
[+] Punch
```

Stat points and ability points may be used.

The system must remain simple.

Character creation should not become a large RPG spreadsheet.

---

# 19. Progression

Progression is intentionally lightweight.

The player does not need to grind.

Suggested baseline:

```text
Level Up

+ Stat Points
+ Ability Point
```

Potential benefits:

- increase existing stats;
- learn a new ability;
- improve an ability;
- unlock another ability slot.

Exact progression formulas should be decided through playtesting.

Progression is **not** a defining feature of the product.

---

# 20. Items

Items are low priority.

The initial product should not contain:

- complex equipment optimization;
- loot rarity;
- crafting;
- elaborate weapon progression.

Items should mostly exist because the story needs them.

Examples:

- phone;
- school ID;
- backpack;
- key;
- villain's broken mask;
- strange artifact;
- sword, if a character uses one.

Inventory therefore functions mainly as **world state**.

---

# 21. Environmental Interaction

The tactical environment should support a limited but useful interaction model.

Initial categories:

### Terrain

- normal;
- difficult terrain;
- hazard;
- pit/fall location.

### Surfaces

Potentially:

- fire;
- water;
- oil;
- poison.

### Objects

Objects may have properties such as:

```text
Interactable
Destructible
Movable
Throwable
Explosive
Cover
```

Example objects:

- desks;
- rocks;
- barrels;
- windows;
- doors;
- crates;
- lockers;
- support beams.

The environment should encourage experimentation without attempting to simulate everything in Baldur's Gate 3.

---

# 22. Freeform Tactical Actions

A future/high-value feature is the ability to type an action that does not have a predefined button.

Example:

> "I grab the loose stone and throw it at the cracked ceiling
> so it collapses on the enemies."

This is handled through the AI.

The AI receives:

1. the requested player action;
2. relevant scene state;
3. nearby objects;
4. player capabilities;
5. supported engine primitives;
6. engine limitations.

The prompt conceptually asks:

> Can this action be represented using the mechanics currently
> available to the engine?

If no:

```text
possible: false
```

The game informs the player that the action cannot currently be performed.

If yes, the AI produces a structured proposed action.

Example:

```text
Pick up loose rock
→ Throw at ceiling
→ Damage ceiling

If ceiling breaks:
→ Spawn debris
→ Area damage
→ Difficult terrain
```

The game validates the proposal before executing it.

The AI may never bypass engine validation.

This feature is desirable but **not mandatory for the first vertical slice** if implementation proves disproportionately difficult.

---

# 23. Randomness and Dice

Combat may use visible rolls.

Example:

```text
Attack Chance: 75%

Roll: 61

HIT
```

Custom actions may use checks:

```text
Collapse Ceiling

Difficulty: 14
Roll: 17

SUCCESS
```

The exact mathematical system does not need to reproduce D&D.

---

# 24. God's Blessing

The player may enable a setting called:

# God's Blessing

Purpose:

The game remains random, but randomness becomes friendlier to the player.

This exists because the game is primarily a personal storytelling toybox rather than a competitive strategy game.

Default:

**Enabled**

Possible behavior:

- extremely high hit chances almost never fail;
- repeated unlucky failures increase future success likelihood;
- catastrophic failure becomes less common;
- important heroic actions receive mild hidden assistance;
- negative streaks may be corrected.

The displayed probability should remain understandable.

God's Blessing should manipulate the roll behavior rather than simply showing fake percentages.

Possible future strengths:

```text
Off
Gentle
Strong
Chosen One
```

Exact behavior should be tuned through playtesting.

---

# 25. Failure, Downing, and Death

Default behavior:

```text
0 HP → Downed
```

Possible narrative outcomes:

- unconscious;
- injured;
- captured;
- rescued;
- forced retreat;
- temporary incapacitation.

Permanent player-character death is:

**OFF by default.**

Permadeath may be enabled through settings.

Major companions and villains should also receive protection depending on DM settings.

---

# 26. DM Freedom / Narrative Authority

The player determines how much authority the AI DM has over major irreversible events.

Default behavior:

### Minor changes
AI may decide freely.

Examples:

- phone breaks;
- player gets detention;
- villain escapes;
- character gets a temporary injury;
- argument occurs;
- minor NPC becomes angry.

### Major irreversible changes
AI asks for player approval by default.

Examples:

- major character dies;
- best friend permanently betrays player;
- character permanently loses powers;
- important relationship is permanently destroyed;
- major location is permanently destroyed;
- large canon rewrite.

Suggested setting model:

```text
DM Freedom

Protected
Default
Unrestricted
```

Default should protect major story elements.

Exact naming may change.

---

# 27. AI DM

The AI DM is the central intelligence responsible for story-level creativity.

Responsibilities include:

- narration;
- NPC dialogue;
- interpreting player actions;
- deciding what happens next;
- creating minor NPCs;
- remembering relationships;
- selecting relevant world information;
- determining when tactical gameplay is appropriate;
- generating encounter specifications;
- generating combat dialogue;
- interpreting custom abilities;
- determining narrative consequences;
- continuing the story after battle.

The AI DM does **not** directly control mechanical truth.

---

# 28. Enemy Intelligence Architecture

Enemy AI is split into two layers.

## 28.1 Narrative / Strategic Intent

The LLM determines high-level intent.

Example:

```text
Mercenary Commander

Goal:
Capture Vince alive.

Personality:
Disciplined, arrogant.

Behavior:
Avoid lethal attacks against Vince.
Protect the sniper.
Retreat if only one mercenary remains.
```

---

## 28.2 Tactical AI

Normal deterministic game code executes combat.

Examples:

- determine legal moves;
- select reachable target;
- move into range;
- avoid hazards;
- seek advantageous position;
- choose usable ability;
- attack;
- retreat.

The LLM should not need to decide every tile movement every turn.

Benefits:

- faster turns;
- lower API cost;
- fewer illegal actions;
- reproducibility;
- easier debugging.

---

# 29. Combat Dialogue

Combat dialogue is a first-class feature.

Characters can speak while the tactical fight is happening.

This is essential because combat should remain part of the story rather than becoming a disconnected minigame.

Example:

```text
Vince casts Fireball.

Kael:
"You know, I've always envied something about you."

Kael moves forward.

Kael attacks Vince.

Vince takes damage.

Kael:
"Your tenacity."
```

---

# 30. Player Combat Dialogue

The player may choose:

**Talk**

Talking is normally a free action and does not consume the player's main combat action.

Example:

```text
[TALK]

PLAYER:
"Funny. I always thought you gave up too easily."
```

The AI responds as the relevant character.

Combat then continues.

---

# 31. Dialogue May Affect Combat

Most dialogue is narrative-only.

However, meaningful dialogue may trigger existing game mechanics.

Examples:

- intimidation;
- persuasion;
- surrender;
- distraction;
- emotional destabilization;
- changed enemy goal;
- retreat;
- status effect.

Example:

```text
PLAYER:
"Your men abandoned you. It's over."

Persuasion Check
Difficulty: 14

Roll: 16

SUCCESS

Enemy Status:
SHAKEN
```

The AI may suggest the consequence.

The engine determines whether the proposed mechanical effect is legal.

---

# 32. Combat Dialogue Sources

Dialogue should use a hybrid system.

## 32.1 Pre-generated / Encounter Dialogue

When the encounter is generated, the AI may prepare lines for obvious moments.

Examples:

- battle opening;
- villain introduction;
- phase transition;
- villain near defeat;
- specific story reveal.

---

## 32.2 Triggered Dialogue

The AI may react to combat events.

Examples:

- Fireball hits villain;
- companion is downed;
- player refuses to attack;
- villain reaches low HP;
- special environmental object is destroyed;
- player uses meaningful ability.

The DM should not generate dialogue after every action.

Most events should produce no dialogue.

---

## 32.3 Live Dialogue

When the player speaks unexpectedly, the AI generates a live response.

This allows genuine improvisational conversations during battle.

---

# 33. Dialogue Priority

Dialogue should have presentation priority.

Suggested levels:

```text
BARK
NORMAL
IMPORTANT
CINEMATIC
```

### BARK

Short combat line.

Displayed as speech bubble.

Does not pause combat.

### NORMAL

Longer dialogue.

May briefly pause movement.

### IMPORTANT

Pauses combat.

Presented prominently.

### CINEMATIC

Pauses combat and may include:

- player choices;
- major revelation;
- surrender opportunity;
- narrative branch;
- mechanical consequence.

---

# 34. Map Generation Philosophy

The AI does **not** generate graphical maps pixel-by-pixel.

The AI assembles an encounter from approved existing pieces.

Example categories:

### Themes

- school;
- classroom;
- cafeteria;
- hallway;
- street;
- house;
- rooftop;
- warehouse;
- forest;
- laboratory.

### Pieces

- floor;
- wall;
- door;
- cover;
- desk;
- crate;
- rock;
- window;
- stairs;
- hazard;
- elevated tile;
- decorative prop.

---

# 35. Map Generation Flow

```text
Current Story Scene
        ↓
AI Encounter Planner
        ↓
Structured Map Specification
        ↓
Map Validator
        ↓
Valid?
  ↙          ↘
No            Yes
↓              ↓
Repair /     Load
Regenerate   Encounter
```

---

# 36. Map Specification

Example conceptual structure:

```text
Map:
16 x 12

Theme:
school_cafeteria

Floor:
cafeteria_tile

Objects:
table at 4,5
table at 7,5
table at 10,5
counter at 13,3
door at 2,10

Player Spawns:
2,8
3,8

Enemy Spawns:
12,3
13,4
11,5

Objective:
Defeat attackers
```

Actual implementation should use structured JSON rather than free text.

---

# 37. Map Validator

A deterministic validator checks the AI-generated map.

Initial checks:

- all coordinates are inside bounds;
- characters do not spawn inside obstacles;
- major characters have valid spawn tiles;
- important objectives are reachable;
- essential doors/exits are not blocked;
- opposing characters exist in connected playable regions;
- map contains sufficient walkable area;
- objects do not overlap illegally;
- map size stays within configured limits.

Invalid encounters should be repaired or regenerated automatically.

The validator does not decide whether the map is creatively good.

It only ensures that it is mechanically playable.

---

# 38. Scenario Specification

An encounter should be represented by structured data.

Conceptual fields:

```text
ScenarioSpec

- ID
- Title
- Narrative Context
- Theme
- Map Spec
- Participants
- Player Control Assignments
- Enemy Intent
- Objectives
- Environmental Objects
- Dialogue Hooks
- Special Conditions
```

The tactical engine should be capable of running a ScenarioSpec without needing the LLM again.

---

# 39. Battle Result

When tactical combat ends, the engine creates a structured result.

Example:

```text
Result:
Victory

Vince:
12 / 30 HP
Burned

Alex:
Downed, later stabilized

Enemies:
4 defeated
Commander escaped

Environment:
Warehouse partially burned
North exit destroyed

Important Actions:
Vince used Gravity Well on Commander
Alex protected Vince from sniper
Commander escaped through loading bay
```

The AI DM receives this result.

The AI then narrates what happens next.

---

# 40. Post-Battle Flow

Example:

```text
AI DM:

Smoke rolls through the warehouse as Alex slowly pushes
himself back onto his feet.

Through the shattered loading-bay door, you catch one last
glimpse of Kael disappearing into the alley.

A trail of blood leads in the same direction.

What do you do?
```

The player returns to normal chat interaction.

No separate town or overworld system is required.

---

# 41. Persistence Philosophy

The game maintains two different categories of information.

# Structured Mechanical State

Stored as JSON or another typed structured format.

Used for exact game truth.

Examples:

- HP;
- stats;
- abilities;
- status effects;
- inventory;
- levels;
- controller state;
- relationships where numeric values matter.

# Narrative Memory

Stored as Markdown.

Used by the AI DM.

Examples:

- history;
- personality;
- story events;
- relationships;
- locations;
- lore;
- summaries;
- unresolved plot threads.

Markdown should never be the authoritative source for exact combat calculations.

---

# 42. Save Structure

Conceptual local save structure:

```text
saves/
└── <story-name>/
    │
    ├── game-state.json
    ├── world.md
    ├── timeline.md
    ├── story-log.md
    ├── where-we-left-off.md
    │
    ├── player/
    │   ├── player.json
    │   └── player.md
    │
    ├── characters/
    │   ├── alex.json
    │   ├── alex.md
    │   ├── kael.json
    │   └── kael.md
    │
    ├── locations/
    │   ├── city.md
    │   ├── school.md
    │   └── warehouse-district.md
    │
    ├── factions/
    │   └── black-sun.md
    │
    └── encounters/
        ├── 001-school-ambush.md
        ├── 002-rooftop-fight.md
        └── ...
```

Exact directory layout may change during implementation.

The conceptual separation should remain.

---

# 43. where-we-left-off.md

This is a dedicated short-term continuation file.

Its job is to tell the AI exactly what was happening when the previous session ended.

Example:

```text
# Current Situation

Vince and Alex have just defeated Kael's men on the
school rooftop.

Kael escaped.

Alex is injured but conscious.

It is approximately 8 PM.

Vince discovered a blood trail leading toward the eastern
stairwell.

# Last Player Decision

Follow the blood trail.

# Immediate Unresolved Threads

- Where did Kael go?
- Why did he attack the school?
- Who helped him enter the building?
```

This file should remain concise.

It should be updated whenever the immediate story state changes meaningfully or the player exits.

---

# 44. story-log.md

Records meaningful events over time.

This is more detailed than the current-state summary.

Example:

```text
## Session 14

- Vince confronted Kael on the school rooftop.
- Kael revealed that he had been tracking Alex.
- Three Black Sun members attacked.
- Alex was knocked unconscious.
- Vince defeated the attackers.
- Kael escaped.
```

The story log provides historical context without forcing the AI to reread every individual chat message.

---

# 45. timeline.md

Contains major canonical events.

It should be concise and chronological.

Example:

```text
September 4
Vince first discovered his gravity powers.

September 19
Kael disappeared.

October 2
Black Sun attacked Westfield High.
```

---

# 46. Location Memory

Minor characters and details should remain attached to locations when possible.

Example:

```text
# Greyhaven

## Minor NPCs

Harold
Owns the corner convenience store.

Mina
Works evenings at the café near Westfield High.
```

A minor seller or cashier does not need a dedicated permanent character object.

---

# 47. NPC Promotion

New NPCs begin temporary unless clearly important.

Lifecycle:

```text
Temporary NPC
      ↓
Appears / becomes relevant
      ↓
Major narrative importance?
  ↙              ↘
No                Yes
↓                  ↓
Store summary     Promote
under location    to Major Character
```

Promoted characters receive:

- persistent ID;
- character JSON;
- character Markdown;
- relationship memory;
- important history.

This prevents the save system from accumulating thousands of meaningless permanent entities.

---

# 48. AI Context Retrieval

The AI should not receive the entire story history on every request.

Context should be selected according to relevance.

Typical DM context:

1. system/game rules;
2. current player;
3. `where-we-left-off.md`;
4. relevant current location;
5. active major characters;
6. recent story log entries;
7. relevant long-term memories;
8. current conversation.

This architecture should support long-running stories without uncontrollable context growth.

---

# 49. AI Provider Architecture

The AI layer must be provider-agnostic.

The game should use an internal interface such as:

```text
AIProvider
- generateNarrative()
- generateStructured()
- generateDialogue()
```

The rest of the application must not depend directly on one provider's SDK.

Potential providers may include:

- OpenAI;
- Anthropic;
- Gemini;
- local models;
- future APIs.

A provider adapter translates the common internal interface to the selected API.

---

# 50. Structured AI Outputs

Any AI request that affects mechanics must return structured data.

Examples:

- character creation;
- ability generation;
- encounter creation;
- map generation;
- freeform tactical actions;
- proposed mechanical consequences.

Narrative prose may remain freeform text.

Structured responses must be validated against schemas before use.

Invalid structured responses should:

1. be automatically repaired when possible;
2. be regenerated if repair fails;
3. never directly mutate mechanical state before validation.

---

# 51. Technical Stack

## Language

**TypeScript**

Reason:

One primary language across UI, game logic, AI integration, validation, and desktop application.

---

## UI

**React**

Used for:

- AI chat;
- menus;
- settings;
- character creator;
- character sheets;
- ability screens;
- save selection;
- story log;
- dialogue panels;
- dice presentation.

---

## Tactical Renderer

**Phaser 4**

Used for:

- tilemaps;
- tactical board rendering;
- sprites/tokens;
- camera;
- input;
- simple animation;
- visual effects;
- combat presentation.

Phaser is a renderer/game framework, not the authority for game rules.

Core combat rules should remain in TypeScript modules that can be unit tested independently of the renderer.

---

## Development

**Vite**

Used for fast local development and hot reload.

---

## Desktop Wrapper

**Electron**

The application remains local-first.

Electron allows the final application to run like a normal Windows desktop program while retaining the TypeScript/web stack.

It also makes direct local save-file management straightforward.

During development, the renderer may be run directly in the browser for faster iteration.

---

# 52. Local-First Requirement

The game does not require:

- Vercel;
- public hosting;
- a domain;
- multiplayer servers;
- a cloud backend.

Game code, assets, and saves should remain local.

Internet access is only required when using a remote AI provider.

If a local model provider is configured, the game may potentially operate completely offline.

---

# 53. High-Level Application Architecture

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

---

# 54. Architectural Boundary: Tactical Engine vs Phaser

Do not put core game rules directly into Phaser scenes.

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

---

# 55. Core Data Entities

Initial conceptual entities:

```text
Character
Ability
Effect
StatusEffect
Item
Scenario
MapSpec
MapObject
Objective
CombatState
StoryState
Location
Faction
Relationship
EncounterResult
```

Do not introduce additional abstraction unless required.

Avoid excessive manager classes and circular systems.

---

# 56. Character Data

Conceptual:

```text
Character

id
name
description
portrait

stats
abilities
statuses

controller

level
abilityPoints

narrativeRole
importance

aiIntent
personalityRef
```

Narrative details may reference separate Markdown memory.

---

# 57. Tactical State

Combat state should be serializable.

Example:

```text
CombatState

turn
phase

characters[]
map
objectives[]

activeCharacter
playerControlledCharacters[]

combatLog[]
```

This allows:

- debugging;
- save/resume;
- deterministic tests;
- replay analysis later.

---

# 58. Tactical AI

Initial tactical AI should be deliberately simple.

Potential evaluation:

1. check usable offensive ability;
2. check whether target is in range;
3. move into range if necessary;
4. prefer valid target based on AI intent;
5. avoid dangerous tiles when reasonable;
6. execute ability;
7. end turn.

Do not attempt sophisticated machine-learning tactical AI.

The fun comes from the story and powers.

---

# 59. Narrative Event Bus

Important tactical events should be emitted as structured events.

Examples:

```text
ABILITY_USED
CHARACTER_DAMAGED
CHARACTER_DOWNED
OBJECT_DESTROYED
CHARACTER_MOVED
CHARACTER_SPOKE
TURN_STARTED
TURN_ENDED
OBJECTIVE_COMPLETED
COMBAT_ENDED
```

These events can be used by:

- UI;
- combat log;
- dialogue system;
- AI DM;
- scenario triggers.

This is especially important for reactive mid-combat dialogue.

---

# 60. Combat Dialogue Event Flow

Example:

```text
Fireball resolves
      ↓
ABILITY_USED event
      ↓
Villain reaches 45% HP
      ↓
Dialogue evaluator
      ↓
Is this narratively meaningful?
  ↙              ↘
No                Yes
↓                  ↓
Continue          AI dialogue
combat            request
                      ↓
                Speech bubble
```

Dialogue should not block every action.

---

# 61. User Interface

Primary application view should make switching between narrative and tactical modes feel natural.

## Narrative Mode

Main components:

- AI DM conversation;
- player text input;
- character summary;
- optional party list;
- current objective/context;
- quick buttons such as **Play This Out**.

## Tactical Mode

Main components:

- battlefield;
- current character;
- movement/action information;
- abilities;
- Talk button;
- End Turn;
- optional combat log;
- character portraits/HP;
- dialogue bubble/box.

---

# 62. Tactical Controls

Initial interaction should be simple.

### Movement

1. Click player character.
2. Valid movement range appears.
3. Click destination.
4. Character moves.

### Ability

1. Click ability.
2. Valid targets/tiles highlight.
3. Click target.
4. Resolve.

### Talk

1. Click Talk.
2. Type dialogue.
3. AI responds.
4. Combat continues.

No complex control scheme is required.

---

# 63. Settings

Initial settings may include:

### Gameplay

- Grid visibility
- Permadeath
- Dice visibility
- God's Blessing
- DM Freedom
- Combat difficulty

### AI

- Provider
- Model
- API key configuration
- response verbosity if desired

### Presentation

- dialogue presentation;
- animation speed;
- auto-advance dialogue.

Exact settings UI may evolve.

---

# 64. Combat Difficulty

Combat difficulty should remain separate from narrative freedom.

Possible presets:

```text
Story
Normal
Hard
Custom
```

May affect:

- enemy HP;
- enemy damage;
- enemy tactical quality;
- encounter enemy counts;
- roll modifiers.

The goal is not competitive balance.

---

# 65. Out of Scope for Initial Development

Do not build these early:

- multiplayer;
- MMO systems;
- physical overworld;
- open-world streaming;
- complex 3D;
- realistic physics;
- advanced crafting;
- large economy;
- loot rarity systems;
- massive skill trees;
- hunger;
- survival systems;
- housing;
- base building;
- voice acting;
- procedural 3D terrain;
- hundreds of manually animated powers;
- high-end graphical effects;
- console support.

---

# 66. Full Product Vision vs First Playable Build

The PRD describes the intended product.

The first implementation must be much smaller.

The project should prove the central fantasy before expanding.

---

# 67. V0.1 Vertical Slice Goal

V0.1 should prove one complete loop:

```text
CREATE CHARACTER
        ↓
TALK TO AI DM
        ↓
AI CREATES CONFLICT
        ↓
GENERATE SMALL MAP
        ↓
TACTICAL BATTLE
        ↓
MID-FIGHT DIALOGUE
        ↓
BATTLE ENDS
        ↓
RESULT GIVEN TO AI
        ↓
STORY CONTINUES
```

If this loop is fun, the project is viable.

---

# 68. V0.1 Required Features

## Narrative

- AI DM chat;
- one persistent story;
- basic story log;
- `where-we-left-off.md`;
- player character memory.

## Character

- one player character;
- simple stats;
- several abilities;
- basic AI-created character option or predefined test character.

## Combat

- grid;
- movement;
- turns;
- action;
- optional bonus-action infrastructure;
- attack;
- abilities;
- HP;
- downed state;
- visible rolls.

## Map

One initial environment theme:

**School**

Example pieces:

- floor;
- wall;
- door;
- desk;
- locker;
- obstacle;
- simple hazard.

## Enemies

At least:

- melee enemy;
- ranged enemy;
- powered enemy.

## AI

- scenario generation;
- enemy intent;
- post-battle narration;
- combat dialogue.

## Dialogue

- AI combat bark;
- player Talk button;
- live response.

## Persistence

- JSON mechanical state;
- Markdown current situation;
- story log.

---

# 69. V0.1 Nice-to-Have Features

If implementation is straightforward:

- Take Control;
- multiple party characters;
- basic environmental destruction;
- map validator;
- ability creation;
- AI-generated abilities;
- God's Blessing;
- DM Freedom setting.

---

# 70. Explicitly Not Required for V0.1

- freeform tactical actions;
- procedural map-generation sophistication;
- multiple tilesets;
- full leveling;
- inventory complexity;
- large stories;
- dozens of abilities;
- advanced tactical AI;
- fancy animation;
- polished art.

---

# 71. Suggested Development Order

## Phase 1 — Mechanical Board

Build without AI.

1. Render grid.
2. Place character token.
3. Select character.
4. Show movement tiles.
5. Move character.
6. Add second character.
7. Add turns.
8. Add HP.
9. Add basic attack.

Success condition:

**Two tokens can fight to completion.**

---

## Phase 2 — Ability Lego System

1. Create Ability schema.
2. Create Effect schema.
3. Implement damage.
4. Implement heal.
5. Implement push.
6. Implement status.
7. Implement area targeting.
8. Create Fireball.
9. Create simple powered abilities.

Success condition:

**New abilities can mostly be created through data.**

---

## Phase 3 — Enemy Tactical AI

1. Add AI controller.
2. Select target.
3. Move into range.
4. Attack.
5. Use abilities.

Success condition:

**Player can fight AI enemies without scripting individual turns.**

---

## Phase 4 — Environment

1. Add obstacles.
2. Add doors.
3. Add destructible object.
4. Add hazard.
5. Add object targeting.

Success condition:

**Environment affects tactical decisions.**

---

## Phase 5 — AI DM

1. Add AI provider abstraction.
2. Add chat.
3. Provide character context.
4. Save narrative.
5. Resume story.

Success condition:

**Player can maintain a persistent AI story.**

---

## Phase 6 — Encounter Generation

1. Define ScenarioSpec.
2. Prompt AI to create scenario.
3. Validate schema.
4. Construct test map.
5. Spawn participants.
6. begin combat.

Success condition:

**Text story can become a playable encounter.**

---

## Phase 7 — Combat Dialogue

1. Add combat event system.
2. Add Talk action.
3. Add AI responses.
4. Add speech bubbles.
5. Add triggered villain dialogue.

Success condition:

**Characters can meaningfully talk while fighting.**

---

## Phase 8 — Return to Story

1. Generate EncounterResult.
2. Send result to AI.
3. Update story log.
4. Update `where-we-left-off.md`.
5. Continue chat.

Success condition:

**Complete story → combat → story loop works.**

---

# 72. V0.1 Acceptance Test

The following scenario should work from beginning to end.

### Setup

Player creates:

> Alex, a high-school student who can create fire.

AI converts this into simple stats and powers.

### Story

AI DM introduces the player at school.

Player continues chatting.

Eventually:

> Three masked students confront Alex in the hallway.

Player selects:

**Play Tactical Encounter**

### Encounter Generation

AI generates:

- school hallway;
- lockers;
- desks;
- player spawn;
- three enemies;
- enemy goals.

Validator accepts map.

### Fight

Player:

- moves;
- attacks;
- casts Fireball;
- takes damage;
- talks to enemy.

Villain responds dynamically.

Enemy moves and attacks.

Player wins.

### Result

Engine produces structured battle result.

AI DM receives it.

AI continues:

> The final attacker collapses beside the lockers...

Story log is updated.

`where-we-left-off.md` is updated.

Player may continue chatting.

If this works reliably, the project has achieved its first major milestone.

---

# 73. Engineering Principles for AI-Assisted Development

Because most code will be created using coding agents, the repository should be unusually explicit.

Requirements:

- small modules;
- clear naming;
- few hidden abstractions;
- typed schemas;
- comments only where behavior is non-obvious;
- tests around mechanics;
- deterministic validation;
- architecture documentation;
- no unnecessary frameworks;
- no premature optimization.

Avoid:

- giant manager classes;
- deeply nested inheritance;
- implicit global state;
- logic mixed into render components;
- duplicated ability logic;
- dozens of special-case scripts.

The project should be easy for an AI agent to inspect and modify without reconstructing the architecture every session.

---

# 74. Suggested Repository Documentation

Repository should eventually contain:

```text
README.md
ARCHITECTURE.md
GAME_RULES.md
AI_CONTRACTS.md
STATUS.md
```

### README.md

How to run the project.

### ARCHITECTURE.md

System boundaries and modules.

### GAME_RULES.md

Current mechanical rules.

### AI_CONTRACTS.md

AI inputs, outputs, schemas, and responsibilities.

### STATUS.md

What currently works, what is broken, and what should be built next.

This is especially useful for future coding-agent sessions.

---

# 75. Major Risks

## Risk: AI produces invalid game content

Mitigation:

- structured schemas;
- validators;
- limited primitives;
- repair/regeneration.

## Risk: AI forgets story history

Mitigation:

- persistent Markdown memory;
- current-state summary;
- relevance-based context retrieval;
- major character files.

## Risk: Tactical engine becomes overengineered

Mitigation:

- small grid;
- simple action economy;
- data-driven abilities;
- minimal physics.

## Risk: AI codebase becomes messy

Mitigation:

- modular architecture;
- strict system boundaries;
- tests;
- architecture documentation;
- phased development.

## Risk: Map generation becomes too difficult

Mitigation:

- begin with small templates;
- pre-made map pieces;
- simple placement;
- deterministic validator;
- improve generation only after core loop works.

## Risk: Live AI dialogue slows combat

Mitigation:

- pre-generated dialogue;
- event-triggered dialogue;
- live API only when needed;
- asynchronous non-critical barks where appropriate.

---

# 76. Features That Define the Game

The project should be considered successful if it delivers these experiences:

### 1. Personal AI Dungeon Master

The player can create and continue their own story naturally.

### 2. Story Becomes Playable

Important conflicts can turn into actual tactical encounters.

### 3. Flexible Powers

Characters may have unusual abilities without requiring bespoke coding for every ability.

### 4. Reactive Combat Dialogue

Characters remember the story and speak during fights.

### 5. Persistent Canon

What happens in battle affects the ongoing story.

### 6. Player Freedom

The player chooses how much control, difficulty, randomness, and narrative authority they want.

---

# 77. Product Identity

This game is **not**:

- Baldur's Gate 3 generated by AI;
- a full D&D simulator;
- a traditional visual RPG;
- an open-world game;
- a tactical game with AI text pasted on top.

It is:

> **An AI Dungeon Master with a lightweight tactical board attached to it, allowing players to physically play out the battles and dramatic scenes in their own imagined stories.**

Another useful description:

> **Chess with superpowers, characters, persistent story, and an AI DM.**

The combat is deliberately mechanically readable.

The AI-generated context around that combat is what turns simple actions into meaningful story moments.

A fireball does not need advanced graphics.

It matters because:

- who threw it;
- who was hit;
- why they are fighting;
- what happened before;
- what the villain says afterward;
- what consequences follow.

---

# 78. Final Development Rule

Whenever choosing between:

### A complicated system that theoretically supports everything

and

### A simple system that supports the current fantasy

choose the simple system.

Do not build systems because Baldur's Gate, D&D, Unity games, or conventional RPGs normally have them.

Build them only when this game needs them.

The project's strongest feature is not graphical complexity or simulation depth.

It is the ability to say:

> "This is the story I want to play."

and have the game answer:

> "Okay. Let's play it."
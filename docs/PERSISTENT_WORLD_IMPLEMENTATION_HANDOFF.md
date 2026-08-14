# Implementation Handoff — Persistent AI World With an Always-On 32x32 Board

**Decision status:** Product and architecture decisions are settled. Implementation is the remaining work.

**Supersedes:** The old assumption that narrative mode and combat mode are separate screens, and the old Phase 6-9 story -> encounter -> story sequencing where it conflicts with this document.

**Does not supersede:** The engine/renderer boundary, provider-neutral AI boundary, deterministic validation rules, authority approval rules, completed Phase 0-5 behavior, or phase-gate requirements.

---

## 1. Instruction to the implementing model

Implement this handoff in order. Do not reopen product or architecture decisions unless current code proves a stated design technically impossible. If that happens, document the exact conflict and choose the smallest compatible change.

Before editing:

1. Read `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/AI_CONTRACTS.md`, `docs/GAME_RULES.md`, and this handoff.
2. Inspect the current working tree. Phase 4.5 and Phase 5 work is currently uncommitted on `master` at `8b71b0f`; preserve all of it.
3. Run the existing verification gate before changing behavior.
4. Work phase by phase. Do not implement later-phase features early.
5. Update authoritative docs and `docs/STATUS.md` at every completed gate.

Verification command for Vitest if default workers hang:

```powershell
npx vitest run --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=verbose
```

---

## 2. Final product direction

The game is a local-first AI roleplaying game with one permanent 2D play area.

- The board is always present after the world is created.
- Every playable scene is exactly **32x32 tiles**.
- A scene represents one local area: a classroom, lab, house floor, hallway section, courtyard, street section, or similar space. It does not have to be one literal room.
- Exploration, interaction, dialogue, and combat happen on the same board.
- Exploration uses free click-to-move tile movement.
- Combat activates turn-based rules on the same scene and with the same actors and objects.
- Combat ending returns the board to exploration. The Phaser game is not destroyed or replaced.
- Exits connect scenes. Traveling loads another saved 32x32 scene into the same board.
- Unknown destinations are generated once, validated, assigned local stable IDs, saved, and reused forever.
- Existing destinations load from saved state and are never regenerated.
- The AI creates the larger world just in time. The game does not simulate unloaded scenes.
- Characters, locations, factions, facts, relationships, events, and scene changes persist as canon.
- Mechanical truth remains deterministic. AI output is always an untrusted proposal.

Core loop:

```text
Create world
-> Generate and save initial scene
-> Explore on board
-> Talk / inspect / interact
-> Travel through an exit
-> Load saved scene or generate one new scene
-> Conflict starts on the same board
-> Turn-based combat
-> Commit mechanical result
-> Continue exploring and talking
-> Save all durable changes
```

---

## 3. Scope boundaries

### Build now

- one active local world save;
- linked persistent 32x32 scenes;
- one active scene at a time;
- one player character;
- school theme only;
- template-guided scene generation;
- exploration movement;
- object interaction;
- scene travel;
- peaceful and combat dialogue;
- combat on the same board;
- structured encounter result;
- durable structured canon;
- deterministic Demo behavior;
- JSON export/import;
- camera pan, zoom, and player focus.

### Explicitly defer

- seamless scrolling between scenes;
- background simulation of unloaded scenes;
- multiplayer;
- procedural pixel art or raw AI tile maps;
- elevation, stairs between z-levels, line of sight, and cover;
- NPC schedules and ambient autonomous movement;
- arbitrary AI-created abilities or stats;
- arbitrary AI-created map-object kinds;
- reinforcements spawning during a scene;
- multiple save slots before the single-save loop is proven;
- cloud saves;
- embeddings/vector databases;
- voice;
- Electron packaging until the browser vertical slice works;
- inventory, equipment, leveling, crafting, and economy;
- retreat, surrender, capture, and permanent death in the first core loop;
- freeform actions that require mechanics the engine does not already expose.

---

## 4. Non-negotiable architecture rules

1. **AI decides creatively; deterministic code decides mechanically.**
2. Phaser renders state and routes input. It does not own movement legality, effects, interaction legality, combat rules, save state, or AI decisions.
3. React owns application presentation and request lifecycle, not tactical mechanics.
4. Provider SDKs, provider response types, credentials, and API keys remain outside the browser-facing game domains.
5. AI output is parsed into domain-specific types, validated, and compiled before mutation.
6. The AI never supplies authoritative IDs for new records. Local code assigns IDs with `crypto.randomUUID()` after validation.
7. The AI never directly changes HP, positions, statuses, action resources, object HP/open state, combat phase, or outcomes.
8. Structured JSON is authoritative for world canon and mechanics. Markdown summaries are derived AI memory.
9. Existing saved scenes are patched from deterministic events. They are never regenerated to reflect a new prompt.
10. Every generation or AI turn is atomic: either the complete validated result is committed once or the save remains unchanged.

---

## 5. Runtime architecture

Use these layers:

```text
React App Shell
  - always-on board layout
  - story/dialogue panel
  - selected-entity panel
  - request, retry, approval, import/export UI

World Session
  - active WorldSave
  - current scene ID
  - save revision and serialized write queue
  - AI operation lifecycle
  - scene transition orchestration

Scene Engine
  - current 32x32 scene mechanics
  - exploration movement and interaction
  - combat turns and effects
  - structured mechanical events
  - framework-neutral subscriptions

World Domain
  - characters, locations, factions, facts, threads
  - scenes and exits
  - canonical patches and validators
  - scene compiler

AI Domain Adapters
  - world bootstrap
  - scene generation
  - world turn
  - dialogue
  - repair request

Persistence Adapter
  - IndexedDB now
  - JSON export/import
  - Electron filesystem adapter later

Phaser Board Renderer
  - static map layers
  - actors and objects
  - selection and range overlays
  - camera pan/zoom/focus
```

Do not create a giant global manager. Keep world transforms, validators, reducers, and compilers as pure functions. The session hook/service may orchestrate them.

---

## 6. Scene engine decisions

Evolve `TacticalEngine` into a scene-capable engine while preserving its public mechanical boundaries and tests.

### Phases

Use:

```ts
type ScenePhase =
  | 'EXPLORATION'
  | 'PLAYER_TURN'
  | 'ENEMY_TURN'
  | 'VICTORY'
  | 'DEFEAT';
```

- New persistent scenes start in `EXPLORATION`.
- The existing combat demo explicitly starts in `PLAYER_TURN` so old behavior remains testable.
- `VICTORY` and `DEFEAT` remain visible result phases until the application acknowledges the result.
- Acknowledging victory returns the same engine and scene to `EXPLORATION`.
- Initial defeat behavior is Retry only: restore the pre-combat checkpoint. Accepting narrative defeat is deferred.

### Teams

Extend teams to:

```ts
type Team = 'PLAYER' | 'ENEMY' | 'NEUTRAL';
```

- Player and current allies use `PLAYER`.
- Hostile combatants use `ENEMY`.
- Peaceful NPCs use `NEUTRAL`.
- Neutral actors are not combat participants and cannot be targeted by combat abilities in the first version.
- Combat start receives explicit participant IDs and requires at least one living `PLAYER` and one living `ENEMY` participant.
- Victory/defeat checks only explicit combat participants, not every actor in the scene.
- Target-team semantics are explicit: `ALLY` means the caster's own team; `ENEMY` means Player targets Enemy and Enemy targets Player; `ANY` means either Player or Enemy. Neutral actors are excluded from all three filters in the first version.
- Area resolution also excludes Neutral actors. Fireball and every other radius effect may visually overlap a Neutral actor, but cannot damage, heal, push, or apply a status to them. They remain visible and continue blocking movement. This is an explicit vertical-slice protection rule; escort/protect/bystander mechanics require making that actor an explicit combat participant in a later phase.

### Exploration movement

Add a dedicated command:

```ts
moveExplorationUnit(unitId, x, y): boolean
```

Rules:

- valid only in `EXPLORATION`;
- only a living `PLAYER`-controlled unit may use it;
- destination must be reachable by the same collision and path-cost rules used in combat;
- no movement allowance or action is consumed;
- units and blocking objects still block movement;
- the command moves along the computed path; animation is presentation only;
- movement does not activate exits automatically unless the user explicitly clicked that exit;
- abilities are disabled in exploration for the first version;
- neutral/enemy ambient movement is deferred.

### Exploration interaction

Reuse engine-owned interaction legality, but exploration interaction consumes no Action. Combat interaction continues to cost one Action.

Add phase-aware validation instead of duplicating adjacency checks in React or Phaser.

### Combat start and completion

Add:

```ts
startCombat(spec: CombatStartSpec): boolean
acknowledgeVictory(): boolean
restoreCombatCheckpoint(): boolean
```

`CombatStartSpec` contains only existing scene actor IDs, explicit participant IDs, and the single supported objective `DEFEAT_ALL_HOSTILES`.

On start:

- validate participants and objective;
- snapshot the complete pre-combat scene;
- initialize turn resources for participants;
- set `PLAYER_TURN`;
- emit `COMBAT_STARTED`.

On victory:

- preserve all resulting HP, statuses, positions, destroyed objects, and door state;
- generate `EncounterResult` from the event log and final engine state;
- application commits the scene and result;
- `acknowledgeVictory()` returns to `EXPLORATION`.

On defeat:

- preserve the result only for display;
- Retry restores the pre-combat checkpoint exactly;
- no defeat state becomes canon in this vertical slice.

### Mechanical events

Every successful engine command emits ordered structured events with a monotonically increasing per-scene sequence number:

```ts
type SceneEventType =
  | 'UNIT_MOVED'
  | 'ABILITY_USED'
  | 'CHARACTER_DAMAGED'
  | 'CHARACTER_HEALED'
  | 'CHARACTER_DOWNED'
  | 'STATUS_APPLIED'
  | 'OBJECT_INTERACTED'
  | 'OBJECT_DESTROYED'
  | 'TURN_STARTED'
  | 'TURN_ENDED'
  | 'COMBAT_STARTED'
  | 'COMBAT_ENDED'
  | 'EXIT_USED';
```

Events contain stable IDs and factual numeric before/after values. Human-readable log strings become presentation derived from these events. Do not parse existing log text to construct results.

`SceneEvent` and `WorldEvent` are different layers:

- `SceneEvent` is fine-grained mechanical evidence for the active scene/encounter: movement, damage, ability use, turn changes, interaction, and destruction.
- `WorldEvent` is durable meaningful history: scene discovered/entered, reciprocal link created, combat result committed, major object destruction, approved canon change, or story thread resolution.
- Ordinary movement, damage ticks, selection, and turn changes never enter the permanent world event log.
- The active encounter retains its ordered `SceneEvent` list. `EncounterResult` selects the important subset. Only the committed result and explicitly meaningful consequences become `WorldEvent` records.

---

## 7. Board and camera decisions

### Map and rendering size

- Every generated/persistent scene is exactly `32x32`.
- Base tile size is `32px`, making the world map `1024x1024px` at zoom 1.
- The board viewport is responsive and fills the available main pane.
- Phaser camera bounds match the 1024x1024 map.
- Initial zoom fits the map to the viewport, clamped to `0.5-1.5`.
- Mouse wheel zooms toward the pointer.
- Middle-button or right-button drag pans.
- WASD and arrow keys pan when text input is not focused.
- `F` focuses the camera on the player.
- Changing scenes focuses the player at the arrival position.
- Left click remains reserved for board selection, movement, targets, objects, and exits.

### Renderer structure

Replace the current full-board redraw-on-any-change approach with:

- static floor/grid layer;
- static or rarely changed object layer;
- actor layer;
- selection/range/target overlay;
- labels/dialogue overlay.

Keep these as clean logical layers, but do not implement dirty rectangles or per-tile incremental rendering without profiling evidence. Redraw the complete 1,024-tile floor layer when a scene changes and redraw the complete object layer when its revision changes. Update actors and overlays from engine subscriptions. A 32x32 scene is only 1,024 tiles and does not require chunk streaming.

The Phaser game remains mounted across exploration, combat, and scene transitions. Load new scene data into the existing scene/renderer.

---

## 8. Application UI decisions

Remove the `Narrative DM` / `Combat Demo` tabs from the production flow.

Desktop layout:

```text
+-----------------------------+------------------+
|                             | Story / Dialogue |
|     Always-on board         | Selected details |
|                             | World context    |
|                             | Text input       |
+-----------------------------+------------------+
| Context-sensitive action / combat HUD          |
+------------------------------------------------+
```

- Use a responsive two-column layout: board uses remaining width; right panel is `360px`.
- App height is `100dvh`; avoid whole-page scrolling around the board.
- Below `900px`, board is on top at `60vh` and the right panel moves below it.
- Before world creation, show a dim empty board behind the setup form so the play area remains visually central.
- Right panel has three tabs: `Story`, `Details`, `World`.
- Story contains transcript and input.
- Details shows the selected actor, object, or exit and its available actions.
- World shows current location, known connections, current situation, and unresolved threads.
- Exploration HUD shows selected character, Inspect/Interact/Talk when applicable, and camera help.
- Combat HUD retains movement, abilities, Interact, Talk, and End Turn.
- Loading overlays do not unmount or hide the board.

Natural-language input does not move tokens or mutate objects in the first version. Positional movement uses the board; object interaction uses validated engine commands. Freeform mechanical interpretation belongs to Phase 11.

---

## 9. Persistent world data model

Use one IndexedDB record containing one versioned active world snapshot. Normalize records by stable ID inside that snapshot.

```ts
interface WorldSaveV2 {
  schemaVersion: 2;
  saveId: 'active';
  revision: number;
  createdAt: number;
  updatedAt: number;
  playerCharacterId: string;
  currentSceneId: string;
  story: PersistedStoryState;
  world: WorldCanon;
  scenes: Record<string, SceneRecord>;
  events: WorldEvent[];
  activeEncounter: ActiveEncounterRecord | null;
  settings: GameSettings;
}
```

`ActiveEncounterRecord` stores the participant IDs, objective, current combat phase, selected unit/ability, exact turn resources, ordered combat events, next event sequence, start time, and the complete pre-combat checkpoint required by Retry. Character HP/status/position and scene object state remain authoritative in their normal records rather than being duplicated.

- Persist after every completed public combat command.
- `endTurn()` and the synchronous enemy-turn sequence persist as one completed transition, not after each internal enemy step.
- On reload with an active encounter, reconstruct the engine from current character/scene records plus `ActiveEncounterRecord` and resume the exact turn.
- A victory remains an active completed encounter until its `EncounterResult` and post-battle canon commit succeed; then clear `activeEncounter` and return to exploration.
- A defeat remains active until Retry restores the checkpoint; then clear `activeEncounter`.

### World canon

```ts
interface WorldCanon {
  id: string;
  title: string;
  premise: string;
  setting: string;
  tone: string;
  currentTimeLabel: string;
  characters: Record<string, CharacterRecord>;
  locations: Record<string, LocationRecord>;
  factions: Record<string, FactionRecord>;
  relationships: Record<string, RelationshipRecord>;
  facts: CanonFact[];
  threads: StoryThread[];
}
```

Rules:

- A `LocationRecord` is a conceptual place such as Westfield High.
- A `SceneRecord` is one playable 32x32 area within a location, such as the science laboratory.
- A character's mechanical state has one authoritative home in `CharacterRecord`, including current scene, position, HP, statuses, controller, team, and ability IDs.
- Scene records do not duplicate character HP or stats. Present actors are derived by `currentSceneId`.
- A scene owns map objects, terrain, exits, template identity, description, discovery timestamps, and scene revision.
- Facts are append-only records with stable IDs and source event/request IDs.
- Threads have `OPEN` or `RESOLVED` status. Resolving creates an event; it does not erase history.
- Relationships have a stance enum plus a short narrative summary. Exact numeric relationship simulation is deferred.

### Scene records

```ts
interface SceneRecord {
  id: string;
  locationId: string;
  title: string;
  description: string;
  theme: 'SCHOOL';
  templateId: SchoolTemplateId;
  width: 32;
  height: 32;
  objects: PersistedMapObject[];
  terrain: GridPosition[];
  exits: SceneExit[];
  revision: number;
  discoveredAt: number;
  lastVisitedAt: number;
}
```

### Scene exits

```ts
interface SceneExit {
  id: string;
  label: string;
  position: GridPosition;
  arrivalPosition: GridPosition;
  destinationSceneId: string | null;
  destinationExitId: string | null;
  destinationHint: string;
  destinationScope: 'SAME_LOCATION' | 'NEW_LOCATION';
}
```

- Exit tiles are walkable markers rendered above the floor.
- Arrival positions are separate walkable tiles adjacent to the marker.
- Activating an exit is explicit. Ordinary movement onto its tile does not travel.
- A known linked exit loads its destination directly.
- An unknown exit starts scene generation.
- New scene generation commits both directions of the link atomically.
- A failed/cancelled generation leaves the source exit unlinked.

### Limits

- maximum 16 actors in one scene;
- maximum 8 enemies;
- 1-4 exits;
- maximum 128 map objects after template compilation;
- maximum 10 new facts and 5 new threads per AI operation;
- user-facing summaries: 2,000 characters each;
- names: 80 characters;
- descriptions: 1,500 characters;
- world event log remains append-only during the vertical slice; Phase 9 adds archival summaries.

---

## 10. Persistence decisions

### Browser storage

- Use native IndexedDB.
- Database: `ai-dm-tactical-rpg`.
- Object store: `world-saves`.
- Key: `active`.
- Store the complete `WorldSaveV2` snapshot in one record. The vertical slice is small enough; normalization occurs inside the object.
- Game/domain code depends only on a persistence-adapter interface; it never imports IndexedDB APIs. This permits later scene/event sharding without redesigning gameplay state.
- Every write increments `revision` and `updatedAt`.
- Serialize writes through one promise queue so older saves cannot overwrite newer saves.
- Save immediately after AI commits, scene generation, scene transitions, exit linking, combat start/end/actions, destroyed or changed objects, approvals, and imports.
- Ordinary exploration position may debounce persistence by 2 seconds.
- Flush pending exploration position before scene transitions, combat start, AI operations that include scene state, `visibilitychange`, and `pagehide`.
- Storage errors are visible and retryable. Never claim a save succeeded when it did not.

The single-record design is a known vertical-slice boundary. Reassess storage sharding when any one of these is true: more than 50 discovered scenes, serialized save larger than 5 MB, or measured p95 save time above 100 ms. At that point, split scenes and archived events behind the same persistence adapter.

### Migration from Phase 5 localStorage

- Do not delete the Phase 5 localStorage record during migration.
- If IndexedDB is empty and a valid Phase 5 story exists, import its player, DM context, transcript, situation, and threads into an uninitialized `WorldSaveV2` draft.
- Show `Create Playable World` and generate the first scene.
- Commit the new IndexedDB save only after bootstrap generation validates.
- Keep the legacy record as a recovery backup for this release.

### Import/export

- Add `Export Save` to download `*.aidm-save.json`.
- Add `Import Save`; parse and fully validate before replacing the active save.
- Invalid imports do not modify the current save.
- Import displays the world title, revision, and updated timestamp before confirmation.
- Electron filesystem folders and automatic backups are deferred until browser behavior is proven.

### Corruption behavior

- Never silently discard a corrupt IndexedDB save.
- Show a recovery screen with: retry read, import backup, export raw record if readable, or explicitly reset.
- Reset requires typed/explicit confirmation and only removes the `active` record.

---

## 11. Initial content catalogs

The first physical theme is only `SCHOOL`.

The Phase 8 core loop requires three approved 32x32 templates:

1. `school_hallway_v1`
2. `school_classroom_v1`
3. `school_science_lab_v1`

Implement `school_hallway_v1` first. Add classroom and science lab only after the compiler, parser, Demo bootstrap, and first gate work. Defer `school_cafeteria_v1`, `school_courtyard_v1`, and `school_office_v1` to Expansion as ordinary content additions.

Each template defines:

- immutable 32x32 base objects and terrain;
- one entry socket;
- 1-4 named exit sockets;
- player arrival position per entry socket;
- named neutral spawn slots;
- named hostile spawn slots;
- object/prop slots where optional approved prop packages may be placed;
- a template validation test proving all required sockets connect.

Do not ask the AI for 1,024 tiles or arbitrary coordinates. The AI chooses valid catalog IDs and named slots supplied in the request.

Initial actor templates:

- `player_fire_student_v1`: 16 HP, movement 3, Punch, Fireball, Force Push;
- `civilian_student_v1`: 4 HP, movement 3, no combat abilities, Neutral;
- `student_brawler_v1`: 3 HP, movement 2, Punch, Enemy;
- `firebrand_v1`: 3 HP, movement 2, Fireball and Punch, Enemy.

The AI may provide names, appearance, personality, narrative role, intent, and dialogue hooks. It may only select an actor template ID for mechanics.

---

## 12. AI contracts and atomic authority

Keep the generic `AIProvider`, but add domain parsers and typed application requests over `generateStructured()` and `generateDialogue()`.

### World bootstrap

Input:

- player setup;
- school setting constraint;
- available templates, actor templates, sockets, and limits.

Output `WorldBootstrapDraft`:

- world title and premise;
- opening situation and narration;
- initial location proposal;
- initial scene draft;
- initial NPCs/facts/threads.

The application validates, assigns all permanent IDs, compiles the scene, and commits one complete `WorldSaveV2`.

### Scene generation

`SceneGenerationRequest` includes:

- request ID;
- current world digest;
- source location and scene summaries;
- source exit destination hint and scope;
- relevant known character/location IDs;
- complete allowed catalog for the school theme;
- validation limits.

`SceneDraft` contains:

- title and description;
- `SCHOOL` theme;
- one allowed template ID;
- one valid entry socket ID;
- for `SAME_LOCATION`, the source location ID; for `NEW_LOCATION`, a bounded proposed location title and summary that local code turns into a new `LocationRecord`;
- 0-3 additional exit proposals using allowed exit socket IDs;
- actor proposals using allowed actor template and spawn slot IDs;
- existing canon references only from IDs supplied in the request;
- opening narration;
- bounded new facts and threads.

New items use temporary references local to the response. The compiler replaces them with locally generated permanent IDs.

### World turn

Persistent-world mode should use one structured `WorldTurnPlan` so narration and canon changes validate and commit atomically. Do not show narration and then attempt a second best-effort canon extraction call.

`WorldTurnPlan` contains:

- narration;
- updated situation;
- unresolved-thread changes;
- a bounded `CanonPatch`;
- optional major irreversible approval proposal;
- optional `START_COMBAT` directive referencing actors already present in the scene.

Allowed canon operations:

- add fact;
- add or resolve thread;
- update a character's narrative summary;
- update a relationship stance/summary;
- update a location narrative summary.

Forbidden operations:

- set HP or position;
- add/remove status;
- open/destroy/spawn an object;
- change abilities or stats;
- create a new actor in the active scene;
- create a new scene except through scene generation;
- link exits directly;
- declare combat outcome;
- reference unknown IDs.

Major irreversible proposals extend Phase 5 approval behavior to include a pending canon patch. Under `PROTECTED` and `DEFAULT`, do not apply the patch until approval. Under `UNRESTRICTED`, apply it with a visible system record.

### Validation and retry

For every structured request:

1. enforce a 30-second timeout and support user cancellation;
2. parse unknown JSON defensively;
3. validate schema, string/array limits, ID references, catalog IDs, and semantic rules;
4. compile and run deterministic scene/engine validation before mutation;
5. if invalid, send one repair request containing the exact errors and original request ID;
6. if repair also fails, leave state unchanged and show Retry plus `Use Safe Fallback` for scene generation;
7. safe fallback creates an empty `school_hallway_v1` with only the reciprocal exit and no new NPCs or facts;
8. never automatically commit fallback without the player's click.

Use request IDs and expected save revisions. A late or duplicate response must not commit if its operation is cancelled, already committed, or based on an obsolete revision.

### Demo provider

The deterministic Demo provider must support:

- valid bootstrap generation;
- at least three linked school scene types;
- one existing-scene reload path;
- one peaceful NPC;
- one conflict with brawlers and a firebrand;
- world-turn narration and one approval proposal;
- exploration and combat dialogue;
- deterministic invalid-draft fixtures in tests, not in normal play.

It must remain unmistakably labeled `Demo`.

---

## 13. Scene validation and compilation

Validation order:

```text
Unknown provider data
-> strict domain parser
-> catalog/reference validator
-> deterministic scene compiler
-> 32x32 scene validator
-> existing validateEncounterSetup mechanical guard
-> atomic commit
```

Required scene checks:

- dimensions are exactly 32x32;
- template, actor template, socket, and slot IDs are allowlisted;
- no duplicate socket or spawn-slot use;
- all coordinates are integers and in bounds after compilation;
- no illegal object overlap;
- no actor spawn inside a blocker or another actor;
- entry arrival is walkable;
- every exit marker and arrival tile is walkable;
- flood fill from entry reaches every exit arrival and every actor spawn;
- at least 35% of tiles are walkable;
- there is at least one reachable 4x4 open area;
- 1-4 exits;
- actor/object limits are respected;
- all existing-ID references were supplied in request context;
- reciprocal exit can be created;
- `validateEncounterSetup()` returns no errors for the compiled mechanical configuration.

Creative quality is not a validator concern. Mechanical playability is.

---

## 14. Travel behavior

When the player explicitly activates an exit:

### Known destination

1. Flush current scene/save writes.
2. Validate linked destination and reciprocal exit.
3. Move the player character's `currentSceneId` and position to the destination arrival position.
4. Update `lastVisitedAt` and append `EXIT_USED`.
5. Persist atomically.
6. Load destination into the existing engine/renderer and focus camera.

### Unknown destination

1. Flush source scene.
2. Set transient UI state to generating; do not mutate canon.
3. Generate, parse, repair if necessary, compile, and validate the destination.
4. Assign local stable IDs.
5. Add the destination scene/location/characters/facts.
6. Link source and destination exits in both directions.
7. Move the player to destination arrival.
8. Commit the complete transition in one IndexedDB revision.
9. Load the new scene and show opening narration.

Cancellation or failure leaves the player in the source scene with the exit still unlinked.

---

## 15. Dialogue decisions

Dialogue works in exploration and combat through the same right-side Story panel.

### Player-initiated dialogue

- Player selects a visible actor, presses Talk, and submits text.
- Talking costs no combat Action.
- Only one dialogue request may be in flight.
- There is no hard per-turn limit for player-initiated Talk.
- Context includes current scene summary, speaker/target records, current phase, recent dialogue, relevant facts/relationships, and recent meaningful mechanical events.
- Player-initiated Talk uses `generateStructured()` and returns a validated `DialogueTurnPlan` containing one speaker line plus an allowed `CanonPatch`; it cannot mutate mechanics.
- Invalid/failing dialogue leaves engine state unchanged and is retryable.

### Triggered dialogue

Use deterministic trigger selection before calling AI. Eligible triggers:

- combat opening;
- named character first falls to 50% HP or lower;
- character downed;
- important object destroyed;
- combat ending.

Limits:

- maximum one triggered line per round;
- maximum three triggered lines per encounter, excluding opening/end lines;
- same speaker cannot trigger twice in consecutive rounds;
- most engine events produce silence;
- provider failures never pause or fail combat.
- Triggered barks use `generateDialogue()` and are prose-only. They never carry canon or mechanical patches.

### Presentation priorities

- `BARK`: speech bubble, no pause;
- `NORMAL`: panel plus bubble, no mechanical pause;
- `IMPORTANT`: input temporarily disabled while displayed, engine state unchanged;
- `CINEMATIC`: reserved and not implemented in the vertical slice.

Mechanical consequences of persuasion/intimidation are deferred to the validated freeform-action system. Dialogue prose alone never changes mechanics.

---

## 16. Encounter result and story continuation

Build `EncounterResult` only from engine state and structured events:

```ts
interface EncounterResult {
  id: string;
  sceneId: string;
  outcome: 'VICTORY' | 'DEFEAT';
  participantIds: string[];
  survivors: Array<{ characterId: string; hp: number; maxHp: number }>;
  downedCharacterIds: string[];
  destroyedObjectIds: string[];
  finalPositions: Record<string, GridPosition>;
  objective: 'DEFEAT_ALL_HOSTILES';
  objectiveCompleted: boolean;
  importantEvents: SceneEvent[];
  startedAt: number;
  endedAt: number;
}
```

Important events are deterministically selected: combat start/end, ability uses, downings, object destruction, and the final five damage events. Do not ask the AI to summarize facts before the structured result exists.

Victory flow:

1. Engine reaches `VICTORY`.
2. Build and save `EncounterResult` plus final scene mechanics.
3. Send result to a structured world-turn request.
4. Validate returned narration/canon patch.
5. Commit once and acknowledge victory.
6. Return same board to exploration.

If post-battle narration fails, the mechanical victory remains saved. Show Retry; request ID prevents duplicate canon updates.

Defeat flow in the vertical slice:

1. Engine reaches `DEFEAT`.
2. Show factual result.
3. Offer Retry Encounter.
4. Restore the exact pre-combat checkpoint.
5. Do not write defeat into canon.

---

## 17. Memory and continuity decisions

Minimal continuity begins in Phase 6 through structured canon and saved scenes. Phase 9 adds long-term AI-facing memory, not the first durable world model.

Phase 9 creates derived Markdown documents inside the save/export model:

- `world.md`;
- `timeline.md`;
- `story-log.md`;
- `where-we-left-off.md`;
- `characters/<id>.md`;
- `locations/<id>.md`;
- `factions/<id>.md`;
- `encounters/<id>.md`.

Rules:

- JSON records remain authoritative.
- Markdown is regenerated or updated from committed JSON/events.
- A Markdown contradiction never overrides JSON.
- `where-we-left-off.md` stays under 1,500 characters and contains current scene, present characters, latest player action, recent event, and open threads.
- Context retrieval is deterministic first: current scene/location, present characters, active threads, last 20 events, then explicitly referenced entities.
- No vector database in the first memory version.
- Full transcript is not sent on every request.
- Context builder enforces a character/token budget and logs which records were selected for debugging.
- Minor NPCs stay summarized under their location until they recur in three scenes or are explicitly marked important; then promote them to full character memory.

---

## 18. Player-freedom decisions

Phase 10 implements only the following settled features.

### Take Control

- Allied characters have `controller: PLAYER | AI`.
- Player may toggle an allied AI character to Player control from Details.
- Outside combat it applies immediately.
- During combat it applies at the next `PLAYER_TURN` boundary.
- Hostile and Neutral actors cannot be taken over.
- Shared simultaneous control is not implemented.

### Visible rolls

- Phases 6-9 remain fully deterministic. Do not use `Math.random()` as a temporary placeholder anywhere in mechanics.
- Phase 10 introduces the game's first mechanical randomness.
- Add optional `accuracy` to abilities; absent means 100 and preserves existing behavior.
- Use a persisted seeded PRNG, never `Math.random()` in mechanics.
- Roll d100; success occurs when roll is less than or equal to displayed effective chance.
- Effective chance is clamped to 5-95 for ordinary checks; explicit automatic effects remain 100 and do not roll.
- Record seed counter, chance, roll, and result in structured events.

### God's Blessing

- Default is `GENTLE`.
- It affects player rolls only.
- The bonus is included in the displayed effective chance; probabilities are never fake.
- On failed player rolls, add to a persisted luck meter. On success, reset that character's meter to zero.
- Strengths:
  - `OFF`: +0, cap 0;
  - `GENTLE`: +5 per failure, cap +15;
  - `STRONG`: +10 per failure, cap +25;
  - `CHOSEN_ONE`: +15 per failure, cap +40.
- Enemy rolls receive no blessing.

### DM Freedom

Keep existing `PROTECTED`, `DEFAULT`, and `UNRESTRICTED` semantics. Extend approval proposals to carry canon patches. Do not create a second authority setting.

### Character creation

- Manual and AI-assisted creation produce the same validated schema.
- First version fields: name, pronouns, appearance, personality, archetype, and one actor-template package.
- AI creation may fill narrative fields but may only choose allowed actor templates.
- No AI-created raw stats or custom ability definitions.

Inventory, leveling, equipment, and permadeath remain deferred to Expansion.

---

## 19. Freeform tactical-action decisions

Phase 11 supports structured composition of existing public engine commands only.

Allowed AST:

```ts
type CustomActionStep =
  | { kind: 'MOVE'; unitId: string; destination: GridPosition }
  | { kind: 'USE_ABILITY'; casterId: string; abilityId: string; target: AbilityTarget }
  | { kind: 'INTERACT'; unitId: string; objectId: string };

interface CustomActionPlan {
  possible: boolean;
  explanation: string;
  steps: CustomActionStep[]; // maximum 3
}
```

Rules:

- AI receives a capability manifest and only IDs visible/relevant to the player.
- No arbitrary effect primitive, code, script, object spawn, direct damage, direct status, or direct state patch.
- Validate the entire plan against a cloned engine state before presenting it.
- Show a plain-language preview and exact resource costs.
- Require player confirmation.
- Execute atomically. If any step becomes invalid, execute none.
- In combat, normal movement/actions/bonus actions are consumed.
- In exploration, `MOVE` and valid interaction use exploration rules.
- The proving example is a combined command with no dedicated button, such as: “Move beside the door and open it.”
- Actions requiring unsupported mechanics return `possible: false` with a short explanation.

---

## 20. Revised implementation phases

### Phase 6A — Always-on 32x32 board

Implement:

- production app layout with permanent board;
- responsive camera and 32px tiles;
- 32x32 scene support;
- static/dynamic render-layer separation;
- exploration phase, movement, and interaction;
- Neutral team and explicit combat participants;
- structured scene events;
- preserve Combat Demo as a development fixture, not a production tab.

Gate:

- player explores a 32x32 school scene;
- camera pan/zoom/focus works;
- player opens a door in exploration without spending an Action;
- combat starts on that board, resolves, and returns to exploration without recreating Phaser;
- existing mechanics still pass.

### Phase 6B — World save and scene graph

Implement:

- `WorldSaveV2` domain and validators;
- IndexedDB adapter and serialized writes;
- Phase 5 migration path;
- export/import and corruption UI;
- characters, locations, scenes, exits, facts, threads, events;
- deterministic known-scene travel.

Gate:

- move between two linked scenes;
- reload app and return to exact scene, player position, door/object state, HP, and canon;
- invalid import cannot overwrite valid save.

### Phase 6C.1 — Catalog and compiler foundation

Implement only:

- initial actor catalog;
- `school_hallway_v1`;
- named sockets/slots;
- deterministic compiler;
- compiled 32x32 mechanical validation;
- no AI/provider call.

Gate: compile a fixed fixture into a valid playable 32x32 hallway with player, Neutral civilian, hostiles, objects, entry, and exits. Invalid catalog/slot references fail without producing engine state. Stop and review.

### Phase 6C.2 — Scene draft contract

Implement only:

- bootstrap and scene-draft TypeScript schemas;
- defensive parsers;
- string/count/reference/slot validators;
- local ID assignment and temporary-reference resolution;
- fixed valid and invalid fixtures;
- no provider integration.

Gate: a valid fixture parses, receives local stable IDs, compiles, and passes mechanical validation; malformed/unknown/oversized drafts fail closed with actionable errors. Stop and review.

### Phase 6C.3 — Deterministic Demo bootstrap

Implement only:

- Demo `WorldBootstrapDraft`;
- initial location/world records;
- initial hallway generation;
- one atomic `WorldSaveV2` commit;
- loading the generated world into the always-on board.

Gate: create a new Demo world, receive opening narration, and explore the generated/saved hallway after reload. No real provider is involved. Stop and review.

### Phase 6C.4 — Demo expansion through unknown exits

Implement:

- `school_classroom_v1` and `school_science_lab_v1` one at a time;
- deterministic Demo scene generation;
- unknown-exit request lifecycle;
- atomic reciprocal linking;
- return travel and no-regeneration behavior;
- cancellation/failure rollback.

Gate: use an unknown exit to create a second scene, return to the unchanged first scene, revisit the second without a new generation call, and preserve all links/state across reload. Stop and review.

### Phase 6C.5 — Gateway-backed AI and repair/fallback

Implement:

- gateway-backed structured bootstrap/scene requests using the existing provider boundary;
- timeout, cancellation, stale-revision, and duplicate-response handling;
- one targeted repair attempt;
- explicit user-selected safe fallback;
- provider contract tests with a controlled HTTP test server/fixture. Do not require a production vendor credential in browser tests.

Gate: valid gateway output follows the same compiler path as Demo output; invalid output repairs once; a second failure leaves state unchanged and offers Retry/Fallback; stale/late responses cannot commit. Stop and review.

### Phase 6C.6 — World turns and canon patches

Implement:

- `WorldTurnPlan`;
- allowed `CanonPatch` operations;
- deferred approval patches;
- revision/request idempotency;
- deterministic Demo paths and gateway contract tests.

Gate: one narrative turn atomically commits narration and a valid minor canon patch; a major patch waits for approval; invalid/unknown-ID patches commit neither prose nor canon. Stop and review.

### Phase 7 — In-scene dialogue

Implement:

- selection and Talk in exploration/combat;
- bounded dialogue context;
- structured dialogue/canon patches;
- trigger filters, limits, bubbles, and priorities;
- Demo dialogue paths.

Gate:

- speak to a peaceful NPC;
- begin combat on same board;
- receive one meaningful triggered line;
- Talk to a combatant;
- combat continues after response/failure.

### Phase 8 — Continuous core loop

Implement:

- conflict directives;
- encounter checkpoint and result;
- victory continuation and retryable post-battle narration;
- defeat retry;
- full loading/error/idempotency handling;
- vertical-slice browser QA.

Gate:

```text
Create character/world
-> explore initial 32x32 school scene
-> speak to NPC
-> generate/travel to linked scene
-> conflict starts there
-> move/use Fireball/talk
-> win
-> same board returns to exploration
-> AI continues from exact result
-> reload and recover exact world
```

At this gate, the core game exists.

### Phase 9 — Long-term memory

Implement derived Markdown memory, deterministic retrieval, summaries, canon-conflict checks, NPC promotion, event archival, and debugging visibility for selected context.

Gate: resume an older world after substantial generated history without sending the whole transcript; AI correctly identifies location, present characters, recent event, and open threads.

### Phase 10 — Player freedom

Implement Take Control, seeded visible rolls, God's Blessing, authority patch approvals, and manual/AI-assisted character setup as specified above.

### Phase 11 — Freeform actions

Implement the bounded AST, cloned-state validation, preview/confirmation, atomic execution, and impossible-action response.

### Phase 12 — Expansion

Prioritize in this order:

1. cafeteria, courtyard, office, more school templates, and then new themes;
2. persistence sharding when the 50-scene / 5-MB / 100-ms threshold is reached;
3. more abilities and status rule modifiers;
4. additional objectives, retreat, surrender, and accepted defeat;
5. inventory, leveling, equipment, and permadeath;
6. NPC ambient behavior and schedules;
7. art, animation, VFX, and sound;
8. Electron packaging and folder-backed saves;
9. local-model provider;
10. multiple save slots and richer save management.

Use the existing architecture for content additions. Require an architecture review before adding a mechanic the current engine primitives cannot represent.

### Execution-control rule

Never authorize the entire handoff as one coding task. Start with Phase 6A only. Stop at its gate, run the full verification suite, perform browser QA, update docs/status, and review the result before authorizing Phase 6B. Apply the same stop-and-review rule to 6B and every 6C sub-phase.

---

## 21. Required tests

At minimum, add tests for:

- 32x32 template validity and reachability;
- camera-independent pointer-to-tile conversion under pan/zoom;
- exploration movement and interaction;
- Neutral actors excluded from combat;
- Neutral actors ignored by direct and area effects, including Fireball splash;
- explicit participant victory checks;
- engine event ordering and before/after facts;
- fine-grained `SceneEvent` records do not leak into durable `WorldEvent` history;
- known and unknown exit transitions;
- reciprocal link atomicity;
- generation cancellation, timeout, stale revision, duplicate response, repair, and fallback;
- scene compiler allowlists and slot validation;
- save revision ordering and write serialization;
- reload fidelity;
- Phase 5 migration;
- corrupt IndexedDB and import rejection;
- approval proposal with deferred canon patch;
- world patch unknown-ID rejection;
- dialogue throttling and provider failure;
- encounter result derivation and post-battle retry idempotency;
- deterministic seeded rolls and blessing meter;
- no mechanical `Math.random()` usage before Phase 10;
- custom-action cloned-state validation and atomicity.

Do not validate mechanical behavior only through React or Phaser tests. Keep pure domain/engine tests primary and add focused integration/browser tests.

---

## 22. Phase gate for every milestone

Before marking a phase complete:

1. required behavior works in the browser;
2. relevant deterministic tests pass;
3. full test suite passes;
4. typecheck passes;
5. lint passes;
6. production build passes;
7. browser QA has no unexpected warnings/errors;
8. persistence/reload is verified where relevant;
9. architecture, AI contracts, game rules, and roadmap are updated;
10. `docs/STATUS.md` records what is complete, exact verification, known boundaries, and the next phase.

Do not call a phase complete because schemas or code exist. The user-visible loop must run.

---

## 23. Final acceptance statement

The pivot is proven when a player can inhabit a persistent AI-created world through an always-visible 32x32 board: explore one saved area, talk to a remembered character, generate and travel to another linked area, fight on that same board, preserve the exact mechanical result, return to exploration, reload the application, and find the world unchanged and contextually remembered.

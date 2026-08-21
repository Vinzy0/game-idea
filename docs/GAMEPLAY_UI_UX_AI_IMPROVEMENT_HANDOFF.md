# Gameplay, UI/UX, Visuals, and Live-AI Improvement Handoff

Recorded: 2026-08-21

Repository: `C:\Users\vinzp\Documents\Game Idea`

Branch: `codex/phase-6a-persistent-world`

Baseline at time of writing: `b1cd165`

## Purpose

The V0.1 loop works, but it still presents like an engineering prototype. The next product milestone is to make it feel like a game: gameplay becomes the focus during encounters, interactions become obvious, actors and environments become visually recognizable, abilities gain readable animation, and the existing provider-neutral AI contract connects to a real trusted model gateway.

This document records the product feedback, research direction, licensing rules, execution plan, and a self-contained implementation prompt for another model.

## Current Worktree Warning

Before starting, inspect `git status` and preserve all existing changes.

At the time this handoff was written, a separate uncommitted Known Bug #1 fix existed in:

- `src/app/GameCanvas.tsx`
- `src/game/rendering/CombatScene.ts`
- `docs/qa/v01-acceptance/05-midfight-talk-villain-bubble.png`

Those changes repair the disappearing combat speech bubble by stabilizing the Phaser lifecycle and cleaning scene subscriptions. Do not reset, discard, rewrite, or accidentally combine them with an unrelated redesign commit.

## Product Feedback, Organized

### 1. Make gameplay the visual focus

- Center and enlarge the tactical board.
- During an encounter, give the board roughly 70-80% of the usable space.
- Move story/context into a collapsible secondary drawer during combat.
- Keep narrative mode chat-focused, but switch to a game-first layout when combat starts.
- Make turns, objectives, the selected unit, resources, and abilities readable without searching through panels.

### 2. Redesign the UI

- Replace the dashboard-like presentation with a coherent game HUD.
- Establish a deliberate palette, typography scale, spacing system, icon style, borders, shadows, focus states, and animation timing.
- Put abilities in a bottom action bar.
- Use compact unit, turn, resource, and objective panels.
- Improve responsive behavior at desktop and narrow widths.
- Preserve accessibility, contrast, focus visibility, and reduced-motion support.

### 3. Improve selection and targeting UX

When a unit is selected:

- show a strong animated selection ring;
- show its portrait, name, HP, movement, Action, Bonus Action, statuses, and abilities;
- highlight reachable tiles and legal targets;
- explain invalid clicks rather than silently ignoring them;
- synchronize selection between Phaser and React;
- support Escape/Cancel.

When an ability is selected:

- enter an explicit targeting mode;
- show a short instruction such as `Choose a target`;
- preview range, area, affected actors/objects, effect, and action cost;
- use a deliberate preview/confirmation step for destructive area abilities;
- make invalid targets visually distinct and explain why they are invalid.

### 4. Improve turn flow

Do not blindly end the turn after every attack. The current engine separates Movement, Action, and Bonus Action, so the player may still have meaningful choices.

Recommended behavior:

- If no meaningful legal action remains, auto-end after a short visible countdown with a Cancel option.
- If actions remain, emphasize End Turn and say what is still available.
- Add an optional Auto-End Turn setting.
- Clearly announce Player Turn, Enemy Turn, Victory, and Defeat.
- During enemy turns, focus the camera on the acting unit and show what it chose.

### 5. Replace dots and squares with reusable visuals

- Introduce recognizable humanoid sprites for player, ally, melee enemy, and powered enemy roles.
- Support reusable body/outfit/palette/accessory combinations without hardcoding gender as a game rule.
- Add portraits for story, inspection, and combat-dialogue surfaces.
- Replace geometric environment placeholders with coherent floor, wall, door, desk, locker, barrel, hazard, and exit art.
- Retain team rings, HP bars, and status markers for tactical readability.
- Provide a graceful fallback sprite for unknown/generated actors.

### 6. Add readable combat animation

- Movement tweening along the actual engine-approved path.
- Punch lunge and impact.
- Fireball projectile, trail, impact flash, radius burst, damage numbers, and destroyed-object feedback.
- Force Push displacement and impact.
- Hit flash, small optional camera shake, downed animation, and turn transitions.
- Speech bubbles must remain attached to animated actors.

Animations are presentation only. They must never determine legality, damage, targets, positions, costs, victory, or any other game rule.

### 7. Connect a real AI

The browser-side contract already exists:

- `src/ai/provider.ts`
- `src/ai/httpGateway.ts`
- `src/ai/factory.ts`

What is missing is the trusted gateway behind that adapter.

Required direction:

- Add a local/server-side gateway that accepts the existing `{ kind, request }` envelope.
- Support `narrative`, `structured`, and `dialogue` requests.
- Initially support one configured cloud provider plus an OpenAI-compatible/local endpoint.
- Keep provider credentials only in server environment variables.
- Never store secrets in `VITE_*`, browser storage, or client bundles.
- Validate and normalize every model response.
- Add timeouts, bounded retries, size limits, useful errors, and a health/test-connection endpoint.
- Add Demo/Live mode, model label, connection status, and Test Connection UI.
- Preserve deterministic encounter validation and mechanical authority.

Streaming, voice, and image generation are valuable later, but they should not expand the first gateway milestone.

### 8. General polish

- Tooltips and keyboard shortcuts.
- Readable combat log and objective display.
- Hover, focus, pressed, disabled, loading, retry, empty, and error states.
- Sound-effect hooks with independent volume control.
- Smooth story-to-encounter and encounter-to-story transitions.
- Clear saving/provider status.
- Browser QA at desktop and narrow sizes.

## Recommended Visual Asset Strategy

Start with legally simple reusable assets rather than generating an entire art direction immediately.

1. Use a small coherent subset of Kenney CC0 assets for the first visual pass.
2. Create an asset manifest with semantic IDs, source, author, license, atlas key, and file path.
3. Add `ASSET_CREDITS.md` and `THIRD_PARTY_NOTICES.md` even when attribution is optional.
4. Make the renderer consume semantic IDs such as `student-fire`, `masked-bruiser`, and `powered-volt`, not scattered filenames.
5. Once the pipeline works, generated assets may replace placeholders through the same manifest.

If Google Flow or another generator is used later, create an original cohesive sheet with transparent backgrounds, a fixed top-down angle, consistent proportions/palette, and idle/walk/cast/hurt/downed poses. Record the model/tool and provenance. Do not request recognizable copyrighted characters or unlicensed imitation assets.

## Comparable Projects and What to Learn

### Aikami

Repository: <https://github.com/BearlySleeping/aikami>

License: MIT

Useful ideas:

- game-first spatial 2D presentation rather than a chatbot dashboard;
- one `AiProviderGateway` abstraction for local, BYOK, and planned hosted modes;
- optional image and voice services without making them boot requirements;
- strict typed engine/UI bridge;
- reusable character/expression pipeline.

MIT code may be reused only while preserving its copyright and license notice.

### MythWeaver

Repository: <https://github.com/xavibonell/mythweaver>

License status observed during research: no root license found

Useful ideas:

- deterministic mechanics with an LLM directing meaning rather than numbers;
- semantic scene briefs compiled through typed composition and geometry layers;
- curated tile library as the source of visual vocabulary;
- generate once, validate, then freeze the scene;
- Phaser as the renderer behind a deterministic world contract.

Treat this as architecture inspiration only unless the project publishes a usable license or grants permission.

### DungeonGPT-JS

Repository: <https://github.com/EdwardAThomson/DungeonGPT-JS>

License: Apache-2.0

Useful ideas:

- character onboarding;
- provider/model configuration;
- local-first saves and optional cloud synchronization;
- memory/retrieval;
- clear separation of code, generated portraits, and third-party notices.

Apache-licensed code requires preserving the applicable license and notices.

### Athena Crisis

Repository: <https://github.com/nkzw-tech/athena-crisis>

License: MIT code; campaign, art, music, and content excluded

Useful ideas:

- modern tactical action and targeting UX;
- reusable design-system organization;
- readable turn state and selected-unit presentation;
- JavaScript/TypeScript patterns closer to this project than Unity/Godot examples.

Do not copy its excluded art or content.

### Godot Tactical RPG

Repository: <https://github.com/ramaureirac/godot-tactical-rpg>

License: MIT

Useful ideas:

- camera behavior;
- grid selection feedback;
- controller support;
- move/attack flow;
- modular tactical components.

The engine differs, so independently reproduce interaction patterns rather than transplanting Godot code.

### The Battle for Wesnoth

Repository: <https://github.com/wesnoth/wesnoth>

License: GPL-2.0-or-later for code; art is GPL and/or CC-BY-SA

Useful ideas:

- tactical readability;
- strong selection/turn language;
- unit and terrain silhouettes;
- readable movement and attack feedback;
- sprite animation scope appropriate for a tactical game.

Study it, but do not import code or art unless the project deliberately accepts the corresponding GPL/ShareAlike obligations.

### Kenney Assets

Official source: <https://kenney.nl/assets>

License: CC0 on official asset pages

Kenney is the preferred first source for reusable characters, top-down props, RPG tiles, UI, icons, and effects. Attribution is optional, but recording provenance is still recommended.

## Licensing Policy

Private use alone is not a universal permission to copy protected code or assets.

Practical rules:

- A public GitHub repository without a license is viewable, not automatically reusable.
- MIT, Apache-2.0, BSD, and CC0 material can generally be reused when their conditions are followed.
- GPL material may be studied and used under the GPL; distributing a combined/derived work can trigger source and same-license obligations.
- Code, art, music, fonts, models, story content, and trademarks can have different licenses inside the same repository.
- Copy feature ideas through independent implementation whenever possible.
- Record the exact source and license before adding any third-party file.
- Never rely only on GitHub's repository-level license badge for an asset directory.

Philippine reference: Republic Act No. 8293 protects computer programs and gives copyright owners reproduction/adaptation rights. Its private-copy exception excludes computer programs except for narrower lawful-owner backup/adaptation cases, while fair use remains case-specific. Reference: <https://lawphil.net/statutes/repacts/ra1997/ra_8293_1997.html>.

GitHub reference: without a license, default copyright applies and others may not reproduce, distribute, or create derivative works. Reference: <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository>.

This is a development policy, not formal legal advice.

## Recommended Execution Order

### Phase 0: Protect the current baseline

- Finish and commit the existing Known Bug #1 bubble fix separately.
- Re-run its browser acceptance and automated gates.
- Capture the clean starting state for the redesign.

### Phase 1: Gameplay-first shell and design system

- Encounter-aware layout.
- Centered/enlarged board.
- Collapsible story drawer.
- CSS design tokens and coherent HUD.
- Responsive and accessibility pass.

### Phase 2: Selection, targeting, and turn UX

- Selected-unit presentation.
- Targeting modes and previews.
- Invalid-action explanations.
- Smart end-turn behavior.
- Enemy-turn focus and readable transitions.

### Phase 3: Asset layer and recognizable actors

- Asset manifest and licensing files.
- Initial CC0 character/environment set.
- Semantic visual IDs and fallback visuals.
- Portrait and sprite integration.

### Phase 4: Presentation events and animations

- A bounded presentation-event queue.
- Movement, Punch, Fireball, Force Push, damage, destruction, and downed effects.
- Input gating only where necessary for readable sequencing.

### Phase 5: Trusted live-AI gateway

- Server gateway, one cloud provider, and one OpenAI-compatible/local mode.
- Health check and connection settings.
- Narrative, encounter, and dialogue requests.
- Failure, timeout, retry, validation, and fallback behavior.

### Phase 6: Final polish and acceptance

- Tooltips, shortcuts, log, sound hooks, reduced motion, transitions, and final responsive pass.
- Complete story-to-combat-to-story browser playthrough using the live gateway.

## Which Tasks Can Use a Cheaper Model?

Yes, many bounded tasks can use a cheaper model after the architecture and acceptance criteria are fixed.

### Good cheaper-model tasks

- CSS design-token conversion after the intended visual system is specified.
- Restyling one React component at a time from a reference screenshot.
- Building presentational HUD components with fixed props and acceptance criteria.
- Importing already-selected CC0 assets.
- Creating the asset manifest, credits, and notices from a verified source list.
- Wiring semantic sprite IDs into an established renderer seam.
- Adding straightforward Phaser tweens to an already-designed presentation event.
- Implementing tooltips, disabled states, labels, and keyboard hints.
- Writing focused unit/component tests for already-decided behavior.
- Updating documentation and QA checklists.
- Fixing lint, formatting, and narrow isolated bugs.

### Keep with a stronger model

- The initial repo-wide UI/UX architecture and encounter-layout decision.
- Changes to turn semantics or action-resource behavior.
- The Phaser/React/engine synchronization boundary.
- The presentation-event schema and animation sequencing contract.
- Real AI gateway design, secret handling, response validation, and provider failure behavior.
- Persistence and migration changes.
- Cross-system debugging and lifecycle issues.
- Final integration review and browser acceptance.

### Delegation rule

Do not give a cheaper model the entire redesign as one prompt. Give it one bounded task with:

- an exact file scope;
- a visual or behavioral reference;
- explicit non-goals;
- required tests;
- an acceptance screenshot or DOM assertion;
- a stop condition before expanding scope.

## Self-Contained Implementation Prompt

```text
You are the senior gameplay, UI/UX, rendering, and AI-integration engineer for
the AI-DM Tactical RPG at:

C:\Users\vinzp\Documents\Game Idea

Branch: codex/phase-6a-persistent-world
Baseline: b1cd165

Read completely before acting:

- docs/GAMEPLAY_UI_UX_AI_IMPROVEMENT_HANDOFF.md
- docs/PRD.md, especially sections 54 and 78
- docs/STATUS.md
- docs/ARCHITECTURE.md

Start by inspecting git status. Preserve the existing uncommitted Known Bug #1
fix in GameCanvas, CombatScene, and its QA screenshot. Do not reset or overwrite
it. Finish/checkpoint that bug fix independently before beginning broad work.

OBJECTIVE

Turn the functional V0.1 prototype into a polished, game-first vertical slice:

1. During combat, center and enlarge the tactical board and move story/context
   into a collapsible secondary surface.
2. Establish a coherent game HUD and visual design system.
3. Make selection, movement, targeting, action costs, remaining resources, and
   turn completion immediately understandable.
4. Replace dots/squares with reusable legally sourced sprites and environment
   art through a semantic asset manifest.
5. Add presentation-only movement and ability animations, including a visible
   Fireball projectile and impact.
6. Connect the existing AIProvider/HttpGatewayProvider contract to a trusted
   server-side live-model gateway without exposing credentials in the browser.

ARCHITECTURAL RULES

- TacticalEngine owns all mechanics, legality, and state.
- Phaser renders state, translates input, and plays presentation events.
- React owns application UI and request lifecycle.
- AI proposes creative meaning; deterministic code validates mechanics.
- Never put secrets in VITE_* variables, browser storage, or client bundles.
- PRD §54: no game rules in Phaser scenes.
- PRD §78: choose the smallest system that supports the current fantasy.
- Do not rewrite the working engine merely to improve presentation.

EXECUTION

Follow the phased plan in the handoff. Make small reviewable commits and stop at
each gate. Do not combine the layout rewrite, animation system, asset migration,
and AI gateway in one commit.

For interaction UX:

- Explicitly show selection and targeting modes.
- Preview movement/range/area/effect and explain invalid actions.
- Do not blindly end after every ability.
- Auto-end only when no meaningful legal action remains, with a short Cancel
  window; otherwise emphasize End Turn and state what remains available.

For visuals:

- Prefer a small coherent Kenney CC0 set for the first pass.
- Maintain ASSET_CREDITS.md, THIRD_PARTY_NOTICES.md, and an asset manifest.
- Treat code and assets as separately licensed.
- Do not copy from unlicensed repositories or import GPL/ShareAlike material
  without an explicit product decision accepting those obligations.

For AI:

- Keep the existing browser AIProvider contract.
- Implement the trusted gateway behind it.
- Start with one cloud provider and one OpenAI-compatible/local endpoint.
- Support narrative, structured encounter generation, and dialogue.
- Validate responses, bound retries/timeouts/request sizes, provide health/test
  connection, and keep Demo mode as a clearly labeled fallback.

GATES AFTER EVERY PHASE

- npx tsc --noEmit
- npx eslint src --max-warnings=0
- npx vitest run
- npm run build
- git diff --check
- browser QA at desktop and narrow widths
- zero unexpected console errors
- before/after screenshots in docs/qa/
- evidence-backed docs/STATUS.md update

FINAL ACCEPTANCE

A new player can immediately identify the active turn, select a recognizable
character, understand movement, select Fireball, preview its target/radius,
watch the projectile and impact, understand damage and remaining resources,
decide whether to keep acting or end the turn, talk to a recognizable enemy,
complete combat, and return to a live-AI-narrated story without any model key
appearing in the browser.
```

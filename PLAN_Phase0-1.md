# Plan — Phases 0 & 1 (Project Foundation + Ugly Chess Prototype)

**Project:** AI-DM Tactical RPG ("Game Idea")
**Root:** `C:\Users\vinzp\Documents\Game Idea`
**Status:** DRAFT — unaccepted. No execution until approved.
**Workflow:** omh `plan` (run `20260809T045310134458Z-plan-planning-ed212b`, status: started)
**Sources:** `Product Requirements Document.md`, `PHASES.md`

---

## 1. Goals

- **Phase 0:** A minimal local project that runs correctly — TypeScript + React + Phaser + Vite, with testing, lint/typecheck, dev scripts, and a minimal source layout. No Electron yet.
- **Phase 1:** The smallest possible playable tactical game — an intentionally ugly chess prototype (circles, squares, colored tiles, text) with grid, movement, one attack, player/enemy turns, and a win/lose condition.

## 2. Non-Goals (explicitly out — per PHASES.md "Do Not Build Yet")

- No AI DM, no story/chat layer, no character creator, no saves/persistence, no map generation, no dialogue.
- No ability system (Phase 2), no inventory, no progression, no Electron shell.
- No Sol involvement unless something genuinely unusual appears (both phases are FAST AI per PHASES.md).
- No polish: no art, no animation system, no sound, no grid-display toggle yet.

## 3. Assumptions

- App scaffolds **in place** at the project root (PRD.md / PHASES.md already live there; Vite tolerates extra files; docs/ and src/ sit side-by-side as PHASES.md shows).
- Engine must be **pure TypeScript with zero Phaser imports** (PRD §54: core rules never live in Phaser scenes).
- "Defeated/downed" = 0 HP → Downed, removed from the fight for the prototype; permanent death OFF (PRD §25).
- No randomness in Phase 1 (PRD §23 dice system is a later phase) — fixed damage numbers.
- Controller model from PRD §14 (`controller: PLAYER | AI`) even though Phase 1 has a single player token — it's the cheap, future-proof choice.

## 4. Decisions to Lock Before Execution (FAST-AI defaults, cheap to reverse later)

| Decision | Default | Rationale |
|---|---|---|
| Movement shape | 4-directional (Manhattan) | Chess-like simplicity; 8-dir is a trivial later extension |
| Grid size | 10×10, hardcoded constant | Big enough for movement ranges, small enough to debug |
| Damage/HP | Attack = 1 damage; units HP 3–5 | No dice yet; numbers live in one constants file |
| Enemy AI | Greedy: move toward nearest player unit, attack if adjacent | Smallest thing that creates a real "enemy turn" |
| Turn flow | Player Turn → Select → Move → Attack → End Turn → Enemy Turn | Exactly PHASES.md Phase 1 flow |
| Test runner | Vitest + React Testing Library | Native Vite/TS pairing, fast |

## 5. Risks

- **Phaser-in-React lifecycle leaks** (double canvas, scene not destroyed on hot reload) — mitigate with a dedicated mount component and `game.destroy()` on unmount.
- **Engine/renderer boundary drift** — mitigate by keeping engine files Phaser-free and enforcing it with a lint rule or an import-boundary test (engine imports no `phaser`).
- **Scope creep into "nice" visuals** — Phase 1 must stay ugly; review gate checks geometry shapes only.
- **Git not yet initialized** — check first; if absent, `git init` + initial commit at end of Phase 0.

---

## 6. Phase 0 — Project Foundation (Model: FAST AI)

### Tasks

1. **Scaffold** Vite + React + TypeScript app in project root (in place).
2. **TypeScript config**: strict mode, `tsc --noEmit` typecheck script.
3. **React shell**: minimal `App` with layout regions reserved for later (chat panel / game viewport) — nothing functional beyond rendering.
4. **Phaser canvas mount**: a `GameCanvas` component that creates the Phaser game on mount and destroys it on unmount; smoke scene renders (solid background + one rectangle).
5. **Source skeleton** (PHASES.md layout, `.gitkeep` where empty — no speculative code):
   ```
   src/app  src/game/{combat,entities,abilities,rendering}  src/ai  src/persistence  src/shared
   docs/    (PRD.md, PHASES.md copies + ARCHITECTURE.md, GAME_RULES.md, AI_CONTRACTS.md, STATUS.md)
   ```
6. **Docs bootstrap**: copy PRD.md/PHASES.md into docs/; ARCHITECTURE.md from PRD §53 diagram; GAME_RULES.md stub (grid, turn structure, HP, downed — PRD §11, §12, §25); AI_CONTRACTS.md placeholder ("no AI in phases 0–1"); STATUS.md tracking table.
7. **Testing setup**: Vitest + RTL; one smoke test each for React shell and a trivial pure function.
8. **Lint/format**: ESLint (flat config) + prettier; scripts: `dev`, `build`, `test`, `typecheck`, `lint`.
9. **Git**: init if missing; initial commit.

### Success Criteria (PHASES.md)

- `npm install` succeeds; `npm run dev` starts; React renders; Phaser renders (canvas visible with smoke scene).
- `npm test` passes; `npm run typecheck` passes; `npm run lint` passes.

### Verification Shape

- Run each script and capture real output (exit codes).
- Screenshot the running dev server (React + Phaser canvas visible).

---

## 7. Phase 1 — Ugly Chess Prototype (Model: FAST AI)

### Architecture (per PHASES.md)

```
Tactical Engine (pure TS)  →  Game State  →  Phaser Renderer
```

### Tasks

1. **Core types** (`src/game/combat/types.ts`): `GridPosition`, `Team`, `Controller` (PLAYER|AI), `Unit` (id, name, team, controller, hp, maxHp, movement, position), `TurnPhase`.
2. **Engine — state + validation** (`src/game/combat/engine.ts`): grid dims + blocked tiles, unit placement, occupancy rules, `getMovementRange()` (BFS with movement allowance, blocked tiles excluded), `canAttack()` (adjacent + same-turn-after-move rule or simplified per-action model).
3. **Engine — turn flow**: `selectUnit`, `moveUnit` (legal-only), `attackUnit` (legal-only, applies fixed damage), `endTurn`, enemy-turn tick (greedy AI: move toward nearest enemy if not adjacent, attack if adjacent), downed units removed from acting order, win/lose detection (all enemies downed → Victory; all player units downed → Defeat).
4. **Renderer** (`src/game/rendering/`): colored tiles, blocked tiles visually distinct, units as circles/squares with HP text, movement-range highlight, click-to-select / click-to-move / click-to-attack wired to engine commands, turn banner, simple Victory/Defeat overlay.
5. **React HUD**: End Turn button, current-turn/phase readout, win/lose state display.
6. **Tests** (engine, no Phaser): movement range math, blocked tiles, attack legality, downed handling, turn switching, enemy AI behavior, win/lose.
7. **STATUS.md update** with phase results.

### Success Criteria (PHASES.md)

Player can: ① click their character ② see legal movement ③ move ④ attack ⑤ end turn ⑥ fight until one side loses.

### Verification Shape

- Engine unit tests pass (real output).
- Manual playthrough script executed and recorded: select → range shown → move → attack → end turn → enemy acts → downed unit → victory/defeat.
- Screenshot of the running prototype mid-fight.

---

## 8. Acceptance Checklist (both phases)

- [ ] Phase 0: deps install / dev server / React / Phaser / tests / typecheck / lint — all observed passing
- [ ] Phase 1: six success-criteria steps demonstrably playable
- [ ] Engine contains no Phaser imports
- [ ] STATUS.md reflects actual state; nothing claimed that wasn't observed

## 9. Execution Order & Handoff

- **Order:** Phase 0 fully verified → Phase 1 (sequential; Phase 1 depends on Phase 0's skeleton).
- **Model:** FAST AI throughout (Luna or DeepSeek Flash). Current session model (deepseek-v4-flash) qualifies; no Sol needed per PHASES.md.
- **Recommended follow-on:** direct executor handoff — run Phase 0 → verify → run Phase 1 → verify, with a STATUS.md checkpoint between. (Fit: two sequential FAST-AI build phases, not parallel lanes, so `ultrawork`/`team` add no value; `ultraprocess` would fit if a full task→PR cycle with review is wanted.)
- **Not started until the user explicitly approves this plan.**

# Game Rules

> Stub sourced from PRD §11 (Grid), §12 (Turn Structure), §25 (Failure, Downing, and Death).
> Implemented rules through Phase 4. The broader product intent remains in `PRD.md`.

## Grid (PRD §11)

- Combat uses a real underlying tile grid.
- The grid should not necessarily dominate the visual presentation.
- Player setting — Grid Display:
  ```text
  Grid Display

  Off
  Faint
  Full
  ```
- Default: **Faint or Off**.
- Even when hidden, all movement and targeting operate using grid coordinates.

## Turn Structure (PRD §12)

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

### Implemented Turn Resources

- Every living unit starts its team's turn with its movement allowance, 1 Action, and 1 Bonus Action.
- Moving consumes the shortest legal path distance from that unit's remaining movement.
- An ability consumes its declared Action or Bonus Action only after its target is validated.
- Ending the player turn runs the enemy AI (see [Enemy AI](#enemy-ai-phase-3)), then refreshes player resources.

## Abilities (Phase 2)

- Abilities are selected first; the engine then exposes valid unit or tile targets.
- Range and radius currently use Manhattan distance on the four-directional grid.
- Single-target and radius areas share the same effect executor.
- Implemented effect primitives: Damage, Heal, Push, and Apply Status.
- Punch targets an adjacent enemy for 1 damage.
- Fireball targets a tile within 6 tiles and deals 2 damage to enemies in radius 1.
- Force Push targets an enemy within 4 tiles and pushes it up to 2 cardinal tiles away from the caster, stopping at walls, board edges, or living units.
- Active statuses record their source and remaining duration. They tick at the end of the affected team's turn and expire at zero; status-specific rule modifiers are intentionally deferred.

## Enemy AI (Phase 3)

Brain v1 decides every enemy action during the enemy turn, re-planning after each executed action:

1. Pick the nearest living player (Manhattan distance); ties break toward the lower-HP player.
2. Aim the highest-damage legal ability at that chosen player; UNIT abilities target the unit and TILE abilities target the player's position. Ties prefer the first ability in list order.
3. Otherwise take one step along the shortest legal path toward the chosen player.
4. Otherwise end that enemy's turn (with a safety cap of 32 actions per enemy).

The AI drives the engine through the same public API the player uses (`moveUnit`, `useAbility`, target validation), so it cannot cheat — it obeys movement allowance, action cost, range, and targeting rules like any unit. Pathfinding is cost-aware (difficult terrain costs 2), so the brain routes around or through terrain exactly like the player. Known boundary: the AI does not avoid hazards or prefer cover.

## Environment (Phase 4)

Maps are configured with objects and difficult-terrain tiles. The engine validates the layout at construction and refuses to start with an invalid one.

### Object Kinds

| Kind   | Blocks movement | Destructible | Interactable | Default HP |
| ------ | --------------- | ------------ | ------------ | ---------- |
| WALL   | yes             | no           | no           | —          |
| DESK   | yes             | yes          | no           | 3          |
| LOCKER | yes             | yes          | no           | 4          |
| DOOR   | while closed    | no           | yes          | —          |
| BARREL | yes             | yes          | no           | 2          |
| HAZARD | no              | no           | no           | —          |

### Difficult Terrain

- Entering a difficult-terrain tile costs **2 movement** instead of 1.
- Movement and pathfinding are cost-aware (Dijkstra): a tile may be reachable at a lower cost via a longer route, and `moveUnit` consumes the true path cost.
- Forced movement (Push) ignores terrain cost.

### Interact

- `interact` costs **1 Action** and requires the unit to stand adjacent (Manhattan distance 1) to an interactable object.
- A DOOR toggles between open and closed; a closed door blocks movement, an open door does not.
- Only the active team's living units can interact.
- An open door cannot be closed while a living unit occupies the doorway.

### Destructible Objects

- DESKs, LOCKERs, and BARRELs take damage only from **TILE-targeting** abilities (e.g. Fireball aimed at a tile in radius). UNIT-targeting abilities (Punch) never affect objects.
- An object at 0 HP is removed from the map; its tile becomes passable.
- Heal, Push, and status effects never affect objects.

### Hazards

- A unit standing on a HAZARD tile takes **1 damage at the start of its team's turn** (after resources refresh).
- Hazard damage can down a unit and end the battle.

### Known Boundaries

- No cover damage reduction (objects give no defensive bonus yet).
- No line-of-sight rules.
- The enemy AI does not avoid hazards or intentionally seek cover.

## Failure, Downing, and Death (PRD §25)

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

Permanent player-character death is **OFF by default**.
Permadeath may be enabled through settings.
Major companions and villains should also receive protection depending on DM settings.

## Narrative Authority (Phase 5)

- AI narration can change narrative context but cannot directly change tactical HP, positions, resources, abilities, objects, turns, or encounter outcomes.
- `PROTECTED` and `DEFAULT` stories require explicit approval before a major irreversible proposal becomes canon.
- `UNRESTRICTED` is explicit standing permission selected during setup. Major proposals may apply automatically, but a visible system record is always added.
- Declining a proposal preserves the pre-proposal situation and records the decision.
- Invalid, aborted, or failed provider responses leave the current story recoverable through Retry and never append a duplicate player message.
- The offline provider is always labeled Demo. A live provider must be reached through a trusted gateway; browser configuration never contains an API key.

# Game Rules

> Stub sourced from PRD §11 (Grid), §12 (Turn Structure), §25 (Failure, Downing, and Death).
> Implemented rules through Phase 2. The broader product intent remains in `PRD.md`.

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
- Ending the player turn runs the current simple enemy behavior, then refreshes player resources.

## Abilities (Phase 2)

- Abilities are selected first; the engine then exposes valid unit or tile targets.
- Range and radius currently use Manhattan distance on the four-directional grid.
- Single-target and radius areas share the same effect executor.
- Implemented effect primitives: Damage, Heal, Push, and Apply Status.
- Punch targets an adjacent enemy for 1 damage.
- Fireball targets a tile within 6 tiles and deals 2 damage to enemies in radius 1.
- Force Push targets an enemy within 4 tiles and pushes it up to 2 cardinal tiles away from the caster, stopping at walls, board edges, or living units.
- Active statuses record their source and remaining duration. They tick at the end of the affected team's turn and expire at zero; status-specific rule modifiers are intentionally deferred.

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

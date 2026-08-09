# Game Rules (Stub)

> Stub sourced from PRD §11 (Grid), §12 (Turn Structure), §25 (Failure, Downing, and Death).
> This document will grow as rules are implemented (starting Phase 1).

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

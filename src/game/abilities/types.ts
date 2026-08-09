export type ActionCost = 'ACTION' | 'BONUS_ACTION' | 'NONE';

export type TargetTeam = 'ENEMY' | 'ALLY' | 'ANY';

export type AbilityTargeting =
  | { readonly kind: 'UNIT'; readonly team: TargetTeam; readonly range: number }
  | { readonly kind: 'TILE'; readonly range: number }
  | { readonly kind: 'SELF'; readonly range: 0 };

export type AbilityArea =
  | { readonly shape: 'SINGLE' }
  | { readonly shape: 'RADIUS'; readonly radius: number; readonly affects: TargetTeam };

export interface StatusDefinition {
  readonly id: string;
  readonly name: string;
  readonly durationTurns: number;
}

export interface ActiveStatus {
  id: string;
  name: string;
  remainingTurns: number;
  sourceUnitId: string;
}

export type AbilityRequirement =
  | { readonly kind: 'TARGET_DAMAGED' }
  | { readonly kind: 'TARGET_HAS_STATUS'; readonly statusId: string };

export type AbilityEffect =
  | { readonly kind: 'DAMAGE'; readonly amount: number }
  | { readonly kind: 'HEAL'; readonly amount: number }
  | {
      readonly kind: 'PUSH';
      readonly distance: number;
      readonly origin: 'CASTER' | 'TARGET_POINT';
    }
  | { readonly kind: 'APPLY_STATUS'; readonly status: StatusDefinition };

export interface AbilityPresentation {
  readonly color: number;
  readonly verb: string;
}

/**
 * An ability is data. The engine owns validation and effect execution; adding a
 * new combination of existing primitives does not require a new command path.
 */
export interface Ability {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly actionCost: ActionCost;
  readonly targeting: AbilityTargeting;
  readonly area: AbilityArea;
  readonly requirements: readonly AbilityRequirement[];
  readonly effects: readonly AbilityEffect[];
  readonly presentation: AbilityPresentation;
}

export type AbilityTarget =
  | { readonly kind: 'UNIT'; readonly unitId: string }
  | { readonly kind: 'TILE'; readonly x: number; readonly y: number };

export interface TurnResources {
  movementRemaining: number;
  actionRemaining: number;
  bonusActionRemaining: number;
}

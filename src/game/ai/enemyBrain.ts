import type { Ability, AbilityTarget } from '../abilities/types';
import type { GridPosition, Unit } from '../combat/types';

export type EnemyAction =
  | { type: 'MOVE'; x: number; y: number }
  | { type: 'USE_ABILITY'; abilityId: string; target: AbilityTarget };

export interface AiQueries {
  alivePlayers(): Unit[];
  getAbilitiesForUnit(unitId: string): Ability[];
  canUseAbility(casterId: string, abilityId: string, target: AbilityTarget): boolean;
  firstStepToward(from: GridPosition, to: GridPosition): GridPosition | null;
  moveUnit(unitId: string, x: number, y: number): boolean;
  useAbility(casterId: string, abilityId: string, target: AbilityTarget): boolean;
}

function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function totalDamage(ability: Ability): number {
  let total = 0;
  for (const effect of ability.effects) {
    if (effect.kind === 'DAMAGE') total += effect.amount;
  }
  return total;
}

function hostileTargetFor(ability: Ability, target: Unit): AbilityTarget | null {
  if (ability.targeting.kind === 'SELF') return null;
  if (ability.targeting.kind === 'UNIT') return { kind: 'UNIT', unitId: target.id };
  if (ability.area.shape === 'RADIUS' && ability.area.affects === 'ALLY') return null;
  return { kind: 'TILE', x: target.position.x, y: target.position.y };
}

/**
 * Pure single-action decision for an enemy unit. The engine re-plans after each
 * executed action, so this only ever considers the unit's current state.
 */
export function planEnemyAction(unit: Unit, q: AiQueries): EnemyAction | null {
  const players = q.alivePlayers();
  if (players.length === 0) return null;

  let target = players[0];
  let bestDistance = manhattanDistance(unit.position, target.position);
  for (const player of players) {
    const distance = manhattanDistance(unit.position, player.position);
    if (distance < bestDistance || (distance === bestDistance && player.hp < target.hp)) {
      target = player;
      bestDistance = distance;
    }
  }

  let bestAbility: Ability | null = null;
  let bestDamage = -1;
  let bestTarget: AbilityTarget | null = null;
  for (const ability of q.getAbilitiesForUnit(unit.id)) {
    const damage = totalDamage(ability);
    if (damage <= 0) continue;
    const abilityTarget = hostileTargetFor(ability, target);
    if (abilityTarget === null || !q.canUseAbility(unit.id, ability.id, abilityTarget)) continue;
    if (damage > bestDamage) {
      bestAbility = ability;
      bestDamage = damage;
      bestTarget = abilityTarget;
    }
  }
  if (bestAbility !== null && bestTarget !== null) {
    return { type: 'USE_ABILITY', abilityId: bestAbility.id, target: bestTarget };
  }

  const step = q.firstStepToward(unit.position, target.position);
  if (step !== null) return { type: 'MOVE', x: step.x, y: step.y };

  return null;
}

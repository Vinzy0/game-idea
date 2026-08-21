/**
 * Combat dialogue (Phase 7, PRD §30-§33, §60): the provider's creativity,
 * deterministic validation, no mechanical authority. Two entry points:
 *
 *  - requestCombatLine: player Talk / triggered bark -> one short in-character
 *    line for a combatant (BARK priority — never blocks combat).
 *  - buildBarkRequests: deterministic evaluator that decides WHICH mechanical
 *    moments are narratively meaningful enough to request a villain line
 *    (PRD §60: dialogue must not fire on every action).
 */
import { parseDialogueResponse } from '../../ai/validate';
import type { AIProvider, DialogueRequest } from '../../ai/provider';
import type { SceneEvent } from '../combat/events';
import type { TacticalEngine } from '../combat/engine';

export const MAX_DIALOGUE_LINES = 3;
const MAX_LINE_LENGTH = 240;

/** Ask the provider for a short in-character combat line. Never throws past ProviderError. */
export async function requestCombatLine(
  provider: AIProvider,
  request: DialogueRequest,
): Promise<string> {
  const response = parseDialogueResponse(await provider.generateDialogue(request));
  const line = response.lines.find((candidate) => candidate.trim() !== '');
  if (line === undefined) {
    throw new Error('dialogue provider returned no lines');
  }
  return line.slice(0, MAX_LINE_LENGTH);
}

/** Deterministic context packet for a bark request (PRD §68: enemy intent). */
export function buildDialoguePrompt(input: {
  speakerName: string;
  speakerIntent: string;
  listenerName: string;
  storySituation: string;
  playerLine?: string;
  trigger: string;
}): string {
  const playerLine = input.playerLine?.trim();
  return [
    `You are ${input.speakerName}, a combatant in a turn-based schoolyard fight.`,
    `Your motivation: ${input.speakerIntent}`,
    `You are speaking to ${input.listenerName}. Story so far: ${input.storySituation}`,
    input.playerLine !== undefined && playerLine !== ''
      ? `${input.listenerName} just said to you: "${playerLine}"`
      : `Moment: ${input.trigger}.`,
    `Reply with ONE short in-character line (max ~20 words). No stage directions, no quotes around the whole line.`,
  ].join(' ');
}

// ---- Triggered villain dialogue (PRD §60) --------------------------------

export interface BarkRequest {
  unitId: string;
  unitName: string;
  trigger: string;
}

/**
 * Evaluate fresh combat events for narratively meaningful moments. Rules
 * (deliberately simple, PRD §58/§60): an enemy barks when it first drops to
 * half HP, when a friendly enemy is downed, or when it downs a player unit.
 * The caller dedupes per unit+trigger.
 */
export function buildBarkRequests(
  events: readonly SceneEvent[],
  engine: TacticalEngine,
): BarkRequest[] {
  const requests: BarkRequest[] = [];
  const push = (unitId: string, trigger: string) => {
    const unit = engine.state.units.find((candidate) => candidate.id === unitId);
    if (unit !== undefined && unit.hp > 0) {
      requests.push({ unitId, unitName: unit.name, trigger });
    }
  };

  for (const event of events) {
    if (event.type === 'CHARACTER_DAMAGED' && event.sourceUnitId !== null) {
      const target = engine.state.units.find((candidate) => candidate.id === event.targetId);
      if (target !== undefined && target.team === 'ENEMY' && target.hp > 0 && target.hp <= target.maxHp / 2) {
        push(event.targetId, `badly hurt (${target.hp}/${target.maxHp} HP) but still standing`);
      }
    }
    if (event.type === 'CHARACTER_DOWNED') {
      const downed = engine.state.units.find((candidate) => candidate.id === event.characterId);
      if (downed !== undefined && downed.team === 'ENEMY') {
        // The downed enemy cannot speak; the nearest living ally reacts instead.
        const ally = engine.state.units.find(
          (candidate) => candidate.team === 'ENEMY' && candidate.hp > 0,
        );
        if (ally !== undefined) push(ally.id, `just saw ${downed.name} go down`);
      } else if (downed !== undefined) {
        const enemy = engine.state.units.find(
          (candidate) => candidate.team === 'ENEMY' && candidate.hp > 0,
        );
        if (enemy !== undefined) push(enemy.id, `just downed ${downed.name}`);
      }
    }
  }
  return requests;
}

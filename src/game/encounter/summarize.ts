/**
 * Human-readable mechanical facts from an EncounterResult (PRD §39): the
 * engine's truth, formatted for the AI DM. Pure presentation of structured
 * data — no invention.
 */
import type { EncounterResult } from '../combat/events';

export function summarizeEncounter(
  result: EncounterResult,
  unitNames: ReadonlyMap<string, string>,
): string {
  const name = (unitId: string): string => unitNames.get(unitId) ?? unitId;

  const parts: string[] = [`Outcome: ${result.outcome.toLowerCase()}`];

  const downed = result.downedCharacterIds.map(name);
  if (downed.length > 0) parts.push(`Downed: ${downed.join(', ')}`);

  const survivors = result.survivors
    .map((survivor) => `${name(survivor.characterId)} ${survivor.hp}/${survivor.maxHp} HP`)
    .join(', ');
  if (survivors !== '') parts.push(`Standing: ${survivors}`);

  if (result.destroyedObjectIds.length > 0) {
    parts.push(`Destroyed: ${result.destroyedObjectIds.length} object(s)`);
  }

  const actions: string[] = [];
  for (const event of result.importantEvents) {
    if (event.type === 'ABILITY_USED') {
      actions.push(`${name(event.casterId)} used ${event.abilityName}`);
    } else if (event.type === 'CHARACTER_DOWNED') {
      actions.push(`${name(event.characterId)} was downed`);
    }
    if (actions.length >= 5) break;
  }
  if (actions.length > 0) parts.push(`Key actions: ${actions.join('; ')}`);

  return parts.join('. ') + '.';
}

import { describe, expect, it } from 'vitest';
import { buildBarkRequests, buildDialoguePrompt, requestCombatLine } from '../combatDialogue';
import { BubbleManager } from '../bubbles';
import { TacticalEngine } from '../../combat/engine';
import { demoEncounterSpec } from '../../../ai/demoEncounter';
import { buildEncounter } from '../../encounter/build';
import type { AIProvider } from '../../../ai/provider';

function fightEngine(): TacticalEngine {
  const built = buildEncounter(demoEncounterSpec({ prompt: '{"playerName":"Alex"}' }));
  if (!built.ok) throw new Error('demo spec failed to build');
  return new TacticalEngine(built.encounter.config);
}

describe('buildBarkRequests', () => {
  it('flags an enemy at half HP and a player downing', () => {
    const engine = fightEngine();
    const events = [
      {
        seq: 0,
        type: 'CHARACTER_DAMAGED' as const,
        targetId: 'mask-bruiser',
        sourceUnitId: 'player',
        amount: 2,
        hpBefore: 4,
        hpAfter: 2,
      },
      {
        seq: 1,
        type: 'CHARACTER_DOWNED' as const,
        characterId: 'player',
        hpBefore: 1,
      },
    ];
    const requests = buildBarkRequests(events, engine);
    expect(requests.map((r) => r.unitId)).toContain('mask-bruiser'); // half HP
    expect(requests.some((r) => r.trigger.includes('downed Alex'))).toBe(true);
  });

  it('stays quiet on meaningless events', () => {
    const engine = fightEngine();
    expect(buildBarkRequests([{ seq: 0, type: 'TURN_STARTED', team: 'PLAYER' }], engine)).toEqual([]);
  });
});

describe('requestCombatLine', () => {
  const provider: AIProvider = {
    label: 'test',
    generateNarrative: () => Promise.reject(new Error('unused')),
    generateStructured: () => Promise.reject(new Error('unused')),
    generateDialogue: () =>
      Promise.resolve({ lines: ['  ', '"Take that!"', 'second line ignored?'] }),
  };

  it('returns the first non-empty validated line', async () => {
    const line = await requestCombatLine(provider, { speaker: 'Volt', prompt: 'x' });
    expect(line).toBe('"Take that!"');
  });

  it('throws when the provider returns no usable lines', async () => {
    const empty: AIProvider = {
      ...provider,
      generateDialogue: () => Promise.resolve({ lines: [] }),
    };
    await expect(requestCombatLine(empty, { speaker: 'V', prompt: 'x' })).rejects.toThrow(/no lines/);
  });
});

describe('buildDialoguePrompt', () => {
  it('includes intent, listener, and the player line when present', () => {
    const prompt = buildDialoguePrompt({
      speakerName: 'Volt',
      speakerIntent: 'show off',
      listenerName: 'Alex',
      storySituation: 'hallway ambush',
      playerLine: 'Why are you doing this?',
      trigger: 'talk',
    });
    expect(prompt).toContain('Volt');
    expect(prompt).toContain('show off');
    expect(prompt).toContain('Alex');
    expect(prompt).toContain('Why are you doing this?');
  });
});

describe('BubbleManager', () => {
  it('replaces per-unit bubbles and expires them', () => {
    const bubbles = new BubbleManager();
    bubbles.say('a', 'first', 10);
    bubbles.say('a', 'second', 10_000);
    expect(bubbles.active().map((b) => b.text)).toEqual(['second']);
    expect(bubbles.active(Date.now() + 20_000)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { demoDialogue, demoEncounterSpec } from '../demoEncounter';
import { demoNarrative, DemoProvider, ENCOUNTER_RESULT_PREFIX } from '../demoProvider';
import { parseEncounterSpec } from '../../game/encounter/spec';

const baseRequest = {
  dm: { setting: 'Northbridge High', tone: 'wry', authority: 'DEFAULT' as const },
  player: { name: 'Alex', archetype: 'fire starter', notes: '' },
  messages: [],
  summary: '',
  situation: 'Three masked students block the hallway.',
  unresolvedThreads: [],
  turnCount: 2,
  input: 'I raise my burning fist.',
};

describe('demoEncounterSpec', () => {
  it('produces a schema-valid, buildable §72 encounter', () => {
    const spec = demoEncounterSpec({ prompt: '{"playerName":"Riley"}' });
    expect(parseEncounterSpec(spec)).not.toBeNull();
    expect(spec.units[0].name).toBe('Riley');
    expect(spec.units.filter((u) => u.role === 'ENEMY')).toHaveLength(3);
    expect(spec.units.every((u) => u.intent.trim() !== '')).toBe(true);
  });
});

describe('demoDialogue', () => {
  it('answers questions, refusals, and defaults in character', () => {
    const ask = demoDialogue({ speaker: 'Masked Bruiser', prompt: 'Alex said: "Who sent you?"' });
    expect(ask.lines[0]).toMatch(/dangerous/);
    const mercy = demoDialogue({ speaker: 'Volt', prompt: 'Alex said: "Please stop!"' });
    expect(mercy.lines[0]).toMatch(/sorry/i);
    const volt = demoDialogue({ speaker: 'Volt', prompt: 'moment: hurt' });
    expect(volt.lines[0]).toMatch(/hum/);
    const other = demoDialogue({ speaker: 'Masked Brawler', prompt: 'moment: hurt' });
    expect(other.lines[0]).toMatch(/example/);
  });
});

describe('demoNarrative battle-result branch', () => {
  it('narrates the aftermath instead of the beat list', () => {
    const response = demoNarrative({
      ...baseRequest,
      input: `${ENCOUNTER_RESULT_PREFIX} Outcome: victory. Downed: Masked Bruiser.`,
    });
    expect(response.narration).toContain('Outcome: victory');
    expect(response.situation).toMatch(/won the hallway fight/);
    expect(response.proposal).toBeNull();
  });

  it('keeps normal beats for normal inputs', () => {
    const response = demoNarrative(baseRequest);
    expect(response.narration).not.toContain('Outcome');
  });
});

describe('DemoProvider structured/dialogue seams', () => {
  it('serves the encounter through generateStructured', async () => {
    const provider = new DemoProvider();
    const response = await provider.generateStructured({ system: 's', prompt: '{"playerName":"Alex"}' });
    expect(parseEncounterSpec(response.data)).not.toBeNull();
    const line = await provider.generateDialogue({ speaker: 'Volt', prompt: 'x' });
    expect(line.lines).toHaveLength(1);
  });
});

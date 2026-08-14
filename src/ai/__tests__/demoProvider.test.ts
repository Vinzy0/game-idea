import { DemoProvider, demoNarrative } from '../demoProvider';
import type { NarrativeRequest } from '../provider';

function request(overrides: Partial<NarrativeRequest> = {}): NarrativeRequest {
  return {
    dm: { setting: 'Northbridge High', tone: 'moody', authority: 'DEFAULT' },
    player: { name: 'Vince', archetype: 'student with telekinesis', notes: '' },
    messages: [],
    summary: '',
    situation: '',
    unresolvedThreads: [],
    turnCount: 0,
    input: '',
    ...overrides,
  };
}

describe('DemoProvider', () => {
  it('is unmistakably labeled as demo', () => {
    expect(new DemoProvider().label).toMatch(/Demo/);
  });

  it('produces a non-empty opening narration with an initial situation', async () => {
    const response = await new DemoProvider().generateNarrative(request());
    expect(response.narration).toContain('Vince');
    expect(response.narration).toContain('Northbridge High');
    expect(response.situation).not.toBe('');
    expect(response.unresolvedThreads.length).toBeGreaterThan(0);
    expect(response.proposal).toBeNull();
  });

  it('echoes player input and evolves situation and threads across turns', async () => {
    const provider = new DemoProvider();
    let story: NarrativeRequest = request();
    const openings = [await provider.generateNarrative(story)];

    for (let turn = 1; turn <= 4; turn += 1) {
      const prev = openings[turn - 1];
      story = {
        ...story,
        messages: [
          ...story.messages,
          { role: 'player', content: `action ${turn}`, createdAt: turn },
          { role: 'dm', content: prev.narration, createdAt: turn },
        ],
        situation: prev.situation,
        unresolvedThreads: prev.unresolvedThreads,
        turnCount: turn,
        input: `action ${turn}`,
      };
      const response = await provider.generateNarrative(story);
      expect(response.narration).toContain(`action ${turn}`);
      openings.push(response);
    }

    expect(openings[1].situation).toContain('Riley Vasquez');
    expect(openings[2].situation).toContain('assembly');
    expect(openings[2].unresolvedThreads).toContain('Attend the assembly');
  });

  it('proposes the major irreversible change on turn 3 and only there', async () => {
    const provider = new DemoProvider();
    const turn3 = await provider.generateNarrative(
      request({ turnCount: 3, input: 'I step forward.', situation: 'At the gym doors.' }),
    );
    expect(turn3.proposal).not.toBeNull();
    expect(turn3.proposal?.summary).toContain('Vince');
    expect(turn3.proposal?.situationAfter).toContain('expulsion');

    const turn2 = await provider.generateNarrative(request({ turnCount: 2, input: 'I wait.' }));
    expect(turn2.proposal).toBeNull();
  });

  it('is deterministic: identical requests yield identical responses', () => {
    const a = demoNarrative(request({ turnCount: 2, input: 'I wait.' }));
    const b = demoNarrative(request({ turnCount: 2, input: 'I wait.' }));
    expect(a).toEqual(b);
  });

  it('stays coherent past the scripted beats via the continuation beat', async () => {
    const provider = new DemoProvider();
    let story = request({
      turnCount: 5,
      input: 'I head to the shed.',
      situation: 'An anonymous message invites you to the maintenance shed.',
      unresolvedThreads: ['Meet the anonymous contact'],
    });
    const response = await provider.generateNarrative(story);
    expect(response.narration).toContain('I head to the shed.');
    expect(response.situation).toContain('maintenance shed');

    // Turn 9: beyond all scripted beats — still echoes input and context.
    story = {
      ...story,
      turnCount: 9,
      input: 'I knock.',
      situation: response.situation,
      unresolvedThreads: response.unresolvedThreads,
    };
    const late = await provider.generateNarrative(story);
    expect(late.narration).toContain('I knock.');
    expect(late.situation).toBe(response.situation);
  });

  it('rejects with AbortError when aborted', async () => {
    const controller = new AbortController();
    const pending = new DemoProvider().generateNarrative(request(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

import type { NarrativeResponse } from '../../ai/provider';
import { boundedMessages, buildNarrativeRequest, MAX_CONTEXT_MESSAGES } from '../context';
import {
  applyResponse,
  createStory,
  markError,
  resolveProposal,
  restoreStory,
  submitInput,
} from '../state';
import { STORY_VERSION, type StoryData, type StoryState } from '../types';

const DM = { setting: 'the school', tone: 'moody', authority: 'DEFAULT' as const };
const PLAYER = { name: 'Vince', archetype: 'student', notes: '' };

function story(): StoryState {
  return createStory({ dm: DM, player: PLAYER, now: 1000 });
}

function response(overrides: Partial<NarrativeResponse> = {}): NarrativeResponse {
  return {
    narration: 'The bell rings.',
    situation: 'A quiet unease.',
    unresolvedThreads: ['Find the lights'],
    proposal: null,
    ...overrides,
  };
}

describe('story state transitions', () => {
  it('createStory yields an empty LOADING story awaiting the opening narration', () => {
    const s = story();
    expect(s.version).toBe(STORY_VERSION);
    expect(s.phase).toBe('LOADING');
    expect(s.messages).toEqual([]);
    expect(s.turnCount).toBe(0);
    expect(s.startedAt).toBe(1000);
    expect(s.updatedAt).toBe(1000);
  });

  it('submitInput appends the player message, increments the turn, and loads', () => {
    const started = applyResponse(story(), response(), 1100);
    const sent = submitInput(started, '  I look around.  ', 1200);
    expect(sent.phase).toBe('LOADING');
    expect(sent.turnCount).toBe(1);
    expect(sent.messages).toEqual([
      { role: 'dm', content: 'The bell rings.', createdAt: 1100 },
      { role: 'player', content: 'I look around.', createdAt: 1200 },
    ]);
  });

  it('submitInput ignores blank input and non-IDLE stories', () => {
    const started = applyResponse(story(), response());
    expect(submitInput(started, '   ')).toBe(started);
    const loading = story();
    expect(submitInput(loading, 'nope')).toBe(loading);
    const pending = applyResponse(story(), response({ proposal: { id: 'p', summary: 's', details: 'd', situationAfter: 'x' } }));
    expect(submitInput(pending, 'nope')).toBe(pending);
  });

  it('applyResponse appends the DM narration and updates situation/threads', () => {
    const next = applyResponse(story(), response(), 1300);
    expect(next.phase).toBe('IDLE');
    expect(next.pendingProposal).toBeNull();
    expect(next.situation).toBe('A quiet unease.');
    expect(next.unresolvedThreads).toEqual(['Find the lights']);
    expect(next.messages[0]).toEqual({ role: 'dm', content: 'The bell rings.', createdAt: 1300 });
  });

  it('a proposal moves the story to PENDING_APPROVAL without applying it', () => {
    const proposal = { id: 'p', summary: 'Expulsion', details: 'Big.', situationAfter: 'Expelled.' };
    const next = applyResponse(story(), response({ proposal, situation: 'At the gym doors.' }));
    expect(next.phase).toBe('PENDING_APPROVAL');
    expect(next.pendingProposal).toEqual(proposal);
    expect(next.situation).toBe('At the gym doors.'); // proposal not yet canon
  });

  it('applyResponse ignores stories that are not awaiting a response', () => {
    const idle = applyResponse(story(), response());
    expect(applyResponse(idle, response({ narration: 'Second.' }))).toBe(idle);
  });

  it('approve applies situationAfter and records a system message', () => {
    const proposal = { id: 'p', summary: 'Expulsion', details: 'Big.', situationAfter: 'Expelled.' };
    const pending = applyResponse(story(), response({ proposal }));
    const approved = resolveProposal(pending, true, 1400);
    expect(approved.phase).toBe('IDLE');
    expect(approved.pendingProposal).toBeNull();
    expect(approved.situation).toBe('Expelled.');
    expect(approved.messages[approved.messages.length - 1]).toEqual({
      role: 'system',
      content: 'Approved: Expulsion',
      createdAt: 1400,
    });
  });

  it('decline changes nothing and records a system message', () => {
    const proposal = { id: 'p', summary: 'Expulsion', details: 'Big.', situationAfter: 'Expelled.' };
    const pending = applyResponse(story(), response({ proposal, situation: 'At the gym doors.' }));
    const declined = resolveProposal(pending, false);
    expect(declined.phase).toBe('IDLE');
    expect(declined.situation).toBe('At the gym doors.');
    expect(declined.messages[declined.messages.length - 1]?.content).toBe('Declined: Expulsion');
  });

  it('resolveProposal is a no-op without a pending proposal', () => {
    const idle = applyResponse(story(), response());
    expect(resolveProposal(idle, true)).toBe(idle);
  });

  it('UNRESTRICTED authority auto-applies proposals with a visible record', () => {
    const proposal = { id: 'p', summary: 'Expulsion', details: 'Big.', situationAfter: 'Expelled.' };
    const s = createStory({ dm: { ...DM, authority: 'UNRESTRICTED' }, player: PLAYER });
    const next = applyResponse(s, response({ proposal }));
    expect(next.phase).toBe('IDLE');
    expect(next.pendingProposal).toBeNull();
    expect(next.situation).toBe('Expelled.');
    expect(next.messages[next.messages.length - 1]?.content).toContain('Auto-approved (unrestricted authority)');
  });

  it('markError makes the story recoverable and retry re-applies', () => {
    const started = applyResponse(story(), response());
    const sent = submitInput(started, 'hello');
    const failed = markError(sent, 'boom');
    expect(failed.phase).toBe('ERROR');
    expect(failed.lastError).toBe('boom');
    const recovered = applyResponse(failed, response({ narration: 'Recovered.' }));
    expect(recovered.phase).toBe('IDLE');
    expect(recovered.messages.map((m) => m.content)).toEqual([
      'The bell rings.',
      'hello',
      'Recovered.',
    ]);
  });

  it('restoreStory derives phase from a pending proposal', () => {
    const data: StoryData = {
      version: STORY_VERSION,
      dm: DM,
      player: PLAYER,
      messages: [],
      situation: 'x',
      summary: '',
      unresolvedThreads: [],
      turnCount: 0,
      pendingProposal: null,
      startedAt: 1,
      updatedAt: 2,
    };
    expect(restoreStory(data).phase).toBe('IDLE');
    expect(
      restoreStory({
        ...data,
        pendingProposal: { id: 'p', summary: 's', details: 'd', situationAfter: 'x' },
      }).phase,
    ).toBe('PENDING_APPROVAL');
  });
});

describe('bounded context', () => {
  it('keeps the full window when small and slices to the last N when large', () => {
    const few = [{ role: 'player' as const, content: 'a', createdAt: 1 }];
    expect(boundedMessages(few)).toEqual(few);
    const many = Array.from({ length: MAX_CONTEXT_MESSAGES + 3 }, (_, i) => ({
      role: 'player' as const,
      content: String(i),
      createdAt: i,
    }));
    const bounded = boundedMessages(many);
    expect(bounded).toHaveLength(MAX_CONTEXT_MESSAGES);
    expect(bounded[0].content).toBe('3');
  });

  it('buildNarrativeRequest carries context and the bounded window', () => {
    const started = applyResponse(story(), response());
    const sent = submitInput(started, 'hello');
    const request = buildNarrativeRequest(sent, 'hello');
    expect(request.dm).toEqual(DM);
    expect(request.player).toEqual(PLAYER);
    expect(request.turnCount).toBe(1);
    expect(request.input).toBe('hello');
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe('dm');
    expect(request.summary).toContain('The bell rings.');
  });
});

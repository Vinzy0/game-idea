import { STORY_VERSION, type StoryData } from '../types';
import { clearStory, loadStory, saveStory, STORAGE_KEY } from '../storage';

const DATA: StoryData = {
  version: STORY_VERSION,
  dm: { setting: 'the school', tone: 'moody', authority: 'DEFAULT' },
  player: { name: 'Vince', archetype: 'student', notes: 'shy' },
  messages: [
    { role: 'dm', content: 'The bell rings.', createdAt: 1000 },
    { role: 'player', content: 'I look around.', createdAt: 2000 },
  ],
  situation: 'A quiet unease.',
  summary: 'The bell rings.',
  unresolvedThreads: ['Find the lights'],
  turnCount: 1,
  pendingProposal: null,
  startedAt: 1000,
  updatedAt: 2000,
};

describe('story persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a story with messages, context, threads, and timestamps', () => {
    saveStory({ ...DATA, phase: 'IDLE', lastError: null });
    const loaded = loadStory();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(STORY_VERSION);
    expect(loaded?.player).toEqual(DATA.player);
    expect(loaded?.messages).toEqual(DATA.messages);
    expect(loaded?.situation).toBe('A quiet unease.');
    expect(loaded?.summary).toBe('The bell rings.');
    expect(loaded?.unresolvedThreads).toEqual(['Find the lights']);
    expect(loaded?.turnCount).toBe(1);
    expect(loaded?.startedAt).toBe(1000);
    expect(loaded?.updatedAt).toBe(2000);
    // Transient UI fields are derived, not persisted.
    expect(loaded?.phase).toBe('IDLE');
    expect(loaded?.lastError).toBeNull();
  });

  it('resumes into PENDING_APPROVAL when a proposal was pending', () => {
    saveStory({
      ...DATA,
      pendingProposal: { id: 'p', summary: 's', details: 'd', situationAfter: 'x' },
      phase: 'PENDING_APPROVAL',
      lastError: null,
    });
    expect(loadStory()?.phase).toBe('PENDING_APPROVAL');
  });

  it('fails closed on a missing key', () => {
    expect(loadStory()).toBeNull();
  });

  it('fails closed on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadStory()).toBeNull();
  });

  it('fails closed on an old/unknown version', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DATA, version: 0 }));
    expect(loadStory()).toBeNull();
  });

  it.each([
    ['non-object', '42'],
    ['bad dm', { ...DATA, dm: { setting: 'x' } }],
    ['bad authority', { ...DATA, dm: { ...DATA.dm, authority: 'WILD' } }],
    ['bad player', { ...DATA, player: { name: 'Vince' } }],
    ['messages not array', { ...DATA, messages: 'nope' }],
    ['missing summary', { ...DATA, summary: undefined }],
    ['bad message', { ...DATA, messages: [{ role: 'ghost', content: 'x', createdAt: 1 }] }],
    ['negative turn count', { ...DATA, turnCount: -1 }],
    ['bad proposal', { ...DATA, pendingProposal: { id: 'p' } }],
    ['missing timestamp', { ...DATA, updatedAt: 'soon' }],
  ])('fails closed on %s', (_label, overrides) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    expect(loadStory()).toBeNull();
  });

  it('clearStory removes the saved story', () => {
    saveStory({ ...DATA, phase: 'IDLE', lastError: null });
    clearStory();
    expect(loadStory()).toBeNull();
  });

  it('saveStory never throws when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => saveStory({ ...DATA, phase: 'IDLE', lastError: null })).not.toThrow();
    spy.mockRestore();
  });
});

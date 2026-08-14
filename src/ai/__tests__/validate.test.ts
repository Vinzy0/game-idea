import { ProviderValidationError } from '../provider';
import {
  parseDialogueResponse,
  parseNarrativeMessage,
  parseNarrativeResponse,
  parseStructuredResponse,
} from '../validate';

describe('parseNarrativeResponse', () => {
  it('accepts a valid response and strips unknown fields', () => {
    const parsed = parseNarrativeResponse({
      narration: 'The bell rings.',
      situation: 'A quiet unease.',
      unresolvedThreads: ['Find the lights'],
      proposal: null,
      extra: 'ignored',
    });
    expect(parsed).toEqual({
      narration: 'The bell rings.',
      situation: 'A quiet unease.',
      unresolvedThreads: ['Find the lights'],
      proposal: null,
    });
    expect(parsed).not.toHaveProperty('extra');
  });

  it('accepts an empty situation and a full proposal', () => {
    const parsed = parseNarrativeResponse({
      narration: 'It happens.',
      situation: '',
      unresolvedThreads: [],
      proposal: {
        id: 'p1',
        summary: 'Expulsion',
        details: 'Major and irreversible.',
        situationAfter: 'Expelled.',
      },
    });
    expect(parsed.proposal).toEqual({
      id: 'p1',
      summary: 'Expulsion',
      details: 'Major and irreversible.',
      situationAfter: 'Expelled.',
    });
  });

  it.each([
    ['non-object', 42],
    ['null', null],
    ['array', []],
    ['missing narration', { situation: '', unresolvedThreads: [] }],
    ['empty narration', { narration: '   ', situation: '', unresolvedThreads: [] }],
    ['non-string narration', { narration: 42, situation: '', unresolvedThreads: [] }],
    ['missing situation', { narration: 'x' }],
    ['missing threads', { narration: 'x', situation: '' }],
    ['threads not string array', { narration: 'x', situation: '', unresolvedThreads: [1] }],
    ['malformed proposal', { narration: 'x', situation: '', unresolvedThreads: [], proposal: { id: 'p' } }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseNarrativeResponse(input)).toThrow(ProviderValidationError);
  });
});

describe('parseNarrativeMessage', () => {
  it('accepts a valid message', () => {
    expect(parseNarrativeMessage({ role: 'player', content: 'hi', createdAt: 1 })).toEqual({
      role: 'player',
      content: 'hi',
      createdAt: 1,
    });
  });

  it.each([
    ['bad role', { role: 'narrator', content: 'hi', createdAt: 1 }],
    ['missing content', { role: 'player', createdAt: 1 }],
    ['missing timestamp', { role: 'player', content: 'hi' }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseNarrativeMessage(input)).toThrow(ProviderValidationError);
  });
});

describe('structured/dialogue seams', () => {
  it('parses a structured response with an object payload', () => {
    expect(parseStructuredResponse({ data: { ok: true } })).toEqual({ data: { ok: true } });
    expect(() => parseStructuredResponse({ data: 'nope' })).toThrow(ProviderValidationError);
  });

  it('parses a dialogue response with a lines array', () => {
    expect(parseDialogueResponse({ lines: ['Hello.'] })).toEqual({ lines: ['Hello.'] });
    expect(() => parseDialogueResponse({ lines: 'Hello.' })).toThrow(ProviderValidationError);
  });
});

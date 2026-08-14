import { ProviderError, ProviderValidationError } from '../provider';
import { createHttpProvider, type GatewayFetch } from '../httpGateway';
import type { NarrativeRequest } from '../provider';

const VALID_RESPONSE = {
  narration: 'The bell rings.',
  situation: 'A quiet unease.',
  unresolvedThreads: [],
  proposal: null,
};

function okResponse(payload: unknown, kind = 'narrative') {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ kind, response: payload }),
  };
}

const REQUEST: NarrativeRequest = {
  dm: { setting: 'the school', tone: 'moody', authority: 'DEFAULT' },
  player: { name: 'Vince', archetype: 'student', notes: '' },
  messages: [],
  summary: '',
  situation: '',
  unresolvedThreads: [],
  turnCount: 0,
  input: '',
};

describe('HttpGatewayProvider', () => {
  it('posts JSON and returns the validated response', async () => {
    const fetchMock = vi.fn<GatewayFetch>(async () => okResponse(VALID_RESPONSE));
    const provider = createHttpProvider({ url: 'http://dm.local/narrate' }, fetchMock);

    const response = await provider.generateNarrative(REQUEST);

    expect(response).toEqual(VALID_RESPONSE);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://dm.local/narrate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: undefined,
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.kind).toBe('narrative');
    expect(body.request.input).toBe('');
    expect(body.request.player.name).toBe('Vince');
  });

  it('surfaces the model label in the provider label', () => {
    const provider = createHttpProvider({ url: 'http://x', model: 'my-model' }, vi.fn());
    expect(provider.label).toBe('Gateway (my-model)');
    expect(createHttpProvider({ url: 'http://x' }, vi.fn()).label).toBe('Gateway');
  });

  it('throws ProviderError on non-OK status', async () => {
    const fetchMock = vi.fn<GatewayFetch>(async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({}),
    }));
    const provider = createHttpProvider({ url: 'http://x' }, fetchMock);
    await expect(provider.generateNarrative(REQUEST)).rejects.toThrow(
      new ProviderError('Gateway responded 502 Bad Gateway'),
    );
  });

  it('throws ProviderError on non-JSON responses', async () => {
    const fetchMock = vi.fn<GatewayFetch>(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        throw new SyntaxError('bad json');
      },
    }));
    const provider = createHttpProvider({ url: 'http://x' }, fetchMock);
    await expect(provider.generateNarrative(REQUEST)).rejects.toThrow(
      'Gateway returned a non-JSON response',
    );
  });

  it('throws ProviderValidationError on malformed payloads', async () => {
    const fetchMock = vi.fn<GatewayFetch>(async () => okResponse({ narration: 42 }));
    const provider = createHttpProvider({ url: 'http://x' }, fetchMock);
    await expect(provider.generateNarrative(REQUEST)).rejects.toThrow(ProviderValidationError);
  });

  it('throws ProviderValidationError on a mismatched kind', async () => {
    const fetchMock = vi.fn<GatewayFetch>(async () => okResponse(VALID_RESPONSE, 'dialogue'));
    const provider = createHttpProvider({ url: 'http://x' }, fetchMock);
    await expect(provider.generateNarrative(REQUEST)).rejects.toThrow(
      'expected kind "narrative"',
    );
  });

  it('wraps network failures as ProviderError', async () => {
    const fetchMock = vi.fn<GatewayFetch>(async () => {
      throw new TypeError('fetch failed');
    });
    const provider = createHttpProvider({ url: 'http://x' }, fetchMock);
    await expect(provider.generateNarrative(REQUEST)).rejects.toThrow(
      'Gateway request failed: fetch failed',
    );
  });

  it('propagates AbortError when the signal aborts mid-request', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<GatewayFetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    const provider = createHttpProvider({ url: 'http://x' }, fetchMock);

    const pending = provider.generateNarrative(REQUEST, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('routes structured and dialogue calls with their own kinds', async () => {
    const fetchMock = vi.fn<GatewayFetch>(async () => okResponse({ data: { ok: true } }, 'structured'));
    const provider = createHttpProvider({ url: 'http://x' }, fetchMock);
    const structured = await provider.generateStructured({ system: 's', prompt: 'p' });
    expect(structured).toEqual({ data: { ok: true } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.kind).toBe('structured');
  });
});

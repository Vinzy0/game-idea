/**
 * HTTP gateway adapter: sends JSON to a configurable server endpoint.
 *
 * No API keys live in the browser — the only configuration is the endpoint
 * URL and an optional display-only model label. Response payloads are
 * validated defensively; every call supports AbortSignal.
 */
import {
  ProviderError,
  ProviderValidationError,
  isAbortError,
  type AIProvider,
  type DialogueRequest,
  type DialogueResponse,
  type NarrativeRequest,
  type NarrativeResponse,
  type StructuredRequest,
  type StructuredResponse,
} from './provider';
import {
  isRecord,
  parseDialogueResponse,
  parseNarrativeResponse,
  parseStructuredResponse,
} from './validate';

export interface GatewayConfig {
  url: string;
  /** Display-only label (e.g. the model name). Never a secret. */
  model?: string;
}

export type GatewayKind = 'narrative' | 'structured' | 'dialogue';

interface GatewayResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

/** Structural fetch seam so tests can inject a mock (jsdom has no fetch). */
export type GatewayFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<GatewayResponse>;

interface GatewayEnvelope {
  kind: GatewayKind;
  request: unknown;
}

export class HttpGatewayProvider implements AIProvider {
  readonly label: string;

  constructor(
    private readonly config: GatewayConfig,
    private readonly fetchImpl: GatewayFetch = globalThis.fetch as unknown as GatewayFetch,
  ) {
    const url = config.url.trim();
    if (url === '' || (!url.startsWith('/') && !/^https?:\/\//i.test(url))) {
      throw new ProviderError('Gateway URL must be an http(s) URL or a same-origin absolute path');
    }
    this.label =
      config.model && config.model.trim() !== '' ? `Gateway (${config.model})` : 'Gateway';
  }

  generateNarrative(request: NarrativeRequest, signal?: AbortSignal): Promise<NarrativeResponse> {
    return this.post('narrative', request, parseNarrativeResponse, signal);
  }

  generateStructured(request: StructuredRequest, signal?: AbortSignal): Promise<StructuredResponse> {
    return this.post('structured', request, parseStructuredResponse, signal);
  }

  generateDialogue(request: DialogueRequest, signal?: AbortSignal): Promise<DialogueResponse> {
    return this.post('dialogue', request, parseDialogueResponse, signal);
  }

  private async post<Req, Res>(
    kind: GatewayKind,
    request: Req,
    parse: (input: unknown) => Res,
    signal?: AbortSignal,
  ): Promise<Res> {
    let response: GatewayResponse;
    try {
      response = await this.fetchImpl(this.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, request } satisfies GatewayEnvelope),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      throw new ProviderError(
        `Gateway request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!response.ok) {
      throw new ProviderError(
        `Gateway responded ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      );
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      throw new ProviderError('Gateway returned a non-JSON response');
    }
    if (!isRecord(json)) {
      throw new ProviderValidationError('invalid gateway response: expected an object');
    }
    if (json.kind !== kind) {
      throw new ProviderValidationError(`invalid gateway response: expected kind "${kind}"`);
    }
    return parse(json.response);
  }
}

export function createHttpProvider(config: GatewayConfig, fetchImpl?: GatewayFetch): AIProvider {
  return new HttpGatewayProvider(config, fetchImpl);
}

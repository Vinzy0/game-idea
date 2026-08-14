/**
 * Provider-neutral AI contract (Phase 5).
 *
 * The application depends on `AIProvider`, never on a vendor SDK. Phase 5 uses
 * `generateNarrative`; `generateStructured` and `generateDialogue` are typed
 * seams reserved for Phase 6 (encounter generation) and Phase 7 (combat
 * dialogue) — deliberately generic, no domain-specific mechanics yet.
 *
 * Authority boundary: providers may only produce prose, situation summaries,
 * unresolved threads, and (for major irreversible changes) an approval
 * proposal. They can never mutate combat/mechanical state.
 */

export type NarrativeAuthority = 'PROTECTED' | 'DEFAULT' | 'UNRESTRICTED';

/** Player-chosen DM context: where the story lives and how much the DM may do. */
export interface DmContext {
  setting: string;
  tone: string;
  authority: NarrativeAuthority;
}

/** The player's character, as entered at story setup. */
export interface PlayerContext {
  name: string;
  archetype: string;
  notes: string;
}

export type NarrativeMessageRole = 'player' | 'dm' | 'system';

export interface NarrativeMessage {
  role: NarrativeMessageRole;
  content: string;
  createdAt: number;
}

/**
 * A major irreversible narrative change. Must never be applied silently:
 * the UI blocks the turn until the player approves (applies `situationAfter`)
 * or declines (changes nothing).
 */
export interface ApprovalProposal {
  id: string;
  summary: string;
  details: string;
  situationAfter: string;
}

export interface NarrativeRequest {
  dm: DmContext;
  player: PlayerContext;
  /** Bounded recent-message window (see src/story/context.ts). */
  messages: NarrativeMessage[];
  /** Rolling digest of the story so far (bounded, updated from DM narration). */
  summary: string;
  situation: string;
  unresolvedThreads: string[];
  turnCount: number;
  /** The player's latest action or words (empty string = opening the story). */
  input: string;
}

export interface NarrativeResponse {
  narration: string;
  situation: string;
  unresolvedThreads: string[];
  proposal: ApprovalProposal | null;
}

/** Generic seam for Phase 6 structured output (encounter specs). */
export interface StructuredRequest {
  system: string;
  prompt: string;
}

export interface StructuredResponse {
  data: Record<string, unknown>;
}

/** Generic seam for Phase 7 combat dialogue. */
export interface DialogueRequest {
  speaker: string;
  prompt: string;
}

export interface DialogueResponse {
  lines: string[];
}

export interface AIProvider {
  /** Human-readable provider label; must be unmistakable (e.g. contains "Demo"). */
  readonly label: string;
  generateNarrative(request: NarrativeRequest, signal?: AbortSignal): Promise<NarrativeResponse>;
  generateStructured(request: StructuredRequest, signal?: AbortSignal): Promise<StructuredResponse>;
  generateDialogue(request: DialogueRequest, signal?: AbortSignal): Promise<DialogueResponse>;
}

/** A provider-level failure (transport, status, or invalid payload). */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** A provider payload failed shape validation. */
export class ProviderValidationError extends ProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderValidationError';
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

export function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

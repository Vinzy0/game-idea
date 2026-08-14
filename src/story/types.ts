/**
 * Local story state (Phase 5). In-memory state carries transient UI phase
 * fields; StoryData is the persisted subset (no phase/error — those are
 * derived or transient).
 */
import type { ApprovalProposal, DmContext, NarrativeMessage, PlayerContext } from '../ai/provider';

export const STORY_VERSION = 1;

export type StoryPhase = 'IDLE' | 'LOADING' | 'PENDING_APPROVAL' | 'ERROR';

export interface StoryState {
  version: typeof STORY_VERSION;
  dm: DmContext;
  player: PlayerContext;
  messages: NarrativeMessage[];
  /** Rolling current-situation summary the DM may update each turn. */
  situation: string;
  /** Bounded rolling digest of the story so far, updated from DM narration. */
  summary: string;
  unresolvedThreads: string[];
  /** Number of player turns completed (DM replies applied). */
  turnCount: number;
  /** Non-null while a major irreversible change awaits player approval. */
  pendingProposal: ApprovalProposal | null;
  phase: StoryPhase;
  lastError: string | null;
  startedAt: number;
  updatedAt: number;
}

export type StoryData = Omit<StoryState, 'phase' | 'lastError'>;

/**
 * Deterministic story state transitions (Phase 5). Pure functions, no
 * managers: every mutation returns a new StoryState, so the flow is
 * unit-testable and reload/resume just restores persisted data.
 */
import type { NarrativeMessage, NarrativeResponse, PlayerContext } from '../ai/provider';
import type { DmContext } from '../ai/provider';
import { STORY_VERSION, type StoryData, type StoryState } from './types';

export function createStory(opts: {
  dm: DmContext;
  player: PlayerContext;
  now?: number;
}): StoryState {
  const now = opts.now ?? Date.now();
  return {
    version: STORY_VERSION,
    dm: opts.dm,
    player: opts.player,
    messages: [],
    situation: '',
    summary: '',
    unresolvedThreads: [],
    turnCount: 0,
    pendingProposal: null,
    phase: 'LOADING',
    lastError: null,
    startedAt: now,
    updatedAt: now,
  };
}

/** Append the player's message and mark the turn as awaiting the DM. */
export function submitInput(story: StoryState, input: string, now?: number): StoryState {
  const trimmed = input.trim();
  if (story.phase !== 'IDLE' || trimmed === '') {
    return story;
  }
  const ts = now ?? Date.now();
  const message: NarrativeMessage = { role: 'player', content: trimmed, createdAt: ts };
  return {
    ...story,
    messages: [...story.messages, message],
    turnCount: story.turnCount + 1,
    phase: 'LOADING',
    lastError: null,
    updatedAt: ts,
  };
}

/**
 * Apply the DM's narrative response to a LOADING (or ERROR, on retry) story.
 * Prose always extends history; proposals gate major changes — except under
 * UNRESTRICTED authority, where they auto-apply but are still recorded in a
 * visible system message (never silently).
 */
export function applyResponse(
  story: StoryState,
  response: NarrativeResponse,
  now?: number,
): StoryState {
  if (story.phase !== 'LOADING' && story.phase !== 'ERROR') {
    return story;
  }
  const ts = now ?? Date.now();
  const dmMessage: NarrativeMessage = { role: 'dm', content: response.narration, createdAt: ts };
  const proposal = response.proposal ?? null;
  const summary = appendSummary(story.summary, response.narration);
  if (proposal !== null && story.dm.authority === 'UNRESTRICTED') {
    const note: NarrativeMessage = {
      role: 'system',
      content: `Auto-approved (unrestricted authority): ${proposal.summary}`,
      createdAt: ts,
    };
    return {
      ...story,
      messages: [...story.messages, dmMessage, note],
      situation: proposal.situationAfter,
      summary,
      unresolvedThreads: response.unresolvedThreads,
      pendingProposal: null,
      phase: 'IDLE',
      lastError: null,
      updatedAt: ts,
    };
  }
  return {
    ...story,
    messages: [...story.messages, dmMessage],
    situation: response.situation,
    summary,
    unresolvedThreads: response.unresolvedThreads,
    pendingProposal: proposal,
    phase: proposal === null ? 'IDLE' : 'PENDING_APPROVAL',
    lastError: null,
    updatedAt: ts,
  };
}

/** Player decision on a pending proposal. Approved → situationAfter is canon. */
export function resolveProposal(story: StoryState, approved: boolean, now?: number): StoryState {
  const proposal = story.pendingProposal;
  if (story.phase !== 'PENDING_APPROVAL' || proposal === null) {
    return story;
  }
  const ts = now ?? Date.now();
  const record: NarrativeMessage = {
    role: 'system',
    content: approved ? `Approved: ${proposal.summary}` : `Declined: ${proposal.summary}`,
    createdAt: ts,
  };
  return {
    ...story,
    messages: [...story.messages, record],
    situation: approved ? proposal.situationAfter : story.situation,
    pendingProposal: null,
    phase: 'IDLE',
    lastError: null,
    updatedAt: ts,
  };
}

/** A failed in-flight request leaves the story recoverable via retry. */
export function markError(story: StoryState, message: string, now?: number): StoryState {
  if (story.phase !== 'LOADING') {
    return story;
  }
  return { ...story, phase: 'ERROR', lastError: message, updatedAt: now ?? Date.now() };
}

const SUMMARY_MAX = 1200;

/** Deterministic bounded rolling digest: DM narration only, oldest text dropped first. */
function appendSummary(prev: string, narration: string): string {
  const joined = prev === '' ? narration : `${prev}\n${narration}`;
  if (joined.length <= SUMMARY_MAX) {
    return joined;
  }
  return `…(earlier omitted)\n${joined.slice(-SUMMARY_MAX)}`;
}

/** Rehydrate persisted data; phase derives from whether a proposal is pending. */
export function restoreStory(data: StoryData): StoryState {
  return {
    ...data,
    phase: data.pendingProposal === null ? 'IDLE' : 'PENDING_APPROVAL',
    lastError: null,
  };
}

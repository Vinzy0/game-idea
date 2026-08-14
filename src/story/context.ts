/**
 * Bounded provider context (Phase 5). The DM only ever sees a small recent
 * message window; full retrieval/summarization is Phase 9's long-term memory.
 */
import type { NarrativeMessage, NarrativeRequest } from '../ai/provider';
import type { StoryState } from './types';

export const MAX_CONTEXT_MESSAGES = 8;

export function boundedMessages(
  messages: NarrativeMessage[],
  max = MAX_CONTEXT_MESSAGES,
): NarrativeMessage[] {
  const bounded = max <= 0 ? [] : messages.slice(-max);
  return bounded.map((message) => ({ ...message }));
}

export function buildNarrativeRequest(story: StoryState, input: string): NarrativeRequest {
  const latest = story.messages[story.messages.length - 1];
  const priorMessages =
    input.trim() !== '' && latest?.role === 'player' && latest.content === input
      ? story.messages.slice(0, -1)
      : story.messages;
  return {
    dm: { ...story.dm },
    player: { ...story.player },
    messages: boundedMessages(priorMessages),
    summary: story.summary,
    situation: story.situation,
    unresolvedThreads: [...story.unresolvedThreads],
    turnCount: story.turnCount,
    input,
  };
}

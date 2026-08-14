/**
 * Focused hook owning the DM chat lifecycle: resume-from-storage, start,
 * send, retry (without duplicating the player message), proposal approval,
 * and reset. All provider calls are abortable; stale responses are dropped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError, type AIProvider, type DmContext, type PlayerContext } from '../ai/provider';
import { buildNarrativeRequest } from '../story/context';
import {
  applyResponse,
  createStory,
  markError,
  resolveProposal,
  submitInput,
} from '../story/state';
import { clearStory, loadStory, saveStory } from '../story/storage';
import type { StoryState } from '../story/types';

export interface NarrativeDmApi {
  story: StoryState | null;
  providerLabel: string;
  starting: boolean;
  startStory(player: PlayerContext, dm: DmContext): Promise<void>;
  send(input: string): void;
  retry(): void;
  approveProposal(): void;
  declineProposal(): void;
  resetStory(): void;
}

export function useNarrativeDm(provider: AIProvider): NarrativeDmApi {
  const [story, setStory] = useState<StoryState | null>(() => loadStory());
  const [starting, setStarting] = useState(false);

  const seqRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastInputRef = useRef('');

  useEffect(
    () => () => {
      seqRef.current += 1;
      controllerRef.current?.abort();
    },
    [],
  );

  const runRequest = useCallback(
    async (base: StoryState, input: string) => {
      const seq = ++seqRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response = await provider.generateNarrative(
          buildNarrativeRequest(base, input),
          controller.signal,
        );
        if (seq !== seqRef.current || controller.signal.aborted) {
          return; // stale: a newer request owns this turn
        }
        const next = applyResponse(base, response);
        setStory(next);
        saveStory(next);
      } catch (err) {
        if (seq !== seqRef.current || controller.signal.aborted || isAbortError(err)) {
          return;
        }
        const next = markError(base, err instanceof Error ? err.message : String(err));
        setStory(next);
        saveStory(next);
      }
    },
    [provider],
  );

  const startStory = useCallback(
    async (player: PlayerContext, dm: DmContext) => {
      if (starting || story !== null) {
        return;
      }
      setStarting(true);
      const initial = createStory({ player, dm });
      lastInputRef.current = '';
      setStory(initial);
      saveStory(initial);
      try {
        await runRequest(initial, '');
      } finally {
        setStarting(false);
      }
    },
    [starting, story, runRequest],
  );

  const send = useCallback(
    (raw: string) => {
      const input = raw.trim();
      if (input === '' || story === null || story.phase !== 'IDLE') {
        return;
      }
      lastInputRef.current = input;
      const next = submitInput(story, input);
      setStory(next);
      saveStory(next);
      void runRequest(next, input);
    },
    [story, runRequest],
  );

  const retry = useCallback(() => {
    const input = lastInputRef.current;
    if (story === null || story.phase !== 'ERROR') {
      return;
    }
    const retrying: StoryState = { ...story, phase: 'LOADING', lastError: null };
    setStory(retrying);
    saveStory(retrying);
    void runRequest(retrying, input);
  }, [story, runRequest]);

  const approveProposal = useCallback(() => {
    if (story === null || story.phase !== 'PENDING_APPROVAL') {
      return;
    }
    const next = resolveProposal(story, true);
    setStory(next);
    saveStory(next);
  }, [story]);

  const declineProposal = useCallback(() => {
    if (story === null || story.phase !== 'PENDING_APPROVAL') {
      return;
    }
    const next = resolveProposal(story, false);
    setStory(next);
    saveStory(next);
  }, [story]);

  const resetStory = useCallback(() => {
    seqRef.current += 1;
    controllerRef.current?.abort();
    clearStory();
    setStory(null);
    setStarting(false);
    lastInputRef.current = '';
  }, []);

  return {
    story,
    providerLabel: provider.label,
    starting,
    startStory,
    send,
    retry,
    approveProposal,
    declineProposal,
    resetStory,
  };
}

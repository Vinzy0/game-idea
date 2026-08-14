/**
 * Versioned localStorage persistence for one local story (Phase 5).
 * Fails closed: corrupt, unparseable, or wrong-version data yields null and
 * the app starts a fresh story. Storage failures never throw into the UI.
 */
import type { ApprovalProposal, DmContext, NarrativeMessage, PlayerContext } from '../ai/provider';
import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
  isString,
  isStringArray,
  parseApprovalProposal,
  parseNarrativeMessage,
} from '../ai/validate';
import { restoreStory } from './state';
import { STORY_VERSION, type StoryData, type StoryState } from './types';

export const STORAGE_KEY = 'ai-dm-tactical-rpg.story.v1';

export function saveStory(story: StoryState): void {
  const data: StoryData = {
    version: story.version,
    dm: story.dm,
    player: story.player,
    messages: story.messages,
    situation: story.situation,
    summary: story.summary,
    unresolvedThreads: story.unresolvedThreads,
    turnCount: story.turnCount,
    pendingProposal: story.pendingProposal,
    startedAt: story.startedAt,
    updatedAt: story.updatedAt,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota / private mode: the session still works, persistence just lapses.
  }
}

/** Returns null on missing, corrupt, or unsupported data (fail closed). */
export function loadStory(): StoryState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const data = parseStoryData(JSON.parse(raw));
    return data === null ? null : restoreStory(data);
  } catch {
    return null;
  }
}

export function clearStory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — clearing is best-effort.
  }
}

function parseStoryData(input: unknown): StoryData | null {
  if (!isRecord(input)) return null;
  if (input.version !== STORY_VERSION) return null;

  if (!isRecord(input.dm)) return null;
  const dm = parseDmContext(input.dm);
  if (dm === null) return null;
  if (!isRecord(input.player)) return null;
  const player = parsePlayerContext(input.player);
  if (player === null) return null;
  if (!Array.isArray(input.messages)) return null;
  let messages: NarrativeMessage[];
  try {
    messages = input.messages.map(parseNarrativeMessage);
  } catch {
    return null;
  }
  if (!isString(input.situation)) return null;
  if (!isString(input.summary)) return null;
  if (!isStringArray(input.unresolvedThreads)) return null;
  if (typeof input.turnCount !== 'number' || !Number.isInteger(input.turnCount) || input.turnCount < 0) {
    return null;
  }
  let pendingProposal: ApprovalProposal | null = null;
  if (input.pendingProposal !== null && input.pendingProposal !== undefined) {
    try {
      pendingProposal = parseApprovalProposal(input.pendingProposal);
    } catch {
      return null;
    }
  }
  if (!isFiniteNumber(input.startedAt) || !isFiniteNumber(input.updatedAt)) {
    return null;
  }

  return {
    version: STORY_VERSION,
    dm,
    player,
    messages,
    situation: input.situation,
    summary: input.summary,
    unresolvedThreads: input.unresolvedThreads,
    turnCount: input.turnCount,
    pendingProposal,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
  };
}

function parseDmContext(value: Record<string, unknown>): DmContext | null {
  if (!isString(value.setting) || !isString(value.tone)) {
    return null;
  }
  if (value.authority !== 'PROTECTED' && value.authority !== 'DEFAULT' && value.authority !== 'UNRESTRICTED') {
    return null;
  }
  return { setting: value.setting, tone: value.tone, authority: value.authority };
}

function parsePlayerContext(value: Record<string, unknown>): PlayerContext | null {
  if (!isNonEmptyString(value.name) || !isString(value.archetype) || !isString(value.notes)) {
    return null;
  }
  return { name: value.name, archetype: value.archetype, notes: value.notes };
}

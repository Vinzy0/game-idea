/**
 * Deterministic offline demo provider.
 *
 * Unmistakably labeled "Demo": it produces scripted beats woven from the
 * request context (player, setting, current situation, unresolved threads,
 * and the player's latest input) so multi-turn conversation stays coherent
 * without pretending to be a live AI. Pure, deterministic — no randomness.
 */
import {
  abortError,
  type AIProvider,
  type ApprovalProposal,
  type DialogueRequest,
  type DialogueResponse,
  type NarrativeRequest,
  type NarrativeResponse,
  type StructuredRequest,
  type StructuredResponse,
} from './provider';
import { demoDialogue, demoStructured } from './demoEncounter';

const DEMO_DELAY_MS = 120;

interface BeatCtx {
  name: string;
  archetype: string;
  setting: string;
  situation: string;
  input: string;
  threads: string[];
}

type Text = string | ((ctx: BeatCtx) => string);

interface DemoBeat {
  scene: Text;
  situation: Text;
  threads: string[] | ((ctx: BeatCtx) => string[]);
  proposal?: (ctx: BeatCtx) => ApprovalProposal;
}

const OPENING_BEAT: DemoBeat = {
  scene: (ctx) =>
    `The bell rings. You are ${ctx.name}, a ${ctx.archetype}, standing in the corridor of ${ctx.setting}. The air is wrong today — too still, too watchful. At the far end of the hall, the lights stutter. Somewhere, a door slams. Something is about to happen.`,
  situation: 'A quiet unease hangs over the school; the lights at the far end of the hall stutter.',
  threads: ['Find out what is wrong with the lights'],
};

/** Scripted beats. Index = player turn number minus one; the last beat loops forever. */
const BEATS: DemoBeat[] = [
  {
    scene: (ctx) =>
      `You move — "${ctx.input}". A locker slams behind you, and Riley Vasquez — the girl who once bent a fire hydrant with her mind — falls into step beside you. "You felt that too, right?" She nods toward the stuttering lights.`,
    situation: 'Riley Vasquez has approached you about the stuttering lights at the far end of the hall.',
    threads: ['Investigate the stuttering lights with Riley'],
  },
  {
    scene: (ctx) =>
      `You — "${ctx.input}". The stutter ripples the length of the hall, and the PA crackles: "All students report to the gymnasium for a mandatory assembly." A whisper passes through the crowd — the word "inspection".`,
    situation: 'A mandatory assembly has been called; rumors of an "inspection" circulate.',
    threads: ['Attend the assembly', 'Slip away to investigate the lights'],
  },
  {
    scene: (ctx) =>
      `You — "${ctx.input}". At the gym doors, the hall monitor with chrome eyes blocks your path. He taps a tablet. "${ctx.name}, you're on the list. One more incident, and you're out of ${ctx.setting} — permanently. No appeals."`,
    situation: 'The chrome-eyed hall monitor has blocked you at the gymnasium doors.',
    threads: ['Attend the assembly', "Stay on the hall monitor's good side"],
    proposal: (ctx) => ({
      id: 'expulsion-threat',
      summary: `${ctx.name} is threatened with permanent expulsion after one more incident.`,
      details: `The hall monitor claims ${ctx.name} is on a list: one further incident means permanent removal from ${ctx.setting}. This is major and irreversible — the DM will not make it canon without your approval.`,
      situationAfter: `${ctx.name} is on the hall monitor's expulsion list — one more incident means permanent removal from ${ctx.setting}.`,
    }),
  },
  {
    scene: (ctx) =>
      `You — "${ctx.input}". The gym bleachers groan under a hundred students. Principal Okafor raises a hand, and the lights dim. "As of today, these grounds are under official observation." Someone in the back row snorts.`,
    situation: 'The assembly is underway; the school is officially under observation.',
    threads: ['Find out what the "observation" really is'],
  },
  {
    scene: (ctx) =>
      `You — "${ctx.input}". Your phone buzzes — an unknown number. "The lights weren't an accident. Maintenance shed. After last bell. — R."`,
    situation: 'An anonymous message invites you to the maintenance shed after last bell.',
    threads: ['Meet the anonymous contact at the maintenance shed'],
  },
  {
    // Generic continuation: stays coherent by weaving the live context.
    scene: (ctx) =>
      `You press on — "${ctx.input}". ${
        ctx.situation
      } The threads still pull at you: ${ctx.threads.join('; ') || 'nothing, yet'}. The school holds its breath, waiting to see what you do next.`,
    situation: (ctx) => ctx.situation,
    threads: (ctx) => ctx.threads,
  },
];

function resolveText(text: Text, ctx: BeatCtx): string {
  return typeof text === 'function' ? text(ctx) : text;
}

function resolveThreads(threads: DemoBeat['threads'], ctx: BeatCtx): string[] {
  return typeof threads === 'function' ? threads(ctx) : [...threads];
}

/** Marker the app prepends to the player input when a battle just ended. */
export const ENCOUNTER_RESULT_PREFIX = '[Encounter result]';

/**
 * Pure narrative engine: same request always yields the same response.
 * When the latest player input reports a finished battle (PRD §72), the DM
 * narrates the aftermath from the mechanical facts instead of the beat list.
 */
export function demoNarrative(request: NarrativeRequest): NarrativeResponse {
  const ctx: BeatCtx = {
    name: request.player.name,
    archetype: request.player.archetype,
    setting: request.dm.setting,
    situation: request.situation,
    input: request.input,
    threads: request.unresolvedThreads,
  };
  const isOpening = request.turnCount === 0 && request.input.trim() === '';
  const beat = isOpening
    ? OPENING_BEAT
    : BEATS[Math.min(Math.max(request.turnCount - 1, 0), BEATS.length - 1)];

  if (request.input.startsWith(ENCOUNTER_RESULT_PREFIX)) {
    const facts = request.input.slice(ENCOUNTER_RESULT_PREFIX.length).trim();
    return {
      narration: `The last mask clatters to the tile beside the lockers. ${facts} ${ctx.name} stands breathing hard in the sudden quiet — the hallway lights steadier now, as if the building itself exhales. Whatever the masks wanted, they failed to take it. Word of this will spread by morning.`,
      situation: `${ctx.name} has won the hallway fight; the masked students are down and the school is quiet again.`,
      unresolvedThreads: ['Find out who sent the masked students'],
      proposal: null,
    };
  }

  return {
    narration: resolveText(beat.scene, ctx),
    situation: resolveText(beat.situation, ctx),
    unresolvedThreads: resolveThreads(beat.threads, ctx),
    proposal: beat.proposal ? beat.proposal(ctx) : null,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

export class DemoProvider implements AIProvider {
  readonly label = 'Demo (offline — deterministic)';

  generateNarrative(request: NarrativeRequest, signal?: AbortSignal): Promise<NarrativeResponse> {
    return delay(DEMO_DELAY_MS, signal).then(() => {
      throwIfAborted(signal);
      return demoNarrative(request);
    });
  }

  // Structured/dialogue: Phase 6/7 seams backed by deterministic demo content.
  generateStructured(request: StructuredRequest, signal?: AbortSignal): Promise<StructuredResponse> {
    return delay(DEMO_DELAY_MS, signal).then(() => {
      throwIfAborted(signal);
      return demoStructured(request);
    });
  }

  generateDialogue(request: DialogueRequest, signal?: AbortSignal): Promise<DialogueResponse> {
    return delay(DEMO_DELAY_MS, signal).then(() => {
      throwIfAborted(signal);
      return demoDialogue(request);
    });
  }
}

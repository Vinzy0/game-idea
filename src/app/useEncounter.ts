/**
 * Encounter generation lifecycle (Phase 6) + combat Talk/barks (Phase 7),
 * owned by the app shell. The provider proposes; `parseEncounterSpec` +
 * `buildEncounter` dispose; the TacticalEngine plays. Battle results flow
 * back to the DM chat as the player's next input (PRD §72 result step).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AIProvider, StructuredRequest } from '../ai/provider';
import { parseStructuredResponse } from '../ai/validate';
import { ENCOUNTER_RESULT_PREFIX } from '../ai/demoProvider';
import { TacticalEngine } from '../game/combat/engine';
import type { EncounterResult } from '../game/combat/events';
import { buildEncounter, type BuiltEncounter } from '../game/encounter/build';
import { parseEncounterSpec } from '../game/encounter/spec';
import { summarizeEncounter } from '../game/encounter/summarize';
import {
  buildBarkRequests,
  buildDialoguePrompt,
  requestCombatLine,
} from '../game/dialogue/combatDialogue';
import type { BubbleManager } from '../game/dialogue/bubbles';
import type { NarrativeDmApi } from './useNarrativeDm';

export type EncounterStage =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      engine: TacticalEngine;
      encounter: BuiltEncounter;
      warnings: string[];
    };

const ENCOUNTER_SYSTEM_PROMPT =
  'You are the encounter planner for a turn-based tactical RPG. Reply ONLY with JSON matching the encounter-spec schema: {kind:"encounter-spec", version:1, title, narrativeContext, width, height, objects:[{kind,x,y}] with kind in WALL|DESK|LOCKER|DOOR|BARREL|HAZARD, terrain:[{x,y}], units:[{id,name,role,hp,movement,x,y,abilities,intent}] with role in PLAYER|ALLY|ENEMY and abilities from punch|fireball|force-push. 6-40 tiles per side, exactly one PLAYER unit, 1-5 ENEMY units, spawns on distinct open tiles, enemies must be reachable from the player.';

export function useEncounter(
  provider: AIProvider,
  dm: NarrativeDmApi,
  bubbles: BubbleManager,
): {
  stage: EncounterStage;
  generate: () => void;
  dismiss: () => void;
  talk: (playerLine: string) => void;
  talkBusy: boolean;
  talkTargetName: string | null;
} {
  const [stage, setStage] = useState<EncounterStage>({ kind: 'idle' });
  const [talkBusy, setTalkBusy] = useState(false);
  const seqRef = useRef(0);
  const sentResultIds = useRef(new Set<string>());
  const spokenBarks = useRef(new Set<string>());

  const story = dm.story;
  const storyRef = useRef(story);
  storyRef.current = story;

  const generate = useCallback(() => {
    if (stage.kind === 'generating') return;
    const seq = ++seqRef.current;
    setStage({ kind: 'generating' });
    const current = storyRef.current;
    const request: StructuredRequest = {
      system: ENCOUNTER_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        playerName: current?.player.name ?? 'Alex',
        archetype: current?.player.archetype ?? 'student with powers',
        situation: current?.situation ?? '',
        unresolvedThreads: current?.unresolvedThreads ?? [],
        summary: current?.summary ?? '',
      }),
    };
    provider
      .generateStructured(request)
      .then((response) => {
        const spec = parseEncounterSpec(parseStructuredResponse(response).data);
        if (spec === null) {
          throw new Error('AI encounter failed schema validation');
        }
        const built = buildEncounter(spec);
        if (!built.ok) {
          throw new Error(`Encounter rejected by validator: ${built.errors.join('; ')}`);
        }
        if (seq !== seqRef.current) return;
        spokenBarks.current.clear();
        sentResultIds.current.clear();
        setStage({
          kind: 'ready',
          engine: new TacticalEngine(built.encounter.config),
          encounter: built.encounter,
          warnings: built.report.warnings,
        });
      })
      .catch((err: unknown) => {
        if (seq !== seqRef.current) return;
        setStage({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, [provider, stage.kind]);

  const dismiss = useCallback(() => {
    seqRef.current += 1;
    bubbles.clear();
    setStage({ kind: 'idle' });
  }, [bubbles]);

  // Watch the active encounter for victory; hand structured facts to the DM.
  useEffect(() => {
    if (stage.kind !== 'ready') return;
    const engine = stage.engine;
    const unsubscribe = engine.subscribe(() => {
      const result: EncounterResult | null = engine.state.encounterResult;
      if (result === null || result.outcome !== 'VICTORY') return;
      if (sentResultIds.current.has(result.id)) return;
      sentResultIds.current.add(result.id);
      const names = new Map(engine.state.units.map((unit) => [unit.id, unit.name]));
      sendResultWhenIdle(summarizeEncounter(result, names));
    });
    return unsubscribe;
    // dm identity churns per render; storyRef bridges that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Triggered villain barks (PRD §60): meaningful moments only, deduped.
  useEffect(() => {
    if (stage.kind !== 'ready') return;
    const engine = stage.engine;
    let lastSeenSeq = -1;
    const unsubscribe = engine.subscribe(() => {
      const fresh = engine.state.events.filter((event) => event.seq > lastSeenSeq);
      if (fresh.length === 0) return;
      lastSeenSeq = fresh[fresh.length - 1].seq;
      const current = storyRef.current;
      const situation = current?.situation ?? '';
      for (const bark of buildBarkRequests(fresh, engine)) {
        const key = `${bark.unitId}:${bark.trigger}`;
        if (spokenBarks.current.has(key)) continue;
        spokenBarks.current.add(key);
        const intent = encounterIntent(stage.encounter, bark.unitId);
        void requestCombatLine(provider, {
          speaker: bark.unitName,
          prompt: buildDialoguePrompt({
            speakerName: bark.unitName,
            speakerIntent: intent,
            listenerName: current?.player.name ?? 'the hero',
            storySituation: situation,
            trigger: bark.trigger,
          }),
        })
          .then((line) => bubbles.say(bark.unitId, line))
          .catch(() => {
            /* barks are non-critical (PRD §75) */
          });
      }
    });
    return unsubscribe;
  }, [stage, provider, bubbles]);

  const talkTarget = useMemo(() => {
    if (stage.kind !== 'ready') return null;
    const engine = stage.engine;
    const hero = engine.state.units.find((unit) => unit.team === 'PLAYER' && unit.hp > 0);
    const enemies = engine.state.units
      .filter((unit) => unit.team === 'ENEMY' && unit.hp > 0)
      .sort(
        (a, b) =>
          (hero === undefined ? 0 : manhattan(hero.position, a.position)) -
          (hero === undefined ? 0 : manhattan(hero.position, b.position)),
      );
    return enemies[0] ?? null;
  }, [stage]);

  const talk = useCallback(
    (playerLine: string) => {
      const target = talkTarget;
      const current = storyRef.current;
      if (stage.kind !== 'ready' || target === null || talkBusy) return;
      const trimmed = playerLine.trim();
      if (trimmed === '') return;
      setTalkBusy(true);
      bubbles.say(target.id, '…');
      const hero = stage.engine.state.units.find((unit) => unit.team === 'PLAYER' && unit.hp > 0);
      void requestCombatLine(provider, {
        speaker: target.name,
        prompt: buildDialoguePrompt({
          speakerName: target.name,
          speakerIntent: encounterIntent(stage.encounter, target.id),
          listenerName: hero?.name ?? current?.player.name ?? 'the hero',
          storySituation: current?.situation ?? '',
          playerLine: trimmed,
          trigger: 'the hero spoke mid-fight',
        }),
      })
        .then((line) => bubbles.say(target.id, line))
        .catch((err: unknown) => {
          bubbles.say(target.id, '…says nothing. The fight continues.');
          void err;
        })
        .finally(() => setTalkBusy(false));
    },
    [stage, talkTarget, talkBusy, provider, bubbles],
  );

  // The battle result enters the chat as the player's next input once the
  // DM is idle; a pending chat turn delays it briefly (PRD §72 result step).
  const sendResultWhenIdle = useCallback(
    (facts: string, attempt = 0) => {
      if (storyRef.current === null) return;
      if (storyRef.current.phase === 'IDLE' || attempt >= 20) {
        dm.send(`${ENCOUNTER_RESULT_PREFIX} ${facts}`);
        return;
      }
      setTimeout(() => sendResultWhenIdle(facts, attempt + 1), 500);
    },
    [dm],
  );

  return { stage, generate, dismiss, talk, talkBusy, talkTargetName: talkTarget?.name ?? null };
}

function encounterIntent(encounter: BuiltEncounter, unitId: string): string {
  return encounter.intents[unitId] ?? 'win this fight';
}

function manhattan(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

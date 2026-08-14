# AI Contracts

Phase 5 introduces the provider-neutral narrative boundary. Provider SDKs, credentials, and transport-specific response types must not enter React, story state, or the tactical engine.

## Provider Interface

`src/ai/provider.ts` defines the application-facing interface:

```text
AIProvider
  generateNarrative(NarrativeRequest) -> NarrativeResponse
  generateStructured(StructuredRequest) -> StructuredResponse
  generateDialogue(DialogueRequest) -> DialogueResponse
```

Phase 5 calls only `generateNarrative`. The structured and dialogue methods reserve provider-independent seams for Phases 6 and 7; they do not yet authorize encounter generation or combat dialogue.

## Narrative Request

A narrative request contains only narrative context:

- player name, archetype, and notes;
- setting, tone, and selected DM authority;
- a bounded rolling narrative digest;
- current situation and unresolved threads;
- at most the eight most recent prior messages;
- turn count and the latest player input.

The latest player input is sent once as `input`; it is excluded from the recent-message window when it is already the newest stored player message.

## Narrative Response

The provider may return narration, an updated narrative situation, unresolved narrative threads, and an optional `ApprovalProposal` for a major irreversible change.

It cannot return HP, positions, actions, abilities, objectives, encounter participants, or any other mechanical mutation. Unknown response fields are discarded and required fields are validated before state changes.

## Narrative Authority

- `PROTECTED` and `DEFAULT`: a major irreversible proposal blocks the next turn until the player approves or declines it. `situationAfter` is not applied before approval.
- `UNRESTRICTED`: the player's setup choice is standing authorization to apply a proposal, but the application still records a visible system message. The change is never silent.
- Provider prose is narrative evidence, not tactical truth. Combat state remains owned by `TacticalEngine`.

## HTTP Gateway

The browser may call one trusted server-side gateway. It never receives or stores a provider API key.

Request envelope:

```json
{
  "kind": "narrative",
  "request": {}
}
```

Response envelope:

```json
{
  "kind": "narrative",
  "response": {}
}
```

The response `kind` must match the request. Transport failures, non-JSON bodies, wrong envelopes, and invalid operation payloads fail without mutating story state. Requests support cancellation through `AbortSignal`.

Browser-visible configuration is limited to `VITE_AI_PROVIDER`, `VITE_AI_GATEWAY_URL`, and the display-only `VITE_AI_MODEL_LABEL`. Secrets belong on the gateway server.

## Demo Provider

The default provider is a deterministic offline demo. Its label always contains `Demo`; it must never be presented as a live model. It exists so narrative flow, persistence, approvals, and browser QA work without credentials.

## Story Persistence

Phase 5 stores one versioned story in local storage: player/DM context, the local transcript, a bounded rolling digest, current situation, unresolved threads, turn count, timestamps, and any pending approval proposal.

Corrupt or unknown-version data fails closed to story setup. Full Markdown memory, semantic retrieval, canon conflict handling, and multi-story saves remain Phase 9 work.

## Explicit Non-Goals

- no `ScenarioSpec` or AI-generated encounter loading (Phase 6);
- no live combat dialogue (Phase 7);
- no story-combat-story integration (Phase 8);
- no long-term memory hierarchy or retrieval engine (Phase 9).

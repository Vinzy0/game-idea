/**
 * Defensive shape validation for provider payloads and persisted data.
 * All parsers throw ProviderValidationError on malformed input and return
 * freshly constructed objects with only the known fields (extras stripped).
 */
import {
  ProviderValidationError,
  type ApprovalProposal,
  type DialogueResponse,
  type NarrativeMessage,
  type NarrativeResponse,
  type StructuredResponse,
} from './provider';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function parseNarrativeMessage(value: unknown): NarrativeMessage {
  if (!isRecord(value)) {
    throw new ProviderValidationError('invalid message: expected an object');
  }
  const { role, content, createdAt } = value;
  if (role !== 'player' && role !== 'dm' && role !== 'system') {
    throw new ProviderValidationError('invalid message: bad role');
  }
  if (!isString(content)) {
    throw new ProviderValidationError('invalid message: content must be a string');
  }
  if (!isFiniteNumber(createdAt)) {
    throw new ProviderValidationError('invalid message: createdAt must be a number');
  }
  return { role, content, createdAt };
}

export function parseApprovalProposal(value: unknown): ApprovalProposal {
  if (!isRecord(value)) {
    throw new ProviderValidationError('invalid proposal: expected an object');
  }
  const { id, summary, details, situationAfter } = value;
  if (!isNonEmptyString(id)) {
    throw new ProviderValidationError('invalid proposal: id must be a non-empty string');
  }
  if (!isNonEmptyString(summary)) {
    throw new ProviderValidationError('invalid proposal: summary must be a non-empty string');
  }
  if (!isNonEmptyString(details)) {
    throw new ProviderValidationError('invalid proposal: details must be a non-empty string');
  }
  if (!isNonEmptyString(situationAfter)) {
    throw new ProviderValidationError(
      'invalid proposal: situationAfter must be a non-empty string',
    );
  }
  return { id, summary, details, situationAfter };
}

export function parseNarrativeResponse(input: unknown): NarrativeResponse {
  if (!isRecord(input)) {
    throw new ProviderValidationError('invalid narrative response: expected an object');
  }
  const { narration, situation, unresolvedThreads, proposal } = input;
  if (!isNonEmptyString(narration)) {
    throw new ProviderValidationError(
      'invalid narrative response: narration must be a non-empty string',
    );
  }
  if (!isString(situation)) {
    throw new ProviderValidationError('invalid narrative response: situation must be a string');
  }
  if (!isStringArray(unresolvedThreads)) {
    throw new ProviderValidationError(
      'invalid narrative response: unresolvedThreads must be a string array',
    );
  }
  const parsedProposal =
    proposal === null || proposal === undefined ? null : parseApprovalProposal(proposal);
  return { narration, situation, unresolvedThreads, proposal: parsedProposal };
}

export function parseStructuredResponse(input: unknown): StructuredResponse {
  if (!isRecord(input)) {
    throw new ProviderValidationError('invalid structured response: expected an object');
  }
  if (!isRecord(input.data)) {
    throw new ProviderValidationError('invalid structured response: data must be an object');
  }
  return { data: input.data };
}

export function parseDialogueResponse(input: unknown): DialogueResponse {
  if (!isRecord(input)) {
    throw new ProviderValidationError('invalid dialogue response: expected an object');
  }
  if (!isStringArray(input.lines)) {
    throw new ProviderValidationError('invalid dialogue response: lines must be a string array');
  }
  return { lines: input.lines };
}

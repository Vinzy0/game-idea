/**
 * BubbleManager (Phase 7): transient per-unit speech bubbles with expiry.
 * Presentation-only state — the engine never sees it. One bubble per unit;
 * a newer line replaces the older one.
 */
export interface SpeechBubble {
  unitId: string;
  text: string;
  expiresAt: number;
}

const DEFAULT_BUBBLE_MS = 7000;

export class BubbleManager {
  private listeners = new Set<() => void>();
  private items = new Map<string, SpeechBubble>();

  say(unitId: string, text: string, durationMs = DEFAULT_BUBBLE_MS): void {
    this.items.set(unitId, { unitId, text, expiresAt: Date.now() + durationMs });
    this.notify();
  }

  /** Currently visible bubbles; expired entries are ignored (lazy cleanup). */
  active(now = Date.now()): SpeechBubble[] {
    return [...this.items.values()].filter((bubble) => bubble.expiresAt > now);
  }

  clear(): void {
    if (this.items.size === 0) return;
    this.items.clear();
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

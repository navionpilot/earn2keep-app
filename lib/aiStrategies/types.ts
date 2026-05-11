// =============================================================================
// lib/aiStrategies/types.ts — Shared types for AI verification strategies (Slice 8.3)
// =============================================================================
// All strategy implementations consume StrategyInput and return StrategyResult.
// This lets /api/ai/verify-submission dispatch to any strategy with one shape,
// and adding a new strategy (photo_completion, audio_match, etc.) only
// requires implementing a new module that conforms to this interface.
// =============================================================================

/** The full set of AI verification strategies the framework knows about. */
export type AIStrategy =
  | "rep_count"
  | "time_hold"
  | "photo_completion"
  | "performance"
  | "audio_match"
  | "none";

export type AIConfidence = "high" | "medium" | "low" | "unable_to_verify";

/** What every strategy receives. */
export interface StrategyInput {
  challengeName: string;
  /** What unit the challenge counts in (e.g., "push-ups", "seconds") */
  unit: string | null;
  /** Numeric target for the challenge (reps or duration) */
  repTarget: number | null;
  /** What the player said they did */
  repsClaimed: number | null;
  /** Frames extracted from the player's video (base64 JPEGs, no prefix) */
  framesBase64: string[];
}

/** What every strategy returns. Mirrors the columns on submissions. */
export interface StrategyResult {
  ok: boolean;
  /** When ok: the AI's count (reps for rep_count, seconds for time_hold, 0/target for binary) */
  count?: number;
  /** When ok: AI's self-reported confidence */
  confidence?: AIConfidence;
  /** When ok: short human-readable explanation */
  reasoning?: string;
  /** When ok: full Claude response for debug/audit */
  raw?: unknown;
  /** When NOT ok: short error message */
  error?: string;
  /** When NOT ok: should the submission be marked skipped vs failed? */
  skipped?: boolean;
}

// =============================================================================
// lib/aiStrategies/dispatcher.ts — Strategy router (Slice 8.3)
// =============================================================================
// One place that decides which strategy module handles a given submission.
// The route handler doesn't need to know anything about specific strategies —
// it just looks up the challenge's ai_verification_strategy field, hands it
// to dispatchByStrategy, and stores the result.
//
// Adding a new strategy (e.g. photo_completion) is purely additive:
//   1. Implement lib/aiStrategies/photoCompletion.ts
//   2. Add a case here
//   3. Update the AIStrategy type if needed
// Everything else (route, UI, DB columns) keeps working.
// =============================================================================

import type {
  AIStrategy,
  StrategyInput,
  StrategyResult,
} from "@/lib/aiStrategies/types";
import { verifyRepCount } from "@/lib/aiStrategies/repCount";
import { verifyTimeHold } from "@/lib/aiStrategies/timeHold";

/**
 * Dispatch a strategy. Returns a uniform StrategyResult, including a
 * skipped=true outcome for strategies that don't run for this submission
 * (none, or a not-yet-implemented strategy).
 */
export async function dispatchByStrategy(
  strategy: AIStrategy | null,
  input: StrategyInput
): Promise<StrategyResult> {
  switch (strategy) {
    case "rep_count":
      return verifyRepCount(input);

    case "time_hold":
      return verifyTimeHold(input);

    case "photo_completion":
      return {
        ok: false,
        skipped: true,
        error: "photo_completion strategy not yet implemented (planned for slice 8.4)",
      };

    case "audio_match":
      return {
        ok: false,
        skipped: true,
        error: "audio_match strategy not yet implemented (planned for slice 8.5)",
      };

    case "performance":
      return {
        ok: false,
        skipped: true,
        error: "performance strategy not yet implemented",
      };

    case "none":
      return {
        ok: false,
        skipped: true,
        error: "This challenge is not AI-verifiable. Coach will review manually.",
      };

    case null:
    default:
      // Challenge has no strategy assigned (legacy challenge added before
      // 8.3 migration ran, or a newly created challenge the coach hasn't
      // categorized yet). Treat as "none" — coach reviews manually.
      return {
        ok: false,
        skipped: true,
        error: "No AI strategy assigned to this challenge yet.",
      };
  }
}

/**
 * Quick predicate the client can use to decide whether to bother extracting
 * frames + POSTing. Saves bandwidth on submissions that won't be AI-verified.
 */
export function isAIStrategyClientEligible(strategy: AIStrategy | null): boolean {
  if (!strategy) return false;
  return strategy === "rep_count" || strategy === "time_hold";
  // Not photo_completion or audio_match yet — those will route different
  // payloads (single photo, or audio file). Update this when they ship.
}

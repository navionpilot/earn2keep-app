// =============================================================================
// lib/aiAutoApprove.ts — AI auto-approval decision logic (Slice 8.4)
// =============================================================================
// Centralizes the "should this AI result trigger auto-approval?" decision
// so the rules are clear, testable, and one place to evolve.
//
// Current rules (MVP):
//   1. AI returned a result (ok=true, count and confidence present)
//   2. AI confidence is 'high'
//   3. AI count >= player's claimed count (AI confirms at least what was claimed)
//   4. Coach has opted in (profiles.ai_auto_approve_enabled = true)
//   5. Player has not opted out (players.ai_verification_opt_out = false)
//
// If any check fails, auto-approval is skipped and the submission stays in
// 'pending' for human review. The AI result is still stored — coach just
// has to click through.
//
// When the player has opted out (#5), the AI verification route skips the
// AI call entirely. So this module's job is the OTHER four checks plus
// re-confirming opt-out as a defense-in-depth check.
// =============================================================================

import type { AIConfidence } from "@/lib/aiStrategies/types";

export interface AutoApproveDecisionInput {
  aiCount: number | null;
  aiConfidence: AIConfidence | null;
  repsClaimed: number | null;
  coachAutoApproveEnabled: boolean;
  playerOptedOut: boolean;
}

export interface AutoApproveDecision {
  shouldAutoApprove: boolean;
  /** Approved reps value to write — capped at player's claim */
  approvedReps: number;
  /** Why we made this call (logged for transparency) */
  reason: string;
}

export function decideAutoApproval(
  input: AutoApproveDecisionInput
): AutoApproveDecision {
  // Check 5 first — opt-out trumps everything else
  if (input.playerOptedOut) {
    return {
      shouldAutoApprove: false,
      approvedReps: 0,
      reason: "Player opted out of AI verification",
    };
  }

  // Check 4 — coach opt-in required
  if (!input.coachAutoApproveEnabled) {
    return {
      shouldAutoApprove: false,
      approvedReps: 0,
      reason: "Coach has not enabled AI auto-approval",
    };
  }

  // Check 1 — AI must have actually verified
  if (input.aiCount == null || input.aiConfidence == null) {
    return {
      shouldAutoApprove: false,
      approvedReps: 0,
      reason: "AI did not produce a count/confidence",
    };
  }

  // Check 2 — confidence threshold (MVP: 'high' only)
  if (input.aiConfidence !== "high") {
    return {
      shouldAutoApprove: false,
      approvedReps: 0,
      reason: `Confidence is ${input.aiConfidence}, not high`,
    };
  }

  // Check 3 — AI count must confirm at least player's claim. We never
  // give players LESS than they claimed via auto-approval — if AI saw
  // fewer reps, route to coach review instead.
  const claimed = input.repsClaimed ?? 0;
  if (input.aiCount < claimed) {
    return {
      shouldAutoApprove: false,
      approvedReps: 0,
      reason: `AI count ${input.aiCount} less than player's claim ${claimed}`,
    };
  }

  // All checks pass — auto-approve at the player's claimed count (not
  // the AI's count if higher; players don't earn extra reps they didn't claim)
  return {
    shouldAutoApprove: true,
    approvedReps: claimed,
    reason: `AI ${input.aiConfidence} confidence confirmed ≥${claimed} reps`,
  };
}

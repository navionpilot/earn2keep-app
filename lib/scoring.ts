// ============================================================
// lib/scoring.ts — points calculation
//
// Mirrors the calc_challenge_points() Postgres function in
// 4.7-submissions.sql so the leaderboard math matches whether
// it's done in JS or SQL.
//
// Two responsibilities:
//   1. defaultPointsForDifficulty() — Easy=10 / Medium=25 / Hard=50 / Insane=100
//   2. pointsEarnedForSubmission() — applies the partial-credit
//      formula given the submission status + reps + rep target
// ============================================================

export type Difficulty = "Easy" | "Medium" | "Hard" | "Insane" | string | null | undefined;

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface ScoringSubmission {
  status: SubmissionStatus;
  reps_claimed: number | null;
  reps_approved: number | null;
}

export interface ScoringEventChallenge {
  rep_target: number | null;
  points_value: number | null; // override
  // We need the underlying challenge difficulty as a fallback
  challenge_difficulty: Difficulty;
}

/**
 * Default points for a difficulty when no override is set.
 * Falls back to Medium (25) for unknown / null difficulty.
 */
export function defaultPointsForDifficulty(difficulty: Difficulty): number {
  const d = (difficulty || "").toLowerCase();
  switch (d) {
    case "easy":
      return 10;
    case "medium":
      return 25;
    case "hard":
      return 50;
    case "insane":
      return 100;
    default:
      return 25;
  }
}

/**
 * Effective points value for a challenge in an event.
 * If the coach has set an override, use it; otherwise difficulty default.
 */
export function effectivePointsValue(ec: ScoringEventChallenge): number {
  if (ec.points_value !== null && ec.points_value !== undefined) {
    return Math.max(0, Math.floor(ec.points_value));
  }
  return defaultPointsForDifficulty(ec.challenge_difficulty);
}

/**
 * Compute points earned for a single submission.
 *
 * Rules:
 *   • Pending or rejected submissions earn 0 points.
 *   • Approved submissions earn (reps_approved / rep_target) × points,
 *     capped at 100% (overachievement does NOT bonus — coaches who want
 *     to award bonus can manually adjust reps_approved up to the cap).
 *   • If the coach approved without setting reps_approved, fall back
 *     to reps_claimed.
 *   • If rep_target is missing or 0, treat the challenge as binary:
 *     approved = full points, otherwise 0.
 */
export function pointsEarnedForSubmission(
  sub: ScoringSubmission,
  ec: ScoringEventChallenge
): number {
  if (sub.status !== "approved") return 0;

  const totalPoints = effectivePointsValue(ec);

  // Approved without an explicit count → use what the player claimed.
  const reps =
    sub.reps_approved !== null && sub.reps_approved !== undefined
      ? sub.reps_approved
      : sub.reps_claimed || 0;

  // No rep target → binary credit on approval.
  const target = ec.rep_target;
  if (!target || target <= 0) {
    return totalPoints;
  }

  // Partial credit, capped at 100%.
  const ratio = Math.min(1, Math.max(0, reps / target));
  return Math.round(totalPoints * ratio);
}

/**
 * Friendly label for a status, used in UI badges.
 */
export function statusLabel(status: SubmissionStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "pending":
    default:
      return "Pending";
  }
}

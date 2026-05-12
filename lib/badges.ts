// =============================================================================
// lib/badges.ts — Achievement badge catalog (Slice 5.3.2)
// =============================================================================
// Badges are computed on-the-fly from existing data (submissions,
// leaderboard rank, total points). No new DB table needed for v1 —
// keeps this slice tight and avoids RLS work.
//
// Adding a new badge: append to BADGES, give it a unique id, an icon,
// a name + description, and a `criteria` predicate that takes a
// PlayerStats object and returns true when the badge is unlocked.
//
// Future hardening (when payments + streaks ship):
//   - Add `donations_received` to PlayerStats and unlock supporter badges
//   - Add `current_streak` + `longest_streak` and unlock streak badges
//   - Persist earned-at timestamps to a player_badges table so the
//     UI can show "Earned 3 days ago"
// =============================================================================

export interface PlayerStats {
  /** Total points the player has earned across all submissions. */
  totalPoints: number;
  /** Number of submissions in `approved` status. */
  approvedCount: number;
  /** Number of submissions in `pending` status. */
  pendingCount: number;
  /** Total submissions (approved + pending + rejected). */
  totalSubmissions: number;
  /** Player's current rank on this event's leaderboard (1-indexed). null if not on leaderboard. */
  rank: number | null;
  /** Total players on the leaderboard (for context). */
  leaderboardSize: number;
  /** True when the player's fundraising progress hit/exceeded the goal. */
  fundraisingGoalHit: boolean;
}

export interface BadgeDef {
  id: string;
  icon: string;          // single emoji
  name: string;          // short title
  description: string;   // one-liner shown in the tooltip / detail
  category: "milestone" | "rank" | "points" | "fundraising";
  /** Returns true if the player has earned this badge given their stats. */
  criteria: (s: PlayerStats) => boolean;
}

// -----------------------------------------------------------------------------
// Catalog (12 badges, ordered by typical unlock progression)
// -----------------------------------------------------------------------------
export const BADGES: BadgeDef[] = [
  // --- Milestone (submission/approval count) ---
  {
    id: "first_submission",
    icon: "🎯",
    name: "Off the Mark",
    description: "Submitted your first challenge.",
    category: "milestone",
    criteria: (s) => s.totalSubmissions >= 1,
  },
  {
    id: "first_approval",
    icon: "✅",
    name: "First Win",
    description: "Got your first submission approved by your coach.",
    category: "milestone",
    criteria: (s) => s.approvedCount >= 1,
  },
  {
    id: "five_approvals",
    icon: "🔥",
    name: "Hot Streak",
    description: "5 approved submissions. You're cooking.",
    category: "milestone",
    criteria: (s) => s.approvedCount >= 5,
  },
  {
    id: "ten_approvals",
    icon: "⚡",
    name: "On Fire",
    description: "10 approved submissions. Keep it up!",
    category: "milestone",
    criteria: (s) => s.approvedCount >= 10,
  },
  {
    id: "twentyfive_approvals",
    icon: "🚀",
    name: "Beast Mode",
    description: "25 approved submissions. You're unstoppable.",
    category: "milestone",
    criteria: (s) => s.approvedCount >= 25,
  },
  {
    id: "fifty_approvals",
    icon: "👑",
    name: "Legendary",
    description: "50 approved submissions. Hall of fame material.",
    category: "milestone",
    criteria: (s) => s.approvedCount >= 50,
  },

  // --- Points-based ---
  {
    id: "centurion",
    icon: "💯",
    name: "Centurion",
    description: "Earned 100 points.",
    category: "points",
    criteria: (s) => s.totalPoints >= 100,
  },
  {
    id: "half_grand",
    icon: "🏆",
    name: "Half-Grand",
    description: "Earned 500 points. That's a serious haul.",
    category: "points",
    criteria: (s) => s.totalPoints >= 500,
  },
  {
    id: "grand_total",
    icon: "🌟",
    name: "Grand Total",
    description: "Earned 1,000 points. Top-tier dedication.",
    category: "points",
    criteria: (s) => s.totalPoints >= 1000,
  },

  // --- Rank-based ---
  {
    id: "podium",
    icon: "🥉",
    name: "Podium",
    description: "Currently in the top 3 on your event leaderboard.",
    category: "rank",
    criteria: (s) =>
      s.rank !== null && s.rank <= 3 && s.leaderboardSize >= 3,
  },
  {
    id: "top_of_hill",
    icon: "🥇",
    name: "Top of the Hill",
    description: "Currently #1 on your event leaderboard.",
    category: "rank",
    criteria: (s) =>
      s.rank === 1 && s.leaderboardSize >= 2,
  },

  // --- Fundraising ---
  // Locked until donations/payments ship in Phase 6 — fundraisingGoalHit
  // is wired to read from a real raised-amount once the data exists.
  // Today this badge is effectively unreachable, which is correct.
  {
    id: "goal_getter",
    icon: "🎉",
    name: "Goal Getter",
    description: "Hit your fundraising goal. Bonus points territory!",
    category: "fundraising",
    criteria: (s) => s.fundraisingGoalHit,
  },
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Given a PlayerStats snapshot, returns:
 *   - `earned`: badges the player has unlocked (in catalog order)
 *   - `locked`: badges still to unlock (in catalog order)
 */
export function computeBadges(stats: PlayerStats): {
  earned: BadgeDef[];
  locked: BadgeDef[];
} {
  const earned: BadgeDef[] = [];
  const locked: BadgeDef[] = [];
  for (const b of BADGES) {
    if (b.criteria(stats)) earned.push(b);
    else locked.push(b);
  }
  return { earned, locked };
}

/** Convenience: just the unlocked count. */
export function earnedBadgeCount(stats: PlayerStats): number {
  return BADGES.filter((b) => b.criteria(stats)).length;
}

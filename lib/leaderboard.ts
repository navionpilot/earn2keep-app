// =============================================================================
// lib/leaderboard.ts — Event leaderboard computation (Slice 5.6)
// =============================================================================
// Server-side helper that computes the ranked list of players for an event.
// Used by the player home dashboard (for the RANK stat + Top-5 preview)
// and by the dedicated /home/leaderboard page.
//
// Mirrors the logic in components/LeaderboardCard.tsx (the coach-side card)
// but is a pure async function instead of a client component, so it can be
// called from server components without a browser round-trip.
//
// Differences from LeaderboardCard:
//   - Includes ALL players in the event (even 0-point players), so a player
//     with no submissions yet still sees themselves on the leaderboard.
//   - Computes proper rank with tie handling (1, 1, 3 if first two tie).
//   - Uses the same lib/scoring.ts logic so points match coach-side numbers.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pointsEarnedForSubmission,
  type ScoringEventChallenge,
  type SubmissionStatus,
} from "@/lib/scoring";

export interface LeaderboardEntry {
  player_id: string;
  first_name: string;
  last_name: string | null;
  team_id: string;
  team_name: string;
  total_points: number;
  approved_count: number;
  pending_count: number;
  // Rank with ties: if two players have 175 pts they're both rank 1; the
  // next player below is rank 3 (not 2). Matches sports-leaderboard convention.
  rank: number;
}

export async function computeEventLeaderboard(
  supabase: SupabaseClient,
  eventId: string
): Promise<LeaderboardEntry[]> {
  // 1) Find the team IDs participating in this event.
  const { data: participants } = await supabase
    .from("event_participants")
    .select("team_id, teams(id, name)")
    .eq("event_id", eventId);

  type ParticipantRow = {
    team_id: string;
    teams: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const partsTyped = (participants || []) as ParticipantRow[];
  const teamIds = partsTyped.map((p) => p.team_id);
  if (teamIds.length === 0) return [];

  const teamNameById = new Map<string, string>();
  for (const p of partsTyped) {
    const t = Array.isArray(p.teams) ? p.teams[0] : p.teams;
    if (t) teamNameById.set(p.team_id, t.name);
  }

  // 2) Pull every player on every participating team. This is the master
  //    list — ensures 0-point players are still on the leaderboard.
  const { data: playersList } = await supabase
    .from("players")
    .select("id, first_name, last_name, team_id")
    .in("team_id", teamIds);

  type PlayerRow = {
    id: string;
    first_name: string;
    last_name: string | null;
    team_id: string;
  };
  const playersTyped = (playersList || []) as PlayerRow[];
  if (playersTyped.length === 0) return [];

  // 3) Pull all event_challenges so we know rep_target / points / difficulty
  //    for the scoring formula.
  const { data: ecRows } = await supabase
    .from("event_challenges")
    .select("id, rep_target, points_value, challenges(difficulty)")
    .eq("event_id", eventId);

  type EcRow = {
    id: string;
    rep_target: number | null;
    points_value: number | null;
    challenges: { difficulty: string | null } | { difficulty: string | null }[] | null;
  };

  const ecMap = new Map<string, ScoringEventChallenge>();
  for (const ec of (ecRows || []) as EcRow[]) {
    const ch = Array.isArray(ec.challenges) ? ec.challenges[0] : ec.challenges;
    ecMap.set(ec.id, {
      rep_target: ec.rep_target,
      points_value: ec.points_value,
      challenge_difficulty: ch?.difficulty ?? null,
    });
  }

  // 4) Pull all submissions (any status) for this event. Pending/rejected
  //    earn 0 points but we count "pending_count" to display alongside
  //    "approved_count" — useful UX context on the leaderboard.
  const { data: subs } = await supabase
    .from("submissions")
    .select(
      "id, status, reps_claimed, reps_approved, event_challenge_id, player_id"
    )
    .eq("event_id", eventId);

  type SubRow = {
    id: string;
    status: SubmissionStatus;
    reps_claimed: number | null;
    reps_approved: number | null;
    event_challenge_id: string;
    player_id: string;
  };

  // 5) Aggregate per-player.
  const totals = new Map<
    string,
    { total_points: number; approved_count: number; pending_count: number }
  >();
  for (const s of (subs || []) as SubRow[]) {
    const ec = ecMap.get(s.event_challenge_id);
    if (!ec) continue;
    const pts = pointsEarnedForSubmission(
      {
        status: s.status,
        reps_claimed: s.reps_claimed,
        reps_approved: s.reps_approved,
      },
      ec
    );
    const cur = totals.get(s.player_id) || {
      total_points: 0,
      approved_count: 0,
      pending_count: 0,
    };
    cur.total_points += pts;
    if (s.status === "approved") cur.approved_count += 1;
    if (s.status === "pending") cur.pending_count += 1;
    totals.set(s.player_id, cur);
  }

  // 6) Build full list — every player in event, with their stats (0s if
  //    they haven't submitted anything).
  const rowsUnranked = playersTyped.map<LeaderboardEntry>((p) => {
    const t = totals.get(p.id);
    return {
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      team_id: p.team_id,
      team_name: teamNameById.get(p.team_id) || "—",
      total_points: t?.total_points ?? 0,
      approved_count: t?.approved_count ?? 0,
      pending_count: t?.pending_count ?? 0,
      rank: 0, // assigned below
    };
  });

  // 7) Sort by points desc, then by first name asc as a tiebreaker UX.
  rowsUnranked.sort((a, b) => {
    if (b.total_points !== a.total_points) {
      return b.total_points - a.total_points;
    }
    return a.first_name.localeCompare(b.first_name);
  });

  // 8) Assign ranks with proper tie handling. If two players tie for
  //    1st, both get rank 1 and the next gets rank 3 (sports convention).
  let lastPoints = -1;
  let lastRank = 0;
  rowsUnranked.forEach((row, idx) => {
    if (row.total_points !== lastPoints) {
      lastRank = idx + 1;
      lastPoints = row.total_points;
    }
    row.rank = lastRank;
  });

  return rowsUnranked;
}

/**
 * Find a single player's rank in the leaderboard. Convenience wrapper.
 */
export function findPlayerEntry(
  leaderboard: LeaderboardEntry[],
  playerId: string
): LeaderboardEntry | null {
  return leaderboard.find((e) => e.player_id === playerId) ?? null;
}

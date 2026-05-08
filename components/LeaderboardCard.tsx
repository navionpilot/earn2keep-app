"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import {
  pointsEarnedForSubmission,
  type ScoringEventChallenge,
  type SubmissionStatus,
} from "@/lib/scoring";

interface LeaderboardCardProps {
  eventId: string;
}

type LeaderRow = {
  player_id: string;
  player_first_name: string;
  player_last_name: string | null;
  team_name: string;
  total_points: number;
  approved_count: number;
};

export default function LeaderboardCard({ eventId }: LeaderboardCardProps) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [hasAnySubmissions, setHasAnySubmissions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTop5 = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();

        // Pull all event_challenges so we know rep_target / points / difficulty
        const { data: ecRows, error: ecErr } = await supabase
          .from("event_challenges")
          .select("id, rep_target, points_value, challenges(difficulty)")
          .eq("event_id", eventId);
        if (ecErr) throw new Error(ecErr.message);

        const ecMap = new Map<string, ScoringEventChallenge>();
        (ecRows || []).forEach((row: any) => {
          ecMap.set(row.id, {
            rep_target: row.rep_target,
            points_value: row.points_value,
            challenge_difficulty: row.challenges?.difficulty || null,
          });
        });

        // Pull all submissions for this event with player + team join
        const { data: subRows, error: sErr } = await supabase
          .from("submissions")
          .select(
            "id, status, reps_claimed, reps_approved, event_challenge_id, player_id, players(id, first_name, last_name, team_id, teams(id, name))"
          )
          .eq("event_id", eventId);
        if (sErr) throw new Error(sErr.message);

        setHasAnySubmissions((subRows || []).length > 0);

        // Aggregate per player
        const totals = new Map<string, LeaderRow>();
        (subRows || []).forEach((s: any) => {
          const ec = ecMap.get(s.event_challenge_id);
          if (!ec) return;
          const pts = pointsEarnedForSubmission(
            { status: s.status as SubmissionStatus, reps_claimed: s.reps_claimed, reps_approved: s.reps_approved },
            ec
          );
          const isApproved = s.status === "approved";
          const playerId = s.player_id;
          const playerName = s.players;
          if (!playerName) return;

          if (!totals.has(playerId)) {
            totals.set(playerId, {
              player_id: playerId,
              player_first_name: playerName.first_name,
              player_last_name: playerName.last_name,
              team_name: playerName.teams?.name || "—",
              total_points: 0,
              approved_count: 0,
            });
          }
          const row = totals.get(playerId)!;
          row.total_points += pts;
          if (isApproved) row.approved_count += 1;
        });

        const top5 = Array.from(totals.values())
          .sort((a, b) => b.total_points - a.total_points || a.player_first_name.localeCompare(b.player_first_name))
          .slice(0, 5);
        setRows(top5);
      } catch (err: any) {
        setError(err?.message || "Failed to load leaderboard.");
      } finally {
        setLoading(false);
      }
    };

    fetchTop5();
  }, [eventId]);

  return (
    <div className="dashboard-card">
      <div className="section-header" style={{ marginBottom: "12px" }}>
        <h2 className="dashboard-card-title">Leaderboard</h2>
        <Link href={`/events/${eventId}/leaderboard`} className="btn-add">
          🏆 View all
        </Link>
      </div>

      {loading ? (
        <p className="dashboard-card-text" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      ) : error ? (
        <p className="dashboard-card-text" style={{ color: "var(--color-error)" }}>
          {error}
        </p>
      ) : !hasAnySubmissions ? (
        <p className="dashboard-card-text">
          No submissions yet — the leaderboard will populate when players start
          submitting completed challenges. Player upload coming soon.
        </p>
      ) : rows.length === 0 ? (
        <p className="dashboard-card-text">
          Submissions exist but none are approved yet. Approved submissions will
          show up here ranked by points earned.
        </p>
      ) : (
        <ol className="leaderboard-mini-list">
          {rows.map((r, i) => (
            <li key={r.player_id} className="leaderboard-mini-row">
              <span className="leaderboard-mini-rank">{rankEmoji(i)}</span>
              <span className="leaderboard-mini-name">
                {r.player_first_name} {r.player_last_name || ""}
              </span>
              <span className="leaderboard-mini-team">{r.team_name}</span>
              <span className="leaderboard-mini-points">
                <strong>{r.total_points}</strong>
                <span className="leaderboard-mini-points-label"> pts</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function rankEmoji(idx: number): string {
  if (idx === 0) return "🥇";
  if (idx === 1) return "🥈";
  if (idx === 2) return "🥉";
  return `#${idx + 1}`;
}

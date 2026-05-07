"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import LogoutButton from "@/components/LogoutButton";
import AppShell from "@/components/AppShell";
import {
  pointsEarnedForSubmission,
  type ScoringEventChallenge,
  type SubmissionStatus,
} from "@/lib/scoring";

type EventInfo = {
  id: string;
  name: string;
  event_type: string;
  status: string;
};

type LeaderRow = {
  player_id: string;
  player_first_name: string;
  player_last_name: string | null;
  team_id: string;
  team_name: string;
  total_points: number;
  approved_count: number;
  pending_count: number;
};

export default function LeaderboardPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sidebar context
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const [hasTeams, setHasTeams] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError("You must be logged in.");
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile?.full_name) setUserDisplayName(profile.full_name);

        const [{ count: teamCount }, { count: playerCount }] = await Promise.all([
          supabase.from("teams").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
          supabase.from("players").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        ]);
        setHasTeams((teamCount || 0) > 0);
        setHasPlayers((playerCount || 0) > 0);

        // Event
        const { data: ev, error: evErr } = await supabase
          .from("events")
          .select("id, name, event_type, status")
          .eq("id", eventId)
          .eq("owner_id", user.id)
          .single();
        if (evErr || !ev) {
          setError("Event not found, or you don't have access to it.");
          setLoading(false);
          return;
        }
        setEvent(ev);

        // Get all participating teams for this event
        const { data: parts } = await supabase
          .from("event_participants")
          .select("team_id")
          .eq("event_id", eventId);
        const teamIds = (parts || []).map((p: any) => p.team_id);

        // Get all active players on those teams
        const { data: players } = await supabase
          .from("players")
          .select("id, first_name, last_name, team_id, teams(id, name)")
          .in("team_id", teamIds.length > 0 ? teamIds : ["00000000-0000-0000-0000-000000000000"])
          .eq("is_active", true);

        // Event challenges (for scoring)
        const { data: ecRows } = await supabase
          .from("event_challenges")
          .select("id, rep_target, points_value, challenges(difficulty)")
          .eq("event_id", eventId);

        const ecMap = new Map<string, ScoringEventChallenge>();
        (ecRows || []).forEach((row: any) => {
          ecMap.set(row.id, {
            rep_target: row.rep_target,
            points_value: row.points_value,
            challenge_difficulty: row.challenges?.difficulty || null,
          });
        });

        // All submissions for this event
        const { data: subs } = await supabase
          .from("submissions")
          .select("id, status, reps_claimed, reps_approved, event_challenge_id, player_id")
          .eq("event_id", eventId);

        // Aggregate per player. Start with every active player at 0 so
        // empty rosters don't disappear off the board.
        const totals = new Map<string, LeaderRow>();
        (players || []).forEach((p: any) => {
          totals.set(p.id, {
            player_id: p.id,
            player_first_name: p.first_name,
            player_last_name: p.last_name,
            team_id: p.team_id,
            team_name: p.teams?.name || "—",
            total_points: 0,
            approved_count: 0,
            pending_count: 0,
          });
        });

        (subs || []).forEach((s: any) => {
          const ec = ecMap.get(s.event_challenge_id);
          if (!ec) return;
          let row = totals.get(s.player_id);
          if (!row) return; // submission for inactive/removed player — ignore
          const pts = pointsEarnedForSubmission(
            { status: s.status as SubmissionStatus, reps_claimed: s.reps_claimed, reps_approved: s.reps_approved },
            ec
          );
          row.total_points += pts;
          if (s.status === "approved") row.approved_count += 1;
          if (s.status === "pending") row.pending_count += 1;
        });

        const ranked = Array.from(totals.values()).sort(
          (a, b) =>
            b.total_points - a.total_points ||
            a.player_first_name.localeCompare(b.player_first_name)
        );
        setRows(ranked);
      } catch (err: any) {
        setError(err?.message || "Failed to load leaderboard.");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [eventId]);

  const totalApproved = useMemo(
    () => rows.reduce((sum, r) => sum + r.approved_count, 0),
    [rows]
  );
  const totalPending = useMemo(
    () => rows.reduce((sum, r) => sum + r.pending_count, 0),
    [rows]
  );

  if (loading) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
              Loading leaderboard…
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <h1 className="form-title">Event not found</h1>
            <p className="form-subtitle">{error || "You don't have access to this event."}</p>
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <Link href="/dashboard" className="btn-primary-link">← Back to dashboard</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <AppShell active="events" userDisplayName={userDisplayName}>
          <Link href={`/events/${eventId}`} className="btn-back">
            ← Back to {event.name}
          </Link>

          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
            <span className="breadcrumb-sep">›</span>
            <Link href={`/events/${eventId}`} className="breadcrumb-link">{event.name}</Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">Leaderboard</span>
          </div>

          <div className="schedule-header">
            <div>
              <h1 className="dashboard-welcome">🏆 Leaderboard</h1>
              <p className="dashboard-subtitle">
                Players ranked by total points earned across approved submissions.
                {totalPending > 0 && (
                  <>
                    {" "}
                    <strong>{totalPending}</strong> pending submission
                    {totalPending === 1 ? " is" : "s are"} waiting for review —
                    those points won't show up here until you approve.{" "}
                    <Link href={`/events/${eventId}/submissions`} className="form-link">
                      Open the review queue →
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}

          {rows.length === 0 ? (
            <div className="dashboard-card">
              <p className="dashboard-card-text">
                No players on this event yet. Add teams to the event and players to those teams.
              </p>
              <div style={{ textAlign: "center", marginTop: "16px" }}>
                <Link href={`/events/${eventId}`} className="btn-primary-link">
                  ← Back to event
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="leaderboard-summary">
                <div className="leaderboard-summary-stat">
                  <div className="leaderboard-summary-num">{rows.length}</div>
                  <div className="leaderboard-summary-label">Players</div>
                </div>
                <div className="leaderboard-summary-stat">
                  <div className="leaderboard-summary-num">{totalApproved}</div>
                  <div className="leaderboard-summary-label">Approved subs</div>
                </div>
                <div className="leaderboard-summary-stat">
                  <div className="leaderboard-summary-num">{totalPending}</div>
                  <div className="leaderboard-summary-label">Pending review</div>
                </div>
              </div>

              <div className="leaderboard-table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th className="lt-rank">Rank</th>
                      <th className="lt-name">Player</th>
                      <th className="lt-team">Team</th>
                      <th className="lt-stat">Approved</th>
                      <th className="lt-stat">Pending</th>
                      <th className="lt-points">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.player_id} className={i < 3 ? `lt-row lt-rank-${i + 1}` : "lt-row"}>
                        <td className="lt-rank">{rankLabel(i)}</td>
                        <td className="lt-name">
                          {r.player_first_name} {r.player_last_name || ""}
                        </td>
                        <td className="lt-team">{r.team_name}</td>
                        <td className="lt-stat">{r.approved_count}</td>
                        <td className="lt-stat">{r.pending_count}</td>
                        <td className="lt-points">
                          <strong>{r.total_points}</strong>
                          <span className="lt-points-label"> pts</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
    </AppShell>
  );
}

function rankLabel(idx: number): string {
  if (idx === 0) return "🥇";
  if (idx === 1) return "🥈";
  if (idx === 2) return "🥉";
  return `#${idx + 1}`;
}

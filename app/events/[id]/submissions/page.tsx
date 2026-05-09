"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import LogoutButton from "@/components/LogoutButton";
import SubmissionStatusBadge from "@/components/SubmissionStatusBadge";
import AppShell from "@/components/AppShell";
import SubmissionReviewModal, {
  type SubmissionForReview,
} from "@/components/SubmissionReviewModal";
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

type Filter = "all" | "pending" | "approved" | "rejected";

export default function SubmissionsQueuePage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionForReview[]>([]);
  const [ecMap, setEcMap] = useState<Map<string, ScoringEventChallenge>>(new Map());
  const [activeSub, setActiveSub] = useState<SubmissionForReview | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [challengeFilter, setChallengeFilter] = useState<string>("all");
  const [searchQ, setSearchQ] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sidebar context
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const [hasTeams, setHasTeams] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);

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

      // Event details
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

      // Event challenges (need difficulty + points + rep_target for scoring)
      const { data: ecRows, error: ecErr } = await supabase
        .from("event_challenges")
        .select("id, rep_target, points_value, challenges(id, name, unit, difficulty)")
        .eq("event_id", eventId);
      if (ecErr) throw new Error(ecErr.message);

      const m = new Map<string, ScoringEventChallenge>();
      (ecRows || []).forEach((row: any) => {
        m.set(row.id, {
          rep_target: row.rep_target,
          points_value: row.points_value,
          challenge_difficulty: row.challenges?.difficulty || null,
        });
      });
      setEcMap(m);

      // Submissions for this event with all the joins needed for review UI
      const { data: subs, error: sErr } = await supabase
        .from("submissions")
        .select(
          `id, status, reps_claimed, reps_approved, rejection_reason, coach_note, player_note,
           video_url, photo_url, submitted_at, reviewed_at,
           event_challenge_id,
           players(id, first_name, last_name, team_id, teams(id, name)),
           event_challenges(id, rep_target, points_value, challenges(name, unit, difficulty))`
        )
        .eq("event_id", eventId)
        .order("submitted_at", { ascending: false });
      if (sErr) throw new Error(sErr.message);

      const rows: SubmissionForReview[] = (subs || []).map((s: any) => ({
        id: s.id,
        player_first_name: s.players?.first_name || "?",
        player_last_name: s.players?.last_name || null,
        challenge_name: s.event_challenges?.challenges?.name || "Unknown challenge",
        challenge_unit: s.event_challenges?.challenges?.unit || null,
        rep_target: s.event_challenges?.rep_target ?? null,
        points_value: s.event_challenges?.points_value ?? null,
        challenge_difficulty: s.event_challenges?.challenges?.difficulty || null,
        reps_claimed: s.reps_claimed,
        reps_approved: s.reps_approved,
        status: s.status as SubmissionStatus,
        rejection_reason: s.rejection_reason,
        coach_note: s.coach_note,
        player_note: s.player_note,
        video_url: s.video_url,
        photo_url: s.photo_url,
        submitted_at: s.submitted_at,
        reviewed_at: s.reviewed_at,
      }));
      setSubmissions(rows);
    } catch (err: any) {
      setError(err?.message || "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Build filter dropdowns from data
  const teamOptions = useMemo(() => {
    const teams = new Map<string, string>();
    submissions.forEach((s) => {
      // No team_id directly on submission, but the player has it.
      // We use the badge approach: each row carries team info via join.
    });
    return teams;
  }, [submissions]);

  const challengeOptions = useMemo(() => {
    const set = new Map<string, string>();
    submissions.forEach((s) => {
      // Group by challenge name (acceptable since within an event names are unique enough)
      set.set(s.challenge_name, s.challenge_name);
    });
    return Array.from(set.values()).sort();
  }, [submissions]);

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (challengeFilter !== "all" && s.challenge_name !== challengeFilter) return false;
      if (searchQ.trim()) {
        const q = searchQ.toLowerCase();
        const name = `${s.player_first_name} ${s.player_last_name || ""}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, filter, challengeFilter, searchQ]);

  const counts = useMemo(() => {
    let pending = 0, approved = 0, rejected = 0;
    submissions.forEach((s) => {
      if (s.status === "pending") pending++;
      else if (s.status === "approved") approved++;
      else if (s.status === "rejected") rejected++;
    });
    return { pending, approved, rejected, all: submissions.length };
  }, [submissions]);

  if (loading) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
              Loading submissions…
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
            <span className="breadcrumb-current">Submissions</span>
          </div>

          <div className="schedule-header">
            <div>
              <h1 className="dashboard-welcome">Submissions</h1>
              <p className="dashboard-subtitle">
                Review and verify player submissions. Approved submissions count toward
                points on the leaderboard.
              </p>
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}

          {submissions.length === 0 && (
            <div className="alert alert-info" style={{ marginBottom: "20px" }}>
              <strong>No submissions yet.</strong> Submissions appear here when players/participants
              upload videos or photos of completed challenges. Player upload UI ships
              in Phase 5; for now this queue is set up and waiting.
            </div>
          )}

          {/* Filter bar */}
          <div className="submissions-filters">
            <div className="submissions-filter-chips">
              {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`submissions-filter-chip ${filter === f ? "active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}{" "}
                  <span className="submissions-filter-count">
                    ({f === "all" ? counts.all : counts[f]})
                  </span>
                </button>
              ))}
            </div>

            <div className="submissions-filter-row">
              <input
                type="text"
                className="form-input submissions-filter-search"
                placeholder="Search by player name…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
              {challengeOptions.length > 0 && (
                <select
                  className="form-input submissions-filter-select"
                  value={challengeFilter}
                  onChange={(e) => setChallengeFilter(e.target.value)}
                >
                  <option value="all">All challenges</option>
                  {challengeOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Submissions list */}
          {filtered.length === 0 ? (
            <div className="dashboard-card" style={{ marginTop: "20px" }}>
              <p className="dashboard-card-text" style={{ textAlign: "center" }}>
                {submissions.length === 0
                  ? "Player upload arrives in Phase 5."
                  : "No submissions match your filters."}
              </p>
            </div>
          ) : (
            <ul className="submissions-list">
              {filtered.map((s) => {
                const playerName = `${s.player_first_name} ${s.player_last_name || ""}`.trim();
                const ratioPct = s.rep_target && s.rep_target > 0
                  ? Math.min(100, Math.round(((s.reps_approved ?? s.reps_claimed ?? 0) / s.rep_target) * 100))
                  : null;
                return (
                  <li
                    key={s.id}
                    className="submissions-row"
                    onClick={() => setActiveSub(s)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveSub(s); }}
                  >
                    <div className="submissions-row-main">
                      <div className="submissions-row-name">{playerName}</div>
                      <div className="submissions-row-challenge">{s.challenge_name}</div>
                    </div>
                    <div className="submissions-row-meta">
                      <span className="submissions-row-reps">
                        {s.reps_approved ?? s.reps_claimed ?? 0}
                        {s.rep_target ? `/${s.rep_target}` : ""}
                        {s.challenge_unit ? ` ${s.challenge_unit}` : ""}
                        {ratioPct !== null && ` (${ratioPct}%)`}
                      </span>
                      <SubmissionStatusBadge status={s.status} size="sm" />
                    </div>
                    <button
                      type="button"
                      className="submissions-row-action"
                      onClick={(e) => { e.stopPropagation(); setActiveSub(s); }}
                    >
                      {s.status === "pending" ? "Review →" : "Edit →"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

      {activeSub && (
        <SubmissionReviewModal
          submission={activeSub}
          onClose={() => setActiveSub(null)}
          onSaved={fetchAll}
        />
      )}
    </AppShell>
  );
}

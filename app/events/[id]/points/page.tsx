"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import LogoutButton from "@/components/LogoutButton";
import AppShell from "@/components/AppShell";
import {
  defaultPointsForDifficulty,
  effectivePointsValue,
  type Difficulty,
} from "@/lib/scoring";

type EventInfo = {
  id: string;
  name: string;
  event_type: string;
};

type ChallengeRow = {
  ec_id: string;             // event_challenges.id (primary)
  all_ec_ids: string[];      // every ec row that maps to the same challenge
  challenge_name: string;
  challenge_unit: string | null;
  difficulty: Difficulty;
  rep_target: number | null;
  current_override: number | null;
  effective_points: number;
  draft_value: string;       // What's in the input box right now
  saved: boolean;            // True if draft matches what's in DB
  saving: boolean;
  error: string | null;
};

export default function PointsSettingsPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [rows, setRows] = useState<ChallengeRow[]>([]);
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

        const { data: ev, error: evErr } = await supabase
          .from("events")
          .select("id, name, event_type")
          .eq("id", eventId)
          .eq("owner_id", user.id)
          .single();
        if (evErr || !ev) {
          setError("Event not found, or you don't have access to it.");
          setLoading(false);
          return;
        }
        setEvent(ev);

        const { data: ecRows, error: ecErr } = await supabase
          .from("event_challenges")
          .select(
            "id, rep_target, points_value, challenges(id, name, unit, difficulty)"
          )
          .eq("event_id", eventId);
        if (ecErr) throw new Error(ecErr.message);

        // Deduplicate by challenge name (an event can schedule the same
        // challenge on multiple days — same challenge ID, multiple ec rows).
        // For points override, we want one row per UNIQUE challenge — but
        // each ec row IS its own override target. So we group differently:
        // show ALL ec rows, since each schedules independently.
        // Actually: a coach probably wants one points value per CHALLENGE
        // across the event. But the schema attaches points_value to ec.id,
        // not challenge.id. So we keep one row per ec entry, and let the
        // coach see / set them individually. If they appear multiple times
        // in the schedule, they'll need to set each one.
        //
        // Simplification: dedupe to one row per challenge. We update ALL
        // ec rows that point to that challenge in a single save.

        type Group = {
          challenge_id: string;
          ec_ids: string[];
          challenge_name: string;
          challenge_unit: string | null;
          difficulty: Difficulty;
          rep_target: number | null;
          current_override: number | null;
        };
        const groups = new Map<string, Group>();
        (ecRows || []).forEach((r: any) => {
          const cid = r.challenges?.id;
          if (!cid) return;
          if (!groups.has(cid)) {
            groups.set(cid, {
              challenge_id: cid,
              ec_ids: [],
              challenge_name: r.challenges?.name || "Unknown",
              challenge_unit: r.challenges?.unit || null,
              difficulty: r.challenges?.difficulty || null,
              rep_target: r.rep_target ?? null,
              current_override: r.points_value ?? null,
            });
          }
          const g = groups.get(cid)!;
          g.ec_ids.push(r.id);
          // If any ec row has an override, surface that as the current value
          if (r.points_value !== null && r.points_value !== undefined) {
            g.current_override = r.points_value;
          }
        });

        const built: ChallengeRow[] = Array.from(groups.values()).map((g) => {
          const eff = effectivePointsValue({
            rep_target: g.rep_target,
            points_value: g.current_override,
            challenge_difficulty: g.difficulty,
          });
          return {
            ec_id: g.ec_ids[0], // primary; we'll update all of all_ec_ids on save
            all_ec_ids: g.ec_ids,
            challenge_name: g.challenge_name,
            challenge_unit: g.challenge_unit,
            difficulty: g.difficulty,
            rep_target: g.rep_target,
            current_override: g.current_override,
            effective_points: eff,
            draft_value: g.current_override !== null ? String(g.current_override) : "",
            saved: true,
            saving: false,
            error: null,
          };
        });

        // Sort by challenge name
        built.sort((a, b) => a.challenge_name.localeCompare(b.challenge_name));

        setRows(built);
      } catch (err: any) {
        setError(err?.message || "Failed to load points settings.");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [eventId]);

  const setRow = (idx: number, patch: Partial<ChallengeRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleDraftChange = (idx: number, value: string) => {
    setRow(idx, { draft_value: value, saved: false });
  };

  const handleSave = async (idx: number) => {
    const r = rows[idx];
    setRow(idx, { saving: true, error: null });
    try {
      const supabase = createClient();
      const allIds: string[] = r.all_ec_ids;
      let newValue: number | null = null;
      const trimmed = r.draft_value.trim();
      if (trimmed === "") {
        newValue = null; // Reset to default
      } else {
        const n = parseInt(trimmed, 10);
        if (isNaN(n) || n < 0) {
          throw new Error("Points must be a non-negative number, or empty for default.");
        }
        newValue = n;
      }

      const { error: updErr } = await supabase
        .from("event_challenges")
        .update({ points_value: newValue })
        .in("id", allIds);
      if (updErr) throw new Error(updErr.message);

      const eff = effectivePointsValue({
        rep_target: r.rep_target,
        points_value: newValue,
        challenge_difficulty: r.difficulty,
      });

      setRow(idx, {
        current_override: newValue,
        effective_points: eff,
        saved: true,
        saving: false,
        error: null,
      });
    } catch (err: any) {
      setRow(idx, { saving: false, error: err?.message || "Save failed." });
    }
  };

  const handleReset = (idx: number) => {
    const r = rows[idx];
    setRow(idx, { draft_value: "", saved: r.current_override === null });
  };

  if (loading) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
              Loading…
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
            <p className="form-subtitle">{error || "You don't have access."}</p>
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
            <span className="breadcrumb-current">Challenge Points</span>
          </div>

          <div className="schedule-header">
            <div>
              <h1 className="dashboard-welcome">Challenge Points</h1>
              <p className="dashboard-subtitle">
                Each approved submission earns points based on the challenge's value
                and how close the player got to the rep target. Defaults are tied to
                difficulty — Easy <strong>10</strong>, Medium <strong>25</strong>, Hard <strong>50</strong>, Insane <strong>100</strong>.
                Override any challenge below if it should be worth more or less for this event.
              </p>
            </div>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: "16px" }}>
              {error}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="dashboard-card">
              <p className="dashboard-card-text">
                No challenges scheduled for this event yet.{" "}
                <Link href={`/events/${eventId}/schedule`} className="form-link">
                  Open the schedule →
                </Link>
              </p>
            </div>
          ) : (
            <div className="points-table-wrap">
              <table className="points-table">
                <thead>
                  <tr>
                    <th className="pt-name">Challenge</th>
                    <th className="pt-diff">Difficulty</th>
                    <th className="pt-target">Rep target</th>
                    <th className="pt-default">Default</th>
                    <th className="pt-input">Override</th>
                    <th className="pt-effective">Effective</th>
                    <th className="pt-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const def = defaultPointsForDifficulty(r.difficulty);
                    return (
                      <tr key={r.ec_id} className={r.saved ? "" : "pt-dirty"}>
                        <td className="pt-name">{r.challenge_name}</td>
                        <td className="pt-diff">
                          <span className={`pt-diff-pill pt-diff-${(r.difficulty || "medium").toLowerCase()}`}>
                            {r.difficulty || "Medium"}
                          </span>
                        </td>
                        <td className="pt-target">
                          {r.rep_target ? `${r.rep_target} ${r.challenge_unit || ""}` : "—"}
                        </td>
                        <td className="pt-default">{def} pts</td>
                        <td className="pt-input">
                          <input
                            type="number"
                            min="0"
                            className="form-input pt-input-field"
                            value={r.draft_value}
                            placeholder={String(def)}
                            onChange={(e) => handleDraftChange(i, e.target.value)}
                          />
                        </td>
                        <td className="pt-effective">
                          <strong>{r.effective_points}</strong>
                        </td>
                        <td className="pt-actions">
                          {!r.saved && (
                            <button
                              type="button"
                              className="btn-primary btn-inline pt-save-btn"
                              onClick={() => handleSave(i)}
                              disabled={r.saving}
                            >
                              {r.saving ? "Saving…" : "Save"}
                            </button>
                          )}
                          {r.current_override !== null && r.saved && (
                            <button
                              type="button"
                              className="btn-secondary btn-inline pt-save-btn"
                              onClick={() => {
                                handleReset(i);
                                handleSave(i);
                              }}
                              disabled={r.saving}
                              title="Reset this challenge back to the difficulty default"
                            >
                              ↺ Reset
                            </button>
                          )}
                          {r.error && (
                            <div className="pt-error">{r.error}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
    </AppShell>
  );
}

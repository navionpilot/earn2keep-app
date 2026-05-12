"use client";

// =============================================================================
// app/join-tournament/page.tsx — Join Existing Tournament flow (Slice L32)
// =============================================================================
// The "Join Existing Tournament" entry point per the v5 model spec. Lets
// a logged-in coach enter a tournament's join code, see the tournament's
// details and Entry Fee, pick which of their teams is entering, and
// register that team (paying the Entry Fee through a stub at this stage —
// real Stripe wiring is Phase 10).
//
// Flow stages:
//   "enter-code"  -> Form to type the join code
//   "loading"     -> Fetching tournament details
//   "preview"     -> Tournament details + team picker + Join button
//   "joining"     -> Inserting tournament_teams row (stub payment)
//   "success"     -> Confirmation, link back to dashboard
//
// Real Stripe payment is NOT wired here yet (Phase 10 work). Instead, the
// stub Joining step inserts a tournament_teams row with status='active'
// (or 'pending_approval' if the tournament requires approval) and pretends
// the payment happened. When Stripe lands, this is where the Checkout
// session gets created and the row gets inserted only after webhook
// confirmation. The shape of the data is unchanged so the swap should be
// localized to this one file.
// =============================================================================

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import AppShell from "@/components/AppShell";
import {
  normalizeJoinCode,
  formatJoinCodeForDisplay,
  isValidJoinCodeFormat,
} from "@/lib/tournamentJoinCode";

type Stage = "enter-code" | "loading" | "preview" | "joining" | "success";

interface TournamentInfo {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  tournament_entry_fee_cents: number;
  tournament_join_code: string;
  tournament_requires_approval: boolean;
  tournament_max_teams: number | null;
  host_org_name: string | null;
  joined_teams_count: number;
}

interface Team {
  id: string;
  name: string;
  organization_id: string;
  org_name: string | null;
  player_count: number;
  already_joined: boolean;
}

const formatMoney = (cents: number): string => {
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: dollars % 1 === 0 ? 0 : 2 })}`;
};

const formatDateRange = (start: string, end: string): string => {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const s = new Date(start).toLocaleDateString("en-US", opts);
  const e = new Date(end).toLocaleDateString("en-US", opts);
  return `${s} – ${e}`;
};

// L32 hotfix #2 — Inner component does the actual work. Wrapped below in
// a <Suspense> boundary because useSearchParams() requires it under Next.js
// 15's static-rendering rules (the page would otherwise fail to prerender
// during build).
function JoinTournamentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code") || "";

  const [stage, setStage] = useState<Stage>("enter-code");
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState<string>(codeFromUrl);
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  // If a code was passed via URL, look it up immediately. Used by the
  // email-invitation path (L33) where the email's "Join" button deep-links
  // to /join-tournament?code=ABC123.
  useEffect(() => {
    if (codeFromUrl) {
      lookupTournament(codeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookupTournament = async (rawCode: string) => {
    setError(null);
    const normalized = normalizeJoinCode(rawCode);

    if (!isValidJoinCodeFormat(normalized)) {
      setError(
        "That doesn't look like a valid join code. Codes are 6 characters (letters and numbers, no zeros or ones)."
      );
      return;
    }

    setStage("loading");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be logged in to join a tournament.");
      setStage("enter-code");
      return;
    }

    // Find the tournament. Filter to event_type='tournament' to be defensive
    // (the unique index doesn't restrict by event type so in theory a future
    // bug could let a non-tournament have a code).
    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select(
        `id, name, description, start_date, end_date,
         tournament_entry_fee_cents, tournament_join_code,
         tournament_requires_approval, tournament_max_teams,
         organizations(name)`
      )
      .eq("tournament_join_code", normalized)
      .eq("event_type", "tournament")
      .maybeSingle();

    if (evErr) {
      setError(`Lookup failed: ${evErr.message}`);
      setStage("enter-code");
      return;
    }
    if (!ev) {
      setError(
        "We couldn't find an open tournament with that code. Double-check the spelling with the host."
      );
      setStage("enter-code");
      return;
    }

    // Count joining teams for cap enforcement + display
    const { count: joinedCount } = await supabase
      .from("tournament_teams")
      .select("*", { count: "exact", head: true })
      .eq("tournament_event_id", ev.id)
      .in("status", ["pending_approval", "active"]);

    const joined = joinedCount ?? 0;

    if (ev.tournament_max_teams && joined >= ev.tournament_max_teams) {
      setError(
        `This tournament is full (${joined}/${ev.tournament_max_teams} teams registered). Contact the host if you think this is a mistake.`
      );
      setStage("enter-code");
      return;
    }

    // Pull host org name (relationship is a single row, but typed loosely)
    let hostOrgName: string | null = null;
    const orgRel = ev.organizations;
    if (orgRel) {
      if (Array.isArray(orgRel)) {
        hostOrgName = orgRel[0]?.name || null;
      } else if (typeof orgRel === "object" && "name" in orgRel) {
        hostOrgName = (orgRel as { name?: string }).name || null;
      }
    }

    setTournament({
      id: ev.id,
      name: ev.name,
      description: ev.description,
      start_date: ev.start_date,
      end_date: ev.end_date,
      tournament_entry_fee_cents: ev.tournament_entry_fee_cents ?? 0,
      tournament_join_code: ev.tournament_join_code!,
      tournament_requires_approval: ev.tournament_requires_approval ?? false,
      tournament_max_teams: ev.tournament_max_teams,
      host_org_name: hostOrgName,
      joined_teams_count: joined,
    });

    // Fetch the coach's eligible teams (teams they own, across all of
    // their organizations). Also flag teams that are ALREADY registered
    // for this tournament so we can disable them in the picker.
    const { data: teamRows, error: teamsErr } = await supabase
      .from("teams")
      .select("id, name, organization_id, organizations(name)")
      .eq("owner_id", user.id)
      .order("name");

    if (teamsErr || !teamRows) {
      setError(`Couldn't load your teams: ${teamsErr?.message || "unknown error"}.`);
      setStage("enter-code");
      return;
    }

    // Get player counts in one query
    const teamIds = teamRows.map((t) => t.id);
    const playerCounts: Record<string, number> = {};
    if (teamIds.length > 0) {
      const { data: playersData } = await supabase
        .from("players")
        .select("team_id")
        .in("team_id", teamIds);
      (playersData || []).forEach((p) => {
        playerCounts[p.team_id] = (playerCounts[p.team_id] || 0) + 1;
      });
    }

    // Get already-joined teams for this tournament
    const { data: existingJoins } = await supabase
      .from("tournament_teams")
      .select("team_id")
      .eq("tournament_event_id", ev.id)
      .in("status", ["pending_approval", "active"]);
    const alreadyJoined = new Set((existingJoins || []).map((r) => r.team_id));

    const teamsEnriched: Team[] = teamRows.map((t) => {
      const orgRel = t.organizations;
      let orgName: string | null = null;
      if (orgRel) {
        if (Array.isArray(orgRel)) {
          orgName = orgRel[0]?.name || null;
        } else if (typeof orgRel === "object" && "name" in orgRel) {
          orgName = (orgRel as { name?: string }).name || null;
        }
      }
      return {
        id: t.id,
        name: t.name,
        organization_id: t.organization_id,
        org_name: orgName,
        player_count: playerCounts[t.id] || 0,
        already_joined: alreadyJoined.has(t.id),
      };
    });

    setTeams(teamsEnriched);

    // Auto-select first non-joined team
    const firstAvailable = teamsEnriched.find((t) => !t.already_joined);
    if (firstAvailable) {
      setSelectedTeamId(firstAvailable.id);
    }

    setStage("preview");
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupTournament(codeInput);
  };

  const handleJoin = async () => {
    if (!tournament || !selectedTeamId) return;
    setError(null);
    setStage("joining");

    const supabase = createClient();

    // L32 — Stub Stripe payment. Inserts the tournament_teams row directly
    // as if payment succeeded. Real Stripe wiring (Phase 10) will replace
    // this with: create Checkout session -> redirect -> webhook confirms
    // payment -> THEN insert this row.
    const status = tournament.tournament_requires_approval
      ? "pending_approval"
      : "active";

    const { error: insertErr } = await supabase
      .from("tournament_teams")
      .insert({
        tournament_event_id: tournament.id,
        team_id: selectedTeamId,
        entry_fee_paid_cents: tournament.tournament_entry_fee_cents,
        entry_fee_paid_at: new Date().toISOString(),
        entry_fee_stripe_id: null, // Stub — no Stripe yet
        status,
      });

    if (insertErr) {
      // Surface a clear error. The unique constraint will fire if the team
      // is already registered (defensive — UI already prevents this).
      if (insertErr.code === "23505") {
        setError(
          "That team is already registered for this tournament. Pick a different team or check your dashboard."
        );
      } else {
        setError(`Couldn't complete registration: ${insertErr.message}`);
      }
      setStage("preview");
      return;
    }

    setStage("success");
  };

  // ---------------- RENDER ----------------

  return (
    <AppShell active="events" userDisplayName="">
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
        <Link
          href="/dashboard"
          style={{ color: "var(--e2k-cyan)", fontSize: 14, fontWeight: 600 }}
        >
          ← Back to dashboard
        </Link>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 800,
            marginTop: 16,
            marginBottom: 8,
          }}
        >
          Join an existing tournament
        </h1>
        <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>
          Got a join code from the tournament host? Enter it below to see the
          tournament details and register your team.
        </p>

        {error && (
          <div
            style={{
              padding: 16,
              marginBottom: 24,
              background: "rgba(255, 117, 95, 0.1)",
              border: "1px solid rgba(255, 117, 95, 0.4)",
              borderRadius: 8,
              color: "#ff755f",
            }}
          >
            {error}
          </div>
        )}

        {stage === "enter-code" && (
          <form onSubmit={handleCodeSubmit}>
            <label htmlFor="codeInput" className="form-label">
              Tournament join code
            </label>
            <input
              id="codeInput"
              type="text"
              className="form-input"
              placeholder="e.g. SPR-9K2"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              autoFocus
              style={{
                fontSize: 24,
                letterSpacing: 4,
                textAlign: "center",
                textTransform: "uppercase",
                fontFamily: "monospace",
              }}
              maxLength={8}
            />
            <p className="form-hint">
              The code is 6 characters. The hyphen is optional — &quot;SPR-9K2&quot;
              and &quot;SPR9K2&quot; both work.
            </p>

            <div style={{ marginTop: 24 }}>
              <button type="submit" className="btn-primary btn-inline" style={{ width: "100%" }}>
                Look up tournament →
              </button>
            </div>
          </form>
        )}

        {stage === "loading" && (
          <div style={{ textAlign: "center", padding: 48 }}>
            <div className="invites-spinner" />
            <p style={{ marginTop: 16 }}>Looking up tournament…</p>
          </div>
        )}

        {stage === "preview" && tournament && (
          <>
            <div
              style={{
                padding: 24,
                background: "rgba(53, 213, 223, 0.05)",
                border: "1px solid rgba(53, 213, 223, 0.3)",
                borderRadius: 12,
                marginBottom: 24,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--e2k-cyan)", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                JOIN CODE: {formatJoinCodeForDisplay(tournament.tournament_join_code)}
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>
                {tournament.name}
              </h2>
              {tournament.host_org_name && (
                <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: 16, fontSize: 14 }}>
                  Hosted by <strong>{tournament.host_org_name}</strong>
                </p>
              )}

              <div style={{ display: "grid", gap: 8, fontSize: 14, marginBottom: 16 }}>
                <div>📅 {formatDateRange(tournament.start_date, tournament.end_date)}</div>
                <div>
                  👥 {tournament.joined_teams_count}{" "}
                  {tournament.tournament_max_teams
                    ? `of ${tournament.tournament_max_teams} teams registered`
                    : tournament.joined_teams_count === 1
                      ? "team registered so far"
                      : "teams registered so far"}
                </div>
              </div>

              {tournament.description && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 4, opacity: 0.7 }}>
                    ABOUT
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.6 }}>{tournament.description}</p>
                </div>
              )}

              <div
                style={{
                  padding: 16,
                  background: "rgba(255, 117, 95, 0.08)",
                  border: "1px solid rgba(255, 117, 95, 0.3)",
                  borderRadius: 8,
                  marginTop: 16,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, opacity: 0.7, marginBottom: 4 }}>
                  ENTRY FEE
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "var(--e2k-coral)", fontFamily: "var(--font-display)" }}>
                  {formatMoney(tournament.tournament_entry_fee_cents)}
                  {tournament.tournament_entry_fee_cents > 0 && (
                    <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.7, marginLeft: 8 }}>
                      per team
                    </span>
                  )}
                </div>
                {tournament.tournament_entry_fee_cents > 0 && (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 8, marginBottom: 0 }}>
                    Paid one-time when you join. Covers your entire team for this tournament. No surprise add-ons at checkout — what you see is what you pay.
                  </p>
                )}
              </div>

              <div
                style={{
                  padding: 12,
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 8,
                  marginTop: 16,
                  fontSize: 13,
                }}
              >
                <strong>🎯 Heads up:</strong> Tournaments use strict
                all-or-nothing scoring. Your team only earns the points for a
                challenge when <em>every</em> player on your roster completes
                it. Make sure your roster is ready to commit before you join.
              </div>
            </div>

            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Which team is joining?
            </h3>
            {teams.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  background: "rgba(255, 200, 80, 0.08)",
                  border: "1px solid rgba(255, 200, 80, 0.3)",
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              >
                You don&apos;t have any teams yet. Create one first, then come
                back here to join. <Link href="/dashboard" style={{ color: "var(--e2k-cyan)" }}>Go to dashboard →</Link>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
                {teams.map((team) => (
                  <label
                    key={team.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 16,
                      background: selectedTeamId === team.id ? "rgba(53, 213, 223, 0.08)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${
                        selectedTeamId === team.id
                          ? "rgba(53, 213, 223, 0.4)"
                          : "rgba(255, 255, 255, 0.1)"
                      }`,
                      borderRadius: 8,
                      cursor: team.already_joined ? "not-allowed" : "pointer",
                      opacity: team.already_joined ? 0.4 : 1,
                    }}
                  >
                    <input
                      type="radio"
                      name="team"
                      value={team.id}
                      checked={selectedTeamId === team.id}
                      onChange={() => setSelectedTeamId(team.id)}
                      disabled={team.already_joined}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{team.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {team.org_name && <>{team.org_name} · </>}
                        {team.player_count} player{team.player_count === 1 ? "" : "s"}
                        {team.already_joined && " · Already in this tournament"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {teams.length > 0 && (
              <button
                type="button"
                className="btn-primary btn-inline"
                onClick={handleJoin}
                disabled={!selectedTeamId || teams.find((t) => t.id === selectedTeamId)?.already_joined}
                style={{ width: "100%" }}
              >
                {tournament.tournament_entry_fee_cents > 0
                  ? `Join ${tournament.name} · Pay ${formatMoney(tournament.tournament_entry_fee_cents)} →`
                  : `Join ${tournament.name} →`}
              </button>
            )}
          </>
        )}

        {stage === "joining" && (
          <div style={{ textAlign: "center", padding: 48 }}>
            <div className="invites-spinner" />
            <p style={{ marginTop: 16 }}>Registering your team…</p>
          </div>
        )}

        {stage === "success" && tournament && (
          <div
            style={{
              padding: 32,
              background: "rgba(93, 202, 165, 0.08)",
              border: "1px solid rgba(93, 202, 165, 0.4)",
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                background: "linear-gradient(135deg, #5DCAA5, #6EE7B7)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                fontWeight: 800,
                color: "white",
                marginBottom: 16,
              }}
            >
              ✓
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
              You&apos;re in!
            </h2>
            <p style={{ fontSize: 16, marginBottom: 8 }}>
              Your team is registered for <strong>{tournament.name}</strong>.
              {tournament.tournament_requires_approval && (
                <> Pending host approval — you&apos;ll get a notification once they accept.</>
              )}
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 16 }}>
              Your players can start submitting challenges as soon as the
              tournament opens on {new Date(tournament.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 24, fontStyle: "italic" }}>
              🎯 Heads up: this is a strict-scoring tournament. Your team only
              earns points on each challenge if every player on your roster
              completes it. Make sure your roster is ready!
            </p>

            <Link
              href="/dashboard"
              className="btn-primary btn-inline"
              style={{ textDecoration: "none" }}
            >
              Go to my dashboard →
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// Default export: wraps JoinTournamentContent in <Suspense>. Required by
// Next.js 15 — any client component using useSearchParams() must be inside
// a Suspense boundary or the page fails to prerender. The fallback uses
// the same AppShell frame so the layout doesn't visibly shift while the
// content hydrates.
export default function JoinTournamentPage() {
  return (
    <Suspense fallback={<JoinTournamentFallback />}>
      <JoinTournamentContent />
    </Suspense>
  );
}

function JoinTournamentFallback() {
  return (
    <AppShell active="events" userDisplayName="">
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
        <div style={{ textAlign: "center", padding: 48, opacity: 0.6 }}>
          <div className="invites-spinner" />
          <p style={{ marginTop: 16 }}>Loading…</p>
        </div>
      </div>
    </AppShell>
  );
}

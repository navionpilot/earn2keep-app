// =============================================================================
// app/tournament/[code]/page.tsx — Public tournament info page (Slice L33)
// =============================================================================
// Accessible WITHOUT login. A coach who got a tournament invitation can land
// here to see what they're being invited to before signing up. The page is
// also the destination of "View tournament details →" buttons in invitation
// emails.
//
// Data flow:
//   - Server component, server-side rendered
//   - Uses Supabase anon client (no auth) to call SECURITY DEFINER RPCs
//     defined in supabase-migration-L33.sql:
//       get_public_tournament_info(code)
//       get_public_tournament_challenges(tournament_event_id)
//   - Both RPCs are granted to `anon` so unauthenticated requests work
//
// Decision logic for the CTAs:
//   - If the visitor is logged in → "Pick a team & join" links to
//     /join-tournament?code=ABC (deeplinks past the code-entry step)
//   - If they're NOT logged in → "Sign up & join" routes to /signup with a
//     redirect param so they land back on /join-tournament?code=ABC after
//     account creation
// =============================================================================

import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatJoinCodeForDisplay } from "@/lib/tournamentJoinCode";
import TournamentStandings from "@/components/TournamentStandings";
import TournamentTeamRosterStatus from "@/components/TournamentTeamRosterStatus";
import TournamentTiebreakerBlock from "@/components/TournamentTiebreakerBlock";

interface PageProps {
  params: Promise<{ code: string }>;
}

interface TournamentInfo {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  tournament_entry_fee_cents: number;
  tournament_join_code: string;
  tournament_requires_approval: boolean;
  tournament_max_teams: number | null;
  tournament_tiebreaker_window_hours: number;
  tournament_tiebreaker_on_any_tie: boolean;
  host_org_id: string;
  host_org_name: string | null;
  host_org_city: string | null;
  host_org_state: string | null;
  joined_teams_count: number;
  first_place_prize: string | null;
  first_place_amount: number | null;
  second_place_prize: string | null;
  second_place_amount: number | null;
  third_place_prize: string | null;
  third_place_amount: number | null;
  prize_count: number | null;
}

interface ChallengeRow {
  id: string;
  name: string;
  description: string | null;
  target_value: number | null;
  target_unit: string | null;
  points_value: number | null;
  is_tiebreaker: boolean;
  day_index: number | null;
}

function formatMoney(cents: number): string {
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  })}`;
}

function formatPrizeAmount(amount: number | null): string {
  if (amount === null || amount <= 0) return "";
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatLongDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PublicTournamentInfoPage({ params }: PageProps) {
  const { code } = await params;
  const supabase = await createClient();

  // Call the SECURITY DEFINER RPC. Works without auth — RPC is granted to `anon`.
  const { data: rows, error: rpcErr } = await supabase
    .rpc("get_public_tournament_info", { p_code: code });

  if (rpcErr) {
    // Surface as a 404 — most likely cause is a bad code anyway. The error
    // would only fire on real DB issues, which the user can't fix.
    notFound();
  }

  const tournament: TournamentInfo | null =
    Array.isArray(rows) && rows.length > 0 ? (rows[0] as TournamentInfo) : null;

  if (!tournament) {
    notFound();
  }

  // Fetch challenges (regular + tiebreaker)
  const { data: challengeRows } = await supabase
    .rpc("get_public_tournament_challenges", {
      p_tournament_event_id: tournament.id,
    });

  const challenges: ChallengeRow[] = (challengeRows as ChallengeRow[]) || [];
  const regularChallenges = challenges.filter((c) => !c.is_tiebreaker);
  const tiebreakerChallenge = challenges.find((c) => c.is_tiebreaker) || null;

  // Determine the visitor's auth state to pick CTAs
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  // L34 — If the visitor is logged in AND owns one or more teams that are
  // participating in this tournament (either as the host's teams via
  // event_participants or as joining teams via tournament_teams), surface
  // strict-scored standings + per-team roster status panels below the basic
  // info. This is what turns the public info page into the "participant
  // home" for the tournament once someone's actually in.
  // L37 — Also detect "user is a player on a team in this tournament" via
  // players.linked_user_id. Players need to see the same participant view
  // as coaches so they can read roster status and submit to the tiebreaker.
  let participantTeams: { team_id: string; team_name: string }[] = [];
  if (isLoggedIn && user) {
    // 1) Teams the user owns directly
    const { data: ownedTeams } = await supabase
      .from("teams")
      .select("id, name")
      .eq("owner_id", user.id);
    // 2) Teams where the user is a linked player
    const { data: linkedPlayerRows } = await supabase
      .from("players")
      .select("team_id, teams(id, name)")
      .eq("linked_user_id", user.id);
    type TeamLite = { id: string; name: string };
    const teamMap: Record<string, TeamLite> = {};
    (ownedTeams || []).forEach((t) => {
      teamMap[t.id] = { id: t.id, name: t.name };
    });
    (linkedPlayerRows || []).forEach((row) => {
      const rel = row.teams;
      if (rel) {
        const t = Array.isArray(rel) ? rel[0] : rel;
        if (t && (t as { id?: string }).id) {
          const obj = t as { id: string; name: string };
          teamMap[obj.id] = { id: obj.id, name: obj.name };
        }
      }
    });
    const candidateTeamIds = Object.keys(teamMap);
    if (candidateTeamIds.length > 0) {
      const [{ data: epRows }, { data: ttRows }] = await Promise.all([
        supabase
          .from("event_participants")
          .select("team_id")
          .eq("event_id", tournament.id)
          .in("team_id", candidateTeamIds),
        supabase
          .from("tournament_teams")
          .select("team_id")
          .eq("tournament_event_id", tournament.id)
          .in("team_id", candidateTeamIds)
          .in("status", ["active", "pending_approval"]),
      ]);
      const participatingIds = new Set<string>([
        ...(epRows || []).map((r) => r.team_id),
        ...(ttRows || []).map((r) => r.team_id),
      ]);
      participantTeams = candidateTeamIds
        .filter((id) => participatingIds.has(id))
        .map((id) => teamMap[id])
        .map((t) => ({ team_id: t.id, team_name: t.name }));
    }
  }
  const isParticipant = participantTeams.length > 0;

  // L35 — Process tiebreaker state on this page load. Idempotent.
  // L37 — Type updated to receive from_state; fire notify on transition.
  type TiebreakerStateRow = {
    from_state: string;
    state: string;
    activated_at: string | null;
    deadline_at: string | null;
    winner_team_id: string | null;
    resolved_at: string | null;
    tied_team_ids: string[] | null;
  };
  let tiebreakerState: TiebreakerStateRow | null = null;
  let tiedTeamsDetail: { team_id: string; team_name: string; org_name: string | null }[] = [];
  let tiebreakerChallengeMeta: {
    name: string;
    target_value: number | null;
    target_unit: string | null;
  } | null = null;

  if (isLoggedIn) {
    const { data: stateRows } = await supabase.rpc("process_tournament_tiebreaker", {
      p_event_id: tournament.id,
    });
    if (Array.isArray(stateRows) && stateRows.length > 0) {
      tiebreakerState = stateRows[0] as TiebreakerStateRow;
    }

    // L37 — On transition, fire the notification API (fire-and-forget).
    if (tiebreakerState && tiebreakerState.from_state !== tiebreakerState.state) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      if (baseUrl) {
        fetch(`${baseUrl}/api/tournament-tiebreaker/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: tournament.id,
            fromState: tiebreakerState.from_state,
            toState: tiebreakerState.state,
          }),
        }).catch(() => {
          // Swallow — page doesn't depend on email delivery
        });
      }
    }
    if (tiebreakerState?.tied_team_ids && tiebreakerState.tied_team_ids.length > 0) {
      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, name, organizations(name)")
        .in("id", tiebreakerState.tied_team_ids);
      tiedTeamsDetail = (teamRows || []).map((r) => {
        const rel = r.organizations;
        let orgName: string | null = null;
        if (rel) {
          if (Array.isArray(rel)) orgName = rel[0]?.name ?? null;
          else if (typeof rel === "object" && "name" in rel)
            orgName = (rel as { name?: string }).name ?? null;
        }
        return { team_id: r.id, team_name: r.name, org_name: orgName };
      });
    }
    // tiebreakerChallenge already shown on the page as a separate block —
    // we pull metadata for the active-state countdown UI.
    if (tiebreakerChallenge) {
      tiebreakerChallengeMeta = {
        name: tiebreakerChallenge.name,
        target_value: tiebreakerChallenge.target_value,
        target_unit: tiebreakerChallenge.target_unit,
      };
    }
  }

  // Build deep link based on auth state
  const joinPath = `/join-tournament?code=${encodeURIComponent(
    tournament.tournament_join_code
  )}`;
  const ctaHref = isLoggedIn
    ? joinPath
    : `/signup?next=${encodeURIComponent(joinPath)}`;

  const isFull = tournament.tournament_max_teams !== null &&
    tournament.joined_teams_count >= tournament.tournament_max_teams;

  const today = new Date();
  const startDateObj = new Date(tournament.start_date + "T12:00:00");
  const hasStarted = startDateObj.getTime() < today.getTime();

  const hostLocation = [tournament.host_org_city, tournament.host_org_state]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#041418",
        color: "#f7fbfb",
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Slim header */}
      <header
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: "Sora, system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 22,
              color: "#ff755f",
              letterSpacing: "-0.4px",
              textDecoration: "none",
            }}
          >
            earn²keep
          </Link>
          <div>
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                style={{
                  color: "#35d5df",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    marginRight: 16,
                  }}
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  style={{
                    color: "#35d5df",
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Eyebrow + Tournament name */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#35d5df",
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          ⚡ Tournament Invite
        </div>
        <h1
          style={{
            fontFamily: "Sora, system-ui, sans-serif",
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.6px",
            lineHeight: 1.1,
            margin: "0 0 16px 0",
          }}
        >
          {tournament.name}
        </h1>
        {tournament.host_org_name && (
          <p
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,0.75)",
              marginBottom: 24,
            }}
          >
            Hosted by <strong style={{ color: "#fff" }}>{tournament.host_org_name}</strong>
            {hostLocation && (
              <span style={{ opacity: 0.6 }}> · {hostLocation}</span>
            )}
          </p>
        )}

        {tournament.description && (
          <div
            style={{
              padding: 20,
              background: "rgba(53, 213, 223, 0.04)",
              border: "1px solid rgba(53, 213, 223, 0.15)",
              borderRadius: 12,
              marginBottom: 24,
              fontSize: 15,
              lineHeight: 1.6,
              fontStyle: "italic",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {tournament.description}
          </div>
        )}

        {/* Key facts grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              padding: 16,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, opacity: 0.6, marginBottom: 4 }}>
              📅 DATES
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {formatLongDate(tournament.start_date)}
              <br />
              <span style={{ opacity: 0.6 }}>through</span>
              <br />
              {formatLongDate(tournament.end_date)}
            </div>
          </div>

          <div
            style={{
              padding: 16,
              background: "rgba(255, 117, 95, 0.06)",
              border: "1px solid rgba(255, 117, 95, 0.25)",
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, opacity: 0.7, marginBottom: 4, color: "#ff755f" }}>
              💵 ENTRY FEE / TEAM
            </div>
            <div style={{ fontFamily: "Sora, system-ui, sans-serif", fontSize: 26, fontWeight: 800, color: "#ff755f" }}>
              {formatMoney(tournament.tournament_entry_fee_cents)}
            </div>
            {tournament.tournament_entry_fee_cents > 0 && (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                Paid once when your team joins.
              </div>
            )}
          </div>

          <div
            style={{
              padding: 16,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, opacity: 0.6, marginBottom: 4 }}>
              👥 TEAMS REGISTERED
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {tournament.joined_teams_count}
              {tournament.tournament_max_teams && (
                <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.6 }}>
                  {" "}/ {tournament.tournament_max_teams}
                </span>
              )}
            </div>
            {!tournament.tournament_max_teams && (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                No team cap
              </div>
            )}
          </div>
        </div>

        {/* L38 — "Winner takes the pot" — replaces the old per-place prize
            display. Tournament pot = Entry Fee × registered teams. Always
            shown for tournaments since this is the model. */}
        <div
          style={{
            padding: 20,
            background: "rgba(255, 208, 0, 0.06)",
            border: "1px solid rgba(255, 208, 0, 0.3)",
            borderRadius: 12,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#ffd000",
              letterSpacing: 1.5,
              marginBottom: 8,
            }}
          >
            🏆 WINNER TAKES THE POT
          </div>
          <div
            style={{
              fontFamily: "Sora, system-ui, sans-serif",
              fontSize: 32,
              fontWeight: 800,
              color: "#ffd000",
              lineHeight: 1.1,
            }}
          >
            {(() => {
              const fee = tournament.tournament_entry_fee_cents ?? 0;
              const pot = fee * tournament.joined_teams_count;
              return `$${(pot / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            })()}
            <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.7, marginLeft: 10 }}>
              ({tournament.joined_teams_count} {tournament.joined_teams_count === 1 ? "team" : "teams"} registered)
            </span>
          </div>
          <p style={{ fontSize: 13, opacity: 0.85, margin: "10px 0 0 0", lineHeight: 1.6 }}>
            All Entry Fees go into one pot. The pot grows by{" "}
            <strong style={{ color: "#ffd000" }}>
              ${((tournament.tournament_entry_fee_cents ?? 0) / 100).toLocaleString("en-US")}
            </strong>{" "}
            for every team that joins.{" "}
            <strong style={{ color: "#f7fbfb" }}>The team that wins the tournament takes the whole pot.</strong>{" "}
            No individual winners, no split pot.
          </p>
        </div>

        {/* Strict scoring callout */}
        <div
          style={{
            padding: 20,
            background: "rgba(53, 213, 223, 0.06)",
            border: "1px solid rgba(53, 213, 223, 0.3)",
            borderLeft: "4px solid #35d5df",
            borderRadius: 10,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#35d5df",
              letterSpacing: 1.5,
              marginBottom: 8,
            }}
          >
            🎯 STRICT ALL-OR-NOTHING SCORING
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, color: "rgba(255,255,255,0.9)" }}>
            Your team earns the full point value of a challenge <em>only</em> when every
            player on your roster completes it. One absence = zero for that challenge.
            The whole team is the unit of competition. Make sure your roster is ready to
            commit before you join.
          </p>
        </div>

        {/* Challenges */}
        {regularChallenges.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontFamily: "Sora, system-ui, sans-serif",
                fontSize: 22,
                fontWeight: 700,
                margin: "0 0 12px 0",
              }}
            >
              The challenges
            </h2>
            <div style={{ display: "grid", gap: 8 }}>
              {regularChallenges.map((ch, i) => (
                <div
                  key={ch.id}
                  style={{
                    padding: 14,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      background: "rgba(53, 213, 223, 0.15)",
                      color: "#35d5df",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{ch.name}</div>
                    {ch.target_value && ch.target_unit && (
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                        Target: {ch.target_value} {ch.target_unit}
                        {ch.points_value ? ` · ${ch.points_value} pts` : ""}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tiebreaker challenge */}
        {tiebreakerChallenge && (
          <div
            style={{
              padding: 16,
              background: "rgba(255, 117, 95, 0.05)",
              border: "1px dashed rgba(255, 117, 95, 0.4)",
              borderRadius: 10,
              marginBottom: 32,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#ff755f",
                letterSpacing: 1.5,
                marginBottom: 8,
              }}
            >
              ⚡ SUDDEN-DEATH TIEBREAKER
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {tiebreakerChallenge.name}
            </div>
            {tiebreakerChallenge.target_value && tiebreakerChallenge.target_unit && (
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                Target: {tiebreakerChallenge.target_value} {tiebreakerChallenge.target_unit}
              </div>
            )}
            <p style={{ fontSize: 12, opacity: 0.75, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
              Only fires if teams tie for a prize position at the end. {tournament.tournament_tiebreaker_window_hours}-hour
              window. First team to hit 100% completion wins the tie.
            </p>
          </div>
        )}

        {/* L34 — When the visitor is a participant, surface strict-scored
            standings + their team(s)' roster status here. Replaces the
            join CTA below since they're already in. */}
        {isParticipant && (
          <>
            <div
              style={{
                padding: 18,
                background: "rgba(110, 231, 183, 0.06)",
                border: "1px solid rgba(110, 231, 183, 0.3)",
                borderRadius: 12,
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: "rgba(110, 231, 183, 0.18)",
                  color: "#6EE7B7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                ✓
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  You&apos;re in this tournament.
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                  Your team{participantTeams.length > 1 ? "s" : ""}:{" "}
                  {participantTeams.map((t) => t.team_name).join(", ")}
                </div>
              </div>
            </div>

            <TournamentStandings tournamentEventId={tournament.id} />

            {participantTeams.map((t) => (
              <TournamentTeamRosterStatus
                key={t.team_id}
                tournamentEventId={tournament.id}
                teamId={t.team_id}
                teamName={t.team_name}
              />
            ))}

            {/* L35 — Tiebreaker block visible to participants */}
            {tiebreakerState && (
              <TournamentTiebreakerBlock
                state={tiebreakerState.state}
                activatedAt={tiebreakerState.activated_at}
                deadlineAt={tiebreakerState.deadline_at}
                winnerTeamId={tiebreakerState.winner_team_id}
                tiedTeamIds={tiebreakerState.tied_team_ids ?? []}
                tiedTeams={tiedTeamsDetail}
                tiebreakerChallengeId={tiebreakerChallenge?.id ?? null}
                tiebreakerChallengeName={tiebreakerChallengeMeta?.name ?? null}
                tiebreakerChallengeTargetValue={tiebreakerChallengeMeta?.target_value ?? null}
                tiebreakerChallengeTargetUnit={tiebreakerChallengeMeta?.target_unit ?? null}
                isCurrentUserHost={false}
                isCurrentUserOnTiedTeam={
                  // True when the user has a participating team that's in the
                  // tied set for this tournament.
                  participantTeams.some((t) =>
                    (tiebreakerState?.tied_team_ids ?? []).includes(t.team_id)
                  )
                }
                eventId={tournament.id}
              />
            )}
          </>
        )}

        {/* CTA — only shown to non-participants. Participants see the
            standings + roster status above instead. */}
        {!isParticipant && (
        <div
          style={{
            padding: 24,
            background: "linear-gradient(135deg, rgba(53,213,223,0.08), rgba(255,117,95,0.08))",
            border: "1px solid rgba(53,213,223,0.25)",
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          {isFull ? (
            <>
              <h3 style={{ fontFamily: "Sora, system-ui, sans-serif", fontSize: 22, fontWeight: 800, margin: "0 0 8px 0" }}>
                Sorry — this tournament is full.
              </h3>
              <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 0 }}>
                {tournament.joined_teams_count} of {tournament.tournament_max_teams} teams have already registered.
                Contact the host if you think this is a mistake.
              </p>
            </>
          ) : hasStarted ? (
            <>
              <h3 style={{ fontFamily: "Sora, system-ui, sans-serif", fontSize: 22, fontWeight: 800, margin: "0 0 8px 0" }}>
                This tournament has already started.
              </h3>
              <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 0 }}>
                Registration closes at the start date. Reach out to the host directly if you'd like to discuss.
              </p>
            </>
          ) : (
            <>
              <h3 style={{ fontFamily: "Sora, system-ui, sans-serif", fontSize: 24, fontWeight: 800, margin: "0 0 8px 0" }}>
                Ready to compete?
              </h3>
              <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 20, maxWidth: 480, margin: "0 auto 20px" }}>
                {isLoggedIn
                  ? "Pick which team is entering and confirm your registration."
                  : "Create your free organizer account, then pick which team is entering and confirm registration."}
              </p>

              {/* L38 — Prominently displayed join code, always visible.
                  This is the page someone lands on from the invitation
                  email; the code should be impossible to miss. */}
              <div
                style={{
                  display: "inline-block",
                  margin: "0 auto 24px auto",
                  padding: "18px 28px",
                  background: "rgba(53, 213, 223, 0.08)",
                  border: "2px solid rgba(53, 213, 223, 0.5)",
                  borderRadius: 12,
                  textAlign: "center",
                  minWidth: 280,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#9fc3c7",
                    letterSpacing: 1.8,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Tournament Join Code
                </div>
                <div
                  style={{
                    fontFamily: "Sora, ui-monospace, monospace",
                    fontSize: 36,
                    fontWeight: 800,
                    color: "#35d5df",
                    letterSpacing: 6,
                    lineHeight: 1.1,
                  }}
                >
                  {formatJoinCodeForDisplay(tournament.tournament_join_code)}
                </div>
              </div>

              {/* L38 — Accept + Decline buttons. Accept follows the existing
                  signup→join path; Decline goes to a simple thank-you page
                  (no DB tracking — invitation declines are an off-platform
                  signal for now). */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href={ctaHref}
                  style={{
                    display: "inline-block",
                    padding: "14px 32px",
                    background: "#ff755f",
                    color: "white",
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: 15,
                    textDecoration: "none",
                    letterSpacing: 0.3,
                  }}
                >
                  ✓ Accept invitation →
                </Link>
                <Link
                  href={`/tournament/${tournament.tournament_join_code}/declined`}
                  style={{
                    display: "inline-block",
                    padding: "14px 32px",
                    background: "transparent",
                    color: "rgba(255, 255, 255, 0.75)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  Decline
                </Link>
              </div>

              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 16, lineHeight: 1.5 }}>
                Accept takes you to {isLoggedIn ? "the team picker" : "sign up / log in"}.
                The join code above is what your team will use to register.
              </div>
            </>
          )}
        </div>
        )}

        {/* L42 — Marketplace disclosure. Required legal cover for joining
            teams before they pay. Makes the host-pays-prize relationship
            explicit so prize disputes don't land on earn²keep. */}
        <div
          style={{
            marginTop: 32,
            padding: 16,
            background: "rgba(255, 117, 95, 0.04)",
            border: "1px solid rgba(255, 117, 95, 0.2)",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.6,
            opacity: 0.92,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "#ff755f", letterSpacing: 1.4, marginBottom: 6 }}>
            ⚠️ ABOUT PRIZE PAYMENTS
          </div>
          <p style={{ margin: 0 }}>
            earn²keep facilitates this tournament but does not hold or
            distribute prize money.{" "}
            <strong style={{ color: "#f7fbfb" }}>
              {tournament.host_org_name || "The host organization"}
            </strong>{" "}
            is responsible for paying the winning team directly from their
            organization&apos;s bank account when the tournament resolves.
            If you have questions about prize payment terms or timing,
            contact the host directly before joining. Disputes over prize
            payment are between you and the host — earn²keep is not party
            to them.
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            textAlign: "center",
            marginTop: 40,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 12,
            opacity: 0.55,
          }}
        >
          Want to learn more about earn²keep?{" "}
          <Link href="/" style={{ color: "#35d5df", textDecoration: "none" }}>
            See how it works →
          </Link>
        </div>
      </main>
    </div>
  );
}

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
  challenge_type: string | null;
  target_value: number | null;
  target_unit: string | null;
  points_value: number | null;
  is_tiebreaker: boolean;
  sort_order: number | null;
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

        {/* Prizes */}
        {(tournament.first_place_prize || tournament.first_place_amount) && (
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
                marginBottom: 12,
              }}
            >
              🏆 THE PRIZE
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {tournament.first_place_prize && (
                <div style={{ fontSize: 15 }}>
                  <strong>1st place:</strong> {tournament.first_place_prize}
                  {tournament.first_place_amount && tournament.first_place_amount > 0 && (
                    <span style={{ color: "#ffd000", fontWeight: 700 }}>
                      {" "}({formatPrizeAmount(tournament.first_place_amount)})
                    </span>
                  )}
                </div>
              )}
              {tournament.second_place_prize && (
                <div style={{ fontSize: 14, opacity: 0.85 }}>
                  <strong>2nd place:</strong> {tournament.second_place_prize}
                  {tournament.second_place_amount && tournament.second_place_amount > 0 && (
                    <span style={{ opacity: 0.7 }}> ({formatPrizeAmount(tournament.second_place_amount)})</span>
                  )}
                </div>
              )}
              {tournament.third_place_prize && (
                <div style={{ fontSize: 14, opacity: 0.85 }}>
                  <strong>3rd place:</strong> {tournament.third_place_prize}
                  {tournament.third_place_amount && tournament.third_place_amount > 0 && (
                    <span style={{ opacity: 0.7 }}> ({formatPrizeAmount(tournament.third_place_amount)})</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

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

        {/* CTA */}
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
                  : "Create your free coach account, then pick which team is entering and confirm registration."}
              </p>
              <Link
                href={ctaHref}
                style={{
                  display: "inline-block",
                  padding: "14px 32px",
                  background: "#ff755f",
                  color: "white",
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 15,
                  textDecoration: "none",
                  letterSpacing: 0.3,
                }}
              >
                {isLoggedIn
                  ? `Join ${tournament.name} →`
                  : `Sign up & join →`}
              </Link>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 12 }}>
                Or sign in and enter join code{" "}
                <strong style={{ color: "#35d5df", letterSpacing: 2, fontFamily: "monospace" }}>
                  {formatJoinCodeForDisplay(tournament.tournament_join_code)}
                </strong>{" "}
                at /join-tournament
              </div>
            </>
          )}
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

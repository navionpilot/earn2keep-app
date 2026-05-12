// =============================================================================
// components/TournamentStandings.tsx — Strict-scored leaderboard (Slice L34)
// =============================================================================
// Server component. Fetches strict-scored standings via the
// get_tournament_standings RPC and renders a ranked table.
//
// Strict scoring rule:
//   A team earns the full point value of a challenge only when EVERY player
//   on its roster has an approved submission for that challenge. Anything
//   less = 0 points for that challenge.
//
// "Latest 100% completion timestamp" is shown for teams at 100% completion
// only — used as a tiebreaker preview ahead of L35's real sudden-death
// activation.
// =============================================================================

import { createClient } from "@/lib/supabase-server";

interface Props {
  tournamentEventId: string;
}

interface StandingsRow {
  team_id: string;
  team_name: string;
  org_name: string | null;
  is_host_team: boolean;
  joined_at: string;
  roster_size: number;
  total_points_earned: number;
  total_possible_points: number;
  completed_challenges_count: number;
  total_challenges_count: number;
  is_complete_100pct: boolean;
  latest_completion_timestamp: string | null;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function TournamentStandings({ tournamentEventId }: Props) {
  const supabase = await createClient();

  const { data: rows, error } = await supabase.rpc("get_tournament_standings", {
    p_tournament_event_id: tournamentEventId,
  });

  if (error) {
    return (
      <div
        style={{
          padding: 20,
          background: "rgba(255,117,95,0.08)",
          border: "1px solid rgba(255,117,95,0.3)",
          borderRadius: 12,
          marginTop: 20,
        }}
      >
        <div style={{ fontSize: 13, color: "#ff755f" }}>
          Couldn&apos;t load tournament standings: {error.message}
        </div>
      </div>
    );
  }

  const standings = (rows as StandingsRow[]) || [];

  if (standings.length === 0) {
    return (
      <div
        style={{
          padding: 20,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          marginTop: 20,
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
          🏆 STANDINGS
        </div>
        <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
          No teams have joined yet. Once teams register, their strict-scored
          standings will appear here.
        </p>
      </div>
    );
  }

  // Compute rank — teams with same points share a rank, but the SQL already
  // orders by latest_completion_timestamp for visual purposes. We just
  // display the row position.
  return (
    <div
      style={{
        padding: 20,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        marginTop: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#35d5df",
            letterSpacing: 1.5,
          }}
        >
          🏆 STANDINGS · STRICT SCORING
        </div>
        <div style={{ fontSize: 11, opacity: 0.55 }}>
          {standings.length} team{standings.length === 1 ? "" : "s"} ·{" "}
          {standings[0]?.total_challenges_count ?? 0} challenge
          {(standings[0]?.total_challenges_count ?? 0) === 1 ? "" : "s"}
        </div>
      </div>

      <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 16px 0", lineHeight: 1.5 }}>
        Teams earn points only when every player on the roster completes a
        challenge. Anything less = 0 for that challenge.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {standings.map((row, i) => {
          const rank = i + 1;
          const isLeader = rank === 1 && row.total_points_earned > 0;
          const pctComplete =
            row.total_challenges_count > 0
              ? Math.round(
                  (row.completed_challenges_count /
                    row.total_challenges_count) *
                    100
                )
              : 0;

          return (
            <div
              key={row.team_id}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr auto",
                gap: 12,
                alignItems: "center",
                padding: 14,
                background: isLeader
                  ? "rgba(255, 208, 0, 0.05)"
                  : "rgba(255,255,255,0.02)",
                border: `1px solid ${
                  isLeader
                    ? "rgba(255, 208, 0, 0.3)"
                    : "rgba(255,255,255,0.08)"
                }`,
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  background: isLeader
                    ? "rgba(255, 208, 0, 0.2)"
                    : "rgba(255,255,255,0.05)",
                  color: isLeader ? "#ffd000" : "rgba(255,255,255,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 15,
                  fontFamily: "Sora, system-ui, sans-serif",
                }}
              >
                {rank}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{row.team_name}</span>
                  {row.is_host_team && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#35d5df",
                        background: "rgba(53, 213, 223, 0.12)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        letterSpacing: 0.5,
                      }}
                    >
                      HOST
                    </span>
                  )}
                  {row.is_complete_100pct && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#6EE7B7",
                        background: "rgba(110, 231, 183, 0.12)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        letterSpacing: 0.5,
                      }}
                    >
                      100%
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.55,
                    marginTop: 2,
                  }}
                >
                  {row.org_name && <>{row.org_name} · </>}
                  {row.completed_challenges_count}/
                  {row.total_challenges_count} challenges complete (
                  {pctComplete}%) · {row.roster_size} player
                  {row.roster_size === 1 ? "" : "s"}
                  {row.is_complete_100pct && row.latest_completion_timestamp && (
                    <> · 100% at {formatTimestamp(row.latest_completion_timestamp)}</>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  style={{
                    fontFamily: "Sora, system-ui, sans-serif",
                    fontSize: 24,
                    fontWeight: 800,
                    color: isLeader ? "#ffd000" : "#f7fbfb",
                  }}
                >
                  {row.total_points_earned}
                </div>
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: -2 }}>
                  / {row.total_possible_points} pts
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

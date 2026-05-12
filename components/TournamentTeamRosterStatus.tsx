// =============================================================================
// components/TournamentTeamRosterStatus.tsx — Per-challenge roster (L34)
// =============================================================================
// Server component. Shows, per challenge, which players on a given team have
// completed and which haven't. This is what the v5 spec describes as the
// "live roster visibility" feature — the kid who hasn't done push-ups knows
// their team is waiting on them.
//
// Strict scoring context: a single pending player is enough to zero the
// team out for that challenge. The UI surfaces this with a clear
// "Pending: N · Approved: M of K" line per challenge, and a "✓ All
// complete — earned X pts" or "⏳ X to go" status.
//
// Includes the tiebreaker challenge separately at the bottom (visually
// distinct since it only activates conditionally).
// =============================================================================

import { createClient } from "@/lib/supabase-server";

interface Props {
  tournamentEventId: string;
  teamId: string;
  teamName: string;
}

interface StatusRow {
  event_challenge_id: string;
  challenge_name: string;
  target_value: number | null;
  target_unit: string | null;
  points_value: number | null;
  is_tiebreaker: boolean;
  day_index: number | null;
  player_id: string;
  player_first_name: string;
  player_last_name: string | null;
  submission_status:
    | "not_submitted"
    | "pending"
    | "approved"
    | "rejected"
    | string;
  submission_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

interface ChallengeGroup {
  event_challenge_id: string;
  challenge_name: string;
  target_value: number | null;
  target_unit: string | null;
  points_value: number | null;
  is_tiebreaker: boolean;
  day_index: number | null;
  players: StatusRow[];
}

function statusToBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "approved":
      return { label: "✓ Approved", color: "#6EE7B7", bg: "rgba(110, 231, 183, 0.1)" };
    case "pending":
      return { label: "⏳ Pending review", color: "#ffd000", bg: "rgba(255, 208, 0, 0.1)" };
    case "rejected":
      return { label: "✗ Rejected", color: "#ff755f", bg: "rgba(255, 117, 95, 0.1)" };
    case "not_submitted":
    default:
      return {
        label: "○ Not submitted",
        color: "rgba(255,255,255,0.5)",
        bg: "rgba(255,255,255,0.03)",
      };
  }
}

function playerDisplayName(row: StatusRow): string {
  const last = row.player_last_name?.trim();
  if (last) return `${row.player_first_name} ${last.charAt(0)}.`;
  return row.player_first_name;
}

export default async function TournamentTeamRosterStatus({
  tournamentEventId,
  teamId,
  teamName,
}: Props) {
  const supabase = await createClient();

  const { data: rows, error } = await supabase.rpc(
    "get_tournament_team_roster_status",
    {
      p_tournament_event_id: tournamentEventId,
      p_team_id: teamId,
    }
  );

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
          Couldn&apos;t load roster status: {error.message}
        </div>
      </div>
    );
  }

  const allRows = (rows as StatusRow[]) || [];

  if (allRows.length === 0) {
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
          🎯 ROSTER STATUS · {teamName.toUpperCase()}
        </div>
        <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
          No challenges or no players yet. Once the host adds challenges and
          your team has players on the roster, status will show here.
        </p>
      </div>
    );
  }

  // Group rows by challenge
  const byChallenge = new Map<string, ChallengeGroup>();
  for (const r of allRows) {
    let group = byChallenge.get(r.event_challenge_id);
    if (!group) {
      group = {
        event_challenge_id: r.event_challenge_id,
        challenge_name: r.challenge_name,
        target_value: r.target_value,
        target_unit: r.target_unit,
        points_value: r.points_value,
        is_tiebreaker: r.is_tiebreaker,
        day_index: r.day_index,
        players: [],
      };
      byChallenge.set(r.event_challenge_id, group);
    }
    group.players.push(r);
  }

  const groups = Array.from(byChallenge.values());
  const regularChallenges = groups.filter((g) => !g.is_tiebreaker);
  const tiebreakerChallenge = groups.find((g) => g.is_tiebreaker) || null;

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
          marginBottom: 4,
        }}
      >
        🎯 ROSTER STATUS · {teamName.toUpperCase()}
      </div>
      <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 16px 0", lineHeight: 1.5 }}>
        Strict scoring: your team earns the points for each challenge only
        when every player has an approved submission.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {regularChallenges.map((group) =>
          renderChallengeGroup(group, false)
        )}
      </div>

      {tiebreakerChallenge && (
        <>
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px dashed rgba(255, 117, 95, 0.3)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#ff755f",
                letterSpacing: 1.5,
                marginBottom: 6,
              }}
            >
              ⚡ SUDDEN-DEATH TIEBREAKER (hidden unless activated)
            </div>
            <p
              style={{
                fontSize: 11,
                opacity: 0.55,
                margin: "0 0 12px 0",
                lineHeight: 1.5,
              }}
            >
              The pre-declared tiebreaker only activates if there&apos;s a tie
              for a prize position at the end. Submissions here don&apos;t
              count toward regular standings.
            </p>
            {renderChallengeGroup(tiebreakerChallenge, true)}
          </div>
        </>
      )}
    </div>
  );
}

function renderChallengeGroup(group: ChallengeGroup, isTiebreaker: boolean) {
  const total = group.players.length;
  const approvedCount = group.players.filter(
    (p) => p.submission_status === "approved"
  ).length;
  const pendingCount = group.players.filter(
    (p) => p.submission_status === "pending"
  ).length;
  const allComplete = approvedCount === total && total > 0;

  return (
    <div
      key={group.event_challenge_id}
      style={{
        padding: 14,
        background: allComplete && !isTiebreaker
          ? "rgba(110, 231, 183, 0.05)"
          : isTiebreaker
            ? "rgba(255, 117, 95, 0.04)"
            : "rgba(255,255,255,0.03)",
        border: `1px solid ${
          allComplete && !isTiebreaker
            ? "rgba(110, 231, 183, 0.25)"
            : isTiebreaker
              ? "rgba(255, 117, 95, 0.25)"
              : "rgba(255,255,255,0.08)"
        }`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {group.challenge_name}
          </div>
          {group.target_value && group.target_unit && (
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
              Target: {group.target_value} {group.target_unit}
              {group.points_value ? ` · ${group.points_value} pts` : ""}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontFamily: "Sora, system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 18,
              color: allComplete
                ? "#6EE7B7"
                : pendingCount > 0
                  ? "#ffd000"
                  : "rgba(255,255,255,0.85)",
            }}
          >
            {approvedCount} / {total}
          </div>
          <div style={{ fontSize: 10, opacity: 0.55 }}>
            {allComplete
              ? !isTiebreaker
                ? `Earned ${group.points_value ?? 0} pts`
                : "All complete"
              : `${total - approvedCount} to go`}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        {group.players.map((p) => {
          const badge = statusToBadge(p.submission_status);
          return (
            <div
              key={`${p.event_challenge_id}-${p.player_id}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 10px",
                background: badge.bg,
                border: `1px solid ${badge.color}33`,
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>{playerDisplayName(p)}</div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: badge.color,
                  flexShrink: 0,
                }}
              >
                {badge.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

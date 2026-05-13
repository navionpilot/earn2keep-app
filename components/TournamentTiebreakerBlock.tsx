"use client";

// =============================================================================
// components/TournamentTiebreakerBlock.tsx — Sudden-death state UI (L35)
// =============================================================================
// Renders different content based on tiebreaker state:
//   - "not_evaluated" / "not_needed" → returns null (nothing to show)
//   - "active" → countdown to deadline, list of tied teams, submit CTA
//   - "resolved" → winner announcement (automated, earliest 100%)
//   - "host_decision_needed" → if host: picker UI; if not: "waiting for host"
//   - "host_decided" → winner announcement (host-picked)
//
// Client component because:
//   - The active state needs a live countdown
//   - The host_decision_needed state needs interactive winner picker
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

interface TiedTeam {
  team_id: string;
  team_name: string;
  org_name: string | null;
}

interface Props {
  state: string;
  activatedAt: string | null;
  deadlineAt: string | null;
  winnerTeamId: string | null;
  tiedTeamIds: string[];
  tiedTeams: TiedTeam[];
  tiebreakerChallengeId: string | null;
  tiebreakerChallengeName: string | null;
  tiebreakerChallengeTargetValue: number | null;
  tiebreakerChallengeTargetUnit: string | null;
  isCurrentUserHost: boolean;
  isCurrentUserOnTiedTeam: boolean;
  eventId: string;
}

function formatCountdown(deadlineISO: string, now: Date): {
  text: string;
  expired: boolean;
} {
  const deadline = new Date(deadlineISO);
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { text: "Deadline reached", expired: true };
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) {
    return { text: `${days}d ${hours}h ${minutes}m`, expired: false };
  }
  if (hours > 0) {
    return { text: `${hours}h ${minutes}m ${seconds}s`, expired: false };
  }
  return { text: `${minutes}m ${seconds}s`, expired: false };
}

export default function TournamentTiebreakerBlock(props: Props) {
  const {
    state,
    deadlineAt,
    winnerTeamId,
    tiedTeams,
    tiebreakerChallengeId,
    tiebreakerChallengeName,
    tiebreakerChallengeTargetValue,
    tiebreakerChallengeTargetUnit,
    isCurrentUserHost,
    isCurrentUserOnTiedTeam,
    eventId,
  } = props;

  const [now, setNow] = useState<Date>(new Date());
  const [picking, setPicking] = useState<boolean>(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickSelectionId, setPickSelectionId] = useState<string>("");

  // Live countdown — tick every second when active
  useEffect(() => {
    if (state !== "active") return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [state]);

  if (state === "not_evaluated" || state === "not_needed") {
    return null;
  }

  // Common: who won?
  const winner = winnerTeamId
    ? tiedTeams.find((t) => t.team_id === winnerTeamId)
    : null;

  // ---------- ACTIVE ----------
  if (state === "active" && deadlineAt) {
    const countdown = formatCountdown(deadlineAt, now);
    return (
      <div
        style={{
          padding: 20,
          marginTop: 20,
          background: "linear-gradient(135deg, rgba(255, 117, 95, 0.12), rgba(255, 208, 0, 0.08))",
          border: "1px solid rgba(255, 117, 95, 0.4)",
          borderLeft: "4px solid #ff755f",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#ff755f",
                letterSpacing: 1.5,
                marginBottom: 4,
              }}
            >
              ⚡ SUDDEN-DEATH TIEBREAKER · ACTIVE
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {tiebreakerChallengeName || "Tiebreaker challenge"}
              {tiebreakerChallengeTargetValue &&
                tiebreakerChallengeTargetUnit && (
                  <span style={{ fontSize: 13, opacity: 0.7, fontWeight: 500 }}>
                    {" "}— target: {tiebreakerChallengeTargetValue}{" "}
                    {tiebreakerChallengeTargetUnit}
                  </span>
                )}
            </div>
          </div>
          <div
            style={{
              padding: "8px 14px",
              background: "rgba(255, 117, 95, 0.15)",
              border: "1px solid rgba(255, 117, 95, 0.4)",
              borderRadius: 999,
              fontFamily: "monospace",
              fontWeight: 700,
              fontSize: 16,
              color: countdown.expired ? "#ffd000" : "#ff755f",
              minWidth: 120,
              textAlign: "center",
            }}
          >
            ⏱ {countdown.text}
          </div>
        </div>

        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            margin: "0 0 12px 0",
            color: "rgba(255, 255, 255, 0.85)",
          }}
        >
          Teams tied for a prize position have until the deadline to complete
          the tiebreaker challenge. <strong>Strict scoring still applies:</strong>{" "}
          every player on the roster must finish. The team with the earliest
          100%-completion timestamp wins the tie.
        </p>

        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "rgba(255, 255, 255, 0.7)",
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          COMPETING TEAMS
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          {tiedTeams.map((t) => (
            <div
              key={t.team_id}
              style={{
                padding: "6px 12px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 6,
                fontSize: 13,
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 600 }}>{t.team_name}</span>
              {t.org_name && (
                <span style={{ opacity: 0.55, fontSize: 12 }}>{t.org_name}</span>
              )}
            </div>
          ))}
        </div>

        {/* L37 — Submit CTA for users on tied teams. Coaches and players
            both see it; clicking takes them to the record flow for the
            tiebreaker challenge. */}
        {isCurrentUserOnTiedTeam && tiebreakerChallengeId && !countdown.expired && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              background: "rgba(255, 117, 95, 0.12)",
              border: "1px solid rgba(255, 117, 95, 0.4)",
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "rgba(255, 255, 255, 0.85)",
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              Your team is in this. <strong>Every player needs to submit</strong>{" "}
              before the deadline.
            </div>
            <Link
              href={`/home/record/${tiebreakerChallengeId}`}
              style={{
                display: "inline-block",
                padding: "10px 22px",
                background: "#ff755f",
                color: "white",
                borderRadius: 999,
                fontWeight: 800,
                fontSize: 13,
                textDecoration: "none",
                letterSpacing: 0.3,
              }}
            >
              Submit your tiebreaker video →
            </Link>
          </div>
        )}

        {isCurrentUserHost && (
          <p
            style={{
              fontSize: 11,
              opacity: 0.6,
              marginTop: 12,
              marginBottom: 0,
              fontStyle: "italic",
            }}
          >
            As host: you can&apos;t end this early — it resolves automatically
            when the deadline passes or when the host_decision_needed state
            unlocks the manual override if no team hits 100%.
          </p>
        )}
      </div>
    );
  }

  // ---------- RESOLVED (automated) ----------
  if (state === "resolved" && winner) {
    return (
      <div
        style={{
          padding: 20,
          marginTop: 20,
          background: "rgba(110, 231, 183, 0.06)",
          border: "1px solid rgba(110, 231, 183, 0.35)",
          borderLeft: "4px solid #6EE7B7",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#6EE7B7",
            letterSpacing: 1.5,
            marginBottom: 8,
          }}
        >
          🏆 TIEBREAKER RESOLVED
        </div>
        <div
          style={{
            fontFamily: "Sora, system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 800,
            marginBottom: 6,
          }}
        >
          {winner.team_name} won the tiebreaker.
        </div>
        <p style={{ fontSize: 13, opacity: 0.8, margin: 0, lineHeight: 1.6 }}>
          Earliest team to hit 100% completion on the sudden-death challenge
          within the window. {winner.org_name && <>From {winner.org_name}. </>}
          Other tied teams take the lower prize position.
        </p>
      </div>
    );
  }

  // ---------- HOST DECIDED ----------
  if (state === "host_decided" && winner) {
    return (
      <div
        style={{
          padding: 20,
          marginTop: 20,
          background: "rgba(53, 213, 223, 0.06)",
          border: "1px solid rgba(53, 213, 223, 0.35)",
          borderLeft: "4px solid #35d5df",
          borderRadius: 12,
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
          🏆 TIEBREAKER RESOLVED · HOST DECISION
        </div>
        <div
          style={{
            fontFamily: "Sora, system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 800,
            marginBottom: 6,
          }}
        >
          {winner.team_name} declared winner.
        </div>
        <p style={{ fontSize: 13, opacity: 0.8, margin: 0, lineHeight: 1.6 }}>
          No team hit 100% on the tiebreaker within the window. The host
          picked the winner using their discretion. Other tied teams take the
          lower prize position.
        </p>
      </div>
    );
  }

  // ---------- HOST DECISION NEEDED ----------
  if (state === "host_decision_needed") {
    if (!isCurrentUserHost) {
      return (
        <div
          style={{
            padding: 20,
            marginTop: 20,
            background: "rgba(255, 208, 0, 0.06)",
            border: "1px solid rgba(255, 208, 0, 0.35)",
            borderLeft: "4px solid #ffd000",
            borderRadius: 12,
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
            ⏳ TIEBREAKER · AWAITING HOST DECISION
          </div>
          <p style={{ fontSize: 13, opacity: 0.85, margin: 0, lineHeight: 1.6 }}>
            The sudden-death window closed without any team hitting 100%
            completion. The host will pick the winner using their discretion
            and notify the teams. Hang tight.
          </p>
        </div>
      );
    }

    // Host picker UI
    const handlePick = async () => {
      if (!pickSelectionId) {
        setPickError("Pick one of the tied teams first.");
        return;
      }
      setPicking(true);
      setPickError(null);
      try {
        const supabase = createClient();
        const { error } = await supabase.rpc(
          "set_tournament_tiebreaker_winner",
          {
            p_event_id: eventId,
            p_winner_team_id: pickSelectionId,
          }
        );
        if (error) {
          setPickError(error.message);
        } else {
          // Refresh the page to reflect new state
          window.location.reload();
        }
      } catch (err) {
        setPickError(err instanceof Error ? err.message : String(err));
      } finally {
        setPicking(false);
      }
    };

    return (
      <div
        style={{
          padding: 20,
          marginTop: 20,
          background: "rgba(255, 208, 0, 0.06)",
          border: "1px solid rgba(255, 208, 0, 0.4)",
          borderLeft: "4px solid #ffd000",
          borderRadius: 12,
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
          ⚖️ TIEBREAKER · PICK THE WINNER
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 14px 0" }}>
          The sudden-death window closed without any team hitting 100%
          completion on the tiebreaker. Pick the winner using whatever
          criteria you want (sportsmanship, partial completion percentage, a
          coin flip, etc). The other tied teams take the lower prize position.
        </p>

        <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          {tiedTeams.map((t) => (
            <label
              key={t.team_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                background:
                  pickSelectionId === t.team_id
                    ? "rgba(255, 208, 0, 0.1)"
                    : "rgba(255, 255, 255, 0.03)",
                border: `1px solid ${
                  pickSelectionId === t.team_id
                    ? "rgba(255, 208, 0, 0.4)"
                    : "rgba(255, 255, 255, 0.1)"
                }`,
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <input
                type="radio"
                name="tiebreaker-winner"
                value={t.team_id}
                checked={pickSelectionId === t.team_id}
                onChange={() => setPickSelectionId(t.team_id)}
                disabled={picking}
              />
              <span style={{ fontWeight: 600 }}>{t.team_name}</span>
              {t.org_name && (
                <span style={{ opacity: 0.55, fontSize: 12 }}>
                  · {t.org_name}
                </span>
              )}
            </label>
          ))}
        </div>

        {pickError && (
          <div
            style={{
              padding: 10,
              background: "rgba(255, 117, 95, 0.08)",
              border: "1px solid rgba(255, 117, 95, 0.3)",
              borderRadius: 6,
              color: "#ff755f",
              fontSize: 12,
              marginBottom: 10,
            }}
          >
            {pickError}
          </div>
        )}

        <button
          type="button"
          onClick={handlePick}
          disabled={picking || !pickSelectionId}
          style={{
            padding: "10px 20px",
            background: picking ? "rgba(255, 208, 0, 0.4)" : "#ffd000",
            color: "#1a1a1a",
            border: "none",
            borderRadius: 999,
            fontWeight: 800,
            fontSize: 13,
            cursor: picking ? "wait" : "pointer",
            opacity: !pickSelectionId ? 0.5 : 1,
          }}
        >
          {picking ? "Saving..." : "Declare winner →"}
        </button>
      </div>
    );
  }

  return null;
}

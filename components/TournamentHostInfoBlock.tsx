"use client";

// =============================================================================
// components/TournamentHostInfoBlock.tsx — Tournament join code + status
// =============================================================================
// Shown on the event detail page when event_type === "tournament". Surfaces
// the join code prominently so the host can share it, plus a quick snapshot
// of how many teams have joined and the Entry Fee they're paying.
//
// Client component because we have a copy-to-clipboard button and we want
// it to give immediate feedback ("Copied!"). Everything else is just
// rendering props passed down from the server component.
// =============================================================================

import { useState } from "react";
import { formatJoinCodeForDisplay } from "@/lib/tournamentJoinCode";

interface Props {
  joinCode: string;
  entryFeeCents: number;
  joinedTeamsCount: number;
  maxTeams: number | null;
  requiresApproval: boolean;
}

function formatMoney(cents: number): string {
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  })}`;
}

export default function TournamentHostInfoBlock({
  joinCode,
  entryFeeCents,
  joinedTeamsCount,
  maxTeams,
  requiresApproval,
}: Props) {
  const [copied, setCopied] = useState(false);
  const displayCode = formatJoinCodeForDisplay(joinCode);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers / permissions issues — silently no-op.
    }
  };

  return (
    <div
      style={{
        padding: 20,
        marginTop: 20,
        marginBottom: 20,
        background:
          "linear-gradient(135deg, rgba(53, 213, 223, 0.08), rgba(255, 117, 95, 0.06))",
        border: "1px solid rgba(53, 213, 223, 0.3)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          color: "var(--e2k-cyan)",
          marginBottom: 8,
        }}
      >
        ★ TOURNAMENT JOIN CODE ★
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: 4,
            color: "var(--e2k-cyan)",
            background: "rgba(0, 0, 0, 0.25)",
            padding: "10px 18px",
            borderRadius: 8,
          }}
        >
          {displayCode}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: "10px 18px",
            background: copied
              ? "rgba(93, 202, 165, 0.2)"
              : "rgba(255, 255, 255, 0.08)",
            border: `1px solid ${
              copied ? "rgba(93, 202, 165, 0.5)" : "rgba(255, 255, 255, 0.2)"
            }`,
            borderRadius: 8,
            color: copied ? "#6EE7B7" : "white",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {copied ? "✓ Copied!" : "📋 Copy code"}
        </button>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "rgba(255, 255, 255, 0.7)",
          margin: "12px 0 0 0",
        }}
      >
        Share this code with team organizers you&apos;re inviting. They go to{" "}
        <strong>/join-tournament</strong> on earn²keep and enter the code to
        register their team.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              opacity: 0.6,
              marginBottom: 4,
            }}
          >
            ENTRY FEE / TEAM
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {formatMoney(entryFeeCents)}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              opacity: 0.6,
              marginBottom: 4,
            }}
          >
            TEAMS JOINED
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {joinedTeamsCount}
            {maxTeams ? (
              <span style={{ fontSize: 14, opacity: 0.6, fontWeight: 500 }}>
                {" "}/ {maxTeams}
              </span>
            ) : (
              <span style={{ fontSize: 14, opacity: 0.6, fontWeight: 500 }}>
                {" "}(no cap)
              </span>
            )}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              opacity: 0.6,
              marginBottom: 4,
            }}
          >
            APPROVAL MODE
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {requiresApproval ? "Manual" : "Auto-accept"}
          </div>
        </div>
      </div>
    </div>
  );
}

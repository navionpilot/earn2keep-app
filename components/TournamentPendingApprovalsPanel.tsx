"use client";

// =============================================================================
// components/TournamentPendingApprovalsPanel.tsx — Host approve/decline (L36)
// =============================================================================
// Only renders when the tournament has approval mode ON
// (events.tournament_requires_approval=true) AND there are teams in
// tournament_teams.status='pending_approval'.
//
// Provides approve and decline buttons per pending team. Decline doesn't
// auto-refund in this slice — Stripe is still stubbed. When real Stripe
// lands, this is where the refund call goes.
// =============================================================================

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface PendingTeam {
  id: string;                 // tournament_teams row id
  team_id: string;
  team_name: string;
  org_name: string | null;
  player_count: number;
  joined_at: string;
}

interface Props {
  tournamentId: string;
  pendingTeams: PendingTeam[];
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TournamentPendingApprovalsPanel({
  tournamentId,
  pendingTeams,
}: Props) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const handleDecision = async (
    rowId: string,
    decision: "active" | "cancelled"
  ) => {
    setProcessingId(rowId);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from("tournament_teams")
        .update({ status: decision })
        .eq("id", rowId)
        .eq("tournament_event_id", tournamentId);
      if (updErr) {
        setError(updErr.message);
        setProcessingId(null);
        return;
      }
      setCompletedIds((s) => new Set([...s, rowId]));
      // Refresh after a short delay so the user sees the result, then the
      // server-rendered page state reflects the change.
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProcessingId(null);
    }
  };

  // Filter out teams that have already been processed in this session
  const remaining = pendingTeams.filter((t) => !completedIds.has(t.id));

  if (remaining.length === 0 && pendingTeams.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        padding: 20,
        marginTop: 20,
        background: "rgba(255, 208, 0, 0.04)",
        border: "1px solid rgba(255, 208, 0, 0.3)",
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
          marginBottom: 6,
        }}
      >
        ⏳ PENDING APPROVALS · {remaining.length}{" "}
        {remaining.length === 1 ? "team" : "teams"} waiting
      </div>
      <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 16px 0", lineHeight: 1.5 }}>
        These teams paid the Entry Fee and are waiting for your approval. Approve
        them to register their team, or decline if you don&apos;t want them in the
        tournament.
      </p>

      {error && (
        <div
          style={{
            padding: 10,
            background: "rgba(255, 117, 95, 0.1)",
            border: "1px solid rgba(255, 117, 95, 0.35)",
            borderRadius: 6,
            color: "#ff755f",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {remaining.map((team) => {
          const isProcessing = processingId === team.id;
          return (
            <div
              key={team.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
                padding: 14,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {team.team_name}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                  {team.org_name && <>{team.org_name} · </>}
                  {team.player_count} player
                  {team.player_count === 1 ? "" : "s"} · joined{" "}
                  {formatRelativeTime(team.joined_at)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => handleDecision(team.id, "active")}
                  disabled={isProcessing}
                  style={{
                    padding: "8px 14px",
                    background: "rgba(110, 231, 183, 0.15)",
                    color: "#6EE7B7",
                    border: "1px solid rgba(110, 231, 183, 0.4)",
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: isProcessing ? "wait" : "pointer",
                    opacity: isProcessing ? 0.5 : 1,
                  }}
                >
                  {isProcessing ? "..." : "✓ Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(team.id, "cancelled")}
                  disabled={isProcessing}
                  style={{
                    padding: "8px 14px",
                    background: "transparent",
                    color: "rgba(255, 117, 95, 0.85)",
                    border: "1px solid rgba(255, 117, 95, 0.4)",
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: isProcessing ? "wait" : "pointer",
                    opacity: isProcessing ? 0.5 : 1,
                  }}
                >
                  ✗ Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, opacity: 0.5, marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
        <em>Note: declined teams keep their record as cancelled. Refunds will be processed
        automatically when real payments are enabled (Phase 10). For now, coordinate any
        refunds with declined teams off-platform.</em>
      </p>
    </div>
  );
}

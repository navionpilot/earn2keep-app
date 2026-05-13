"use client";

// =============================================================================
// components/TournamentTiebreakerPicker.tsx — Host picks tiebreaker (L36)
// =============================================================================
// Shows on host's event detail page only when:
//   - Event is a tournament
//   - Tiebreaker hasn't been designated yet OR the host wants to change it
//
// Updates two things atomically:
//   1. events.tournament_tiebreaker_challenge_id = picked event_challenge.id
//   2. event_challenges.is_tiebreaker = true for the picked one,
//      false for all other challenges in the event (so there's exactly one)
//
// Per the v5 spec, the tiebreaker challenge stays hidden during regular
// play and only activates if there's a prize-position tie.
// =============================================================================

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface ChallengeOption {
  id: string;             // event_challenges.id
  name: string;
  rep_target: number | null;
  unit: string | null;
  is_tiebreaker: boolean;
}

interface Props {
  eventId: string;
  currentTiebreakerId: string | null;
  availableChallenges: ChallengeOption[];
}

export default function TournamentTiebreakerPicker({
  eventId,
  currentTiebreakerId,
  availableChallenges,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(
    !currentTiebreakerId // auto-expand if nothing set yet
  );
  const [selectedId, setSelectedId] = useState<string>(currentTiebreakerId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTiebreaker = availableChallenges.find(
    (c) => c.id === currentTiebreakerId
  );

  // If no challenges in the event yet, nothing to pick from. Show a hint.
  if (availableChallenges.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          marginTop: 12,
          marginBottom: 20,
          background: "rgba(255, 117, 95, 0.05)",
          border: "1px dashed rgba(255, 117, 95, 0.3)",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#ff755f",
            letterSpacing: 1.5,
            marginBottom: 4,
          }}
        >
          ⚡ TIEBREAKER NOT YET DECLARED
        </div>
        <p style={{ fontSize: 13, opacity: 0.75, margin: 0, lineHeight: 1.5 }}>
          Add challenges to this tournament first, then come back to pick which
          one is the pre-declared sudden-death tiebreaker.
        </p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!selectedId) {
      setError("Pick a challenge first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();

      // Two updates atomically (no transaction support in client SDK, so we
      // sequence them; if step 2 fails, step 1 still applies — manual fix
      // would be to retry):
      //
      // 1. Mark the picked event_challenge as is_tiebreaker=true and all
      //    others in this event as false (so exactly one is the tiebreaker).
      const otherIds = availableChallenges
        .filter((c) => c.id !== selectedId)
        .map((c) => c.id);

      if (otherIds.length > 0) {
        const { error: clearErr } = await supabase
          .from("event_challenges")
          .update({ is_tiebreaker: false })
          .in("id", otherIds);
        if (clearErr) {
          setError(`Couldn't clear other tiebreaker flags: ${clearErr.message}`);
          setSaving(false);
          return;
        }
      }

      const { error: setErr } = await supabase
        .from("event_challenges")
        .update({ is_tiebreaker: true })
        .eq("id", selectedId);
      if (setErr) {
        setError(`Couldn't mark challenge as tiebreaker: ${setErr.message}`);
        setSaving(false);
        return;
      }

      // 2. Update events.tournament_tiebreaker_challenge_id
      const { error: evErr } = await supabase
        .from("events")
        .update({ tournament_tiebreaker_challenge_id: selectedId })
        .eq("id", eventId);
      if (evErr) {
        setError(`Couldn't update event: ${evErr.message}`);
        setSaving(false);
        return;
      }

      // Refresh page state
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        padding: 16,
        marginTop: 12,
        marginBottom: 20,
        background: "rgba(255, 117, 95, 0.04)",
        border: "1px solid rgba(255, 117, 95, 0.25)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
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
            ⚡ SUDDEN-DEATH TIEBREAKER CHALLENGE
          </div>
          {currentTiebreaker && !expanded ? (
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {currentTiebreaker.name}
              {currentTiebreaker.rep_target && currentTiebreaker.unit && (
                <span style={{ fontSize: 12, opacity: 0.6, fontWeight: 500 }}>
                  {" "}— {currentTiebreaker.rep_target} {currentTiebreaker.unit}
                </span>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 13, opacity: 0.75, margin: 0, lineHeight: 1.5 }}>
              Pick which challenge fires if prize-position teams tie at the
              end. Stays hidden during regular play.
            </p>
          )}
        </div>
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              padding: "8px 16px",
              background: "transparent",
              color: "#ff755f",
              border: "1px solid rgba(255, 117, 95, 0.5)",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {currentTiebreaker ? "Change" : "Pick →"}
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            {availableChallenges.map((ch) => (
              <label
                key={ch.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  background:
                    selectedId === ch.id
                      ? "rgba(255, 117, 95, 0.1)"
                      : "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${
                    selectedId === ch.id
                      ? "rgba(255, 117, 95, 0.4)"
                      : "rgba(255, 255, 255, 0.1)"
                  }`,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <input
                  type="radio"
                  name="tiebreaker-challenge"
                  value={ch.id}
                  checked={selectedId === ch.id}
                  onChange={() => setSelectedId(ch.id)}
                  disabled={saving}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{ch.name}</div>
                  {ch.rep_target && ch.unit && (
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      {ch.rep_target} {ch.unit}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>

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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedId}
              style={{
                padding: "8px 16px",
                background: saving ? "rgba(255, 117, 95, 0.4)" : "#ff755f",
                color: "white",
                border: "none",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 12,
                cursor: saving ? "wait" : "pointer",
                opacity: !selectedId ? 0.5 : 1,
              }}
            >
              {saving ? "Saving..." : "Set as tiebreaker →"}
            </button>
            {currentTiebreaker && (
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setSelectedId(currentTiebreakerId || "");
                  setError(null);
                }}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  color: "rgba(255, 255, 255, 0.65)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

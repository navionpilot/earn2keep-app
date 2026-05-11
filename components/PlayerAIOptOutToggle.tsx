"use client";

// =============================================================================
// components/PlayerAIOptOutToggle.tsx (Slice 8.4)
// =============================================================================
// Client component embedded in the Player profile page. Parent-controlled
// opt-out for AI verification on this specific player's submissions.
//
// When the toggle is ON (opted out): no frames are sent to Anthropic for
// this player. AI verification is skipped entirely. Coach review proceeds
// manually as it did before AI verification existed.
//
// Stored in players.ai_verification_opt_out (BOOLEAN, default false).
// =============================================================================

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface Props {
  playerId: string;
  initialOptedOut: boolean;
}

export default function PlayerAIOptOutToggle({
  playerId,
  initialOptedOut,
}: Props) {
  const [optedOut, setOptedOut] = useState(initialOptedOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const newValue = !optedOut;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("players")
      .update({ ai_verification_opt_out: newValue })
      .eq("id", playerId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOptedOut(newValue);
  };

  return (
    <div className="e2k-settings-toggle-row">
      <div className="e2k-settings-toggle-info">
        <div className="e2k-settings-toggle-title">
          AI verification opt-out
          <span className={`e2k-toggle-status ${optedOut ? "on" : "off"}`}>
            {optedOut ? "OPTED OUT" : "PARTICIPATING"}
          </span>
        </div>
        <div className="e2k-settings-toggle-desc">
          By default, earn²keep extracts a small number of frames from this
          player&apos;s challenge videos and sends them to Anthropic&apos;s Claude
          AI service for automated rep counting. Anthropic does not train on
          this data or retain it. If you prefer to opt out, flip this on —
          submissions will go to manual coach review only, with no AI involvement.
        </div>
        {error && (
          <div className="e2k-settings-toggle-error">Couldn&apos;t save: {error}</div>
        )}
      </div>
      <button
        type="button"
        className={`e2k-toggle-switch ${optedOut ? "on" : "off"}`}
        onClick={handleToggle}
        disabled={busy}
        aria-pressed={optedOut}
        aria-label="Toggle AI verification opt-out"
      >
        <span className="e2k-toggle-thumb" />
      </button>
    </div>
  );
}

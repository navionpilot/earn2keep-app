"use client";

// =============================================================================
// components/CoachAIAutoApproveToggle.tsx (Slice 8.4)
// =============================================================================
// Client component embedded in the Settings page. Lets a coach (or any
// organizer who owns players) opt in to AI auto-approval of submissions.
// When enabled, the AI verification route auto-approves submissions where
// AI confidence is 'high' and AI count >= player's claim.
//
// Stored in profiles.ai_auto_approve_enabled (BOOLEAN, default false).
// =============================================================================

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface Props {
  userId: string;
  initialEnabled: boolean;
}

export default function CoachAIAutoApproveToggle({
  userId,
  initialEnabled,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const newValue = !enabled;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ ai_auto_approve_enabled: newValue })
      .eq("id", userId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEnabled(newValue);
  };

  return (
    <div className="e2k-settings-toggle-row">
      <div className="e2k-settings-toggle-info">
        <div className="e2k-settings-toggle-title">
          AI auto-approval
          <span className={`e2k-toggle-status ${enabled ? "on" : "off"}`}>
            {enabled ? "ON" : "OFF"}
          </span>
        </div>
        <div className="e2k-settings-toggle-desc">
          When enabled, AI auto-approves submissions where verification confidence
          is <strong>high</strong> and the AI&apos;s count is at least as many reps
          as the player claimed. Submissions that don&apos;t meet both criteria
          still come to you for review. Default is OFF — flip on once you trust
          the AI on your challenges.
        </div>
        {error && (
          <div className="e2k-settings-toggle-error">Couldn&apos;t save: {error}</div>
        )}
      </div>
      <button
        type="button"
        className={`e2k-toggle-switch ${enabled ? "on" : "off"}`}
        onClick={handleToggle}
        disabled={busy}
        aria-pressed={enabled}
        aria-label="Toggle AI auto-approval"
      >
        <span className="e2k-toggle-thumb" />
      </button>
    </div>
  );
}

"use client";

// =============================================================================
// components/AcceptCoachInvitationButton.tsx — Client accept button (L39)
// =============================================================================
// Calls the UPDATE on org_coach_invitations to flip status to 'accepted',
// then redirects to the org page.
// =============================================================================

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface Props {
  inviteToken: string;
  orgId: string;
}

export default function AcceptCoachInvitationButton({ inviteToken, orgId }: Props) {
  const [accepting, setAccepting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not signed in.");
        setAccepting(false);
        return;
      }

      const { error: updErr } = await supabase
        .from("org_coach_invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
          accepted_by_user_id: user.id,
        })
        .eq("token", inviteToken)
        .eq("status", "pending");

      if (updErr) {
        setError(updErr.message);
        setAccepting(false);
        return;
      }

      // Redirect to the org page
      window.location.href = `/organizations/${orgId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAccepting(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleAccept}
        disabled={accepting}
        style={{
          display: "block",
          width: "100%",
          padding: "14px 24px",
          background: accepting ? "rgba(255, 117, 95, 0.4)" : "#ff755f",
          color: "white",
          border: "none",
          borderRadius: 999,
          fontWeight: 800,
          fontSize: 15,
          cursor: accepting ? "wait" : "pointer",
          letterSpacing: 0.3,
        }}
      >
        {accepting ? "Accepting..." : "✓ Accept invitation"}
      </button>
      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: "rgba(255, 117, 95, 0.08)",
            border: "1px solid rgba(255, 117, 95, 0.3)",
            borderRadius: 6,
            color: "#ff755f",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

"use client";

// =============================================================================
// components/CoachesPanel.tsx — Coaches list + invite flow (L39)
// =============================================================================
// Renders the Coaches section of the org Account page.
//
// Three sub-blocks:
//   1. ACTIVE COACHES — distinct users who own ≥1 team in the org, plus
//      the org owner. Shows name, role, # teams managed, list of team names.
//      The org owner is marked with an "Owner" chip.
//   2. PENDING INVITATIONS — coaches who've been invited but haven't
//      signed up yet. Shows email, when invited, with a "Revoke" button.
//   3. INVITE A NEW COACH — email + optional name form, POST to
//      /api/coach-invitations/send.
// =============================================================================

import { useState } from "react";

const ROLE_LABELS: Record<string, string> = {
  coach: "Coach",
  parent: "Parent",
  teacher: "Teacher / School Admin",
  youth_pastor: "Youth Pastor / Church Leader",
  scout_leader: "Scout / Troop Leader",
  gym_owner: "Gym Owner / Fitness Coach",
  org_director: "Organization Director",
  other: "Other",
};

interface Coach {
  user_id: string;
  name: string;
  role: string | null;
  is_org_owner: boolean;
  teams_count: number;
  team_names: string[];
}

interface PendingInvite {
  id: string;
  email: string;
  recipient_name: string | null;
  invited_at: string;
  status: string;
  token: string;
}

interface Props {
  orgId: string;
  orgName: string;
  coaches: Coach[];
  pendingInvites: PendingInvite[];
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
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function CoachesPanel({ orgId, orgName, coaches, pendingInvites }: Props) {
  const [showInviteForm, setShowInviteForm] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteName, setInviteName] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      setError("Email is required.");
      return;
    }
    setSending(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/coach-invitations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          email: inviteEmail.trim(),
          recipientName: inviteName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send invitation.");
        setSending(false);
        return;
      }
      setSuccessMsg(`Invitation sent to ${inviteEmail.trim()}.`);
      setInviteEmail("");
      setInviteName("");
      setShowInviteForm(false);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSending(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (!window.confirm("Revoke this invitation? The recipient won't be able to accept it anymore.")) {
      return;
    }
    setRevokingId(inviteId);
    try {
      const res = await fetch("/api/coach-invitations/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId, orgId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to revoke invitation.");
        setRevokingId(null);
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRevokingId(null);
    }
  };

  return (
    <section className="e2k-panel" style={{ marginBottom: 16 }}>
      <div className="e2k-panel-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="e2k-panel-title">Coaches</h2>
          <p className="e2k-panel-sub">
            {coaches.length} active{coaches.length === 1 ? " coach" : " coaches"}
            {pendingInvites.length > 0 && (
              <> · {pendingInvites.length} pending invitation{pendingInvites.length === 1 ? "" : "s"}</>
            )}
          </p>
        </div>
        {!showInviteForm && (
          <button
            type="button"
            onClick={() => setShowInviteForm(true)}
            style={{
              padding: "8px 16px",
              background: "#ff755f",
              color: "white",
              border: "none",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            + Invite a coach
          </button>
        )}
      </div>

      {/* Active coaches list */}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {coaches.map((c) => (
          <div
            key={c.user_id}
            style={{
              padding: 12,
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 8,
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                {c.is_org_owner && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: "#ffd000",
                      background: "rgba(255, 208, 0, 0.15)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      letterSpacing: 0.5,
                    }}
                  >
                    OWNER
                  </span>
                )}
                {c.role && (
                  <span style={{ fontSize: 11, opacity: 0.6 }}>
                    · {ROLE_LABELS[c.role] || c.role.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                {c.teams_count === 0
                  ? "Not yet managing any teams"
                  : `${c.teams_count} team${c.teams_count === 1 ? "" : "s"}: ${c.team_names.join(", ")}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#9fc3c7",
              letterSpacing: 1.2,
              marginBottom: 8,
            }}
          >
            ⏳ PENDING INVITATIONS
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                style={{
                  padding: 10,
                  background: "rgba(255, 208, 0, 0.04)",
                  border: "1px solid rgba(255, 208, 0, 0.2)",
                  borderRadius: 6,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {inv.recipient_name ? `${inv.recipient_name} · ${inv.email}` : inv.email}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                    Invited {formatRelativeTime(inv.invited_at)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(inv.id)}
                  disabled={revokingId === inv.id}
                  style={{
                    padding: "6px 12px",
                    background: "transparent",
                    color: "rgba(255, 117, 95, 0.85)",
                    border: "1px solid rgba(255, 117, 95, 0.3)",
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: revokingId === inv.id ? "wait" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  {revokingId === inv.id ? "..." : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "rgba(53, 213, 223, 0.04)",
            border: "1px solid rgba(53, 213, 223, 0.25)",
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#35d5df", letterSpacing: 1.2, marginBottom: 10 }}>
            INVITE A NEW COACH
          </div>
          <p style={{ fontSize: 12, opacity: 0.75, margin: "0 0 12px 0", lineHeight: 1.5 }}>
            They&apos;ll get an email invitation. Once they sign up and accept,
            they can create teams and assign them to{" "}
            <strong style={{ color: "#f7fbfb" }}>{orgName}</strong>.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              type="email"
              placeholder="coach@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={sending}
              style={{
                padding: 10,
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: 6,
                color: "#f7fbfb",
                fontSize: 13,
              }}
            />
            <input
              type="text"
              placeholder="Coach name (optional)"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              disabled={sending}
              style={{
                padding: 10,
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: 6,
                color: "#f7fbfb",
                fontSize: 13,
              }}
            />
            {error && (
              <div
                style={{
                  padding: 8,
                  background: "rgba(255, 117, 95, 0.08)",
                  border: "1px solid rgba(255, 117, 95, 0.3)",
                  borderRadius: 6,
                  color: "#ff755f",
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
            {successMsg && (
              <div
                style={{
                  padding: 8,
                  background: "rgba(110, 231, 183, 0.08)",
                  border: "1px solid rgba(110, 231, 183, 0.3)",
                  borderRadius: 6,
                  color: "#6EE7B7",
                  fontSize: 12,
                }}
              >
                {successMsg}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleSendInvite}
                disabled={sending || !inviteEmail.trim()}
                style={{
                  padding: "10px 20px",
                  background: sending ? "rgba(255, 117, 95, 0.4)" : "#ff755f",
                  color: "white",
                  border: "none",
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: sending ? "wait" : "pointer",
                  opacity: !inviteEmail.trim() ? 0.5 : 1,
                }}
              >
                {sending ? "Sending..." : "Send invitation →"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowInviteForm(false);
                  setInviteEmail("");
                  setInviteName("");
                  setError(null);
                }}
                disabled={sending}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  color: "rgba(255, 255, 255, 0.65)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 999,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

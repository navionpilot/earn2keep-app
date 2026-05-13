"use client";

// =============================================================================
// components/TournamentInvitationsPanel.tsx — Host UI for sending invites
// =============================================================================
// Renders below TournamentHostInfoBlock on the event detail page when the
// event is a tournament. Lets the host send the tournament invitation email
// to a batch of recipients (up to 50 per request).
//
// Two modes:
//   - Collapsed: a single "Invite teams" button
//   - Expanded: textarea for emails (one per line or comma-separated),
//     optional second textarea for matching names, "Send" button,
//     per-recipient result feedback
// =============================================================================

import { useState } from "react";

interface Props {
  tournamentId: string;
}

interface SendResult {
  email: string;
  status: "sent" | "failed";
  error?: string;
}

function parseEmailLines(raw: string): string[] {
  // Accept comma, semicolon, newline, or whitespace as separators.
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function TournamentInvitationsPanel({ tournamentId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [emailsInput, setEmailsInput] = useState("");
  const [namesInput, setNamesInput] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  const handleSend = async () => {
    setTopLevelError(null);
    setResults(null);

    const emails = parseEmailLines(emailsInput);
    if (emails.length === 0) {
      setTopLevelError("Add at least one email address.");
      return;
    }
    if (emails.length > 50) {
      setTopLevelError(
        `You entered ${emails.length} emails. Limit is 50 per send — split into smaller batches.`
      );
      return;
    }

    // Names: same line-split rule. Doesn't need to match emails count;
    // missing entries become null. If there are MORE names than emails, the
    // extras are simply ignored.
    const names = namesInput.trim() ? parseEmailLines(namesInput) : [];
    const recipientNames: (string | null)[] = emails.map(
      (_, i) => names[i] || null
    );

    setSending(true);
    try {
      const res = await fetch("/api/tournament-invitations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          emails,
          recipientNames,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setTopLevelError(body.error || "Send failed.");
        return;
      }
      setResults(body.results || []);
      // Clear the form on success so a second batch starts fresh
      const allSent = (body.results || []).every(
        (r: SendResult) => r.status === "sent"
      );
      if (allSent) {
        setEmailsInput("");
        setNamesInput("");
      }
    } catch (err) {
      setTopLevelError(
        err instanceof Error ? err.message : "Network error sending invites."
      );
    } finally {
      setSending(false);
    }
  };

  const sentCount = results ? results.filter((r) => r.status === "sent").length : 0;
  const failedCount = results
    ? results.filter((r) => r.status === "failed").length
    : 0;

  return (
    <div
      style={{
        padding: 20,
        marginTop: 12,
        marginBottom: 20,
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
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
            📧 INVITE TEAMS
          </div>
          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
            Send the tournament invitation email to other team organizers.
            They land on a public page where they can see the details first
            before deciding to join.
          </p>
        </div>
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              padding: "10px 20px",
              background: "#ff755f",
              color: "white",
              border: "none",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Compose invitations →
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 20 }}>
          <label
            htmlFor="invite-emails"
            style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, display: "block", marginBottom: 6 }}
          >
            Recipient emails (one per line, or comma-separated — up to 50)
          </label>
          <textarea
            id="invite-emails"
            className="form-input"
            rows={5}
            value={emailsInput}
            onChange={(e) => setEmailsInput(e.target.value)}
            placeholder={`coach@example.com\nanother.coach@yourleague.org\n...`}
            style={{
              width: "100%",
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.5,
              padding: 12,
              resize: "vertical",
            }}
            disabled={sending}
          />

          <label
            htmlFor="invite-names"
            style={{
              fontSize: 12,
              fontWeight: 700,
              opacity: 0.85,
              display: "block",
              marginTop: 16,
              marginBottom: 6,
            }}
          >
            Recipient first names (optional — one per line, in the same order)
          </label>
          <textarea
            id="invite-names"
            className="form-input"
            rows={3}
            value={namesInput}
            onChange={(e) => setNamesInput(e.target.value)}
            placeholder={`Mike\nJess\n...`}
            style={{
              width: "100%",
              fontSize: 13,
              lineHeight: 1.5,
              padding: 12,
              resize: "vertical",
            }}
            disabled={sending}
          />
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
            If you skip names, the email opens with &quot;Hey there,&quot; instead.
          </p>

          {topLevelError && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                background: "rgba(255, 117, 95, 0.1)",
                border: "1px solid rgba(255, 117, 95, 0.35)",
                borderRadius: 8,
                color: "#ff755f",
                fontSize: 13,
              }}
            >
              {topLevelError}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !emailsInput.trim()}
              style={{
                padding: "10px 20px",
                background: sending ? "rgba(255,117,95,0.4)" : "#ff755f",
                color: "white",
                border: "none",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 13,
                cursor: sending ? "wait" : "pointer",
                opacity: !emailsInput.trim() ? 0.5 : 1,
              }}
            >
              {sending ? "Sending…" : "Send invitations →"}
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setResults(null);
                setTopLevelError(null);
              }}
              disabled={sending}
              style={{
                padding: "10px 20px",
                background: "transparent",
                color: "rgba(255,255,255,0.65)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>

          {results && (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: failedCount > 0 ? "#ffd000" : "#6EE7B7",
                }}
              >
                {sentCount} sent
                {failedCount > 0 ? ` · ${failedCount} failed` : ""}
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {results.map((r, i) => (
                  <div
                    key={`${r.email}-${i}`}
                    style={{
                      padding: "8px 12px",
                      background:
                        r.status === "sent"
                          ? "rgba(110, 231, 183, 0.06)"
                          : "rgba(255, 117, 95, 0.06)",
                      border: `1px solid ${
                        r.status === "sent"
                          ? "rgba(110, 231, 183, 0.2)"
                          : "rgba(255, 117, 95, 0.25)"
                      }`,
                      borderRadius: 6,
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontFamily: "monospace", flex: 1, wordBreak: "break-all" }}>
                      {r.email}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: r.status === "sent" ? "#6EE7B7" : "#ff755f",
                        flexShrink: 0,
                      }}
                    >
                      {r.status === "sent"
                        ? "✓ Sent"
                        : `✗ ${r.error || "Failed"}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

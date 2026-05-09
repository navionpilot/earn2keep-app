"use client";

// =============================================================================
// components/SendInvitesModal.tsx — Player invite generation UI
// =============================================================================
// Slice 5.1 added the modal in a "generate links to copy" mode (Path A).
// Slice 5.1.1 layers an "auto-send via email" mode on top:
//
//   The configure stage now has a mode toggle near the top:
//     ◉ 📧 Send invitation emails automatically
//     ○ 🔗 Just generate links to copy/share
//   Default = send, since that's the cool path now that Resend is wired up.
//
//   The result stage shows per-row delivery status (✓ Sent / ⚠ Failed: <err>)
//   plus a top banner counting successes. Copy links remain visible
//   regardless of mode — useful when a send fails or the coach wants to share
//   another way.
// =============================================================================

import { useState, useMemo } from "react";
import { inviteUrlFromToken } from "@/lib/invites";

interface PlayerProp {
  id: string;
  first_name: string;
  last_name: string | null;
  parent_email: string | null;
  linked_user_id?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  players: PlayerProp[];
  teamName: string;
}

interface Row {
  player: PlayerProp;
  selected: boolean;
  email: string;
}

type SendMode = "send" | "links_only";

interface InviteResultItem {
  playerId: string;
  fullName: string;
  inviteUrl: string;
  email: string | null;
  error?: string;
  emailStatus?: "sent" | "failed" | "not_attempted";
  emailError?: string;
}

export default function SendInvitesModal({
  open,
  onClose,
  players,
  teamName,
}: Props) {
  // One row per player. Players already linked to an auth user are rendered
  // as "already joined" and skipped in selection logic.
  const initialRows: Row[] = useMemo(
    () =>
      players.map((p) => ({
        player: p,
        // Default-select: has email AND not yet joined.
        selected: !!p.parent_email && !p.linked_user_id,
        email: p.parent_email || "",
      })),
    [players]
  );

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [stage, setStage] = useState<"configure" | "sending" | "result">(
    "configure"
  );
  // 5.1.1: default = send. Coach can flip to links_only for the old behavior.
  const [mode, setMode] = useState<SendMode>("send");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResultItem[]>([]);
  const [resultMode, setResultMode] = useState<SendMode>("send");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  if (!open) return null;

  const selectedCount = rows.filter((r) => r.selected).length;
  const totalEligible = rows.filter((r) => !r.player.linked_user_id).length;

  const toggleRow = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.player.id === id ? { ...r, selected: !r.selected } : r
      )
    );
  };

  const setEmail = (id: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.player.id === id ? { ...r, email: value } : r))
    );
  };

  const toggleAll = () => {
    const anyUnselected = rows.some(
      (r) => !r.selected && !r.player.linked_user_id
    );
    setRows((prev) =>
      prev.map((r) =>
        r.player.linked_user_id ? r : { ...r, selected: anyUnselected }
      )
    );
  };

  // When mode=send, a row missing an email can't be processed. Don't block
  // generation — just warn so the coach knows what to expect.
  const selectedWithoutEmail = rows.filter(
    (r) => r.selected && !r.email.trim()
  ).length;

  const handleGenerate = async () => {
    setSubmitError(null);
    const selectedRows = rows.filter((r) => r.selected);
    if (selectedRows.length === 0) {
      setSubmitError("Pick at least one player.");
      return;
    }

    setStage("sending");
    try {
      const response = await fetch("/api/invites/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          items: selectedRows.map((r) => ({
            playerId: r.player.id,
            email: r.email.trim() || undefined,
          })),
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setSubmitError(json.error || "Could not generate invite links.");
        setStage("configure");
        return;
      }
      setResults(json.results || []);
      // Snapshot the mode the request was made with so the result UI doesn't
      // flicker if the coach toggles after the fact.
      setResultMode(mode);
      setStage("result");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setSubmitError(`Network error: ${message}`);
      setStage("configure");
    }
  };

  // Convert relative path (`/join/<token>`) into full URL for display + copy.
  const fullUrlFor = (relativePath: string) => {
    if (typeof window === "undefined") return relativePath;
    const match = relativePath.match(/\/join\/(.+)$/);
    if (match) return inviteUrlFromToken(match[1]);
    return `${window.location.origin}${relativePath}`;
  };

  const copyOne = async (token: string, fullUrl: string) => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1800);
    } catch {
      // Clipboard fails in non-https contexts; the input is still visible
      // for manual copy.
    }
  };

  const copyAll = async () => {
    const lines = results
      .filter((r) => !r.error)
      .map((r) => {
        const url = fullUrlFor(r.inviteUrl);
        return `${r.fullName}: ${url}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      // ignore
    }
  };

  // Result-stage counts (only relevant when resultMode === "send")
  const sentCount = results.filter((r) => r.emailStatus === "sent").length;
  const failedCount = results.filter((r) => r.emailStatus === "failed").length;
  const linkOnlyCount = results.filter((r) => !r.error).length;

  return (
    <div
      className="invites-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="invites-modal" role="dialog" aria-modal="true">
        <div className="invites-modal-header">
          <div>
            <h2 className="invites-modal-title">Send player invites</h2>
            <p className="invites-modal-sub">
              {teamName}
              {stage === "configure" && totalEligible === 0 && (
                <> — no players ready to invite yet</>
              )}
            </p>
          </div>
          <button
            type="button"
            className="invites-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ===================================================
            STAGE 1: CONFIGURE
            =================================================== */}
        {stage === "configure" && (
          <>
            <div className="invites-modal-body">
              {/* Mode toggle (Slice 5.1.1) — drives whether the API
                  fires Resend or just returns links to copy. */}
              <div className="invites-mode-toggle" role="radiogroup" aria-label="Invite delivery">
                <label
                  className={`invites-mode-option ${
                    mode === "send" ? "invites-mode-option-active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="invite-mode"
                    value="send"
                    checked={mode === "send"}
                    onChange={() => setMode("send")}
                  />
                  <div className="invites-mode-option-content">
                    <strong>📧 Send invitation emails automatically</strong>
                    <span>
                      Each picked player gets a branded earn²keep email at the
                      address shown.
                    </span>
                  </div>
                </label>
                <label
                  className={`invites-mode-option ${
                    mode === "links_only" ? "invites-mode-option-active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="invite-mode"
                    value="links_only"
                    checked={mode === "links_only"}
                    onChange={() => setMode("links_only")}
                  />
                  <div className="invites-mode-option-content">
                    <strong>🔗 Just generate links to copy/share</strong>
                    <span>
                      You'll get one URL per player to text, post, or paste
                      into your own emails.
                    </span>
                  </div>
                </label>
              </div>

              {rows.length === 0 ? (
                <div className="invites-empty">
                  No players on this team yet. Add some to the roster first.
                </div>
              ) : (
                <>
                  <div className="invites-toggle-all">
                    <label>
                      <input
                        type="checkbox"
                        checked={
                          rows
                            .filter((r) => !r.player.linked_user_id)
                            .every((r) => r.selected) && totalEligible > 0
                        }
                        onChange={toggleAll}
                        disabled={totalEligible === 0}
                      />{" "}
                      Select all eligible players ({totalEligible})
                    </label>
                    <span className="invites-selected-count">
                      {selectedCount} selected
                    </span>
                  </div>

                  <div className="invites-rows">
                    {rows.map((r) => {
                      const alreadyJoined = !!r.player.linked_user_id;
                      const fullName = `${r.player.first_name} ${
                        r.player.last_name ?? ""
                      }`.trim();
                      const missingEmailWarn =
                        mode === "send" && r.selected && !r.email.trim();
                      // Slice 5.4.1: allow re-inviting already-joined players.
                      // Useful for testing, and for real cases where a player
                      // lost their phone and needs a fresh sign-in link. The
                      // claim_player_invite RPC handles re-claim gracefully
                      // (returns already_claimed=true if same user).
                      const isResend = alreadyJoined && r.selected;
                      return (
                        <div
                          key={r.player.id}
                          className={`invites-row ${
                            alreadyJoined ? "invites-row-done" : ""
                          } ${missingEmailWarn ? "invites-row-warn" : ""} ${
                            isResend ? "invites-row-resend" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={() => toggleRow(r.player.id)}
                          />
                          <div className="invites-row-name">
                            {fullName}
                            {alreadyJoined && (
                              <span className="invites-row-pill">
                                ✓ Already joined
                              </span>
                            )}
                            {isResend && (
                              <span className="invites-row-pill invites-row-pill-resend">
                                ↻ Re-send
                              </span>
                            )}
                            {missingEmailWarn && (
                              <span className="invites-row-pill invites-row-pill-warn">
                                ⚠ No email
                              </span>
                            )}
                          </div>
                          <input
                            type="email"
                            className="form-input invites-row-email"
                            placeholder={
                              mode === "send"
                                ? "email (required to send)"
                                : "email (optional)"
                            }
                            value={r.email}
                            onChange={(e) =>
                              setEmail(r.player.id, e.target.value)
                            }
                            disabled={!r.selected}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {mode === "send" && selectedWithoutEmail > 0 && (
                    <div className="invites-warn-banner">
                      {selectedWithoutEmail} selected player
                      {selectedWithoutEmail === 1 ? "" : "s"} {selectedWithoutEmail === 1 ? "doesn't" : "don't"} have an email
                      address yet — those will get a generated link only,
                      not an automatic email. Add one above, or switch to
                      "Just generate links."
                    </div>
                  )}
                </>
              )}

              {submitError && (
                <div
                  className="alert alert-error"
                  style={{ marginTop: "12px" }}
                >
                  {submitError}
                </div>
              )}
            </div>

            <div className="invites-modal-footer">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleGenerate}
                disabled={selectedCount === 0}
              >
                {mode === "send"
                  ? `Send ${selectedCount} invite${selectedCount === 1 ? "" : "s"} →`
                  : `Generate ${selectedCount} link${selectedCount === 1 ? "" : "s"} →`}
              </button>
            </div>
          </>
        )}

        {/* ===================================================
            STAGE 2: SENDING (lightweight inline spinner)
            =================================================== */}
        {stage === "sending" && (
          <div className="invites-modal-body">
            <div className="invites-spinner-row">
              <div className="invites-spinner" />
              <span>
                {mode === "send"
                  ? "Sending invitation emails…"
                  : "Generating invite links…"}
              </span>
            </div>
          </div>
        )}

        {/* ===================================================
            STAGE 3: RESULT
            =================================================== */}
        {stage === "result" && (
          <>
            <div className="invites-modal-body">
              {resultMode === "send" ? (
                <>
                  <div className="invites-success-banner">
                    📧 Sent {sentCount} email{sentCount === 1 ? "" : "s"}.
                    {failedCount > 0 && (
                      <>
                        {" "}
                        {failedCount} failed — copy the link
                        {failedCount === 1 ? "" : "s"} below to share manually.
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="invites-success-banner">
                  ✓ Generated {linkOnlyCount} invite link
                  {linkOnlyCount === 1 ? "" : "s"}. Copy each one and share via
                  text, email, or however your players prefer.
                </div>
              )}

              <button
                type="button"
                className="btn-secondary-link invites-copy-all"
                onClick={copyAll}
              >
                {copiedAll ? "✓ Copied all" : "📋 Copy all (one per line)"}
              </button>

              <div className="invites-results">
                {results.map((r) => {
                  const fullUrl = fullUrlFor(r.inviteUrl);
                  const tokenKey = r.inviteUrl;
                  const showStatusPill = resultMode === "send" && !r.error;
                  return (
                    <div
                      key={r.playerId}
                      className={`invites-result-row ${
                        r.error ? "invites-result-row-error" : ""
                      }`}
                    >
                      <div className="invites-result-name">
                        {r.fullName}
                        {showStatusPill && r.emailStatus === "sent" && (
                          <span className="invites-status-pill invites-status-pill-sent">
                            ✓ Email sent
                          </span>
                        )}
                        {showStatusPill && r.emailStatus === "failed" && (
                          <span
                            className="invites-status-pill invites-status-pill-failed"
                            title={r.emailError || "Failed to send"}
                          >
                            ⚠ Email failed
                          </span>
                        )}
                      </div>

                      {r.error ? (
                        <div className="invites-result-error">{r.error}</div>
                      ) : (
                        <>
                          <div className="invites-result-link">
                            <input
                              type="text"
                              readOnly
                              value={fullUrl}
                              className="form-input invites-result-input"
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <button
                              type="button"
                              className="btn-copy-inline"
                              onClick={() => copyOne(tokenKey, fullUrl)}
                            >
                              {copiedToken === tokenKey ? "✓" : "Copy"}
                            </button>
                          </div>
                          {r.emailStatus === "failed" && r.emailError && (
                            <div className="invites-result-email-error">
                              {r.emailError}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="invites-modal-footer">
              <button type="button" className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

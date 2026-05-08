"use client";

// =============================================================================
// components/SendInvitesModal.tsx — Player invite generation UI (Slice 5.1)
// =============================================================================
// Two stages in this one component:
//
//   Stage 1 (CONFIGURE): coach sees a checkbox list of every active player on
//   the team. Each row has the player's name + an editable email field
//   prefilled from parent_email. Coach picks who to invite, edits emails if
//   needed, clicks "Generate invite links."
//
//   Stage 2 (RESULT): API responds with one invite URL per player. The modal
//   shows them in a table-ish layout with a Copy button per row + a "Copy all"
//   summary block. Coach can paste these into texts/emails/wherever.
//
// Slice 5.1 does NOT auto-send emails. 5.1.1 will layer Resend on top of the
// existing API route so the same "Generate" click also dispatches branded
// emails — but until then, this manual-share flow gets the player invitation
// system working end-to-end without any env-var setup.
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

interface InviteResultItem {
  playerId: string;
  fullName: string;
  inviteUrl: string;
  email: string | null;
  error?: string;
}

export default function SendInvitesModal({
  open,
  onClose,
  players,
  teamName,
}: Props) {
  // Initialize one row per player. Players already linked to an auth user
  // get rendered as "already joined" later — they shouldn't be re-invited.
  const initialRows: Row[] = useMemo(
    () =>
      players.map((p) => ({
        player: p,
        // Default selected = TRUE if the player has a parent_email on file.
        // Coaches can toggle individuals off, but the common case is "send
        // to everyone with an email already filled in."
        selected: !!p.parent_email && !p.linked_user_id,
        email: p.parent_email || "",
      })),
    [players]
  );

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [stage, setStage] = useState<"configure" | "sending" | "result">(
    "configure"
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResultItem[]>([]);
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
      setStage("result");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setSubmitError(`Network error: ${message}`);
      setStage("configure");
    }
  };

  // Convert the relative path the server returned into a full URL using
  // window.location.origin (we're in the browser by definition here).
  const fullUrlFor = (relativePath: string) => {
    if (typeof window === "undefined") return relativePath;
    // The API returns "/join/<token>" — extract the token, run it through
    // the helper so the URL construction is consistent with anywhere else
    // we render an invite URL.
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
      // Clipboard can fail in some browsers without https. The link is
      // still visible in the input field for manual copy.
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
      // Same fallback as copyOne.
    }
  };

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
              <div className="invites-modal-info">
                Pick which players to invite. Each will get a private link
                they (or their parent) can use to set up their account on
                earn²keep. You&apos;ll copy + share the links yourself —
                automatic email sending is coming in a follow-up.
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
                            .every((r) => r.selected) &&
                          totalEligible > 0
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
                      return (
                        <div
                          key={r.player.id}
                          className={`invites-row ${
                            alreadyJoined ? "invites-row-done" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={() => toggleRow(r.player.id)}
                            disabled={alreadyJoined}
                          />
                          <div className="invites-row-name">
                            {fullName}
                            {alreadyJoined && (
                              <span className="invites-row-pill">
                                ✓ Already joined
                              </span>
                            )}
                          </div>
                          <input
                            type="email"
                            className="form-input invites-row-email"
                            placeholder="email (optional)"
                            value={r.email}
                            onChange={(e) =>
                              setEmail(r.player.id, e.target.value)
                            }
                            disabled={alreadyJoined || !r.selected}
                          />
                        </div>
                      );
                    })}
                  </div>
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
              <button
                type="button"
                className="btn-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleGenerate}
                disabled={selectedCount === 0}
              >
                Generate {selectedCount} invite link
                {selectedCount === 1 ? "" : "s"} →
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
              <span>Generating invite links…</span>
            </div>
          </div>
        )}

        {/* ===================================================
            STAGE 3: RESULT
            =================================================== */}
        {stage === "result" && (
          <>
            <div className="invites-modal-body">
              <div className="invites-success-banner">
                ✓ Generated {results.filter((r) => !r.error).length} invite
                link{results.filter((r) => !r.error).length === 1 ? "" : "s"}.
                Copy each one and share via text, email, or however your
                players prefer.
              </div>

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
                  return (
                    <div
                      key={r.playerId}
                      className={`invites-result-row ${
                        r.error ? "invites-result-row-error" : ""
                      }`}
                    >
                      <div className="invites-result-name">{r.fullName}</div>
                      {r.error ? (
                        <div className="invites-result-error">{r.error}</div>
                      ) : (
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="invites-modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import {
  pointsEarnedForSubmission,
  effectivePointsValue,
  type ScoringEventChallenge,
  type SubmissionStatus,
} from "@/lib/scoring";

export type SubmissionForReview = {
  id: string;
  player_first_name: string;
  player_last_name: string | null;
  challenge_name: string;
  challenge_unit: string | null;
  rep_target: number | null;
  points_value: number | null;
  challenge_difficulty: string | null;
  reps_claimed: number | null;
  reps_approved: number | null;
  status: SubmissionStatus;
  rejection_reason: string | null;
  coach_note: string | null;
  player_note: string | null;
  video_url: string | null;
  photo_url: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  // Slice 8.2 — AI verification fields
  ai_status: "pending" | "completed" | "failed" | "skipped" | null;
  ai_rep_count: number | null;
  ai_confidence: "high" | "medium" | "low" | "unable_to_verify" | null;
  ai_reasoning: string | null;
  ai_error: string | null;
};

interface SubmissionReviewModalProps {
  submission: SubmissionForReview;
  onClose: () => void;
  onSaved: () => void; // Parent re-fetches the list
}

export default function SubmissionReviewModal({
  submission,
  onClose,
  onSaved,
}: SubmissionReviewModalProps) {
  const ec: ScoringEventChallenge = {
    rep_target: submission.rep_target,
    points_value: submission.points_value,
    challenge_difficulty: submission.challenge_difficulty,
  };
  const totalPoints = effectivePointsValue(ec);

  // Form state
  const [repsApproved, setRepsApproved] = useState<string>(
    submission.reps_approved !== null && submission.reps_approved !== undefined
      ? String(submission.reps_approved)
      : submission.reps_claimed !== null && submission.reps_claimed !== undefined
      ? String(submission.reps_claimed)
      : ""
  );
  const [coachNote, setCoachNote] = useState<string>(submission.coach_note || "");
  const [rejectionReason, setRejectionReason] = useState<string>(
    submission.rejection_reason || ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview of what the player will earn for the current form state
  const previewPoints = pointsEarnedForSubmission(
    {
      status: "approved",
      reps_claimed: submission.reps_claimed,
      reps_approved: parseInt(repsApproved, 10) || 0,
    },
    ec
  );

  // Lock body scroll while modal open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const playerName =
    `${submission.player_first_name} ${submission.player_last_name || ""}`.trim();

  const submitReview = async (newStatus: SubmissionStatus) => {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in.");

      const update: any = {
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        coach_note: coachNote.trim() || null,
      };

      if (newStatus === "approved") {
        const r = parseInt(repsApproved, 10);
        update.reps_approved = isNaN(r) ? null : Math.max(0, r);
        update.rejection_reason = null;
      } else if (newStatus === "rejected") {
        if (!rejectionReason.trim()) {
          setError("Add a quick reason — players will see this.");
          setBusy(false);
          return;
        }
        update.reps_approved = null;
        update.rejection_reason = rejectionReason.trim();
      } else {
        // Reset to pending
        update.reps_approved = null;
        update.reviewed_at = null;
        update.reviewed_by = null;
        update.rejection_reason = null;
      }

      const { error: updErr } = await supabase
        .from("submissions")
        .update(update)
        .eq("id", submission.id);
      if (updErr) throw new Error(updErr.message);

      // Slice 5.9: Fire the email notification. The DB trigger (5.9 SQL)
      // already creates the in-app notification row synchronously as
      // part of the UPDATE, so a player refreshing /home will see it
      // immediately. Email is best-effort — if the API errors, we
      // surface a non-blocking warning but the review still saves.
      if (newStatus === "approved" || newStatus === "rejected") {
        try {
          await fetch("/api/notify/submission-reviewed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submissionId: submission.id }),
          });
          // We deliberately don't surface email errors to the coach —
          // the review is saved and the in-app notification fired. If
          // email infra is misconfigured, server logs catch it.
        } catch {
          // Network glitch — same reasoning, swallow.
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save review.");
    } finally {
      setBusy(false);
    }
  };

  const ratioPct =
    submission.rep_target && submission.rep_target > 0
      ? Math.min(100, Math.round(((parseInt(repsApproved, 10) || 0) / submission.rep_target) * 100))
      : null;

  return (
    <div className="submission-modal-overlay" onClick={onClose}>
      <div className="submission-modal-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="submission-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <div className="submission-modal-eyebrow">REVIEW SUBMISSION</div>
        <h2 className="submission-modal-title">
          {playerName} — {submission.challenge_name}
        </h2>

        <div className="submission-modal-meta">
          Submitted {formatRelativeTime(submission.submitted_at)}
          {submission.rep_target !== null && (
            <>
              {" · "}
              Target: <strong>{submission.rep_target}</strong>
              {submission.challenge_unit ? ` ${submission.challenge_unit}` : ""}
            </>
          )}
          {" · "}
          <span title={`Auto-default for ${submission.challenge_difficulty || "Medium"} difficulty${submission.points_value !== null ? " — overridden" : ""}`}>
            Worth up to <strong>{totalPoints} pts</strong>
          </span>
        </div>

        {/* Player evidence */}
        {(submission.video_url || submission.photo_url || submission.player_note) ? (
          <div className="submission-evidence">
            {submission.video_url && (
              <div className="submission-evidence-block">
                <div className="submission-evidence-label">Video</div>
                <video
                  controls
                  src={submission.video_url}
                  className="submission-evidence-video"
                />
              </div>
            )}
            {submission.photo_url && (
              <div className="submission-evidence-block">
                <div className="submission-evidence-label">Photo</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={submission.photo_url}
                  alt="Player evidence"
                  className="submission-evidence-photo"
                />
              </div>
            )}
            {submission.player_note && (
              <div className="submission-evidence-block">
                <div className="submission-evidence-label">
                  Note from {submission.player_first_name}
                </div>
                <div className="submission-evidence-note">{submission.player_note}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="submission-evidence-empty">
            No video, photo, or note attached. Player upload UI ships in Phase 5.
          </div>
        )}

        <div className="submission-claim-row">
          <span className="submission-claim-label">Player claimed:</span>
          <strong>
            {submission.reps_claimed ?? 0}
            {submission.challenge_unit ? ` ${submission.challenge_unit}` : ""}
          </strong>
        </div>

        {/* Slice 8.2 — AI verification result block. Renders only when AI
            actually attempted verification (status is one of pending/
            completed/failed). Skipped submissions (challenges not yet
            covered by AI) show nothing — no need to clutter the UI. */}
        {submission.ai_status === "pending" && (
          <div className="ai-verify-block ai-verify-pending">
            <div className="ai-verify-icon" aria-hidden="true">⟳</div>
            <div className="ai-verify-body">
              <div className="ai-verify-headline">AI is reviewing…</div>
              <div className="ai-verify-sub">
                Refresh in a few seconds to see the AI&apos;s count.
              </div>
            </div>
          </div>
        )}

        {submission.ai_status === "failed" && (
          <div className="ai-verify-block ai-verify-failed">
            <div className="ai-verify-icon" aria-hidden="true">⚠</div>
            <div className="ai-verify-body">
              <div className="ai-verify-headline">AI verification didn&apos;t complete</div>
              <div className="ai-verify-sub">
                {submission.ai_error || "Review manually."}
              </div>
            </div>
          </div>
        )}

        {submission.ai_status === "completed" && submission.ai_confidence !== null && (
          <div
            className={`ai-verify-block ai-verify-completed ai-confidence-${submission.ai_confidence}`}
          >
            <div className="ai-verify-icon" aria-hidden="true">
              {submission.ai_confidence === "unable_to_verify" ? "?" : "🤖"}
            </div>
            <div className="ai-verify-body">
              <div className="ai-verify-headline">
                AI counted{" "}
                <strong>
                  {submission.ai_rep_count ?? 0}
                  {submission.challenge_unit ? ` ${submission.challenge_unit}` : ""}
                </strong>{" "}
                <span className={`ai-confidence-badge ai-confidence-${submission.ai_confidence}`}>
                  {submission.ai_confidence === "unable_to_verify"
                    ? "couldn't verify"
                    : `${submission.ai_confidence} confidence`}
                </span>
              </div>
              {submission.ai_reasoning && (
                <div className="ai-verify-reasoning">{submission.ai_reasoning}</div>
              )}
              {submission.ai_rep_count !== null &&
                submission.ai_confidence !== "unable_to_verify" && (
                  <button
                    type="button"
                    className="ai-verify-use-btn"
                    onClick={() =>
                      setRepsApproved(String(submission.ai_rep_count ?? 0))
                    }
                  >
                    Use this count →
                  </button>
                )}
            </div>
          </div>
        )}

        {/* Reps adjustment */}
        <div className="submission-reps-block">
          <label htmlFor="reps_approved" className="form-label">
            Approved reps {submission.challenge_unit ? `(${submission.challenge_unit})` : ""}
          </label>
          <div className="submission-reps-row">
            <input
              id="reps_approved"
              type="number"
              min="0"
              className="form-input submission-reps-input"
              value={repsApproved}
              onChange={(e) => setRepsApproved(e.target.value)}
              placeholder={String(submission.reps_claimed ?? 0)}
            />
            <span className="submission-reps-preview">
              → <strong>{previewPoints} pts</strong>
              {ratioPct !== null && <> ({ratioPct}% of target)</>}
            </span>
          </div>
        </div>

        {/* Coach note (optional) */}
        <div className="submission-note-block">
          <label htmlFor="coach_note" className="form-label">
            Coach note <span className="form-optional">(optional)</span>
          </label>
          <input
            id="coach_note"
            type="text"
            className="form-input"
            value={coachNote}
            onChange={(e) => setCoachNote(e.target.value)}
            placeholder="Great form! / Add a comment for the player…"
            maxLength={280}
          />
        </div>

        {/* Rejection reason — only shown when needed */}
        <div className="submission-note-block">
          <label htmlFor="rejection_reason" className="form-label">
            If rejecting, what's the reason? <span className="form-optional">(visible to player)</span>
          </label>
          <input
            id="rejection_reason"
            type="text"
            className="form-input"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Couldn't see clearly / wrong exercise / try again"
            maxLength={280}
          />
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginTop: "12px" }}>
            {error}
          </div>
        )}

        <div className="submission-modal-actions">
          {submission.status !== "pending" && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => submitReview("pending")}
              disabled={busy}
              title="Re-open this submission and clear the review"
            >
              ↺ Reset
            </button>
          )}
          <button
            type="button"
            className="btn-danger"
            onClick={() => submitReview("rejected")}
            disabled={busy}
          >
            ✕ Reject
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => submitReview("approved")}
            disabled={busy}
          >
            ✓ Approve {previewPoints > 0 ? `(${previewPoints} pts)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

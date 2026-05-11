"use client";

// =============================================================================
// components/RecordingForm.tsx — Player recording + upload form (Slice 5.4)
// =============================================================================
// Client component used inside /home/record/[eventChallengeId]/page.tsx.
//
// State machine:
//   idle        -> two big buttons: 📹 Record, 📁 Upload existing
//   previewing  -> show <video> preview + reps + note inputs + Submit
//   uploading   -> spinner + "Uploading…" message; inputs disabled
//   success     -> ✓ Submitted! card + Back-to-home link
//
// Two file inputs are used — one with capture="environment" to force
// the back camera into record mode on mobile, one without for "pick from
// gallery." Both share the same change handler.
// =============================================================================

import { useRef, useState } from "react";
import Link from "next/link";
import {
  uploadSubmissionVideo,
  insertSubmission,
  MAX_VIDEO_BYTES,
} from "@/lib/submissions";
import {
  isTimeBasedChallenge,
  durationInSeconds,
} from "@/lib/timeChallenge";
import TimedRecorder from "@/components/TimedRecorder";
import { extractFramesFromVideo } from "@/lib/frameExtraction";
import { isAIStrategyClientEligible } from "@/lib/aiStrategies/dispatcher";
import type { AIStrategy } from "@/lib/aiStrategies/types";

interface Props {
  playerId: string;
  eventId: string;
  eventChallengeId: string;
  challengeName: string;
  repTarget: number | null;
  challengeUnit: string | null;
  // Slice 8.3 — strategy framework: challenge declares which AI strategy
  // (if any) applies. Null means "no AI verification for this challenge."
  aiVerificationStrategy?: AIStrategy | null;
}

type Stage = "idle" | "previewing" | "uploading" | "success";

export default function RecordingForm({
  playerId,
  eventId,
  eventChallengeId,
  challengeName,
  repTarget,
  challengeUnit,
  aiVerificationStrategy = null,
}: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  // Object URL we generated for the <video> preview. We revoke it when
  // we're done so we don't leak memory (matters on mobile especially).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Pre-fill reps claimed with the target so the player just confirms in
  // the common case where they hit it. They can edit if they did less/more.
  const [repsClaimed, setRepsClaimed] = useState<string>(
    repTarget != null ? String(repTarget) : ""
  );
  const [playerNote, setPlayerNote] = useState<string>("");
  const [uploadStep, setUploadStep] = useState<string>("");

  // Slice 8.1: when true, render <TimedRecorder> instead of the idle
  // record/upload buttons. Set by tapping the in-browser-record CTA on
  // time-based challenges. Reset on cancel.
  const [showTimedRecorder, setShowTimedRecorder] = useState(false);

  // Slice 8.1: derived once per render — does this challenge call for the
  // in-browser timed flow? Drives the idle-state button rendering.
  const isTimed = isTimeBasedChallenge(challengeUnit);
  const targetDurationSec = isTimed
    ? durationInSeconds(repTarget, challengeUnit)
    : 0;

  // Two hidden file inputs — one for camera capture, one for plain picker.
  const recordInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    acceptFile(f);
  };

  // Slice 8.1: shared file-acceptor used by BOTH the file-picker path and the
  // in-browser TimedRecorder path. Picks up after we have a valid File and
  // sets up the preview/edit stage.
  const acceptFile = (f: File) => {
    // Defense: clamp obviously-wrong files before we even build the
    // preview. Specific size error message is in the upload helper.
    if (f.size > MAX_VIDEO_BYTES) {
      setError(`That video is ${Math.round(f.size / 1_048_576)} MB. Max is 100 MB.`);
      return;
    }

    // Free the previous preview URL if there was one.
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const url = URL.createObjectURL(f);
    setFile(f);
    setPreviewUrl(url);
    setStage("previewing");
    setError(null);
    setShowTimedRecorder(false);
  };

  const resetToIdle = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setRepsClaimed(repTarget != null ? String(repTarget) : "");
    setPlayerNote("");
    setError(null);
    setStage("idle");
    // Clear the inputs so the same file can be selected again
    if (recordInputRef.current) recordInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please pick or record a video first.");
      return;
    }

    const repsNum = parseInt(repsClaimed, 10);
    if (isNaN(repsNum) || repsNum < 0) {
      setError("Please enter how many reps you did (0 or higher).");
      return;
    }

    setStage("uploading");
    setError(null);
    setUploadStep("Uploading your video…");

    const uploadRes = await uploadSubmissionVideo(file, playerId, eventId);
    if (!uploadRes.ok || !uploadRes.publicUrl) {
      setStage("previewing");
      setError(uploadRes.error || "Upload failed. Please try again.");
      return;
    }

    setUploadStep("Saving your submission…");
    const insertRes = await insertSubmission({
      playerId,
      eventId,
      eventChallengeId,
      videoUrl: uploadRes.publicUrl,
      repsClaimed: repsNum,
      playerNote: playerNote.trim() || null,
    });

    if (!insertRes.ok) {
      setStage("previewing");
      setError(
        `Saved your video, but couldn't record the submission: ${insertRes.error}. Please try again.`
      );
      return;
    }

    // Slice 8.3 — AI verification fire-and-forget. Runs only when the
    // challenge declares an AI strategy the client can extract frames for
    // (rep_count or time_hold today; photo_completion/audio_match in future
    // slices will use different client payloads). Failures here NEVER affect
    // the player's experience — the success screen shows regardless.
    if (
      insertRes.submissionId &&
      isAIStrategyClientEligible(aiVerificationStrategy)
    ) {
      const submissionId = insertRes.submissionId;
      const videoFile = file;
      // Run async without awaiting — player gets the success screen immediately
      (async () => {
        try {
          const frames = await extractFramesFromVideo(videoFile, { frameCount: 10 });
          await fetch("/api/ai/verify-submission", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submissionId, framesBase64: frames }),
          });
        } catch {
          // Soft fail — AI verification just won't run. Coach reviews manually.
        }
      })();
    }

    // Free the preview URL — we're done with it.
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setStage("success");
  };

  // ---------- SUCCESS ----------
  if (stage === "success") {
    return (
      <div className="recording-success">
        <div className="recording-success-icon">✓</div>
        <h2 className="recording-success-title">Submitted!</h2>
        <p className="recording-success-text">
          Your coach will review your <strong>{challengeName}</strong>{" "}
          submission and get back to you soon. You&apos;ll see the status on
          your home screen.
        </p>
        <Link href="/home" className="btn-primary-link recording-success-cta">
          Back to home →
        </Link>
      </div>
    );
  }

  return (
    <div className="recording-form">
      {/* Hidden inputs — we trigger them programmatically from the visible
          buttons below. accept= filters at the OS picker level. */}
      <input
        ref={recordInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* ---------- TIMED RECORDER (in-browser flow for time-based challenges) ---------- */}
      {showTimedRecorder && targetDurationSec > 0 && (
        <TimedRecorder
          challengeName={challengeName}
          durationSeconds={targetDurationSec}
          onComplete={(f) => acceptFile(f)}
          onCancel={() => setShowTimedRecorder(false)}
        />
      )}

      {/* ---------- IDLE / PRE-FILE STATE ---------- */}
      {stage === "idle" && !showTimedRecorder && (
        <>
          <div className="recording-prompt">
            <div className="recording-prompt-icon">📹</div>
            <p className="recording-prompt-text">
              {isTimed
                ? `This is a timed challenge — ${targetDurationSec}s. Use the in-browser recorder for a voice countdown so you don't have to watch your phone.`
                : "Record yourself doing this challenge, then submit it for review."}
            </p>
            <p className="recording-prompt-hint">
              {isTimed
                ? "Tip: prop your phone up where it can see your full body, and make sure your volume is up so you can hear the countdown."
                : "Tip: prop your phone up so the camera can see your full body or the rep clearly. Coach can't approve what they can't see."}
            </p>
          </div>

          {isTimed ? (
            <button
              type="button"
              className="recording-btn-primary"
              onClick={() => setShowTimedRecorder(true)}
            >
              ⏱ Start timed challenge
            </button>
          ) : (
            <button
              type="button"
              className="recording-btn-primary"
              onClick={() => recordInputRef.current?.click()}
            >
              📹 Record now
            </button>
          )}
          <button
            type="button"
            className="recording-btn-secondary"
            onClick={() => galleryInputRef.current?.click()}
          >
            📁 Upload from gallery
          </button>

          {error && (
            <div className="alert alert-error" style={{ marginTop: "12px" }}>
              {error}
            </div>
          )}
        </>
      )}

      {/* ---------- PREVIEW + FORM ---------- */}
      {stage === "previewing" && previewUrl && (
        <>
          <video
            src={previewUrl}
            controls
            playsInline
            className="recording-preview-video"
          />

          <div className="recording-form-row">
            <label className="recording-form-label" htmlFor="reps-input">
              How many reps did you do?
            </label>
            <div className="recording-reps-row">
              <input
                id="reps-input"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={repsClaimed}
                onChange={(e) => setRepsClaimed(e.target.value)}
                className="form-input recording-reps-input"
              />
              {challengeUnit && (
                <span className="recording-reps-unit">{challengeUnit}</span>
              )}
              {repTarget != null && (
                <span className="recording-reps-target">
                  Target: {repTarget}
                </span>
              )}
            </div>
          </div>

          <div className="recording-form-row">
            <label className="recording-form-label" htmlFor="note-input">
              Note for your coach (optional)
            </label>
            <textarea
              id="note-input"
              value={playerNote}
              onChange={(e) => setPlayerNote(e.target.value)}
              className="form-input recording-note-input"
              rows={3}
              maxLength={500}
              placeholder="e.g. 'Had to pause halfway' or 'Felt great today!'"
            />
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginTop: "12px" }}>
              {error}
            </div>
          )}

          <button
            type="button"
            className="recording-btn-primary"
            onClick={handleSubmit}
          >
            ✓ Submit for review
          </button>
          <button
            type="button"
            className="recording-btn-secondary"
            onClick={resetToIdle}
          >
            ← Choose a different video
          </button>
        </>
      )}

      {/* ---------- UPLOADING ---------- */}
      {stage === "uploading" && (
        <div className="recording-uploading">
          <div className="invites-spinner" />
          <div className="recording-uploading-text">{uploadStep}</div>
          <p className="recording-uploading-hint">
            Don&apos;t close this page — we&apos;ll get you back to home as
            soon as it&apos;s done.
          </p>
        </div>
      )}
    </div>
  );
}

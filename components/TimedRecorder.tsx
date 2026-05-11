"use client";

// =============================================================================
// components/TimedRecorder.tsx — Slice 8.1
// =============================================================================
// In-browser recording flow for time-based challenges. Replaces the native
// camera flow when the challenge unit is seconds or minutes — because we
// need to be able to play audio cues DURING the challenge (the native
// camera app is a separate process where we can't run JS or play sound).
//
// State machine:
//   idle              — initial; "Start Recording" button
//   requesting-perms  — asking the browser for camera access
//   ready             — camera live; "Start Challenge" button
//   lead-in           — playing "5, 4, 3, 2, 1, Begin!"
//   recording         — MediaRecorder active; cues firing; visual timer counts down
//   complete          — done; recording handed off to parent via onComplete
//   error             — permission denied or recorder not supported; falls back
//
// Two ways out: completion (auto-stops at duration) or cancel (user-initiated).
// In both cases we clean up: stop tracks, cancel pending audio, clear timers.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAnnouncementSchedule,
  formatRemaining,
  type Announcement,
} from "@/lib/timeChallenge";
import { speak, cancelAll, prime, isSupported } from "@/lib/countdownAudio";

interface Props {
  /** Display name, shown above the recorder for context */
  challengeName: string;
  /** Target duration in seconds; required and > 0 */
  durationSeconds: number;
  /** Called when recording completes successfully with the video File */
  onComplete: (file: File) => void;
  /** Called when user cancels before completion; recorder cleans up */
  onCancel: () => void;
}

type Stage =
  | "idle"
  | "requesting-perms"
  | "ready"
  | "lead-in"
  | "recording"
  | "complete"
  | "error";

// Pick the best MIME type the current browser supports for MediaRecorder.
// Order matters: prefer MP4 (works everywhere including iOS), fall back to WebM.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* some browsers throw on unknown mimes — keep checking */
    }
  }
  return undefined;
}

function extensionFor(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

export default function TimedRecorder({
  challengeName,
  durationSeconds,
  onComplete,
  onCancel,
}: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Lead-in countdown number displayed on the overlay (5..1), or null when not in lead-in
  const [leadInNumber, setLeadInNumber] = useState<number | null>(null);
  // Seconds elapsed since "Begin!" — drives the visual timer
  const [elapsed, setElapsed] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("");
  // Track all setTimeout handles so we can cancel them on unmount / stop
  const timersRef = useRef<number[]>([]);
  // Used by the elapsed-seconds tick interval
  const tickRef = useRef<number | null>(null);

  // ---------- cleanup ----------
  // Stops camera tracks, cancels speech, clears timers. Idempotent.
  const cleanup = useCallback(() => {
    cancelAll();
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* swallow — stopping an already-stopped recorder is fine */
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Cleanup on unmount — critical, otherwise camera stays on if user
  // navigates away mid-recording
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- step 1: request camera ----------
  const handleStartRecording = useCallback(async () => {
    setErrorMsg(null);

    // Check MediaRecorder support up front — if absent, surface a clear error
    // and let the parent fall back to native camera.
    const mime = pickMimeType();
    if (!mime) {
      setErrorMsg(
        "Your browser doesn't support in-browser recording. Please use the camera app instead."
      );
      setStage("error");
      return;
    }
    mimeRef.current = mime;

    // Prime speech synthesis NOW (synchronously in the click handler) so iOS
    // Safari permits later setTimeout-scheduled utterances.
    prime();

    setStage("requesting-perms");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Prefer back camera if available — most challenges are recorded with
        // someone else holding the phone, framing the player.
        video: { facingMode: { ideal: "environment" } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Mute the live preview so the player doesn't hear their own audio
        // feedback during setup. The recording still captures audio.
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => {
          /* autoplay can fail silently in some configs — preview still renders */
        });
      }
      setStage("ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMsg(
        msg.toLowerCase().includes("permission") ||
          msg.toLowerCase().includes("denied")
          ? "Camera permission was denied. You'll need to allow camera access to record."
          : `Couldn't start the camera: ${msg}`
      );
      setStage("error");
    }
  }, []);

  // ---------- step 2: lead-in countdown, then start recording ----------
  const handleStartChallenge = useCallback(() => {
    if (!streamRef.current) return;

    setStage("lead-in");

    // Speech-synthesis lead-in: "5, 4, 3, 2, 1, Begin!"
    // We also drive a visible big-number overlay so it's clear with sound off.
    const speakAt = (delayMs: number, text: string, displayNumber: number | null) => {
      const handle = window.setTimeout(() => {
        speak(text);
        setLeadInNumber(displayNumber);
      }, delayMs);
      timersRef.current.push(handle);
    };

    // 1 second per beat
    speakAt(0, "5", 5);
    speakAt(1000, "4", 4);
    speakAt(2000, "3", 3);
    speakAt(3000, "2", 2);
    speakAt(4000, "1", 1);
    speakAt(5000, "Begin!", 0);

    // Begin recording at the "Begin!" moment
    const beginHandle = window.setTimeout(() => {
      setLeadInNumber(null);
      beginRecording();
    }, 5000);
    timersRef.current.push(beginHandle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- step 3: actual recording ----------
  const beginRecording = useCallback(() => {
    if (!streamRef.current) return;

    setStage("recording");
    setElapsed(0);
    chunksRef.current = [];

    const mime = mimeRef.current || "video/webm";
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, { mimeType: mime });
    } catch {
      // Fall back to default mime if specified one fails to instantiate
      try {
        recorder = new MediaRecorder(streamRef.current);
      } catch {
        setErrorMsg("Couldn't start the recorder. Please use the camera app.");
        setStage("error");
        return;
      }
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const ext = extensionFor(mime);
      const file = new File(
        [blob],
        `challenge-${Date.now()}.${ext}`,
        { type: mime }
      );
      // Hand off to parent — they'll show the preview + submit flow
      onComplete(file);
      setStage("complete");
    };

    recorder.start();

    // Schedule audio announcements (10-second mark, 5-count, "Time!", etc.)
    const schedule: Announcement[] = buildAnnouncementSchedule(durationSeconds);
    for (const a of schedule) {
      const handle = window.setTimeout(() => {
        speak(a.text);
      }, a.atSeconds * 1000);
      timersRef.current.push(handle);
    }

    // Stop the recording precisely at duration. Adding a tiny 250ms grace
    // period so the final "Time!" utterance can finish before the
    // MediaRecorder cuts audio.
    const stopHandle = window.setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* swallow */
        }
      }
      // Stream tracks stopped in cleanup() — but do it explicitly here too
      // so the preview light goes off immediately.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    }, durationSeconds * 1000 + 250);
    timersRef.current.push(stopHandle);

    // Visual timer tick — 1 Hz, drives the on-screen countdown display
    const startedAt = Date.now();
    tickRef.current = window.setInterval(() => {
      const e = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(e);
      if (e >= durationSeconds) {
        // Stop tick — main timer above will handle the recorder.stop()
        if (tickRef.current !== null) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
      }
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSeconds, onComplete]);

  // ---------- cancel button ----------
  const handleCancel = useCallback(() => {
    cleanup();
    onCancel();
  }, [cleanup, onCancel]);

  // ---------- RENDER ----------

  if (stage === "error") {
    return (
      <div className="timed-recorder timed-recorder-error">
        <div className="timed-recorder-icon">⚠️</div>
        <h3 className="timed-recorder-title">Can&apos;t record here</h3>
        <p className="timed-recorder-error-msg">{errorMsg}</p>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ← Back
        </button>
      </div>
    );
  }

  if (stage === "idle") {
    return (
      <div className="timed-recorder timed-recorder-idle">
        <div className="timed-recorder-icon">⏱</div>
        <h3 className="timed-recorder-title">Timed challenge</h3>
        <p className="timed-recorder-blurb">
          This is a <strong>{formatRemaining(0, durationSeconds)}</strong>{" "}
          challenge. You&apos;ll get a voice countdown — &ldquo;5, 4, 3, 2, 1,
          Begin!&rdquo; — then audio cues during the challenge so you know how
          much time is left without looking at your phone.
        </p>
        {!isSupported() && (
          <p className="timed-recorder-hint">
            (Heads up: your browser doesn&apos;t support voice cues. The
            on-screen timer will still work.)
          </p>
        )}
        <p className="timed-recorder-hint">
          Make sure your <strong>volume is up</strong> and you&apos;re in a
          quiet enough spot to hear the cues. Wireless earbuds work great if
          you have them.
        </p>
        <button
          type="button"
          className="btn-record-primary"
          onClick={handleStartRecording}
        >
          📹 Start Recording
        </button>
        <button
          type="button"
          className="btn-cancel-link"
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    );
  }

  // ready / lead-in / recording — all show the camera preview with overlays
  return (
    <div className="timed-recorder timed-recorder-active">
      <div className="timed-recorder-stage">
        <video
          ref={videoRef}
          className="timed-recorder-video"
          autoPlay
          playsInline
          muted
        />

        {/* Lead-in countdown overlay */}
        {stage === "lead-in" && leadInNumber !== null && (
          <div className="timed-recorder-overlay timed-recorder-leadin">
            <div className="timed-recorder-leadin-number">
              {leadInNumber === 0 ? "GO!" : leadInNumber}
            </div>
          </div>
        )}

        {/* Active recording timer overlay */}
        {stage === "recording" && (
          <div className="timed-recorder-overlay timed-recorder-timer">
            <div className="timed-recorder-rec-dot" aria-hidden="true" />
            <div className="timed-recorder-time-remaining">
              {formatRemaining(elapsed, durationSeconds)}
            </div>
            <div className="timed-recorder-time-label">remaining</div>
          </div>
        )}
      </div>

      {/* Action row below the video */}
      <div className="timed-recorder-actions">
        {stage === "requesting-perms" && (
          <p className="timed-recorder-status">Starting camera…</p>
        )}
        {stage === "ready" && (
          <>
            <p className="timed-recorder-ready-text">
              <strong>{challengeName}</strong> — {formatRemaining(0, durationSeconds)}
            </p>
            <p className="timed-recorder-hint">
              Position your phone where it can see you. When you&apos;re set,
              tap below — you&apos;ll hear &ldquo;5, 4, 3, 2, 1, Begin!&rdquo;
            </p>
            <button
              type="button"
              className="btn-record-primary"
              onClick={handleStartChallenge}
            >
              Start Challenge →
            </button>
            <button
              type="button"
              className="btn-cancel-link"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </>
        )}
        {stage === "lead-in" && (
          <p className="timed-recorder-status">
            Get ready… recording starts at &ldquo;Begin!&rdquo;
          </p>
        )}
        {stage === "recording" && (
          <>
            <p className="timed-recorder-status">
              🔴 Recording — give it everything you&apos;ve got
            </p>
            <button
              type="button"
              className="btn-cancel-link"
              onClick={handleCancel}
            >
              Stop &amp; discard
            </button>
          </>
        )}
        {stage === "complete" && (
          <p className="timed-recorder-status">✓ Time! Saving…</p>
        )}
      </div>
    </div>
  );
}

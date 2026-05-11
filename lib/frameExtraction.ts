// =============================================================================
// lib/frameExtraction.ts — Play-through frame extraction (Slice 8.4c)
// =============================================================================
// Slice 8.4b's seek-based approach worked for some browsers but FAILED on
// .mov / QuickTime videos (the format iPhones produce) in Edge and likely
// other Chromium browsers. Symptom: `seeked` event never fires after
// setting currentTime, so the seek times out.
//
// Slice 8.4c replaces seeking entirely with play-through capture: play
// the video at 1x speed, listen for `timeupdate` events, and capture a
// frame whenever currentTime crosses one of the desired timestamps.
//
// Trade-offs:
//   + Works for any video format the browser can play, including .mov
//   + No reliance on `seeked` event firing (which is flaky for some codecs)
//   + Simpler, fewer moving parts
//   - Takes the full video duration to extract all frames (e.g. 20s video
//     → ~20s extraction time). Combined with AI processing (~30s), total
//     ~50s. Acceptable for the use case.
//
// Still preserves the iOS-friendly bits from 8.4b: attaching video to
// the DOM, calling play() before drawing, etc.
// =============================================================================

const MAX_DIM = 768;
const JPEG_QUALITY = 0.85;

interface ExtractOptions {
  frameCount?: number;
  onProgress?: (message: string) => void;
}

export async function extractFramesFromVideo(
  videoBlob: Blob | File,
  options: ExtractOptions = {}
): Promise<string[]> {
  const frameCount = options.frameCount ?? 10;
  const log = options.onProgress ?? (() => {});

  log(`[frameExtraction] starting; blob size=${videoBlob.size} type=${videoBlob.type}`);

  const videoUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  // Attach to DOM so iOS Safari loads + decodes reliably
  video.style.position = "fixed";
  video.style.left = "-10000px";
  video.style.top = "0";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.setAttribute("aria-hidden", "true");
  document.body.appendChild(video);

  try {
    log("[frameExtraction] waiting for video to be ready");
    await waitForVideoReady(video);
    log(
      `[frameExtraction] ready; duration=${video.duration}s ${video.videoWidth}x${video.videoHeight}`
    );

    const duration = video.duration;
    if (!duration || !isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid video duration: ${duration}`);
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) throw new Error(`Video has no dimensions: ${vw}x${vh}`);

    // Set up canvas with scaled dimensions
    const scale = Math.min(1, MAX_DIM / Math.max(vw, vh));
    const cw = Math.round(vw * scale);
    const ch = Math.round(vh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    // Compute timestamps (evenly spaced, with small padding)
    const padding = Math.min(0.1, duration * 0.05);
    const startTime = padding;
    const endTime = Math.max(padding, duration - padding);
    const span = endTime - startTime;
    const timestamps: number[] = [];
    if (frameCount === 1) {
      timestamps.push(startTime + span / 2);
    } else {
      for (let i = 0; i < frameCount; i++) {
        timestamps.push(startTime + (span * i) / (frameCount - 1));
      }
    }
    log(
      `[frameExtraction] capturing ${timestamps.length} frames at: ${timestamps
        .map((t) => t.toFixed(2))
        .join(", ")}s`
    );

    // Run the play-through capture
    const frames = await playAndCapture({
      video,
      ctx,
      cw,
      ch,
      duration,
      timestamps,
      log,
    });

    return frames;
  } finally {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(videoUrl);
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      /* ignore */
    }
    if (video.parentNode) {
      video.parentNode.removeChild(video);
    }
  }
}

/**
 * Play the video at 1x speed and capture frames as currentTime crosses
 * each requested timestamp. Uses `timeupdate` (every ~250ms) as the
 * primary capture trigger, with `requestVideoFrameCallback` for higher
 * precision when available (iOS 15.4+, Chrome).
 *
 * Tolerates timestamps that are very close together — if multiple
 * timestamps have been passed since the last capture, captures the
 * current frame for all of them (no rewinding).
 *
 * Pads with the last captured frame if the video ends before all
 * timestamps are covered (defensive against duration mis-reporting).
 */
function playAndCapture(opts: {
  video: HTMLVideoElement;
  ctx: CanvasRenderingContext2D;
  cw: number;
  ch: number;
  duration: number;
  timestamps: number[];
  log: (msg: string) => void;
}): Promise<string[]> {
  const { video, ctx, cw, ch, duration, timestamps, log } = opts;

  return new Promise<string[]>((resolve, reject) => {
    let nextIndex = 0;
    const frames: string[] = [];

    // Allow video duration + 8s headroom (for slow networks / startup)
    const timeoutMs = Math.ceil((duration + 8) * 1000);
    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Playback timeout after ${(timeoutMs / 1000).toFixed(0)}s (${frames.length}/${timestamps.length} frames captured)`
        )
      );
    }, timeoutMs);

    const captureCurrentFrame = (): boolean => {
      try {
        ctx.drawImage(video, 0, 0, cw, ch);
        const dataUrl = (
          ctx.canvas as HTMLCanvasElement
        ).toDataURL("image/jpeg", JPEG_QUALITY);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
        if (base64 && base64.length > 100) {
          frames.push(base64);
          return true;
        }
        log(`[frameExtraction] empty frame at t=${video.currentTime.toFixed(2)}s (data len=${base64.length})`);
      } catch (err) {
        log(`[frameExtraction] drawImage threw: ${(err as Error).message}`);
      }
      return false;
    };

    const tryCapture = () => {
      while (
        nextIndex < timestamps.length &&
        video.currentTime >= timestamps[nextIndex]
      ) {
        log(
          `[frameExtraction] capturing frame ${nextIndex + 1}/${timestamps.length} at t=${video.currentTime.toFixed(2)}s`
        );
        captureCurrentFrame();
        nextIndex++;
      }
      if (nextIndex >= timestamps.length) {
        cleanup();
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        resolve(frames);
      }
    };

    const onTimeUpdate = () => tryCapture();

    const onEnded = () => {
      tryCapture();
      cleanup();
      if (nextIndex >= timestamps.length) {
        resolve(frames);
      } else if (frames.length > 0) {
        // Pad missing frames with the last captured frame. This handles
        // the case where the video duration was over-reported but
        // playback ended early.
        log(
          `[frameExtraction] video ended; padding ${timestamps.length - frames.length} frames with last captured`
        );
        while (frames.length < timestamps.length) {
          frames.push(frames[frames.length - 1]);
        }
        resolve(frames);
      } else {
        reject(new Error(`Video ended with 0 frames captured (duration=${duration}s)`));
      }
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    // Use requestVideoFrameCallback when available for higher precision.
    // Each invocation captures any frames whose timestamps have been
    // reached and schedules itself for the next rendered frame.
    type VideoWithRVFC = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    const v = video as VideoWithRVFC;
    if (typeof v.requestVideoFrameCallback === "function") {
      log("[frameExtraction] using requestVideoFrameCallback for precision");
      const tick = () => {
        if (nextIndex >= timestamps.length) return;
        tryCapture();
        if (nextIndex < timestamps.length) {
          v.requestVideoFrameCallback?.(tick);
        }
      };
      v.requestVideoFrameCallback(tick);
    } else {
      log("[frameExtraction] using timeupdate (no rVFC available)");
    }

    // Ensure we start from the beginning (some browsers leave currentTime
    // wherever play() left it).
    try {
      video.currentTime = 0;
    } catch {
      /* ignore — not all browsers allow this before play */
    }

    log(`[frameExtraction] starting playback (1x); will take ~${duration.toFixed(1)}s`);
    video.playbackRate = 1;
    video
      .play()
      .then(() => {
        log("[frameExtraction] play() resolved");
      })
      .catch((playErr) => {
        cleanup();
        reject(new Error(`play() failed: ${(playErr as Error).message}`));
      });
  });
}

/**
 * Wait for the video to have metadata + first-frame data loaded.
 */
function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && video.duration > 0 && video.videoWidth > 0) {
      return resolve();
    }
    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Video load timeout (readyState=${video.readyState} duration=${video.duration})`
        )
      );
    }, 15000);

    const check = () => {
      if (video.readyState >= 2 && video.duration > 0 && video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };
    const onError = () => {
      cleanup();
      const mediaErr = video.error;
      reject(
        new Error(
          `Video load error: ${
            mediaErr ? `code ${mediaErr.code} ${mediaErr.message}` : "unknown"
          }`
        )
      );
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", check);
      video.removeEventListener("loadeddata", check);
      video.removeEventListener("canplay", check);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", check);
    video.addEventListener("loadeddata", check);
    video.addEventListener("canplay", check);
    video.addEventListener("error", onError);
  });
}

// =============================================================================
// lib/frameExtraction.ts — iOS-compatible video frame extraction (Slice 8.4b)
// =============================================================================
// Major rewrite of slice 8.2's frame extraction. The original code worked
// fine on desktop Chrome/Firefox/Safari but silently produced no frames
// (or threw without throwing visibly) on iOS Safari — the most common
// platform our players use. Symptoms: AI verification never fires because
// `extractFramesFromVideo` throws or hangs before reaching the fetch.
//
// iOS Safari quirks this rewrite addresses:
//
//   1. <video> elements must be IN THE DOM for blob URLs to fully load
//      and seek reliably. The original detached <video> sometimes never
//      fires `loadeddata` on iOS.
//
//   2. <canvas>.drawImage(video, ...) renders BLACK frames if the video
//      has never been played, even after metadata + data are loaded.
//      iOS only fully decodes frames once the video has started playing.
//      Fix: call video.play() before drawing.
//
//   3. The `seeked` event fires before the new frame is actually rendered.
//      drawImage immediately after `seeked` can capture the OLD frame.
//      Fix: use requestVideoFrameCallback() (iOS 15.4+) for precise
//      render-time draw; fall back to a small setTimeout delay on older
//      iOS.
//
//   4. The 5-second seek timeout was too short for large videos on cellular
//      connections. Bumped to 12s.
// =============================================================================

const MAX_DIM = 768;
const JPEG_QUALITY = 0.85;

interface ExtractOptions {
  /** Number of evenly-spaced frames to extract from the video */
  frameCount?: number;
  /** Optional callback for diagnostic logs (called with descriptive messages) */
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
  // iOS quirk: preload="auto" instead of "metadata" so the browser
  // fetches enough data to actually decode frames during seeking.
  video.preload = "auto";

  // iOS quirk: <video> must be attached to the document to seek reliably
  // for blob URLs. Hide it off-screen.
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
    log(`[frameExtraction] ready; duration=${video.duration}s ${video.videoWidth}x${video.videoHeight}`);

    const duration = video.duration;
    if (!duration || !isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid video duration: ${duration}`);
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) throw new Error(`Video has no dimensions: ${vw}x${vh}`);

    // iOS quirk: must play() at least once for drawImage to produce real
    // (non-black) frames. Muted + playsInline allows autoplay without
    // user interaction in most browsers.
    try {
      log("[frameExtraction] calling play()");
      await video.play();
      log("[frameExtraction] play() resolved");
    } catch (playErr) {
      // Some browsers refuse play() even with muted. We'll try drawing
      // anyway — may produce black frames on iOS but might work on
      // desktop.
      log(`[frameExtraction] play() rejected (continuing): ${(playErr as Error).message}`);
    }

    const scale = Math.min(1, MAX_DIM / Math.max(vw, vh));
    const cw = Math.round(vw * scale);
    const ch = Math.round(vh * scale);

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    // Compute timestamps: evenly-spaced inside (0.1s, duration - 0.1s)
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

    // Pause before seeking (so we control playback position precisely)
    video.pause();

    const frames: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      log(`[frameExtraction] seeking to t=${t.toFixed(2)}s (${i + 1}/${timestamps.length})`);
      await seekAndDraw(video, ctx, t, cw, ch);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      if (!base64 || base64.length < 100) {
        throw new Error(`Frame ${i + 1} captured but data is empty (len=${base64.length})`);
      }
      frames.push(base64);
    }

    log(`[frameExtraction] extracted ${frames.length} frames`);
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
 * Wait for the video to have both metadata AND first-frame data loaded.
 * Uses readyState as the primary signal with a longer timeout (15s) to
 * accommodate slower connections and large videos.
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

    const onLoadedMetadata = () => check();
    const onLoadedData = () => check();
    const onCanPlay = () => check();
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
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);
  });
}

/**
 * Seek to a timestamp and draw the resulting frame to canvas. Uses
 * requestVideoFrameCallback if available (iOS 15.4+, Chrome) for precise
 * timing; falls back to a small setTimeout delay otherwise.
 */
function seekAndDraw(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  time: number,
  cw: number,
  ch: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Seek timeout at ${time.toFixed(2)}s`));
    }, 12000);

    let resolved = false;

    const onSeeked = () => {
      // Use requestVideoFrameCallback if available — guarantees the frame
      // has been composited before drawImage. Without it, drawImage may
      // capture the previous frame on slower devices.
      type VideoWithRVFC = HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      };
      const v = video as VideoWithRVFC;
      if (typeof v.requestVideoFrameCallback === "function") {
        v.requestVideoFrameCallback(() => {
          if (resolved) return;
          resolved = true;
          try {
            ctx.drawImage(video, 0, 0, cw, ch);
            cleanup();
            resolve();
          } catch (drawErr) {
            cleanup();
            reject(
              new Error(`drawImage failed: ${(drawErr as Error).message}`)
            );
          }
        });
      } else {
        // Fallback: short delay then draw
        window.setTimeout(() => {
          if (resolved) return;
          resolved = true;
          try {
            ctx.drawImage(video, 0, 0, cw, ch);
            cleanup();
            resolve();
          } catch (drawErr) {
            cleanup();
            reject(
              new Error(`drawImage failed: ${(drawErr as Error).message}`)
            );
          }
        }, 80);
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Seek error at ${time.toFixed(2)}s`));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });

    // Trigger the seek
    video.currentTime = time;
  });
}

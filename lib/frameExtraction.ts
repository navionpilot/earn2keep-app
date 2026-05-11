// =============================================================================
// lib/frameExtraction.ts — Client-side video frame extraction (Slice 8.2)
// =============================================================================
// Used after a submission is uploaded to extract a sequence of stills from
// the video, which are then POSTed to /api/ai/verify-submission for Claude
// vision analysis. Claude API only supports text + image input — no native
// video — so we sample the temporal sequence into images here.
//
// All work happens in the browser using <video> + <canvas>. The video
// blob is local (just-recorded or just-uploaded), so no CORS issues.
//
// Output: base64 JPEG data URLs (without the "data:..." prefix). Sized to
// max 768px on the longest side, JPEG quality 0.85 — keeps payload small
// (~50-150KB per frame) while preserving enough detail for rep counting.
// =============================================================================

const MAX_DIM = 768;
const JPEG_QUALITY = 0.85;

interface ExtractOptions {
  /** Number of evenly-spaced frames to extract from the video */
  frameCount?: number;
}

/**
 * Extract N evenly-spaced frames from a video File/Blob.
 *
 * For a 30-second video with frameCount=10, frames are sampled at
 * approximately 1.5s, 4.5s, 7.5s, ... — avoiding the very first/last
 * 100ms which can be black or partial in some recordings.
 *
 * Returns base64-encoded JPEG strings (no `data:image/jpeg;base64,` prefix).
 * The server-side API route adds the prefix when constructing Claude
 * content blocks.
 *
 * Throws on errors (invalid video, decode failure, etc.) — caller should
 * catch and skip AI verification rather than fail the user's submission.
 */
export async function extractFramesFromVideo(
  videoBlob: Blob | File,
  options: ExtractOptions = {}
): Promise<string[]> {
  const frameCount = options.frameCount ?? 10;

  // Build a <video> element fed by an object URL — same pattern the
  // preview screen already uses, so we know browsers support it for
  // the formats we record (.mp4 / .webm).
  const videoUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  // Don't autoplay — we drive playback via .currentTime seeking
  video.preload = "metadata";

  try {
    // Wait for metadata so .duration is available
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener(
        "error",
        () => reject(new Error("Video metadata failed to load")),
        { once: true }
      );
    });

    const duration = video.duration;
    if (!duration || !isFinite(duration) || duration <= 0) {
      throw new Error("Invalid video duration");
    }

    // Wait for first frame so video dimensions are real (not 0x0)
    await new Promise<void>((resolve, reject) => {
      const onReady = () => resolve();
      const onErr = () => reject(new Error("Video data failed to load"));
      // readyState 2 = HAVE_CURRENT_DATA, enough to read videoWidth
      if (video.readyState >= 2) return resolve();
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onErr, { once: true });
    });

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) throw new Error("Video has no dimensions");

    // Compute output canvas size — scale to MAX_DIM on longest edge
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

    // Seek + draw each frame
    const frames: string[] = [];
    for (const t of timestamps) {
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, cw, ch);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      // Strip the "data:image/jpeg;base64," prefix — we'll re-add on server
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      frames.push(base64);
    }

    return frames;
  } finally {
    // Always release the object URL and the video element
    URL.revokeObjectURL(videoUrl);
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * Seek a video element to a specific time and wait until the new frame
 * is decoded. Uses the `seeked` event with a defensive timeout.
 */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Failed to seek to ${time}s`));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout seeking to ${time}s`));
    }, 5000);
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

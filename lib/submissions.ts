// =============================================================================
// lib/submissions.ts — Upload + insert helpers for player submissions
// =============================================================================
// Used by RecordingForm.tsx. Splits the upload-then-insert flow into two
// steps so we can show clean error messages (e.g., "Upload failed" vs
// "Submission record failed") and so the storage RLS / submissions RLS
// failures are reported separately.
// =============================================================================

import { createClient } from "@/lib/supabase-browser";

// 100 MB. Has to match the file_size_limit on the storage bucket.
export const MAX_VIDEO_BYTES = 104_857_600;

// Mime types we accept on the client. Has to be a subset of the bucket's
// allowed_mime_types so we never upload something that'll be rejected
// after a long progress wait.
export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/3gpp",
  "video/3gpp2",
];

// Sanitize a filename pulled from a phone gallery / camera. Strips path
// separators (defense against paths like "../../../etc/passwd" — Supabase
// would reject anyway, but this keeps the stored name clean), maps any
// non-alphanumeric/dot/dash/underscore to underscore, and caps length.
export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, ""); // strip directory components
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (cleaned.length > 80) {
    // Preserve the file extension if there is one
    const dotIdx = cleaned.lastIndexOf(".");
    if (dotIdx > 60 && dotIdx < cleaned.length - 1) {
      const ext = cleaned.slice(dotIdx);
      return cleaned.slice(0, 80 - ext.length) + ext;
    }
    return cleaned.slice(0, 80);
  }
  return cleaned || "video";
}

// Build the storage object path for a (player, event) submission.
// Format: {player_id}/{event_id}/{ms_timestamp}-{sanitized_filename}
// The first path segment matters — RLS gates uploads on it.
export function buildSubmissionPath(
  playerId: string,
  eventId: string,
  filename: string
): string {
  const safe = sanitizeFilename(filename);
  return `${playerId}/${eventId}/${Date.now()}-${safe}`;
}

export interface UploadVideoResult {
  ok: boolean;
  path?: string;        // path within bucket
  publicUrl?: string;   // ready-to-embed src
  error?: string;
}

// Upload a single video file to the submissions bucket.
// Returns ok=false with a friendly error message on any failure (size,
// mime, RLS rejection, network).
export async function uploadSubmissionVideo(
  file: File,
  playerId: string,
  eventId: string
): Promise<UploadVideoResult> {
  // Client-side guards. Keeps error UX nice when the user picks a 4 GB
  // movie file by mistake — no point uploading 100 MB of it before the
  // server rejects.
  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    const mb = Math.round(file.size / 1_048_576);
    return {
      ok: false,
      error: `That video is ${mb} MB. Max is 100 MB. Try a shorter clip or lower-quality recording.`,
    };
  }
  // file.type can be empty on some Android pickers; only block if a
  // non-empty type isn't in the allowed list.
  if (file.type && !ACCEPTED_VIDEO_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: `Sorry, ${file.type} videos aren't supported. Try MP4 or MOV.`,
    };
  }

  const supabase = createClient();
  const path = buildSubmissionPath(playerId, eventId, file.name);

  const { error: uploadErr } = await supabase.storage
    .from("submissions")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false, // don't overwrite — timestamp prefix makes collisions unlikely anyway
      contentType: file.type || "video/mp4",
    });

  if (uploadErr) {
    return { ok: false, error: friendlyStorageError(uploadErr.message) };
  }

  const { data: urlData } = supabase.storage
    .from("submissions")
    .getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;

  if (!publicUrl) {
    return { ok: false, error: "Upload finished but we couldn't get the playback URL. Try again." };
  }

  return { ok: true, path, publicUrl };
}

// Translate Supabase Storage's raw error strings into something a teen
// can read. Most common ones:
//  - "new row violates row-level security policy"      -> auth issue
//  - "Payload too large"                                -> file size
//  - "mime type ... is not supported"                   -> mime
function friendlyStorageError(raw: string): string {
  if (/row-level security/i.test(raw)) {
    return "Looks like your account isn't allowed to upload here. Try logging out and back in.";
  }
  if (/payload too large|size/i.test(raw)) {
    return "That video is too big. Max is 100 MB.";
  }
  if (/mime type/i.test(raw)) {
    return "That file type isn't supported. Try MP4 or MOV.";
  }
  if (/network|fetch/i.test(raw)) {
    return "Network error during upload. Check your connection and try again.";
  }
  return raw;
}

export interface InsertSubmissionInput {
  playerId: string;
  eventId: string;
  eventChallengeId: string;
  videoUrl: string;
  repsClaimed: number;
  playerNote: string | null;
}

export interface InsertSubmissionResult {
  ok: boolean;
  submissionId?: string;
  error?: string;
}

// Create the submissions row after a successful upload.
// Status is hardcoded to 'pending'. Coach reviews via the existing
// SubmissionReviewModal from slice 4.8.
export async function insertSubmission(
  input: InsertSubmissionInput
): Promise<InsertSubmissionResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("submissions")
    .insert({
      player_id: input.playerId,
      event_id: input.eventId,
      event_challenge_id: input.eventChallengeId,
      status: "pending",
      reps_claimed: input.repsClaimed,
      player_note: input.playerNote || null,
      video_url: input.videoUrl,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, submissionId: data?.id };
}

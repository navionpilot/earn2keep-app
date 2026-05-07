// ============================================================
// Storage helpers for reference photos.
//
// These wrap Supabase Storage with a small, consistent API so we
// can change the underlying bucket layout in one place later.
//
// Path convention:
//   {organizationId}/{randomId}/{cleanFilename}
//
// We don't tie the path to challenge.id because at upload time
// (custom challenge form) the challenge may not exist yet. The
// challenge row stores the public URL we get back.
// ============================================================

import { createClient } from "@/lib/supabase-browser";

export const REFERENCE_PHOTO_BUCKET = "challenge-reference-photos";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export type UploadResult = {
  url: string;     // public URL
  path: string;    // storage path (for deletes later)
};

// ------------------------------------------------------------
// Validate a file before upload — returns null if OK,
// otherwise a user-readable error string.
// ------------------------------------------------------------
export function validatePhotoFile(file: File): string | null {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type as any)) {
    return "Photo must be a JPEG, PNG, WebP, or HEIC file.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Photo is ${mb} MB — please use a file smaller than 5 MB.`;
  }
  return null;
}

// ------------------------------------------------------------
// Sanitize a filename for safe storage path use.
// Strips spaces, weird characters, and keeps the extension.
// ------------------------------------------------------------
function cleanFilename(name: string): string {
  // Split into base + extension
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "photo";
  return `${base}${ext}`;
}

// ------------------------------------------------------------
// Generate a short random ID for path uniqueness (no deps).
// ------------------------------------------------------------
function randomId(): string {
  // 12 hex chars is plenty for our scale.
  const arr = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback (should never hit in browsers we support)
  return Math.random().toString(16).slice(2, 14);
}

// ------------------------------------------------------------
// Upload a reference photo. Returns the public URL + the
// storage path (so the caller can delete or replace it later).
// ------------------------------------------------------------
export async function uploadReferencePhoto(
  file: File,
  organizationId: string
): Promise<UploadResult> {
  if (!organizationId) {
    throw new Error("uploadReferencePhoto: organizationId is required.");
  }
  const validationError = validatePhotoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const supabase = createClient();
  const path = `${organizationId}/${randomId()}/${cleanFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(REFERENCE_PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from(REFERENCE_PHOTO_BUCKET)
    .getPublicUrl(path);

  return { url: data.publicUrl, path };
}

// ------------------------------------------------------------
// Delete a reference photo by its storage path.
// Used when the user clicks "Remove" before the form is saved.
// We swallow errors here because if the cleanup fails it's
// non-fatal (orphan files cost ~$0 at our scale).
// ------------------------------------------------------------
export async function deleteReferencePhoto(path: string): Promise<void> {
  if (!path) return;
  const supabase = createClient();
  try {
    await supabase.storage.from(REFERENCE_PHOTO_BUCKET).remove([path]);
  } catch {
    // intentionally ignore — orphans are harmless
  }
}

// ------------------------------------------------------------
// Convert a public URL back into a storage path.
// Useful when we have a URL stored in the DB but want to
// delete the underlying file.
// ------------------------------------------------------------
export function pathFromPublicUrl(url: string): string | null {
  if (!url) return null;
  // Public URL pattern:
  // {origin}/storage/v1/object/public/{bucket}/{path}
  const marker = `/storage/v1/object/public/${REFERENCE_PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.slice(idx + marker.length);
}

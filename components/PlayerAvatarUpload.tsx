"use client";

// =============================================================================
// components/PlayerAvatarUpload.tsx — Avatar picker (Slice 5.5)
// =============================================================================
// Click or drag-and-drop a file → uploads to player-avatars/{player_id}/...
// → updates players.avatar_url to the public URL → calls onChange(newUrl).
//
// No cropping in v1 — CSS object-fit handles aspect ratio. Square images
// look best; we tell the user that.
//
// Storage path layout (matches the SQL bucket policy):
//   player-avatars/{player_id}/{ms_timestamp}-{sanitized_filename}.{ext}
//
// We DON'T delete old avatars when re-uploading. They stay in the bucket
// (cheap), and the URL on the player row points at the new one. This
// keeps the upload flow atomic — if the new upload fails midway, the
// previous avatar is still working. A nightly cleanup job could prune
// orphans later.
// =============================================================================

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface Props {
  playerId: string;
  currentUrl: string | null;
  firstName: string;
  lastName: string | null;
  onChange: (newUrl: string | null) => void;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB matches bucket limit
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function PlayerAvatarUpload({
  playerId,
  currentUrl,
  firstName,
  lastName,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build initials for the placeholder ring when no avatar yet.
  const initials =
    `${firstName[0] ?? "?"}${(lastName ?? "")[0] ?? ""}`.toUpperCase();

  const handleFile = async (file: File) => {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Use a JPG, PNG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is over 5 MB. Try a smaller one.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      // Sanitize the filename so weird characters don't break the path.
      const safeName = file.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 40);
      const path = `${playerId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("player-avatars")
        .upload(path, file, {
          cacheControl: "3600",
          // Don't allow overwriting via guess; storage RLS blocks
          // cross-player writes anyway.
          upsert: false,
          contentType: file.type,
        });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }

      // Build the public URL. Bucket is public so no signed URLs needed.
      const { data: pub } = supabase.storage
        .from("player-avatars")
        .getPublicUrl(path);
      const publicUrl = pub?.publicUrl ?? null;
      if (!publicUrl) {
        setError("Couldn't read the upload URL. Try again.");
        return;
      }

      onChange(publicUrl);
      // Note: we do NOT auto-save the players row here. The parent form
      // saves all 4 editable fields together when the user clicks Save.
    } finally {
      setUploading(false);
    }
  };

  const handleSelectClick = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so re-picking the same file fires onChange again.
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleRemove = () => {
    // Just clear the URL — don't delete the actual storage object.
    // Avatars are cheap; cleanup can run later as a maintenance job.
    onChange(null);
  };

  return (
    <div
      className={`avatar-upload ${dragOver ? "avatar-upload-dragover" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Preview circle (current avatar, or initials placeholder). */}
      <div className="avatar-upload-preview">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt="Your avatar"
            className="avatar-upload-img"
          />
        ) : (
          <span className="avatar-upload-initials">{initials}</span>
        )}
      </div>

      <div className="avatar-upload-controls">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={handleInputChange}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="avatar-upload-btn-primary"
          onClick={handleSelectClick}
          disabled={uploading}
        >
          {uploading
            ? "Uploading…"
            : currentUrl
            ? "📷 Change photo"
            : "📷 Choose photo"}
        </button>
        {currentUrl && !uploading && (
          <button
            type="button"
            className="avatar-upload-btn-secondary"
            onClick={handleRemove}
          >
            Remove
          </button>
        )}
        <p className="avatar-upload-hint">
          Or drag and drop. JPG/PNG/WEBP, up to 5 MB.
        </p>
        {error && <p className="avatar-upload-error">{error}</p>}
      </div>
    </div>
  );
}

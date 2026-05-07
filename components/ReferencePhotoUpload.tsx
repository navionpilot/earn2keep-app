"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  uploadReferencePhoto,
  deleteReferencePhoto,
  pathFromPublicUrl,
  validatePhotoFile,
  MAX_PHOTO_BYTES,
} from "@/lib/storage";

interface ReferencePhotoUploadProps {
  // Current photo URL (null/empty if none yet)
  photoUrl: string | null;
  setPhotoUrl: (url: string | null) => void;

  // Optional caption shown under the photo
  caption: string | null;
  setCaption: (caption: string) => void;

  // The org the photo will be filed under (for the storage path)
  organizationId: string;

  // Disable while the parent form is submitting, etc.
  disabled?: boolean;
}

const MAX_PHOTO_MB = (MAX_PHOTO_BYTES / 1024 / 1024).toFixed(0);

export default function ReferencePhotoUpload({
  photoUrl,
  setPhotoUrl,
  caption,
  setCaption,
  organizationId,
  disabled = false,
}: ReferencePhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);

    // Client-side validation first
    const validationError = validatePhotoFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!organizationId) {
      setError("Save your organization first, then add a photo.");
      return;
    }

    setUploading(true);
    try {
      // If there's already a photo, delete the old one first.
      if (photoUrl) {
        const oldPath = pathFromPublicUrl(photoUrl);
        if (oldPath) await deleteReferencePhoto(oldPath);
      }

      const result = await uploadReferencePhoto(file, organizationId);
      setPhotoUrl(result.url);
    } catch (err: any) {
      setError(err?.message || "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so picking the same file again still triggers onChange
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || uploading) return;
    setDragOver(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || uploading) return;
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleRemove = async () => {
    setError(null);
    if (!photoUrl) return;
    const oldPath = pathFromPublicUrl(photoUrl);
    if (oldPath) {
      // Best-effort delete; don't block UI on it
      deleteReferencePhoto(oldPath);
    }
    setPhotoUrl(null);
    setCaption("");
  };

  const handleBrowseClick = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  return (
    <div className="reference-photo-upload">
      <label className="form-label">
        Reference photo (optional)
      </label>
      <p className="form-hint" style={{ marginTop: "-4px", marginBottom: "10px" }}>
        Show players what good form or a correct setup looks like. Up to {MAX_PHOTO_MB} MB. JPEG, PNG, WebP, or HEIC.
      </p>

      {photoUrl ? (
        // ---- Photo already uploaded — show preview + remove ----
        <div className="reference-photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={caption || "Reference photo"}
            className="reference-photo-img"
          />
          <div className="reference-photo-actions">
            <button
              type="button"
              className="btn-cancel"
              onClick={handleBrowseClick}
              disabled={disabled || uploading}
            >
              📷 Replace
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={handleRemove}
              disabled={disabled || uploading}
            >
              🗑 Remove
            </button>
          </div>
        </div>
      ) : (
        // ---- No photo yet — show drag-and-drop area ----
        <div
          className={`reference-photo-dropzone ${dragOver ? "reference-photo-dropzone-active" : ""} ${(disabled || uploading) ? "reference-photo-dropzone-disabled" : ""}`}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleBrowseClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleBrowseClick();
            }
          }}
        >
          {uploading ? (
            <p className="reference-photo-dropzone-text">
              ⏳ Uploading... please wait
            </p>
          ) : (
            <>
              <p className="reference-photo-dropzone-text">
                📷 Drag a photo here or <span className="reference-photo-dropzone-link">click to browse</span>
              </p>
              <p className="reference-photo-dropzone-hint">
                JPEG, PNG, WebP, or HEIC — up to {MAX_PHOTO_MB} MB
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        onChange={handleFileInputChange}
        disabled={disabled || uploading}
        style={{ display: "none" }}
      />

      {error && (
        <div className="alert alert-error" style={{ marginTop: "10px" }}>
          {error}
        </div>
      )}

      {/* Caption — only show when a photo is uploaded */}
      {photoUrl && (
        <div style={{ marginTop: "12px" }}>
          <label htmlFor="referencePhotoCaption" className="form-label">
            Caption (optional)
          </label>
          <input
            id="referencePhotoCaption"
            type="text"
            className="form-input"
            placeholder="e.g., Proper push-up form, elbows close to body"
            value={caption || ""}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={140}
            disabled={disabled}
          />
          <p className="form-hint">
            A short note shown under the photo. Max 140 characters.
          </p>
        </div>
      )}
    </div>
  );
}

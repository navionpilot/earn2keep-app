"use client";

// =============================================================================
// components/EventMoneyCsvButton.tsx — CSV export button (L41)
// =============================================================================
// Calls the per-event money-csv route and triggers a browser download. The
// route returns text/csv with a Content-Disposition header, so most
// browsers will start a download directly when the fetched response is
// rendered to a Blob URL.
//
// Kept as a client component because we want a smooth UX (loading state,
// error message) without a full page navigation. Could also have been a
// simple anchor with href to the API route, but loading feedback matters.
// =============================================================================

import { useState } from "react";

interface Props {
  orgId: string;
  eventId: string;
  eventName: string;
}

function safeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9\-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60)
    .toLowerCase();
}

export default function EventMoneyCsvButton({ orgId, eventId, eventName }: Props) {
  const [downloading, setDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/events/${eventId}/money-csv`
      );
      if (!res.ok) {
        let msg = "Download failed.";
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch {
          // not JSON; ignore
        }
        setError(msg);
        setDownloading(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${safeFilename(eventName)}-money-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Slight delay before revoking the URL so the download starts cleanly
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ textAlign: "right" }}>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        style={{
          padding: "8px 16px",
          background: downloading ? "rgba(53, 213, 223, 0.2)" : "transparent",
          color: "#35d5df",
          border: "1px solid rgba(53, 213, 223, 0.4)",
          borderRadius: 999,
          fontWeight: 700,
          fontSize: 13,
          cursor: downloading ? "wait" : "pointer",
        }}
      >
        {downloading ? "Preparing…" : "⬇ Export CSV"}
      </button>
      {error && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "#ff755f",
            maxWidth: 240,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

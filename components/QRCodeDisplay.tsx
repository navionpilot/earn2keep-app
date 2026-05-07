"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QRCodeDisplayProps {
  // Full URL the QR encodes (what the sponsor lands on when scanned)
  url: string;
  // Player name shown above the QR (e.g., "Sarah J.")
  publicLabel: string;
  // Real player name shown below the QR for the coach (e.g., "Sarah Johnson")
  privateLabel?: string;
  // Filename suggested when the user clicks "Download PNG"
  downloadFilenameStem: string;
  // Display width/height in pixels (the rendered QR is 4× this for crispness)
  size?: number;
}

export default function QRCodeDisplay({
  url,
  publicLabel,
  privateLabel,
  downloadFilenameStem,
  size = 180,
}: QRCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [copyLabel, setCopyLabel] = useState<string>("Copy link");

  useEffect(() => {
    let mounted = true;
    // Generate at 4× display size for HiDPI/print clarity
    const renderSize = Math.max(size * 4, 720);
    QRCode.toDataURL(url, {
      width: renderSize,
      margin: 1,
      color: { dark: "#0F172A", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    })
      .then((d) => {
        if (mounted) setDataUrl(d);
      })
      .catch(() => {
        if (mounted) setDataUrl("");
      });
    return () => {
      mounted = false;
    };
  }, [url, size]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${sanitizeFilename(downloadFilenameStem)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyLabel("Copied ✓");
      setTimeout(() => setCopyLabel("Copy link"), 1500);
    } catch {
      // Fallback: select-and-prompt
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <div className="qr-card">
      <div className="qr-card-public-name">{publicLabel}</div>
      {privateLabel && privateLabel !== publicLabel && (
        <div className="qr-card-private-name" title="Coach view of the player's full name">
          {privateLabel}
        </div>
      )}

      <div
        className="qr-card-img-wrap"
        style={{ width: size, height: size }}
      >
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={`Sponsor QR for ${publicLabel}`}
            className="qr-card-img"
            width={size}
            height={size}
          />
        ) : (
          <div className="qr-card-img-loading">Generating…</div>
        )}
      </div>

      <div className="qr-card-actions">
        <button
          type="button"
          className="btn-secondary qr-card-btn"
          onClick={handleDownload}
          disabled={!dataUrl}
          title="Download just this player's QR code as a PNG image"
        >
          📥 PNG
        </button>
        <button
          type="button"
          className="btn-secondary qr-card-btn"
          onClick={handleCopy}
          title="Copy the sponsor link to share via text, email, or social"
        >
          🔗 {copyLabel}
        </button>
      </div>
    </div>
  );
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[^a-z0-9 _-]+/gi, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "sponsor_qr";
}

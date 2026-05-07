"use client";

import { useState } from "react";
import {
  generateSponsorFlyerPDF,
  type FlyerCard,
  type FlyerEventContext,
} from "@/lib/sponsorFlyerPdf";

// Re-export so the qr-codes page can keep importing the type from here
export type PdfPlayerCard = FlyerCard;

interface SponsorPdfButtonProps {
  cards: FlyerCard[];
  eventContext: FlyerEventContext;
  disabled?: boolean;
}

export default function SponsorPdfButton({
  cards,
  eventContext,
  disabled,
}: SponsorPdfButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setError(null);
    if (cards.length === 0) {
      setError("No players to print.");
      return;
    }
    setBusy(true);
    try {
      await generateSponsorFlyerPDF(cards, eventContext);
    } catch (err: any) {
      setError(err?.message || "PDF generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sponsor-pdf-btn-wrap">
      <button
        type="button"
        className="btn-primary btn-inline"
        onClick={handleDownload}
        disabled={busy || disabled || cards.length === 0}
      >
        {busy
          ? "Building flyers\u2026"
          : `\uD83D\uDCC4 Download ${cards.length} flyer${cards.length === 1 ? "" : "s"} (PDF)`}
      </button>
      <p className="sponsor-pdf-btn-hint">
        One full-page promotional flyer per player. Print, hand out, or text it to family.
      </p>
      {error && (
        <p className="alert alert-error" style={{ marginTop: "8px" }}>
          {error}
        </p>
      )}
    </div>
  );
}

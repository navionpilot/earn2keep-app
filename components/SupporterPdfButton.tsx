"use client";

import { useState } from "react";
import {
  generateSupporterFlyerPDF,
  type FlyerCard,
  type FlyerEventContext,
} from "@/lib/supporterFlyerPdf";

// Re-export so the qr-codes page can keep importing the type from here
export type PdfPlayerCard = FlyerCard;

interface SupporterPdfButtonProps {
  cards: FlyerCard[];
  eventContext: FlyerEventContext;
  disabled?: boolean;
}

export default function SupporterPdfButton({
  cards,
  eventContext,
  disabled,
}: SupporterPdfButtonProps) {
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
      await generateSupporterFlyerPDF(cards, eventContext);
    } catch (err: any) {
      setError(err?.message || "PDF generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="supporter-pdf-btn-wrap">
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
      <p className="supporter-pdf-btn-hint">
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

"use client";

import { useState } from "react";
import QRCode from "qrcode";

export type PdfPlayerCard = {
  publicLabel: string;   // e.g., "Sarah J."
  privateLabel: string;  // e.g., "Sarah Johnson"
  url: string;           // full sponsor URL
  teamName: string;
};

interface SponsorPdfButtonProps {
  eventName: string;
  organizationName: string;
  cards: PdfPlayerCard[];
  disabled?: boolean;
}

export default function SponsorPdfButton({
  eventName,
  organizationName,
  cards,
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
      // Lazy-load jspdf so it isn't in the initial bundle
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });

      const pageW = 8.5;
      const pageH = 11;
      const margin = 0.4;
      const cols = 3;
      const rows = 4;
      const perPage = cols * rows;
      const cellW = (pageW - margin * 2) / cols;
      const cellH = (pageH - margin * 2 - 0.5 /* header */) / rows;

      // Cover header — first page only
      const drawHeader = (pageNum: number, totalPages: number) => {
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Sponsor QR Codes — ${eventName}`, pageW / 2, margin + 0.2, { align: "center" });
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(120);
        pdf.text(
          `${organizationName}  ·  Page ${pageNum} of ${totalPages}  ·  Cut along borders to share`,
          pageW / 2,
          margin + 0.4,
          { align: "center" }
        );
        pdf.setTextColor(0);
      };

      const totalPages = Math.ceil(cards.length / perPage);

      for (let i = 0; i < cards.length; i++) {
        const slotIdx = i % perPage;
        const pageIdx = Math.floor(i / perPage);

        if (slotIdx === 0 && i > 0) {
          pdf.addPage();
        }
        if (slotIdx === 0) {
          drawHeader(pageIdx + 1, totalPages);
        }

        const col = slotIdx % cols;
        const row = Math.floor(slotIdx / cols);
        const x = margin + col * cellW;
        const y = margin + 0.5 + row * cellH;

        // Card border
        pdf.setDrawColor(200);
        pdf.setLineWidth(0.01);
        pdf.rect(x + 0.05, y + 0.05, cellW - 0.1, cellH - 0.1);

        // Player name (top, bold)
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.text(cards[i].publicLabel, x + cellW / 2, y + 0.35, {
          align: "center",
          maxWidth: cellW - 0.2,
        });

        // Team name (subline)
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(120);
        pdf.text(cards[i].teamName, x + cellW / 2, y + 0.55, {
          align: "center",
          maxWidth: cellW - 0.2,
        });
        pdf.setTextColor(0);

        // QR code
        const qrSizeIn = Math.min(cellW - 0.4, cellH - 1.1);
        const qrPx = Math.round(qrSizeIn * 300); // 300 DPI
        const qrDataUrl = await QRCode.toDataURL(cards[i].url, {
          width: qrPx,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0F172A", light: "#FFFFFF" },
        });
        const qrX = x + (cellW - qrSizeIn) / 2;
        const qrY = y + 0.65;
        pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSizeIn, qrSizeIn);

        // Footer caption
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(7);
        pdf.setTextColor(140);
        pdf.text(
          "Scan to support  ·  earn²keep",
          x + cellW / 2,
          y + cellH - 0.18,
          { align: "center", maxWidth: cellW - 0.2 }
        );
        pdf.setTextColor(0);
      }

      const filename = sanitizeFilename(`${eventName}_Sponsor_QR_Codes`) + ".pdf";
      pdf.save(filename);
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
        {busy ? "Building PDF…" : "📄 Download all as PDF"}
      </button>
      {error && (
        <p className="alert alert-error" style={{ marginTop: "8px" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[^a-z0-9 _-]+/gi, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "sponsor_qr";
}

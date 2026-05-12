"use client";

// =============================================================================
// components/PlayerSupporterCard.tsx — Player-facing supporter share card
// =============================================================================
// Slice 5.4.2 replaces the simple "tap and hold to copy this link" placeholder
// with a real one-tap-share experience for players:
//
//   - QR code rendered right on screen so a family member sitting next to
//     them can scan immediately
//   - 📲 Share button using the Web Share API (opens iOS/Android native
//     share sheet — text, email, AirDrop, Instagram DM, whatever)
//   - 📄 Download flyer button generates the same PDF the coach uses,
//     so the player can save and post on the fridge or share digitally
//   - 📋 Copy link as the universal fallback
//
// All work happens client-side. The flyer generator (lib/supporterFlyerPdf.ts)
// already runs in-browser via jsPDF — same code path the coach uses.
// =============================================================================

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { generateSupporterFlyerPDF } from "@/lib/supporterFlyerPdf";

interface Props {
  token: string;
  playerFirstName: string;
  playerLastName: string | null;
  teamName: string;
  teamSport: string | null;
  teamAgeGroup: string | null;
  eventName: string;
  eventType: "mini-camp" | "camp" | "tournament" | string;
  organizationName: string;
  goalAmount: number;
  eventStartDate: string;
  eventEndDate: string;
  // Slice 5.9.3 — prize fields shown on the generated PDF flyer
  firstPlacePrize?: string | null;
  firstPlaceAmount?: number | null;
  secondPlacePrize?: string | null;
  secondPlaceAmount?: number | null;
  thirdPlacePrize?: string | null;
  thirdPlaceAmount?: number | null;
}

export default function PlayerSupporterCard(props: Props) {
  const url = `https://app.earn2keep.com/supporter/${props.token}`;

  // QR rendered as inline SVG (small, scales perfectly, no extra image
  // requests). Generated once per token on mount.
  const [qrSvg, setQrSvg] = useState<string>("");
  // Web Share API isn't supported on every browser. We feature-detect
  // and only show the Share button where it'll actually work; otherwise
  // the Copy button is the path.
  const [shareSupported, setShareSupported] = useState(false);
  // Per-button transient state for visual feedback ("✓ Copied").
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [flyerState, setFlyerState] = useState<
    "idle" | "generating" | "error"
  >("idle");

  useEffect(() => {
    // Generate the QR code as SVG. M-level error correction is plenty
    // for a 50-character URL and produces a smaller code than H-level.
    QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
      color: { dark: "#041418", light: "#ffffff" },
    })
      .then((svg) => setQrSvg(svg))
      .catch(() => {
        // Non-fatal: the URL/copy buttons still work. Worst case the
        // user just doesn't see the QR.
        setQrSvg("");
      });

    if (typeof navigator !== "undefined" && "share" in navigator) {
      setShareSupported(true);
    }
  }, [url]);

  // Native share sheet — what most players will use on phones.
  const handleShare = async () => {
    if (typeof navigator === "undefined" || !navigator.share) return;
    try {
      await navigator.share({
        title: `Supporter ${props.playerFirstName}'s earn²keep page`,
        text: `Help ${props.playerFirstName} compete with the ${props.teamName} — pledge here:`,
        url,
      });
    } catch {
      // User cancelled the share sheet, or permissions denied. Either
      // way, no error to surface.
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      // Clipboard fails in non-https contexts; the URL is still
      // visible below for manual selection.
    }
  };

  const handleDownloadFlyer = async () => {
    setFlyerState("generating");
    try {
      // Build the public display label the same way the coach side does:
      // "Sarah J." (first name + last initial). The full name goes into
      // the file but never onto the public supporter page.
      const lastInitial = props.playerLastName
        ? ` ${props.playerLastName.charAt(0).toUpperCase()}.`
        : "";
      await generateSupporterFlyerPDF(
        [
          {
            publicLabel: `${props.playerFirstName}${lastInitial}`,
            privateLabel:
              `${props.playerFirstName} ${props.playerLastName ?? ""}`.trim(),
            url,
            teamName: props.teamName,
            teamSport: props.teamSport,
            teamAgeGroup: props.teamAgeGroup,
          },
        ],
        {
          eventName: props.eventName,
          eventType: props.eventType,
          organizationName: props.organizationName,
          goalAmount: props.goalAmount,
          eventStartDate: props.eventStartDate,
          eventEndDate: props.eventEndDate,
          firstPlacePrize: props.firstPlacePrize ?? null,
          firstPlaceAmount: props.firstPlaceAmount ?? null,
          secondPlacePrize: props.secondPlacePrize ?? null,
          secondPlaceAmount: props.secondPlaceAmount ?? null,
          thirdPlacePrize: props.thirdPlacePrize ?? null,
          thirdPlaceAmount: props.thirdPlaceAmount ?? null,
        }
      );
      // jsPDF triggers the download itself — nothing else to do.
      setFlyerState("idle");
    } catch {
      setFlyerState("error");
      setTimeout(() => setFlyerState("idle"), 3000);
    }
  };

  return (
    <div className="player-supporter-card">
      {/* QR — large, centered, on a white card so it scans cleanly even
          when the screen is in dark mode. */}
      <div className="player-supporter-qr-wrap">
        {qrSvg ? (
          <div
            className="player-supporter-qr"
            // The qrcode library returns trusted SVG for our own input —
            // no user-supplied content goes into it.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        ) : (
          <div className="player-supporter-qr-loading">Generating QR…</div>
        )}
      </div>

      <p className="player-supporter-instruct">
        Family or friends nearby can <strong>scan this with their phone&apos;s
        camera</strong> to land on your supporter page. Or share the link
        directly:
      </p>

      <div className="player-supporter-actions">
        {shareSupported && (
          <button
            type="button"
            className="player-supporter-btn-primary"
            onClick={handleShare}
          >
            📲 Share my page
          </button>
        )}

        <button
          type="button"
          className="player-supporter-btn-secondary"
          onClick={handleDownloadFlyer}
          disabled={flyerState === "generating"}
        >
          {flyerState === "generating"
            ? "Generating PDF…"
            : flyerState === "error"
            ? "⚠ Try again"
            : "📄 Save flyer (PDF)"}
        </button>

        <button
          type="button"
          className="player-supporter-btn-tertiary"
          onClick={handleCopy}
        >
          {copyState === "copied" ? "✓ Copied!" : "📋 Copy link"}
        </button>
      </div>

      <div className="player-supporter-url-display">
        {url}
      </div>

      <p className="player-supporter-finehint">
        💡 The Save flyer button gives you the same printable PDF your coach
        can hand out — perfect for posting at school, on the fridge, or in a
        group chat.
      </p>
    </div>
  );
}

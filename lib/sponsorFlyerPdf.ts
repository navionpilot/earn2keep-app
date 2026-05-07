// ============================================================
// Sponsor Flyer PDF generator
//
// Builds a multi-page letter-sized PDF where each page is a
// promotional flyer for one player.
//
// Notes on typography:
//   jsPDF's default Helvetica font supports a limited character
//   set. Verified-working: bullet (U+2022), en-dash (U+2013),
//   em-dash (U+2014), middle-dot (U+00B7), curly apostrophe.
//   Verified-BROKEN: superscript-2 (U+00B2 renders as nothing),
//   star (U+2605 renders as &), arrow (U+2192 renders as garbage),
//   check (U+2713 renders as apostrophe).
//
//   The "earn²keep" mark is drawn manually as
//      "earn" + small raised "2" + "keep"
//   to avoid the superscript-2 bug. Bullets replace stars and
//   checks; commas replace arrows.
// ============================================================

import QRCode from "qrcode";

export type FlyerCard = {
  publicLabel: string;      // "Sarah J."
  privateLabel: string;     // "Sarah Johnson" — used for filenames only
  url: string;              // Full sponsor URL the QR encodes
  teamName: string;
  teamSport: string | null;
  teamAgeGroup: string | null;
};

export type FlyerEventContext = {
  eventName: string;
  eventType: "camp" | "tournament" | string;
  organizationName: string;
  goalAmount: number;
  eventStartDate: string;   // YYYY-MM-DD
  eventEndDate: string;     // YYYY-MM-DD
};

// ----- Color palette --------------------------------------------------
const COLOR_BLUE: [number, number, number] = [37, 99, 235];      // #2563EB
const COLOR_GOLD: [number, number, number] = [217, 119, 6];      // #D97706
const COLOR_TEXT: [number, number, number] = [15, 23, 42];       // #0F172A
const COLOR_MUTED: [number, number, number] = [107, 114, 128];   // #6B7280
const COLOR_CARD_BG: [number, number, number] = [244, 246, 250]; // #F4F6FA
const COLOR_BORDER: [number, number, number] = [226, 232, 240];  // #E2E8F0
const COLOR_GREEN: [number, number, number] = [16, 185, 129];    // #10B981

// ----- Public entry --------------------------------------------------

export async function generateSponsorFlyerPDF(
  cards: FlyerCard[],
  ctx: FlyerEventContext
): Promise<void> {
  if (cards.length === 0) {
    throw new Error("No players to render.");
  }
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "in",
    format: "letter",
    orientation: "portrait",
    compress: true, // Without this, embedded QR PNGs balloon the file ~140x.
  });

  for (let i = 0; i < cards.length; i++) {
    if (i > 0) pdf.addPage();
    await drawFlyerPage(pdf, cards[i], ctx);
  }

  const baseName =
    cards.length === 1
      ? `${ctx.eventName}_${cards[0].publicLabel}_Sponsor_Flyer`
      : `${ctx.eventName}_Sponsor_Flyers`;
  pdf.save(sanitizeFilename(baseName) + ".pdf");
}

// ----- Brand mark helper ---------------------------------------------
// Draws "earn²keep" as: "earn" + small raised "2" + "keep" so the
// superscript renders even though Helvetica's default encoding
// doesn't include U+00B2.
//
// Returns the total width drawn (in inches) so callers can layout
// content next to it.

function drawBrandMark(
  pdf: any,
  x: number,
  baselineY: number,
  fontSize: number
): number {
  const supSize = Math.round(fontSize * 0.55);
  // Raise the "2" so its top roughly aligns with the cap height of the
  // surrounding text. fontSize is in points; 0.0035 gives the right inch
  // offset for a clean superscript at any size.
  const supRise = fontSize * 0.0035;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(fontSize);
  pdf.text("earn", x, baselineY);
  const earnW = pdf.getTextWidth("earn");

  pdf.setFontSize(supSize);
  pdf.text("2", x + earnW + 0.005, baselineY - supRise);
  const twoW = pdf.getTextWidth("2");

  pdf.setFontSize(fontSize);
  pdf.text("keep", x + earnW + twoW + 0.01, baselineY);
  const keepW = pdf.getTextWidth("keep");

  return earnW + twoW + keepW + 0.015;
}

// ----- One flyer page ------------------------------------------------

async function drawFlyerPage(
  pdf: any,
  card: FlyerCard,
  ctx: FlyerEventContext
): Promise<void> {
  const PAGE_W = 8.5;
  const PAGE_H = 11;
  const MARGIN_X = 0.55;

  const isCamp = ctx.eventType === "camp";
  const goal = Number(ctx.goalAmount || 0);
  const goalText = goal > 0 ? `$${formatMoney(goal)}` : "\u2014";

  // -------- HEADER BAR (royal blue) --------
  const headerH = 0.78;
  pdf.setFillColor(...COLOR_BLUE);
  pdf.rect(0, 0, PAGE_W, headerH, "F");

  // earn²keep brand mark on the left
  pdf.setTextColor(255, 255, 255);
  drawBrandMark(pdf, MARGIN_X, headerH / 2 + 0.1, 20);

  // Tagline on the right
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(11);
  pdf.text("Earn it. Keep it.", PAGE_W - MARGIN_X, headerH / 2 + 0.07, {
    align: "right",
  });

  // Thin gold accent line right under the header
  pdf.setFillColor(...COLOR_GOLD);
  pdf.rect(0, headerH, PAGE_W, 0.04, "F");

  // -------- HERO --------
  let cursorY = headerH + 0.55;

  // Eyebrow (bullets instead of stars — Helvetica-safe)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...COLOR_GOLD);
  const eyebrow = isCamp
    ? "\u2022  FUNDRAISER  \u2022"
    : "\u2022  TOURNAMENT  \u2022";
  pdf.text(eyebrow, PAGE_W / 2, cursorY, { align: "center" });
  cursorY += 0.42;

  // Headline
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(30);
  pdf.setTextColor(...COLOR_TEXT);
  const headlineText = isCamp
    ? `Help ${card.publicLabel} earn their spot.`
    : `Cover ${card.publicLabel}'s registration.`;
  const headlineLines = pdf.splitTextToSize(headlineText, PAGE_W - MARGIN_X * 2);
  pdf.text(headlineLines, PAGE_W / 2, cursorY, { align: "center" });
  cursorY += headlineLines.length * 0.42;

  // Subhead
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(...COLOR_MUTED);
  const subheadText = isCamp
    ? `Every dollar above ${goalText} earns ${card.publicLabel} bonus points toward winning the prize.`
    : `Help ${card.publicLabel} compete with the ${card.teamName} for the prize.`;
  const subheadLines = pdf.splitTextToSize(subheadText, PAGE_W - MARGIN_X * 2 - 0.4);
  pdf.text(subheadLines, PAGE_W / 2, cursorY + 0.14, { align: "center" });
  cursorY += subheadLines.length * 0.2 + 0.38;

  // -------- PLAYER INFO CARD --------
  const cardX = MARGIN_X;
  const cardW = PAGE_W - MARGIN_X * 2;
  const cardH = 1.6;
  pdf.setFillColor(...COLOR_CARD_BG);
  pdf.setDrawColor(...COLOR_BORDER);
  pdf.setLineWidth(0.012);
  pdf.roundedRect(cardX, cursorY, cardW, cardH, 0.15, 0.15, "FD");

  const cardPadX = 0.28;
  const labelX = cardX + cardPadX;
  const valueX = cardX + cardPadX + 0.85;
  let rowY = cursorY + 0.42;
  const rowGap = 0.27;

  // Team line uses em dash and middle dot — both Helvetica-safe
  const teamLine = [
    card.teamName,
    [card.teamSport, card.teamAgeGroup].filter(Boolean).join(" \u00B7 "),
  ]
    .filter(Boolean)
    .join(" \u2014 ");

  const infoRows: { label: string; value: string }[] = [
    { label: "PLAYER", value: card.publicLabel },
    { label: "TEAM", value: teamLine || "\u2014" },
    { label: "EVENT", value: ctx.eventName },
    { label: "DATES", value: formatDateRange(ctx.eventStartDate, ctx.eventEndDate) },
  ];

  for (const r of infoRows) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text(r.label, labelX, rowY);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(...COLOR_TEXT);
    const v = pdf.splitTextToSize(r.value, cardW - cardPadX * 2 - 1.95 - 0.3);
    pdf.text(v[0] || "", valueX, rowY);

    rowY += rowGap;
  }

  // Right side: BIG GOAL/FEE amount
  const amountX = cardX + cardW - cardPadX;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...COLOR_MUTED);
  pdf.text(
    isCamp ? "FUNDRAISING GOAL" : "REGISTRATION FEE",
    amountX,
    cursorY + cardH / 2 - 0.55,
    { align: "right" }
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(36);
  pdf.setTextColor(...COLOR_GOLD);
  pdf.text(goalText, amountX, cursorY + cardH / 2 + 0.05, { align: "right" });

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...COLOR_MUTED);
  pdf.text(
    isCamp ? "minimum to compete" : "covers their spot",
    amountX,
    cursorY + cardH / 2 + 0.3,
    { align: "right" }
  );

  cursorY += cardH + 0.36;

  // -------- "What is earn²keep?" PITCH --------
  // Heading: "What is " + brand mark + "?"
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...COLOR_TEXT);
  const labelPart = "What is ";
  pdf.text(labelPart, MARGIN_X, cursorY);
  const labelW = pdf.getTextWidth(labelPart);
  const brandW = drawBrandMark(pdf, MARGIN_X + labelW, cursorY, 13);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...COLOR_TEXT);
  pdf.text("?", MARGIN_X + labelW + brandW, cursorY);
  cursorY += 0.22;

  // Body of pitch — uses plain "earn2keep" since the heading above
  // already establishes the brand visually with the proper mark.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...COLOR_TEXT);
  const pitch = isCamp
    ? `earn2keep is a youth fundraising platform that lets kids EARN rewards instead of just collecting handouts. ${card.publicLabel} will train, record videos of their progress, and compete for prizes \u2014 every dollar of support fuels the work.`
    : `earn2keep is a youth fundraising platform that connects kids with sponsors who back their journey. ${card.publicLabel} will compete with the ${card.teamName}, train hard, and play for a real prize.`;
  const pitchLines = pdf.splitTextToSize(pitch, PAGE_W - MARGIN_X * 2);
  pdf.text(pitchLines, MARGIN_X, cursorY + 0.12);
  cursorY += pitchLines.length * 0.18 + 0.18;

  // Tagline
  pdf.setFont("helvetica", "bolditalic");
  pdf.setFontSize(12);
  pdf.setTextColor(...COLOR_BLUE);
  pdf.text(
    `Help ${card.publicLabel} earn it. Help them keep it.`,
    PAGE_W / 2,
    cursorY + 0.05,
    { align: "center" }
  );
  cursorY += 0.36;

  // -------- QR + CALL TO ACTION --------
  const qrCardY = cursorY;
  const qrCardH = 2.95;
  const qrCardW = PAGE_W - MARGIN_X * 2;
  const qrCardX = MARGIN_X;

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(...COLOR_BLUE);
  pdf.setLineWidth(0.025);
  pdf.roundedRect(qrCardX, qrCardY, qrCardW, qrCardH, 0.18, 0.18, "FD");

  // QR code on the left
  const qrSize = 2.45;
  const qrX = qrCardX + 0.3;
  const qrY = qrCardY + (qrCardH - qrSize) / 2;
  // 320px source rendered to 2.45" gives ~130 DPI — scans flawlessly,
  // keeps PDF tiny. 300 DPI here would balloon a 50-player PDF to 50+ MB.
  const qrPx = 320;

  const qrDataUrl = await QRCode.toDataURL(card.url, {
    width: qrPx,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0F172A", light: "#FFFFFF" },
  });
  pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // Right side: SCAN TO SUPPORT block
  const ctaX = qrX + qrSize + 0.35;
  const ctaW = qrCardX + qrCardW - ctaX - 0.3;
  let ctaY = qrCardY + 0.6;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...COLOR_BLUE);
  pdf.text("SCAN TO SUPPORT", ctaX, ctaY);
  ctaY += 0.36;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.setTextColor(...COLOR_TEXT);
  const nameUpper = card.publicLabel.toUpperCase();
  const nameLines = pdf.splitTextToSize(nameUpper, ctaW);
  pdf.text(nameLines, ctaX, ctaY);
  ctaY += nameLines.length * 0.36 + 0.15;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(...COLOR_TEXT);

  // Steps — using comma instead of arrow (arrow renders as garbage in Helvetica)
  // Strip trailing periods from publicLabel when used at sentence end to
  // avoid "Sarah J.." double-period bug.
  const labelMidSentence = card.publicLabel.replace(/\.+$/, "");
  const steps = [
    "Open your phone's camera.",
    "Point it at the code, tap the link.",
    `Choose any amount to back ${labelMidSentence}.`,
  ];
  for (let i = 0; i < steps.length; i++) {
    // Numbered blue circle
    pdf.setFillColor(...COLOR_BLUE);
    pdf.circle(ctaX + 0.07, ctaY - 0.06, 0.09, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(i + 1), ctaX + 0.07, ctaY - 0.035, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...COLOR_TEXT);
    pdf.text(steps[i], ctaX + 0.24, ctaY, { maxWidth: ctaW - 0.24 });
    ctaY += 0.27;
  }

  cursorY = qrCardY + qrCardH + 0.3;

  // -------- WHEN YOU SPONSOR ... --------
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...COLOR_TEXT);
  pdf.text(`When you sponsor ${card.publicLabel}:`, MARGIN_X, cursorY);
  cursorY += 0.22;

  const benefits = isCamp
    ? [
        `Watch ${card.publicLabel}'s training videos`,
        "Track their fundraising progress",
        "Get notified when they win",
        "Help fund a young athlete's growth",
      ]
    : [
        `See ${card.publicLabel} compete in real events`,
        "Track team standings & results",
        "Get notified when their team wins",
        "Help a kid play the sport they love",
      ];

  // Two columns of benefits with green dot bullets (drawn as filled circles
  // since the U+2713 check char doesn't render correctly in Helvetica)
  const colW = (PAGE_W - MARGIN_X * 2) / 2;
  for (let i = 0; i < benefits.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = MARGIN_X + col * colW;
    const by = cursorY + row * 0.24;

    // Filled green dot as bullet
    pdf.setFillColor(...COLOR_GREEN);
    pdf.circle(bx + 0.06, by - 0.05, 0.05, "F");

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...COLOR_TEXT);
    pdf.text(benefits[i], bx + 0.18, by, { maxWidth: colW - 0.3 });
  }
  cursorY += Math.ceil(benefits.length / 2) * 0.24 + 0.25;

  // -------- FOOTER --------
  const footerY = PAGE_H - 0.5;
  pdf.setDrawColor(...COLOR_BORDER);
  pdf.setLineWidth(0.012);
  pdf.line(MARGIN_X, footerY - 0.18, PAGE_W - MARGIN_X, footerY - 0.18);

  // earn²keep brand mark in the footer
  pdf.setTextColor(...COLOR_BLUE);
  const brandFooterW = drawBrandMark(pdf, MARGIN_X, footerY, 9);

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(...COLOR_MUTED);
  pdf.text("Earn it. Keep it.", MARGIN_X + brandFooterW + 0.1, footerY);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...COLOR_MUTED);
  const orgFooter =
    ctx.organizationName.length > 60
      ? ctx.organizationName.slice(0, 57) + "\u2026"
      : ctx.organizationName;
  pdf.text(orgFooter, PAGE_W - MARGIN_X, footerY, { align: "right" });
}

// ----- helpers -------------------------------------------------------

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDateRange(start: string, end: string): string {
  if (!start || !end) return "\u2014";
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth) {
    const monthShort = s.toLocaleDateString("en-US", { month: "short" });
    return `${monthShort} ${s.getDate()}\u2013${e.getDate()}, ${e.getFullYear()}`;
  }
  if (sameYear) {
    const sStr = s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const eStr = e.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${sStr} \u2013 ${eStr}`;
  }
  const sStr = s.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const eStr = e.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${sStr} \u2013 ${eStr}`;
}

function sanitizeFilename(s: string): string {
  return (
    s
      .replace(/[^a-z0-9 _-]+/gi, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "sponsor_flyers"
  );
}

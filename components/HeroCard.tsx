"use client";

import Link from "next/link";

interface HeroCardProps {
  /** First line of headline. Default: "You're making". */
  headlineLine1?: string;
  /** Lead text on the second line, before the highlighted word.
   *  Default: "a real". */
  headlineLine2Lead?: string;
  /** Highlighted word at the end of the headline (coral accent). Default: "impact." */
  highlightWord?: string;
  /** Subtitle below the headline. */
  subtitle: string;
  /** Progress percentage 0–100. Drives both the ring fill and the big number inside. */
  progressPct: number;
  progressLabel?: string;
  cta?: { label: string; href: string };
}

export default function HeroCard({
  headlineLine1 = "You're making",
  headlineLine2Lead = "a real",
  highlightWord = "impact.",
  subtitle,
  progressPct,
  progressLabel = "Avg. Goal Progress",
  cta,
}: HeroCardProps) {
  // Clamp + sanitize
  const pct = Math.max(0, Math.min(100, Math.round(progressPct)));
  // Ring math
  const r = 33;
  const circumference = 2 * Math.PI * r; // ~207.34
  const offset = circumference * (1 - pct / 100);

  return (
    <section className="e2k-hero" aria-label="Welcome">
      <div className="e2k-hero-bg" aria-hidden="true" />
      <div className="e2k-hero-grid">
        <div className="e2k-hero-text">
          <h1 className="e2k-hero-title">
            {headlineLine1}
            <br />{headlineLine2Lead} <span className="e2k-hero-highlight">{highlightWord}</span>
          </h1>
          <p className="e2k-hero-sub">{subtitle}</p>
          {cta && (
            <Link href={cta.href} className="e2k-btn-coral">
              <span className="e2k-btn-plus">+</span> {cta.label}
            </Link>
          )}
        </div>
        <div className="e2k-ring" role="img" aria-label={`${pct}% ${progressLabel}`}>
          <svg width="76" height="76" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={r} stroke="rgba(255,255,255,0.18)" strokeWidth="5" fill="none" />
            <circle
              cx="40"
              cy="40"
              r={r}
              stroke="#35d5df"
              strokeWidth="5"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div className="e2k-ring-content">
            <div className="e2k-ring-pct">{pct}%</div>
            <div className="e2k-ring-label">{progressLabel}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

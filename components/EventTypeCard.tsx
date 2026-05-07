"use client";

import Link from "next/link";

interface EventTypeCardProps {
  variant: "camp" | "tournament";
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  /** Optional inline SVG icon (use 22px). If omitted a default is used. */
  icon?: React.ReactNode;
}

const RunIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M4 22l5 -9" />
    <path d="M17 14l3 4l-2 4" />
    <path d="M14 18l-1 -4l-4 -3l3 -5l3 4l4 1" />
  </svg>
);

const TrophyIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 21l8 0" />
    <path d="M12 17l0 4" />
    <path d="M7 4l10 0" />
    <path d="M17 4v8a5 5 0 0 1 -10 0v-8" />
    <path d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
  </svg>
);

export default function EventTypeCard({
  variant,
  title,
  description,
  href,
  ctaLabel,
  icon,
}: EventTypeCardProps) {
  const fallbackIcon = variant === "camp" ? RunIcon : TrophyIcon;
  return (
    <div className={`e2k-type-card e2k-type-${variant}`}>
      <div className={`e2k-type-illus e2k-type-illus-${variant}`}>
        {icon || fallbackIcon}
      </div>
      <h3 className="e2k-type-name">{title}</h3>
      <p className="e2k-type-desc">{description}</p>
      <Link href={href} className={`e2k-type-btn e2k-type-btn-${variant}`}>
        {ctaLabel} →
      </Link>
    </div>
  );
}

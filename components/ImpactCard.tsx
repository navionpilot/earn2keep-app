"use client";

export default function ImpactCard() {
  return (
    <div className="e2k-impact-card">
      <div className="e2k-impact-icon">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8" />
          <path d="M3.6 15h16.8" />
          <path d="M11.5 3a17 17 0 0 0 0 18" />
          <path d="M12.5 3a17 17 0 0 1 0 18" />
        </svg>
      </div>
      <div className="e2k-impact-title">Your Impact</div>
      <p className="e2k-impact-desc">Lives changed. Communities strengthened.</p>
      <span className="e2k-impact-link">Learn more →</span>
    </div>
  );
}

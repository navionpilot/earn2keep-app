"use client";

import { useState } from "react";

interface SponsorComingSoonButtonProps {
  playerName: string;
}

export default function SponsorComingSoonButton({ playerName }: SponsorComingSoonButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sponsor-cta-wrap">
      <button
        type="button"
        className="sponsor-cta-btn"
        onClick={() => setOpen(true)}
        aria-label={`Sponsor ${playerName}`}
      >
        💚 Sponsor {playerName}
      </button>
      <p className="sponsor-cta-hint">Sponsor payments launching soon</p>

      {open && (
        <div className="sponsor-modal-overlay" onClick={() => setOpen(false)}>
          <div className="sponsor-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="sponsor-modal-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="sponsor-modal-eyebrow">★ COMING SOON ★</div>
            <h3 className="sponsor-modal-title">
              Sponsor payments are almost ready
            </h3>
            <p className="sponsor-modal-text">
              We're putting the finishing touches on secure payment processing.
              When it's live, you'll be able to back <strong>{playerName}</strong> with
              one tap, see their progress, and get notified when they hit their goal
              (or win the prize).
            </p>
            <p className="sponsor-modal-text">
              In the meantime, you can reach out to {playerName}'s coach or family
              directly to support them.
            </p>
            <button
              type="button"
              className="sponsor-modal-ok-btn"
              onClick={() => setOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

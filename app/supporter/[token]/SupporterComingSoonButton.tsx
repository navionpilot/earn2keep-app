"use client";

import { useState } from "react";

interface SupporterComingSoonButtonProps {
  playerName: string;
}

export default function SupporterComingSoonButton({ playerName }: SupporterComingSoonButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="supporter-cta-wrap">
      <button
        type="button"
        className="supporter-cta-btn"
        onClick={() => setOpen(true)}
        aria-label={`Supporter ${playerName}`}
      >
        💚 Supporter {playerName}
      </button>
      <p className="supporter-cta-hint">Supporter payments launching soon</p>

      {open && (
        <div className="supporter-modal-overlay" onClick={() => setOpen(false)}>
          <div className="supporter-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="supporter-modal-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="supporter-modal-eyebrow">★ COMING SOON ★</div>
            <h3 className="supporter-modal-title">
              Supporter payments are almost ready
            </h3>
            <p className="supporter-modal-text">
              We're putting the finishing touches on secure payment processing.
              When it's live, you'll be able to back <strong>{playerName}</strong> with
              one tap, see their progress, and get notified when they hit their goal
              (or win the prize).
            </p>
            <p className="supporter-modal-text">
              In the meantime, you can reach out to {playerName}'s coach or family
              directly to support them.
            </p>
            <button
              type="button"
              className="supporter-modal-ok-btn"
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

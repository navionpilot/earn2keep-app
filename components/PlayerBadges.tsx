// =============================================================================
// components/PlayerBadges.tsx — Badge row + grid (Slice 5.3.2)
// =============================================================================
// Two display modes via the `variant` prop:
//   - `compact` (default): horizontal scrollable row of EARNED badges only.
//     Used on the player home page below the stats grid. Keeps things
//     focused — no wall-of-locked-badges in the player's main view.
//   - `full`: 4-column grid showing BOTH earned and locked badges, with
//     locked ones visibly desaturated. Used on the profile page so
//     players see what's still to unlock — gentle nudge to keep going.
// =============================================================================

import type { BadgeDef } from "@/lib/badges";

interface Props {
  earned: BadgeDef[];
  locked?: BadgeDef[];        // only used in `full` variant
  variant?: "compact" | "full";
}

export default function PlayerBadges({
  earned,
  locked = [],
  variant = "compact",
}: Props) {
  // Compact mode — horizontal strip of earned badges only.
  if (variant === "compact") {
    if (earned.length === 0) {
      // Subtle "no badges yet" hint that nudges toward submitting.
      return (
        <div className="player-badges-empty">
          <span className="player-badges-empty-icon">🏅</span>
          <span className="player-badges-empty-text">
            Submit your first challenge to start earning badges.
          </span>
        </div>
      );
    }
    return (
      <div className="player-badges-strip">
        {earned.map((b) => (
          <BadgeChip key={b.id} badge={b} earned />
        ))}
      </div>
    );
  }

  // Full mode — earned + locked grid, with a small heading on each section.
  const total = earned.length + locked.length;
  return (
    <div className="player-badges-full">
      <div className="player-badges-full-head">
        <span className="player-badges-full-eyebrow">
          {earned.length} of {total} earned
        </span>
        <div className="player-badges-full-progressbar">
          <div
            className="player-badges-full-progressbar-fill"
            style={{ width: `${(earned.length / total) * 100}%` }}
          />
        </div>
      </div>

      {earned.length > 0 && (
        <>
          <h3 className="player-badges-full-section-head">
            Earned · {earned.length}
          </h3>
          <div className="player-badges-grid">
            {earned.map((b) => (
              <BadgeChip key={b.id} badge={b} earned variant="card" />
            ))}
          </div>
        </>
      )}

      {locked.length > 0 && (
        <>
          <h3 className="player-badges-full-section-head player-badges-full-section-locked">
            Locked · {locked.length}
          </h3>
          <div className="player-badges-grid">
            {locked.map((b) => (
              <BadgeChip key={b.id} badge={b} earned={false} variant="card" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// One badge — chip (compact strip) or card (full grid)
// -----------------------------------------------------------------------------
function BadgeChip({
  badge,
  earned,
  variant = "chip",
}: {
  badge: BadgeDef;
  earned: boolean;
  variant?: "chip" | "card";
}) {
  if (variant === "chip") {
    return (
      <div
        className={`player-badge-chip ${
          earned ? "player-badge-chip-earned" : "player-badge-chip-locked"
        }`}
        title={`${badge.name} — ${badge.description}`}
      >
        <span className="player-badge-chip-icon" aria-hidden="true">
          {badge.icon}
        </span>
        <span className="player-badge-chip-name">{badge.name}</span>
      </div>
    );
  }

  // Card variant (full grid)
  return (
    <div
      className={`player-badge-card ${
        earned ? "player-badge-card-earned" : "player-badge-card-locked"
      }`}
    >
      <div className="player-badge-card-icon" aria-hidden="true">
        {earned ? badge.icon : "🔒"}
      </div>
      <div className="player-badge-card-name">{badge.name}</div>
      <div className="player-badge-card-desc">{badge.description}</div>
    </div>
  );
}

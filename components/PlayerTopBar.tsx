"use client";

// =============================================================================
// components/PlayerTopBar.tsx — Player-facing header (Slice 5.7.1)
// =============================================================================
// Restyled in 5.7.1 to mirror the coach AppHeader pixel-for-pixel:
//   - "earn²keep" brand at 28px desktop / 24px mobile (was 20px)
//   - "EARN IT. KEEP IT." tagline below (was missing)
//   - Notification bell icon button (was missing — decorative for now,
//     wires up when notifications ship in 5.9)
//   - Circular avatar with the player's initials (was bare text)
//   - Same padding (18px 32px desktop / 14px 16px mobile)
//   - Same LogoutButton component used by coach side
//
// What stays player-specific:
//   - No mobile menu hamburger (players don't have a sidebar drawer)
//   - Optional "← Coach View" link for dual-role users
// =============================================================================

import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

interface Props {
  // The currently-logged-in player's first name. Drives the avatar
  // initials; also shown via title attribute on the avatar.
  displayName: string;
  // The player's last name (for the second initial). Optional.
  lastName?: string | null;
  // True when this auth user also owns at least one organization (i.e.,
  // they're a coach who's also linked to a player record). When true, we
  // surface a link back to the coach dashboard so they can switch views.
  isAlsoCoach?: boolean;
  // Optional unread count for the bell. Renders the small dot indicator
  // when > 0. Defaults to 0 / no dot.
  unreadCount?: number;
}

export default function PlayerTopBar({
  displayName,
  lastName,
  isAlsoCoach = false,
  unreadCount = 0,
}: Props) {
  // Build initials the same way AppHeader does — first letters of the
  // name parts, max 2.
  const fullName = `${displayName ?? ""} ${lastName ?? ""}`.trim();
  const initials =
    fullName
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <header className="e2k-header player-topbar-header">
      <div className="e2k-header-left">
        {/* Brand block — clickable, links back to /home (player home).
            Matches AppHeader's structure: name + sup + tagline. */}
        <Link href="/home" className="e2k-header-brand">
          <span className="e2k-header-brand-name">
            earn<sup className="e2k-header-brand-sup">2</sup>keep
          </span>
          <span className="e2k-header-brand-tag">EARN IT. KEEP IT.</span>
        </Link>
      </div>

      <div className="e2k-header-right">
        {/* Coach-View link kept for dual-role users; rendered before
            the bell so it reads "back to coach side" first. */}
        {isAlsoCoach && (
          <Link
            href="/dashboard"
            className="player-topbar-coach-link"
            title="Switch back to your coach/admin workspace"
          >
            ← Coach View
          </Link>
        )}

        {/* Notification bell — decorative for now. Wires up when
            push/in-app notifications ship in 5.9. */}
        <button
          type="button"
          className="e2k-header-icon-btn"
          aria-label={
            unreadCount > 0
              ? `${unreadCount} unread notifications`
              : "Notifications"
          }
        >
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
            <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
            <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
          </svg>
          {unreadCount > 0 && <span className="e2k-header-icon-dot" />}
        </button>

        <div className="e2k-header-avatar" title={fullName || displayName}>
          {initials}
        </div>

        <div className="e2k-header-logout">
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

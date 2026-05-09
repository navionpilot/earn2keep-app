// =============================================================================
// components/PlayerTopBar.tsx — Slim header for player-facing pages
// =============================================================================
// Players don't get the coach AppShell (which has Organizations/Teams/Events
// in its sidebar — none of which a player needs to see). Instead they get
// this minimal top bar: just the brand mark on the left and a logout button
// on the right.
//
// Slice 5.3.1: when the same auth user is BOTH a coach (owns orgs) and
// linked to a player record, we surface a "Coach Dashboard →" link in the
// top bar so they can switch back to the coach view. Pure players (no
// owned orgs) don't see this link.
//
// As we ship more player pages (recording flow in 5.4, leaderboard in 5.6,
// profile in 5.5), we'll extend this with a bottom-nav row on mobile.
// =============================================================================

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

interface Props {
  // The currently-logged-in player's first name. Shown on the right side
  // before the logout button so it doesn't feel anonymous.
  displayName: string;
  // True when this auth user also owns at least one organization (i.e.,
  // they're a coach who's also linked to a player record). When true, we
  // surface a link back to the coach dashboard so they can switch views.
  isAlsoCoach?: boolean;
}

export default function PlayerTopBar({ displayName, isAlsoCoach = false }: Props) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="player-topbar">
      <div className="player-topbar-inner">
        <div className="player-topbar-brand">
          <span className="player-topbar-brand-name">
            earn<sup className="player-topbar-brand-sup">2</sup>keep
          </span>
        </div>
        <div className="player-topbar-right">
          {isAlsoCoach && (
            <Link href="/dashboard" className="player-topbar-coach-link">
              Dashboard →
            </Link>
          )}
          {displayName && (
            <span className="player-topbar-greeting">{displayName}</span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="player-topbar-logout"
            aria-label="Log out"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

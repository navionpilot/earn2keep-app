// =============================================================================
// components/PlayerTopBar.tsx — Slim header for player-facing pages
// =============================================================================
// Players don't get the coach AppShell (which has Organizations/Teams/Events
// in its sidebar — none of which a player needs to see). Instead they get
// this minimal top bar: just the brand mark on the left and a logout button
// on the right.
//
// As we ship more player pages (recording flow in 5.4, leaderboard in 5.6,
// profile in 5.5), we'll extend this with a bottom-nav row on mobile —
// but for 5.3 there's only one player page, so navigation is just "home"
// and "log out."
// =============================================================================

"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

interface Props {
  // The currently-logged-in player's first name. Shown on the right side
  // before the logout button so it doesn't feel anonymous.
  displayName: string;
}

export default function PlayerTopBar({ displayName }: Props) {
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

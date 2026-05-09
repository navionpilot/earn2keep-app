// =============================================================================
// app/home/notifications/page.tsx — Notification center (Slice 5.9)
// =============================================================================
// Server component. Lists every notification for the current user
// (most-recent first) and hands the interactive bits (mark-as-read on
// click, mark-all-as-read button) to <NotificationListClient>.
//
// We don't paginate yet — even active players will rarely have more
// than a few dozen notifications. If the volume grows, swap to a
// LIMIT/cursor pattern.
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import PlayerTopBar from "@/components/PlayerTopBar";
import NotificationListClient, {
  type NotificationRow,
} from "@/components/NotificationListClient";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull the player record so the topbar avatar / dual-role link work.
  const { data: playerRow } = await supabase
    .from("players")
    .select("id, first_name, last_name, avatar_url")
    .eq("linked_user_id", user.id)
    .maybeSingle();

  // Coach-only users may visit this URL too — they just won't have a
  // player record. Fall through to dashboard rather than crashing.
  if (!playerRow) {
    redirect("/dashboard");
  }

  // Dual-role detection (same pattern as other /home pages).
  const { count: ownedOrgCount } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user.id);
  const isAlsoCoach = (ownedOrgCount ?? 0) > 0;

  // Pull notifications. RLS ensures we only see our own.
  const { data: rawRows } = await supabase
    .from("notifications")
    .select("id, kind, title, body, url, data, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (rawRows || []) as NotificationRow[];
  const unreadCount = rows.filter((n) => !n.read_at).length;

  return (
    <>
      <PlayerTopBar
        displayName={playerRow.first_name}
        lastName={playerRow.last_name}
        avatarUrl={playerRow.avatar_url ?? null}
        isAlsoCoach={isAlsoCoach}
        unreadCount={unreadCount}
      />
      <main className="player-home-wrap">
        <Link href="/home" className="recording-back">
          ← Back to home
        </Link>

        <div className="profile-header">
          <div className="profile-header-eyebrow">
            <span className="player-home-hero-prompt">&gt;</span> NOTIFICATIONS
          </div>
          <h1 className="profile-header-title">Your activity</h1>
          <p className="profile-header-sub">
            Coach reviews, approvals, and updates land here. We&apos;ll also
            email you (unless you turned that off in your{" "}
            <Link href="/home/profile" className="profile-section-help-link">
              profile settings
            </Link>
            ).
          </p>
        </div>

        <NotificationListClient initialRows={rows} />
      </main>
    </>
  );
}

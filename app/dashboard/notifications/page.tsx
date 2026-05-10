// =============================================================================
// app/dashboard/notifications/page.tsx — Coach notification center (Slice 7.1)
// =============================================================================
// Mirror of /home/notifications, but rendered inside the coach's AppShell
// (sidebar + topbar) instead of the PlayerTopBar. Reuses the existing
// NotificationListClient for the interactive bits (mark-as-read, mark-all,
// click-to-navigate). All RLS rules apply — we only see our own rows.
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";
import { getUnreadNotificationCount } from "@/lib/notifications";
import NotificationListClient, {
  type NotificationRow,
} from "@/components/NotificationListClient";

export default async function CoachNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull the coach's display name for AppShell.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  // Pull notifications (RLS scopes to the current user automatically).
  const { data: rawRows } = await supabase
    .from("notifications")
    .select("id, kind, title, body, url, data, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (rawRows || []) as NotificationRow[];
  const unreadCount = await getUnreadNotificationCount(supabase);

  return (
    <AppShell
      active="overview"
      userDisplayName={profile?.full_name?.trim() || ""}
      unreadCount={unreadCount}
    >
      <div className="form-page">
        <main className="form-page-main">
          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">
              Dashboard
            </Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">Notifications</span>
          </div>

          <div className="profile-header" style={{ marginBottom: 24 }}>
            <div className="profile-header-eyebrow">NOTIFICATIONS</div>
            <h1 className="profile-header-title">What&apos;s happening</h1>
            <p className="profile-header-sub">
              New submissions to review, sponsor pledges, and event updates
              show up here. Click any notification to jump to where it
              happened.
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔔</div>
              <div className="empty-state-title">No notifications yet</div>
              <div className="empty-state-text">
                When your players submit videos to review, you&apos;ll see
                them here. Send invites to your roster to get them started.
              </div>
            </div>
          ) : (
            <NotificationListClient initialRows={rows} />
          )}
        </main>
      </div>
    </AppShell>
  );
}

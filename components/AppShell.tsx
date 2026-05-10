"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import AppSidebar, { type NavKey } from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import { createClient } from "@/lib/supabase-browser";

interface AppShellProps {
  active: NavKey | "account";
  userDisplayName: string;
  unreadCount?: number;
  children: React.ReactNode;
}

export default function AppShell({
  active,
  userDisplayName,
  unreadCount,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Slice 7.1: auto-fetch unread count when caller didn't pass one. This lets
  // the bell badge work on every page using <AppShell> without having to
  // thread getUnreadNotificationCount through 29 different server pages.
  // Pages that already compute it (player /home, /home/profile) keep working
  // because we honor an explicitly-passed value over the auto-fetched one.
  const [autoCount, setAutoCount] = useState<number | null>(null);

  useEffect(() => {
    if (unreadCount !== undefined) return; // explicit value wins; skip fetch
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { count } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null);
        if (!cancelled) setAutoCount(count ?? 0);
      } catch {
        // Bell badge gracefully shows nothing on any error.
      }
    };
    void fetchCount();
    return () => {
      cancelled = true;
    };
  }, [unreadCount]);

  const resolvedUnreadCount =
    unreadCount !== undefined ? unreadCount : autoCount ?? 0;

  // Sidebar component expects NavKey only — coerce "account" since the
  // sidebar doesn't have an account row of its own (account lives in the
  // mobile bottom nav).
  const sidebarActive: NavKey =
    active === "account" ? "settings" : (active as NavKey);

  return (
    <div className="e2k-app">
      <AppHeader
        userDisplayName={userDisplayName}
        unreadCount={resolvedUnreadCount}
        onMobileMenuClick={() => setDrawerOpen((s) => !s)}
      />
      <div className="e2k-app-body">
        <AppSidebar
          active={sidebarActive}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
        <main className="e2k-app-main">{children}</main>
      </div>
      <MobileBottomNav active={active} />
    </div>
  );
}

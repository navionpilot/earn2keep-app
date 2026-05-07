"use client";

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import AppSidebar, { type NavKey } from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";

interface AppShellProps {
  active: NavKey | "account";
  userDisplayName: string;
  unreadCount?: number;
  children: React.ReactNode;
}

export default function AppShell({
  active,
  userDisplayName,
  unreadCount = 0,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sidebar component expects NavKey only — coerce "account" since the
  // sidebar doesn't have an account row of its own (account lives in the
  // mobile bottom nav).
  const sidebarActive: NavKey =
    active === "account" ? "settings" : (active as NavKey);

  return (
    <div className="e2k-app">
      <AppHeader
        userDisplayName={userDisplayName}
        unreadCount={unreadCount}
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

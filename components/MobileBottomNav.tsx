"use client";

import Link from "next/link";
import type { NavKey } from "@/components/AppSidebar";

interface MobileBottomNavProps {
  active: NavKey | "account";
}

const HomeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
    <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
  </svg>
);
const CalendarIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
    <path d="M16 3v4" />
    <path d="M8 3v4" />
    <path d="M4 11h16" />
  </svg>
);
const TeamsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 7a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    <path d="M3 21v-2a4 4 0 0 1 4 -4h2" />
    <path d="M16 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
  </svg>
);
const PlayersIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="7" r="4" />
    <path d="M5 21v-2a4 4 0 0 1 4 -4h6a4 4 0 0 1 4 4v2" />
  </svg>
);
const AccountIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="10" r="3" />
    <path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" />
  </svg>
);

export default function MobileBottomNav({ active }: MobileBottomNavProps) {
  const items: Array<{ key: NavKey | "account"; label: string; href: string; icon: React.ReactNode }> = [
    { key: "overview", label: "Home", href: "/dashboard", icon: HomeIcon },
    { key: "events", label: "Events", href: "/events", icon: CalendarIcon },
    { key: "teams", label: "Teams", href: "/teams", icon: TeamsIcon },
    { key: "participants", label: "Players", href: "/participants", icon: PlayersIcon },
    { key: "account", label: "Account", href: "/settings", icon: AccountIcon },
  ];
  return (
    <nav className="e2k-mobile-nav" aria-label="Bottom navigation">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`e2k-mb-item ${active === item.key ? "active" : ""}`}
        >
          <span className="e2k-mb-icon">{item.icon}</span>
          <span className="e2k-mb-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

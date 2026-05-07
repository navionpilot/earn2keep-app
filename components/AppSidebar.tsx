"use client";

import Link from "next/link";
import ImpactCard from "@/components/ImpactCard";

export type NavKey =
  | "overview"
  | "events"
  | "teams"
  | "participants"
  | "settings";

interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface AppSidebarProps {
  active: NavKey;
  open?: boolean; // mobile drawer open state
  onClose?: () => void;
}

// Outline icons inlined as SVG to avoid dependencies
const Icon = {
  Dashboard: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h6v6h-6z" />
      <path d="M14 4h6v6h-6z" />
      <path d="M4 14h6v6h-6z" />
      <path d="M14 14h6v6h-6z" />
    </svg>
  ),
  Calendar: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M4 11h16" />
    </svg>
  ),
  Users: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 7a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M3 21v-2a4 4 0 0 1 4 -4h2" />
      <path d="M16 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
      <path d="M3 21v-2a4 4 0 0 1 4 -4h2" />
    </svg>
  ),
  User: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" />
    </svg>
  ),
  Settings: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06 .06a2 2 0 0 1 0 2.83a2 2 0 0 1 -2.83 0l-.06-.06a1.65 1.65 0 0 0 -1.82 -.33a1.65 1.65 0 0 0 -1 1.51v.17a2 2 0 0 1 -2 2a2 2 0 0 1 -2 -2v-.09a1.65 1.65 0 0 0 -1.08 -1.51a1.65 1.65 0 0 0 -1.82 .33l-.06.06a2 2 0 0 1 -2.83 0a2 2 0 0 1 0 -2.83l.06-.06a1.65 1.65 0 0 0 .33 -1.82a1.65 1.65 0 0 0 -1.51 -1h-.17a2 2 0 0 1 -2 -2a2 2 0 0 1 2 -2h.09a1.65 1.65 0 0 0 1.51 -1.08a1.65 1.65 0 0 0 -.33 -1.82l-.06-.06a2 2 0 0 1 0 -2.83a2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82 .33h.01a1.65 1.65 0 0 0 1 -1.51v-.17a2 2 0 0 1 2 -2a2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82 -.33l.06-.06a2 2 0 0 1 2.83 0a2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0 -.33 1.82v.01a1.65 1.65 0 0 0 1.51 1h.17a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-.09a1.65 1.65 0 0 0 -1.51 1z" />
    </svg>
  ),
};

const items: NavItem[] = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: Icon.Dashboard },
  { key: "events", label: "Events", href: "/dashboard?view=events", icon: Icon.Calendar },
  { key: "teams", label: "Teams", href: "/dashboard?view=teams", icon: Icon.Users },
  { key: "participants", label: "Participants", href: "/dashboard?view=participants", icon: Icon.User },
  { key: "settings", label: "Settings", href: "/dashboard?view=settings", icon: Icon.Settings },
];

export default function AppSidebar({ active, open, onClose }: AppSidebarProps) {
  return (
    <>
      {open && (
        <div
          className="e2k-sidebar-backdrop"
          onClick={onClose}
          role="presentation"
        />
      )}
      <aside
        className={`e2k-sidebar ${open ? "e2k-sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <nav className="e2k-sidebar-nav">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`e2k-nav-item ${active === item.key ? "active" : ""}`}
              onClick={onClose}
            >
              <span className="e2k-nav-icon">{item.icon}</span>
              <span className="e2k-nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="e2k-sidebar-footer">
          <ImpactCard />
        </div>
      </aside>
    </>
  );
}

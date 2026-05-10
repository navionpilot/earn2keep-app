"use client";

import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

interface AppHeaderProps {
  userDisplayName: string;
  unreadCount?: number;
  onMobileMenuClick?: () => void;
}

export default function AppHeader({
  userDisplayName,
  unreadCount = 0,
  onMobileMenuClick,
}: AppHeaderProps) {
  const initials =
    userDisplayName
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <header className="e2k-header">
      <div className="e2k-header-left">
        {onMobileMenuClick && (
          <button
            type="button"
            className="e2k-header-menu-btn"
            onClick={onMobileMenuClick}
            aria-label="Open menu"
          >
            <span className="e2k-header-menu-bar" />
            <span className="e2k-header-menu-bar" />
            <span className="e2k-header-menu-bar" />
          </button>
        )}
        <Link href="/dashboard" className="e2k-header-brand">
          <span className="e2k-header-brand-name">
            earn<sup className="e2k-header-brand-sup">2</sup>keep
          </span>
          <span className="e2k-header-brand-tag">EARN IT. KEEP IT.</span>
        </Link>
      </div>

      <div className="e2k-header-right">
        <Link
          href="/dashboard/notifications"
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
        </Link>
        <div className="e2k-header-avatar" title={userDisplayName}>
          {initials}
        </div>
        <div className="e2k-header-logout">
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

"use client";

// =============================================================================
// components/NotificationListClient.tsx — Notification list interactions (5.9)
// =============================================================================
// Renders the list of notifications, marks one as read when clicked
// (optimistic UI), and offers a "Mark all as read" button. Updates
// flow back to the parent server component on the next navigation.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

interface Props {
  initialRows: NotificationRow[];
}

const ICONS: Record<string, string> = {
  submission_reviewed: "🎬",
  // Future kinds: "sponsorship_received", "milestone_unlocked", etc.
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.round(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NotificationListClient({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<NotificationRow[]>(initialRows);
  const [busy, setBusy] = useState(false);

  const unread = rows.filter((r) => !r.read_at);
  const hasUnread = unread.length > 0;

  const markRead = async (id: string) => {
    // Optimistic update — flip read_at locally before the server confirms.
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, read_at: r.read_at ?? new Date().toISOString() } : r
      )
    );
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
    // Refresh server-side counts (top bar bell etc.) on next navigation.
    router.refresh();
  };

  const markAllRead = async () => {
    if (busy || !hasUnread) return;
    setBusy(true);
    const ids = unread.map((r) => r.id);
    const now = new Date().toISOString();
    setRows((prev) =>
      prev.map((r) => (ids.includes(r.id) ? { ...r, read_at: now } : r))
    );
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .in("id", ids);
    setBusy(false);
    router.refresh();
  };

  if (rows.length === 0) {
    return (
      <div className="player-home-card notif-empty">
        <div className="notif-empty-icon">🔔</div>
        <div className="notif-empty-title">No notifications yet</div>
        <p className="notif-empty-text">
          You&apos;ll see updates here when your coach reviews a submission.
        </p>
      </div>
    );
  }

  return (
    <div className="notif-list">
      {hasUnread && (
        <div className="notif-list-actions">
          <span className="notif-list-unread-count">
            {unread.length} unread
          </span>
          <button
            type="button"
            className="notif-mark-all-btn"
            onClick={markAllRead}
            disabled={busy}
          >
            {busy ? "Marking…" : "Mark all as read"}
          </button>
        </div>
      )}

      <ul className="notif-items">
        {rows.map((n) => {
          const icon = ICONS[n.kind] ?? "🔔";
          const isUnread = !n.read_at;
          const Inner = (
            <div className={`notif-item ${isUnread ? "notif-item-unread" : ""}`}>
              <div className="notif-item-icon" aria-hidden="true">
                {icon}
              </div>
              <div className="notif-item-body">
                <div className="notif-item-title">
                  {n.title}
                  {isUnread && <span className="notif-item-dot" aria-label="unread" />}
                </div>
                {n.body && <div className="notif-item-text">{n.body}</div>}
                <div className="notif-item-time">{relativeTime(n.created_at)}</div>
              </div>
            </div>
          );
          if (n.url) {
            return (
              <li key={n.id}>
                <Link
                  href={n.url}
                  className="notif-item-link"
                  onClick={() => isUnread && void markRead(n.id)}
                >
                  {Inner}
                </Link>
              </li>
            );
          }
          return (
            <li key={n.id}>
              <button
                type="button"
                className="notif-item-link notif-item-link-button"
                onClick={() => isUnread && void markRead(n.id)}
              >
                {Inner}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

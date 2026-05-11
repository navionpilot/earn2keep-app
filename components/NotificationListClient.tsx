"use client";

// =============================================================================
// components/NotificationListClient.tsx — Notification list interactions (8.5)
// =============================================================================
// Renders the list of notifications and handles all interactive bits:
//   • Click a notification to follow its link (and mark as read)
//   • "Mark all as read" — bulk-marks every unread one
//   • Slice 8.5: per-notification "✕" delete button (small, top-right corner)
//   • Slice 8.5: "Clear read" — deletes all already-read notifications in
//     one click, with a confirmation. Doesn't touch unread.
//
// Used by BOTH the coach (/dashboard/notifications) and player
// (/home/notifications) pages. The same component renders both views.
//
// All mutations are optimistic — local state updates immediately, then
// the Supabase call runs in the background. On failure, the UI doesn't
// roll back (worst case: user refreshes and sees the row reappear).
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
  submission_created: "📝", // Slice 7.1 — coach-side notification
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
  const read = rows.filter((r) => r.read_at);
  const hasUnread = unread.length > 0;
  const hasRead = read.length > 0;

  const markRead = async (id: string) => {
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

  // Slice 8.5 — delete a single notification.
  // Optimistic: removes from local state before server confirms. No
  // confirmation dialog — small action, easy to recover from (the
  // underlying event isn't deleted, just the notification row).
  const deleteOne = async (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
    router.refresh();
  };

  // Slice 8.5 — delete every already-read notification. Doesn't touch
  // unread ones (those are presumed important — you haven't seen them
  // yet). Confirms first because it's a bulk action.
  const clearAllRead = async () => {
    if (busy || !hasRead) return;
    const count = read.length;
    const ok = window.confirm(
      `Delete ${count} read notification${count === 1 ? "" : "s"}? Unread ones will stay.`
    );
    if (!ok) return;
    setBusy(true);
    const ids = read.map((r) => r.id);
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    const supabase = createClient();
    await supabase.from("notifications").delete().in("id", ids);
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
      {(hasUnread || hasRead) && (
        <div className="notif-list-actions">
          {hasUnread && (
            <span className="notif-list-unread-count">
              {unread.length} unread
            </span>
          )}
          <div className="notif-list-actions-buttons">
            {hasUnread && (
              <button
                type="button"
                className="notif-mark-all-btn"
                onClick={markAllRead}
                disabled={busy}
              >
                {busy ? "Working…" : "Mark all as read"}
              </button>
            )}
            {hasRead && (
              <button
                type="button"
                className="notif-clear-read-btn"
                onClick={clearAllRead}
                disabled={busy}
              >
                Clear read ({read.length})
              </button>
            )}
          </div>
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
          return (
            <li key={n.id} className="notif-item-wrap">
              {n.url ? (
                <Link
                  href={n.url}
                  className="notif-item-link"
                  onClick={() => isUnread && void markRead(n.id)}
                >
                  {Inner}
                </Link>
              ) : (
                <button
                  type="button"
                  className="notif-item-link notif-item-link-button"
                  onClick={() => isUnread && void markRead(n.id)}
                >
                  {Inner}
                </button>
              )}
              {/* Slice 8.5 — delete button. Positioned absolutely in the
                  top-right corner so it sits inside the card visually
                  but is a sibling of the <Link>/<button> at the DOM level
                  (HTML doesn't allow nested interactive elements). */}
              <button
                type="button"
                className="notif-delete-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void deleteOne(n.id);
                }}
                aria-label="Delete notification"
                title="Delete"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

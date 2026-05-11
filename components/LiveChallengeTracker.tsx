"use client";

// =============================================================================
// components/LiveChallengeTracker.tsx — Slice 8.9
// =============================================================================
// Replaces the static "Your Impact" placeholder in the coach sidebar with a
// rotating live activity feed:
//   "Blake H on Rush United just completed Push-Ups!"
//   "Sarah M on Eagles crushed Plank Hold!"
//
// Behavior:
//   • Fetches the 20 most recent non-rejected submissions across the coach's
//     orgs (RLS automatically scopes this — coaches only see their own data)
//   • Re-fetches every 30 seconds so new submissions trickle in without
//     requiring a page refresh
//   • Rotates through the items every 5 seconds with a fade-in animation
//   • Picks a verb at fetch-time so the same item always reads the same way
//     (no flicker between "completed" and "crushed" on the same row)
//
// Empty state: "Your players' wins will show up here as they happen."
// Loading state: same shell, "Loading…" text.
// =============================================================================

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface ActivityItem {
  id: string;
  playerName: string;     // "Blake H"
  teamName: string;       // "Rush United"
  challengeName: string;  // "Push-Ups"
  verb: string;           // pre-picked at fetch time so it stays stable
}

const APPROVED_VERBS = ["crushed", "completed", "nailed", "knocked out"];
const PENDING_VERBS = ["just submitted", "is tackling", "hit submit on"];

function pickVerb(status: string): string {
  const list = status === "approved" ? APPROVED_VERBS : PENDING_VERBS;
  return list[Math.floor(Math.random() * list.length)];
}

export default function LiveChallengeTracker() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Initial fetch + 30-second polling
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const fetchActivity = async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select(
          `id, status, submitted_at,
           players(first_name, last_name, teams(name)),
           event_challenges(challenges(name))`
        )
        .in("status", ["pending", "approved"])
        .order("submitted_at", { ascending: false })
        .limit(20);

      if (cancelled) return;
      if (error || !data) {
        setLoading(false);
        return;
      }

      const mapped: ActivityItem[] = data.map((s: any) => {
        const first = s.players?.first_name?.trim() || "Someone";
        const last = s.players?.last_name?.trim() || "";
        const initial = last ? ` ${last.charAt(0).toUpperCase()}.` : "";
        return {
          id: s.id,
          playerName: `${first}${initial}`,
          teamName: s.players?.teams?.name || "their team",
          challengeName: s.event_challenges?.challenges?.name || "a challenge",
          verb: pickVerb(s.status),
        };
      });

      setItems(mapped);
      // Keep the current index valid if the list shrinks (e.g. submissions deleted)
      setCurrentIndex((i) => (mapped.length === 0 ? 0 : i % mapped.length));
      setLoading(false);
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Rotate display every 5 seconds (only if we have more than one item)
  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % items.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [items.length]);

  // Common shell for all states so the sidebar layout doesn't jump
  const shell = (children: React.ReactNode) => (
    <div className="e2k-impact-card e2k-live-tracker">
      <div className="e2k-live-tracker-title">
        <span className="e2k-live-dot" aria-hidden="true" />
        LIVE ACTIVITY
      </div>
      {children}
    </div>
  );

  if (loading) {
    return shell(
      <p className="e2k-live-tracker-message e2k-live-tracker-message-muted">
        Watching for activity…
      </p>
    );
  }

  if (items.length === 0) {
    return shell(
      <p className="e2k-live-tracker-message e2k-live-tracker-message-muted">
        Your players&apos; wins will show up here as they happen.
      </p>
    );
  }

  const item = items[currentIndex];

  return shell(
    // Keyed by item.id so React unmounts/remounts the element and the
    // CSS fade-in animation replays for each rotation
    <p
      key={item.id}
      className="e2k-live-tracker-message"
      aria-live="polite"
    >
      <strong>{item.playerName}</strong> on{" "}
      <strong>{item.teamName}</strong> {item.verb}{" "}
      <strong>{item.challengeName}</strong>!
    </p>
  );
}

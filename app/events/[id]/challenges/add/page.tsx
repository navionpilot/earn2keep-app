"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// This route used to be the per-challenge picker page (Slice 4.5).
// In Slice 4.5.1 it was replaced by the calendar-based Schedule Planner at /events/[id]/schedule.
// This file just redirects users (and any old bookmarks/links) to the new planner.
export default function LegacyAddChallengesRedirect() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  useEffect(() => {
    router.replace(`/events/${eventId}/schedule`);
  }, [eventId, router]);

  return (
    <div className="form-page">
      <main className="form-page-main">
        <div className="form-card">
          <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
            Redirecting to the Schedule Planner...
          </p>
        </div>
      </main>
    </div>
  );
}

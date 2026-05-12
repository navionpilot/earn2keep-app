"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

interface EventStatusButtonProps {
  eventId: string;
  currentStatus: "draft" | "active" | "completed" | null;
}

// Possible inline confirm dialogs. Tracked as a single union so only one is
// open at a time and we can branch the JSX cleanly.
type ConfirmKind = null | "activate" | "complete" | "pause";

export default function EventStatusButton({ eventId, currentStatus }: EventStatusButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const router = useRouter();

  // Generic status setter. We allow "draft" too because the Pause button
  // reverts an active event back to draft (no separate "paused" status —
  // simpler, and draft already handles the "not visible to supporters" semantics).
  const handleStatusChange = async (newStatus: "draft" | "active" | "completed") => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("events")
      .update({ status: newStatus })
      .eq("id", eventId);

    if (error) {
      alert(`Error: ${error.message}`);
      setLoading(false);
      return;
    }

    setConfirm(null);
    router.refresh();
    setLoading(false);
  };

  // ----- Draft (or unset) -> show "Activate Event" --------------------
  if (currentStatus === "draft" || !currentStatus) {
    if (confirm === "activate") {
      return (
        <div className="status-confirm-inline">
          <span className="status-confirm-text">Activate this event?</span>
          <button
            type="button"
            className="btn-cancel"
            onClick={() => setConfirm(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary btn-inline"
            onClick={() => handleStatusChange("active")}
            disabled={loading}
          >
            {loading ? "..." : "Yes, Activate"}
          </button>
        </div>
      );
    }
    return (
      <Tooltip text="Activate this event so it's running and ready for supporters. You can still edit details.">
        <button
          type="button"
          className="btn-activate"
          onClick={() => setConfirm("activate")}
        >
          ▶ Activate Event
        </button>
      </Tooltip>
    );
  }

  // ----- Active -> show "Mark Complete" + "Pause" --------------------
  if (currentStatus === "active") {
    if (confirm === "complete") {
      return (
        <div className="status-confirm-inline">
          <span className="status-confirm-text">Mark complete?</span>
          <button
            type="button"
            className="btn-cancel"
            onClick={() => setConfirm(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary btn-inline"
            onClick={() => handleStatusChange("completed")}
            disabled={loading}
          >
            {loading ? "..." : "Yes"}
          </button>
        </div>
      );
    }

    if (confirm === "pause") {
      return (
        <div className="status-confirm-inline">
          <span className="status-confirm-text">
            Pause this event? It will revert to Draft and stop being visible
            to supporters. You can re-activate any time.
          </span>
          <button
            type="button"
            className="btn-cancel"
            onClick={() => setConfirm(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary btn-inline"
            onClick={() => handleStatusChange("draft")}
            disabled={loading}
          >
            {loading ? "..." : "Yes, Pause"}
          </button>
        </div>
      );
    }

    // Default state: show both action buttons inline. Mark Complete is the
    // happy-path primary; Pause is a softer secondary for "I need to stop
    // this for now."
    return (
      <>
        <Tooltip text="Mark this event as completed when the season ends.">
          <button
            type="button"
            className="btn-complete"
            onClick={() => setConfirm("complete")}
          >
            ✓ Mark Complete
          </button>
        </Tooltip>
        <Tooltip text="Pause the event and revert it to Draft. Useful if you need to stop registration temporarily — you can re-activate any time.">
          <button
            type="button"
            className="btn-pause"
            onClick={() => setConfirm("pause")}
          >
            ⏸ Pause Event
          </button>
        </Tooltip>
      </>
    );
  }

  // Completed — no action button (event is final state).
  return null;
}

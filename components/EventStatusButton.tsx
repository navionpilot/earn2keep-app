"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

interface EventStatusButtonProps {
  eventId: string;
  currentStatus: "draft" | "active" | "completed" | null;
}

export default function EventStatusButton({ eventId, currentStatus }: EventStatusButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const handleStatusChange = async (newStatus: "active" | "completed") => {
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

    setConfirming(false);
    router.refresh();
    setLoading(false);
  };

  if (currentStatus === "draft" || !currentStatus) {
    if (confirming) {
      return (
        <div className="status-confirm-inline">
          <span className="status-confirm-text">Activate this event?</span>
          <button
            type="button"
            className="btn-cancel"
            onClick={() => setConfirming(false)}
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
      <Tooltip text="Activate this event so it's running and ready for sponsors. You can still edit details.">
        <button
          type="button"
          className="btn-activate"
          onClick={() => setConfirming(true)}
        >
          ▶ Activate Event
        </button>
      </Tooltip>
    );
  }

  if (currentStatus === "active") {
    if (confirming) {
      return (
        <div className="status-confirm-inline">
          <span className="status-confirm-text">Mark complete?</span>
          <button
            type="button"
            className="btn-cancel"
            onClick={() => setConfirming(false)}
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
    return (
      <Tooltip text="Mark this event as completed when the season ends.">
        <button
          type="button"
          className="btn-complete"
          onClick={() => setConfirming(true)}
        >
          ✓ Mark Complete
        </button>
      </Tooltip>
    );
  }

  // Completed - no action button
  return null;
}

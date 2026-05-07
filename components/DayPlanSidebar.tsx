"use client";

import { useState } from "react";

export type AssignedChallenge = {
  id: string; // event_challenges.id
  challengeId: string;
  name: string;
  category: string;
  unit: string | null;
  repTarget: number | null;
};

interface DayPlanSidebarProps {
  selectedDate: string;       // YYYY-MM-DD
  dayIndex: number;            // 0-based day number within event
  totalDays: number;           // event duration in days
  challenges: AssignedChallenge[];
  onAddChallenge: () => void;       // opens library modal
  onRemoveChallenge: (id: string) => void;
  onUpdateRepTarget: (id: string, newTarget: number) => void;
  onMarkAsRestDay: () => void;       // clears all challenges for this day
}

const CATEGORY_COLORS: Record<string, string> = {
  Sports: "#2563EB",
  Faith: "#7C3AED",
  Scouts: "#10B981",
  Fitness: "#F59E0B",
  Academic: "#6366F1",
  Service: "#EC4899",
};

const formatLongDate = (date: string): string => {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

export default function DayPlanSidebar({
  selectedDate,
  dayIndex,
  totalDays,
  challenges,
  onAddChallenge,
  onRemoveChallenge,
  onUpdateRepTarget,
  onMarkAsRestDay,
}: DayPlanSidebarProps) {
  const [confirmingRest, setConfirmingRest] = useState(false);

  const totalReps = challenges.reduce((sum, c) => sum + (c.repTarget || 0), 0);

  return (
    <div className="day-sidebar">
      <div className="day-sidebar-header">
        <div className="day-sidebar-eyebrow">
          Day {dayIndex + 1} of {totalDays}
        </div>
        <h3 className="day-sidebar-title">{formatLongDate(selectedDate)}</h3>
        <p className="day-sidebar-summary">
          {challenges.length === 0
            ? "Rest day — no challenges scheduled"
            : `${challenges.length} challenge${challenges.length === 1 ? "" : "s"} · ${totalReps.toLocaleString()} total reps`}
        </p>
      </div>

      {challenges.length > 0 && (
        <div className="day-sidebar-list">
          {challenges.map((c) => (
            <div key={c.id} className="day-challenge-row">
              <span
                className="day-challenge-dot"
                style={{ background: CATEGORY_COLORS[c.category] || "#6B7280" }}
              />
              <div className="day-challenge-info">
                <div className="day-challenge-name">{c.name}</div>
                <div className="day-challenge-target">
                  <input
                    type="number"
                    min="1"
                    className="day-challenge-target-input"
                    value={c.repTarget || ""}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        onUpdateRepTarget(c.id, val);
                      }
                    }}
                  />
                  <span className="day-challenge-unit">{c.unit || "reps"}</span>
                </div>
              </div>
              <button
                type="button"
                className="day-challenge-remove"
                onClick={() => onRemoveChallenge(c.id)}
                aria-label="Remove challenge"
                title="Remove from this day"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="day-add-challenge-btn"
        onClick={onAddChallenge}
      >
        + Add a challenge to this day
      </button>

      <div className="day-quick-actions">
        <div className="day-quick-actions-label">Quick Actions</div>

        {challenges.length > 0 && (
          confirmingRest ? (
            <div className="day-confirm-inline">
              <span>Clear all challenges?</span>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setConfirmingRest(false)}
              >
                No
              </button>
              <button
                type="button"
                className="btn-danger-confirm"
                onClick={() => {
                  onMarkAsRestDay();
                  setConfirmingRest(false);
                }}
              >
                Yes, clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="day-quick-action"
              onClick={() => setConfirmingRest(true)}
            >
              🛌 Mark as rest day
            </button>
          )
        )}

        <p className="day-quick-actions-hint">
          More actions like "Apply this day to other days" and "Repeat weekly pattern" coming next.
        </p>
      </div>
    </div>
  );
}

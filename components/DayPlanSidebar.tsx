"use client";

import { useState } from "react";
import { RECORDING_TEMPLATES } from "@/lib/recordingRecommender";

export type AssignedChallenge = {
  id: string; // event_challenges.id
  challengeId: string;
  name: string;
  category: string;
  unit: string | null;
  repTarget: number | null;
  // New fields for expandable details
  description?: string | null;
  difficulty?: string | null;
  setupTemplateKey?: string | null;
  recordingInstructions?: string | null;
  verificationMode?: string | null;
  subcategoryPath?: string | null; // e.g., "Soccer › Ball Control"
  // Slice 4.5.4 — Reference photo
  referencePhotoUrl?: string | null;
  referencePhotoCaption?: string | null;
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
  onApplyToOtherDays: () => void;    // opens "apply to days" modal
  onRepeatWeekly: () => void;        // copies the current week's pattern across all remaining weeks
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
  onApplyToOtherDays,
  onRepeatWeekly,
}: DayPlanSidebarProps) {
  const [confirmingRest, setConfirmingRest] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const verificationLabel = (mode?: string | null): string => {
    switch (mode) {
      case "ai_only": return "🤖 AI verification only";
      case "coach_only": return "👤 Coach manual review";
      case "ai_and_coach": return "🤖 + 👤 AI suggests, coach confirms";
      default: return "👤 Coach manual review";
    }
  };

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
          {challenges.map((c) => {
            const isExpanded = expandedIds.has(c.id);
            const recordingTemplate = c.setupTemplateKey ? RECORDING_TEMPLATES[c.setupTemplateKey] : null;
            return (
              <div key={c.id} className={`day-challenge-row ${isExpanded ? "day-challenge-row-expanded" : ""}`}>
                <div className="day-challenge-row-main">
                  <span
                    className="day-challenge-dot"
                    style={{ background: CATEGORY_COLORS[c.category] || "#6B7280" }}
                  />
                  <div className="day-challenge-info">
                    <button
                      type="button"
                      className="day-challenge-name day-challenge-name-clickable"
                      onClick={() => toggleExpanded(c.id)}
                      title={isExpanded ? "Collapse details" : "View details"}
                    >
                      {c.name}
                      {recordingTemplate && (
                        <span className="day-challenge-rec-icon" title={`Recording: ${recordingTemplate.label}`}>
                          {recordingTemplate.icon}
                        </span>
                      )}
                      {c.referencePhotoUrl && (
                        <span className="day-challenge-photo-icon" title="Has a reference photo">
                          🖼
                        </span>
                      )}
                      <span className="day-challenge-expand-arrow">{isExpanded ? "▾" : "▸"}</span>
                    </button>
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

                {isExpanded && (
                  <div className="day-challenge-details">
                    {c.subcategoryPath && (
                      <div className="day-challenge-detail-row">
                        <span className="day-challenge-detail-label">Filed under:</span>
                        <span className="day-challenge-detail-value">
                          {c.category} › {c.subcategoryPath}
                        </span>
                      </div>
                    )}
                    {c.difficulty && (
                      <div className="day-challenge-detail-row">
                        <span className="day-challenge-detail-label">Difficulty:</span>
                        <span className={`challenge-diff-pill diff-${c.difficulty.toLowerCase()}`}>
                          {c.difficulty}
                        </span>
                      </div>
                    )}
                    {c.referencePhotoUrl && (
                      <div className="day-challenge-detail-block">
                        <div className="day-challenge-detail-label">🖼 Reference photo</div>
                        <div className="day-challenge-photo-wrap">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={c.referencePhotoUrl}
                            alt={c.referencePhotoCaption || c.name}
                            className="day-challenge-photo-img"
                          />
                          {c.referencePhotoCaption && (
                            <p className="day-challenge-photo-caption">
                              {c.referencePhotoCaption}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {c.description && (
                      <div className="day-challenge-detail-block">
                        <div className="day-challenge-detail-label">Description</div>
                        <p className="day-challenge-detail-text">{c.description}</p>
                      </div>
                    )}
                    {recordingTemplate && (
                      <div className="day-challenge-detail-block">
                        <div className="day-challenge-detail-label">
                          {recordingTemplate.icon} Recording setup: {recordingTemplate.label}
                        </div>
                        {c.recordingInstructions ? (
                          <div className="day-challenge-detail-text day-challenge-rec-text">
                            {c.recordingInstructions.split("\n\n").map((para, i) => (
                              <p key={i}>{para}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="day-challenge-detail-text day-challenge-rec-text">
                            {recordingTemplate.shortDescription}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="day-challenge-detail-row">
                      <span className="day-challenge-detail-label">Verification:</span>
                      <span className="day-challenge-detail-value">
                        {verificationLabel(c.verificationMode)}
                      </span>
                    </div>
                    {/* Slice 5.7: explicit Minimize button at the bottom of
                        the expanded details so the user can clearly
                        collapse without hunting for the small ▾ arrow. */}
                    <button
                      type="button"
                      className="day-challenge-minimize-btn"
                      onClick={() => toggleExpanded(c.id)}
                    >
                      ▴ Minimize details
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
          <>
            <button
              type="button"
              className="day-quick-action"
              onClick={onApplyToOtherDays}
            >
              📋 Apply this day to other days
            </button>
            <button
              type="button"
              className="day-quick-action"
              onClick={onRepeatWeekly}
              title="Copy this week's plan to all remaining weeks of the event"
            >
              🔁 Repeat this week's pattern
            </button>
          </>
        )}

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
              className="day-quick-action day-quick-action-danger"
              onClick={() => setConfirmingRest(true)}
            >
              🛌 Mark as rest day
            </button>
          )
        )}

        {challenges.length === 0 && (
          <p className="day-quick-actions-hint">
            Add a challenge above to unlock quick actions like copying this day's plan to other days.
          </p>
        )}
      </div>
    </div>
  );
}

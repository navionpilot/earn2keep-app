"use client";

import { useState, useMemo } from "react";

interface ApplyToDaysModalProps {
  open: boolean;
  onClose: () => void;
  eventStartDate: string;
  eventEndDate: string;
  sourceDate: string; // YYYY-MM-DD - the day being copied FROM
  sourceChallengeCount: number;
  // List of dates that already have challenges scheduled (so we can warn)
  daysWithContent: Set<string>;
  // Apply handler — receives target dates (excluding source) and a "replace existing" flag
  onApply: (targetDates: string[], replaceExisting: boolean) => Promise<void>;
}

const dateToYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatShort = (date: string): string => {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const formatVeryShort = (date: string): string => {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const dayOfWeekShort = (date: string): string => {
  const d = new Date(date + "T12:00:00");
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
};

export default function ApplyToDaysModal({
  open,
  onClose,
  eventStartDate,
  eventEndDate,
  sourceDate,
  sourceChallengeCount,
  daysWithContent,
  onApply,
}: ApplyToDaysModalProps) {
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All dates in event window (excluding source date)
  const allDates = useMemo(() => {
    const dates: string[] = [];
    const start = new Date(eventStartDate + "T12:00:00");
    const end = new Date(eventEndDate + "T12:00:00");
    const cursor = new Date(start);
    while (cursor <= end) {
      const ymd = dateToYMD(cursor);
      if (ymd !== sourceDate) dates.push(ymd);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }, [eventStartDate, eventEndDate, sourceDate]);

  if (!open) return null;

  const sourceDay = new Date(sourceDate + "T12:00:00");
  const sourceDayOfWeek = sourceDay.getDay(); // 0-6

  const toggleDate = (date: string) => {
    const next = new Set(selectedDates);
    if (next.has(date)) {
      next.delete(date);
    } else {
      next.add(date);
    }
    setSelectedDates(next);
  };

  // Shortcut helpers
  const applyShortcut = (predicate: (date: string) => boolean) => {
    const matching = allDates.filter(predicate);
    setSelectedDates(new Set(matching));
  };

  const clearAll = () => setSelectedDates(new Set());

  const selectAll = () => setSelectedDates(new Set(allDates));

  const selectAllWeekdays = () =>
    applyShortcut((d) => {
      const dow = new Date(d + "T12:00:00").getDay();
      return dow >= 1 && dow <= 5;
    });

  const selectAllWeekends = () =>
    applyShortcut((d) => {
      const dow = new Date(d + "T12:00:00").getDay();
      return dow === 0 || dow === 6;
    });

  const selectAllSameWeekday = () =>
    applyShortcut((d) => new Date(d + "T12:00:00").getDay() === sourceDayOfWeek);

  const selectMonWedFri = () =>
    applyShortcut((d) => {
      const dow = new Date(d + "T12:00:00").getDay();
      return dow === 1 || dow === 3 || dow === 5;
    });

  const selectTueThu = () =>
    applyShortcut((d) => {
      const dow = new Date(d + "T12:00:00").getDay();
      return dow === 2 || dow === 4;
    });

  const handleApply = async () => {
    setError(null);
    if (selectedDates.size === 0) {
      setError("Pick at least one day to apply this plan to.");
      return;
    }
    setApplying(true);
    try {
      await onApply(Array.from(selectedDates), replaceExisting);
      // Modal will be closed by parent on success
      setSelectedDates(new Set());
      setReplaceExisting(false);
    } catch (e: any) {
      setError(e.message || "Failed to apply plan.");
    } finally {
      setApplying(false);
    }
  };

  // Count how many of the selected dates already have content
  const conflictCount = Array.from(selectedDates).filter((d) => daysWithContent.has(d)).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">★ Copy Day Plan ★</div>
            <h2 className="modal-title">Apply {formatShort(sourceDate)}'s plan to other days</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <p className="apply-modal-summary">
            <strong>{sourceChallengeCount}</strong> challenge{sourceChallengeCount === 1 ? "" : "s"} from{" "}
            <strong>{formatShort(sourceDate)}</strong> will be copied to the days you pick below.
            Each copied challenge keeps its rep target.
          </p>

          <div className="apply-shortcuts">
            <div className="apply-shortcuts-label">Quick picks:</div>
            <div className="apply-shortcuts-row">
              <button type="button" className="apply-shortcut-btn" onClick={selectAll}>All days</button>
              <button type="button" className="apply-shortcut-btn" onClick={selectAllWeekdays}>Weekdays only</button>
              <button type="button" className="apply-shortcut-btn" onClick={selectAllWeekends}>Weekends only</button>
              <button type="button" className="apply-shortcut-btn" onClick={selectMonWedFri}>Mon/Wed/Fri</button>
              <button type="button" className="apply-shortcut-btn" onClick={selectTueThu}>Tue/Thu</button>
              <button type="button" className="apply-shortcut-btn" onClick={selectAllSameWeekday}>
                Every {dayOfWeekShort(sourceDate)}
              </button>
              <button type="button" className="apply-shortcut-btn apply-shortcut-btn-clear" onClick={clearAll}>Clear</button>
            </div>
          </div>

          <div className="apply-day-grid">
            {allDates.map((date) => {
              const isSelected = selectedDates.has(date);
              const hasContent = daysWithContent.has(date);
              return (
                <button
                  key={date}
                  type="button"
                  className={`apply-day-cell ${isSelected ? "apply-day-cell-selected" : ""} ${hasContent ? "apply-day-cell-has-content" : ""}`}
                  onClick={() => toggleDate(date)}
                >
                  <span className="apply-day-cell-dow">{dayOfWeekShort(date)}</span>
                  <span className="apply-day-cell-date">{formatVeryShort(date)}</span>
                  {hasContent && !isSelected && (
                    <span className="apply-day-cell-marker" title="Already has challenges">●</span>
                  )}
                  {isSelected && <span className="apply-day-cell-check">✓</span>}
                </button>
              );
            })}
          </div>

          {selectedDates.size > 0 && (
            <div className="apply-summary-box">
              <div className="apply-summary-count">
                <strong>{selectedDates.size}</strong> day{selectedDates.size === 1 ? "" : "s"} selected
              </div>
              {conflictCount > 0 && (
                <>
                  <div className="apply-conflict-warning">
                    ⚠ {conflictCount} of these day{conflictCount === 1 ? "" : "s"} already{conflictCount === 1 ? " has" : " have"} challenges scheduled
                  </div>
                  <label className="apply-replace-toggle">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                    />
                    <span>
                      {replaceExisting
                        ? "REPLACE existing challenges on those days (will delete what's there first)"
                        : "MERGE — keep existing challenges and add the new ones (skips duplicates of the same challenge on the same day)"}
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {error && <div className="alert alert-error" style={{ marginTop: "12px" }}>{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-inline"
              onClick={handleApply}
              disabled={applying || selectedDates.size === 0}
            >
              {applying
                ? "Applying..."
                : `Apply to ${selectedDates.size} day${selectedDates.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { DayChallenge } from "./CalendarMonthView";

const CATEGORY_COLORS: Record<string, string> = {
  Sports: "#2563EB",
  Faith: "#7C3AED",
  Scouts: "#10B981",
  Fitness: "#F59E0B",
  Academic: "#6366F1",
  Service: "#EC4899",
};

interface CalendarListViewProps {
  eventStartDate: string;
  eventEndDate: string;
  selectedDate: string;
  dayContent: Record<string, DayChallenge[]>;
  onSelectDay: (date: string) => void;
  today: string;
}

const dateToYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatLongDate = (date: string): string => {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

export default function CalendarListView({
  eventStartDate,
  eventEndDate,
  selectedDate,
  dayContent,
  onSelectDay,
  today,
}: CalendarListViewProps) {
  const start = new Date(eventStartDate + "T12:00:00");
  const end = new Date(eventEndDate + "T12:00:00");
  const allDays: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    allDays.push(dateToYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div className="cal-list-view">
      {allDays.map((date, idx) => {
        const isSelected = date === selectedDate;
        const isToday = date === today;
        const challenges = dayContent[date] || [];
        const totalChallenges = challenges.reduce((s, c) => s + c.count, 0);
        const isRest = totalChallenges === 0;

        let rowClass = "cal-list-row";
        if (isSelected) rowClass += " cal-list-row-selected";
        if (isToday && !isSelected) rowClass += " cal-list-row-today";
        if (isRest) rowClass += " cal-list-row-rest";

        return (
          <button
            key={date}
            type="button"
            className={rowClass}
            onClick={() => onSelectDay(date)}
          >
            <div className="cal-list-day-num">
              <div className="cal-list-day-num-text">Day {idx + 1}</div>
              <div className="cal-list-day-date">{formatLongDate(date)}</div>
              {isToday && <div className="cal-list-today-pill">Today</div>}
            </div>

            <div className="cal-list-content">
              {totalChallenges > 0 ? (
                <>
                  <div className="cal-list-summary">
                    <strong>{totalChallenges}</strong> challenge{totalChallenges === 1 ? "" : "s"}
                  </div>
                  <div className="cal-list-categories">
                    {challenges.map((c, ci) => (
                      <span key={ci} className="cal-list-cat-pill">
                        <span
                          className="cal-list-cat-dot"
                          style={{ background: CATEGORY_COLORS[c.category] || "#6B7280" }}
                        />
                        {c.category} ({c.count})
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="cal-list-rest-label">Rest day</div>
              )}
            </div>

            <div className="cal-list-chevron">›</div>
          </button>
        );
      })}
    </div>
  );
}

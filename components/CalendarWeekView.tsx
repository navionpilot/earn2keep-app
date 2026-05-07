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

interface CalendarWeekViewProps {
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

const formatShortDate = (date: string): string => {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function CalendarWeekView({
  eventStartDate,
  eventEndDate,
  selectedDate,
  dayContent,
  onSelectDay,
  today,
}: CalendarWeekViewProps) {
  // Build all days in event window
  const start = new Date(eventStartDate + "T12:00:00");
  const end = new Date(eventEndDate + "T12:00:00");
  const allDays: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    allDays.push(dateToYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Group by week starting on Sunday. Find the Sunday of the first event week.
  // Pad the first week with leading empties if event doesn't start on Sunday.
  const firstDay = new Date(eventStartDate + "T12:00:00");
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sun
  const weeks: (string | null)[][] = [];
  let currentWeek: (string | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(null);
  }
  for (const date of allDays) {
    currentWeek.push(date);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return (
    <div className="cal-week-view">
      <div className="cal-weekday-row">
        <div className="cal-weekday">Sun</div>
        <div className="cal-weekday">Mon</div>
        <div className="cal-weekday">Tue</div>
        <div className="cal-weekday">Wed</div>
        <div className="cal-weekday">Thu</div>
        <div className="cal-weekday">Fri</div>
        <div className="cal-weekday">Sat</div>
      </div>

      {weeks.map((week, wIdx) => (
        <div key={wIdx} className="cal-week-row">
          <div className="cal-week-label">Week {wIdx + 1}</div>
          <div className="cal-week-grid">
            {week.map((date, dIdx) => {
              if (!date) {
                return <div key={dIdx} className="cal-week-cell cal-week-cell-empty" />;
              }

              const isSelected = date === selectedDate;
              const isToday = date === today;
              const challenges = dayContent[date] || [];
              const totalChallenges = challenges.reduce((s, c) => s + c.count, 0);
              const isRest = totalChallenges === 0;

              let cellClass = "cal-week-cell";
              if (isSelected) cellClass += " cal-week-cell-selected";
              if (isToday && !isSelected) cellClass += " cal-week-cell-today";
              if (isRest) cellClass += " cal-week-cell-rest";

              return (
                <button
                  key={dIdx}
                  type="button"
                  className={cellClass}
                  onClick={() => onSelectDay(date)}
                >
                  <div className="cal-week-cell-date">{formatShortDate(date)}</div>
                  {totalChallenges > 0 ? (
                    <div className="cal-week-cell-info">
                      <div className="cal-week-cell-dots">
                        {challenges.slice(0, 5).map((c, idx) => (
                          <span
                            key={idx}
                            className="cal-week-cell-dot"
                            style={{ background: CATEGORY_COLORS[c.category] || "#6B7280" }}
                          />
                        ))}
                      </div>
                      <span className="cal-week-cell-count">{totalChallenges}</span>
                    </div>
                  ) : (
                    <div className="cal-week-cell-rest-label">Rest</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

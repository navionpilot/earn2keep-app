"use client";

type CategoryColor = {
  category: string;
  color: string;
};

const CATEGORY_COLORS: CategoryColor[] = [
  { category: "Sports", color: "#2563EB" },
  { category: "Faith", color: "#7C3AED" },
  { category: "Scouts", color: "#10B981" },
  { category: "Fitness", color: "#F59E0B" },
  { category: "Academic", color: "#6366F1" },
  { category: "Service", color: "#EC4899" },
];

const getCategoryColor = (category: string): string => {
  const found = CATEGORY_COLORS.find((c) => c.category === category);
  return found?.color || "#6B7280";
};

export type DayChallenge = {
  category: string;
  count: number;
};

interface CalendarMonthViewProps {
  // The month being displayed (year + 0-based month)
  year: number;
  month: number; // 0 = Jan, 11 = Dec
  // Event window
  eventStartDate: string; // YYYY-MM-DD
  eventEndDate: string;   // YYYY-MM-DD
  // Currently selected day (YYYY-MM-DD)
  selectedDate: string;
  // Map of YYYY-MM-DD -> array of category counts on that day
  dayContent: Record<string, DayChallenge[]>;
  // Click handler when a day is selected
  onSelectDay: (date: string) => void;
  // Today's date (for highlighting)
  today: string; // YYYY-MM-DD
}

const formatYMD = (year: number, month: number, day: number): string => {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
};

const isInRange = (date: string, start: string, end: string): boolean => {
  return date >= start && date <= end;
};

export default function CalendarMonthView({
  year,
  month,
  eventStartDate,
  eventEndDate,
  selectedDate,
  dayContent,
  onSelectDay,
  today,
}: CalendarMonthViewProps) {
  // Build the calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startOfWeek = firstDay.getDay(); // 0 = Sun

  // Build grid cells (leading empty cells + days in month)
  const cells: { date: string | null; dayNum: number | null }[] = [];
  for (let i = 0; i < startOfWeek; i++) {
    cells.push({ date: null, dayNum: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = formatYMD(year, month, d);
    cells.push({ date, dayNum: d });
  }
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayNum: null });
  }

  return (
    <div className="cal-month">
      <div className="cal-weekday-row">
        <div className="cal-weekday">Sun</div>
        <div className="cal-weekday">Mon</div>
        <div className="cal-weekday">Tue</div>
        <div className="cal-weekday">Wed</div>
        <div className="cal-weekday">Thu</div>
        <div className="cal-weekday">Fri</div>
        <div className="cal-weekday">Sat</div>
      </div>

      <div className="cal-grid">
        {cells.map((cell, i) => {
          if (!cell.date || !cell.dayNum) {
            return <div key={i} className="cal-cell cal-cell-empty" />;
          }

          const inRange = isInRange(cell.date, eventStartDate, eventEndDate);
          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === today;
          const challenges = dayContent[cell.date] || [];
          const totalChallenges = challenges.reduce((sum, c) => sum + c.count, 0);
          const isRestDay = inRange && totalChallenges === 0;

          let cellClass = "cal-cell";
          if (!inRange) cellClass += " cal-cell-disabled";
          if (isSelected) cellClass += " cal-cell-selected";
          if (isToday && !isSelected) cellClass += " cal-cell-today";
          if (isRestDay) cellClass += " cal-cell-rest";

          return (
            <button
              key={i}
              type="button"
              className={cellClass}
              disabled={!inRange}
              onClick={() => inRange && onSelectDay(cell.date!)}
            >
              <div className="cal-cell-header">
                <span className="cal-cell-day">{cell.dayNum}</span>
                {totalChallenges > 0 && (
                  <span className="cal-cell-count">{totalChallenges}</span>
                )}
              </div>
              <div className="cal-cell-body">
                {totalChallenges > 0 ? (
                  <div className="cal-cell-dots">
                    {challenges.slice(0, 6).map((c, idx) => (
                      <span
                        key={idx}
                        className="cal-cell-dot"
                        style={{ background: getCategoryColor(c.category) }}
                        title={`${c.category}: ${c.count}`}
                      />
                    ))}
                  </div>
                ) : isRestDay ? (
                  <span className="cal-cell-rest-label">Rest</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        {CATEGORY_COLORS.map((c) => (
          <span key={c.category} className="cal-legend-item">
            <span
              className="cal-legend-dot"
              style={{ background: c.color }}
            />
            {c.category}
          </span>
        ))}
      </div>
    </div>
  );
}

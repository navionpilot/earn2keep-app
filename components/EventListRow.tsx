"use client";

import Link from "next/link";

export interface EventListItem {
  id: string;
  name: string;
  event_type: "camp" | "tournament";
  start_date: string | null; // ISO date
  end_date: string | null;
  player_count: number;
  team_count?: number;
  amount_raised: number;        // dollars
  amount_goal: number | null;   // dollars (null = no goal e.g. tournament w/o registration sum)
  days_left: number | null;     // negative = ended
}

interface EventListRowProps {
  event: EventListItem;
}

const RunIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M4 22l5 -9" />
    <path d="M17 14l3 4l-2 4" />
    <path d="M14 18l-1 -4l-4 -3l3 -5l3 4l4 1" />
  </svg>
);
const TrophyIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 21l8 0" />
    <path d="M12 17l0 4" />
    <path d="M7 4l10 0" />
    <path d="M17 4v8a5 5 0 0 1 -10 0v-8" />
  </svg>
);
const UsersTinyIcon = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="7" r="3" />
    <path d="M5 21v-2a4 4 0 0 1 4 -4h6a4 4 0 0 1 4 4v2" />
  </svg>
);
const ClockTinyIcon = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Dates TBD";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  if (!end || end === start) {
    const yr = new Date(start).getFullYear();
    return `${s}, ${yr}`;
  }
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  const yr = new Date(end).getFullYear();
  return `${s} — ${e}, ${yr}`;
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export default function EventListRow({ event }: EventListRowProps) {
  const variant = event.event_type;
  const goal = event.amount_goal || 0;
  const pct = goal > 0
    ? Math.min(100, Math.max(0, Math.round((event.amount_raised / goal) * 100)))
    : 0;
  const peopleCount = variant === "tournament" && event.team_count
    ? `${event.team_count} TEAMS`
    : `${event.player_count} ${event.player_count === 1 ? "PLAYER" : "PLAYERS"}`;
  const daysLabel = event.days_left === null
    ? "TBD"
    : event.days_left < 0
    ? "ENDED"
    : event.days_left === 0
    ? "TODAY"
    : `${event.days_left} ${event.days_left === 1 ? "DAY" : "DAYS"} LEFT`;

  return (
    <Link href={`/events/${event.id}`} className="e2k-event-row">
      <div className={`e2k-event-thumb e2k-event-thumb-${variant}`}>
        {variant === "camp" ? RunIcon : TrophyIcon}
      </div>
      <div className="e2k-event-body">
        <span className={`e2k-event-pill e2k-event-pill-${variant}`}>
          {variant}
        </span>
        <p className="e2k-event-name">{event.name}</p>
        <p className="e2k-event-dates">{formatDateRange(event.start_date, event.end_date)}</p>
        <div className="e2k-event-icons">
          <span><span className="e2k-event-tiny-ic">{UsersTinyIcon}</span> {peopleCount}</span>
          <span><span className="e2k-event-tiny-ic">{ClockTinyIcon}</span> {daysLabel}</span>
        </div>
        <div className="e2k-event-bar">
          <div
            className={`e2k-event-bar-fill e2k-event-bar-fill-${variant}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="e2k-event-stats">
        <div className="e2k-event-money">{formatMoney(event.amount_raised)}</div>
        <div className="e2k-event-goal">
          {goal > 0 ? <>of {formatMoney(goal)} goal</> : <span>&nbsp;</span>}
        </div>
      </div>
    </Link>
  );
}

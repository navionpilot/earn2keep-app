"use client";

export interface Stat {
  num: string;             // e.g. "$31,580" or "189"
  label: string;           // e.g. "Total Raised"
  trend?: string;          // e.g. "↑ 28%" or "This month"
  trendTone?: "positive" | "neutral" | "warning";
}

interface StatRowProps {
  stats: Stat[];
}

export default function StatRow({ stats }: StatRowProps) {
  return (
    <section className="e2k-stats" aria-label="Summary statistics">
      {stats.map((s, i) => (
        <div key={i} className="e2k-stat-cell">
          <div className="e2k-stat-num">{s.num}</div>
          <div className="e2k-stat-label">{s.label}</div>
          {s.trend && (
            <div
              className={`e2k-stat-trend e2k-stat-trend-${s.trendTone || "positive"}`}
            >
              {s.trend}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

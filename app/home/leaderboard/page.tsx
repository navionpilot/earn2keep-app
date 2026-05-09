// =============================================================================
// app/home/leaderboard/page.tsx — Player-facing leaderboard (Slice 5.6)
// =============================================================================
// Server component. Looks up the player's event, computes the full
// leaderboard, and renders ranked rows with the current player highlighted.
//
// Branches:
//   - No player record       -> redirect to /dashboard
//   - No event for team      -> "No event yet" empty state
//   - Event not active       -> show leaderboard anyway (read-only) with
//                                a status pill noting the state
//   - Active event           -> full leaderboard with stats
// =============================================================================

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import PlayerTopBar from "@/components/PlayerTopBar";
import {
  computeEventLeaderboard,
  findPlayerEntry,
  type LeaderboardEntry,
} from "@/lib/leaderboard";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  avatar_url: string | null;
  team_id: string;
}

interface EventRow {
  id: string;
  name: string;
  event_type: "camp" | "tournament" | string | null;
  status: "draft" | "active" | "completed" | string | null;
}

function single<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Find the player record for this auth user.
  const { data: playerRow } = await supabase
    .from("players")
    .select("id, first_name, last_name, avatar_url, team_id")
    .eq("linked_user_id", user.id)
    .maybeSingle();
  if (!playerRow) redirect("/dashboard");
  const player = playerRow as PlayerRow;

  // Find the relevant event for this player's team (active > draft > completed).
  const { data: parts } = await supabase
    .from("event_participants")
    .select("event_id, events(id, name, event_type, status)")
    .eq("team_id", player.team_id);
  type PartRow = { event_id: string; events: EventRow | EventRow[] | null };
  const candidates: EventRow[] = [];
  for (const p of (parts || []) as PartRow[]) {
    const e = single(p.events);
    if (e) candidates.push(e);
  }
  candidates.sort((a, b) => {
    const score = (e: EventRow) =>
      e.status === "active" ? 2 : e.status === "draft" ? 1 : 0;
    return score(b) - score(a);
  });
  const event = candidates[0] || null;

  // Detect dual-role for the top bar (so coaches still see the ↩ link).
  const { count: ownedOrgCount } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user.id);
  const isAlsoCoach = (ownedOrgCount ?? 0) > 0;

  const TopBar = (
    <PlayerTopBar
      displayName={player.first_name}
      lastName={player.last_name}
      avatarUrl={player.avatar_url ?? null}
      isAlsoCoach={isAlsoCoach}
    />
  );

  // No event yet — show empty state.
  if (!event) {
    return (
      <>
        {TopBar}
        <main className="player-home-wrap">
          <Link href="/home" className="recording-back">
            ← Back to home
          </Link>
          <div className="player-home-empty">
            <div className="player-home-empty-icon">🏆</div>
            <h2 className="player-home-empty-title">No leaderboard yet</h2>
            <p className="player-home-empty-text">
              Your team isn&apos;t in an active event right now. The
              leaderboard will appear here once your coach starts one.
            </p>
          </div>
        </main>
      </>
    );
  }

  // Compute the full leaderboard.
  const leaderboard = await computeEventLeaderboard(supabase, event.id);
  const me = findPlayerEntry(leaderboard, player.id);

  // Top of board stats — total approvals + total points across event.
  const totalApprovedAll = leaderboard.reduce(
    (sum, r) => sum + r.approved_count,
    0
  );
  const totalPointsAll = leaderboard.reduce((sum, r) => sum + r.total_points, 0);

  return (
    <>
      {TopBar}
      <main className="player-home-wrap">
        <Link href="/home" className="recording-back">
          ← Back to home
        </Link>

        {/* Header strip */}
        <div className="leaderboard-header">
          <div className="leaderboard-header-eyebrow">
            <span className="player-home-hero-prompt">&gt;</span>
            <span>EVENT LEADERBOARD</span>
            {event.status !== "active" && (
              <span className="leaderboard-status-pill">
                {(event.status || "").toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="leaderboard-header-title">{event.name}</h1>
          <div className="leaderboard-header-meta">
            <span>
              <strong>{leaderboard.length}</strong> player
              {leaderboard.length === 1 ? "" : "s"}
            </span>
            <span>
              · <strong>{totalApprovedAll}</strong> approved submission
              {totalApprovedAll === 1 ? "" : "s"}
            </span>
            <span>
              · <strong>{totalPointsAll}</strong> total pts awarded
            </span>
          </div>
          {me && (
            <div className="leaderboard-yours">
              YOUR RANK:{" "}
              <strong className="leaderboard-yours-num">
                #{me.rank}
              </strong>{" "}
              of {leaderboard.length}
              <span className="leaderboard-yours-pts">
                · {me.total_points} pts
              </span>
            </div>
          )}
        </div>

        {/* The list */}
        {leaderboard.length === 0 ? (
          <div className="player-home-card">
            <p className="player-home-card-text">
              No players on the leaderboard yet. Your coach is still setting
              up the roster.
            </p>
          </div>
        ) : (
          <div className="leaderboard-list">
            {leaderboard.map((row) => {
              const isMe = row.player_id === player.id;
              return (
                <LeaderRow key={row.player_id} row={row} isMe={isMe} />
              );
            })}
          </div>
        )}

        <p className="leaderboard-fineprint">
          {event.event_type === "camp" ? (
            <>
              Camp scoring: challenge points + bonus points for every dollar
              raised above each player&apos;s fundraising minimum (fundraising
              bonuses come online when payments are wired up).
            </>
          ) : (
            <>
              Tournament scoring: pure challenge points. Top players win the
              prize pot at event end.
            </>
          )}
        </p>
      </main>
    </>
  );
}

// One row in the leaderboard list.
function LeaderRow({ row, isMe }: { row: LeaderboardEntry; isMe: boolean }) {
  const rankDisplay = (() => {
    if (row.rank === 1) return "🥇";
    if (row.rank === 2) return "🥈";
    if (row.rank === 3) return "🥉";
    return `#${row.rank}`;
  })();

  return (
    <div
      className={`leaderboard-row ${isMe ? "leaderboard-row-me" : ""} ${
        row.rank <= 3 ? "leaderboard-row-podium" : ""
      }`}
    >
      <div className="leaderboard-row-rank">{rankDisplay}</div>
      <div className="leaderboard-row-main">
        <div className="leaderboard-row-name">
          {row.first_name}
          {row.last_name ? ` ${row.last_name.charAt(0)}.` : ""}
          {isMe && <span className="leaderboard-row-you">YOU</span>}
        </div>
        <div className="leaderboard-row-team">{row.team_name}</div>
      </div>
      <div className="leaderboard-row-stats">
        <div className="leaderboard-row-points">{row.total_points}</div>
        <div className="leaderboard-row-points-label">PTS</div>
      </div>
      <div className="leaderboard-row-approved">
        {row.approved_count} ✓
      </div>
    </div>
  );
}

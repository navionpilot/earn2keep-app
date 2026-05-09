// =============================================================================
// app/home/page.tsx — Player home screen (Slice 5.3)
// =============================================================================
// The daily landing surface for a logged-in player. Replaces the placeholder
// /welcome page as the "go-to" page after sign-in.
//
// Three render branches:
//   1. Auth user has no players record       -> Redirect to /dashboard
//      (they're a coach who somehow ended up at /home)
//   2. Player has a record but no active     -> Show "no event yet" state
//      event for their team
//   3. Player has an active event            -> Full home: greeting, today's
//                                              challenges, sponsor link
//
// Data we pull:
//   - The player record linked to auth.uid
//   - Their team + org
//   - Most relevant event for the team (active beats draft beats completed)
//   - event_challenges for today's day_index
//   - The player's sponsor_token for that event (may not exist yet — coach
//     has to open the QR Codes page once to lazy-create them)
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import PlayerTopBar from "@/components/PlayerTopBar";
import PlayerSponsorCard from "@/components/PlayerSponsorCard";
import {
  pointsEarnedForSubmission,
  type ScoringEventChallenge,
  type SubmissionStatus,
} from "@/lib/scoring";
import {
  computeEventLeaderboard,
  findPlayerEntry,
} from "@/lib/leaderboard";
import { computeBadges } from "@/lib/badges";
import PlayerBadges from "@/components/PlayerBadges";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  jersey_number: number | null;
  avatar_url: string | null;   // Slice 5.5
  pronouns: string | null;     // Slice 5.5
  team_id: string;
  teams:
    | TeamShape
    | TeamShape[]
    | null;
}

interface TeamShape {
  id: string;
  name: string;
  sport_or_activity: string | null;
  age_group: string | null;
  organizations: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface EventRow {
  id: string;
  name: string;
  event_type: "camp" | "tournament" | string | null;
  status: "draft" | "active" | "completed" | string | null;
  start_date: string | null;
  end_date: string | null;
  goal_amount: number | null;
}

interface ChallengeShape {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
}

interface EventChallengeRow {
  id: string;
  day_index: number | null;
  rep_target: number | null;
  points_value: number | null;
  notes: string | null;
  challenges: ChallengeShape | ChallengeShape[] | null;
}

// Helper: Supabase returns relations as object OR array depending on how
// it inferred cardinality. Normalize to the singular case.
function single<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

// Compute today's day_index = days since start_date.
// Returns null if event hasn't started yet, or the index (0-based).
function todayIndex(startDateIso: string | null): number | null {
  if (!startDateIso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDateIso + "T12:00:00");
  start.setHours(0, 0, 0, 0);
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = Math.round((today.getTime() - start.getTime()) / msPerDay);
  return diff < 0 ? null : diff;
}

// Days remaining until an event starts (positive = future, 0 = today,
// negative = past).
function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateIso + "T12:00:00");
  target.setHours(0, 0, 0, 0);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export default async function PlayerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware should have caught no-user, but defensive check.
  if (!user) {
    redirect("/login");
  }

  // 1. Look up THIS user's player record. If there isn't one, they're not a
  //    player — they're a coach who hit /home by mistake. Send them home.
  const { data: playerRow } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, jersey_number, avatar_url, pronouns, team_id, teams(id, name, sport_or_activity, age_group, organizations(id, name))"
    )
    .eq("linked_user_id", user.id)
    .maybeSingle();

  if (!playerRow) {
    // Coach (or unrelated user) — bounce to coach dashboard.
    redirect("/dashboard");
  }

  const player = playerRow as PlayerRow;
  const team = single(player.teams);
  const org = team ? single(team.organizations) : null;

  // Slice 5.3.1: detect dual-role users (coach who's also linked to a
  // player record). Surface a "Coach Dashboard" link in the top bar so
  // they can switch back to the coach view.
  const { count: ownedOrgCount } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user.id);
  const isAlsoCoach = (ownedOrgCount ?? 0) > 0;

  // 2. Find the player's team's most-relevant event.
  //    Status priority: active (2) > draft (1) > completed (0).
  let event: EventRow | null = null;
  if (team) {
    const { data: parts } = await supabase
      .from("event_participants")
      .select("event_id, events(id, name, event_type, status, start_date, end_date, goal_amount)")
      .eq("team_id", team.id);

    type PartRow = {
      event_id: string;
      events: EventRow | EventRow[] | null;
    };
    const candidates: EventRow[] = [];
    for (const p of (parts || []) as PartRow[]) {
      const e = single(p.events);
      if (e) candidates.push(e);
    }
    const scoreOf = (e: EventRow): number => {
      if (e.status === "active") return 2;
      if (e.status === "draft") return 1;
      return 0;
    };
    candidates.sort((a, b) => scoreOf(b) - scoreOf(a));
    event = candidates[0] || null;
  }

  // ----- Render shell + topbar (same for all branches) -----
  const TopBar = (
    <PlayerTopBar
      displayName={player.first_name}
      lastName={player.last_name}
      avatarUrl={player.avatar_url ?? null}
      isAlsoCoach={isAlsoCoach}
    />
  );

  // ===========================================================================
  // Branch A — No event for this player's team yet
  // ===========================================================================
  if (!event) {
    return (
      <>
        {TopBar}
        <main className="player-home-wrap">
          <div className="player-home-hero">
            <div className="player-home-hero-greeting">
              Hey, {player.first_name}! 👋
            </div>
            <div className="player-home-hero-context">
              {team ? (
                <>
                  You&apos;re on <strong>{team.name}</strong>
                  {team.sport_or_activity ? ` (${team.sport_or_activity})` : ""}
                  {org?.name ? <> at <strong>{org.name}</strong></> : null}.
                </>
              ) : (
                "Your account is set up."
              )}
            </div>
          </div>

          <div className="player-home-empty">
            <div className="player-home-empty-icon">📅</div>
            <h2 className="player-home-empty-title">No event yet</h2>
            <p className="player-home-empty-text">
              Your team isn&apos;t competing in an event right now. When your
              coach activates one, today&apos;s challenges and your sponsor
              link will show up here.
            </p>
            <p className="player-home-empty-hint">
              Check back soon, or text your coach to find out when training
              starts!
            </p>
          </div>
        </main>
      </>
    );
  }

  // ===========================================================================
  // Branch B — Event exists. Compute timing + pull today's challenges.
  // ===========================================================================
  const dayIdx = todayIndex(event.start_date);
  const daysToStart = daysUntil(event.start_date);
  const daysToEnd = event.end_date ? daysUntil(event.end_date) : null;
  const isUpcoming = daysToStart !== null && daysToStart > 0;
  const isCompleted = event.status === "completed" || (daysToEnd !== null && daysToEnd < 0);
  const isActive = event.status === "active" && !isUpcoming && !isCompleted;
  const isPaused = event.status === "draft" && !isUpcoming;

  // Total event days for the "Day X of Y" header.
  let totalDays: number | null = null;
  if (event.start_date && event.end_date) {
    const startMs = new Date(event.start_date + "T12:00:00").getTime();
    const endMs = new Date(event.end_date + "T12:00:00").getTime();
    totalDays =
      Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
  }

  // Pull TODAY's scheduled challenges for this event (if active).
  let todayChallenges: EventChallengeRow[] = [];
  if (isActive && dayIdx !== null) {
    const { data: ec } = await supabase
      .from("event_challenges")
      .select(
        "id, day_index, rep_target, points_value, notes, challenges(id, name, description, category, unit)"
      )
      .eq("event_id", event.id)
      .eq("day_index", dayIdx);
    todayChallenges = (ec || []) as EventChallengeRow[];
  }

  // Slice 5.4.5: pull ALL of this player's submissions for THIS event
  // (not just today's). Used for the dashboard stats grid + activity feed
  // + the existing today-challenge status pills.
  // Slice 5.6: also pulls challenges.difficulty + rep_target so we can
  // use the proper partial-credit scoring helper instead of a flat sum.
  type SubRow = {
    id: string;
    event_challenge_id: string;
    status: string;
    reps_claimed: number | null;
    reps_approved: number | null;
    submitted_at: string;
    rejection_reason: string | null;
    event_challenges:
      | {
          id: string;
          rep_target: number | null;
          points_value: number | null;
          challenges:
            | { name: string; difficulty: string | null }
            | { name: string; difficulty: string | null }[]
            | null;
        }
      | {
          id: string;
          rep_target: number | null;
          points_value: number | null;
          challenges:
            | { name: string; difficulty: string | null }
            | { name: string; difficulty: string | null }[]
            | null;
        }[]
      | null;
  };

  const { data: allSubsRaw } = await supabase
    .from("submissions")
    .select(
      "id, event_challenge_id, status, reps_claimed, reps_approved, submitted_at, rejection_reason, event_challenges(id, rep_target, points_value, challenges(name, difficulty))"
    )
    .eq("player_id", player.id)
    .eq("event_id", event.id)
    .order("submitted_at", { ascending: false });
  const allSubs = (allSubsRaw || []) as SubRow[];

  // Stat 1 (Slice 5.6): total points uses the proper partial-credit scoring
  // helper from lib/scoring.ts so the number matches what the coach-side
  // leaderboard shows. (Old 5.4.5 version just summed points_value flat,
  // which was incorrect for partial-completion approvals.)
  const totalPoints = allSubs.reduce((sum, s) => {
    const ec = single(s.event_challenges);
    if (!ec) return sum;
    const ch = single(ec.challenges);
    const scoringEc: ScoringEventChallenge = {
      rep_target: ec.rep_target,
      points_value: ec.points_value,
      challenge_difficulty: ch?.difficulty ?? null,
    };
    return (
      sum +
      pointsEarnedForSubmission(
        {
          status: s.status as SubmissionStatus,
          reps_claimed: s.reps_claimed,
          reps_approved: s.reps_approved,
        },
        scoringEc
      )
    );
  }, 0);

  // Stat 2-3: approved + pending counts across the whole event.
  const approvedCount = allSubs.filter((s) => s.status === "approved").length;
  const pendingCount = allSubs.filter((s) => s.status === "pending").length;

  // Subs-by-challenge index (most recent first per challenge) — feeds the
  // status pill on each today's challenge card. Same logic as before.
  const subsByChallenge: Record<string, SubRow> = {};
  for (const s of allSubs) {
    if (!subsByChallenge[s.event_challenge_id]) {
      subsByChallenge[s.event_challenge_id] = s;
    }
  }

  // Activity feed: the most recent 6 submissions across the whole event.
  const recentActivity = allSubs.slice(0, 6);

  // Stat 4 (Slice 5.4.5, retired in 5.6 from the grid): days left in the
  // event. Still computed in case we need it elsewhere; unused for now.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let daysLeftCount: number | null = null;
  if (event.end_date) {
    daysLeftCount = daysUntil(event.end_date);
  }

  // Event progress percent (Day X of Y).
  let progressPercent: number | null = null;
  let dayCurrent: number | null = null;
  if (totalDays && dayIdx !== null && dayIdx >= 0) {
    const cappedDay = Math.min(dayIdx + 1, totalDays);
    dayCurrent = cappedDay;
    progressPercent = Math.round((cappedDay / totalDays) * 100);
  } else if (totalDays && isCompleted) {
    dayCurrent = totalDays;
    progressPercent = 100;
  }

  // Pull this player's sponsor token for this event. May not exist yet —
  // gets lazy-created when the coach opens the QR codes page.
  const { data: tokenRow } = await supabase
    .from("sponsor_tokens")
    .select("token")
    .eq("player_id", player.id)
    .eq("event_id", event.id)
    .maybeSingle();

  // Slice 5.6: compute the full event leaderboard for the rank stat
  // and the Top-5 preview section. Includes ALL players (even 0-pt) so
  // the player always sees themselves on the board.
  const leaderboard = await computeEventLeaderboard(supabase, event.id);
  const myEntry = findPlayerEntry(leaderboard, player.id);
  const myRank = myEntry?.rank ?? null;
  // Build the preview list: top 5 + the player's row inserted if not already there.
  const top5 = leaderboard.slice(0, 5);
  const meInTop5 = top5.some((r) => r.player_id === player.id);
  const previewRows = meInTop5 || !myEntry ? top5 : [...top5, myEntry];

  // Status pill copy
  let statusLabel = "ACTIVE";
  let statusClass = "player-home-status-active";
  if (isCompleted) {
    statusLabel = "COMPLETED";
    statusClass = "player-home-status-completed";
  } else if (isUpcoming) {
    statusLabel = `STARTS IN ${daysToStart} DAY${daysToStart === 1 ? "" : "S"}`;
    statusClass = "player-home-status-upcoming";
  } else if (isPaused) {
    statusLabel = "PAUSED";
    statusClass = "player-home-status-paused";
  }

  // Today header copy
  let todayLabel: string;
  if (isUpcoming) {
    todayLabel = `Event starts ${formatDate(event.start_date!)}`;
  } else if (isCompleted) {
    todayLabel = "Event ended";
  } else if (dayIdx !== null && totalDays) {
    todayLabel = `Today · Day ${dayIdx + 1} of ${totalDays}`;
  } else if (dayIdx !== null) {
    todayLabel = `Today · Day ${dayIdx + 1}`;
  } else {
    todayLabel = "Today";
  }

  // Slice 5.7.3: Fundraiser goal progress for camp events.
  // For camps, event.goal_amount is the per-player dollar goal. We don't
  // have a donations/payments table yet (planned for a future Phase 6
  // payments slice), so amount_raised is currently always 0. The bar
  // renders anyway as a clear visual placeholder so players see what's
  // coming — when payments wire up, just swap the 0 for a real query.
  const isCamp = event.event_type === "camp";
  const fundGoal = Number(event.goal_amount) || 0;
  const fundRaised = 0; // TODO Phase 6: SUM of donations linked to this player+event
  const fundPct =
    fundGoal > 0
      ? Math.min(100, Math.max(0, Math.round((fundRaised / fundGoal) * 100)))
      : 0;
  const fundRemaining = Math.max(0, fundGoal - fundRaised);
  const showFundBar = isCamp && fundGoal > 0 && !isUpcoming;

  // Slice 5.3.2: compute earned/locked badges from the existing stats.
  const badgeStats = {
    totalPoints,
    approvedCount,
    pendingCount,
    totalSubmissions: allSubs.length,
    rank: myRank,
    leaderboardSize: leaderboard.length,
    fundraisingGoalHit: fundGoal > 0 && fundRaised >= fundGoal,
  };
  const { earned: earnedBadges } = computeBadges(badgeStats);

  return (
    <>
      {TopBar}
      <main className="player-home-wrap">
        {/* === Terminal-style mission control hero ===  */}
        <div className="player-home-hero player-home-hero-terminal">
          <div className="player-home-hero-eyebrow">
            <span className="player-home-hero-prompt">&gt;</span>
            <span>MISSION CONTROL</span>
            <span className={`player-home-hero-statusdot player-home-statusdot-${
              isActive ? "active" : isUpcoming ? "upcoming" : isCompleted ? "completed" : "paused"
            }`} aria-hidden="true" />
          </div>
          <div className="player-home-hero-greeting">
            {player.first_name} {player.last_name ?? ""}
            {player.pronouns && (
              <span className="player-home-hero-pronouns">
                ({player.pronouns})
              </span>
            )}
          </div>
          <div className="player-home-hero-context">
            <strong>{team?.name ?? "your team"}</strong>
            {team?.sport_or_activity ? ` · ${team.sport_or_activity}` : ""}
            {org?.name ? <> · {org.name}</> : null}
          </div>
          <div className="player-home-hero-event">
            {event.name}
            <span className={`player-home-status-pill ${statusClass}`}>{statusLabel}</span>
          </div>
        </div>

        {/* === Stats grid (4 cards) === */}
        <div className="player-home-stats-grid">
          <div className="player-home-stat">
            <div className="player-home-stat-value">
              {String(totalPoints).padStart(3, "0")}
            </div>
            <div className="player-home-stat-label">POINTS</div>
          </div>
          <div className="player-home-stat">
            <div className="player-home-stat-value">
              {String(approvedCount).padStart(2, "0")}
            </div>
            <div className="player-home-stat-label">APPROVED</div>
          </div>
          <div className="player-home-stat">
            <div className="player-home-stat-value">
              {String(pendingCount).padStart(2, "0")}
            </div>
            <div className="player-home-stat-label">PENDING</div>
          </div>
          {/* Slice 5.6: RANK stat replaces DAYS LEFT here. Days remaining is
              still visible in the Event Timeline section's "DAY X OF Y"
              progress bar, so we don't lose that info. */}
          <div className="player-home-stat">
            <div className="player-home-stat-value">
              {myRank === null || leaderboard.length === 0
                ? "—"
                : `#${myRank}`}
            </div>
            <div className="player-home-stat-label">
              {leaderboard.length > 0
                ? `RANK · OF ${leaderboard.length}`
                : "RANK"}
            </div>
          </div>
        </div>

        {/* === Slice 5.3.2: Achievement badges strip ===
            Earned badges only (compact). Empty state is a friendly hint
            rather than an empty space. Tap on a badge for a tooltip. */}
        <section className="player-home-badges">
          <div className="player-home-section-head player-home-badges-head">
            <span className="player-home-section-eyebrow">
              <span className="player-home-hero-prompt">&gt;</span> ACHIEVEMENTS
            </span>
            <Link
              href="/home/profile#badges"
              className="player-home-badges-viewall"
            >
              View all →
            </Link>
          </div>
          <PlayerBadges earned={earnedBadges} variant="compact" />
        </section>

        {/* === Slice 5.7.3: Fundraising goal progress (camps only) === */}
        {showFundBar && (
          <div className="player-home-timeline">
            <div className="player-home-timeline-head">
              <span className="player-home-timeline-label">
                <span className="player-home-hero-prompt">&gt;</span>{" "}
                FUNDRAISING GOAL
              </span>
              <span className="player-home-timeline-progress">
                ${fundRaised.toLocaleString()} / ${fundGoal.toLocaleString()} · {fundPct}%
              </span>
            </div>
            <div className="player-home-timeline-bar-bg">
              <div
                className="player-home-timeline-bar-fill player-home-fund-bar-fill"
                style={{ width: `${Math.max(2, fundPct)}%` }}
              />
            </div>
            <div className="player-home-timeline-dates">
              {fundRaised >= fundGoal && fundGoal > 0 ? (
                <span className="player-home-fund-hit">
                  🎉 GOAL HIT — KEEP RAISING TO BANK BONUS POINTS
                </span>
              ) : (
                <>
                  <span>
                    ${fundRemaining.toLocaleString()} TO GO
                  </span>
                  <span className="player-home-timeline-sep">·</span>
                  <span>
                    SHARE YOUR{" "}
                    <a
                      href="#sponsor"
                      className="player-home-fund-share-link"
                    >
                      SPONSOR PAGE ↓
                    </a>
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* === Event timeline progress bar === */}
        {totalDays && (isActive || isCompleted) && (
          <div className="player-home-timeline">
            <div className="player-home-timeline-head">
              <span className="player-home-timeline-label">
                <span className="player-home-hero-prompt">&gt;</span>{" "}
                EVENT TIMELINE
              </span>
              <span className="player-home-timeline-progress">
                DAY {dayCurrent ?? 0} OF {totalDays} · {progressPercent ?? 0}%
              </span>
            </div>
            <div className="player-home-timeline-bar-bg">
              <div
                className="player-home-timeline-bar-fill"
                style={{ width: `${Math.max(2, progressPercent ?? 0)}%` }}
              />
            </div>
            <div className="player-home-timeline-dates">
              {event.start_date ? formatDate(event.start_date) : "?"}
              <span className="player-home-timeline-sep">→</span>
              {event.end_date ? formatDate(event.end_date) : "?"}
            </div>
          </div>
        )}

        {/* Today's challenges */}
        <section className="player-home-section">
          <div className="player-home-section-head">
            <span className="player-home-section-eyebrow">
              <span className="player-home-hero-prompt">&gt;</span> {todayLabel.toUpperCase()}
            </span>
            <h2 className="player-home-section-title">
              {isUpcoming
                ? "Get ready! 🏁"
                : isCompleted
                ? "Final results coming soon 🏆"
                : todayChallenges.length > 0
                ? "Today's challenges"
                : "Rest day 😌"}
            </h2>
          </div>

          {isUpcoming && (
            <div className="player-home-card">
              <p className="player-home-card-text">
                Your event kicks off in{" "}
                <strong>
                  {daysToStart} day{daysToStart === 1 ? "" : "s"}
                </strong>
                . When the start date hits, today&apos;s challenges will show up
                right here every day.
              </p>
            </div>
          )}

          {isCompleted && (
            <div className="player-home-card">
              <p className="player-home-card-text">
                The event has ended. Final scores and prize results will be
                posted by your coach once submissions are reviewed.
              </p>
            </div>
          )}

          {isActive && todayChallenges.length === 0 && (
            <div className="player-home-card">
              <p className="player-home-card-text">
                No challenges scheduled for today. Take a breather and check
                back tomorrow!
              </p>
            </div>
          )}

          {isActive && todayChallenges.length > 0 && (
            <div className="player-home-challenges">
              {todayChallenges.map((ec) => {
                const challenge = single(ec.challenges);
                const sub = subsByChallenge[ec.id];
                // Status pill copy — informs the player whether they've
                // already submitted (and where it stands) so they don't
                // accidentally re-record a challenge they already nailed.
                let statusPill: React.ReactNode = null;
                let buttonLabel = "Record →";
                if (sub) {
                  if (sub.status === "approved") {
                    statusPill = (
                      <span className="player-home-sub-pill player-home-sub-pill-approved">
                        ✓ Approved
                        {sub.reps_approved != null ? ` · ${sub.reps_approved}` : ""}
                      </span>
                    );
                    buttonLabel = "Re-do →";
                  } else if (sub.status === "pending") {
                    statusPill = (
                      <span className="player-home-sub-pill player-home-sub-pill-pending">
                        ⏳ Pending review
                      </span>
                    );
                    buttonLabel = "View →";
                  } else if (sub.status === "rejected") {
                    statusPill = (
                      <span className="player-home-sub-pill player-home-sub-pill-rejected">
                        ❌ Rejected
                      </span>
                    );
                    buttonLabel = "Try again →";
                  }
                }
                return (
                  <div className="player-home-challenge" key={ec.id}>
                    <div className="player-home-challenge-main">
                      <div className="player-home-challenge-name">
                        {challenge?.name ?? "Challenge"}
                      </div>
                      <div className="player-home-challenge-meta">
                        {ec.rep_target ? (
                          <span>
                            Target: <strong>{ec.rep_target}</strong>
                            {challenge?.unit ? ` ${challenge.unit}` : ""}
                          </span>
                        ) : null}
                        {ec.points_value ? (
                          <span>
                            • <strong>{ec.points_value}</strong> pt
                            {ec.points_value === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {/* Slice 5.7.4: surface the challenge description right
                          on the card so players have at least a one-liner of
                          context before tapping Record. The full setup +
                          coach instructions live on the recording page. */}
                      {challenge?.description && (
                        <div className="player-home-challenge-desc">
                          {challenge.description}
                        </div>
                      )}
                      {ec.notes ? (
                        <div className="player-home-challenge-notes">
                          {ec.notes}
                        </div>
                      ) : null}
                      {!sub && (
                        <div className="player-home-challenge-cta-hint">
                          Tap <strong>Record →</strong> for setup
                          instructions and tips before you film.
                        </div>
                      )}
                      {statusPill && (
                        <div className="player-home-challenge-status">
                          {statusPill}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/home/record/${ec.id}`}
                      className="player-home-challenge-record-link"
                    >
                      {buttonLabel}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {isPaused && (
            <div className="player-home-card">
              <p className="player-home-card-text">
                Your coach has paused this event. Hold tight — submissions
                will reopen when training resumes.
              </p>
            </div>
          )}
        </section>

        {/* === Leaderboard preview (Slice 5.6) === */}
        {leaderboard.length > 0 && (isActive || isCompleted) && (
          <section className="player-home-section">
            <div className="player-home-section-head">
              <span className="player-home-section-eyebrow">
                <span className="player-home-hero-prompt">&gt;</span> LEADERBOARD
              </span>
              <h2 className="player-home-section-title">
                {myRank === 1
                  ? "You're #1! 🥇"
                  : myRank && myRank <= 3
                  ? `You're on the podium (#${myRank})`
                  : myRank
                  ? `You're #${myRank} of ${leaderboard.length}`
                  : "Standings"}
              </h2>
            </div>
            <div className="player-home-leaderboard-preview">
              {previewRows.map((row, idx) => {
                const isMe = row.player_id === player.id;
                const skipBefore =
                  !meInTop5 && myEntry && idx === previewRows.length - 1;
                const rankIcon =
                  row.rank === 1
                    ? "🥇"
                    : row.rank === 2
                    ? "🥈"
                    : row.rank === 3
                    ? "🥉"
                    : `#${row.rank}`;
                return (
                  <div key={row.player_id}>
                    {skipBefore && (
                      <div className="player-home-leaderboard-skip">⋯</div>
                    )}
                    <div
                      className={`player-home-leaderboard-row ${
                        isMe ? "player-home-leaderboard-row-me" : ""
                      }`}
                    >
                      <span className="player-home-leaderboard-rank">
                        {rankIcon}
                      </span>
                      <span className="player-home-leaderboard-name">
                        {row.first_name}
                        {row.last_name
                          ? ` ${row.last_name.charAt(0)}.`
                          : ""}
                        {isMe && (
                          <span className="player-home-leaderboard-you">
                            YOU
                          </span>
                        )}
                      </span>
                      <span className="player-home-leaderboard-pts">
                        {row.total_points}
                        <span className="player-home-leaderboard-pts-label">
                          {" "}
                          PTS
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Link
              href="/home/leaderboard"
              className="player-home-leaderboard-fulllink"
            >
              View full leaderboard →
            </Link>
          </section>
        )}

        {/* === Recent Activity feed === */}
        {recentActivity.length > 0 && (
          <section className="player-home-section">
            <div className="player-home-section-head">
              <span className="player-home-section-eyebrow">
                <span className="player-home-hero-prompt">&gt;</span> RECENT ACTIVITY
              </span>
              <h2 className="player-home-section-title">Submission log</h2>
            </div>
            <div className="player-home-activity">
              {recentActivity.map((sub) => {
                const ec = single(sub.event_challenges);
                const challenge = single(ec?.challenges);
                const challengeName = challenge?.name ?? "Challenge";
                const ago = formatRelativeTime(sub.submitted_at);
                let pillClass = "player-home-activity-pill";
                let pillLabel: string;
                if (sub.status === "approved") {
                  pillClass += " player-home-activity-pill-approved";
                  pillLabel = "✓ APPROVED";
                } else if (sub.status === "pending") {
                  pillClass += " player-home-activity-pill-pending";
                  pillLabel = "⏳ PENDING";
                } else if (sub.status === "rejected") {
                  pillClass += " player-home-activity-pill-rejected";
                  pillLabel = "❌ REJECTED";
                } else {
                  pillLabel = sub.status.toUpperCase();
                }
                const reps =
                  sub.status === "approved" && sub.reps_approved != null
                    ? sub.reps_approved
                    : sub.reps_claimed;
                const points =
                  sub.status === "approved" ? ec?.points_value ?? 0 : null;
                return (
                  <div className="player-home-activity-row" key={sub.id}>
                    <span className={pillClass}>{pillLabel}</span>
                    <div className="player-home-activity-main">
                      <div className="player-home-activity-name">
                        {challengeName}
                      </div>
                      <div className="player-home-activity-meta">
                        {reps != null && (
                          <span>
                            {reps} {reps === 1 ? "rep" : "reps"}
                          </span>
                        )}
                        {points != null && points > 0 && (
                          <span>
                            · <strong>+{points}</strong> pts
                          </span>
                        )}
                        {sub.status === "rejected" && sub.rejection_reason && (
                          <span className="player-home-activity-reason">
                            · {sub.rejection_reason}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="player-home-activity-time">{ago}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Sponsor link */}
        <section className="player-home-section" id="sponsor">
          <div className="player-home-section-head">
            <span className="player-home-section-eyebrow">
              <span className="player-home-hero-prompt">&gt;</span> MY SPONSOR PAGE
            </span>
            <h2 className="player-home-section-title">Get sponsored 💸</h2>
          </div>

          {tokenRow?.token ? (
            <PlayerSponsorCard
              token={tokenRow.token}
              playerFirstName={player.first_name}
              playerLastName={player.last_name}
              teamName={team?.name ?? "team"}
              teamSport={team?.sport_or_activity ?? null}
              teamAgeGroup={team?.age_group ?? null}
              eventName={event.name}
              eventType={event.event_type ?? "camp"}
              organizationName={org?.name ?? "the team"}
              goalAmount={Number(event.goal_amount) || 0}
              eventStartDate={event.start_date ?? ""}
              eventEndDate={event.end_date ?? event.start_date ?? ""}
            />
          ) : (
            <div className="player-home-card">
              <p className="player-home-card-text">
                Your personal sponsor link will appear here once your coach
                generates QR codes for the event. They just need to open the
                QR Codes page once — that creates a code for every player
                automatically.
              </p>
            </div>
          )}
        </section>

        {/* Slice 5.7.5: removed the "Coming Soon" footer panel — three of
            its four items shipped (badges 5.3.2, leaderboard 5.6,
            fundraising bar 5.7.3). The remaining item, push notifications,
            doesn't justify a standalone panel. The page already has
            plenty of content; an empty footer teaser was just noise. */}
      </main>
    </>
  );
}

// -----------------------------------------------------------------------------
// Note: the previous in-file SponsorLinkCard helper was deleted in 5.4.2.
// Player sponsor display now lives in components/PlayerSponsorCard.tsx —
// a real client component with QR code, native share, and PDF flyer
// download. Reused the same lib/sponsorFlyerPdf.ts the coach uses.
// -----------------------------------------------------------------------------

// Small "March 15" formatter used in the upcoming-event copy.
function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

// "2h ago", "3d ago", "5m ago" — used in the recent activity feed.
// ISO is the full timestamp from submissions.submitted_at.
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  // Beyond a month, switch to a date so it stays meaningful.
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  jersey_number: number | null;
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
      "id, first_name, last_name, jersey_number, team_id, teams(id, name, sport_or_activity, age_group, organizations(id, name))"
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

  // Slice 5.4: pull the player's most recent submission per event_challenge
  // for THIS event so the home page can show status pills next to each
  // challenge. One batched query keeps it cheap.
  type SubRow = {
    id: string;
    event_challenge_id: string;
    status: string;
    reps_claimed: number | null;
    reps_approved: number | null;
    submitted_at: string;
  };
  const subsByChallenge: Record<string, SubRow> = {};
  if (todayChallenges.length > 0) {
    const ecIds = todayChallenges.map((c) => c.id);
    const { data: subs } = await supabase
      .from("submissions")
      .select("id, event_challenge_id, status, reps_claimed, reps_approved, submitted_at")
      .eq("player_id", player.id)
      .in("event_challenge_id", ecIds)
      .order("submitted_at", { ascending: false });
    for (const s of (subs || []) as SubRow[]) {
      // Most recent first thanks to the order clause; only set once.
      if (!subsByChallenge[s.event_challenge_id]) {
        subsByChallenge[s.event_challenge_id] = s;
      }
    }
  }

  // Pull this player's sponsor token for this event. May not exist yet —
  // gets lazy-created when the coach opens the QR codes page.
  const { data: tokenRow } = await supabase
    .from("sponsor_tokens")
    .select("token")
    .eq("player_id", player.id)
    .eq("event_id", event.id)
    .maybeSingle();

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

  return (
    <>
      {TopBar}
      <main className="player-home-wrap">
        {/* Greeting hero card */}
        <div className="player-home-hero">
          <div className="player-home-hero-greeting">
            Hey, {player.first_name}! 👋
          </div>
          <div className="player-home-hero-context">
            You&apos;re on <strong>{team?.name ?? "your team"}</strong>
            {team?.sport_or_activity ? ` (${team.sport_or_activity})` : ""}
            {org?.name ? <> at <strong>{org.name}</strong></> : null}, competing
            in <strong>{event.name}</strong>.
          </div>
          <div className="player-home-hero-meta">
            <span className={`player-home-status-pill ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Today's challenges */}
        <section className="player-home-section">
          <div className="player-home-section-head">
            <span className="player-home-section-eyebrow">{todayLabel.toUpperCase()}</span>
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
                      {ec.notes ? (
                        <div className="player-home-challenge-notes">
                          {ec.notes}
                        </div>
                      ) : null}
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

        {/* Sponsor link */}
        <section className="player-home-section">
          <div className="player-home-section-head">
            <span className="player-home-section-eyebrow">MY SPONSOR PAGE</span>
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

        {/* Footer / coming soon */}
        <section className="player-home-section">
          <div className="player-home-coming-soon">
            <div className="player-home-coming-soon-eyebrow">COMING SOON</div>
            <ul className="player-home-coming-soon-list">
              <li>🏆 Achievement badges as you hit milestones</li>
              <li>📊 Live leaderboard view</li>
              <li>💰 Real-time fundraising progress</li>
              <li>📲 Push notifications when your coach reviews</li>
            </ul>
          </div>
        </section>
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

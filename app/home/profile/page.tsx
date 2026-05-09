// =============================================================================
// app/home/profile/page.tsx — Player profile (Slice 5.5 + 5.3.2 badges)
// =============================================================================
// Server component. Loads the player's row, dual-role flag, lifetime
// submission stats, and (if they're in an active event) their current
// rank — then renders the page chrome, profile form, and achievement
// badge grid (Slice 5.3.2).
//
// Branches:
//   - No auth user        → middleware bounces to /login
//   - No player record    → /dashboard (they're a coach-only account)
//   - Otherwise           → render profile form + badge grid
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import PlayerTopBar from "@/components/PlayerTopBar";
import { getUnreadNotificationCount } from "@/lib/notifications";
import PlayerProfileForm from "@/components/PlayerProfileForm";
import PlayerBadges from "@/components/PlayerBadges";
import { computeBadges } from "@/lib/badges";
import {
  pointsEarnedForSubmission,
  type ScoringEventChallenge,
  type SubmissionStatus,
} from "@/lib/scoring";
import {
  computeEventLeaderboard,
  findPlayerEntry,
} from "@/lib/leaderboard";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull the player record. Selecting just the fields we need; the form
  // will only ever PATCH the 4 editable ones (avatar/pronouns/bio/notif),
  // so we don't need everything.
  const { data: playerRow } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, jersey_number, parent_email, avatar_url, pronouns, bio, notification_prefs, team_id, teams(id, name, organizations(id, name))"
    )
    .eq("linked_user_id", user.id)
    .maybeSingle();
  if (!playerRow) redirect("/dashboard");

  // Coalesce relation arrays vs single object, same trick used elsewhere.
  type RelRow = { id: string; name: string };
  type TeamRow = { id: string; name: string; organizations: RelRow | RelRow[] | null };
  const team = (Array.isArray(playerRow.teams)
    ? playerRow.teams[0]
    : (playerRow.teams as TeamRow | null)) ?? null;
  const org = team
    ? Array.isArray(team.organizations)
      ? team.organizations[0]
      : team.organizations
    : null;

  // Detect dual-role for the top bar.
  const { count: ownedOrgCount } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user.id);
  const isAlsoCoach = (ownedOrgCount ?? 0) > 0;

  // Joined date — using auth.users.created_at proxies "when they
  // claimed the invite," which is meaningful to show.
  const joinedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // ---------------------------------------------------------------------------
  // Slice 5.3.2 — Compute lifetime stats + current-event rank for badges
  // ---------------------------------------------------------------------------
  // Lifetime: every submission this player has ever made (across events).
  // Drives all the milestone + points-based badges.
  type ChRel = { name: string; difficulty: string | null };
  type EcRel = {
    id: string;
    rep_target: number | null;
    points_value: number | null;
    challenges: ChRel | ChRel[] | null;
  };
  type SubRow = {
    status: SubmissionStatus;
    reps_claimed: number | null;
    reps_approved: number | null;
    event_challenges: EcRel | EcRel[] | null;
  };
  function single<T>(rel: T | T[] | null | undefined): T | null {
    if (!rel) return null;
    return Array.isArray(rel) ? rel[0] ?? null : rel;
  }
  const { data: subsRaw } = await supabase
    .from("submissions")
    .select(
      "status, reps_claimed, reps_approved, event_challenges(id, rep_target, points_value, challenges(name, difficulty))"
    )
    .eq("player_id", playerRow.id);
  const allSubs = (subsRaw || []) as SubRow[];
  const totalPoints = allSubs.reduce((sum, s) => {
    const ec = single(s.event_challenges);
    if (!ec) return sum;
    const ch = single(ec.challenges);
    const scoringEc: ScoringEventChallenge = {
      rep_target: ec.rep_target,
      points_value: ec.points_value,
      challenge_difficulty: (ch?.difficulty ?? null) as ScoringEventChallenge["challenge_difficulty"],
    };
    return (
      sum +
      pointsEarnedForSubmission(
        {
          status: s.status,
          reps_claimed: s.reps_claimed,
          reps_approved: s.reps_approved,
        },
        scoringEc
      )
    );
  }, 0);
  const approvedCount = allSubs.filter((s) => s.status === "approved").length;
  const pendingCount = allSubs.filter((s) => s.status === "pending").length;
  const totalSubmissions = allSubs.length;

  // Current event rank — only meaningful if the player is in an active
  // event. Stays null between events.
  let rank: number | null = null;
  let leaderboardSize = 0;
  const fundraisingGoalHit = false; // Phase 6: wire to real raised amount

  const { data: epRows } = await supabase
    .from("event_participants")
    .select("event_id, events(id, status)")
    .eq("player_id", playerRow.id);

  type EpEvent = { id: string; status: string | null };
  const activeEvent = (epRows || [])
    .map((r) => {
      const e = Array.isArray(r.events) ? r.events[0] : r.events;
      return e as EpEvent | null;
    })
    .find((e) => e && e.status === "active");

  if (activeEvent) {
    // Build the leaderboard for that event using the shared helper.
    const lb = await computeEventLeaderboard(supabase, activeEvent.id);
    const myEntry = findPlayerEntry(lb, playerRow.id);
    rank = myEntry?.rank ?? null;
    leaderboardSize = lb.length;
  }

  const { earned: earnedBadges, locked: lockedBadges } = computeBadges({
    totalPoints,
    approvedCount,
    pendingCount,
    totalSubmissions,
    rank,
    leaderboardSize,
    fundraisingGoalHit,
  });

  // Slice 5.9: unread notification count for the bell badge.
  const unreadCount = await getUnreadNotificationCount(supabase);

  return (
    <>
      <PlayerTopBar
        displayName={playerRow.first_name}
        lastName={playerRow.last_name}
        avatarUrl={playerRow.avatar_url ?? null}
        isAlsoCoach={isAlsoCoach}
        unreadCount={unreadCount}
      />
      <main className="player-home-wrap">
        <Link href="/home" className="recording-back">
          ← Back to home
        </Link>

        <div className="profile-header">
          <div className="profile-header-eyebrow">
            <span className="player-home-hero-prompt">&gt;</span> MY PROFILE
          </div>
          <h1 className="profile-header-title">Profile &amp; settings</h1>
          <p className="profile-header-sub">
            Update your photo, pronouns, and bio. Some things — your name,
            jersey number, and team — are managed by your coach.
          </p>
        </div>

        <PlayerProfileForm
          playerId={playerRow.id}
          firstName={playerRow.first_name}
          lastName={playerRow.last_name ?? null}
          jerseyNumber={playerRow.jersey_number ?? null}
          parentEmail={playerRow.parent_email ?? null}
          avatarUrl={playerRow.avatar_url ?? null}
          pronouns={playerRow.pronouns ?? null}
          bio={playerRow.bio ?? null}
          notificationPrefs={playerRow.notification_prefs ?? null}
          teamName={team?.name ?? null}
          orgName={org?.name ?? null}
          authEmail={user.email ?? null}
          joinedDate={joinedDate}
        />

        {/* Slice 5.3.2: Achievement badge collection. The #badges anchor
            lets the "View all →" link from /home jump straight here. */}
        <section className="profile-section profile-section-badges" id="badges">
          <h2 className="profile-section-title">Achievements</h2>
          <p className="profile-section-help">
            Badges unlock automatically as you submit, get approved, climb the
            leaderboard, and hit fundraising goals. Locked ones are still ahead
            of you — keep going!
          </p>
          <PlayerBadges
            earned={earnedBadges}
            locked={lockedBadges}
            variant="full"
          />
        </section>
      </main>
    </>
  );
}

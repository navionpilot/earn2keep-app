// =============================================================================
// app/home/profile/page.tsx — Player profile (Slice 5.5)
// =============================================================================
// Server component. Loads the player's current row and dual-role flag,
// renders the page chrome (PlayerTopBar, ← Back link), and hands the
// editable fields off to <PlayerProfileForm /> client component for the
// actual save flow.
//
// Branches:
//   - No auth user        → middleware bounces to /login
//   - No player record    → /dashboard (they're a coach-only account)
//   - Otherwise           → render profile form
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import PlayerTopBar from "@/components/PlayerTopBar";
import PlayerProfileForm from "@/components/PlayerProfileForm";

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

  return (
    <>
      <PlayerTopBar
        displayName={playerRow.first_name}
        lastName={playerRow.last_name}
        isAlsoCoach={isAlsoCoach}
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
      </main>
    </>
  );
}

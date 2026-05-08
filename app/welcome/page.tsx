// =============================================================================
// app/welcome/page.tsx — Post-claim "you're in!" landing (Slice 5.2)
// =============================================================================
// After a player clicks the magic-link from their invite email, the auth
// callback claims the invite and lands them here.
//
// 5.2 keeps this page intentionally minimal — it confirms the claim worked
// and tells the player what's coming next. The actual player home screen
// (today's challenges, fundraising progress, sponsor QR, achievement
// badges) lands in 5.3.
//
// Three render branches:
//   - Player record found via linked_user_id   -> happy "you're set" state
//   - No player linked                          -> something went wrong; show
//                                                  a friendly "wait for coach
//                                                  to re-invite" message
//   - Not signed in                             -> middleware kicks them to
//                                                  /login first, so we never
//                                                  hit this branch in practice
// =============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  team_id: string;
  teams:
    | {
        id: string;
        name: string;
        sport_or_activity: string | null;
        organizations: { id: string; name: string } | { id: string; name: string }[] | null;
      }
    | {
        id: string;
        name: string;
        sport_or_activity: string | null;
        organizations: { id: string; name: string } | { id: string; name: string }[] | null;
      }[]
    | null;
}

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware should have caught this, but keep a server-side guard in case
  // somebody hits the URL directly with a stale session cookie.
  if (!user) {
    redirect("/login");
  }

  // Look up the player record linked to this auth user. If we find one,
  // the claim succeeded; if not, surface a friendly recovery message.
  const { data: playerRow } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, team_id, teams(id, name, sport_or_activity, organizations(id, name))"
    )
    .eq("linked_user_id", user.id)
    .maybeSingle();

  // Reusable page wrapper — same visual language as /join/[token].
  const Page = ({ children }: { children: React.ReactNode }) => (
    <main className="join-page-wrap">
      <div className="join-page-card">
        <div className="join-page-brand">
          <span className="join-page-brand-name">earn²keep</span>
        </div>
        {children}
      </div>
    </main>
  );

  if (!playerRow) {
    // The auth user exists but no players row references them. Most likely:
    // the invite token had already been claimed (or revoked) before this user
    // signed in. We don't have enough context to act, so we point them at
    // their coach.
    return (
      <Page>
        <h1 className="join-page-title">We&apos;re missing something</h1>
        <p className="join-page-text">
          Your account is signed in, but we couldn&apos;t find a player
          record linked to it. This usually means your invite link expired,
          was already used, or was revoked.
        </p>
        <p className="join-page-text">
          Ask your coach to send you a fresh invite — the link from that
          email will set things up correctly.
        </p>
      </Page>
    );
  }

  const player = playerRow as PlayerRow;
  const team = Array.isArray(player.teams) ? player.teams[0] : player.teams;
  const orgRel = team?.organizations
    ? Array.isArray(team.organizations)
      ? team.organizations[0]
      : team.organizations
    : null;

  return (
    <Page>
      <p className="join-page-eyebrow welcome-eyebrow-success">YOU&apos;RE IN</p>
      <h1 className="join-page-title">
        Welcome, {player.first_name}! 🎉
      </h1>
      <p className="join-page-text">
        Your account is set up. You&apos;re officially on{" "}
        <strong>{team?.name ?? "your team"}</strong>
        {team?.sport_or_activity ? ` (${team.sport_or_activity})` : ""}
        {orgRel?.name ? (
          <>
            {" "}
            at <strong>{orgRel.name}</strong>
          </>
        ) : null}
        .
      </p>

      <div className="welcome-coming-soon">
        <h2 className="welcome-coming-soon-title">What&apos;s coming next</h2>
        <div className="welcome-coming-list">
          <div className="welcome-coming-item">
            <span className="welcome-coming-icon">📹</span>
            <div>
              <strong>Daily challenges.</strong>
              <p>
                Your coach will load up drills and you&apos;ll record them from
                your phone — push-ups, free throws, sprints, whatever the sport.
              </p>
            </div>
          </div>
          <div className="welcome-coming-item">
            <span className="welcome-coming-icon">💸</span>
            <div>
              <strong>Your sponsor page.</strong>
              <p>
                A personal QR code so family and local businesses can back your
                fundraising — and the more you raise above the minimum, the more
                points you earn.
              </p>
            </div>
          </div>
          <div className="welcome-coming-item">
            <span className="welcome-coming-icon">🏆</span>
            <div>
              <strong>The leaderboard.</strong>
              <p>
                See how you stack up against everyone competing. Top spots win
                gift cards.
              </p>
            </div>
          </div>
        </div>

        <p className="welcome-fineprint">
          The full player home screen lands in our next update. Until then, sit
          tight — your coach will let you know when you&apos;re scheduled to
          start recording challenges.
        </p>
      </div>

      <div className="welcome-back-link">
        <LogoutButton />
      </div>
    </Page>
  );
}

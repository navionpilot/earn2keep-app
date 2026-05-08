// =============================================================================
// app/welcome/page.tsx — Post-claim "you're in!" celebration (Slice 5.2 → 5.3)
// =============================================================================
// Slice 5.2 originally shipped this as a placeholder with a "what's coming
// next" section, because there was no /home for a newly-claimed player to
// navigate to.
//
// Slice 5.3 ships /home, so this page is now a brief one-screen celebration
// with a single clear CTA forward. The player lands here once (from the
// auth callback after first claim) and then bookmarks /home for daily use.
// =============================================================================

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

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

  if (!user) {
    redirect("/login");
  }

  const { data: playerRow } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, team_id, teams(id, name, sport_or_activity, organizations(id, name))"
    )
    .eq("linked_user_id", user.id)
    .maybeSingle();

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

      <Link href="/home" className="btn-primary-link join-page-cta welcome-go-home">
        Go to my home →
      </Link>

      <p className="welcome-fineprint">
        Bookmark this page on your phone — it&apos;ll be where you pick up
        each day.
      </p>
    </Page>
  );
}

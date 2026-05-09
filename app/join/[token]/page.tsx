// =============================================================================
// app/join/[token]/page.tsx — Public invite landing page (Slice 5.1, 5.2)
// =============================================================================
// 5.1 introduced this page with a static "Set up my account →" link that
// went to /login?invite=<token> as a placeholder.
//
// 5.2 replaces that link with an inline ClaimAccountForm — the player can
// confirm their email and trigger a magic-link sign-in right on the page.
// On magic-link click, /auth/callback exchanges the OTP and calls the
// claim_player_invite() RPC to link the new auth user to the player record.
// =============================================================================

import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import ClaimAccountForm from "@/components/ClaimAccountForm";

interface InviteData {
  invite: {
    id: string;
    email: string | null;     // ADDED in 5.2 — what the coach typed when sending
    expires_at: string;
    claimed_at: string | null;
    sent_at: string | null;
  };
  player: {
    id: string;
    first_name: string;
    last_name: string | null;
    linked_user_id: string | null;
  };
  team: {
    id: string;
    name: string;
    sport_or_activity: string | null;
  };
  org: {
    id: string;
    name: string;
    owner_role: string | null;   // ADDED in 5.4.2
  };
}

// Slice 5.4.2: map a primary_role enum value to the natural-language label
// the player sees in "Your <X> added you to..." copy. The 8 roles in the
// system: coach, parent, teacher, youth_pastor, scout_leader, gym_owner,
// org_director, other.
function inviterLabel(role: string | null | undefined): string {
  switch (role) {
    case "coach":
      return "coach";
    case "teacher":
      return "teacher";
    case "youth_pastor":
      return "youth pastor";
    case "scout_leader":
      return "scout leader";
    case "gym_owner":
      return "gym instructor";
    case "parent":
      return "parent";
    case "org_director":
    case "other":
    default:
      return "team leader";
  }
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_invite_by_token", {
    invite_token: token,
  });

  // Plain-HTML page wrapper (no AppShell / sidebar — visitor isn't logged in).
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

  // ----- Error: RPC failed -----
  if (error) {
    return (
      <Page>
        <h1 className="join-page-title">Something went wrong</h1>
        <p className="join-page-text">
          We couldn&apos;t look up your invite right now. Try again in a
          minute, or ask your coach to send a fresh link.
        </p>
        <p className="join-page-tech">{error.message}</p>
      </Page>
    );
  }

  // ----- Not found -----
  if (!data) {
    return (
      <Page>
        <h1 className="join-page-title">Invite not found</h1>
        <p className="join-page-text">
          This invite link doesn&apos;t match any player on earn²keep. The
          link may have been mistyped or revoked. Ask your coach to send
          you a fresh one.
        </p>
      </Page>
    );
  }

  const invite = data as InviteData;
  const expiresAt = new Date(invite.invite.expires_at);
  const isExpired = expiresAt.getTime() < Date.now();
  const isClaimed = !!invite.invite.claimed_at;

  // ----- Already claimed -----
  if (isClaimed) {
    return (
      <Page>
        <h1 className="join-page-title">This invite was already used</h1>
        <p className="join-page-text">
          The invite for{" "}
          <strong>
            {invite.player.first_name} {invite.player.last_name ?? ""}
          </strong>{" "}
          on <strong>{invite.team.name}</strong> has already been claimed.
        </p>
        <p className="join-page-text">
          If this is your account, log in below. Otherwise, ask your coach
          for help.
        </p>
        <Link href="/login" className="btn-primary-link join-page-cta">
          Log in to earn²keep
        </Link>
      </Page>
    );
  }

  // ----- Expired -----
  if (isExpired) {
    return (
      <Page>
        <h1 className="join-page-title">This invite has expired</h1>
        <p className="join-page-text">
          The invite for{" "}
          <strong>
            {invite.player.first_name} {invite.player.last_name ?? ""}
          </strong>{" "}
          on <strong>{invite.team.name}</strong> expired on{" "}
          {expiresAt.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          . Ask your coach to send a fresh one.
        </p>
      </Page>
    );
  }

  // ----- Happy path: valid, unclaimed, unexpired -----
  return (
    <Page>
      <p className="join-page-eyebrow">YOU&apos;RE INVITED</p>
      <h1 className="join-page-title">
        Welcome, {invite.player.first_name}!
      </h1>
      <p className="join-page-text">
        Your {inviterLabel(invite.org.owner_role)} added you to{" "}
        <strong>{invite.team.name}</strong>
        {invite.team.sport_or_activity ? ` (${invite.team.sport_or_activity})` : ""} at{" "}
        <strong>{invite.org.name}</strong>. Set up your account so you can
        record challenges, track your fundraising, and compete on the
        leaderboard.
      </p>

      <div className="join-page-features">
        <div className="join-page-feature">
          <span className="join-page-feature-icon">📹</span>
          <div>
            <strong>Record your challenges.</strong>
            <p>Push-ups, free throws, drills — film it, send it, get scored.</p>
          </div>
        </div>
        <div className="join-page-feature">
          <span className="join-page-feature-icon">💸</span>
          <div>
            <strong>Earn it. Keep it.</strong>
            <p>Sponsors back YOUR effort, and money raised stays with the team.</p>
          </div>
        </div>
        <div className="join-page-feature">
          <span className="join-page-feature-icon">🏆</span>
          <div>
            <strong>Climb the leaderboard.</strong>
            <p>Top performers win prize gift cards.</p>
          </div>
        </div>
      </div>

      {/* Magic-link claim form — replaces the static "Set up my account" link
          we shipped in 5.1. */}
      <ClaimAccountForm
        token={token}
        prefilledEmail={invite.invite.email ?? ""}
        playerFirstName={invite.player.first_name}
      />

      <p className="join-page-fineprint">
        This invite is good until{" "}
        {expiresAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
        .
      </p>
    </Page>
  );
}

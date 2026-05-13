// =============================================================================
// app/accept-coach-invitation/[token]/page.tsx — Accept coach invite (L39)
// =============================================================================
// The recipient lands here from the invitation email. Three paths:
//
// A) Not signed in → redirect to /signup?next=/accept-coach-invitation/[token]
//    (after signup, lands back here with a session)
// B) Signed in BUT email doesn't match the invite's email → show a warning
//    + sign-out-and-retry option
// C) Signed in AND email matches → show the org context + Accept button.
//    On accept: UPDATE the invite row to status='accepted', set
//    accepted_by_user_id, redirect to the org page.
//
// If the invite is already accepted, revoked, or expired, show the
// appropriate state.
// =============================================================================

import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AcceptCoachInvitationButton from "@/components/AcceptCoachInvitationButton";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptCoachInvitationPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createClient();

  // Look up the invitation (RLS allows recipient or org owner to read it)
  const { data: invite } = await supabase
    .from("org_coach_invitations")
    .select(
      `id, email, recipient_name, status, invited_at, accepted_at,
       organization_id,
       organizations(name, owner_id, description)`
    )
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <CenteredCard
        eyebrow="INVITATION NOT FOUND"
        title="This invitation link doesn't work"
        body="The link may be invalid, expired, or the invitation may have been revoked. Contact the person who invited you for a fresh link."
      />
    );
  }

  // Resolve org name
  const orgRel = invite.organizations;
  let orgName = "an organization";
  let orgDescription: string | null = null;
  if (orgRel) {
    const o = Array.isArray(orgRel) ? orgRel[0] : orgRel;
    if (o) {
      orgName = (o as { name?: string }).name || orgName;
      orgDescription = (o as { description?: string }).description || null;
    }
  }

  // Already-terminal states
  if (invite.status === "accepted") {
    return (
      <CenteredCard
        eyebrow="ALREADY ACCEPTED"
        title="You've already accepted this invitation"
        body={`You're now an organizer at ${orgName}. Head to your dashboard to create teams and assign them to this org.`}
        cta={{ href: "/dashboard", label: "Go to dashboard →" }}
      />
    );
  }
  if (invite.status === "revoked") {
    return (
      <CenteredCard
        eyebrow="INVITATION REVOKED"
        title="This invitation was revoked"
        body={`The owner at ${orgName} revoked this invitation. Contact them directly if you think this is a mistake.`}
      />
    );
  }
  if (invite.status === "expired") {
    return (
      <CenteredCard
        eyebrow="INVITATION EXPIRED"
        title="This invitation has expired"
        body={`Contact ${orgName} for a fresh invitation.`}
      />
    );
  }

  // Status = 'pending'. Now check auth.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in → redirect to signup with return path
    redirect(
      `/signup?next=${encodeURIComponent(`/accept-coach-invitation/${token}`)}`
    );
  }

  const emailMatches =
    user.email && user.email.toLowerCase() === invite.email.toLowerCase();

  if (!emailMatches) {
    return (
      <CenteredCard
        eyebrow="WRONG ACCOUNT"
        title="This invitation is for a different email"
        body={`This invitation was sent to ${invite.email}, but you're signed in as ${user.email}. Sign out and either create an account with ${invite.email}, or ask the inviter to resend to your current address.`}
        cta={{ href: "/logout", label: "Sign out →" }}
      />
    );
  }

  // Happy path: signed in with matching email, invitation pending
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#041418",
        color: "#f7fbfb",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "Sora, system-ui, sans-serif",
              fontSize: 22,
              fontWeight: 800,
              color: "#ff755f",
              letterSpacing: -0.5,
            }}
          >
            earn²keep
          </div>
        </div>
      </header>
      <main style={{ flex: 1, padding: "60px 24px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            maxWidth: 540,
            width: "100%",
            padding: 32,
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#35d5df", letterSpacing: 1.5, marginBottom: 12 }}>
            🏟️ COACH INVITATION
          </div>
          <h1 style={{ fontFamily: "Sora, system-ui, sans-serif", fontSize: 26, fontWeight: 800, margin: "0 0 12px 0", lineHeight: 1.2 }}>
            You&apos;re invited to coach at <span style={{ color: "#35d5df" }}>{orgName}</span>
          </h1>
          {orgDescription && (
            <p style={{ fontSize: 14, opacity: 0.75, margin: "0 0 16px 0", fontStyle: "italic", lineHeight: 1.6 }}>
              &ldquo;{orgDescription}&rdquo;
            </p>
          )}
          <p style={{ fontSize: 14, opacity: 0.85, margin: "0 0 24px 0", lineHeight: 1.6 }}>
            By accepting, you&apos;ll be able to create teams under{" "}
            <strong style={{ color: "#f7fbfb" }}>{orgName}</strong>, manage
            their rosters, and join the organization&apos;s events.
          </p>

          <AcceptCoachInvitationButton inviteToken={token} orgId={invite.organization_id} />

          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
            Not the right person? Don&apos;t accept — the invitation will
            stay pending until the owner revokes it.
          </p>
        </div>
      </main>
    </div>
  );
}

function CenteredCard({
  eyebrow,
  title,
  body,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#041418",
        color: "#f7fbfb",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          padding: 32,
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 16,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: "#9fc3c7", letterSpacing: 1.5, marginBottom: 12 }}>
          {eyebrow}
        </div>
        <h1 style={{ fontFamily: "Sora, system-ui, sans-serif", fontSize: 24, fontWeight: 800, margin: "0 0 14px 0", lineHeight: 1.2 }}>
          {title}
        </h1>
        <p style={{ fontSize: 14, opacity: 0.8, margin: "0 0 24px 0", lineHeight: 1.6 }}>
          {body}
        </p>
        {cta && (
          <Link
            href={cta.href}
            style={{
              display: "inline-block",
              padding: "12px 24px",
              background: "#ff755f",
              color: "white",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}

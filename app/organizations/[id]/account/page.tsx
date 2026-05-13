// =============================================================================
// app/organizations/[id]/account/page.tsx — Org Account page (L39)
// =============================================================================
// The home for everything org-level CONFIGURATION (distinct from the
// upcoming /money page which is org-level ACTIVITY).
//
// Sections:
//   1. Organization details — recap of name/description/location with link
//      to the existing /edit page (rather than duplicating the form)
//   2. Coaches — list of users who own ≥1 team in this org (plus the org
//      owner), plus a Pending Invitations section and an Invite-a-coach
//      flow that drops into the L39 invitation tracking table
//   3. Payments & Payouts — Stripe Connect placeholder; when Phase 10
//      lands, this becomes the actual Connect onboarding entry point
//   4. Business Info — placeholder for tax/business details (Stripe-owned
//      in Phase 10)
//
// Access: ORG OWNER ONLY. Non-owner coaches see a "you don't have access
// to this page" message and a link back to the org. The Account page is
// the org owner's command center.
// =============================================================================

import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoachesPanel from "@/components/CoachesPanel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrgAccountPage({ params }: PageProps) {
  const { id: orgId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the org (must be owned by current user)
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, description, location, owner_id, created_at")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr || !org) {
    return (
      <AppShell active="organizations" userDisplayName="">
        <div style={{ padding: 40, textAlign: "center" }}>
          <h1>Organization not found</h1>
          <p>The org you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.</p>
          <Link href="/dashboard" style={{ color: "#35d5df" }}>Back to Dashboard →</Link>
        </div>
      </AppShell>
    );
  }

  const isOwner = org.owner_id === user.id;
  if (!isOwner) {
    return (
      <AppShell active="organizations" userDisplayName="">
        <div style={{ padding: 40, textAlign: "center" }}>
          <h1>Access restricted</h1>
          <p style={{ opacity: 0.7, maxWidth: 480, margin: "12px auto" }}>
            The Account page is only visible to the organization&apos;s owner.
            If you need to be added as the owner, contact your current owner.
          </p>
          <Link href={`/organizations/${orgId}`} style={{ color: "#35d5df" }}>
            Back to {org.name} →
          </Link>
        </div>
      </AppShell>
    );
  }

  // Fetch all teams in this org with their owner info
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, owner_id, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  // Collect distinct coach user IDs: the org owner + all team owners
  const coachUserIds = new Set<string>([org.owner_id]);
  (teams || []).forEach((t) => {
    if (t.owner_id) coachUserIds.add(t.owner_id);
  });

  // Profile lookup for those user IDs
  const { data: coachProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, primary_role")
    .in("id", Array.from(coachUserIds));

  // Build coach roster: name, role, # teams they own in this org, owner flag
  type Coach = {
    user_id: string;
    name: string;
    role: string | null;
    is_org_owner: boolean;
    teams_count: number;
    team_names: string[];
  };
  const coaches: Coach[] = Array.from(coachUserIds).map((uid) => {
    const profile = coachProfiles?.find((p) => p.id === uid);
    const ownedTeams = (teams || []).filter((t) => t.owner_id === uid);
    return {
      user_id: uid,
      name: profile?.full_name || "(coach name not set)",
      role: profile?.primary_role || null,
      is_org_owner: uid === org.owner_id,
      teams_count: ownedTeams.length,
      team_names: ownedTeams.map((t) => t.name),
    };
  });

  // Fetch pending coach invitations
  const { data: pendingInvites } = await supabase
    .from("org_coach_invitations")
    .select("id, email, recipient_name, invited_at, status, token")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("invited_at", { ascending: false });

  const profileResult = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = profileResult.data?.full_name || "";

  return (
    <AppShell active="organizations" userDisplayName={displayName}>
      <div style={{ marginBottom: 24 }}>
        <Link
          href={`/organizations/${orgId}`}
          style={{ fontSize: 12, color: "#9fc3c7", textDecoration: "none" }}
        >
          ← Back to {org.name}
        </Link>
      </div>

      <div className="e2k-page-head" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#35d5df", letterSpacing: 1.5, marginBottom: 4 }}>
            ACCOUNT
          </div>
          <h1 className="e2k-page-title">{org.name}</h1>
          <p className="e2k-page-sub">
            Organization settings, coaches, and payment configuration.
          </p>
        </div>
      </div>

      {/* SECTION 1 — Organization Details */}
      <section className="e2k-panel" style={{ marginBottom: 16 }}>
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">Organization Details</h2>
          <p className="e2k-panel-sub">Public-facing info for this org.</p>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <DetailRow label="Name" value={org.name} />
          <DetailRow label="Description" value={org.description || "(none)"} muted={!org.description} />
          <DetailRow label="Location" value={org.location || "(none)"} muted={!org.location} />
          <DetailRow
            label="Created"
            value={new Date(org.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <Link
            href={`/organizations/${orgId}/edit`}
            style={{
              display: "inline-block",
              padding: "8px 16px",
              background: "transparent",
              color: "#35d5df",
              border: "1px solid rgba(53, 213, 223, 0.4)",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Edit details →
          </Link>
        </div>
      </section>

      {/* SECTION 2 — Coaches */}
      <CoachesPanel
        orgId={orgId}
        orgName={org.name}
        coaches={coaches}
        pendingInvites={pendingInvites || []}
      />

      {/* SECTION 3 — Payments & Payouts (Stripe Connect placeholder) */}
      <section className="e2k-panel" style={{ marginBottom: 16, marginTop: 16 }}>
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">Payments &amp; Payouts</h2>
          <p className="e2k-panel-sub">
            How your organization receives money from Camp donations and Tournament Entry Fees.
          </p>
        </div>
        <div
          style={{
            padding: 18,
            background: "rgba(255, 208, 0, 0.05)",
            border: "1px solid rgba(255, 208, 0, 0.25)",
            borderRadius: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: "rgba(255, 208, 0, 0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              💳
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#ffd000" }}>
                Stripe — Not yet connected
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2, lineHeight: 1.5 }}>
                Real payments are coming in Phase 10. Once you connect Stripe,
                supporters and joining teams will be able to pay through the
                platform, and earnings will deposit directly to your
                organization&apos;s bank account.
              </div>
            </div>
            <button
              type="button"
              disabled
              style={{
                padding: "10px 20px",
                background: "rgba(255, 255, 255, 0.05)",
                color: "rgba(255, 255, 255, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 13,
                cursor: "not-allowed",
                flexShrink: 0,
              }}
            >
              Connect Stripe (coming soon)
            </button>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 14, background: "rgba(255, 255, 255, 0.02)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9fc3c7", letterSpacing: 1.2, marginBottom: 8 }}>
            HOW IT WILL WORK
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, lineHeight: 1.7, opacity: 0.85 }}>
            <li>
              Your organization connects its own Stripe account through a one-time onboarding flow.
            </li>
            <li>
              Supporters and joining teams pay through Stripe Checkout. Money routes directly to your
              bank account on Stripe&apos;s normal settlement schedule (typically 2–7 days).
            </li>
            <li>
              earn²keep takes a transparent platform fee per transaction (3.5% + $0.40), shown on every
              receipt.
            </li>
            <li>
              Tournament prize payouts: the host pays the winning team directly from their org bank
              account. earn²keep facilitates the competition but does not hold prize money.
            </li>
          </ul>
        </div>
      </section>

      {/* SECTION 4 — Business Info (placeholder) */}
      <section className="e2k-panel" style={{ marginBottom: 16 }}>
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">Business Information</h2>
          <p className="e2k-panel-sub">
            Tax ID, legal entity, and other business details required for payouts.
          </p>
        </div>
        <div
          style={{
            padding: 18,
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px dashed rgba(255, 255, 255, 0.12)",
            borderRadius: 10,
          }}
        >
          <p style={{ fontSize: 13, opacity: 0.6, margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: "#9fc3c7" }}>Coming in Phase 10.</strong>{" "}
            When you connect Stripe, the onboarding flow collects business identity, tax info, and
            bank details — Stripe stores them securely and handles compliance. This section will
            then surface your verification status and let you update any of those details.
          </p>
        </div>
      </section>
    </AppShell>
  );
}

function DetailRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 12,
        alignItems: "start",
        paddingBottom: 8,
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "#9fc3c7", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          opacity: muted ? 0.5 : 1,
          fontStyle: muted ? "italic" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

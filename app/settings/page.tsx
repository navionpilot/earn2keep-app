import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import LogoutButton from "@/components/LogoutButton";
import CoachAIAutoApproveToggle from "@/components/CoachAIAutoApproveToggle";
import OrganizationsLinks from "@/components/OrganizationsLinks";

const ROLE_LABELS: Record<string, string> = {
  coach: "Coach",
  parent: "Parent",
  teacher: "Teacher / School Administrator",
  youth_pastor: "Youth Pastor / Church Leader",
  scout_leader: "Scout / Troop Leader",
  gym_owner: "Gym Owner / Fitness Coach",
  org_director: "Organization Director",
  other: "Other",
};

function formatRole(rawRole: string | null | undefined): string | null {
  if (!rawRole) return null;
  return ROLE_LABELS[rawRole] || rawRole.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, primary_role, ai_auto_approve_enabled")
    .eq("id", user.id)
    .single();

  const displayName = profile?.full_name || "—";
  const initials =
    displayName
      .split(" ")
      .map((p: string) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const roleLabel = formatRole(profile?.primary_role);

  return (
    <AppShell active="settings" userDisplayName={displayName}>
      <div className="e2k-page-head">
        <div>
          <h1 className="e2k-page-title">Settings</h1>
          <p className="e2k-page-sub">Manage your account and profile.</p>
        </div>
      </div>

      <section className="e2k-panel">
        <div className="e2k-settings-profile">
          <div className="e2k-settings-avatar">{initials}</div>
          <div className="e2k-settings-info">
            <div className="e2k-settings-name">{displayName}</div>
            <div className="e2k-settings-email">{user.email}</div>
            {roleLabel && (
              <div className="e2k-settings-role">{roleLabel}</div>
            )}
          </div>
          <Link href="/profile/complete" className="e2k-link-cyan">
            Edit Profile →
          </Link>
        </div>
      </section>

      <section className="e2k-panel">
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">Quick Links</h2>
          <p className="e2k-panel-sub">Hop directly to common admin tasks.</p>
        </div>
        <div className="e2k-settings-links">
          <Link href="/profile/complete" className="e2k-settings-link">
            <div className="e2k-settings-link-title">Update Name &amp; Role</div>
            <div className="e2k-settings-link-desc">Change your name or what role best describes you.</div>
          </Link>
          <Link href="/reset-password" className="e2k-settings-link">
            <div className="e2k-settings-link-title">Change Password</div>
            <div className="e2k-settings-link-desc">Set a new password for your account.</div>
          </Link>
          <Link href="/help" className="e2k-settings-link">
            <div className="e2k-settings-link-title">Help &amp; Support</div>
            <div className="e2k-settings-link-desc">Browse help docs and FAQ.</div>
          </Link>
          <Link href="/dashboard" className="e2k-settings-link">
            <div className="e2k-settings-link-title">Back to Dashboard</div>
            <div className="e2k-settings-link-desc">Return to the main overview.</div>
          </Link>
        </div>
      </section>

      {/* L39 — Your Organizations: links to the org-level Account pages
          for any org the user owns. The Account page is where org-level
          config + Stripe Connect + coaches live (vs this Settings page
          which is user-level). */}
      <OrganizationsLinks userId={user.id} />

      <section className="e2k-panel">
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">AI Verification</h2>
          <p className="e2k-panel-sub">
            Control how AI assists with reviewing submissions for the players you organize.
          </p>
        </div>
        <CoachAIAutoApproveToggle
          userId={user.id}
          initialEnabled={profile?.ai_auto_approve_enabled === true}
        />
      </section>

      <section className="e2k-panel">
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">Sign Out</h2>
          <p className="e2k-panel-sub">
            End your session on this device. You can sign back in anytime.
          </p>
        </div>
        <div style={{ paddingTop: 4 }}>
          <LogoutButton />
        </div>
      </section>

      <section className="e2k-panel">
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">About</h2>
          <p className="e2k-panel-sub">Platform &amp; support details.</p>
        </div>
        <div className="e2k-settings-about">
          <p>
            <strong>earn²keep</strong> — Earn it. Keep it. Where fundraising
            meets motivation: teams compete in verified challenges to earn
            supporter donations.
          </p>
          <p className="e2k-settings-tag">earn²keep · Earn it. Keep it.</p>
        </div>
      </section>
    </AppShell>
  );
}

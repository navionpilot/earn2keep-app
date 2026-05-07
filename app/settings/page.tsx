import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, primary_role")
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
            {profile?.primary_role && (
              <div className="e2k-settings-role">{profile.primary_role}</div>
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
            <div className="e2k-settings-link-title">Update Profile</div>
            <div className="e2k-settings-link-desc">Change your name, role, or organization details.</div>
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

      <section className="e2k-panel">
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">About</h2>
          <p className="e2k-panel-sub">Platform &amp; support details.</p>
        </div>
        <div className="e2k-settings-about">
          <p>
            <strong>earn²keep</strong> — Earn it. Keep it. The fundraising
            platform where teams compete in verified challenges.
          </p>
          <p className="e2k-settings-tag">Phase 4 · Coach experience</p>
        </div>
      </section>
    </AppShell>
  );
}

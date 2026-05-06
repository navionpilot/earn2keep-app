import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import Tooltip from "@/components/Tooltip";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, primary_role")
    .eq("id", user?.id)
    .single();

  // If full_name is missing or empty, send user to profile completion page
  if (!profile?.full_name || profile.full_name.trim().length === 0) {
    redirect("/profile/complete");
  }

  // Fetch user's organizations
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, org_type, city, state, created_at")
    .eq("owner_id", user?.id)
    .order("created_at", { ascending: false });

  const displayName = profile.full_name.trim().split(" ")[0];

  const orgCount = organizations?.length || 0;
  const hasOrganization = orgCount > 0;

  return (
    <div className="dashboard">
      <div className="dashboard-ticker">
        <div className="dashboard-ticker-inner">
          <span className="dashboard-ticker-live">● PLATFORM PREVIEW</span>
          <span>You're in the early access program</span>
          <span>·</span>
          <span>Phase 4 features rolling out</span>
        </div>
      </div>

      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">
              earn<sup className="logo-sup">2</sup>keep
            </span>
          </Link>

          <div className="dashboard-user-section">
            <span className="dashboard-user-email">
              {profile.full_name}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <OnboardingSidebar hasOrganization={hasOrganization} />

        <main className="dashboard-main-with-sidebar">
          <h1 className="dashboard-welcome">Welcome, {displayName}</h1>
          <p className="dashboard-subtitle">
            {hasOrganization
              ? "Here's where you'll manage your teams and earn²keep events."
              : "Let's get your organization set up so you can start your first Camp."}
          </p>

          {!hasOrganization && (
            <div className="welcome-banner">
              <div className="welcome-banner-icon">👋</div>
              <div>
                <h3 className="welcome-banner-title">First time here? Start with Step 1.</h3>
                <p className="welcome-banner-text">
                  Earn²keep works in 5 simple steps. Right now you're at{" "}
                  <strong>Step 1: Create your organization</strong>. The sidebar
                  on the left tracks your progress as you complete each step.
                </p>
              </div>
            </div>
          )}

          {orgCount === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span style={{ fontSize: "48px" }}>🏆</span>
              </div>
              <h2 className="empty-state-title">Let's start with your organization</h2>
              <p className="empty-state-text">
                An organization is your school, club, church, troop, or gym.
                You'll create teams and run events under your organization.
              </p>
              <Link href="/organizations/new" className="btn-primary-link">
                Create Your First Organization →
              </Link>
              <div style={{ marginTop: "16px" }}>
                <Tooltip text="An organization is the top-level group for your fundraising. Think of it as your school, your church youth ministry, or your scout troop. You can have more than one if you coach for multiple groups.">
                  <a className="help-link">❓ What's an organization?</a>
                </Tooltip>
              </div>
            </div>
          ) : (
            <>
              <div className="section-header">
                <h2 className="section-heading">Your Organizations</h2>
                <Tooltip text="Add another organization if you coach for multiple groups (e.g., a school team and a church youth group).">
                  <Link href="/organizations/new" className="btn-add">
                    + Add Organization
                  </Link>
                </Tooltip>
              </div>

              <div className="org-grid">
                {organizations?.map((org) => (
                  <Link
                    href={`/organizations/${org.id}`}
                    key={org.id}
                    className="org-card"
                  >
                    <div className="org-card-type-pill">{org.org_type || "Organization"}</div>
                    <h3 className="org-card-name">{org.name}</h3>
                    {(org.city || org.state) && (
                      <p className="org-card-location">
                        {[org.city, org.state].filter(Boolean).join(", ")}
                      </p>
                    )}
                    <div className="org-card-action">Manage →</div>
                  </Link>
                ))}
              </div>

              <div className="dashboard-card" style={{ marginTop: "32px" }}>
                <h2 className="dashboard-card-title">
                  Coming Next
                  <span className="coming-soon-tag">Slice 4.2</span>
                </h2>
                <p className="dashboard-card-text">
                  Once you've created your organization, the next slice will let
                  you create teams within it (e.g., "Lincoln Lions U14" inside
                  your school athletics program).
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

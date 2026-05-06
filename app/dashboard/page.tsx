import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

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

  // Fetch user's organizations
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, org_type, city, state, created_at")
    .eq("owner_id", user?.id)
    .order("created_at", { ascending: false });

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Coach";
  const orgCount = organizations?.length || 0;

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
            <span className="dashboard-user-email">{user?.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <h1 className="dashboard-welcome">Welcome, {displayName}</h1>
        <p className="dashboard-subtitle">
          Here's where you'll manage your teams and earn²keep events.
        </p>

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
          </div>
        ) : (
          <>
            <div className="section-header">
              <h2 className="section-heading">Your Organizations</h2>
              <Link href="/organizations/new" className="btn-add">
                + Add Organization
              </Link>
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
                "Lincoln Middle School").
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

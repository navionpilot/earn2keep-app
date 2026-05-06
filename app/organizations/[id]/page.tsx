import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import Tooltip from "@/components/Tooltip";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user?.id)
    .single();

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user?.id)
    .single();

  if (!org) {
    notFound();
  }

  // Fetch teams within this organization
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, sport_or_activity, age_group, description, created_at")
    .eq("organization_id", id)
    .eq("owner_id", user?.id)
    .order("created_at", { ascending: false });

  const teamCount = teams?.length || 0;

  // For sidebar: check if user has any teams across all orgs
  const { count: totalTeamCount } = await supabase
    .from("teams")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id);

  const hasTeams = (totalTeamCount || 0) > 0;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">
              earn<sup className="logo-sup">2</sup>keep
            </span>
          </Link>

          <div className="dashboard-user-section">
            <span className="dashboard-user-email">
              {profile?.full_name?.trim() || user?.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <OnboardingSidebar hasOrganization={true} hasTeams={hasTeams} />

        <main className="dashboard-main-with-sidebar">
          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">{org.name}</span>
          </div>

          <div className="org-header">
            <div>
              <span className="org-detail-type-pill">{org.org_type}</span>
              <h1 className="dashboard-welcome">{org.name}</h1>
              {(org.city || org.state) && (
                <p className="org-detail-location">
                  {[org.city, org.state].filter(Boolean).join(", ")}
                </p>
              )}
              {org.description && (
                <p className="org-detail-description">{org.description}</p>
              )}
            </div>
            <Tooltip text="Update your organization name, type, location, or description.">
              <Link href={`/organizations/${org.id}/edit`} className="btn-secondary-link">
                Edit Organization
              </Link>
            </Tooltip>
          </div>

          {teamCount === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span style={{ fontSize: "48px" }}>🏃</span>
              </div>
              <h2 className="empty-state-title">Add Your First Team</h2>
              <p className="empty-state-text">
                A team is a group of players that competes together.
                Examples: "Lincoln Lions U14", "Sunday School 9th Grade",
                or "Troop 142 Eagle Patrol".
              </p>
              <Link href={`/organizations/${org.id}/teams/new`} className="btn-primary-link">
                Add Your First Team →
              </Link>
              <div style={{ marginTop: "16px" }}>
                <Tooltip text="Teams are groups within your organization. A school might have multiple teams (boys soccer, girls basketball). A church might have grade-level groups. Add as many as you need.">
                  <a className="help-link">❓ What's a team?</a>
                </Tooltip>
              </div>
            </div>
          ) : (
            <>
              <div className="section-header">
                <h2 className="section-heading">Teams</h2>
                <Tooltip text="Add another team to this organization.">
                  <Link href={`/organizations/${org.id}/teams/new`} className="btn-add">
                    + Add Team
                  </Link>
                </Tooltip>
              </div>

              <div className="org-grid">
                {teams?.map((team) => (
                  <Link
                    href={`/teams/${team.id}`}
                    key={team.id}
                    className="org-card"
                  >
                    <div className="org-card-type-pill">{team.sport_or_activity || "Team"}</div>
                    <h3 className="org-card-name">{team.name}</h3>
                    {team.age_group && (
                      <p className="org-card-location">{team.age_group}</p>
                    )}
                    <div className="org-card-action">Manage →</div>
                  </Link>
                ))}
              </div>
            </>
          )}

          <div className="dashboard-card" style={{ marginTop: "32px" }}>
            <h2 className="dashboard-card-title">
              Events
              <span className="coming-soon-tag">Slice 4.4</span>
            </h2>
            <p className="dashboard-card-text">
              Once you have teams with players, you'll create Camps and
              Tournaments here — with weekly challenges, sponsor QR codes,
              and prize structures.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

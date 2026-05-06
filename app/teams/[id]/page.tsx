import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import Tooltip from "@/components/Tooltip";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function TeamDetailPage({
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

  // Fetch the team
  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user?.id)
    .single();

  if (!team) {
    notFound();
  }

  // Fetch the parent organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", team.organization_id)
    .single();

  // For sidebar
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
            {org && (
              <>
                <Link href={`/organizations/${org.id}`} className="breadcrumb-link">
                  {org.name}
                </Link>
                <span className="breadcrumb-sep">›</span>
              </>
            )}
            <span className="breadcrumb-current">{team.name}</span>
          </div>

          <div className="org-header">
            <div>
              <span className="org-detail-type-pill">{team.sport_or_activity}</span>
              <h1 className="dashboard-welcome">{team.name}</h1>
              {team.age_group && (
                <p className="org-detail-location">{team.age_group}</p>
              )}
              {team.description && (
                <p className="org-detail-description">{team.description}</p>
              )}
            </div>
            <Tooltip text="Update team name, sport, age group, or description.">
              <Link href={`/teams/${team.id}/edit`} className="btn-secondary-link">
                Edit Team
              </Link>
            </Tooltip>
          </div>

          <div className="dashboard-card">
            <h2 className="dashboard-card-title">
              Players (Roster)
              <span className="coming-soon-tag">Slice 4.3</span>
            </h2>
            <p className="dashboard-card-text">
              In the next slice, you'll be able to add players to this team —
              with names, jersey numbers, and optional verification photos.
            </p>
          </div>

          <div className="dashboard-card">
            <h2 className="dashboard-card-title">
              Events
              <span className="coming-soon-tag">Slice 4.4</span>
            </h2>
            <p className="dashboard-card-text">
              Once you have players on this team, you'll create Camps and
              Tournaments where they can compete.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

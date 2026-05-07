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

  // Teams in this org
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, sport_or_activity, age_group, description, created_at")
    .eq("organization_id", id)
    .eq("owner_id", user?.id)
    .order("created_at", { ascending: false });

  // Events in this org
  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_type, status, start_date, end_date, goal_amount, goal_type")
    .eq("organization_id", id)
    .eq("owner_id", user?.id)
    .order("created_at", { ascending: false });

  const teamCount = teams?.length || 0;
  const eventCount = events?.length || 0;

  // For sidebar
  const { count: totalTeamCount } = await supabase
    .from("teams")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id);

  const { count: totalPlayerCount } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id);

  const { count: totalEventCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id);

  const hasTeams = (totalTeamCount || 0) > 0;
  const hasPlayers = (totalPlayerCount || 0) > 0;
  const hasEvent = (totalEventCount || 0) > 0;

  // helper to format dates nicely
  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return null;
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (start && end) {
      const s = new Date(start).toLocaleDateString("en-US", opts);
      const e = new Date(end).toLocaleDateString("en-US", { ...opts, year: "numeric" });
      return `${s} – ${e}`;
    }
    return new Date(start || end!).toLocaleDateString("en-US", { ...opts, year: "numeric" });
  };

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
        <OnboardingSidebar
          hasOrganization={true}
          hasTeams={hasTeams}
          hasPlayers={hasPlayers}
          hasEvent={hasEvent}
        />

        <main className="dashboard-main-with-sidebar">
          <Link href="/dashboard" className="btn-back">
            ← Back to Dashboard
          </Link>

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

          {/* TEAMS SECTION */}
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

          {/* EVENTS SECTION */}
          <div style={{ marginTop: "40px" }}>
            {eventCount === 0 && teamCount > 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <span style={{ fontSize: "48px" }}>🏆</span>
                </div>
                <h2 className="empty-state-title">Create Your First Event</h2>
                <p className="empty-state-text">
                  Two types: a <strong>Camp</strong> is a fundraiser where one
                  team competes — each player raises a minimum amount through
                  sponsors. A <strong>Tournament</strong> is a registration-fee
                  competition between multiple teams.
                </p>
                <Link href={`/organizations/${org.id}/events/new`} className="btn-primary-link">
                  Create Your First Event →
                </Link>
                <div style={{ marginTop: "16px" }}>
                  <Tooltip text="Camp = one team, fundraiser model: each player raises a minimum amount through sponsors. Tournament = multiple teams, registration model: each player pays a flat entry fee.">
                    <a className="help-link">❓ What's the difference between a Camp and a Tournament?</a>
                  </Tooltip>
                </div>
              </div>
            ) : eventCount > 0 ? (
              <>
                <div className="section-header">
                  <h2 className="section-heading">Events</h2>
                  <Tooltip text="Create another Camp or Tournament for this organization.">
                    <Link href={`/organizations/${org.id}/events/new`} className="btn-add">
                      + Create Event
                    </Link>
                  </Tooltip>
                </div>

                <div className="org-grid">
                  {events?.map((event) => (
                    <Link
                      href={`/events/${event.id}`}
                      key={event.id}
                      className="org-card"
                    >
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <span className="org-card-type-pill">
                          {event.event_type === "camp" ? "Camp" : "Tournament"}
                        </span>
                        <span className={`status-pill status-${event.status || "draft"}`}>
                          {event.status === "active" ? "Active" : event.status === "completed" ? "Completed" : "Draft"}
                        </span>
                      </div>
                      <h3 className="org-card-name">{event.name}</h3>
                      {formatDateRange(event.start_date, event.end_date) && (
                        <p className="org-card-location">
                          {formatDateRange(event.start_date, event.end_date)}
                        </p>
                      )}
                      {event.goal_amount && (
                        <p className="event-goal-text">
                          {event.event_type === "camp"
                            ? `$${Number(event.goal_amount).toLocaleString()}/player goal`
                            : `$${Number(event.goal_amount).toLocaleString()}/player entry`}
                        </p>
                      )}
                      <div className="org-card-action">Manage →</div>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

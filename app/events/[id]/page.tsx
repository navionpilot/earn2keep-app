import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import Tooltip from "@/components/Tooltip";
import Link from "next/link";
import { notFound } from "next/navigation";
import EventStatusButton from "@/components/EventStatusButton";

export default async function EventDetailPage({
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

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user?.id)
    .single();

  if (!event) {
    notFound();
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", event.organization_id)
    .single();

  // Get participating teams via event_participants
  const { data: participants } = await supabase
    .from("event_participants")
    .select("team_id, teams(id, name, sport_or_activity, age_group)")
    .eq("event_id", id);

  const teams = (participants || [])
    .map((p: any) => p.teams)
    .filter(Boolean);

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

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return null;
    const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
    if (start && end) {
      const sameYear = new Date(start).getFullYear() === new Date(end).getFullYear();
      const s = sameYear
        ? new Date(start).toLocaleDateString("en-US", { month: "long", day: "numeric" })
        : new Date(start).toLocaleDateString("en-US", opts);
      const e = new Date(end).toLocaleDateString("en-US", opts);
      return `${s} – ${e}`;
    }
    return new Date(start || end!).toLocaleDateString("en-US", opts);
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
          hasTeams={(totalTeamCount || 0) > 0}
          hasPlayers={(totalPlayerCount || 0) > 0}
          hasEvent={(totalEventCount || 0) > 0}
        />

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
            <span className="breadcrumb-current">{event.name}</span>
          </div>

          <div className="org-header">
            <div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                <span className="org-detail-type-pill">
                  {event.event_type === "camp" ? "Camp" : "Tournament"}
                </span>
                <span className={`status-pill status-${event.status || "draft"}`}>
                  {event.status === "active" ? "Active" : event.status === "completed" ? "Completed" : "Draft"}
                </span>
              </div>
              <h1 className="dashboard-welcome">{event.name}</h1>
              {formatDateRange(event.start_date, event.end_date) && (
                <p className="org-detail-location">
                  📅 {formatDateRange(event.start_date, event.end_date)}
                </p>
              )}
              {event.description && (
                <p className="org-detail-description">{event.description}</p>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <EventStatusButton eventId={event.id} currentStatus={event.status} />
              <Tooltip text="Update event details, participating teams, goals, or prizes.">
                <Link href={`/events/${event.id}/edit`} className="btn-secondary-link">
                  Edit Event
                </Link>
              </Tooltip>
            </div>
          </div>

          {/* Quick stats grid */}
          <div className="event-stats-grid">
            <div className="event-stat-cell">
              <div className="event-stat-label">Teams</div>
              <div className="event-stat-value">{teams.length}</div>
              <div className="event-stat-sub">Participating</div>
            </div>
            <div className="event-stat-cell">
              <div className="event-stat-label">Goal</div>
              <div className="event-stat-value">
                {event.goal_amount
                  ? `$${Number(event.goal_amount).toLocaleString()}`
                  : "—"}
              </div>
              <div className="event-stat-sub">
                {event.goal_amount
                  ? event.goal_type === "per_player"
                    ? "Per player"
                    : "Per team"
                  : "Not set"}
              </div>
            </div>
            <div className="event-stat-cell">
              <div className="event-stat-label">Prize Tiers</div>
              <div className="event-stat-value">{event.prize_count || 1}</div>
              <div className="event-stat-sub">
                {event.prize_count === 1 ? "Winner" : "Winners"}
              </div>
            </div>
            <div className="event-stat-cell">
              <div className="event-stat-label">Status</div>
              <div className={`event-stat-value status-text-${event.status || "draft"}`}>
                {event.status === "active" ? "Active" : event.status === "completed" ? "Done" : "Draft"}
              </div>
              <div className="event-stat-sub">
                {event.status === "draft" ? "Setting up" : event.status === "active" ? "Running now" : "Ended"}
              </div>
            </div>
          </div>

          {/* Participating Teams */}
          <div className="dashboard-card">
            <h2 className="dashboard-card-title">Participating Teams</h2>
            {teams.length > 0 ? (
              <div className="event-team-list">
                {teams.map((team: any) => (
                  <Link
                    href={`/teams/${team.id}`}
                    key={team.id}
                    className="event-team-chip"
                  >
                    <span className="event-team-chip-name">{team.name}</span>
                    <span className="event-team-chip-meta">
                      {team.sport_or_activity}
                      {team.age_group && ` · ${team.age_group}`}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="dashboard-card-text">No teams linked to this event.</p>
            )}
          </div>

          {/* Prizes */}
          {(event.first_place_prize || event.second_place_prize || event.third_place_prize) && (
            <div className="dashboard-card">
              <h2 className="dashboard-card-title">Prizes</h2>
              <div className="prize-list">
                {event.first_place_prize && (
                  <div className="prize-row">
                    <span className="prize-medal">🥇</span>
                    <div>
                      <div className="prize-place">1st Place</div>
                      <div className="prize-text">{event.first_place_prize}</div>
                    </div>
                  </div>
                )}
                {event.second_place_prize && (
                  <div className="prize-row">
                    <span className="prize-medal">🥈</span>
                    <div>
                      <div className="prize-place">2nd Place</div>
                      <div className="prize-text">{event.second_place_prize}</div>
                    </div>
                  </div>
                )}
                {event.third_place_prize && (
                  <div className="prize-row">
                    <span className="prize-medal">🥉</span>
                    <div>
                      <div className="prize-place">3rd Place</div>
                      <div className="prize-text">{event.third_place_prize}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coming next placeholders */}
          <div className="dashboard-card">
            <h2 className="dashboard-card-title">
              Challenges
              <span className="coming-soon-tag">Slice 4.5</span>
            </h2>
            <p className="dashboard-card-text">
              In the next slice, you'll pick from a library of 50+ challenges
              (push-ups, free throws, Bible verses, mile run, service hours)
              and assign them to this event with rep targets.
            </p>
          </div>

          <div className="dashboard-card">
            <h2 className="dashboard-card-title">
              Sponsor QR Codes
              <span className="coming-soon-tag">Slice 4.6</span>
            </h2>
            <p className="dashboard-card-text">
              Once challenges are set, each player gets a unique QR code that
              family, friends, and local businesses scan to fund their entry.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

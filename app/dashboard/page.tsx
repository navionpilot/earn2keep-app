import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import HeroCard from "@/components/HeroCard";
import StatRow, { type Stat } from "@/components/StatRow";
import EventTypeCard from "@/components/EventTypeCard";
import EventListRow, { type EventListItem } from "@/components/EventListRow";

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00").getTime();
  const b = new Date(toIso + "T00:00:00").getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

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

  if (!profile?.full_name || profile.full_name.trim().length === 0) {
    redirect("/profile/complete");
  }

  // Org list (used for the "create event" CTA destination)
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, org_type, city, state, created_at")
    .eq("owner_id", user?.id)
    .order("created_at", { ascending: false });

  // Roster + event counts (real numbers; sponsorship/payment data isn't live yet)
  const [{ count: teamCount }, { count: playerCount }, { count: eventCount }] = await Promise.all([
    supabase.from("teams").select("*", { count: "exact", head: true }).eq("owner_id", user?.id),
    supabase.from("players").select("*", { count: "exact", head: true }).eq("owner_id", user?.id),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("owner_id", user?.id),
  ]);

  // Active events for the at-a-glance list. Defensive: events.status may be null
  // for legacy rows, so we treat anything not 'completed' as active.
  const { data: activeEventsRaw } = await supabase
    .from("events")
    .select(
      "id, name, event_type, status, start_date, end_date, fundraising_goal, registration_fee"
    )
    .eq("owner_id", user?.id)
    .neq("status", "completed")
    .order("start_date", { ascending: true })
    .limit(10);

  const events: EventListItem[] = [];
  for (const ev of activeEventsRaw || []) {
    // Player count + team count for this event
    const [{ data: parts }, { data: evPlayers }] = await Promise.all([
      supabase.from("event_participants").select("team_id").eq("event_id", ev.id),
      supabase
        .from("event_participants")
        .select("team_id, teams!inner(players(id))")
        .eq("event_id", ev.id),
    ]);
    const teamIds = (parts || []).map((p: any) => p.team_id);
    let playersInEvent = 0;
    (evPlayers || []).forEach((row: any) => {
      const ps = row.teams?.players || [];
      playersInEvent += Array.isArray(ps) ? ps.length : 0;
    });

    const today = new Date().toISOString().slice(0, 10);
    const daysLeft = ev.end_date ? daysBetween(today, ev.end_date) : null;

    // Money raised — sponsorship payments aren't shipped yet, so this is 0
    // for every event today. The UI handles 0 gracefully.
    const raised = 0;
    const goal =
      ev.event_type === "camp"
        ? Number(ev.fundraising_goal) || 0
        : (Number(ev.registration_fee) || 0) * playersInEvent;

    events.push({
      id: ev.id,
      name: ev.name,
      event_type: (ev.event_type === "tournament" ? "tournament" : "camp"),
      start_date: ev.start_date,
      end_date: ev.end_date,
      player_count: playersInEvent,
      team_count: ev.event_type === "tournament" ? teamIds.length : undefined,
      amount_raised: raised,
      amount_goal: goal > 0 ? goal : null,
      days_left: daysLeft,
    });
  }

  // Top-level stats for the StatRow
  const totalGoal = events.reduce((sum, e) => sum + (e.amount_goal || 0), 0);
  const totalRaised = events.reduce((sum, e) => sum + e.amount_raised, 0);
  const overallProgressPct = totalGoal > 0
    ? Math.round((totalRaised / totalGoal) * 100)
    : 0;

  const stats: Stat[] = [
    {
      num: "$" + totalRaised.toLocaleString("en-US"),
      label: "Total Raised",
      trend: totalRaised > 0 ? "Across all events" : "Sponsorships ship in Phase 5",
      trendTone: totalRaised > 0 ? "positive" : "neutral",
    },
    {
      num: String(playerCount || 0),
      label: "Players",
      trend: (playerCount || 0) > 0 ? "On your rosters" : "Add players to start",
      trendTone: (playerCount || 0) > 0 ? "positive" : "neutral",
    },
    {
      num: String(eventCount || 0),
      label: "Events",
      trend: events.length > 0 ? `${events.length} active` : "None yet",
      trendTone: (eventCount || 0) > 0 ? "positive" : "neutral",
    },
    {
      num: String(teamCount || 0),
      label: "Teams",
      trend: (teamCount || 0) > 0 ? "Across organizations" : "Add a team",
      trendTone: (teamCount || 0) > 0 ? "positive" : "neutral",
    },
  ];

  // Setup state for the empty-state experience
  const orgCount = organizations?.length || 0;
  const hasOrganization = orgCount > 0;
  const hasTeams = (teamCount || 0) > 0;
  const hasPlayers = (playerCount || 0) > 0;
  const hasEvent = (eventCount || 0) > 0;

  // Where does "+ Create Event" go? Most-recent org, or org-creation if none.
  const newEventHref = hasOrganization
    ? `/organizations/${organizations![0].id}/events/new`
    : "/organizations/new";
  const newCampHref = newEventHref + "?type=camp";
  const newTournamentHref = newEventHref + "?type=tournament";

  // Hero copy adapts to setup state
  const heroSubtitle = !hasOrganization
    ? "Create your organization to get started."
    : !hasTeams
    ? "Add a team to your organization next."
    : !hasPlayers
    ? "Build your roster to launch your first event."
    : !hasEvent
    ? "Your roster is ready — create your first event."
    : "Keep the momentum going!";

  return (
    <AppShell active="overview" userDisplayName={profile.full_name}>
      <HeroCard
        subtitle={heroSubtitle}
        progressPct={overallProgressPct}
        cta={{ label: "Create Event", href: newEventHref }}
      />

      <StatRow stats={stats} />

      {/* Setup nudge — only when not fully set up */}
      {(!hasOrganization || !hasTeams || !hasPlayers) && (
        <SetupBanner
          hasOrganization={hasOrganization}
          hasTeams={hasTeams}
          hasPlayers={hasPlayers}
          orgs={organizations || []}
        />
      )}

      <section className="e2k-panel">
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">Choose Your Event Type</h2>
          <p className="e2k-panel-sub">Select the option that matches your goals.</p>
        </div>
        <div className="e2k-type-row">
          <EventTypeCard
            variant="camp"
            title="Camp"
            description="One team. Fundraise to hit minimums. Raise more, earn more points."
            href={newCampHref}
            ctaLabel="Create Camp"
          />
          <EventTypeCard
            variant="tournament"
            title="Tournament"
            description="Multi-team competition. Flat registration fee. Compete and win amazing prizes."
            href={newTournamentHref}
            ctaLabel="Create Tournament"
          />
        </div>
      </section>

      <section className="e2k-panel">
        <div className="e2k-panel-head e2k-panel-head-row">
          <div>
            <h2 className="e2k-panel-title">Events at a Glance</h2>
            <p className="e2k-panel-sub">Active fundraising campaigns.</p>
          </div>
          {hasOrganization && (
            <Link
              href={`/organizations/${organizations![0].id}`}
              className="e2k-link-cyan"
            >
              View All →
            </Link>
          )}
        </div>
        {events.length === 0 ? (
          <div className="e2k-empty">
            {hasEvent ? (
              <>
                <p>All your events are complete. Create a new one to keep going.</p>
                <Link href={newEventHref} className="e2k-link-cyan">
                  Create new event →
                </Link>
              </>
            ) : (
              <>
                <p>No events yet — your first one is just a few clicks away.</p>
                {hasPlayers && (
                  <Link href={newEventHref} className="e2k-link-cyan">
                    Create your first event →
                  </Link>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="e2k-events-list">
            {events.slice(0, 5).map((ev) => (
              <EventListRow key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </section>

      {/* Organization list — kept on the dashboard so coaches with multiple
          orgs can hop between them. The visual is updated to match the
          new design system. */}
      {orgCount > 0 && (
        <section className="e2k-panel">
          <div className="e2k-panel-head e2k-panel-head-row">
            <div>
              <h2 className="e2k-panel-title">Your Organizations</h2>
              <p className="e2k-panel-sub">Manage teams and events under each one.</p>
            </div>
            <Link href="/organizations/new" className="e2k-link-cyan">
              + New Org
            </Link>
          </div>
          <div className="e2k-org-grid">
            {organizations!.map((org) => (
              <Link
                key={org.id}
                href={`/organizations/${org.id}`}
                className="e2k-org-card"
              >
                <div className="e2k-org-type">{org.org_type || "Organization"}</div>
                <div className="e2k-org-name">{org.name}</div>
                {(org.city || org.state) && (
                  <div className="e2k-org-loc">
                    {[org.city, org.state].filter(Boolean).join(", ")}
                  </div>
                )}
                <div className="e2k-org-action">Manage →</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function SetupBanner({
  hasOrganization,
  hasTeams,
  hasPlayers,
  orgs,
}: {
  hasOrganization: boolean;
  hasTeams: boolean;
  hasPlayers: boolean;
  orgs: { id: string; name: string }[];
}) {
  let title = "";
  let body = "";
  let ctaLabel = "";
  let ctaHref = "";
  if (!hasOrganization) {
    title = "Step 1: Create your organization";
    body =
      "An organization is your school, club, church, troop, or gym. You'll create teams and run events under your organization.";
    ctaLabel = "Create your first organization";
    ctaHref = "/organizations/new";
  } else if (!hasTeams) {
    title = "Step 2: Add a team";
    body = `Click into ${orgs[0]?.name || "your organization"}, then create a team (e.g., "Lincoln Lions U14"). You can add as many teams as you need.`;
    ctaLabel = "Open your organization";
    ctaHref = `/organizations/${orgs[0]?.id}`;
  } else if (!hasPlayers) {
    title = "Step 3: Add players to your roster";
    body =
      "Click into your team, then add the players who will be competing. You can add them one at a time or import a CSV from TeamSnap, GameChanger, or SportsEngine.";
    ctaLabel = "Open your team";
    ctaHref = `/organizations/${orgs[0]?.id}`;
  }
  return (
    <div className="e2k-setup-banner">
      <div className="e2k-setup-icon">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 12l2 2l4 -4" />
          <path d="M12 21a9 9 0 1 1 0 -18a9 9 0 0 1 0 18z" />
        </svg>
      </div>
      <div className="e2k-setup-body">
        <h3 className="e2k-setup-title">{title}</h3>
        <p className="e2k-setup-text">{body}</p>
        <div className="e2k-setup-actions">
          <Link href={ctaHref} className="e2k-link-cyan">
            {ctaLabel} →
          </Link>
          <Link href="/setup-guide" className="e2k-link-muted">
            Or read the Setup Guide first →
          </Link>
        </div>
      </div>
    </div>
  );
}

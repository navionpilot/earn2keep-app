import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function TeamsIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // All teams owned by user, with their org name and ACTIVE player count.
  // Slice 5.7.2: filter the joined players to is_active=true so the count
  // matches the team-detail page's "Roster (N)" — soft-deleted players
  // shouldn't inflate the index page's "X players total" line.
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, age_group, organization_id, organizations(id, name), players(id, is_active)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  // Filter the players client-side after the query (PostgREST doesn't
  // easily express "filter joined rows where col=true" in a single call;
  // the join's count is small per team so client-filter is fine).
  type TeamWithPlayers = {
    id: string;
    name: string;
    age_group: string | null;
    organization_id: string;
    organizations: { id: string; name: string } | { id: string; name: string }[] | null;
    players: { id: string; is_active: boolean | null }[] | null;
  };
  const teamsTyped = (teams || []) as TeamWithPlayers[];
  const teamsCleaned = teamsTyped.map((t) => ({
    ...t,
    players: (t.players || []).filter((p) => p.is_active !== false),
  }));

  // Most-recent org for "+ New Team" CTA
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const newTeamHref = orgs && orgs[0]
    ? `/organizations/${orgs[0].id}/teams/new`
    : "/organizations/new";

  const totalPlayers = teamsCleaned.reduce(
    (sum, t) => sum + (t.players?.length || 0),
    0
  );

  return (
    <AppShell active="teams" userDisplayName={profile?.full_name || ""}>
      <div className="e2k-page-head">
        <div>
          <h1 className="e2k-page-title">Teams</h1>
          <p className="e2k-page-sub">
            {teamsCleaned.length > 0
              ? `${teamsCleaned.length} ${teamsCleaned.length === 1 ? "team" : "teams"} · ${totalPlayers} ${totalPlayers === 1 ? "player/participant" : "players/participants"} total`
              : "Add your first team to start building rosters."}
          </p>
        </div>
        <Link href={newTeamHref} className="e2k-btn-coral">
          <span className="e2k-btn-plus">+</span> New Team
        </Link>
      </div>

      {!teamsCleaned || teamsCleaned.length === 0 ? (
        <section className="e2k-panel">
          <div className="e2k-empty">
            <p>You don&apos;t have any teams yet.</p>
            <p style={{ marginTop: "8px", fontSize: "13px", color: "var(--e2k-text-muted)" }}>
              A team is the group of players who&apos;ll compete together in an
              event. Most coaches create one team per age group or skill level.
              Examples: &ldquo;Lincoln Lions U14,&rdquo; &ldquo;MS Rush O9B
              ECNL,&rdquo; &ldquo;Wednesday Night Youth Group.&rdquo;
            </p>
            <p style={{ marginTop: "8px", fontSize: "13px", color: "var(--e2k-text-muted)" }}>
              You&apos;ll need an organization first — teams live under an org.
              If you haven&apos;t made one yet, that&apos;s the place to start.
            </p>
            <Link href={newTeamHref} className="e2k-link-cyan" style={{ marginTop: "16px", display: "inline-block" }}>
              Create your first team →
            </Link>
          </div>
        </section>
      ) : (
        <section className="e2k-panel">
          <div className="e2k-team-grid">
            {teamsCleaned.map((team) => {
              const orgRel = Array.isArray(team.organizations)
                ? team.organizations[0]
                : team.organizations;
              return (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="e2k-team-card"
              >
                <div className="e2k-team-card-org">
                  {orgRel?.name || "—"}
                </div>
                <div className="e2k-team-card-name">{team.name}</div>
                {team.age_group && (
                  <div className="e2k-team-card-age">{team.age_group}</div>
                )}
                <div className="e2k-team-card-stats">
                  <span>
                    <strong>{team.players?.length || 0}</strong>{" "}
                    {team.players?.length === 1 ? "player/participant" : "players/participants"}
                  </span>
                </div>
                <div className="e2k-team-card-action">Manage →</div>
              </Link>
              );
            })}
          </div>
        </section>
      )}
    </AppShell>
  );
}

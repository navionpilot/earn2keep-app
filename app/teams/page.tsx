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

  // All teams owned by user, with their org name and player count
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, age_group, organization_id, organizations(id, name), players(id)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

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

  const totalPlayers = (teams || []).reduce(
    (sum: number, t: any) => sum + (t.players?.length || 0),
    0
  );

  return (
    <AppShell active="teams" userDisplayName={profile?.full_name || ""}>
      <div className="e2k-page-head">
        <div>
          <h1 className="e2k-page-title">Teams</h1>
          <p className="e2k-page-sub">
            {teams && teams.length > 0
              ? `${teams.length} ${teams.length === 1 ? "team" : "teams"} · ${totalPlayers} ${totalPlayers === 1 ? "player" : "players"} total`
              : "Add your first team to start building rosters."}
          </p>
        </div>
        <Link href={newTeamHref} className="e2k-btn-coral">
          <span className="e2k-btn-plus">+</span> New Team
        </Link>
      </div>

      {!teams || teams.length === 0 ? (
        <section className="e2k-panel">
          <div className="e2k-empty">
            <p>You don&apos;t have any teams yet.</p>
            <Link href={newTeamHref} className="e2k-link-cyan">
              Create your first team →
            </Link>
          </div>
        </section>
      ) : (
        <section className="e2k-panel">
          <div className="e2k-team-grid">
            {teams.map((team: any) => (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="e2k-team-card"
              >
                <div className="e2k-team-card-org">
                  {team.organizations?.name || "—"}
                </div>
                <div className="e2k-team-card-name">{team.name}</div>
                {team.age_group && (
                  <div className="e2k-team-card-age">{team.age_group}</div>
                )}
                <div className="e2k-team-card-stats">
                  <span>
                    <strong>{team.players?.length || 0}</strong>{" "}
                    {team.players?.length === 1 ? "player" : "players"}
                  </span>
                </div>
                <div className="e2k-team-card-action">Manage →</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function OrganizationsIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, org_type, city, state, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  // Per-org stat: team count, player count
  const orgIds = (orgs || []).map((o: any) => o.id);
  const teamCountByOrg = new Map<string, number>();
  const playerCountByOrg = new Map<string, number>();
  if (orgIds.length > 0) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, organization_id, players(id)")
      .in("organization_id", orgIds);
    (teams || []).forEach((t: any) => {
      teamCountByOrg.set(
        t.organization_id,
        (teamCountByOrg.get(t.organization_id) || 0) + 1
      );
      const playerCount = (t.players || []).length;
      playerCountByOrg.set(
        t.organization_id,
        (playerCountByOrg.get(t.organization_id) || 0) + playerCount
      );
    });
  }

  return (
    <AppShell active="organizations" userDisplayName={profile?.full_name?.trim() || ""}>
      <div className="e2k-page-head">
        <div>
          <h1 className="e2k-page-title">Organizations</h1>
          <p className="e2k-page-sub">
            Your top-level groups — schools, clubs, churches, troops, gyms.
            Each org contains its own teams and events.
          </p>
        </div>
        <Link href="/organizations/new" className="e2k-btn-coral">
          <span className="e2k-btn-plus">+</span> New Organization
        </Link>
      </div>

      {!orgs || orgs.length === 0 ? (
        <section className="e2k-panel">
          <div className="e2k-empty">
            <p>You don&apos;t have any organizations yet.</p>
            <p style={{ marginTop: "8px", fontSize: "13px", color: "var(--e2k-text-muted)" }}>
              The organization is the first step. It&apos;s the top-level container
              for your teams, players, and events. Examples: &ldquo;Lincoln Middle
              School Athletics,&rdquo; &ldquo;Crossroads Youth Group,&rdquo;
              &ldquo;Iron Forge CrossFit.&rdquo;
            </p>
            <Link href="/organizations/new" className="e2k-link-cyan" style={{ marginTop: "16px", display: "inline-block" }}>
              Create your first organization →
            </Link>
          </div>
        </section>
      ) : (
        <section className="e2k-panel">
          <div className="e2k-org-grid">
            {orgs.map((org: any) => {
              const teamCount = teamCountByOrg.get(org.id) || 0;
              const playerCount = playerCountByOrg.get(org.id) || 0;
              const orgTypeLabel = org.org_type
                ? org.org_type.charAt(0).toUpperCase() + org.org_type.slice(1)
                : "Organization";
              return (
                <Link
                  key={org.id}
                  href={`/organizations/${org.id}`}
                  className="e2k-org-card-link"
                >
                  <div className="e2k-org-pill">{orgTypeLabel}</div>
                  <div className="e2k-org-name">{org.name}</div>
                  {(org.city || org.state) && (
                    <div className="e2k-org-loc">
                      {[org.city, org.state].filter(Boolean).join(", ")}
                    </div>
                  )}
                  <div className="e2k-org-stats">
                    <span>
                      <strong>{teamCount}</strong>{" "}
                      {teamCount === 1 ? "team" : "teams"}
                    </span>
                    <span style={{ color: "var(--e2k-border-strong)" }}>·</span>
                    <span>
                      <strong>{playerCount}</strong>{" "}
                      {playerCount === 1 ? "player" : "players"}
                    </span>
                  </div>
                  <div className="e2k-org-action">Manage →</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </AppShell>
  );
}

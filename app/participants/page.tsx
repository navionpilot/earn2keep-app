import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function ParticipantsIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, jersey_number, team_id, teams(id, name)")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .order("last_name", { ascending: true });

  // Group players by team
  const byTeam = new Map<string, { team_name: string; players: any[] }>();
  (players || []).forEach((p: any) => {
    const tid = p.team_id;
    if (!byTeam.has(tid)) {
      byTeam.set(tid, {
        team_name: p.teams?.name || "Unknown Team",
        players: [],
      });
    }
    byTeam.get(tid)!.players.push(p);
  });
  const groups = Array.from(byTeam.entries()).sort((a, b) =>
    a[1].team_name.localeCompare(b[1].team_name)
  );

  return (
    <AppShell active="participants" userDisplayName={profile?.full_name || ""}>
      <div className="e2k-page-head">
        <div>
          <h1 className="e2k-page-title">Participants</h1>
          <p className="e2k-page-sub">
            {players && players.length > 0
              ? `${players.length} active ${players.length === 1 ? "player" : "players"} across ${groups.length} ${groups.length === 1 ? "team" : "teams"}`
              : "Add players to your teams to build your roster."}
          </p>
        </div>
      </div>

      {!players || players.length === 0 ? (
        <section className="e2k-panel">
          <div className="e2k-empty">
            <p>You don&apos;t have any active players yet.</p>
            <Link href="/teams" className="e2k-link-cyan">
              Open Teams to add players →
            </Link>
          </div>
        </section>
      ) : (
        groups.map(([teamId, group]) => (
          <section key={teamId} className="e2k-panel">
            <div className="e2k-panel-head e2k-panel-head-row">
              <div>
                <h2 className="e2k-panel-title">{group.team_name}</h2>
                <p className="e2k-panel-sub">{group.players.length} {group.players.length === 1 ? "player" : "players"}</p>
              </div>
              <Link href={`/teams/${teamId}`} className="e2k-link-cyan">
                Manage Team →
              </Link>
            </div>
            <div className="e2k-player-grid">
              {group.players.map((p: any) => {
                const fullName = `${p.first_name} ${p.last_name || ""}`.trim();
                const initials =
                  ((p.first_name?.[0] || "") + (p.last_name?.[0] || "")).toUpperCase() || "?";
                return (
                  <Link
                    key={p.id}
                    href={`/players/${p.id}/edit`}
                    className="e2k-player-card"
                  >
                    <div className="e2k-player-avatar">{initials}</div>
                    <div className="e2k-player-info">
                      <div className="e2k-player-name">{fullName}</div>
                      {p.jersey_number && (
                        <div className="e2k-player-meta">#{p.jersey_number}</div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </AppShell>
  );
}

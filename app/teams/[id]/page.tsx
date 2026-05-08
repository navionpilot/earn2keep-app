import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import Tooltip from "@/components/Tooltip";
import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteButton from "@/components/DeleteButton";
import TeamInvitesButton from "@/components/TeamInvitesButton";

import AppShell from "@/components/AppShell";
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

  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user?.id)
    .single();

  if (!team) {
    notFound();
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", team.organization_id)
    .single();

  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, jersey_number, date_of_birth, parent_email, imported_from, is_active, created_at, linked_user_id")
    .eq("team_id", id)
    .eq("owner_id", user?.id)
    .eq("is_active", true)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const playerCount = players?.length || 0;

  const { count: totalTeamCount } = await supabase
    .from("teams")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id);

  const { count: totalPlayerCount } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id)
    .eq("is_active", true);

  const hasTeams = (totalTeamCount || 0) > 0;
  const hasPlayers = (totalPlayerCount || 0) > 0;

  // "Needs info" only shows for CSV-imported rows where the last name was missing.
  // Manually-added players are NEVER flagged - the coach intentionally chose what to fill in.
  const playerNeedsInfo = (p: { last_name: string | null; imported_from: string | null }) => {
    return Boolean(p.imported_from) && !p.last_name;
  };

  return (
    <AppShell active="teams" userDisplayName={profile?.full_name?.trim() || ""}>
          {org && (
            <Link href={`/organizations/${org.id}`} className="btn-back">
              ← Back to {org.name}
            </Link>
          )}

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

          {playerCount === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <span style={{ fontSize: "48px" }}>👥</span>
              </div>
              <h2 className="empty-state-title">Add Your First Players</h2>
              <p className="empty-state-text">
                Build your roster two ways: add one player at a time, or upload
                a CSV exported from TeamSnap, GameChanger, SportsEngine, or any
                spreadsheet.
              </p>
              <div className="empty-state-actions">
                <Link href={`/teams/${team.id}/players/import`} className="btn-primary-link">
                  📋 Upload Roster (CSV) →
                </Link>
                <Link href={`/teams/${team.id}/players/new`} className="btn-secondary-link">
                  + Add One Player
                </Link>
              </div>
              <div style={{ marginTop: "20px" }}>
                <Tooltip text="Each player on your team gets their own roster entry. Once added, they can compete in events and have their own sponsor QR code. You only need a first name to get started — everything else can be filled in later.">
                  <a className="help-link">❓ What's a player?</a>
                </Tooltip>
              </div>
            </div>
          ) : (
            <>
              <div className="section-header">
                <h2 className="section-heading">
                  Roster <span className="roster-count">({playerCount})</span>
                </h2>
                <div className="section-header-actions">
                  <Tooltip text="Upload a CSV file of players. Works with exports from TeamSnap, GameChanger, SportsEngine, and any spreadsheet.">
                    <Link href={`/teams/${team.id}/players/import`} className="btn-secondary-link">
                      📋 Import CSV
                    </Link>
                  </Tooltip>
                  <TeamInvitesButton
                    players={(players || []).map((p) => ({
                      id: p.id,
                      first_name: p.first_name,
                      last_name: p.last_name,
                      parent_email: p.parent_email,
                      linked_user_id: p.linked_user_id ?? null,
                    }))}
                    teamName={team.name}
                  />
                  <Tooltip text="Add another player one at a time.">
                    <Link href={`/teams/${team.id}/players/new`} className="btn-add">
                      + Add Player
                    </Link>
                  </Tooltip>
                </div>
              </div>

              <div className="roster-table-wrap">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Date of Birth</th>
                      <th>Parent Email</th>
                      <th>Source</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {players?.map((player) => {
                      const needsInfo = playerNeedsInfo(player);
                      return (
                        <tr key={player.id}>
                          <td className="roster-jersey">
                            {player.jersey_number || "—"}
                          </td>
                          <td className="roster-name">
                            {player.first_name} {player.last_name || ""}
                            {needsInfo && (
                              <Tooltip text="This player was imported from a CSV without a last name. Click Edit to add it.">
                                <span className="needs-info-pill">⚠ Needs info</span>
                              </Tooltip>
                            )}
                          </td>
                          <td className="roster-cell-muted">
                            {player.date_of_birth
                              ? new Date(player.date_of_birth).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td className="roster-cell-muted">
                            {player.parent_email || "—"}
                          </td>
                          <td className="roster-cell-muted">
                            {player.imported_from || "Manual"}
                          </td>
                          <td className="roster-actions">
                            <Link
                              href={`/players/${player.id}/edit`}
                              className="roster-edit-link"
                            >
                              Edit
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <DeleteButton
            table="teams"
            recordId={team.id}
            recordName={team.name}
            redirectTo={org ? `/organizations/${org.id}` : "/dashboard"}
            consequences={[
              `${playerCount} player${playerCount === 1 ? "" : "s"} on the roster`,
              `Any event links to this team (the events themselves stay)`,
            ]}
            buttonLabel="Delete this team"
          />
    </AppShell>
  );
}

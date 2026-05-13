// =============================================================================
// app/participants/page.tsx — Participants landing page
// =============================================================================
// Reached from the "Participants" sidebar nav item. Since roster management
// always happens inside a specific team (a player belongs to one team), this
// page is a wayfinder that lists the user's teams across all their orgs,
// with player counts and direct actions: quick-add a player, or open the
// full team detail page.
//
// This replaces the previous behavior (redirect to /teams) so the
// "Participants" nav item lands somewhere meaningful and the active highlight
// works correctly.
// =============================================================================

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import AppShell from "@/components/AppShell";

interface TeamRow {
  id: string;
  name: string;
  organization_id: string;
  sport_or_activity: string | null;
  organizations: { name: string } | null;
}

export default async function ParticipantsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all teams the user can see (RLS scopes to user-owned orgs).
  const { data: teamsRaw } = await supabase
    .from("teams")
    .select("id, name, organization_id, sport_or_activity, organizations(name)")
    .order("created_at", { ascending: true });

  const teams = (teamsRaw || []) as unknown as TeamRow[];

  // Fetch player counts per team in a single query. Cheap at expected scale
  // (most users have <100 total players across all teams).
  let countsByTeam: Record<string, number> = {};
  if (teams.length > 0) {
    const teamIds = teams.map((t) => t.id);
    const { data: playerRows } = await supabase
      .from("players")
      .select("team_id")
      .in("team_id", teamIds);

    countsByTeam = (playerRows || []).reduce((acc, row) => {
      const tid = (row as { team_id: string }).team_id;
      acc[tid] = (acc[tid] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  // Display name for the AppShell topbar
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const userDisplayName = profile?.full_name || "";

  return (
    <AppShell active="participants" userDisplayName={userDisplayName}>
      <main className="form-page-main">
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
          <div style={{ marginBottom: 24 }}>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
                fontWeight: 800,
                margin: "0 0 8px 0",
                letterSpacing: "-0.012em",
              }}
            >
              Participants
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "var(--e2k-text-dim, #9fb8b8)",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Each player/participant belongs to a specific team. Pick a team
              below to add players, send invites, or manage the roster.
            </p>
          </div>

          {teams.length === 0 ? (
            <div
              style={{
                padding: 32,
                background: "rgba(255, 255, 255, 0.025)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 14,
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: 15,
                  color: "var(--e2k-text-dim, #9fb8b8)",
                  margin: "0 0 16px 0",
                  lineHeight: 1.6,
                }}
              >
                No teams yet. Create an organization and a team first, then
                come back here to add players/participants.
              </p>
              <Link
                href="/organizations"
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  background: "#ff755f",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Set up your first organization →
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {teams.map((team) => {
                const playerCount = countsByTeam[team.id] || 0;
                const orgName = team.organizations?.name || "—";
                return (
                  <div
                    key={team.id}
                    style={{
                      padding: 18,
                      background: "rgba(255, 255, 255, 0.025)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 14,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 16,
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 18,
                          fontWeight: 700,
                          color: "var(--e2k-text, #f7fbfb)",
                          marginBottom: 4,
                        }}
                      >
                        {team.name}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--e2k-text-dim, #9fb8b8)",
                        }}
                      >
                        {orgName}
                        {team.sport_or_activity ? ` · ${team.sport_or_activity}` : ""}
                        <span style={{ margin: "0 8px" }}>·</span>
                        <strong style={{ color: "var(--e2k-text, #f7fbfb)" }}>
                          {playerCount}
                        </strong>{" "}
                        {playerCount === 1
                          ? "player/participant"
                          : "players/participants"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        href={`/teams/${team.id}/players/new`}
                        style={{
                          display: "inline-block",
                          padding: "8px 14px",
                          background: "rgba(53, 213, 223, 0.12)",
                          color: "#35d5df",
                          textDecoration: "none",
                          borderRadius: 999,
                          fontWeight: 700,
                          fontSize: 13,
                          border: "1px solid rgba(53, 213, 223, 0.3)",
                        }}
                      >
                        + Add player/participant
                      </Link>
                      <Link
                        href={`/teams/${team.id}`}
                        style={{
                          display: "inline-block",
                          padding: "8px 14px",
                          background: "#ff755f",
                          color: "white",
                          textDecoration: "none",
                          borderRadius: 999,
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        Manage roster →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

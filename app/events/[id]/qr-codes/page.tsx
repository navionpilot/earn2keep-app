"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import LogoutButton from "@/components/LogoutButton";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import SponsorPdfButton from "@/components/SponsorPdfButton";
import AppShell from "@/components/AppShell";
import {
  ensureTokensForEvent,
  publicDisplayName,
  sponsorUrlFromToken,
  type PlayerForToken,
  type SponsorTokenRow,
} from "@/lib/sponsorTokens";
import {
  generateSponsorFlyerPDF,
  type FlyerCard,
  type FlyerEventContext,
} from "@/lib/sponsorFlyerPdf";

type EventInfo = {
  id: string;
  name: string;
  event_type: string;
  status: string;
  goal_amount: number | null;
  start_date: string;
  end_date: string;
  organization_id: string;
  organization_name: string;
};

export default function SponsorQrCodesPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [players, setPlayers] = useState<PlayerForToken[]>([]);
  const [tokens, setTokens] = useState<SponsorTokenRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sidebar state
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const [hasTeams, setHasTeams] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setFetching(true);
      setError(null);
      try {
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError("You must be logged in.");
          setFetching(false);
          return;
        }

        // Sidebar context
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile?.full_name) setUserDisplayName(profile.full_name);

        const [{ count: teamCount }, { count: playerCount }] = await Promise.all([
          supabase.from("teams").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
          supabase.from("players").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        ]);
        setHasTeams((teamCount || 0) > 0);
        setHasPlayers((playerCount || 0) > 0);

        // Event details (need organization name for the flyer footer)
        const { data: ev, error: evErr } = await supabase
          .from("events")
          .select("id, name, event_type, status, goal_amount, start_date, end_date, organization_id, organizations(id, name)")
          .eq("id", eventId)
          .eq("owner_id", user.id)
          .single();
        if (evErr || !ev) {
          setError("Event not found, or you don't have access to it.");
          setFetching(false);
          return;
        }
        setEvent({
          id: ev.id,
          name: ev.name,
          event_type: ev.event_type,
          status: ev.status,
          goal_amount: ev.goal_amount,
          start_date: ev.start_date,
          end_date: ev.end_date,
          organization_id: ev.organization_id,
          organization_name: (ev as any).organizations?.name || "Your organization",
        });

        // Lazy-create tokens for any new players
        const result = await ensureTokensForEvent(eventId);
        setPlayers(result.players);
        setTokens(result.tokens);
      } catch (err: any) {
        setError(err?.message || "Failed to load QR codes.");
      } finally {
        setFetching(false);
      }
    };

    fetchAll();
  }, [eventId]);

  // Group players (and their tokens) by team for cleaner display
  const playersByTeam = useMemo(() => {
    const tokenByPlayerId = new Map<string, SponsorTokenRow>();
    tokens.forEach((t) => tokenByPlayerId.set(t.player_id, t));

    const groups: Record<string, {
      teamId: string;
      teamName: string;
      teamSport: string | null;
      teamAgeGroup: string | null;
      players: { player: PlayerForToken; token: SponsorTokenRow }[];
    }> = {};

    players.forEach((p) => {
      const tk = tokenByPlayerId.get(p.id);
      if (!tk) return;
      if (!groups[p.team_id]) {
        groups[p.team_id] = {
          teamId: p.team_id,
          teamName: p.team_name,
          teamSport: p.team_sport,
          teamAgeGroup: p.team_age_group,
          players: [],
        };
      }
      groups[p.team_id].players.push({ player: p, token: tk });
    });

    return Object.values(groups).sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [players, tokens]);

  // Build event context for the PDF generator (camp/tournament copy switches off this)
  const eventContext: FlyerEventContext | null = useMemo(() => {
    if (!event) return null;
    return {
      eventName: event.name,
      eventType: event.event_type === "camp" ? "camp" : "tournament",
      organizationName: event.organization_name,
      goalAmount: Number(event.goal_amount || 0),
      eventStartDate: event.start_date,
      eventEndDate: event.end_date,
    };
  }, [event]);

  // Convert one player+token to a FlyerCard
  const buildFlyerCard = (
    player: PlayerForToken,
    token: SponsorTokenRow,
    teamName: string,
    teamSport: string | null,
    teamAgeGroup: string | null
  ): FlyerCard => ({
    publicLabel: publicDisplayName(player.first_name, player.last_name),
    privateLabel: `${player.first_name} ${player.last_name || ""}`.trim(),
    url: sponsorUrlFromToken(token.token),
    teamName,
    teamSport,
    teamAgeGroup,
  });

  // Bulk: every player on every team
  const allFlyerCards: FlyerCard[] = useMemo(() => {
    return playersByTeam.flatMap((g) =>
      g.players.map(({ player, token }) =>
        buildFlyerCard(player, token, g.teamName, g.teamSport, g.teamAgeGroup)
      )
    );
  }, [playersByTeam]);

  // Per-player flyer downloader
  const downloadOneFlyer = async (
    player: PlayerForToken,
    token: SponsorTokenRow,
    group: { teamName: string; teamSport: string | null; teamAgeGroup: string | null }
  ) => {
    if (!eventContext) return;
    const card = buildFlyerCard(
      player,
      token,
      group.teamName,
      group.teamSport,
      group.teamAgeGroup
    );
    try {
      await generateSponsorFlyerPDF([card], eventContext);
    } catch (err: any) {
      setError(err?.message || "Failed to build flyer.");
    }
  };

  if (fetching) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
              Loading sponsor QR codes…
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <h1 className="form-title">Event not found</h1>
            <p className="form-subtitle">
              {error || "You don't have access to this event."}
            </p>
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <Link href="/dashboard" className="btn-primary-link">← Back to dashboard</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isCamp = event.event_type === "camp";
  const totalPlayers = playersByTeam.reduce((sum, g) => sum + g.players.length, 0);

  return (
    <AppShell active="qr-codes" userDisplayName={userDisplayName}>
          <Link href={`/events/${eventId}`} className="btn-back">
            ← Back to {event.name}
          </Link>

          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
            <span className="breadcrumb-sep">›</span>
            <Link href={`/events/${eventId}`} className="breadcrumb-link">{event.name}</Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">Sponsor QR Codes</span>
          </div>

          <div className="schedule-header">
            <div>
              <h1 className="dashboard-welcome">Sponsor QR Codes</h1>
              <p className="dashboard-subtitle">
                {totalPlayers === 0 ? (
                  <>No active players on this event yet. Add players to a participating team and they'll show up here.</>
                ) : (
                  <>
                    Each player has their own scannable code linking to a public sponsor page.
                    {isCamp ? (
                      <> Sponsors back the player's <strong>${formatMoney(event.goal_amount)} fundraising minimum</strong>.</>
                    ) : (
                      <> Sponsors cover the player's <strong>${formatMoney(event.goal_amount)} registration fee</strong>.</>
                    )}{" "}
                    Hand out flyers, text them, post them — whatever works.
                  </>
                )}
              </p>
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}

          <div className="alert alert-info" style={{ marginBottom: "20px" }}>
            <strong>Heads up — payments aren't live yet.</strong> Sponsors who scan see a clean page with the goal/fee, but the <em>Sponsor This Player</em> button shows a "Coming soon" message for now. Sponsor payments will be live before launch — this slice gets the funnel ready so coaches can start sharing.
          </div>

          {totalPlayers > 0 && eventContext && (
            <div className="qr-toolbar">
              <SponsorPdfButton
                cards={allFlyerCards}
                eventContext={eventContext}
              />
              <span className="qr-toolbar-meta">
                {totalPlayers} player{totalPlayers === 1 ? "" : "s"} across {playersByTeam.length} team{playersByTeam.length === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {playersByTeam.length === 0 ? (
            <div className="dashboard-card" style={{ marginTop: "20px" }}>
              <p className="dashboard-card-text">
                No participating teams or players yet. Open the event detail page to add teams, then add active players to those teams.
              </p>
              <div style={{ textAlign: "center", marginTop: "16px" }}>
                <Link href={`/events/${eventId}`} className="btn-primary-link">← Back to event</Link>
              </div>
            </div>
          ) : (
            <div className="qr-team-list">
              {playersByTeam.map((group) => (
                <div key={group.teamId} className="qr-team-section">
                  <div className="qr-team-header">
                    <h2 className="qr-team-name">{group.teamName}</h2>
                    <div className="qr-team-meta">
                      {group.teamSport}
                      {group.teamAgeGroup && ` · ${group.teamAgeGroup}`}
                      {" · "}
                      {group.players.length} player{group.players.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="qr-grid">
                    {group.players.map(({ player, token }) => {
                      const url = sponsorUrlFromToken(token.token);
                      const publicLabel = publicDisplayName(player.first_name, player.last_name);
                      const privateLabel = `${player.first_name} ${player.last_name || ""}`.trim();
                      return (
                        <QRCodeDisplay
                          key={token.id}
                          url={url}
                          publicLabel={publicLabel}
                          privateLabel={privateLabel}
                          downloadFilenameStem={`${event.name}_${publicLabel}`}
                          onDownloadFlyer={() => downloadOneFlyer(player, token, group)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
    </AppShell>
  );
}

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

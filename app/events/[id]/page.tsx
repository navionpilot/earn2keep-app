import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import Tooltip from "@/components/Tooltip";
import Link from "next/link";
import { notFound } from "next/navigation";
import TournamentHostInfoBlock from "@/components/TournamentHostInfoBlock";
import TournamentInvitationsPanel from "@/components/TournamentInvitationsPanel";
import TournamentStandings from "@/components/TournamentStandings";
import TournamentTeamRosterStatus from "@/components/TournamentTeamRosterStatus";
import TournamentTiebreakerBlock from "@/components/TournamentTiebreakerBlock";
import TournamentPendingApprovalsPanel from "@/components/TournamentPendingApprovalsPanel";
import TournamentTiebreakerPicker from "@/components/TournamentTiebreakerPicker";
import EventStatusButton from "@/components/EventStatusButton";
import DeleteButton from "@/components/DeleteButton";
import LeaderboardCard from "@/components/LeaderboardCard";
import EventGuide from "@/components/EventGuide";

import AppShell from "@/components/AppShell";
const formatMoney = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Helper for ordinal numbers (1st, 2nd, 3rd, 4th...)
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Recording template icons (mirrors lib/recordingRecommender.ts).
// Used to show a small phone-setup hint next to each scheduled challenge.
const TEMPLATE_ICONS: Record<string, string> = {
  side_angle_floor: "📱",
  selfie_audio: "🤳",
  behind_player_target: "🎯",
  top_down_closeup: "🔍",
  gps_with_endpoints: "📍",
  photo_completion: "📷",
  wide_angle_court: "🏟",
  selfie_with_object: "✋",
  custom: "✏️",
};

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

  const { data: participants } = await supabase
    .from("event_participants")
    .select("team_id, teams(id, name, sport_or_activity, age_group)")
    .eq("event_id", id);

  const teams = (participants || [])
    .map((p: any) => p.teams)
    .filter(Boolean);

  const teamIds = teams.map((t: any) => t.id);
  let totalPlayerCount = 0;
  if (teamIds.length > 0) {
    const { count } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .in("team_id", teamIds)
      .eq("is_active", true);
    totalPlayerCount = count || 0;
  }

  // Fetch challenges assigned to this event (now scheduled per day)
  // Slice 4.5.4: include setup_template_key + reference_photo_url so the
  // schedule preview can show recording-template icons next to each pill.
  const { data: eventChallenges } = await supabase
    .from("event_challenges")
    .select("id, day_index, rep_target, notes, challenges(id, name, description, category, unit, difficulty, setup_template_key, reference_photo_url)")
    .eq("event_id", id)
    .order("day_index", { ascending: true });

  // Calculate the ordinal for this event (is it the user's 1st, 2nd, 3rd...?)
  const { count: eventOrdinal } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", user?.id)
    .lte("created_at", event.created_at);

  // For sidebar
  const { count: totalTeamCount } = await supabase
    .from("teams").select("*", { count: "exact", head: true }).eq("owner_id", user?.id);
  const { count: totalPlayerCountSidebar } = await supabase
    .from("players").select("*", { count: "exact", head: true }).eq("owner_id", user?.id);
  const { count: totalEventCount } = await supabase
    .from("events").select("*", { count: "exact", head: true }).eq("owner_id", user?.id);

  // L32 — For tournament events, count the joining teams so we can display
  // it on the host's view. Returns 0 if event isn't a tournament.
  let joinedTeamsCount = 0;
  // L34 — For tournament events, also fetch the host's own teams (those
  // participating via event_participants) so we can render their roster
  // status. The host has skin in the game — their teams compete too.
  let hostParticipatingTeams: { team_id: string; team_name: string }[] = [];
  if (event.event_type === "tournament") {
    const { count } = await supabase
      .from("tournament_teams")
      .select("*", { count: "exact", head: true })
      .eq("tournament_event_id", event.id)
      .in("status", ["pending_approval", "active"]);
    joinedTeamsCount = count ?? 0;

    const { data: hostTeamRows } = await supabase
      .from("event_participants")
      .select("team_id, teams(id, name)")
      .eq("event_id", event.id);
    hostParticipatingTeams = (hostTeamRows || []).map((row) => {
      const rel = row.teams;
      let teamName = "Team";
      if (rel) {
        if (Array.isArray(rel)) {
          teamName = rel[0]?.name || teamName;
        } else if (typeof rel === "object" && "name" in rel) {
          teamName = (rel as { name?: string }).name || teamName;
        }
      }
      return { team_id: row.team_id, team_name: teamName };
    });
  }

  // L36 — Fetch pending tournament_teams rows for the approval workflow
  // panel (host UI only). Also fetch the list of event_challenges so the
  // tiebreaker picker can render its options.
  type PendingTeam = {
    id: string;
    team_id: string;
    team_name: string;
    org_name: string | null;
    player_count: number;
    joined_at: string;
  };
  let pendingApprovalTeams: PendingTeam[] = [];
  type ChallengeOption = {
    id: string;
    name: string;
    rep_target: number | null;
    unit: string | null;
    is_tiebreaker: boolean;
  };
  let availableChallengesForTiebreaker: ChallengeOption[] = [];
  if (event.event_type === "tournament" && event.owner_id === user?.id) {
    // Pending teams (approval workflow only matters if requires_approval=true,
    // but we always fetch — the component handles the empty case).
    if (event.tournament_requires_approval) {
      const { data: ptRows } = await supabase
        .from("tournament_teams")
        .select("id, team_id, joined_at, teams(id, name, organizations(name))")
        .eq("tournament_event_id", event.id)
        .eq("status", "pending_approval")
        .order("joined_at", { ascending: true });
      const teamIds = (ptRows || []).map((r) => r.team_id);
      // Roster sizes in one query
      const playerCounts: Record<string, number> = {};
      if (teamIds.length > 0) {
        const { data: pRows } = await supabase
          .from("players")
          .select("team_id")
          .in("team_id", teamIds);
        (pRows || []).forEach((p) => {
          playerCounts[p.team_id] = (playerCounts[p.team_id] || 0) + 1;
        });
      }
      pendingApprovalTeams = (ptRows || []).map((row) => {
        const teamRel = row.teams;
        let teamName = "Team";
        let orgName: string | null = null;
        if (teamRel) {
          const teamObj = Array.isArray(teamRel) ? teamRel[0] : teamRel;
          if (teamObj) {
            teamName = (teamObj as { name?: string }).name || teamName;
            const orgRel = (teamObj as { organizations?: unknown }).organizations;
            if (orgRel) {
              if (Array.isArray(orgRel)) {
                orgName = (orgRel[0] as { name?: string })?.name ?? null;
              } else if (typeof orgRel === "object" && "name" in orgRel) {
                orgName = (orgRel as { name?: string }).name ?? null;
              }
            }
          }
        }
        return {
          id: row.id,
          team_id: row.team_id,
          team_name: teamName,
          org_name: orgName,
          player_count: playerCounts[row.team_id] || 0,
          joined_at: row.joined_at,
        };
      });
    }

    // Available challenges for the tiebreaker picker
    const { data: ecRows } = await supabase
      .from("event_challenges")
      .select("id, rep_target, is_tiebreaker, challenges(name, unit)")
      .eq("event_id", event.id)
      .order("day_index", { ascending: true });
    availableChallengesForTiebreaker = (ecRows || []).map((row) => {
      const cRel = row.challenges;
      let chName: string | null = null;
      let chUnit: string | null = null;
      if (cRel) {
        const cObj = Array.isArray(cRel) ? cRel[0] : cRel;
        if (cObj) {
          chName = (cObj as { name?: string }).name ?? null;
          chUnit = (cObj as { unit?: string }).unit ?? null;
        }
      }
      return {
        id: row.id,
        name: chName || "Challenge",
        rep_target: row.rep_target ?? null,
        unit: chUnit,
        is_tiebreaker: row.is_tiebreaker === true,
      };
    });
  }

  // L35 — Process tournament tiebreaker state. Idempotent state-machine RPC.
  // Auto-activates the sudden-death tiebreaker on the first view after end
  // date when prize-position teams are tied, and resolves it when the
  // deadline passes. Side effect: may mutate event row.
  // L37 — RPC now returns from_state; we compare to current state to fire
  // a one-shot notification email on transitions.
  type TiebreakerStateRow = {
    from_state: string;
    state: string;
    activated_at: string | null;
    deadline_at: string | null;
    winner_team_id: string | null;
    resolved_at: string | null;
    tied_team_ids: string[] | null;
  };
  let tiebreakerState: TiebreakerStateRow | null = null;
  let tiedTeamsDetail: { team_id: string; team_name: string; org_name: string | null }[] = [];
  let tiebreakerChallengeMeta: {
    name: string;
    target_value: number | null;
    target_unit: string | null;
  } | null = null;
  if (event.event_type === "tournament") {
    const { data: stateRows } = await supabase.rpc("process_tournament_tiebreaker", {
      p_event_id: event.id,
    });
    if (Array.isArray(stateRows) && stateRows.length > 0) {
      tiebreakerState = stateRows[0] as TiebreakerStateRow;
    }

    // L37 — If state transitioned, fire the notification API (fire-and-forget).
    // The API itself dedupes/filters non-interesting transitions internally,
    // so calling it on every load is safe even if from_state === state.
    if (tiebreakerState && tiebreakerState.from_state !== tiebreakerState.state) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");
      if (baseUrl) {
        // Fire and forget — don't block render on email delivery
        fetch(`${baseUrl}/api/tournament-tiebreaker/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: event.id,
            fromState: tiebreakerState.from_state,
            toState: tiebreakerState.state,
          }),
        }).catch(() => {
          // Swallow — UI doesn't depend on email delivery
        });
      }
    }

    // If the tiebreaker is in any state past not_evaluated, fetch tied
    // team display names + the tiebreaker challenge name for UI.
    if (
      tiebreakerState &&
      tiebreakerState.tied_team_ids &&
      tiebreakerState.tied_team_ids.length > 0
    ) {
      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, name, organizations(name)")
        .in("id", tiebreakerState.tied_team_ids);
      tiedTeamsDetail = (teamRows || []).map((r) => {
        const rel = r.organizations;
        let orgName: string | null = null;
        if (rel) {
          if (Array.isArray(rel)) orgName = rel[0]?.name ?? null;
          else if (typeof rel === "object" && "name" in rel)
            orgName = (rel as { name?: string }).name ?? null;
        }
        return { team_id: r.id, team_name: r.name, org_name: orgName };
      });
    }

    if (event.tournament_tiebreaker_challenge_id) {
      const { data: tbCh } = await supabase
        .from("event_challenges")
        .select("rep_target, challenges(name, unit)")
        .eq("id", event.tournament_tiebreaker_challenge_id)
        .maybeSingle();
      if (tbCh) {
        const ch = tbCh.challenges;
        let name: string | null = null;
        let unit: string | null = null;
        if (ch) {
          if (Array.isArray(ch)) {
            name = ch[0]?.name ?? null;
            unit = ch[0]?.unit ?? null;
          } else if (typeof ch === "object" && "name" in ch) {
            name = (ch as { name?: string; unit?: string }).name ?? null;
            unit = (ch as { name?: string; unit?: string }).unit ?? null;
          }
        }
        tiebreakerChallengeMeta = {
          name: name ?? "Tiebreaker challenge",
          target_value: tbCh.rep_target ?? null,
          target_unit: unit,
        };
      }
    }
  }

  // Date calculations
  const formatLongDate = (dateStr: string) =>
    new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

  const formatMonth = (dateStr: string) =>
    new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short" }).toUpperCase();

  const formatDay = (dateStr: string) =>
    new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { day: "numeric" });

  const formatYear = (dateStr: string) =>
    new Date(dateStr + "T12:00:00").getFullYear();

  let daysUntilStart: number | null = null;
  let durationDays: number | null = null;
  let isUpcoming = false;
  let isRunning = false;
  let hasEnded = false;

  if (event.start_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(event.start_date + "T12:00:00");
    startDate.setHours(0, 0, 0, 0);
    const msPerDay = 1000 * 60 * 60 * 24;
    daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / msPerDay);

    if (event.end_date) {
      const endDate = new Date(event.end_date + "T12:00:00");
      endDate.setHours(0, 0, 0, 0);
      durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;

      // Slice 5.5.2: only flip the date-based status pills (Upcoming /
      // Running now / Ended) when the event has actually been activated.
      // Without this gate, a Draft event whose start date had arrived would
      // falsely show "Running now" alongside its "Draft" pill.
      if (event.status === "active") {
        if (today < startDate) isUpcoming = true;
        else if (today >= startDate && today <= endDate) isRunning = true;
        else hasEnded = true;
      }
    }
  }

  // Calculate fundraising breakdown
  const goalNum = Number(event.goal_amount) || 0;
  const firstNum = Number(event.first_place_amount) || 0;
  const secondNum = Number(event.second_place_amount) || 0;
  const thirdNum = Number(event.third_place_amount) || 0;
  const prizePool = firstNum + secondNum + thirdNum;
  // Both Camp and Tournament: total = per-player amount × roster size
  // (Camp: minimum each must raise. Tournament: flat fee each pays.)
  const totalRaised = goalNum * totalPlayerCount;
  const netToTeam = totalRaised - prizePool;
  const showBreakdown = goalNum > 0;

  // Slice 5.2.1: progress signals for the right-sidebar EventGuide.
  // - hasInvitesSent: any player on any team in this event has had an
  //   invite created? Used to drive step 3 of the guide.
  // - totalSubmissionCount / pendingSubmissionCount: drives steps 5+6.
  let hasInvitesSent = false;
  let totalSubmissionCount = 0;
  let pendingSubmissionCount = 0;

  if (teamIds.length > 0) {
    // Get the player ids on this event's teams once, then reuse for the
    // invite + submission counts.
    const { data: eventPlayers } = await supabase
      .from("players")
      .select("id")
      .in("team_id", teamIds);
    const playerIds = (eventPlayers || []).map((p: { id: string }) => p.id);

    if (playerIds.length > 0) {
      const { count: inviteCount } = await supabase
        .from("player_invites")
        .select("*", { count: "exact", head: true })
        .in("player_id", playerIds);
      hasInvitesSent = (inviteCount ?? 0) > 0;
    }
  }

  // Submissions are scoped by event_id, so we can count them directly.
  const { count: totalSubCount } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("event_id", id);
  totalSubmissionCount = totalSubCount ?? 0;

  if (totalSubmissionCount > 0) {
    const { count: pendCount } = await supabase
      .from("submissions")
      .select("*", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "pending");
    pendingSubmissionCount = pendCount ?? 0;
  }

  // Slice 5.7: at-least-one-supporter-token check for this event. Supporter
  // tokens get auto-created when the coach opens the QR Codes page, so
  // any token presence is a fair "has visited QR codes" signal that drives
  // step 3 of the new EventGuide.
  const { count: qrCount } = await supabase
    .from("supporter_tokens")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id);
  const hasQRCodes = (qrCount || 0) > 0;

  // First team id for the "Send invites" guide action button.
  const firstTeamId = teams.length > 0 ? teams[0].id : null;

  return (
    <AppShell active="events" userDisplayName={profile?.full_name?.trim() || ""}>
      {/* Slice 5.2.1: 2-col grid puts the EventGuide walkthrough in a
          sticky right rail, mirroring the dashboard's pattern. The full
          existing page content lives in e2k-dash-main below. */}
      <div className="e2k-dash-2col">
        <div className="e2k-dash-main">
          {/* Back button */}
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
            <span className="breadcrumb-current">{event.name}</span>
          </div>

          {/* CELEBRATION HERO - shown when status is draft */}
          {event.status === "draft" && eventOrdinal && (
            <div className="celebration-banner">
              <div className="celebration-burst">
                <span className="celebration-emoji">🎉</span>
              </div>
              <div className="celebration-content">
                <div className="celebration-eyebrow">
                  ★ {(event.event_type === "camp" || event.event_type === "mini-camp") ? "FUNDRAISER" : "TOURNAMENT"} CREATED ★
                </div>
                <h2 className="celebration-title">
                  Congrats on creating your {ordinal(eventOrdinal)}{" "}
                  {(event.event_type === "camp" || event.event_type === "mini-camp") ? "fundraiser" : "tournament"}!
                </h2>
                <p className="celebration-text">
                  <strong>{event.name}</strong> is set up and ready. Once you've
                  added challenges and you're ready to go live, hit{" "}
                  <strong>Activate Event</strong> below.
                </p>
              </div>
            </div>
          )}

          {/* L32 — Tournament info block (host view). Shown for any tournament
              regardless of status so the host can grab the join code right away. */}
          {event.event_type === "tournament" && event.tournament_join_code && (
            <TournamentHostInfoBlock
              joinCode={event.tournament_join_code}
              entryFeeCents={event.tournament_entry_fee_cents ?? 0}
              joinedTeamsCount={joinedTeamsCount}
              maxTeams={event.tournament_max_teams ?? null}
              requiresApproval={event.tournament_requires_approval ?? false}
            />
          )}

          {/* L33 — Invitations panel. Host-side UI for sending the
              tournament invitation email to other team organizers. */}
          {event.event_type === "tournament" && event.tournament_join_code && (
            <TournamentInvitationsPanel tournamentId={event.id} />
          )}

          {/* L36 — Approval workflow panel. Only renders if approval mode is
              on AND there are pending teams. Hidden when neither. */}
          {event.event_type === "tournament" &&
            event.owner_id === user?.id &&
            event.tournament_requires_approval &&
            pendingApprovalTeams.length > 0 && (
              <TournamentPendingApprovalsPanel
                tournamentId={event.id}
                pendingTeams={pendingApprovalTeams}
              />
            )}

          {/* L36 — Tiebreaker challenge picker. Host-only. Always visible
              for tournament events so the host can change their pick later. */}
          {event.event_type === "tournament" && event.owner_id === user?.id && (
            <TournamentTiebreakerPicker
              eventId={event.id}
              currentTiebreakerId={event.tournament_tiebreaker_challenge_id ?? null}
              availableChallenges={availableChallengesForTiebreaker}
            />
          )}

          {/* L35 — Sudden-death tiebreaker block. Renders nothing when
              state is not_evaluated/not_needed. Shows live countdown when
              active. Shows winner when resolved. Shows manual picker UI
              when host_decision_needed AND viewer is host. */}
          {event.event_type === "tournament" && tiebreakerState && (
            <TournamentTiebreakerBlock
              state={tiebreakerState.state}
              activatedAt={tiebreakerState.activated_at}
              deadlineAt={tiebreakerState.deadline_at}
              winnerTeamId={tiebreakerState.winner_team_id}
              tiedTeamIds={tiebreakerState.tied_team_ids ?? []}
              tiedTeams={tiedTeamsDetail}
              tiebreakerChallengeId={event.tournament_tiebreaker_challenge_id ?? null}
              tiebreakerChallengeName={tiebreakerChallengeMeta?.name ?? null}
              tiebreakerChallengeTargetValue={tiebreakerChallengeMeta?.target_value ?? null}
              tiebreakerChallengeTargetUnit={tiebreakerChallengeMeta?.target_unit ?? null}
              isCurrentUserHost={event.owner_id === user?.id}
              isCurrentUserOnTiedTeam={
                // Host counts as on a tied team if any of their participating
                // teams are in the tied set.
                hostParticipatingTeams.some((t) =>
                  (tiebreakerState?.tied_team_ids ?? []).includes(t.team_id)
                )
              }
              eventId={event.id}
            />
          )}

          {/* L34 — Strict-scored standings for the tournament. */}
          {event.event_type === "tournament" && (
            <TournamentStandings tournamentEventId={event.id} />
          )}

          {/* L34 — Roster status for each of the host's own teams. */}
          {event.event_type === "tournament" &&
            hostParticipatingTeams.map((t) => (
              <TournamentTeamRosterStatus
                key={t.team_id}
                tournamentEventId={event.id}
                teamId={t.team_id}
                teamName={t.team_name}
              />
            ))}

          {/* Event hero - title, type, status */}
          <div className="event-hero">
            <div className="event-hero-pills">
              <span className="org-detail-type-pill">
                {(event.event_type === "camp" || event.event_type === "mini-camp") ? "🏃 Camp" : "🏆 Tournament"}
              </span>
              <span className={`status-pill status-${event.status || "draft"}`}>
                {event.status === "active" ? "Active" : event.status === "completed" ? "Completed" : "Draft"}
              </span>
              {isUpcoming && daysUntilStart !== null && daysUntilStart > 0 && (
                <span className="status-pill status-upcoming">
                  Starts in {daysUntilStart} day{daysUntilStart === 1 ? "" : "s"}
                </span>
              )}
              {isRunning && (
                <span className="status-pill status-running">● Running now</span>
              )}
              {hasEnded && event.status !== "completed" && (
                <span className="status-pill status-ended">Ended</span>
              )}
            </div>
            <h1 className="event-hero-title">{event.name}</h1>
            {event.description && (
              <p className="event-hero-description">{event.description}</p>
            )}
            <div className="event-hero-actions">
              <EventStatusButton eventId={event.id} currentStatus={event.status} />
              <Tooltip text="Update event details, participating teams, goals, or prizes.">
                <Link href={`/events/${event.id}/edit`} className="btn-secondary-link">
                  Edit Event
                </Link>
              </Tooltip>
            </div>
          </div>

          {/* Visual date display */}
          {event.start_date && event.end_date && (
            <div className="date-display">
              <div className="date-block date-block-start">
                <div className="date-block-label">📅 Starts</div>
                <div className="date-block-month">{formatMonth(event.start_date)}</div>
                <div className="date-block-day">{formatDay(event.start_date)}</div>
                <div className="date-block-year">{formatYear(event.start_date)}</div>
                {daysUntilStart !== null && (
                  <div className="date-block-sub">
                    {daysUntilStart > 0
                      ? `${daysUntilStart} day${daysUntilStart === 1 ? "" : "s"} from now`
                      : daysUntilStart === 0
                      ? "Today!"
                      : `${Math.abs(daysUntilStart)} day${Math.abs(daysUntilStart) === 1 ? "" : "s"} ago`}
                  </div>
                )}
              </div>
              <div className="date-block-arrow">→</div>
              <div className="date-block date-block-duration">
                <div className="date-block-label">⏱ Duration</div>
                <div className="date-block-duration-num">{durationDays}</div>
                <div className="date-block-duration-label">
                  {durationDays === 1 ? "DAY" : "DAYS"}
                </div>
                <div className="date-block-sub">
                  {durationDays && durationDays >= 7 ? `~${Math.round(durationDays / 7)} week${Math.round(durationDays / 7) === 1 ? "" : "s"}` : "Short event"}
                </div>
              </div>
              <div className="date-block-arrow">→</div>
              <div className="date-block date-block-end">
                <div className="date-block-label">🏁 Ends</div>
                <div className="date-block-month">{formatMonth(event.end_date)}</div>
                <div className="date-block-day">{formatDay(event.end_date)}</div>
                <div className="date-block-year">{formatYear(event.end_date)}</div>
                <div className="date-block-sub">{formatLongDate(event.end_date)}</div>
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="event-stats-grid">
            <div className="event-stat-cell">
              <div className="event-stat-label">Teams</div>
              <div className="event-stat-value">{teams.length}</div>
              <div className="event-stat-sub">Participating</div>
            </div>
            <div className="event-stat-cell">
              <div className="event-stat-label">Roster</div>
              <div className="event-stat-value">{totalPlayerCount}</div>
              <div className="event-stat-sub">{totalPlayerCount === 1 ? "Person" : "People"}</div>
            </div>
            <div className="event-stat-cell">
              <div className="event-stat-label">
                {(event.event_type === "camp" || event.event_type === "mini-camp") ? "Goal/Player" : "Reg Fee"}
              </div>
              <div className="event-stat-value">
                {goalNum > 0 ? `$${formatMoney(goalNum)}` : "—"}
              </div>
              <div className="event-stat-sub">
                {(event.event_type === "camp" || event.event_type === "mini-camp") ? "Min to compete" : "Per player"}
              </div>
            </div>
            <div className="event-stat-cell">
              <div className="event-stat-label">
                {(event.event_type === "camp" || event.event_type === "mini-camp") ? "Min Net to Team" : "Net to Team"}
              </div>
              <div className="event-stat-value" style={{ color: "var(--color-gold)" }}>
                {goalNum > 0 ? `$${formatMoney(netToTeam)}` : "—"}
              </div>
              <div className="event-stat-sub">After prizes</div>
            </div>
          </div>

          {/* What's Next - prominent action panel for draft events */}
          {event.status === "draft" && (
            <div className="next-steps-card">
              <div className="next-steps-header">
                <span className="next-steps-eyebrow">★ NEXT STEPS ★</span>
                <h2 className="next-steps-title">Here's What to Do Next</h2>
              </div>
              <div className="next-step-list">
                <div className="next-step-item">
                  <div className="next-step-num">1</div>
                  <div className="next-step-content">
                    <h3 className="next-step-title">Pick your challenges</h3>
                    <p className="next-step-text">
                      Choose what your players or participants must complete to
                      compete for prizes — push-ups, free throws, Bible verses,
                      mile runs, service hours, whatever fits. The more reps
                      they hit (and {(event.event_type === "camp" || event.event_type === "mini-camp") ? "the more they raise above the minimum" : "the better they perform"}), the more points they earn.
                    </p>
                    <Link href={`/events/${event.id}/schedule`} className="next-step-link">
                      {(eventChallenges?.length || 0) > 0
                        ? `✓ ${eventChallenges?.length} challenge${(eventChallenges?.length || 0) === 1 ? "" : "s"} scheduled — open planner`
                        : "Open Schedule Planner →"}
                    </Link>
                  </div>
                </div>
                <div className="next-step-item">
                  <div className="next-step-num">2</div>
                  <div className="next-step-content">
                    <h3 className="next-step-title">Activate the event to open registration</h3>
                    <p className="next-step-text">
                      {(event.event_type === "camp" || event.event_type === "mini-camp") ? (
                        <>
                          Hit <strong>Activate Event</strong> to open the
                          fundraising window. Each player gets a unique QR
                          code to share with supporters (parents, family, local
                          businesses) to collect their fundraising minimum.
                          Once they hit the minimum, they're registered to
                          compete.
                        </>
                      ) : (
                        <>
                          Hit <strong>Activate Event</strong> to open
                          registration. Each player gets a unique QR code.
                          Players can pay the entry fee themselves, or share
                          the code with a supporter (parent, family, local
                          business) to cover it. Once paid, they're registered.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="next-step-item">
                  <div className="next-step-num">3</div>
                  <div className="next-step-content">
                    <h3 className="next-step-title">Generate entry QR codes</h3>
                    <p className="next-step-text">
                      After activation, each registered player gets a QR code
                      to share with supporters. Supporters scan it to{" "}
                      {(event.event_type === "camp" || event.event_type === "mini-camp") ? "contribute toward the player's fundraising goal" : "pay the player's registration fee"}.
                    </p>
                    <Link href={`/events/${event.id}/qr-codes`} className="next-step-link">
                      📱 Open QR Code Generator →
                    </Link>
                  </div>
                </div>
                <div className="next-step-item">
                  <div className="next-step-num">4</div>
                  <div className="next-step-content">
                    <h3 className="next-step-title">Run the event &amp; pick winners</h3>
                    <p className="next-step-text">
                      During the event, players complete their challenges. Review
                      their submissions, approve or reject each one, and watch the
                      leaderboard update in real time. Highest total points wins.
                    </p>
                    <Link href={`/events/${event.id}/submissions`} className="next-step-link">
                      ✓ Open Submissions Queue →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Breakdown card */}
          {showBreakdown && (
            <div className="breakdown-card">
              <div className="breakdown-eyebrow">★ YOUR FUNDRAISING PLAN ★</div>
              <h3 className="breakdown-title">The Math at a Glance</h3>
              <div className="breakdown-rows">
                <div className="breakdown-row">
                  <span className="breakdown-label">
                    ${formatMoney(goalNum)} {(event.event_type === "camp" || event.event_type === "mini-camp") ? "minimum" : "fee"} × {totalPlayerCount} player{totalPlayerCount === 1 ? "" : "s"}/participant{totalPlayerCount === 1 ? "" : "s"}
                  </span>
                  <span className="breakdown-value">${formatMoney(totalRaised)}</span>
                </div>
                {prizePool > 0 && (
                  <div className="breakdown-row breakdown-row-deduct">
                    <span className="breakdown-label">− Prize Pool</span>
                    <span className="breakdown-value">−${formatMoney(prizePool)}</span>
                  </div>
                )}
                <div className="breakdown-divider"></div>
                <div className="breakdown-row breakdown-row-final">
                  <span className="breakdown-label">
                    {(event.event_type === "camp" || event.event_type === "mini-camp") ? "Minimum Net to Team" : "Net to Team"}
                  </span>
                  <span className="breakdown-value breakdown-value-final">
                    ${formatMoney(netToTeam)}
                  </span>
                </div>
              </div>

              {totalPlayerCount === 0 ? (
                <div className="breakdown-per-player breakdown-per-player-empty">
                  ★ Add players or participants to your team(s) to see breakdown
                </div>
              ) : netToTeam < 0 ? (
                <div className="breakdown-per-player breakdown-per-player-warning">
                  ⚠ Prize pool exceeds total raised. Reduce prizes or raise the {(event.event_type === "camp" || event.event_type === "mini-camp") ? "goal" : "fee"}.
                </div>
              ) : (event.event_type === "camp" || event.event_type === "mini-camp") ? (
                <div className="breakdown-per-player">
                  <span className="breakdown-per-player-icon">★</span>
                  <span>
                    Each player must raise <strong>${formatMoney(goalNum)}</strong>{" "}
                    minimum to compete — extra raised = extra points
                  </span>
                </div>
              ) : (
                <div className="breakdown-per-player">
                  <span className="breakdown-per-player-icon">★</span>
                  <span>
                    Each player pays <strong>${formatMoney(goalNum)}</strong>{" "}
                    to register and compete
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Participating Teams */}
          <div className="dashboard-card">
            <h2 className="dashboard-card-title">Participating Teams</h2>
            {teams.length > 0 ? (
              <div className="event-team-list">
                {teams.map((team: any) => (
                  <Link href={`/teams/${team.id}`} key={team.id} className="event-team-chip">
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

          {/* Training Schedule */}
          <div className="dashboard-card">
            <div className="section-header" style={{ marginBottom: "16px" }}>
              <h2 className="dashboard-card-title">Training Schedule</h2>
              <Tooltip text="Plan which challenges happen each day of the event. Click 'Open Planner' to set up the calendar.">
                <Link href={`/events/${event.id}/schedule`} className="btn-add">
                  {(eventChallenges?.length || 0) > 0 ? "📅 Open Planner" : "+ Open Planner"}
                </Link>
              </Tooltip>
            </div>
            {(eventChallenges?.length || 0) === 0 ? (
              <p className="dashboard-card-text">
                No challenges scheduled yet. Open the planner to assign challenges
                to specific days of the event.
              </p>
            ) : (
              <>
                {(() => {
                  // Group challenges by day_index
                  const grouped: Record<number, any[]> = {};
                  (eventChallenges || []).forEach((ec: any) => {
                    const idx = ec.day_index ?? 0;
                    if (!grouped[idx]) grouped[idx] = [];
                    grouped[idx].push(ec);
                  });
                  const dayIndices = Object.keys(grouped).map(Number).sort((a, b) => a - b);
                  const totalReps = (eventChallenges || []).reduce((sum: number, ec: any) => sum + (Number(ec.rep_target) || 0), 0);

                  // Calculate total event days
                  const startD = new Date(event.start_date + "T12:00:00");
                  const endD = new Date(event.end_date + "T12:00:00");
                  const totalDays = Math.floor((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  const restDays = totalDays - dayIndices.length;

                  return (
                    <>
                      <div className="schedule-summary-row">
                        <div className="schedule-summary-stat">
                          <div className="schedule-summary-num">{dayIndices.length}</div>
                          <div className="schedule-summary-label">Active days</div>
                        </div>
                        <div className="schedule-summary-stat">
                          <div className="schedule-summary-num">{restDays}</div>
                          <div className="schedule-summary-label">Rest days</div>
                        </div>
                        <div className="schedule-summary-stat">
                          <div className="schedule-summary-num">{eventChallenges?.length || 0}</div>
                          <div className="schedule-summary-label">Challenges</div>
                        </div>
                        <div className="schedule-summary-stat">
                          <div className="schedule-summary-num">{totalReps.toLocaleString()}</div>
                          <div className="schedule-summary-label">Total reps</div>
                        </div>
                      </div>

                      <div className="schedule-day-list">
                        {dayIndices.slice(0, 5).map((dayIdx) => {
                          const dayDate = new Date(startD);
                          dayDate.setDate(dayDate.getDate() + dayIdx);
                          const label = dayDate.toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          });
                          const dayChalls = grouped[dayIdx];
                          return (
                            <div key={dayIdx} className="schedule-day-row">
                              <div className="schedule-day-label">
                                <div className="schedule-day-num">Day {dayIdx + 1}</div>
                                <div className="schedule-day-date">{label}</div>
                              </div>
                              <div className="schedule-day-challenges">
                                {dayChalls.map((ec: any) => {
                                  // Slice 4.5.4: show recording template emoji + photo indicator
                                  const recIcon = ec.challenges?.setup_template_key
                                    ? TEMPLATE_ICONS[ec.challenges.setup_template_key]
                                    : null;
                                  const hasPhoto = !!ec.challenges?.reference_photo_url;
                                  return (
                                    <span key={ec.id} className={`schedule-day-pill cat-${ec.challenges?.category?.toLowerCase()}`}>
                                      {recIcon && (
                                        <span
                                          className="schedule-day-pill-icon"
                                          title={`Recording: ${ec.challenges?.setup_template_key}`}
                                        >
                                          {recIcon}
                                        </span>
                                      )}
                                      {hasPhoto && (
                                        <span
                                          className="schedule-day-pill-icon"
                                          title="Has a reference photo"
                                        >
                                          🖼
                                        </span>
                                      )}
                                      {ec.challenges?.name} ({ec.rep_target || "—"} {ec.challenges?.unit || ""})
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {dayIndices.length > 5 && (
                          <p className="schedule-more-link">
                            + {dayIndices.length - 5} more day{dayIndices.length - 5 === 1 ? "" : "s"} scheduled. <Link href={`/events/${event.id}/schedule`}>Open the planner</Link> to see all.
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>

          {/* Supporter QR Codes (Slice 4.6) */}
          <div className="dashboard-card">
            <div className="section-header" style={{ marginBottom: "16px" }}>
              <h2 className="dashboard-card-title">Supporter QR Codes</h2>
              <Tooltip text="Each player gets a unique QR code linking to a public supporter page. Print them, share them, hang them on the fridge.">
                <Link href={`/events/${event.id}/qr-codes`} className="btn-add">
                  📱 Open
                </Link>
              </Tooltip>
            </div>
            <p className="dashboard-card-text">
              {(event.event_type === "camp" || event.event_type === "mini-camp") ? (
                <>Generate one-of-a-kind supporter QR codes for each player so family, friends, and local businesses can back their fundraising goal. Supporter payments are coming soon — codes work now so you can start sharing.</>
              ) : (
                <>Generate one-of-a-kind QR codes for each player so supporters can cover their registration fee. Supporter payments are coming soon — codes work now so you can start sharing.</>
              )}
            </p>
          </div>

          {/* Submissions Review (Slice 4.7) */}
          <div className="dashboard-card">
            <div className="section-header" style={{ marginBottom: "16px" }}>
              <h2 className="dashboard-card-title">Submissions</h2>
              <Tooltip text="Review and verify completed challenges from your players. Approved submissions earn points on the leaderboard.">
                <Link href={`/events/${event.id}/submissions`} className="btn-add">
                  ✓ Review
                </Link>
              </Tooltip>
            </div>
            <p className="dashboard-card-text">
              When players submit completed challenges (with video, photo, or notes),
              they show up here for one-tap approve, reject, or adjust. The player
              upload experience is coming soon — the queue and review tools are
              ready and waiting.
            </p>
            <p className="dashboard-card-text" style={{ marginTop: "10px", fontSize: "13px" }}>
              <Link href={`/events/${event.id}/points`} className="form-link">
                ⚙ Adjust challenge point values →
              </Link>
            </p>
          </div>

          {/* Leaderboard (Slice 4.7) */}
          <LeaderboardCard eventId={event.id} />

          {/* Prizes */}
          {(event.first_place_prize || event.first_place_amount ||
            event.second_place_prize || event.second_place_amount ||
            event.third_place_prize || event.third_place_amount) && (
            <div className="dashboard-card">
              <h2 className="dashboard-card-title">Prizes</h2>
              <div className="prize-list">
                {(event.first_place_prize || event.first_place_amount) && (
                  <div className="prize-row">
                    <span className="prize-medal">🥇</span>
                    <div style={{ flex: 1 }}>
                      <div className="prize-place">1st Place</div>
                      <div className="prize-text">
                        {event.first_place_amount && (
                          <strong>${formatMoney(Number(event.first_place_amount))} </strong>
                        )}
                        {event.first_place_prize}
                      </div>
                    </div>
                  </div>
                )}
                {(event.second_place_prize || event.second_place_amount) && (
                  <div className="prize-row">
                    <span className="prize-medal">🥈</span>
                    <div style={{ flex: 1 }}>
                      <div className="prize-place">2nd Place</div>
                      <div className="prize-text">
                        {event.second_place_amount && (
                          <strong>${formatMoney(Number(event.second_place_amount))} </strong>
                        )}
                        {event.second_place_prize}
                      </div>
                    </div>
                  </div>
                )}
                {(event.third_place_prize || event.third_place_amount) && (
                  <div className="prize-row">
                    <span className="prize-medal">🥉</span>
                    <div style={{ flex: 1 }}>
                      <div className="prize-place">3rd Place</div>
                      <div className="prize-text">
                        {event.third_place_amount && (
                          <strong>${formatMoney(Number(event.third_place_amount))} </strong>
                        )}
                        {event.third_place_prize}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Danger zone — delete event */}
          <DeleteButton
            table="events"
            recordId={event.id}
            recordName={event.name}
            redirectTo={org ? `/organizations/${org.id}` : "/dashboard"}
            consequences={[
              `${eventChallenges?.length || 0} scheduled challenge slot${(eventChallenges?.length || 0) === 1 ? "" : "s"} across all days`,
              `${event.prize_count || 0} prize tier${(event.prize_count || 0) === 1 ? "" : "s"}`,
              `${teams.length} team link${teams.length === 1 ? "" : "s"} (the teams themselves stay)`,
            ]}
            buttonLabel="Delete this event"
          />
        </div>

        {/* Right-rail walkthrough — Slice 5.2.1; reordered + QR step in 5.7. */}
        <EventGuide
          eventId={event.id}
          eventStatus={event.status}
          eventType={event.event_type}
          hasChallenges={(eventChallenges?.length || 0) > 0}
          hasInvitesSent={hasInvitesSent}
          hasQRCodes={hasQRCodes}
          totalSubmissionCount={totalSubmissionCount}
          pendingSubmissionCount={pendingSubmissionCount}
          firstTeamId={firstTeamId}
        />
      </div>
    </AppShell>
  );
}

// =============================================================================
// app/api/tournament-tiebreaker/notify/route.ts — Send transition emails (L37)
// =============================================================================
// POST { eventId, fromState, toState }
//
// Called by the event detail page and the public tournament page after they
// detect that process_tournament_tiebreaker just caused a state transition.
// The body tells us where the transition went so we can pick the right
// email variant and recipient set.
//
// Recipient rules:
//   activated, resolved, host_decided → all tied teams' coaches (team owners)
//   host_decision_needed → host (event owner) only
//
// Emails to *players* are deliberately NOT sent in this slice — the v5 spec
// says the social pressure happens off-platform via group chats. Coaches
// get the email and rally their teams. We can revisit if real usage shows
// players need direct notification.
//
// Requires SUPABASE_SERVICE_ROLE_KEY so we can look up user emails by UUID
// (auth.users isn't directly queryable). If not configured, returns early
// with a clear message — call site doesn't crash.
//
// Idempotency: this endpoint doesn't track sent emails. If the page is
// re-rendered while the transition row is the same call, only the first
// rendering causes a real transition (SQL atomic), so only one notify call
// fires. Calling notify again with the same fromState/toState would re-send
// emails — clients shouldn't do that.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  sendTiebreakerNotificationEmail,
  TiebreakerEmailVariant,
} from "@/lib/email";

interface NotifyBody {
  eventId: string;
  fromState: string;
  toState: string;
}

// Map state transitions to email variants. Only the four interesting
// transitions get notifications.
function variantForTransition(
  fromState: string,
  toState: string
): TiebreakerEmailVariant | null {
  // Activation: any non-active → active
  if (toState === "active" && fromState !== "active") return "activated";
  // Auto-resolution: active → resolved
  if (toState === "resolved" && fromState === "active") return "resolved";
  // Host decision needed: any → host_decision_needed (from active or
  // not_evaluated when no tiebreaker challenge declared)
  if (toState === "host_decision_needed" && fromState !== "host_decision_needed") {
    return "host_decision_needed";
  }
  // Host decided: host_decision_needed → host_decided
  if (toState === "host_decided" && fromState === "host_decision_needed") {
    return "host_decided";
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: NotifyBody;
  try {
    body = (await req.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.eventId || !body.fromState || !body.toState) {
    return NextResponse.json(
      { error: "eventId, fromState, and toState are required." },
      { status: 400 }
    );
  }

  // Only send for actual interesting transitions
  const variant = variantForTransition(body.fromState, body.toState);
  if (!variant) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "no_transition" });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Look up the event + its tournament metadata
  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select(
      `id, name, owner_id, event_type, tournament_join_code,
       tournament_tiebreaker_deadline_at,
       tournament_tiebreaker_window_hours,
       tournament_tiebreaker_winner_team_id,
       tournament_tiebreaker_tied_team_ids,
       tournament_tiebreaker_challenge_id,
       organizations(name)`
    )
    .eq("id", body.eventId)
    .single();

  if (evErr || !ev) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  if (ev.event_type !== "tournament") {
    return NextResponse.json({ error: "Not a tournament." }, { status: 400 });
  }

  // We need the service-role admin client to look up user emails by UUID
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        sent: 0,
        skipped: "service_role_unavailable",
        note: "SUPABASE_SERVICE_ROLE_KEY not configured; can't look up coach emails.",
      },
      { status: 200 }
    );
  }

  // Resolve host org name (relation may be array or object)
  let hostOrgName = "the host organization";
  const orgRel = ev.organizations;
  if (orgRel) {
    if (Array.isArray(orgRel)) {
      hostOrgName = (orgRel[0] as { name?: string })?.name || hostOrgName;
    } else if (typeof orgRel === "object" && "name" in orgRel) {
      hostOrgName = (orgRel as { name?: string }).name || hostOrgName;
    }
  }

  // Resolve tiebreaker challenge name + target if present
  let tiebreakerChallengeName: string | null = null;
  let tiebreakerChallengeTarget: string | null = null;
  if (ev.tournament_tiebreaker_challenge_id) {
    const { data: tbCh } = await supabase
      .from("event_challenges")
      .select("rep_target, challenges(name, unit)")
      .eq("id", ev.tournament_tiebreaker_challenge_id)
      .maybeSingle();
    if (tbCh) {
      const c = tbCh.challenges;
      let chName: string | null = null;
      let chUnit: string | null = null;
      if (c) {
        const cObj = Array.isArray(c) ? c[0] : c;
        if (cObj) {
          chName = (cObj as { name?: string }).name ?? null;
          chUnit = (cObj as { unit?: string }).unit ?? null;
        }
      }
      tiebreakerChallengeName = chName;
      if (tbCh.rep_target && chUnit) {
        tiebreakerChallengeTarget = `${tbCh.rep_target} ${chUnit}`;
      }
    }
  }

  // Resolve winner team name if applicable
  let winnerTeamName: string | null = null;
  if (
    (variant === "resolved" || variant === "host_decided") &&
    ev.tournament_tiebreaker_winner_team_id
  ) {
    const { data: winnerTeam } = await supabase
      .from("teams")
      .select("name")
      .eq("id", ev.tournament_tiebreaker_winner_team_id)
      .maybeSingle();
    winnerTeamName = winnerTeam?.name ?? null;
  }

  // Build recipient list based on variant
  const recipientUserIds: string[] = [];

  if (variant === "host_decision_needed") {
    // Host only
    recipientUserIds.push(ev.owner_id);
  } else {
    // Tied teams' coaches (team owners)
    if (
      Array.isArray(ev.tournament_tiebreaker_tied_team_ids) &&
      ev.tournament_tiebreaker_tied_team_ids.length > 0
    ) {
      const { data: tiedTeamRows } = await supabase
        .from("teams")
        .select("owner_id")
        .in("id", ev.tournament_tiebreaker_tied_team_ids);
      (tiedTeamRows || []).forEach((t) => {
        if (t.owner_id) recipientUserIds.push(t.owner_id);
      });
    }
  }

  // Look up each recipient's email + name via admin API
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    "https://app.earn2keep.com";
  const tournamentUrl = ev.tournament_join_code
    ? `${baseUrl}/tournament/${ev.tournament_join_code}`
    : `${baseUrl}/events/${ev.id}`;

  const results: { userId: string; status: "sent" | "failed"; error?: string }[] = [];

  for (const userId of recipientUserIds) {
    try {
      const { data: userData, error: userErr } =
        await admin.auth.admin.getUserById(userId);
      if (userErr || !userData?.user?.email) {
        results.push({ userId, status: "failed", error: userErr?.message || "no email" });
        continue;
      }

      const email = userData.user.email;
      const firstName =
        (userData.user.user_metadata?.first_name as string | undefined) ||
        (userData.user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
        null;

      const sendResult = await sendTiebreakerNotificationEmail({
        to: email,
        recipientFirstName: firstName,
        variant,
        tournamentName: ev.name,
        hostOrgName,
        tournamentUrl,
        tiebreakerChallengeName,
        tiebreakerChallengeTarget,
        deadlineIso: ev.tournament_tiebreaker_deadline_at || null,
        windowHours: ev.tournament_tiebreaker_window_hours || null,
        winnerTeamName,
      });

      if (sendResult.ok) {
        results.push({ userId, status: "sent" });
      } else {
        results.push({ userId, status: "failed", error: sendResult.error });
      }
    } catch (err) {
      results.push({
        userId,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const sentCount = results.filter((r) => r.status === "sent").length;
  return NextResponse.json({ ok: true, variant, sent: sentCount, results });
}

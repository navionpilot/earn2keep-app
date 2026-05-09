// =============================================================================
// app/api/invites/send/route.ts — Create + (optionally) email player invites
// =============================================================================
// Slice 5.1 originally generated invite rows + returned the URLs for manual
// share. Slice 5.1.1 adds an optional auto-email path.
//
// Request shape:
//   {
//     items: [{ playerId: string, email?: string }, ...],
//     mode: "send" | "links_only"   // default "links_only"
//   }
//
// When mode="send":
//   - We look up the latest active/draft event for each player's team so the
//     email subject + body can reference the Camp/Tournament name.
//   - For each invite row we fire a Resend API call. Failures are reported
//     per-row in `results[i].emailStatus = "failed"` with the error message.
//   - The invite row itself still gets created even if the email fails — the
//     coach can copy/share the link manually as a fallback.
//
// Path A semantics (Slice 5.1) preserved when mode="links_only".
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { generateInviteToken } from "@/lib/invites";
import { sendInviteEmail } from "@/lib/email";

// Slice 5.4.2: same mapping as in /join/[token]/page.tsx — keeps email
// copy and web copy aligned. The 8 roles are coach, parent, teacher,
// youth_pastor, scout_leader, gym_owner, org_director, other.
function roleToInviterLabel(role: string | null | undefined): string {
  switch (role) {
    case "coach":
      return "coach";
    case "teacher":
      return "teacher";
    case "youth_pastor":
      return "youth pastor";
    case "scout_leader":
      return "scout leader";
    case "gym_owner":
      return "gym instructor";
    case "parent":
      return "parent";
    case "org_director":
    case "other":
    default:
      return "team leader";
  }
}

interface InviteRequestItem {
  playerId: string;
  email?: string;
}

type InviteMode = "send" | "links_only";

interface InviteResultItem {
  playerId: string;
  fullName: string;
  inviteUrl: string;
  email: string | null;
  // Per-row error, e.g. "You don't own this player." (rare, mostly for
  // safety against tampered requests). Distinct from emailStatus.
  error?: string;
  // Email delivery status. Only meaningful when the route was called with
  // mode="send".
  emailStatus?: "sent" | "failed" | "not_attempted";
  emailError?: string;
}

// Player rows we need to validate ownership + compose the email.
interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  team_id: string;
  parent_email: string | null;
  teams:
    | {
        organization_id: string;
        name: string;
        sport_or_activity: string | null;
        organizations: { name: string } | { name: string }[] | null;
      }
    | {
        organization_id: string;
        name: string;
        sport_or_activity: string | null;
        organizations: { name: string } | { name: string }[] | null;
      }[]
    | null;
}

// Best event we found for a given team (cached per team_id during a batch).
interface TeamEventContext {
  teamId: string;
  teamName: string;
  teamSport: string | null;
  orgName: string;
  eventName: string | null;
  eventType: "camp" | "tournament" | null;
}

export async function POST(req: NextRequest) {
  let body: { items?: InviteRequestItem[]; mode?: InviteMode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const mode: InviteMode = body.mode === "send" ? "send" : "links_only";

  if (items.length === 0) {
    return NextResponse.json({ error: "No players selected." }, { status: 400 });
  }
  if (items.length > 100) {
    return NextResponse.json(
      { error: "Too many players in one request (max 100)." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // ----- 1. Auth -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // ----- 2. Validate player ownership + pull team/org metadata in one query.
  // The nested select traverses players -> teams -> organizations(name) so
  // we don't need a second round trip per team for the email subject.
  const playerIds = items.map((i) => i.playerId).filter(Boolean);
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, team_id, parent_email, teams(organization_id, name, sport_or_activity, organizations(name))"
    )
    .in("id", playerIds);

  if (playersError) {
    return NextResponse.json(
      { error: `Could not load players: ${playersError.message}` },
      { status: 500 }
    );
  }
  if (!players || players.length === 0) {
    return NextResponse.json({ error: "No matching players found." }, { status: 404 });
  }

  // Slice 5.4.2: pull the sending coach's primary_role so the email can
  // refer to them by their actual role (youth pastor, scout leader, etc.)
  // rather than always saying "coach". One query, used for every send.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("primary_role")
    .eq("id", user.id)
    .maybeSingle();
  const inviterRole = profileRow?.primary_role || null;
  const inviterLabel = roleToInviterLabel(inviterRole);

  const playersTyped = players as PlayerRow[];

  // Helper: Supabase returns relations as object OR array depending on
  // whether it inferred 1:1 or 1:many. Normalize to a single object.
  const teamOf = (p: PlayerRow) => (Array.isArray(p.teams) ? p.teams[0] : p.teams);
  const orgOfTeam = (
    t: NonNullable<ReturnType<typeof teamOf>>
  ): { name: string } | null => {
    if (!t.organizations) return null;
    return Array.isArray(t.organizations) ? t.organizations[0] : t.organizations;
  };

  // ----- 3. Verify the coach owns each org. We bounce on owner_id at the
  // organizations table to match the same authority model RLS uses.
  const orgIds = Array.from(
    new Set(
      playersTyped
        .map((p) => teamOf(p)?.organization_id ?? null)
        .filter((x): x is string => Boolean(x))
    )
  );
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select("id")
    .in("id", orgIds)
    .eq("owner_id", user.id);
  if (orgsError) {
    return NextResponse.json(
      { error: `Could not validate org ownership: ${orgsError.message}` },
      { status: 500 }
    );
  }
  const ownedOrgIds = new Set((orgs || []).map((o) => o.id));

  // ----- 4. Look up the most relevant event PER TEAM so the email can
  // reference the Camp/Tournament name. Active beats Draft. If neither
  // exists for a team, the email falls back to roster-only language.
  const teamIds = Array.from(new Set(playersTyped.map((p) => p.team_id).filter(Boolean)));
  const teamEventCtx = new Map<string, TeamEventContext>();

  if (mode === "send" && teamIds.length > 0) {
    const { data: participations } = await supabase
      .from("event_participants")
      .select("team_id, events(id, name, event_type, status, updated_at)")
      .in("team_id", teamIds);

    // The same shape-normalization dance.
    type EventRow = {
      id: string;
      name: string;
      event_type: "camp" | "tournament" | null;
      status: "draft" | "active" | "completed" | null;
      updated_at: string | null;
    };
    type ParticipationRow = {
      team_id: string;
      events: EventRow | EventRow[] | null;
    };
    const partsTyped = (participations || []) as ParticipationRow[];

    // Score events: active=2, draft=1, completed=0; tiebreak by updated_at.
    const scoreOf = (e: EventRow): number => {
      if (e.status === "active") return 2;
      if (e.status === "draft") return 1;
      return 0;
    };

    // For each team, pick the highest-scoring event.
    for (const tid of teamIds) {
      const player = playersTyped.find((p) => p.team_id === tid);
      const team = player ? teamOf(player) : null;
      const orgRel = team ? orgOfTeam(team) : null;
      if (!team) continue;

      // Collect every event for this team across all participation rows.
      const eventCandidates: EventRow[] = [];
      for (const part of partsTyped) {
        if (part.team_id !== tid) continue;
        if (!part.events) continue;
        const evs = Array.isArray(part.events) ? part.events : [part.events];
        for (const e of evs) {
          if (!e || e.status === "completed") continue;
          eventCandidates.push(e);
        }
      }
      eventCandidates.sort((a, b) => {
        const sd = scoreOf(b) - scoreOf(a);
        if (sd !== 0) return sd;
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      });
      const best = eventCandidates[0] || null;

      teamEventCtx.set(tid, {
        teamId: tid,
        teamName: team.name,
        teamSport: team.sport_or_activity,
        orgName: orgRel?.name || "your team",
        eventName: best ? best.name : null,
        eventType: best ? best.event_type : null,
      });
    }
  }

  // ----- 5. Build invite rows + result placeholders. Same ownership-check
  // pattern as 5.1 (we trust RLS but also validate explicitly for clearer
  // per-player error messages).
  const playerById = new Map(playersTyped.map((p) => [p.id, p]));
  const results: InviteResultItem[] = [];
  const inviteRowsToInsert: Array<{
    player_id: string;
    token: string;
    email: string | null;
    sent_at: string;
    created_by: string;
  }> = [];
  // Parallel array — when mode="send", we need to know which token + email
  // each successful insert corresponds to so we can Resend after.
  const sendQueue: Array<{
    playerId: string;
    token: string;
    email: string;
    fullName: string;
  }> = [];

  for (const item of items) {
    const player = playerById.get(item.playerId);
    if (!player) {
      results.push({
        playerId: item.playerId,
        fullName: "(unknown player)",
        inviteUrl: "",
        email: null,
        error: "Player not found.",
      });
      continue;
    }

    const team = teamOf(player);
    const playerOrgId = team?.organization_id;
    if (!playerOrgId || !ownedOrgIds.has(playerOrgId)) {
      results.push({
        playerId: player.id,
        fullName: `${player.first_name} ${player.last_name ?? ""}`.trim(),
        inviteUrl: "",
        email: null,
        error: "You don't own this player.",
      });
      continue;
    }

    const token = generateInviteToken();
    const sent_at = new Date().toISOString();
    const email = (item.email && item.email.trim()) || player.parent_email || null;
    const fullName = `${player.first_name} ${player.last_name ?? ""}`.trim();

    inviteRowsToInsert.push({
      player_id: player.id,
      token,
      email,
      sent_at,
      created_by: user.id,
    });

    results.push({
      playerId: player.id,
      fullName,
      inviteUrl: `/join/${token}`,
      email,
      // Default to not_attempted; the send loop below upgrades to sent/failed.
      emailStatus: mode === "send" ? "not_attempted" : undefined,
    });

    if (mode === "send" && email) {
      sendQueue.push({ playerId: player.id, token, email, fullName });
    } else if (mode === "send" && !email) {
      // Queue an immediate "no email on file" failure so the result row
      // surfaces it. Keeps the coach's mental model consistent: every row
      // they ticked Send for shows a status icon.
      const idx = results.length - 1;
      results[idx].emailStatus = "failed";
      results[idx].emailError = "No email address on file for this player.";
    }
  }

  if (inviteRowsToInsert.length === 0) {
    return NextResponse.json({ results }, { status: 200 });
  }

  // ----- 6. Insert all invites in one shot.
  const { error: insertError } = await supabase
    .from("player_invites")
    .insert(inviteRowsToInsert);
  if (insertError) {
    return NextResponse.json(
      { error: `Could not create invites: ${insertError.message}` },
      { status: 500 }
    );
  }

  // ----- 7. If mode="send", fire emails. Done sequentially to keep things
  // simple — for 100 sends sequentially that's still <30 sec, well under
  // most serverless function timeouts. If we ever need higher throughput
  // we can switch to Promise.allSettled with a small concurrency limit.
  if (mode === "send" && sendQueue.length > 0) {
    // Construct full URL once. Server side, we read the request URL's
    // origin so this works on prod, preview, and dev without hardcoding.
    const origin =
      req.nextUrl.origin || `https://${req.headers.get("host") || "app.earn2keep.com"}`;

    for (const queued of sendQueue) {
      const player = playerById.get(queued.playerId);
      if (!player) continue;
      const ctx = teamEventCtx.get(player.team_id);
      const result = results.find((r) => r.playerId === queued.playerId);
      if (!result) continue;

      const sendResult = await sendInviteEmail({
        to: queued.email,
        playerFirstName: player.first_name,
        playerLastName: player.last_name,
        teamName: ctx?.teamName || "your team",
        teamSport: ctx?.teamSport ?? null,
        orgName: ctx?.orgName || "your organization",
        eventName: ctx?.eventName ?? null,
        eventType: ctx?.eventType ?? null,
        inviteUrl: `${origin}/join/${queued.token}`,
        inviterLabel,
      });

      if (sendResult.ok) {
        result.emailStatus = "sent";
      } else {
        result.emailStatus = "failed";
        result.emailError = sendResult.error || "Unknown send error.";
      }
    }
  }

  return NextResponse.json({ results }, { status: 200 });
}

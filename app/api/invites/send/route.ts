// =============================================================================
// app/api/invites/send/route.ts — Create player invites (Slice 5.1, Path A)
// =============================================================================
// Coach POSTs a list of player IDs (with optional emails). Server:
//   1. Authenticates the coach via Supabase server client
//   2. Validates each playerId belongs to the coach (via the players-team-
//      organizations chain, double-checked here even though RLS would
//      reject anyway — explicit + clearer error messages)
//   3. Generates a fresh token per invite
//   4. Inserts player_invites rows
//   5. Returns the invite URLs so the modal can display them
//
// Path A: this route does NOT actually send emails. It generates the URLs and
// hands them back so the coach can copy/share manually. Slice 5.1.1 will add
// Resend integration here so "Send" actually means "deliver via email."
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { generateInviteToken } from "@/lib/invites";

interface InviteRequestItem {
  playerId: string;
  email?: string;
}

interface InviteResultItem {
  playerId: string;
  fullName: string;
  inviteUrl: string;
  email: string | null;
  error?: string;
}

// Player rows we need to look up to validate ownership + build response names.
interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  team_id: string;
  parent_email: string | null;
  teams: { organization_id: string } | { organization_id: string }[] | null;
}

export async function POST(req: NextRequest) {
  let body: { items?: InviteRequestItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No players selected." },
      { status: 400 }
    );
  }
  if (items.length > 100) {
    // Sanity cap — no real coach is sending 100+ invites in one click.
    return NextResponse.json(
      { error: "Too many players in one request (max 100)." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. Validate ownership of every requested player. We pull the team's
  //    organization_id along with each player so we can check
  //    organizations.owner_id in one extra query.
  const playerIds = items.map((i) => i.playerId).filter(Boolean);
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, first_name, last_name, team_id, parent_email, teams(organization_id)")
    .in("id", playerIds);

  if (playersError) {
    return NextResponse.json(
      { error: `Could not load players: ${playersError.message}` },
      { status: 500 }
    );
  }
  if (!players || players.length === 0) {
    return NextResponse.json(
      { error: "No matching players found." },
      { status: 404 }
    );
  }

  // Resolve organization_ids and verify the coach owns each org.
  const playersTyped = players as PlayerRow[];
  const orgIds = Array.from(
    new Set(
      playersTyped
        .map((p) => {
          // Supabase returns the joined relation as an object OR an array
          // depending on whether the relationship is detected as one-to-one
          // or one-to-many. Handle both shapes.
          if (!p.teams) return null;
          if (Array.isArray(p.teams)) return p.teams[0]?.organization_id ?? null;
          return p.teams.organization_id;
        })
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

  // 3 + 4. Build invite rows. For each requested player, check ownership;
  //        if they don't own it, mark the result with an error rather than
  //        silently dropping (clearer for the coach).
  const results: InviteResultItem[] = [];
  const inviteRowsToInsert: Array<{
    player_id: string;
    token: string;
    email: string | null;
    sent_at: string;
    created_by: string;
  }> = [];

  // Map for fast lookup by id when building results
  const playerById = new Map(playersTyped.map((p) => [p.id, p]));

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

    const playerOrgId =
      Array.isArray(player.teams)
        ? player.teams[0]?.organization_id
        : player.teams?.organization_id;

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
    // Treat "URL generated" as "sent" for Path A. Slice 5.1.1 will overwrite
    // this with the real Resend send timestamp.
    const sent_at = new Date().toISOString();
    const email =
      (item.email && item.email.trim()) || player.parent_email || null;

    inviteRowsToInsert.push({
      player_id: player.id,
      token,
      email,
      sent_at,
      created_by: user.id,
    });

    results.push({
      playerId: player.id,
      fullName: `${player.first_name} ${player.last_name ?? ""}`.trim(),
      // Inline URL build — the modal renders these in the browser, so this
      // string ends up looking right after we tack on origin client-side.
      // Server can't know the origin, so we store just the token here and
      // let the modal call inviteUrlFromToken() locally.
      inviteUrl: `/join/${token}`,
      email,
    });
  }

  if (inviteRowsToInsert.length === 0) {
    return NextResponse.json({ results }, { status: 200 });
  }

  // 5. Insert all the valid invites in one shot.
  const { error: insertError } = await supabase
    .from("player_invites")
    .insert(inviteRowsToInsert);

  if (insertError) {
    return NextResponse.json(
      { error: `Could not create invites: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ results }, { status: 200 });
}

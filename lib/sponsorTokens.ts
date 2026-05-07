// ============================================================
// Sponsor token helpers (client-side).
//
// Tokens are 24-character hex strings (96 bits of entropy)
// generated client-side with crypto.getRandomValues. Each
// (player, event) gets exactly one token; we ensure they exist
// lazily when the coach opens the QR codes page.
//
// Direct table access is blocked by RLS for anonymous users —
// the public sponsor pages call the get_public_sponsor_view()
// Postgres function instead.
// ============================================================

import { createClient } from "@/lib/supabase-browser";

// 12 random bytes -> 24 hex chars. Plenty of entropy.
function generateRandomToken(): string {
  const arr = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback shouldn't be hit in any modern browser
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

export type PlayerForToken = {
  id: string;
  first_name: string;
  last_name: string | null;
  jersey_number: number | null;
  team_id: string;
  team_name: string;
  team_sport: string | null;
  team_age_group: string | null;
};

export type SponsorTokenRow = {
  id: string;
  player_id: string;
  event_id: string;
  token: string;
};

// Display version of the player name on the SPONSOR side.
// Mirrors the SQL function in 4.6-sponsor-tokens.sql.
// Coaches see this so they know what sponsors will see.
export function publicDisplayName(firstName: string, lastName: string | null): string {
  const last = (lastName || "").trim();
  if (!last) return firstName;
  return `${firstName} ${last.charAt(0).toUpperCase()}.`;
}

// Build the URL a sponsor visits when they scan the QR.
// Uses the page origin so both production and preview deploys work.
export function sponsorUrlFromToken(token: string): string {
  if (typeof window === "undefined") {
    // Server-side fallback (used only if a Server Component calls this)
    return `/sponsor/${token}`;
  }
  return `${window.location.origin}/sponsor/${token}`;
}

// Ensures every active player on every team participating in this
// event has a sponsor_tokens row. Returns the full set of tokens
// (existing + just-created) so the caller can render them.
export async function ensureTokensForEvent(
  eventId: string
): Promise<{ tokens: SponsorTokenRow[]; players: PlayerForToken[] }> {
  const supabase = createClient();

  // 1. Find participating teams
  const { data: parts, error: partsErr } = await supabase
    .from("event_participants")
    .select("team_id")
    .eq("event_id", eventId);
  if (partsErr) throw new Error(partsErr.message);

  const teamIds = (parts || []).map((p) => p.team_id).filter(Boolean);
  if (teamIds.length === 0) {
    return { tokens: [], players: [] };
  }

  // 2. Active players on those teams
  const { data: playersData, error: playersErr } = await supabase
    .from("players")
    .select("id, first_name, last_name, jersey_number, team_id, teams(id, name, sport_or_activity, age_group)")
    .in("team_id", teamIds)
    .eq("is_active", true)
    .order("first_name", { ascending: true });
  if (playersErr) throw new Error(playersErr.message);

  const players: PlayerForToken[] = (playersData || []).map((p: any) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    jersey_number: p.jersey_number,
    team_id: p.team_id,
    team_name: p.teams?.name || "Unknown team",
    team_sport: p.teams?.sport_or_activity || null,
    team_age_group: p.teams?.age_group || null,
  }));

  if (players.length === 0) {
    return { tokens: [], players: [] };
  }

  // 3. Existing tokens for this event
  const { data: existing, error: existErr } = await supabase
    .from("sponsor_tokens")
    .select("id, player_id, event_id, token")
    .eq("event_id", eventId);
  if (existErr) throw new Error(existErr.message);

  const existingByPlayer = new Map<string, SponsorTokenRow>();
  (existing || []).forEach((t: any) => existingByPlayer.set(t.player_id, t));

  // 4. Insert missing
  const missing = players.filter((p) => !existingByPlayer.has(p.id));
  if (missing.length > 0) {
    const newRows = missing.map((p) => ({
      player_id: p.id,
      event_id: eventId,
      token: generateRandomToken(),
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("sponsor_tokens")
      .insert(newRows)
      .select("id, player_id, event_id, token");
    if (insErr) throw new Error(insErr.message);

    (inserted || []).forEach((t: any) => existingByPlayer.set(t.player_id, t));
  }

  // 5. Return tokens in the same order as players
  const tokens = players
    .map((p) => existingByPlayer.get(p.id))
    .filter((t): t is SponsorTokenRow => Boolean(t));

  return { tokens, players };
}

// =============================================================================
// lib/notifications.ts — Shared notification helpers (Slice 5.9)
// =============================================================================
// Server-side helpers used by every page that renders <PlayerTopBar>.
// Keeps the unread-count query in one place so future tweaks (e.g.
// excluding some kinds, capping at 99, etc.) only happen here.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the unread-notification count for the current authenticated
 * user. Returns 0 on any error so callers don't have to error-handle —
 * the bell badge gracefully shows nothing if the query fails.
 */
export async function getUnreadNotificationCount(
  supabase: SupabaseClient
): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return count ?? 0;
}

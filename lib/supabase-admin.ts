// =============================================================================
// lib/supabase-admin.ts — Server-side admin client (Slice 5.4.3)
// =============================================================================
// A separate Supabase client that uses the SERVICE ROLE key instead of the
// anon key. Service role bypasses RLS and unlocks the auth.admin.* APIs we
// need for generating magic-link URLs server-side without sending Supabase's
// own email.
//
// SECURITY NOTES:
//   - SUPABASE_SERVICE_ROLE_KEY MUST be a server-only env var (no
//     NEXT_PUBLIC_ prefix). If a service role key ever leaks to the client
//     side, attackers can read/write any table bypassing RLS.
//   - This module is server-only by design — only imported from API routes
//     and server components.
//   - We disable session persistence on the admin client because admin
//     calls don't have a logged-in user; they act as the system.
//
// USAGE:
//   import { createAdminClient } from "@/lib/supabase-admin";
//   const admin = createAdminClient();
//   if (!admin) {
//     // Service role key isn't configured — fall back to non-admin path.
//   } else {
//     const { data } = await admin.auth.admin.generateLink({ ... });
//   }
//
// Returns null when SUPABASE_SERVICE_ROLE_KEY is missing so callers can
// gracefully degrade rather than crash. The deploy doc explains how to
// set the env var.
// =============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    // Caller is responsible for falling back. Logged at warn level by the
    // caller — we don't log here to keep this module pure.
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      // Admin client doesn't need to refresh / persist a session.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

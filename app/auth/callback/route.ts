// =============================================================================
// app/auth/callback/route.ts — OTP code exchange + optional invite claim
// =============================================================================
// Slice 5.1 left this file as the standard Supabase code-exchange handler:
// pulls ?code, exchanges it for a session, redirects to ?next.
//
// Slice 5.2 adds: if an ?invite=<token> query param is present, after a
// successful session is established, call the claim_player_invite() RPC to
// link the freshly-signed-in auth user to the player record and mark the
// invite claimed. RPC failures get logged but don't block the redirect —
// the user still ends up signed in, and /welcome will surface a friendly
// "we couldn't find your player record" state if the claim didn't take.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite");
  // Slice 5.4.3: when an invite token is present (player signup flow), default
  // to /home so the new player goes straight to their home screen. Coach
  // signup flow continues to default to /dashboard.
  const next =
    searchParams.get("next") ?? (inviteToken ? "/home" : "/dashboard");

  if (!code) {
    // Old behavior preserved — no code means nothing to exchange.
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // If a player invite token was passed along, claim it now that the user is
  // authenticated. The RPC is idempotent for "same user re-claiming," so
  // double-clicks / refreshes don't cause issues.
  if (inviteToken) {
    const { data: claimResult, error: claimError } = await supabase.rpc(
      "claim_player_invite",
      { p_token: inviteToken }
    );

    if (claimError) {
      // Log to Vercel logs for debugging; do NOT block the redirect.
      // The /welcome page handles the case where claim didn't link a player.
      console.error("claim_player_invite RPC failed:", claimError.message);
    } else if (claimResult && (claimResult as { ok?: boolean }).ok === false) {
      // RPC succeeded at the protocol level but returned a soft error
      // (expired token, claimed by someone else, etc.).
      console.warn(
        "claim_player_invite returned ok=false:",
        (claimResult as { error?: string }).error
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

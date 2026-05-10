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

  // Slice 5.4.4: when there's no ?code= but the request landed here, it's
  // likely an admin-generated magic link using the implicit (hash) flow —
  // the access_token is in the URL hash, which we can't see server-side.
  // Redirect to the client-side /auth/finish handler. Browsers preserve
  // the hash through HTTP redirects when the destination URL doesn't
  // include its own hash.
  if (!code) {
    const passthrough = new URLSearchParams();
    if (inviteToken) passthrough.set("invite", inviteToken);
    passthrough.set("next", next);
    return NextResponse.redirect(
      `${origin}/auth/finish?${passthrough.toString()}`
    );
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
      // Slice 5.4.6: surface the error via query param so /home can show
      // the actual reason in its recovery card. Previously this just logged
      // and proceeded, leaving /home to silently bounce to /dashboard.
      console.error("claim_player_invite RPC failed:", claimError.message);
      const errRedirect = new URL(`${origin}${next}`);
      errRedirect.searchParams.set("claim_error", claimError.message);
      return NextResponse.redirect(errRedirect);
    } else if (claimResult && (claimResult as { ok?: boolean }).ok === false) {
      // Slice 5.4.6: same treatment for soft failures (RPC returned
      // { ok: false, error: "..." } for expired / already-claimed / etc).
      const reason =
        (claimResult as { error?: string }).error ||
        "the invite couldn't be linked to your account";
      console.warn("claim_player_invite returned ok=false:", reason);
      const errRedirect = new URL(`${origin}${next}`);
      errRedirect.searchParams.set("claim_error", reason);
      return NextResponse.redirect(errRedirect);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

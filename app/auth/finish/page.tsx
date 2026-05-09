"use client";

// =============================================================================
// app/auth/finish/page.tsx — Client-side magic-link handler (Slice 5.4.4)
// =============================================================================
// WHY THIS EXISTS:
//   Supabase's auth.admin.generateLink() (used in the invite-send API route)
//   produces magic-link URLs that use the IMPLICIT flow — the access token
//   comes back in the URL HASH (#access_token=...) instead of as a ?code=
//   query param. PKCE flow (?code=) requires a code_verifier that lives
//   client-side, which the server can't generate on behalf of a user. So
//   admin-generated links inherently use the older hash flow.
//
//   Our existing /auth/callback is a server-side Route Handler. Server-side
//   code can't read URL hashes (they're stripped before reaching the server).
//   So we need a CLIENT-side page that:
//     1. Reads the hash fragment
//     2. Calls supabase.auth.setSession() to install the tokens
//     3. Reads the ?invite= query param
//     4. Calls claim_player_invite() RPC to link the auth user to the player
//     5. Redirects to /home (or wherever ?next= says)
//
// THE FLOW:
//   1. Coach sends invite -> API route generates magic-link URL pointing
//      redirect_to at /auth/finish?invite=<token>&next=/home
//   2. Player clicks magic-link in email
//   3. Supabase verify endpoint validates token, sets HttpOnly cookies,
//      redirects to .../auth/finish?invite=<token>&next=/home#access_token=
//      JWT&refresh_token=...
//   4. THIS PAGE renders, reads hash, completes auth, redirects to /home
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function AuthFinishPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"working" | "error">("working");
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Signing you in…");

  useEffect(() => {
    const finish = async () => {
      // ---------- 1) Pull the access tokens from the URL hash ----------
      // The hash looks like: #access_token=JWT&refresh_token=...&type=magiclink&...
      // .slice(1) drops the leading '#'.
      const hash = window.location.hash.slice(1);
      if (!hash) {
        setError(
          "We didn't find any sign-in data in the URL. The link may have been opened twice or the hash got stripped along the way."
        );
        setStage("error");
        return;
      }

      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const errorDescription = hashParams.get("error_description");

      // Supabase puts the failure reason in the hash too if the link is
      // bad (expired, already-consumed, malformed). Surface it cleanly.
      if (errorDescription) {
        setError(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
        setStage("error");
        return;
      }

      if (!accessToken || !refreshToken) {
        setError("Sign-in tokens were missing from the URL.");
        setStage("error");
        return;
      }

      // ---------- 2) Install the session ----------
      // setSession on the SSR-aware browser client also syncs cookies, so
      // the next server-rendered page (e.g. /home) sees us as logged in.
      const supabase = createClient();
      const { error: setErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (setErr) {
        setError(`Couldn't establish session: ${setErr.message}`);
        setStage("error");
        return;
      }

      // ---------- 3) Read the invite token + intended next URL ----------
      const queryParams = new URLSearchParams(window.location.search);
      const inviteToken = queryParams.get("invite");
      const nextRaw = queryParams.get("next");
      // Default to /home for player flow, /dashboard for everything else.
      // Reject absolute URLs in `next` to avoid open-redirect.
      const next =
        nextRaw && nextRaw.startsWith("/")
          ? nextRaw
          : inviteToken
          ? "/home"
          : "/dashboard";

      // ---------- 4) Claim the invite if one was passed ----------
      if (inviteToken) {
        setStatusText("Linking you to your team…");
        const { error: claimErr } = await supabase.rpc(
          "claim_player_invite",
          { p_token: inviteToken }
        );
        if (claimErr) {
          // Don't block the redirect — the user IS signed in, we just
          // couldn't link them. /home will surface a "we're missing
          // something" recovery state if there's no linked player.
          console.error(
            "[auth/finish] claim_player_invite failed:",
            claimErr.message
          );
        }
      }

      // ---------- 5) Off you go ----------
      // Strip the hash + query before redirecting so a refresh on the
      // destination doesn't replay the magic link (now consumed).
      // router.replace doesn't preserve hash, which is what we want.
      router.replace(next);
    };

    void finish();
  }, [router]);

  return (
    <main className="join-page-wrap">
      <div className="join-page-card">
        <div className="join-page-brand">
          <span className="join-page-brand-name">earn²keep</span>
        </div>

        {stage === "working" && (
          <div className="auth-finish-working">
            <div className="invites-spinner" />
            <p className="join-page-text">{statusText}</p>
            <p className="auth-finish-fineprint">
              This should only take a second.
            </p>
          </div>
        )}

        {stage === "error" && (
          <>
            <h1 className="join-page-title">Sign-in didn&apos;t work</h1>
            <p className="join-page-text">{error}</p>
            <p className="join-page-text">
              Try clicking the button in your invite email again. If the link
              has expired, ask your coach to send a fresh invite.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

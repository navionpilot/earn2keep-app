"use client";

// =============================================================================
// components/ClaimAccountForm.tsx — Magic-link claim form (Slice 5.2)
// =============================================================================
// Lives inside /join/[token]. The Server Component parent already validated
// the token and looked up player/team metadata; this client component just
// drives the actual sign-in:
//
//   1. Player sees their email prefilled (from the invite the coach sent).
//   2. They can edit it if it's wrong (e.g., coach typed parent's email).
//   3. Click "Send my login link" -> we call supabase.auth.signInWithOtp
//      with shouldCreateUser=true. If their auth user doesn't exist yet,
//      Supabase creates it; if it does, they just get a magic-link.
//   4. emailRedirectTo points at /auth/callback?invite=<token>&next=/welcome
//      so the callback can claim the invite for the now-signed-in user.
//   5. We flip to a "check your inbox" confirmation card.
//
// Errors get surfaced inline (bad email format, Supabase rate limits, etc.).
// =============================================================================

import { useState, FormEvent } from "react";
import { createClient } from "@/lib/supabase-browser";

interface Props {
  token: string;
  prefilledEmail: string;
  playerFirstName: string;
}

export default function ClaimAccountForm({
  token,
  prefilledEmail,
  playerFirstName,
}: Props) {
  const [email, setEmail] = useState(prefilledEmail);
  const [stage, setStage] = useState<"form" | "sending" | "sent">("form");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter an email address.");
      return;
    }
    // Lightweight format check — Supabase will do a stricter one server-side.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("That doesn't look like a valid email address.");
      return;
    }

    setStage("sending");

    try {
      const supabase = createClient();
      const origin = window.location.origin;
      // Slice 5.4.3: lands the player on /home instead of /welcome since
      // the dedicated welcome page is now bypassed by the primary one-
      // click flow. Keeping /welcome accessible but no longer the default.
      const redirectTo = `${origin}/auth/callback?invite=${encodeURIComponent(
        token
      )}&next=${encodeURIComponent("/home")}`;

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          // shouldCreateUser=true means: if no auth.users row exists for this
          // email, create one. That's exactly what we want for first-time
          // player signups; for returning players (already-claimed flow),
          // it just sends them a fresh magic-link.
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
        },
      });

      if (signInError) {
        setStage("form");
        setError(signInError.message);
        return;
      }

      setStage("sent");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error.";
      setStage("form");
      setError(msg);
    }
  };

  // ---------- "Email sent" success state ----------
  if (stage === "sent") {
    return (
      <div className="claim-form-sent">
        <div className="claim-form-sent-icon">📬</div>
        <h2 className="claim-form-sent-title">Check your inbox!</h2>
        <p className="claim-form-sent-text">
          We just sent a sign-in link to <strong>{email}</strong>. Click the
          button in that email to finish setting up your earn²keep account,{" "}
          {playerFirstName}.
        </p>
        <p className="claim-form-sent-fineprint">
          The link is good for one hour. Check your spam folder if it doesn&apos;t
          show up in a couple of minutes.
        </p>
      </div>
    );
  }

  // ---------- Form ----------
  return (
    <form className="claim-form" onSubmit={handleSubmit}>
      <label className="claim-form-label" htmlFor="claim-email">
        Your email address
      </label>
      <input
        id="claim-email"
        type="email"
        className="form-input claim-form-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        autoCapitalize="none"
        required
        disabled={stage === "sending"}
      />
      <p className="claim-form-hint">
        We&apos;ll email you a one-time sign-in link — no password to remember.
      </p>

      {error && (
        <div className="alert alert-error" style={{ marginTop: "12px" }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary claim-form-submit"
        disabled={stage === "sending"}
      >
        {stage === "sending" ? "Sending…" : "Send me my sign-in link →"}
      </button>
    </form>
  );
}

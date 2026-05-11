// =============================================================================
// app/api/notify/submission-reviewed/route.ts (Slice 5.9)
// =============================================================================
// POST endpoint hit by the coach's SubmissionReviewModal right after a
// successful status update. Responsibilities:
//   1. Verify the caller is authenticated and is the coach who owns the
//      submission's player (defense-in-depth — RLS already enforced the
//      update, but this stops anyone else from spamming review emails).
//   2. Read the player's notification_prefs.submission_reviewed flag.
//      If disabled, return 200 with skipped=true (no email, no error).
//   3. Resolve the player's email — prefers their auth-user email
//      (since they're the one who recorded), falls back to parent_email
//      if the player isn't linked yet (rare since reviewing implies a
//      submission, which implies an authed player).
//   4. Send the branded review email via Resend.
//
// We DO NOT create the in-app notification row here — the database
// trigger added in 5.9 SQL handles that automatically. This keeps the
// in-app notification reliable (fires no matter how the update happened)
// while letting email be a "best effort" addition handled in app code.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendSubmissionReviewedEmail, roleToLabel } from "@/lib/email";

export const runtime = "nodejs";

interface PostBody {
  submissionId: string;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { submissionId } = body || {};
  if (!submissionId || typeof submissionId !== "string") {
    return NextResponse.json(
      { error: "submissionId is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Pull the submission + the chain we need for the email content.
  // Owner check happens via RLS — non-coaches will see this query return
  // empty data (their RLS lets them only read their own players'
  // submissions, etc.).
  const { data: subRow, error: subErr } = await supabase
    .from("submissions")
    .select(
      "id, status, reps_approved, coach_note, rejection_reason, player_id, event_challenge_id, players!inner(id, first_name, parent_email, linked_user_id, notification_prefs, owner_id), event_challenges!inner(id, challenges(id, name), events(id, name))"
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }
  if (!subRow) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Only fire for terminal states. Pending = no email.
  if (subRow.status !== "approved" && subRow.status !== "rejected") {
    return NextResponse.json({ ok: true, skipped: true, reason: "non-terminal status" });
  }

  // Helper to coalesce the relation (Supabase may return as object or array).
  function single<T>(rel: T | T[] | null | undefined): T | null {
    if (!rel) return null;
    return Array.isArray(rel) ? rel[0] ?? null : rel;
  }

  const player = single(subRow.players) as
    | {
        id: string;
        first_name: string;
        parent_email: string | null;
        linked_user_id: string | null;
        notification_prefs: { submission_reviewed?: boolean } | null;
        owner_id: string;
      }
    | null;
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Ownership double-check — the caller must own this player record.
  if (player.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Forbidden — not your player" },
      { status: 403 }
    );
  }

  // Respect the player's notification preference.
  const prefs = player.notification_prefs ?? {};
  if (prefs.submission_reviewed === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "player prefs off" });
  }

  // Resolve email — prefer the player's own auth-user email (since they're
  // the one who recorded), falling back to parent_email when unlinked or
  // when the admin client isn't configured.
  let toEmail: string | null = null;
  if (player.linked_user_id) {
    const admin = createAdminClient();
    if (admin) {
      const { data: authUserResp } = await admin.auth.admin.getUserById(
        player.linked_user_id
      );
      toEmail = authUserResp?.user?.email ?? null;
    }
  }
  if (!toEmail) toEmail = player.parent_email;
  if (!toEmail) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no email on file (player unlinked + no parent email)",
    });
  }

  // Pull challenge + event names for the email.
  type ChShape = { id: string; name: string };
  type EvShape = { id: string; name: string };
  type EcShape = {
    id: string;
    challenges: ChShape | ChShape[] | null;
    events: EvShape | EvShape[] | null;
  };
  const ec = single(subRow.event_challenges) as EcShape | null;
  const challengeName = single(ec?.challenges)?.name ?? "Your challenge";
  const eventName = single(ec?.events)?.name ?? null;

  // App URL — point to the recording page so they can re-record (rejected)
  // or just see context (approved). Falls back to a generic /home if env
  // isn't set.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://app.earn2keep.com";
  const appUrl = `${baseUrl}/home/record/${subRow.event_challenge_id}`;

  // Slice 7.8: fetch the organizer's primary_role so the email uses
  // role-aware language ("approved by your youth pastor" / "scout leader" /
  // etc.) instead of always saying "coach". Mirrors slice 7.6 which did
  // this in the in-app notification trigger. Falls back to "team leader"
  // via roleToLabel() if profile/role missing — never blocks email send.
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("primary_role")
    .eq("id", user.id)
    .maybeSingle();
  const ownerLabel = roleToLabel(ownerProfile?.primary_role);

  const result = await sendSubmissionReviewedEmail({
    to: toEmail,
    playerFirstName: player.first_name,
    challengeName,
    eventName,
    status: subRow.status as "approved" | "rejected",
    repsApproved: subRow.reps_approved,
    coachNote: subRow.coach_note,
    rejectionReason: subRow.rejection_reason,
    appUrl,
    ownerLabel,
  });

  if (!result.ok) {
    // Soft-fail: the in-app notification was already created by the DB
    // trigger, so the player will still see the review when they next
    // open the app. We just return the email error for logs / debugging.
    return NextResponse.json(
      { ok: false, emailError: result.error },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, resendId: result.resendId });
}

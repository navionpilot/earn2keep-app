// =============================================================================
// app/api/notify/submission-created/route.ts (Slice 7.9 — combined 7.3 + 7.5)
// =============================================================================
// POST endpoint hit by RecordingForm right after a player's
// insertSubmission succeeds. Mirrors the structure of
// /api/notify/submission-reviewed (the player-facing equivalent):
//
//   1. Verify the caller is the player linked to this submission's player
//      record (defense-in-depth — RLS already enforced the insert).
//   2. Resolve the coach's email via admin client (player can't read
//      auth.users directly).
//   3. Send the branded "new submission" email via Resend.
//
// We DO NOT create the in-app notification row here — slice 7.1's DB
// trigger trg_notify_coach_of_submission handles that automatically.
// This route exists purely for the email side, keeping the in-app bell
// reliable regardless of email send success.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendSubmissionCreatedEmail } from "@/lib/email";

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

  // Pull the submission + chain we need. RLS limits this query to
  // submissions the caller can read — which (for a player) includes
  // their own player's submissions. If the player tries to notify on
  // someone else's submission, the row won't be visible.
  const { data: subRow, error: subErr } = await supabase
    .from("submissions")
    .select(
      "id, reps_claimed, player_note, player_id, event_challenge_id, players!inner(id, first_name, last_name, linked_user_id, owner_id), event_challenges!inner(id, challenges(id, name), events(id, name))"
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }
  if (!subRow) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Helper to coalesce Supabase relations (object or array depending on join)
  function single<T>(rel: T | T[] | null | undefined): T | null {
    if (!rel) return null;
    return Array.isArray(rel) ? rel[0] ?? null : rel;
  }

  const player = single(subRow.players) as
    | {
        id: string;
        first_name: string;
        last_name: string | null;
        linked_user_id: string | null;
        owner_id: string;
      }
    | null;
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Caller must be the player linked to this submission.
  if (player.linked_user_id !== user.id) {
    return NextResponse.json(
      { error: "Forbidden — submission belongs to another player" },
      { status: 403 }
    );
  }

  // Resolve coach email via admin client (a player can't read
  // auth.users for other auth users, so we need the service-role key).
  const admin = createAdminClient();
  if (!admin) {
    // No admin client configured — soft-fail. In-app notification already
    // fired via DB trigger, so the coach will still see it on next visit.
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "admin client not configured (email skipped)",
    });
  }

  const { data: coachAuth } = await admin.auth.admin.getUserById(player.owner_id);
  const coachEmail = coachAuth?.user?.email ?? null;
  if (!coachEmail) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no email on file for coach",
    });
  }

  // Pull the coach's first name from profiles for the greeting (optional —
  // the email gracefully falls back to "New submission!" if name unknown).
  const { data: coachProfile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", player.owner_id)
    .maybeSingle();
  const coachFirstName =
    (coachProfile?.full_name || "").trim().split(/\s+/)[0] || "";

  // Pull challenge + event names.
  type ChShape = { id: string; name: string };
  type EvShape = { id: string; name: string };
  type EcShape = {
    id: string;
    challenges: ChShape | ChShape[] | null;
    events: EvShape | EvShape[] | null;
  };
  const ec = single(subRow.event_challenges) as EcShape | null;
  const challengeName = single(ec?.challenges)?.name ?? "a challenge";
  const eventName = single(ec?.events)?.name ?? null;
  const eventId = single(ec?.events)?.id ?? null;

  // Build the player's display name. First name + last initial keeps it
  // readable and consistent with the in-app notification body from 7.1.
  const playerFullName = [
    player.first_name,
    player.last_name ? player.last_name[0] + "." : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || "A player";

  // Review URL — straight to the event submissions queue.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://app.earn2keep.com";
  const reviewUrl = eventId
    ? `${baseUrl}/events/${eventId}/submissions`
    : `${baseUrl}/dashboard`;

  const result = await sendSubmissionCreatedEmail({
    to: coachEmail,
    coachFirstName,
    playerFullName,
    challengeName,
    eventName,
    repsClaimed: subRow.reps_claimed,
    playerNote: subRow.player_note,
    reviewUrl,
  });

  if (!result.ok) {
    // Soft-fail — in-app notification already fired via DB trigger.
    return NextResponse.json(
      { ok: false, emailError: result.error },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, resendId: result.resendId });
}

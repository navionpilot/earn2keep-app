// =============================================================================
// app/api/ai/verify-submission/route.ts (Slice 8.2)
// =============================================================================
// POST endpoint hit by RecordingForm after a successful submission upload.
// Receives an array of base64-encoded frames extracted client-side, sends
// them to Claude vision API, stores the result on the submission row, and
// returns success/error.
//
// Auth + ownership:
//   - Caller must be the authenticated participant
//   - Caller must own the submission (player.linked_user_id check)
//
// Eligibility:
//   - Challenge must pass isAIEligibleChallenge() (currently push-ups only)
//   - Submission must not already have ai_status='completed' (idempotent)
//
// Failure mode:
//   - Soft fail — never returns 5xx for AI-related issues (network, API,
//     parse). Updates ai_status to 'failed' or 'skipped' and returns 200
//     with details. Coach review still works without AI.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  verifyWithClaude,
  isAIEligibleChallenge,
} from "@/lib/aiVerification";

export const runtime = "nodejs";
export const maxDuration = 60; // AI call can take 30-60s for image-heavy requests

interface PostBody {
  submissionId: string;
  framesBase64: string[];
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { submissionId, framesBase64 } = body || {};
  if (!submissionId || typeof submissionId !== "string") {
    return NextResponse.json(
      { error: "submissionId is required" },
      { status: 400 }
    );
  }
  if (!Array.isArray(framesBase64) || framesBase64.length === 0) {
    return NextResponse.json(
      { error: "framesBase64 must be a non-empty array" },
      { status: 400 }
    );
  }
  // Defensive cap — even if the client tries to send 100 frames, only
  // process up to 12 to control cost. 10 is the default; 12 leaves headroom.
  const frames = framesBase64.slice(0, 12);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch submission + chain to get challenge info and verify ownership.
  // RLS limits visibility, but we add an explicit ownership check too.
  const { data: subRow, error: subErr } = await supabase
    .from("submissions")
    .select(
      "id, reps_claimed, ai_status, player_id, event_challenge_id, players!inner(id, linked_user_id), event_challenges!inner(id, rep_target, challenges(id, name))"
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }
  if (!subRow) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Coalesce relations (Supabase returns objects or single-element arrays
  // depending on the join shape)
  function single<T>(rel: T | T[] | null | undefined): T | null {
    if (!rel) return null;
    return Array.isArray(rel) ? rel[0] ?? null : rel;
  }

  const player = single(subRow.players) as
    | { id: string; linked_user_id: string | null }
    | null;
  if (!player || player.linked_user_id !== user.id) {
    return NextResponse.json(
      { error: "Forbidden — submission belongs to another player" },
      { status: 403 }
    );
  }

  // Idempotency — don't re-run if already completed
  if (subRow.ai_status === "completed") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Already AI-verified",
    });
  }

  type EcShape = {
    id: string;
    rep_target: number | null;
    challenges:
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
  };
  const ec = single(subRow.event_challenges) as EcShape | null;
  const challenge = single(ec?.challenges) as { id: string; name: string } | null;
  const challengeName = challenge?.name ?? null;
  const repTarget = ec?.rep_target ?? null;

  // Eligibility check — only push-ups for the MVP. Skip with explicit
  // ai_status so the UI can show "AI doesn't cover this challenge yet."
  if (!isAIEligibleChallenge(challengeName)) {
    // Use admin client to update — RLS may not allow player to modify
    // the row after insert. Same pattern as the notify routes.
    const admin = createAdminClient();
    if (admin) {
      await admin
        .from("submissions")
        .update({
          ai_status: "skipped",
          ai_error: "Challenge type not yet covered by AI verification.",
          ai_verified_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
    }
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Challenge not eligible for AI verification yet",
    });
  }

  // Mark pending so the UI can show "AI is reviewing..."
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Admin client not configured — AI verification skipped" },
      { status: 200 }
    );
  }
  await admin
    .from("submissions")
    .update({ ai_status: "pending" })
    .eq("id", submissionId);

  // Call Claude
  const result = await verifyWithClaude({
    framesBase64: frames,
    challengeName: challengeName as string,
    repsClaimed: subRow.reps_claimed,
    repTarget,
  });

  if (!result.ok) {
    await admin
      .from("submissions")
      .update({
        ai_status: "failed",
        ai_error: result.error.slice(0, 500),
        ai_verified_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 200 } // soft fail — don't 500 to the client
    );
  }

  // Store results
  await admin
    .from("submissions")
    .update({
      ai_status: "completed",
      ai_rep_count: result.count,
      ai_confidence: result.confidence,
      ai_reasoning: result.reasoning,
      ai_raw_response: result.raw,
      ai_verified_at: new Date().toISOString(),
      ai_error: null,
    })
    .eq("id", submissionId);

  return NextResponse.json({
    ok: true,
    count: result.count,
    confidence: result.confidence,
    reasoning: result.reasoning,
  });
}

// =============================================================================
// app/api/ai/verify-submission/route.ts (Slice 8.3 refactor)
// =============================================================================
// POST endpoint hit by RecordingForm after a successful submission upload.
// Refactored from the slice 8.2 push-up-only implementation into a strategy
// dispatcher: looks up the challenge's ai_verification_strategy and delegates
// to the appropriate strategy module in lib/aiStrategies/.
//
// Auth + ownership:
//   - Caller must be the authenticated participant
//   - Caller must own the submission (player.linked_user_id check)
//
// Eligibility:
//   - Challenge must have ai_verification_strategy that is implemented
//   - Submission must not already have ai_status='completed' (idempotent)
//
// Failure mode:
//   - Soft fail — never returns 5xx for AI-related issues. Updates ai_status
//     to 'failed' or 'skipped' and returns 200 with details. Coach review
//     still works without AI.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { dispatchByStrategy } from "@/lib/aiStrategies/dispatcher";
import type { AIStrategy } from "@/lib/aiStrategies/types";

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
  // Defensive frame cap — see lib/aiVerification MAX_FRAMES
  const frames = framesBase64.slice(0, 12);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch submission + challenge with the new ai_verification_strategy field
  const { data: subRow, error: subErr } = await supabase
    .from("submissions")
    .select(
      "id, reps_claimed, ai_status, player_id, event_challenge_id, players!inner(id, linked_user_id), event_challenges!inner(id, rep_target, challenges(id, name, unit, ai_verification_strategy))"
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }
  if (!subRow) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

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

  // Idempotency
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
      | {
          id: string;
          name: string;
          unit: string | null;
          ai_verification_strategy: AIStrategy | null;
        }
      | {
          id: string;
          name: string;
          unit: string | null;
          ai_verification_strategy: AIStrategy | null;
        }[]
      | null;
  };
  const ec = single(subRow.event_challenges) as EcShape | null;
  const challenge = single(ec?.challenges) as
    | {
        id: string;
        name: string;
        unit: string | null;
        ai_verification_strategy: AIStrategy | null;
      }
    | null;

  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge metadata missing" },
      { status: 500 }
    );
  }

  const strategy = challenge.ai_verification_strategy ?? null;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Admin client not configured — AI verification skipped" },
      { status: 200 }
    );
  }

  // Mark pending + strategy used (so UI knows what's running)
  await admin
    .from("submissions")
    .update({ ai_status: "pending", ai_strategy_used: strategy ?? null })
    .eq("id", submissionId);

  // Dispatch
  const result = await dispatchByStrategy(strategy, {
    challengeName: challenge.name,
    unit: challenge.unit,
    repTarget: ec?.rep_target ?? null,
    repsClaimed: subRow.reps_claimed,
    framesBase64: frames,
  });

  if (!result.ok) {
    const status = result.skipped ? "skipped" : "failed";
    await admin
      .from("submissions")
      .update({
        ai_status: status,
        ai_error: (result.error || "Unknown").slice(0, 500),
        ai_verified_at: new Date().toISOString(),
      })
      .eq("id", submissionId);
    return NextResponse.json(
      { ok: false, skipped: result.skipped === true, error: result.error },
      { status: 200 }
    );
  }

  // Success — store the result
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
    strategy,
    count: result.count,
    confidence: result.confidence,
    reasoning: result.reasoning,
  });
}

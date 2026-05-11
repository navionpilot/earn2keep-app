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
import { decideAutoApproval } from "@/lib/aiAutoApprove";

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
  // Slice 8.4 — also pull players.ai_verification_opt_out and the coach's
  // ai_auto_approve_enabled flag via the player's owner_id → profile.
  // Also pull the player's email + name for the auto-approval notification.
  const { data: subRow, error: subErr } = await supabase
    .from("submissions")
    .select(
      "id, reps_claimed, ai_status, player_id, event_challenge_id, players!inner(id, linked_user_id, owner_id, first_name, parent_email, notification_prefs, ai_verification_opt_out, profiles:owner_id(id, full_name, ai_auto_approve_enabled)), event_challenges!inner(id, rep_target, points_value, challenges(id, name, unit, ai_verification_strategy), events(id, name))"
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
    | {
        id: string;
        linked_user_id: string | null;
        owner_id: string | null;
        first_name: string | null;
        parent_email: string | null;
        notification_prefs: Record<string, unknown> | null;
        ai_verification_opt_out: boolean | null;
        profiles?:
          | {
              id: string;
              full_name: string | null;
              ai_auto_approve_enabled: boolean | null;
            }
          | {
              id: string;
              full_name: string | null;
              ai_auto_approve_enabled: boolean | null;
            }[]
          | null;
      }
    | null;
  if (!player || player.linked_user_id !== user.id) {
    return NextResponse.json(
      { error: "Forbidden — submission belongs to another player" },
      { status: 403 }
    );
  }

  // Slice 8.4 — respect the parent's AI opt-out for this player
  if (player.ai_verification_opt_out === true) {
    const adminEarly = createAdminClient();
    if (adminEarly) {
      await adminEarly
        .from("submissions")
        .update({
          ai_status: "skipped",
          ai_error: "AI verification opted out for this player",
          ai_verified_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
    }
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Player opted out of AI verification",
    });
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
    points_value: number | null;
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
    events:
      | { id: string; name: string }
      | { id: string; name: string }[]
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
  const eventRel = single(ec?.events) as { id: string; name: string } | null;

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

  // Success — store the AI result
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

  // Slice 8.4 — evaluate auto-approval
  const coachProfile = single(player.profiles) as
    | { id: string; full_name: string | null; ai_auto_approve_enabled: boolean | null }
    | null;

  const decision = decideAutoApproval({
    aiCount: result.count ?? null,
    aiConfidence: result.confidence ?? null,
    repsClaimed: subRow.reps_claimed,
    coachAutoApproveEnabled: !!coachProfile?.ai_auto_approve_enabled,
    // Already guarded above with an early-return when opt-out is true,
    // so this is always false at this point — but using !! keeps the
    // semantic clear if that guard ever moves.
    playerOptedOut: !!player.ai_verification_opt_out,
  });

  let autoApproved = false;
  if (decision.shouldAutoApprove && challenge && eventRel) {
    // Update the submission to approved status
    const { error: approveErr } = await admin
      .from("submissions")
      .update({
        status: "approved",
        reps_approved: decision.approvedReps,
        approved_by_ai: true,
        reviewed_at: new Date().toISOString(),
        coach_note: `Auto-verified by AI: ${decision.reason}`,
      })
      .eq("id", submissionId)
      // Defense: only auto-approve if still pending (don't overwrite a
      // coach who happened to review in the meantime)
      .eq("status", "pending");

    if (!approveErr) {
      autoApproved = true;
      // DB trigger fires the in-app notification when status changes to
      // 'approved'. We just need to fire the email (fire-and-forget so
      // we don't block the API response on email delivery latency).
      void sendAutoApprovalEmail(admin, {
        submissionId,
        playerFirstName: player.first_name ?? "Player",
        playerEmail: player.parent_email ?? null,
        playerNotificationPrefs: player.notification_prefs,
        challengeName: challenge.name,
        eventName: eventRel.name,
        repsApproved: decision.approvedReps,
        coachOwnerId: coachProfile?.id ?? null,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    strategy,
    count: result.count,
    confidence: result.confidence,
    reasoning: result.reasoning,
    autoApproved,
    autoApprovalReason: decision.reason,
  });
}

// =============================================================================
// Auto-approval email helper
// =============================================================================
// When AI auto-approves, fire the same email the player would get from a
// coach-driven review. DB triggers handle the in-app notification on
// submissions.status change, so we don't write to that table here.

import { roleToLabel, sendSubmissionReviewedEmail } from "@/lib/email";
import type { SupabaseClient } from "@supabase/supabase-js";

interface EmailNotifyPayload {
  submissionId: string;
  playerFirstName: string;
  playerEmail: string | null;
  playerNotificationPrefs: Record<string, unknown> | null;
  challengeName: string;
  eventName: string;
  repsApproved: number;
  coachOwnerId: string | null;
}

async function sendAutoApprovalEmail(
  admin: SupabaseClient,
  p: EmailNotifyPayload
): Promise<void> {
  try {
    // Respect the player's email preference (set in their profile)
    const prefs = p.playerNotificationPrefs || {};
    const emailEnabled = (prefs as Record<string, unknown>).email !== false;
    if (!emailEnabled || !p.playerEmail) return;

    // Fetch the coach's role label for accurate wording ("approved by your
    // youth pastor" / etc.). Falls back to "team leader" via roleToLabel.
    let ownerLabel = "team leader";
    if (p.coachOwnerId) {
      const { data: ownerProfile } = await admin
        .from("profiles")
        .select("primary_role")
        .eq("id", p.coachOwnerId)
        .maybeSingle();
      ownerLabel = roleToLabel(ownerProfile?.primary_role ?? null);
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://app.earn2keep.com";
    const appUrl = `${baseUrl}/home`;

    await sendSubmissionReviewedEmail({
      to: p.playerEmail,
      playerFirstName: p.playerFirstName,
      challengeName: p.challengeName,
      eventName: p.eventName,
      status: "approved",
      repsApproved: p.repsApproved,
      coachNote: "Auto-verified by AI based on video analysis.",
      rejectionReason: null,
      appUrl,
      ownerLabel,
    });
  } catch {
    // Soft-fail — auto-approval already happened, email is best-effort
  }
}

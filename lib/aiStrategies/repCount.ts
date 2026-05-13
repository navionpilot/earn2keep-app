// =============================================================================
// lib/aiStrategies/repCount.ts — Rep-counting AI strategy (Slice 8.3)
// =============================================================================
// Handles the largest slice of the catalog (31/51 challenges). The strategy
// is general — works for ANY challenge where the unit is a count of visible
// repetitions: push-ups, juggling touches, free throws, wall passes, swings,
// burpees, etc.
//
// We don't hardcode push-up-specific instructions in the prompt anymore.
// Instead, the prompt receives the challenge name + unit + target and tells
// Claude to count whatever the unit describes. This way:
//   • Push-Ups → "Count completed push-ups"
//   • Solo Juggling — Feet Only → "Count touches"
//   • Wall Throws (Accuracy) → "Count successful throws"
// All work with one prompt template.
// =============================================================================

import { callClaudeVision, parseStrategyJson } from "@/lib/aiVerification";
import type { StrategyInput, StrategyResult } from "@/lib/aiStrategies/types";

function buildPrompt(input: StrategyInput): string {
  const { challengeName, unit, repTarget, repsClaimed, framesBase64 } = input;
  const unitText = unit || "reps";
  const claimedLine =
    repsClaimed != null
      ? `\nThe participant claims they completed ${repsClaimed} ${unitText}.`
      : "";
  const targetLine =
    repTarget != null ? `\nThe target for this challenge is ${repTarget} ${unitText}.` : "";

  return `You are verifying a fundraising challenge submission for earn²keep, a platform where participants of any age do real challenges to earn money from supporters. Your verification helps the organizer review the submission.

The challenge is: ${challengeName}${claimedLine}${targetLine}
The ${framesBase64.length} images below are frames extracted at evenly-spaced intervals from a video the participant recorded.

Your job: estimate the number of completed ${unitText} performed during the video, based on visual cues across the frame sequence.

Return your analysis as JSON with this exact structure:
{
  "count": <integer, your best estimate of the count>,
  "confidence": "high" | "medium" | "low" | "unable_to_verify",
  "reasoning": "<one or two sentences explaining what you saw and why you have this confidence level>"
}

Confidence guide:
- "high": clear view, good angle, can count distinct instances with certainty
- "medium": most instances visible but a few uncertain due to angle, motion blur, or framing
- "low": partial view, hard to count precisely
- "unable_to_verify": can't see the person, can't see the activity happening, video too blurry, wrong activity, or other reason the count is meaningless

Important:
- Frames are sparsely sampled — you can't count every instance individually. Estimate based on consistent activity across the sequence.
- The participant's claim is not authoritative — verify what you see.
- A "completed instance" means a clearly distinguishable, full execution of the activity (e.g., a full push-up cycle, a clean ball touch, an accurate pass, a complete throw).
- Do not include any text outside the JSON object.`;
}

export async function verifyRepCount(input: StrategyInput): Promise<StrategyResult> {
  if (!input.framesBase64 || input.framesBase64.length === 0) {
    return { ok: false, error: "No frames provided" };
  }
  const claudeResult = await callClaudeVision({
    framesBase64: input.framesBase64,
    prompt: buildPrompt(input),
  });
  if (!claudeResult.ok) {
    return { ok: false, error: claudeResult.error };
  }
  const parsed = parseStrategyJson(claudeResult.text);
  if (!parsed) {
    return {
      ok: false,
      error: `Could not parse AI response: ${claudeResult.text.slice(0, 200)}`,
    };
  }
  return {
    ok: true,
    count: parsed.count,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    raw: claudeResult.raw,
  };
}

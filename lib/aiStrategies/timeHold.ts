// =============================================================================
// lib/aiStrategies/timeHold.ts — Time-based activity AI strategy (Slice 8.3)
// =============================================================================
// Covers 15/51 challenges in the current catalog (plank holds, time-based
// dribbling drills, sprint drills, etc.). Pairs naturally with slice 8.1's
// TimedRecorder — those videos are exactly the duration the AI is asked to
// verify activity over.
//
// Unlike rep_count (which produces an integer count of reps), this strategy
// returns a "seconds of confirmed activity" count. If the AI sees the
// activity continuously across all frames, count = full duration. If it
// only sees activity in some frames, count is reduced proportionally. The
// count + confidence together tell the coach how solidly the duration is
// verified.
// =============================================================================

import { callClaudeVision, parseStrategyJson } from "@/lib/aiVerification";
import type { StrategyInput, StrategyResult } from "@/lib/aiStrategies/types";

function buildPrompt(input: StrategyInput): string {
  const { challengeName, repTarget, framesBase64 } = input;
  const durationLine =
    repTarget != null
      ? `\nThe target duration is ${repTarget} seconds.`
      : "";

  return `You are verifying a time-based fundraising challenge submission for earn²keep. The participant was supposed to perform an activity continuously for a set duration.

The challenge is: ${challengeName}${durationLine}
The ${framesBase64.length} images below are frames extracted at evenly-spaced intervals across the recording.

Your job: confirm that the participant was performing the expected activity throughout the duration. Look at every frame and check if the activity is happening or if there are gaps (person stopped, walked off-screen, switched to a different activity, etc.).

Return your analysis as JSON with this exact structure:
{
  "count": <integer representing the seconds of confirmed activity — use the target duration if activity was continuous across all frames; reduce proportionally if there are gaps>,
  "confidence": "high" | "medium" | "low" | "unable_to_verify",
  "reasoning": "<one or two sentences explaining what you saw — was the activity continuous? Any visible gaps? Form maintained?>"
}

Confidence guide:
- "high": activity is clearly visible in nearly all frames, no obvious breaks, looks legitimate
- "medium": activity is visible in most frames but with some ambiguity (motion blur, angle changes, brief drops)
- "low": activity is only visible in a few frames — most frames are unclear or show something else
- "unable_to_verify": can't see the person, can't tell what they're doing, video too blurry, wrong activity, or participant clearly isn't doing the challenge

Important:
- Count = how many seconds of the duration you can VERIFY activity happened, not how many you THINK happened. Be conservative.
- A continuous activity across all frames → count equals the target duration.
- Visible stops/breaks → reduce count proportionally and note in reasoning.
- Do not include any text outside the JSON object.`;
}

export async function verifyTimeHold(input: StrategyInput): Promise<StrategyResult> {
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

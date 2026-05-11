// =============================================================================
// lib/aiVerification.ts — Claude vision API wrapper for rep counting (Slice 8.2)
// =============================================================================
// Server-side only. Takes a sequence of frame images (base64 JPEGs) plus
// challenge metadata, sends them to Claude's vision API, and parses the
// JSON response into a typed result.
//
// We call the REST API directly via fetch rather than the SDK to avoid
// adding a new dependency — same pattern as lib/email.ts uses for Resend.
//
// Model choice: claude-sonnet-4-6. Good vision capabilities at ~$3/MTok
// input + $15/MTok output — much cheaper than Opus for what is essentially
// "count things in 10 images and return JSON." Opus would be overkill.
//
// Eligibility:
//   Initially, only push-up challenges trigger AI verification. The
//   `isAIEligibleChallenge()` helper detects this by name. Other
//   challenges return false and the AI path is skipped entirely.
// =============================================================================

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_API_VERSION = "2023-06-01";

export type AIConfidence = "high" | "medium" | "low" | "unable_to_verify";

export interface AIVerifyOptions {
  /** Frame images as raw base64 strings (no data:image/jpeg;base64, prefix) */
  framesBase64: string[];
  /** Challenge name (e.g., "Push-Ups") */
  challengeName: string;
  /** Player's claimed rep count — given to Claude as context */
  repsClaimed: number | null;
  /** Target rep count for the challenge — context only */
  repTarget: number | null;
}

export interface AIVerifyResult {
  count: number;
  confidence: AIConfidence;
  reasoning: string;
  /** Raw response object for debugging / storing */
  raw: unknown;
}

export interface AIVerifyError {
  ok: false;
  error: string;
}

export type AIVerifyOutcome = ({ ok: true } & AIVerifyResult) | AIVerifyError;

/**
 * Check whether this challenge is eligible for AI verification.
 *
 * Slice 8.2 MVP: only push-ups. We match case-insensitively on common
 * spellings. As we add per-challenge AI in 8.3+, this becomes a richer
 * lookup (probably driven by a `challenges.ai_verification_mode` column).
 */
export function isAIEligibleChallenge(challengeName: string | null | undefined): boolean {
  if (!challengeName) return false;
  const n = challengeName.toLowerCase();
  return n.includes("push-up") || n.includes("pushup") || n.includes("push up");
}

/** Build the prompt sent alongside the frame images. */
function buildPrompt(
  challengeName: string,
  repsClaimed: number | null,
  repTarget: number | null,
  frameCount: number
): string {
  const claimedLine =
    repsClaimed != null
      ? `\nThe participant claims they completed ${repsClaimed} ${challengeName.toLowerCase()}.`
      : "";
  const targetLine =
    repTarget != null
      ? `\nThe target for this challenge is ${repTarget} ${challengeName.toLowerCase()}.`
      : "";

  return `You are verifying a fundraising challenge submission for earn²keep, a youth platform where kids do physical challenges to earn money from sponsors. Your verification helps the organizer review the submission.

The challenge is: ${challengeName}${claimedLine}${targetLine}
The ${frameCount} images below are frames extracted at evenly-spaced intervals from a video the participant recorded.

Your job: estimate the number of completed reps performed during the video, based on visual cues across the frame sequence.

A "completed push-up" means going from arms-extended position (top) down to chest-near-floor (bottom) and back to arms-extended — both phases should be visible across the sequence.

Return your analysis as JSON with this exact structure:
{
  "count": <integer, your best estimate of completed reps>,
  "confidence": "high" | "medium" | "low" | "unable_to_verify",
  "reasoning": "<one or two sentences explaining what you saw and why you have this confidence level>"
}

Confidence guide:
- "high": clear view, good angle, can count distinct reps with certainty
- "medium": most reps visible but a few uncertain due to angle, motion blur, or framing
- "low": partial view, hard to count precisely
- "unable_to_verify": can't see the person, can't see push-ups happening, video too blurry, wrong activity, or other reason the count is meaningless

Important:
- Frames are sparsely sampled — you can't count every rep individually. Estimate based on consistent activity across the sequence.
- If only a few frames clearly show push-ups but the rest are unclear, prefer "low" or "medium" confidence with a sensible estimate.
- Be honest. The participant's claim is not authoritative — verify what you see.
- Do not include any text outside the JSON object.`;
}

/**
 * Send frames + prompt to Claude vision API. Returns structured result
 * with count, confidence, reasoning, and the raw response (for storage).
 */
export async function verifyWithClaude(
  opts: AIVerifyOptions
): Promise<AIVerifyOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set on the server." };
  }
  if (!opts.framesBase64 || opts.framesBase64.length === 0) {
    return { ok: false, error: "No frames provided." };
  }

  // Build content blocks: all images, then the text prompt
  const content: Array<Record<string, unknown>> = opts.framesBase64.map((b64) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: b64,
    },
  }));
  content.push({
    type: "text",
    text: buildPrompt(
      opts.challengeName,
      opts.repsClaimed,
      opts.repTarget,
      opts.framesBase64.length
    ),
  });

  try {
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      let parsed: { error?: { message?: string } } = {};
      try {
        parsed = JSON.parse(errBody);
      } catch {
        /* not json */
      }
      return {
        ok: false,
        error: parsed.error?.message || `Anthropic API ${response.status}`,
      };
    }

    const raw = await response.json();
    const text = extractTextFromResponse(raw);
    if (!text) {
      return { ok: false, error: "Empty response from AI" };
    }

    const parsed = parseAIJson(text);
    if (!parsed) {
      return { ok: false, error: `Could not parse AI response: ${text.slice(0, 200)}` };
    }

    return {
      ok: true,
      count: parsed.count,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      raw,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error reaching Anthropic.";
    return { ok: false, error: msg };
  }
}

/**
 * Pull the text content from a Claude API response. The response shape:
 *   { content: [{ type: "text", text: "..." }, ...], ... }
 */
function extractTextFromResponse(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { content?: Array<{ type?: string; text?: string }> };
  if (!Array.isArray(r.content)) return null;
  const textBlock = r.content.find((b) => b?.type === "text");
  return textBlock?.text ?? null;
}

/**
 * Parse the JSON object from Claude's text response. Robust to leading
 * or trailing whitespace and stray markdown code fences (some models
 * occasionally add ```json wrappers even when told not to).
 */
function parseAIJson(text: string):
  | { count: number; confidence: AIConfidence; reasoning: string }
  | null {
  // Strip code fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Find the first { and last } to extract the JSON object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  const jsonStr = cleaned.slice(start, end + 1);

  try {
    const obj = JSON.parse(jsonStr) as {
      count?: unknown;
      confidence?: unknown;
      reasoning?: unknown;
    };

    // Validate fields
    const count =
      typeof obj.count === "number"
        ? Math.max(0, Math.round(obj.count))
        : null;
    const confidenceRaw =
      typeof obj.confidence === "string" ? obj.confidence.toLowerCase() : "";
    const validConfidence: AIConfidence[] = [
      "high",
      "medium",
      "low",
      "unable_to_verify",
    ];
    const confidence = (validConfidence as string[]).includes(confidenceRaw)
      ? (confidenceRaw as AIConfidence)
      : null;
    const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : null;

    if (count == null || confidence == null || reasoning == null) return null;
    return { count, confidence, reasoning };
  } catch {
    return null;
  }
}

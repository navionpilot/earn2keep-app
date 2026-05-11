// =============================================================================
// lib/aiVerification.ts — Low-level Claude vision API helper (Slice 8.3 refactor)
// =============================================================================
// In slice 8.2, this file contained the rep_count prompt and eligibility logic
// directly. Slice 8.3 promotes it to a strategy-agnostic helper used by ALL
// strategy modules (lib/aiStrategies/*).
//
// Each strategy builds its own prompt and calls callClaudeVision() with the
// frames + that prompt. parseStrategyJson() is shared because every strategy
// asks Claude to return the same JSON schema { count, confidence, reasoning }.
//
// Model choice: claude-sonnet-4-6 — good vision quality at $3/MTok input.
// Image-based prompts can run up sizeable token counts, so we cap frames to
// 12 max per call (defensive — clients should send 10).
// =============================================================================

import type { AIConfidence } from "@/lib/aiStrategies/types";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MAX_FRAMES = 12;

export interface CallClaudeOptions {
  framesBase64: string[];
  prompt: string;
}

export type CallClaudeResult =
  | { ok: true; text: string; raw: unknown }
  | { ok: false; error: string };

/**
 * Send a sequence of frames + a text prompt to Claude's vision API. Returns
 * the raw response text (the strategy parses it). Defensive against missing
 * env var, network errors, non-200 responses, and empty bodies.
 */
export async function callClaudeVision(
  opts: CallClaudeOptions
): Promise<CallClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set on the server." };
  }
  if (!opts.framesBase64 || opts.framesBase64.length === 0) {
    return { ok: false, error: "No frames provided." };
  }

  // Defensive frame cap — even if a caller forgets, we won't blow the
  // request size or cost.
  const frames = opts.framesBase64.slice(0, MAX_FRAMES);

  const content: Array<Record<string, unknown>> = frames.map((b64) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: b64,
    },
  }));
  content.push({ type: "text", text: opts.prompt });

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
    return { ok: true, text, raw };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error reaching Anthropic.";
    return { ok: false, error: msg };
  }
}

/**
 * Pull the text content from a Claude API response. Response shape:
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
 * Shared JSON parser — every strategy asks Claude for the same shape:
 *   { count: number, confidence: "high"|"medium"|"low"|"unable_to_verify", reasoning: string }
 *
 * Robust to leading/trailing whitespace and stray markdown code fences
 * (Claude occasionally wraps in ```json...``` even when told not to).
 */
export function parseStrategyJson(
  text: string
): { count: number; confidence: AIConfidence; reasoning: string } | null {
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
    const count =
      typeof obj.count === "number" ? Math.max(0, Math.round(obj.count)) : null;
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

// =============================================================================
// lib/invites.ts — Player invitation helpers
// =============================================================================
// Generates the unguessable token used in /join/[token] URLs and provides a
// helper to construct the full invite URL the coach copies/shares.
//
// Token = 32 random bytes (256 bits) encoded as base64url. That's plenty
// unguessable — astronomical search space, no predictable structure, URL-safe
// without escaping.
// =============================================================================

/**
 * Generate a fresh invite token. Runs in any environment (Node server,
 * Edge runtime, browser) because Web Crypto is universal in modern Next.js.
 *
 * 32 bytes -> 43-char base64url string (no padding).
 */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlFromBytes(bytes);
}

/**
 * Build the public invite URL for a given token.
 *
 * Mirrors lib/supporterTokens.ts:supporterUrlFromToken — uses window.location.origin
 * client-side so production + Vercel preview deploys both work without an
 * env var. Server-side returns a relative path (only used as a fallback;
 * the modal that displays invite URLs always runs in the browser).
 */
export function inviteUrlFromToken(token: string): string {
  if (typeof window === "undefined") {
    return `/join/${token}`;
  }
  return `${window.location.origin}/join/${token}`;
}

// -----------------------------------------------------------------------------
// Internal: base64url encoding without padding.
// -----------------------------------------------------------------------------
function base64urlFromBytes(bytes: Uint8Array): string {
  // Build a binary string in chunks to avoid String.fromCharCode arg-count
  // limits on large inputs (32 bytes is fine as one chunk, but the chunked
  // pattern is forward-compatible if we ever bump the byte count).
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    );
  }
  // btoa is available in browser AND Node 16+ AND Edge runtime.
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// =============================================================================
// lib/tournamentJoinCode.ts — Tournament join-code generation (Slice L31)
// =============================================================================
// Tournaments use a short, human-friendly join code (format: AAA-AAA) that
// other team coaches enter to find and join the tournament. The code is
// generated at tournament ACTIVATION time (not draft creation) so codes
// only exist for tournaments that have been paid for and are open to joins.
//
// Design notes:
//   - Alphabet is 31 chars: A-Z minus visually-confusing letters (I, L, O),
//     and 2-9 minus 0 and 1. Avoids the "is that a zero or an O" problem
//     when a coach reads a code over the phone or off a printed flyer.
//   - 6 alphanumeric chars (no separators) → 31^6 = 887,503,681 codes.
//     Collisions effectively impossible in practice. Display format
//     hyphenates for readability (AAA-AAA) but storage is the 6-char
//     uppercase version.
//   - Uniqueness is enforced both by a UNIQUE INDEX in Postgres and by
//     this helper retrying on collision. The retry path is defensive —
//     should never trigger in normal operation.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Alphabet for join codes. Excludes 0, 1, I, L, O — characters that are
 * easy to confuse when read aloud or off a printed flyer.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Length of the raw (no-hyphen) code. */
const CODE_LENGTH = 6;

/** Position to insert the display hyphen ("AAA-AAA"). */
const HYPHEN_POSITION = 3;

/** Max collision-retry attempts. Should never come close to firing. */
const MAX_GENERATION_ATTEMPTS = 10;

/**
 * Generate a random 6-character code (no hyphen). Returns uppercase letters
 * and digits from the safe alphabet only.
 */
function generateRandomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
    code += CODE_ALPHABET[idx];
  }
  return code;
}

/**
 * Format a raw code (e.g. "SPR9K2") for display ("SPR-9K2").
 * Always 7 characters in display form: 3 + hyphen + 3.
 */
export function formatJoinCodeForDisplay(rawCode: string): string {
  const cleaned = rawCode.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (cleaned.length !== CODE_LENGTH) return rawCode; // pass through if malformed
  return cleaned.slice(0, HYPHEN_POSITION) + "-" + cleaned.slice(HYPHEN_POSITION);
}

/**
 * Strip a user-typed code down to its canonical storage form (uppercase,
 * no hyphens, no spaces). Used when looking up a tournament by code that
 * a coach typed in.
 *
 * Examples:
 *   "spr-9k2"   -> "SPR9K2"
 *   "SPR 9K2"   -> "SPR9K2"
 *   "spr9k2"    -> "SPR9K2"
 *   "spr-9k 2"  -> "SPR9K2"
 */
export function normalizeJoinCode(input: string): string {
  return input.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/**
 * Generate a unique join code for a tournament. Checks the events table
 * for collisions and retries up to MAX_GENERATION_ATTEMPTS times.
 *
 * @param supabase - any Supabase client (admin or RLS-bound) that can SELECT
 *   from `events` on `tournament_join_code`. Admin client recommended at the
 *   activation-time call site to avoid RLS interference.
 * @returns The 6-character canonical code (no hyphen). Use
 *   `formatJoinCodeForDisplay()` before showing to users.
 * @throws if it can't find a unique code in MAX_GENERATION_ATTEMPTS tries
 *   (statistically impossible with 887M-code space; would indicate a real
 *   bug or DB problem).
 */
export async function generateUniqueJoinCode(
  supabase: SupabaseClient
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const candidate = generateRandomCode();

    const { data, error } = await supabase
      .from("events")
      .select("id")
      .eq("tournament_join_code", candidate)
      .maybeSingle();

    if (error) {
      // Real DB error — propagate
      throw new Error(
        `Join code uniqueness check failed: ${error.message}`
      );
    }

    if (!data) {
      // No collision — this code is free
      return candidate;
    }

    // Collision (extremely unlikely) — try again
  }

  throw new Error(
    `Could not generate unique tournament join code after ${MAX_GENERATION_ATTEMPTS} attempts`
  );
}

/**
 * Validate that a normalized code is well-formed. Use this before hitting
 * the DB on a user-submitted code to give a clear error on obviously-bad
 * input.
 */
export function isValidJoinCodeFormat(normalizedCode: string): boolean {
  if (normalizedCode.length !== CODE_LENGTH) return false;
  for (const ch of normalizedCode) {
    if (!CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

// =============================================================================
// lib/timeChallenge.ts — Time-based challenge utilities (Slice 8.1)
// =============================================================================
// earn²keep challenges have a free-text `unit` field (push-ups, miles, books,
// touches, hours, etc.) — some of those are time-based, some aren't. This
// module centralizes the logic for:
//
//   1. Detecting whether a challenge's unit indicates a timed activity
//      (sprints, holds, planks, etc.)
//   2. Computing the target duration in seconds, regardless of whether the
//      unit was expressed in seconds or minutes
//   3. Building the announcement schedule used by TimedRecorder — when to
//      speak each cue, and what to say
//
// The schedule scales sensibly with duration: short challenges get a final
// 5-count, medium ones add 10-second and 30-second marks, longer ones add
// per-minute callouts.
// =============================================================================

// Recognized time-unit strings. Case-insensitive, whitespace-trimmed at
// the comparison site. Conservative list — favor "this isn't time-based"
// over false-positives. If a coach types something funky in a custom
// challenge ("sec.", "minutes."), it'll fall through to non-time and
// still work via the native camera flow.
const SECONDS_UNITS = ["second", "seconds", "sec", "secs", "s"];
const MINUTES_UNITS = ["minute", "minutes", "min", "mins"];

/** Does this challenge's unit indicate a timed activity? */
export function isTimeBasedChallenge(unit: string | null | undefined): boolean {
  if (!unit) return false;
  const u = unit.toLowerCase().trim();
  return SECONDS_UNITS.includes(u) || MINUTES_UNITS.includes(u);
}

/**
 * Return the target duration in seconds, given a numeric target and a
 * unit string. Returns 0 when input doesn't represent a valid timed
 * target — caller should treat 0 as "no countdown."
 */
export function durationInSeconds(
  target: number | null | undefined,
  unit: string | null | undefined
): number {
  if (!target || target <= 0) return 0;
  if (!unit) return 0;
  const u = unit.toLowerCase().trim();
  if (MINUTES_UNITS.includes(u)) return Math.round(target * 60);
  if (SECONDS_UNITS.includes(u)) return Math.round(target);
  return 0;
}

export interface Announcement {
  /** When to speak, in seconds elapsed since "Begin!" */
  atSeconds: number;
  /** What to say */
  text: string;
}

/**
 * Build the in-challenge announcement schedule. Doesn't include the
 * pre-recording "5,4,3,2,1,Begin!" lead-in — TimedRecorder plays that
 * inline before invoking the schedule.
 *
 * Schedule design (chosen for natural progression without overload):
 *   • per-minute callouts when duration >= 2 minutes
 *   • "Thirty seconds" mark when duration >= 1 minute
 *   • "Ten seconds" mark when duration >= 20s
 *   • Final 5-count when duration > 5s
 *   • "Time!" at completion
 *
 * Examples:
 *   10s → Time!
 *   20s → "Ten seconds", 5,4,3,2,1, Time!
 *   30s → "Ten seconds", 5,4,3,2,1, Time!
 *   60s → "Thirty seconds", "Ten seconds", 5,4,3,2,1, Time!
 *   90s → "Thirty seconds", "Ten seconds", 5,4,3,2,1, Time!
 *   120s → "One minute remaining", "Thirty seconds", "Ten seconds", 5,4,3,2,1, Time!
 *   300s → "4 min", "3 min", "2 min", "One minute", "Thirty seconds", "Ten seconds", 5,4,3,2,1, Time!
 */
export function buildAnnouncementSchedule(durationSeconds: number): Announcement[] {
  const out: Announcement[] = [];
  if (durationSeconds <= 0) return out;

  // Per-minute callouts when duration is long enough to be worth chunking
  if (durationSeconds >= 120) {
    const fullMinutes = Math.floor(durationSeconds / 60);
    // Announce at each whole-minute remaining mark, going down to 1 minute.
    // Skip the final minute marker if we'd be saying it within 5s of the
    // "Thirty seconds" mark — keep cues from piling on top of each other.
    for (let mins = fullMinutes - 1; mins >= 1; mins--) {
      const at = durationSeconds - mins * 60;
      if (at <= 0) continue;
      out.push({
        atSeconds: at,
        text: mins === 1 ? "One minute remaining" : `${mins} minutes remaining`,
      });
    }
  }

  // 30-second mark
  if (durationSeconds >= 60) {
    out.push({ atSeconds: durationSeconds - 30, text: "Thirty seconds" });
  }

  // 10-second mark (skip if too close to a 30s mark or the 5-count)
  if (durationSeconds >= 20) {
    out.push({ atSeconds: durationSeconds - 10, text: "Ten seconds" });
  }

  // Final 5-count
  if (durationSeconds > 5) {
    for (let i = 5; i >= 1; i--) {
      out.push({ atSeconds: durationSeconds - i, text: String(i) });
    }
  }

  // The final "Time!" announcement
  out.push({ atSeconds: durationSeconds, text: "Time!" });

  // Deduplicate any same-second clashes (keep the more specific one — last write wins)
  const seen = new Map<number, Announcement>();
  for (const a of out) seen.set(a.atSeconds, a);
  return Array.from(seen.values()).sort((a, b) => a.atSeconds - b.atSeconds);
}

/**
 * Convenience formatter used by the visual timer overlay. Given an
 * elapsed-seconds count and a total duration, returns the remaining time
 * as a clean string ("1:23", "0:08", "0:00").
 */
export function formatRemaining(elapsedSeconds: number, totalSeconds: number): string {
  const remaining = Math.max(0, totalSeconds - elapsedSeconds);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

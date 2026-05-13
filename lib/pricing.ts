// =============================================================================
// lib/pricing.ts — locked pricing (post-Mini-Camp cleanup)
// =============================================================================
// Pricing model (L43 cleanup):
//
//   Camp        $149  flat launch fee. One team, supporter-donation fundraiser.
//   Tournament  $249  flat launch fee. Multi-team commitment contest with pot.
//
//   NO transaction fees. NO percentage cut of donations or Entry Fees.
//   earn²keep takes ONLY the flat launch fee.
//
//   Card-processing fees (currently Stripe's 2.9% + $0.30) come off the top
//   before the recipient org receives funds — those are Stripe's, not ours.
//   We disclose them honestly to supporters but don't book them as revenue.
//
// Prior model (deprecated):
//   - Mini-Camp tier ($99) — REMOVED. Mini-Camp and Camp did the same thing;
//     two tiers was price discrimination dressed as a feature. Now: one Camp.
//   - 3.5% + $0.40 platform transaction fee — REMOVED. We don't take a cut
//     of fundraising any more. "Pay once. Keep what you raise."
// =============================================================================

export type EventType = "camp" | "tournament";

// Flat launch fees (USD, charged once at event activation)
export const CAMP_FEE_USD = 149;
export const TOURNAMENT_FEE_USD = 249;

// Inclusive maximum event duration in days
export const MAX_EVENT_DAYS = 30;

export interface PricingTier {
  fee: number;
  label: string;
  subtitle: string;
  features: string[];
}

export const PRICING: Record<EventType, PricingTier> = {
  camp: {
    fee: CAMP_FEE_USD,
    label: "Camp",
    subtitle: "Single-team supporter-donation fundraiser",
    features: [
      "One team competes internally for prizes",
      "Per-player fundraising minimums",
      "Supporter QR codes & donation pages",
      "Verified-challenge submissions",
      "Real-time leaderboards",
      "Flat $149 launch fee — no transaction cuts",
      "Up to 30-day event hosting",
    ],
  },
  tournament: {
    fee: TOURNAMENT_FEE_USD,
    label: "Tournament",
    subtitle: "Multi-team commitment contest",
    features: [
      "2+ teams compete head-to-head (no maximum)",
      "Per-team Entry Fee → pot grows as teams join",
      "Strict all-or-nothing scoring (full roster wins or loses)",
      "Winning team takes the entire pot",
      "Sudden-death tiebreaker if standings tie",
      "Flat $249 launch fee — no transaction cuts",
      "Up to 30-day event hosting",
    ],
  },
};

export function getPricing(eventType: EventType): PricingTier {
  return PRICING[eventType];
}

/**
 * Recommend an event type based on whether it's multi-team.
 * Single team = Camp. Multi-team = Tournament. End of decision tree.
 *
 * (Previously this function also handled the Mini-Camp / Camp threshold.
 * That tier is gone in the post-cleanup model.)
 */
export function recommendTier(opts: { isMultiTeam: boolean }): EventType {
  return opts.isMultiTeam ? "tournament" : "camp";
}

/**
 * Human-readable explanation of which tier fits.
 */
export function recommendationReason(opts: { isMultiTeam: boolean }): string {
  if (opts.isMultiTeam) {
    return `Tournament ($${TOURNAMENT_FEE_USD}) — your event has 2 or more teams competing against each other.`;
  }
  return `Camp ($${CAMP_FEE_USD}) — your event has one team raising money from supporters.`;
}

/**
 * Compute inclusive duration of an event in days.
 * E.g. start = 2026-01-01, end = 2026-01-30 -> 30 days.
 * Returns NaN if either date is invalid or empty.
 */
export function eventDurationDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return NaN;
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return NaN;
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Returns true if event duration fits within MAX_EVENT_DAYS.
 * Returns true when dates are missing/invalid — other validators handle empty fields.
 */
export function isWithinMaxDuration(startDate: string, endDate: string): boolean {
  const days = eventDurationDays(startDate, endDate);
  if (isNaN(days)) return true;
  return days <= MAX_EVENT_DAYS;
}

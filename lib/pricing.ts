// Locked pricing for earn²keep — matches landing site slice 6.12.
// Phase 8 will replace the placeholder payment flow with real Stripe integration.

export type EventType = "camp" | "tournament";

export const CAMP_FEE_USD = 149;
export const TOURNAMENT_FEE_USD = 299;
export const TRANSACTION_FEE_RATE = 0.035; // 3.5% on funds raised
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
    subtitle: "Single-team fundraiser",
    features: [
      "Registration",
      "Challenge tracking",
      "Sponsor pages",
      "Leaderboards",
      "Messaging",
      "Live progress tracking",
      "30-day event hosting",
    ],
  },
  tournament: {
    fee: TOURNAMENT_FEE_USD,
    label: "Tournament",
    subtitle: "Multi-team competition",
    features: [
      "Team registration",
      "Event dashboards",
      "Challenge tracking",
      "Fundraising tools",
      "Sponsor visibility",
      "Leaderboards",
      "30-day event hosting",
    ],
  },
};

export function getPricing(eventType: EventType): PricingTier {
  return PRICING[eventType];
}

/**
 * Compute inclusive duration of an event in days.
 * E.g. start = 2026-01-01, end = 2026-01-30 → 30 days.
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

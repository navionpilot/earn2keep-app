// Locked pricing for earn²keep — matches landing site slices L6 through L9.
// Phase 10 will plug Stripe Connect into the existing payment scaffold.
//
// Pricing structure:
//   Mini-Camp   $99   single team, smaller fundraisers (typically under $5k goal)
//   Camp        $189  single team, standard fundraisers
//   Tournament  $349  multi-team competition (registration-fee pot)
//
// Mini-Camp and Camp donations also pass through a 3.5% + $0.40 per-donation
// payment processing fee. The majority of that fee (currently 2.9% + $0.30)
// is remitted to Stripe; the remainder covers platform infrastructure and
// edge-case coverage. Tournament events have no per-transaction platform fee
// — Stripe processes registration fees at their standard rate.

export type EventType = "mini-camp" | "camp" | "tournament";

// Flat launch fees (USD, charged once at event activation)
export const MINI_CAMP_FEE_USD = 99;
export const CAMP_FEE_USD = 189;
export const TOURNAMENT_FEE_USD = 349;

// Per-donation processing fee (Mini-Camp and Camp only)
export const TRANSACTION_FEE_RATE = 0.035; // 3.5% of donation amount
export const TRANSACTION_FEE_FLAT_CENTS = 40; // $0.40 per donation

// Soft threshold used by the tier recommender and auto-upgrade logic.
// A single-team event whose total goal is AT OR BELOW this amount is
// suggested as Mini-Camp; anything strictly above this amount is auto-
// upgraded to Camp at payment time. ($2,000 — set deliberately so that
// Mini-Camp targets genuinely small/first-time fundraisers.)
export const MINI_CAMP_GOAL_THRESHOLD_USD = 2000;

export const MAX_EVENT_DAYS = 30;

export interface PricingTier {
  fee: number;
  label: string;
  subtitle: string;
  features: string[];
}

export const PRICING: Record<EventType, PricingTier> = {
  "mini-camp": {
    fee: MINI_CAMP_FEE_USD,
    label: "Mini-Camp",
    subtitle: "For smaller groups and first-time fundraisers",
    features: [
      "1 team",
      "Challenge tracking",
      "Supporter pages",
      "Leaderboards",
      "Messaging",
      "Live progress tracking",
      "30-day event hosting",
    ],
  },
  camp: {
    fee: CAMP_FEE_USD,
    label: "Camp",
    subtitle: "Single-team fundraiser",
    features: [
      "1 team",
      "Challenge tracking",
      "Supporter pages",
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
      "2 or more teams (no maximum)",
      "Per-participant registration fees \u2192 shared pot",
      "Winning team takes the pot",
      "Challenge tracking (required for competition)",
      "Tournament-wide leaderboard",
      "30-day event hosting",
    ],
  },
};

export function getPricing(eventType: EventType): PricingTier {
  return PRICING[eventType];
}

/**
 * Behavioral helper - Mini-Camp and Camp behave identically throughout the
 * app (single team, donation-based fundraising, same features). The only
 * difference is launch price. Use this for event display logic that should
 * apply to both.
 */
export function isCampLike(eventType: EventType): boolean {
  return eventType === "mini-camp" || eventType === "camp";
}

/**
 * Tier recommendation logic.
 *
 * - Multi-team event -> Tournament. End of story (structural choice, not goal).
 * - Single-team event with total goal AT OR BELOW MINI_CAMP_GOAL_THRESHOLD_USD ->
 *   Mini-Camp recommended.
 * - Otherwise -> Camp recommended.
 *
 * `totalGoalUsd` is the total expected fundraising for the event (which in
 * this app's data model is goal_amount * player_count across all teams on
 * the event). The Organizer can always override the recommendation.
 */
export function recommendTier(opts: {
  isMultiTeam: boolean;
  totalGoalUsd: number;
}): EventType {
  if (opts.isMultiTeam) return "tournament";
  if (opts.totalGoalUsd > 0 && opts.totalGoalUsd <= MINI_CAMP_GOAL_THRESHOLD_USD) {
    return "mini-camp";
  }
  return "camp";
}

/**
 * Auto-upgrade rule: a Mini-Camp event with total goal STRICTLY ABOVE the
 * threshold gets upgraded to Camp tier. This is enforced both as an inline
 * warning on the form (where the user can switch manually) and as a
 * silent upgrade at the payment page (so the user is charged correctly
 * regardless of how they got there).
 *
 * Only Mini-Camp -> Camp upgrades automatically. Camp -> Mini-Camp does
 * NOT auto-downgrade (paying customers don't get billing changed without
 * consent).
 */
export function shouldAutoUpgradeToCamp(opts: {
  eventType: EventType;
  totalGoalUsd: number;
}): boolean {
  return (
    opts.eventType === "mini-camp" &&
    opts.totalGoalUsd > MINI_CAMP_GOAL_THRESHOLD_USD
  );
}

/**
 * Returns the explanation string for a recommendation, suitable for inline
 * UI copy near the event-type picker.
 */
export function recommendationReason(opts: {
  isMultiTeam: boolean;
  totalGoalUsd: number;
}): string {
  if (opts.isMultiTeam) {
    return "Tournament \u2014 your event has 2 or more participating teams.";
  }
  if (opts.totalGoalUsd <= 0) {
    return "Enter a goal above to see the recommended tier.";
  }
  if (opts.totalGoalUsd <= MINI_CAMP_GOAL_THRESHOLD_USD) {
    return `Mini-Camp ($${MINI_CAMP_FEE_USD}) \u2014 recommended for total goals up to $${MINI_CAMP_GOAL_THRESHOLD_USD.toLocaleString()}.`;
  }
  return `Camp ($${CAMP_FEE_USD}) \u2014 recommended for total goals above $${MINI_CAMP_GOAL_THRESHOLD_USD.toLocaleString()}.`;
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
 * Returns true when dates are missing/invalid - other validators handle empty fields.
 */
export function isWithinMaxDuration(startDate: string, endDate: string): boolean {
  const days = eventDurationDays(startDate, endDate);
  if (isNaN(days)) return true;
  return days <= MAX_EVENT_DAYS;
}

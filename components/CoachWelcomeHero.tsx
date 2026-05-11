// =============================================================================
// components/CoachWelcomeHero.tsx — First-run welcome for new coaches
// =============================================================================
// Slice 7.4. Replaces HeroCard on the dashboard when the coach has zero
// organizations. Replaces "You're making a real impact" + "0% goal
// progress" (both meaningless for a brand-new account) with a proper
// welcome message, a brief intro to what earn²keep is, a 3-step "how it
// works" summary, and a clear single CTA to start setup.
//
// Renders only via the dashboard's conditional logic — once the coach
// creates their first organization, HeroCard takes over.
// =============================================================================

import Link from "next/link";

interface CoachWelcomeHeroProps {
  /** First name of the coach (already trimmed). Used in the greeting. */
  firstName: string;
}

export default function CoachWelcomeHero({ firstName }: CoachWelcomeHeroProps) {
  // Greeting: prefer first name when available, otherwise just "Welcome!"
  // (the redirect to /profile/complete should mean this is always set,
  // but defensive coding — never render an awkward "Welcome, !").
  const safeName = firstName?.trim() || "";
  const greeting = safeName ? `Welcome, ${safeName}!` : "Welcome to earn²keep!";

  return (
    <section className="e2k-welcome-hero" aria-label="Welcome">
      <div className="e2k-welcome-hero-bg" aria-hidden="true" />
      <div className="e2k-welcome-hero-content">
        <div className="e2k-welcome-eyebrow">★ NEW HERE ★</div>
        <h1 className="e2k-welcome-title">{greeting}</h1>
        <p className="e2k-welcome-intro">
          earn²keep turns fundraising on its head.{" "}
          <span className="e2k-welcome-emph">
            Your players earn money for completing challenges
          </span>{" "}
          — push-ups, scripture memorization, books read, miles run, whatever
          fits your group — instead of selling candy bars door-to-door.
          Sponsors pledge a per-rep amount. The kids do the work. You raise
          more than you ever did with traditional fundraisers.
        </p>

        <div className="e2k-welcome-howit">
          <div className="e2k-welcome-howit-title">HOW IT WORKS</div>
          <ol className="e2k-welcome-howit-list">
            <li>
              <strong>Set up your roster.</strong> Create your organization
              (school, club, church, troop, gym), add your team(s), and add
              the players who&apos;ll be competing.
            </li>
            <li>
              <strong>Launch a fundraiser.</strong> Pick challenges, set goals
              and prizes, and generate sponsor QR codes that your players hand
              out to friends and family.
            </li>
            <li>
              <strong>Track progress.</strong> Players record videos of their
              attempts, you approve them, points add up on the leaderboard,
              and sponsors get charged automatically.
            </li>
          </ol>
        </div>

        <div className="e2k-welcome-cta-row">
          <Link href="/organizations/new" className="e2k-btn-coral">
            <span className="e2k-btn-plus">+</span> Create your first organization
          </Link>
          <Link href="/setup-guide" className="e2k-link-cyan">
            Or read the Setup Guide first →
          </Link>
        </div>
      </div>
    </section>
  );
}

"use client";

// =============================================================================
// components/EventGuide.tsx — Right-sidebar walkthrough for event detail page
// =============================================================================
// Slice 5.2.1 ships this in response to user feedback: the dashboard's
// step-by-step guide was helpful for getting from zero to having an event,
// but once a coach lands on /events/[id] they didn't know what to do next.
//
// Mirrors the architecture of DashboardGuide:
//   - Client component, takes flat boolean/id props from server parent
//   - Computes a "currentStep" from the event's progress signals
//   - Renders 7 steps with past/current/future styling
//   - Reuses the same e2k-walk-aside-* CSS classes as DashboardGuide so the
//     visual is identical, just with event-specific copy
//
// 7 steps, in the order a coach actually does them after creating an event:
//   1. Build training schedule  (drag challenges into days)
//   2. Activate the event       (Draft -> Active)
//   3. Send invites to players  (so they can sign up)
//   4. Distribute sponsor QRs   (print flyers, share links)
//   5. Review submissions       (one-tap approve/reject as videos roll in)
//   6. Track the leaderboard    (auto-updates; explains scoring)
//   7. Mark the event complete  (when the season ends)
// =============================================================================

import { useState } from "react";
import Link from "next/link";

interface EventGuideProps {
  eventId: string;
  eventStatus: "draft" | "active" | "completed" | string | null;
  eventType: "camp" | "tournament" | string | null;
  // Schedule progress
  hasChallenges: boolean;
  // Player + invite progress (used to detect step 3 done-ness)
  hasInvitesSent: boolean;
  // Submission progress
  totalSubmissionCount: number;
  pendingSubmissionCount: number;
  // First team id for the "Send invites" action button
  firstTeamId?: string | null;
}

interface StepCopy {
  num: number;
  title: string;
  intro: string;
  detail?: string;
  tip?: string;
  // Optional Camp/Tournament-specific notes (used on step 6 = leaderboard,
  // since scoring rules differ between event types).
  campNote?: string;
  tournamentNote?: string;
}

const STEPS: StepCopy[] = [
  {
    num: 1,
    title: "Build your training schedule",
    intro:
      "Open the schedule planner and drag challenges into each day of the event. This is what your players will record videos of.",
    detail:
      "You can pull from the Challenge Library (push-ups, free throws, sprints, drills — pre-built and tagged by sport) or write custom ones for your team.",
    tip: "Repeating the same drill across the week? Use \"Apply this day to other days\" to copy a day's schedule onto multiple dates at once.",
  },
  {
    num: 2,
    title: "Activate the event",
    intro:
      "While your event is in Draft, players can't submit anything and sponsors can't pledge. Click ▶ Activate Event in the header to flip it live.",
    detail:
      "You can pause an active event later if you need to (rain delay, schedule shift) — that just freezes new submissions without ending the event.",
    tip: "Don't worry about activating too early. Sponsor pages and player tracking only \"go live\" once you flip the switch.",
  },
  {
    num: 3,
    title: "Send invites to your players",
    intro:
      "Players need their own accounts to record challenges and track fundraising. Click into your team and use the ✉ Send Invites button.",
    detail:
      "Each player gets a branded email with a one-click sign-up link. They don't need a password — just click the link in their inbox.",
    tip: "If a parent's email is on the player record, that's where the invite goes. Otherwise you can paste in the right address right in the modal.",
  },
  {
    num: 4,
    title: "Distribute sponsor QR codes",
    intro:
      "Each player has a unique sponsor page with their own QR code. Print flyers, text the link to family, post on socials — these are how money gets raised.",
    detail:
      "Sponsors scan the QR or click the link, see the player's name and event, and pledge support. Camps: sponsors back a fundraising minimum. Tournaments: registration fees are paid up front.",
    tip: "Open the QR Codes tab to download a printable flyer per player, or copy individual sponsor links to share digitally.",
  },
  {
    num: 5,
    title: "Review challenge submissions",
    intro:
      "As players record and send in their challenge videos, they pile up in your Submissions queue waiting for your call.",
    detail:
      "Tap a submission, watch the clip, and approve, reject, or adjust the rep count with one click. Approved submissions earn points; rejected ones don't.",
    tip: "Quick rejection reasons (\"camera too shaky,\" \"reps not visible,\" \"wrong drill\") are pre-built so reviewing a backlog goes fast.",
  },
  {
    num: 6,
    title: "Track the leaderboard",
    intro:
      "The leaderboard updates automatically as you approve submissions. Top performers win prize gift cards at the end of the event.",
    campNote:
      "Camp scoring: challenge points + bonus points for every dollar raised above each player's fundraising minimum.",
    tournamentNote:
      "Tournament scoring: pure challenge points — top teams take the prize pot.",
    tip: "The leaderboard tab refreshes in real time; safe to leave open on a screen during practice if you want to gamify it.",
  },
  {
    num: 7,
    title: "Mark the event complete",
    intro:
      "When the season ends, click ✓ Mark Complete in the header. This locks final scores and freezes the leaderboard for award ceremonies.",
    detail:
      "Completed events stay viewable for records — you'll be able to see final standings, total raised, and any approved submissions whenever you need them.",
  },
];

// Compute which step the coach should focus on right now. This drives the
// "Step X of 7" header line and which step gets the full detailed copy +
// action button. Past steps get ✓, future steps get a teaser.
function getCurrentStep(props: EventGuideProps): number {
  // Step 1: schedule must have at least one challenge.
  if (!props.hasChallenges) return 1;

  // Step 2: event must be live.
  if (props.eventStatus === "draft") return 2;

  // Once event is completed, everything's done.
  if (props.eventStatus === "completed") return 7;

  // Step 3: at least one player must have an invite sent.
  if (!props.hasInvitesSent) return 3;

  // Step 5: pending submissions waiting for review.
  if (props.pendingSubmissionCount > 0) return 5;

  // If submissions exist but none are pending, the leaderboard is the
  // most useful active surface to point at.
  if (props.totalSubmissionCount > 0) return 6;

  // Default once active + invites are out: distribute QR codes (step 4).
  // This is the longest "in progress" state; coaches sit here while waiting
  // for first submissions to arrive.
  return 4;
}

function getActionFor(
  stepNum: number,
  props: EventGuideProps
): { label: string; href: string } | null {
  switch (stepNum) {
    case 1:
      return { label: "Open schedule planner →", href: `/events/${props.eventId}/schedule` };
    case 2:
      // No href — activation is via the EventStatusButton in the page header.
      return null;
    case 3:
      return props.firstTeamId
        ? { label: "Open team to invite players →", href: `/teams/${props.firstTeamId}` }
        : null;
    case 4:
      return { label: "Open QR codes →", href: `/events/${props.eventId}/qr-codes` };
    case 5:
      return {
        label: `Review submissions${props.pendingSubmissionCount > 0 ? ` (${props.pendingSubmissionCount})` : ""} →`,
        href: `/events/${props.eventId}/submissions`,
      };
    case 6:
      return { label: "Open leaderboard →", href: `/events/${props.eventId}/leaderboard` };
    case 7:
      // No href — completion is via the EventStatusButton in the page header.
      return null;
    default:
      return null;
  }
}

export default function EventGuide(props: EventGuideProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentStep = getCurrentStep(props);
  const allDone = props.eventStatus === "completed";
  const isCamp = props.eventType === "camp";

  return (
    <aside className={`e2k-walk-aside e2k-dash-guide ${collapsed ? "e2k-walk-aside-collapsed" : ""}`}>
      <div className="e2k-walk-aside-head">
        <div className="e2k-walk-aside-eyebrow-row">
          <span className="e2k-walk-aside-eyebrow">★ EVENT WALKTHROUGH ★</span>
          <button
            type="button"
            className="e2k-walk-aside-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand walkthrough" : "Collapse walkthrough"}
          >
            {collapsed ? "▾" : "▴"}
          </button>
        </div>
        <h3 className="e2k-walk-aside-title">Running this event</h3>
        <p className="e2k-walk-aside-progress">
          {allDone ? (
            "✓ Event complete!"
          ) : (
            <>
              Step <strong>{currentStep}</strong> of <strong>7</strong> —{" "}
              {STEPS[currentStep - 1].title.toLowerCase()}
            </>
          )}
        </p>
      </div>

      {!collapsed && (
        <>
          {STEPS.map((step) => {
            const status =
              step.num < currentStep
                ? "past"
                : step.num === currentStep
                ? "current"
                : "future";
            const action = status === "current" ? getActionFor(step.num, props) : null;

            return (
              <div
                key={step.num}
                className={`e2k-walk-aside-step e2k-walk-aside-step-${status}`}
              >
                <div className="e2k-walk-aside-num">
                  {status === "past" || (allDone && step.num <= 7) ? "✓" : step.num}
                </div>
                <div className="e2k-walk-aside-body">
                  <div className="e2k-walk-aside-step-title">{step.title}</div>

                  {status === "current" && (
                    <>
                      <p className="e2k-walk-aside-text">{step.intro}</p>
                      {step.detail && (
                        <p className="e2k-walk-aside-text">{step.detail}</p>
                      )}

                      {/* Step 6: scoring rules differ between Camp and Tournament,
                          so show whichever applies to this event. */}
                      {step.num === 6 && (
                        <div className="e2k-walk-aside-typetip e2k-walk-aside-camp">
                          <strong>{isCamp ? "Camp scoring:" : "Tournament scoring:"}</strong>{" "}
                          {isCamp ? step.campNote : step.tournamentNote}
                        </div>
                      )}

                      {step.tip && (
                        <div className="e2k-walk-aside-tip">
                          <strong>Tip:</strong> {step.tip}
                        </div>
                      )}

                      {action && (
                        <Link href={action.href} className="e2k-dash-guide-action">
                          {action.label}
                        </Link>
                      )}

                      {/* Steps 2 + 7 don't have action hrefs because the
                          control lives in the page header (EventStatusButton).
                          Show a small inline pointer instead. */}
                      {step.num === 2 && !action && (
                        <p className="e2k-walk-aside-text e2k-walk-aside-pointer">
                          ↑ Look for the <strong>▶ Activate Event</strong> button at the
                          top of this page.
                        </p>
                      )}
                      {step.num === 7 && !action && (
                        <p className="e2k-walk-aside-text e2k-walk-aside-pointer">
                          ↑ The <strong>✓ Mark Complete</strong> button is at the top of
                          this page.
                        </p>
                      )}
                    </>
                  )}

                  {status === "past" && (
                    <p className="e2k-walk-aside-text e2k-walk-aside-past-text">
                      Done.
                    </p>
                  )}

                  {status === "future" && (
                    <p className="e2k-walk-aside-text e2k-walk-aside-future-text">
                      {step.intro.length > 75
                        ? step.intro.substring(0, 75) + "…"
                        : step.intro}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="e2k-walk-aside-foot">
            <p className="e2k-walk-aside-foot-text">Need more detail?</p>
            <Link href="/help" className="e2k-walk-aside-foot-link">
              Open Help page →
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}

"use client";

// =============================================================================
// components/EventGuide.tsx — Right-sidebar walkthrough for event detail page
// =============================================================================
// Slice 5.7 reorders the steps and adds CTA buttons. The OLD order had
// "Activate" as step 2 and "Send invites" as step 3 — but that's backwards.
// Players need to claim their accounts BEFORE the event flips live, so
// invites should come before activation. New order:
//
//   1. Build training schedule
//   2. Send invites to your players/participants      ← MOVED UP from step 3
//   3. Generate supporter QR codes         ← MOVED UP from step 4
//   4. Activate the event                ← MOVED DOWN from step 2
//   5. Review submissions
//   6. Track leaderboard
//   7. Mark event complete
//
// Step 2 ("Send invites") now has a deep-link CTA button:
//   /teams/<id>?send=true → auto-opens the SendInvitesModal
//
// Steps 4 and 7 don't have CTAs — both are header buttons (▶ Activate Event,
// ✓ Mark Complete) — so the step copy just says "look up there."
// =============================================================================

import { useState } from "react";
import Link from "next/link";

interface EventGuideProps {
  eventId: string;
  eventStatus: "draft" | "active" | "completed" | string | null;
  eventType: "mini-camp" | "camp" | "tournament" | string | null;
  // Schedule progress
  hasChallenges: boolean;
  // Player + invite progress
  hasInvitesSent: boolean;
  // Slice 5.7: QR-codes-page-visited indicator (supporter_tokens exist)
  hasQRCodes: boolean;
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
    title: "Send invites to your players/participants",
    intro:
      "Players/participants need their own accounts to record challenges and track fundraising. Send invites BEFORE activating the event so they're ready to go on day one.",
    detail:
      "Each player gets a branded email with a one-click sign-up link. They don't need a password — just click the link in their inbox. The button below jumps straight to your team page with the invite modal open.",
    tip: "If a parent's email is on the player record, that's where the invite goes. Otherwise paste in the right address right in the modal.",
  },
  {
    num: 3,
    title: "Generate supporter QR codes",
    intro:
      "Each player/participant has a unique supporter page with their own QR code. Print flyers, text the link to family, post on socials — these are how money gets raised.",
    detail:
      "Supporters scan the QR or click the link, see the player's name and event, and pledge support. Camps: supporters back a fundraising minimum. Tournaments: registration fees are paid up front.",
    tip: "Open the QR Codes tab to download a printable flyer per player, or copy individual supporter links to share digitally.",
  },
  {
    num: 4,
    title: "Activate the event",
    intro:
      "While your event is in Draft, players/participants can't submit anything and supporters can't pledge. Click ▶ Activate Event in the header to flip it live.",
    detail:
      "You can pause an active event later if you need to (rain delay, schedule shift) — that just freezes new submissions without ending the event.",
    tip: "Don't worry about activating too early. Supporter pages and player tracking only \"go live\" once you flip the switch.",
  },
  {
    num: 5,
    title: "Review challenge submissions",
    intro:
      "As players/participants record and send in their challenge videos, they pile up in your Submissions queue waiting for your call.",
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

// Slice 5.7: new step numbers — see header comment for old/new mapping.
function getCurrentStep(props: EventGuideProps): number {
  // Step 1: schedule must have at least one challenge.
  if (!props.hasChallenges) return 1;

  // Step 2: at least one player invite must have been sent.
  if (!props.hasInvitesSent) return 2;

  // Step 3: at least one supporter QR token must exist (proxy for "coach
  // has opened the QR codes page at least once").
  if (!props.hasQRCodes) return 3;

  // Step 4: event must be activated.
  if (props.eventStatus === "draft") return 4;

  // Once event is completed, the journey is done.
  if (props.eventStatus === "completed") return 7;

  // Step 5: pending submissions waiting for review.
  if (props.pendingSubmissionCount > 0) return 5;

  // Step 6: submissions exist but none pending — leaderboard is the
  // most useful active surface to point at.
  if (props.totalSubmissionCount > 0) return 6;

  // Default once active + everything's been done: hang out on the
  // leaderboard while waiting for first submissions to roll in.
  return 6;
}

function getActionFor(
  stepNum: number,
  props: EventGuideProps
): { label: string; href: string } | null {
  switch (stepNum) {
    case 1:
      return {
        label: "Open schedule planner →",
        href: `/events/${props.eventId}/schedule`,
      };
    case 2:
      // Slice 5.7: deep-link to team page with ?send=true to auto-open
      // the SendInvitesModal. The team page reads this and pre-opens
      // the modal in TeamInvitesButton.
      return props.firstTeamId
        ? {
            label: "✉ Open team to send invites →",
            href: `/teams/${props.firstTeamId}?send=true`,
          }
        : null;
    case 3:
      return {
        label: "Open QR codes →",
        href: `/events/${props.eventId}/qr-codes`,
      };
    case 4:
      // No href — activation is via the EventStatusButton in the page header.
      return null;
    case 5:
      return {
        label: `Review submissions${
          props.pendingSubmissionCount > 0 ? ` (${props.pendingSubmissionCount})` : ""
        } →`,
        href: `/events/${props.eventId}/submissions`,
      };
    case 6:
      return {
        label: "Open leaderboard →",
        href: `/events/${props.eventId}/leaderboard`,
      };
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
  const isCamp = props.eventType === "camp" || props.eventType === "mini-camp";

  return (
    <aside
      className={`e2k-walk-aside e2k-dash-guide ${
        collapsed ? "e2k-walk-aside-collapsed" : ""
      }`}
    >
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
                  {status === "past" ? "✓" : step.num}
                </div>
                <div className="e2k-walk-aside-body">
                  <div className="e2k-walk-aside-step-title">{step.title}</div>

                  {status === "current" && (
                    <>
                      <p className="e2k-walk-aside-text">{step.intro}</p>
                      {step.detail && (
                        <p className="e2k-walk-aside-text">{step.detail}</p>
                      )}

                      {/* Camp vs Tournament tip on the leaderboard step */}
                      {step.num === 6 && (step.campNote || step.tournamentNote) && (
                        <>
                          <div className="e2k-walk-aside-typetip e2k-walk-aside-camp">
                            <strong>Camp:</strong> {step.campNote}
                          </div>
                          <div className="e2k-walk-aside-typetip e2k-walk-aside-tournament">
                            <strong>Tournament:</strong> {step.tournamentNote}
                          </div>
                        </>
                      )}

                      {step.tip && (
                        <div className="e2k-walk-aside-tip">
                          <strong>Tip:</strong> {step.tip}
                        </div>
                      )}

                      {action ? (
                        <Link
                          href={action.href}
                          className="e2k-dash-guide-action"
                        >
                          {action.label}
                        </Link>
                      ) : step.num === 4 ? (
                        <p className="e2k-walk-aside-uplook">
                          ↑ Look for the <strong>▶ Activate Event</strong> button at the top of this page.
                        </p>
                      ) : step.num === 7 ? (
                        <p className="e2k-walk-aside-uplook">
                          ↑ Look for the <strong>✓ Mark Complete</strong> button at the top of this page.
                        </p>
                      ) : null}
                    </>
                  )}

                  {status === "past" && (
                    <p className="e2k-walk-aside-text e2k-walk-aside-past-text">
                      Done.
                    </p>
                  )}

                  {status === "future" && (
                    <p className="e2k-walk-aside-text e2k-walk-aside-future-text">
                      {step.intro.length > 70
                        ? step.intro.substring(0, 70) + "…"
                        : step.intro}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="e2k-walk-aside-foot">
            <p className="e2k-walk-aside-foot-text">
              {isCamp ? "Camp event tips:" : "Tournament event tips:"}
            </p>
            <Link href="/help" className="e2k-walk-aside-foot-link">
              Open Help page →
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}

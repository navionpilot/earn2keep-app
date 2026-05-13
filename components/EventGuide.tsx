"use client";

// =============================================================================
// components/EventGuide.tsx — Right-sidebar walkthrough for event detail page
// =============================================================================
// Two completely different flows depending on event type:
//
// CAMP (7 steps):
//   1. Build training schedule
//   2. Send invites to your players
//   3. Generate supporter QR codes
//   4. Activate the event
//   5. Review challenge submissions
//   6. Track the leaderboard
//   7. Mark event complete
//
// TOURNAMENT (7 steps):
//   1. Build training schedule
//   2. Configure tiebreaker challenge (recommended)
//   3. Invite other team coaches (send the join code)
//   4. Send invites to YOUR team's players
//   5. Activate the event
//   6. Run the tournament (submissions + approvals + tiebreaker)
//   7. Mark event complete (winning team takes the pot)
//
// Progression is event-type aware. Steps reference different surfaces:
// QR codes vs Tournament Invitations panel; submissions review only vs
// submissions + approvals + tiebreaker.
// =============================================================================

import { useState } from "react";
import Link from "next/link";

interface EventGuideProps {
  eventId: string;
  eventStatus: "draft" | "active" | "completed" | string | null;
  eventType: "camp" | "tournament" | string | null;
  // Schedule progress (both Camp & Tournament)
  hasChallenges: boolean;
  // Player + invite progress (both)
  hasInvitesSent: boolean;
  // Camp-only: QR-codes-page-visited indicator
  hasQRCodes: boolean;
  // Submission progress (both)
  totalSubmissionCount: number;
  pendingSubmissionCount: number;
  // First team id for the "Send invites" action button
  firstTeamId?: string | null;
  // Tournament-specific props (optional — default to false/null so the
  // Camp call site stays compatible without forcing every prop)
  hasTiebreakerConfigured?: boolean;
  hasOtherTeamsRegistered?: boolean;
  hasPendingApprovals?: boolean;
  tiebreakerState?: string | null;
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

// ----------------------------------------------------------------------------
// CAMP STEPS
// ----------------------------------------------------------------------------
const CAMP_STEPS: StepCopy[] = [
  {
    num: 1,
    title: "Build your training schedule",
    intro:
      "Open the schedule planner and drag challenges into each day of the event. This is what your players will record videos of.",
    detail:
      "You can pull from the Challenge Library (push-ups, free throws, sprints, drills — pre-built and tagged by sport) or write custom ones for your team.",
    tip: 'Repeating the same drill across the week? Use "Apply this day to other days" to copy a day\'s schedule onto multiple dates at once.',
  },
  {
    num: 2,
    title: "Send invites to your players/participants",
    intro:
      "Players/participants need their own accounts to record challenges and track fundraising. Send invites BEFORE activating the event so they're ready to go on day one.",
    detail:
      "Each player gets a branded email with a one-click sign-up link. They don't need a password — just click the link in their inbox. The button below jumps straight to your team page with the invite modal open.",
    tip: "If a parent's email is on the player record, that's where the invite goes. Otherwise paste in the right address in the modal.",
  },
  {
    num: 3,
    title: "Generate supporter QR codes",
    intro:
      "Each player has a unique supporter page with their own QR code. Print flyers, text the link to family, post on socials — these are how money gets raised.",
    detail:
      "Supporters scan the QR or click the link, see the player's name and event, and pledge support based on the player's fundraising minimum.",
    tip: "Open the QR Codes tab to download a printable flyer per player, or copy individual supporter links to share digitally.",
  },
  {
    num: 4,
    title: "Activate the event",
    intro:
      "While your event is in Draft, players can't submit anything and supporters can't pledge. Click ▶ Activate Event in the header to flip it live.",
    detail:
      "You can pause an active event later if you need to (rain delay, schedule shift) — that just freezes new submissions without ending the event.",
    tip: 'Don\'t worry about activating too early. Supporter pages and player tracking only "go live" once you flip the switch.',
  },
  {
    num: 5,
    title: "Review challenge submissions",
    intro:
      "As players record and send in their challenge videos, they pile up in your Submissions queue waiting for your call.",
    detail:
      "Tap a submission, watch the clip, and approve, reject, or adjust the rep count with one click. Approved submissions earn points; rejected ones don't.",
    tip: 'Quick rejection reasons ("camera too shaky," "reps not visible," "wrong drill") are pre-built so reviewing a backlog goes fast.',
  },
  {
    num: 6,
    title: "Track the leaderboard",
    intro:
      "The leaderboard updates automatically as you approve submissions. Top performers win prize gift cards at the end of the event.",
    detail:
      "Camp scoring: challenge points + bonus points for every dollar raised above each player's fundraising minimum.",
    tip: "The leaderboard tab refreshes in real time; safe to leave open on a screen during practice if you want to gamify it.",
  },
  {
    num: 7,
    title: "Mark the event complete",
    intro:
      "When the season ends, click ✓ Mark Complete in the header. This locks final scores and freezes the leaderboard for award ceremonies.",
    detail:
      "Top individual performers earn the prize gift cards you configured. The team or organization keeps what's left of the fundraising total. Completed events stay viewable for records.",
  },
];

// ----------------------------------------------------------------------------
// TOURNAMENT STEPS
// ----------------------------------------------------------------------------
const TOURNAMENT_STEPS: StepCopy[] = [
  {
    num: 1,
    title: "Build the challenge schedule",
    intro:
      "Open the schedule planner and drag challenges into each day. Every team in the tournament competes on the SAME challenges — strict scoring means a team only earns a challenge's points if every player on its roster completes it.",
    detail:
      "Pull from the Challenge Library (push-ups, free throws, sprints, drills) or write custom ones. The set of challenges is set by the host (you) and is the same for every team that joins.",
    tip: "More challenges = more chances for strategic teams to outperform. But every absence costs the whole team — choose challenges your roster can realistically all complete.",
  },
  {
    num: 2,
    title: "Configure the tiebreaker challenge (recommended)",
    intro:
      "Pick one challenge that becomes the sudden-death tiebreaker. If two or more teams tie for the pot at event end, they get 48 hours to compete on this one challenge — whoever wins it takes the pot.",
    detail:
      "You can skip this — but if there's a tie at the end without a configured tiebreaker, you'll need to manually pick a winner. Pre-configuring is cleaner.",
    tip: "Pick a challenge that's quick to record + judge (so the 48-hour window is realistic) and that rewards effort over equipment.",
  },
  {
    num: 3,
    title: "Invite other team coaches",
    intro:
      "This is how teams from other organizations join your tournament. Open the Tournament Invitations panel on the event page and email the 6-character join code to coaches you want to invite.",
    detail:
      "They click the email link, see the public tournament info page (dates, Entry Fee, your challenges, current pot), decide if they're in, pay their team's Entry Fee, and they're registered. Each joining team adds their Entry Fee to the pot.",
    tip: "You can also paste the join code into a group chat, Slack, league forum, or anywhere coaches hang out. Anyone with the code can join.",
  },
  {
    num: 4,
    title: "Send invites to your team's players",
    intro:
      "Invite the players on YOUR team (the host's team). They need their own accounts to record challenges. Other teams' players get invited by their own coaches, not by you.",
    detail:
      "Each player gets a branded email with a one-click sign-up link — no password needed. The button below jumps straight to your team page with the invite modal open.",
    tip: "Same flow as a Camp — you're just inviting one team's worth of players (yours).",
  },
  {
    num: 5,
    title: "Activate the event",
    intro:
      "Click ▶ Activate Event in the header to flip the tournament live. While in Draft, no team (including yours) can submit anything and the join code doesn't accept new registrations.",
    detail:
      "Tip: activate AFTER you've sent the invitations to other coaches and given them a window to register. Once activated, the tournament runs on its own schedule.",
    tip: 'Don\'t worry about activating too early. Player pages and submission tracking only "go live" once you flip the switch.',
  },
  {
    num: 6,
    title: "Run the tournament",
    intro:
      "Day to day, three things happen on this page: submissions come in, pending team approvals appear (if you enabled approval mode), and — if a tie develops — the sudden-death tiebreaker activates.",
    detail:
      "Review every submission with one tap. Approve any pending team registrations (or decline them — they get refunded). If the standings end in a tie for the pot, the tiebreaker block appears on the event page with a 48-hour countdown.",
    tip: "The Standings panel updates in real time. Strict scoring means standings move only when every player on a team completes a challenge — small disciplined rosters can beat large ones.",
  },
  {
    num: 7,
    title: "Mark the event complete",
    intro:
      "When the tournament ends, click ✓ Mark Complete in the header. The winning team is locked in. The whole pot of Entry Fees goes to the winning team — no individual prizes, no split pot.",
    detail:
      "You (the host org) pay the winning team's coach directly from your bank account. Earn²keep facilitates the competition but doesn't handle the prize payout. View total received via the Money page on your org.",
  },
];

// ----------------------------------------------------------------------------
// Progression logic (event-type aware)
// ----------------------------------------------------------------------------
function getCurrentStep(props: EventGuideProps): number {
  const isTournament = props.eventType === "tournament";

  // Step 1: Schedule must have at least one challenge.
  if (!props.hasChallenges) return 1;

  if (isTournament) {
    // Step 2 (Tournament): Tiebreaker configured. Optional but recommended;
    // if a tiebreaker isn't set we still flag step 2 as current to nudge
    // the user toward it.
    if (!props.hasTiebreakerConfigured) return 2;
    // Step 3: At least one other team has registered (proxy for "you've
    // sent invitations and someone joined"). If no other teams have
    // joined yet, we're still on step 3.
    if (!props.hasOtherTeamsRegistered) return 3;
    // Step 4: Player invites for the host's team.
    if (!props.hasInvitesSent) return 4;
    // Step 5: Activate the event.
    if (props.eventStatus === "draft") return 5;
    // Once completed, we're at step 7.
    if (props.eventStatus === "completed") return 7;
    // Step 6: Running the tournament — covers submissions, approvals,
    // and tiebreaker handling. Anything active or post-activation lives
    // here until completed.
    return 6;
  }

  // CAMP progression (unchanged from prior version)
  if (!props.hasInvitesSent) return 2;
  if (!props.hasQRCodes) return 3;
  if (props.eventStatus === "draft") return 4;
  if (props.eventStatus === "completed") return 7;
  if (props.pendingSubmissionCount > 0) return 5;
  if (props.totalSubmissionCount > 0) return 6;
  return 6;
}

// ----------------------------------------------------------------------------
// Action button mapping (event-type aware)
// ----------------------------------------------------------------------------
function getActionFor(
  stepNum: number,
  props: EventGuideProps
): { label: string; href: string } | null {
  const isTournament = props.eventType === "tournament";

  if (isTournament) {
    switch (stepNum) {
      case 1:
        return {
          label: "Open schedule planner →",
          href: `/events/${props.eventId}/schedule`,
        };
      case 2:
        // Tiebreaker is configured on the event page itself (L36
        // TournamentTiebreakerPicker component). No deep link needed.
        return null;
      case 3:
        // Tournament invitations panel lives on the event page.
        return null;
      case 4:
        return props.firstTeamId
          ? {
              label: "✉ Open team to send invites →",
              href: `/teams/${props.firstTeamId}?send=true`,
            }
          : null;
      case 5:
        // Activation is via the EventStatusButton in the header.
        return null;
      case 6:
        // Running the tournament — main action is review submissions.
        return {
          label: `Review submissions${
            props.pendingSubmissionCount > 0
              ? ` (${props.pendingSubmissionCount})`
              : ""
          } →`,
          href: `/events/${props.eventId}/submissions`,
        };
      case 7:
        return null;
      default:
        return null;
    }
  }

  // CAMP action mapping (unchanged from prior version)
  switch (stepNum) {
    case 1:
      return {
        label: "Open schedule planner →",
        href: `/events/${props.eventId}/schedule`,
      };
    case 2:
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
      return null;
    case 5:
      return {
        label: `Review submissions${
          props.pendingSubmissionCount > 0
            ? ` (${props.pendingSubmissionCount})`
            : ""
        } →`,
        href: `/events/${props.eventId}/submissions`,
      };
    case 6:
      return {
        label: "Open leaderboard →",
        href: `/events/${props.eventId}/leaderboard`,
      };
    case 7:
      return null;
    default:
      return null;
  }
}

// ----------------------------------------------------------------------------
// Step that needs an "up look" pointer to a header button or on-page section
// ----------------------------------------------------------------------------
function getUpLookHint(stepNum: number, isTournament: boolean): string | null {
  if (isTournament) {
    if (stepNum === 2) return "↑ Use the Tiebreaker section on this page to pick the sudden-death challenge.";
    if (stepNum === 3) return "↑ Use the Tournament Invitations panel on this page to email the join code to other coaches.";
    if (stepNum === 5) return "↑ Look for the ▶ Activate Event button at the top of this page.";
    if (stepNum === 7) return "↑ Look for the ✓ Mark Complete button at the top of this page.";
  } else {
    if (stepNum === 4) return "↑ Look for the ▶ Activate Event button at the top of this page.";
    if (stepNum === 7) return "↑ Look for the ✓ Mark Complete button at the top of this page.";
  }
  return null;
}

export default function EventGuide(props: EventGuideProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isTournament = props.eventType === "tournament";
  const isCamp = props.eventType === "camp";
  const STEPS = isTournament ? TOURNAMENT_STEPS : CAMP_STEPS;
  const currentStep = getCurrentStep(props);
  const allDone = props.eventStatus === "completed";

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
        <h3 className="e2k-walk-aside-title">
          {isTournament ? "Running this tournament" : "Running this event"}
        </h3>
        <p className="e2k-walk-aside-progress">
          {allDone ? (
            "✓ Event complete!"
          ) : (
            <>
              Step <strong>{currentStep}</strong> of <strong>{STEPS.length}</strong> —{" "}
              {STEPS[Math.min(currentStep, STEPS.length) - 1].title.toLowerCase()}
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
            const upLookHint =
              status === "current" && !action
                ? getUpLookHint(step.num, isTournament)
                : null;

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

                      {/* Camp/Tournament differentiator on any step that
                          defines both notes (Camp flow uses this on the
                          leaderboard step) */}
                      {step.campNote && step.tournamentNote && (
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
                      ) : upLookHint ? (
                        <p className="e2k-walk-aside-uplook">{upLookHint}</p>
                      ) : null}

                      {/* Tournament step 6 — inline alerts for active
                          sub-tasks so the host knows what to attend to
                          right now. */}
                      {isTournament && step.num === 6 && (
                        <>
                          {props.hasPendingApprovals && (
                            <div className="e2k-walk-aside-tip" style={{ background: "rgba(255, 208, 0, 0.08)", border: "1px solid rgba(255, 208, 0, 0.3)", marginTop: 8 }}>
                              <strong style={{ color: "#ffd000" }}>⏳ Pending approvals:</strong>{" "}
                              You have teams waiting for your approval. Scroll up to the Pending Approvals section on this page.
                            </div>
                          )}
                          {props.tiebreakerState === "active" && (
                            <div className="e2k-walk-aside-tip" style={{ background: "rgba(255, 117, 95, 0.08)", border: "1px solid rgba(255, 117, 95, 0.3)", marginTop: 8 }}>
                              <strong style={{ color: "#ff755f" }}>🔥 Tiebreaker active:</strong>{" "}
                              A sudden-death tiebreaker is running. Tied teams have 48 hours to submit. Watch the Tiebreaker block above for the countdown.
                            </div>
                          )}
                          {props.tiebreakerState === "host_decision_needed" && (
                            <div className="e2k-walk-aside-tip" style={{ background: "rgba(255, 117, 95, 0.08)", border: "1px solid rgba(255, 117, 95, 0.3)", marginTop: 8 }}>
                              <strong style={{ color: "#ff755f" }}>⚠️ Pick the winner:</strong>{" "}
                              The tiebreaker window closed without a clear result. Scroll up to the Tiebreaker block to pick the winning team manually.
                            </div>
                          )}
                        </>
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

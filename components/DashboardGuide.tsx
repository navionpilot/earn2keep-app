"use client";

// =============================================================================
// components/DashboardGuide.tsx — Coach onboarding walkthrough (Slice 5.7)
// =============================================================================
// Big rewrite. The previous version listed 6 steps but never mentioned
// "Send invites to players" — coaches following the dashboard checklist
// would never learn that step exists. Now grouped into 3 named phases
// that match how a coach actually thinks about the app:
//
//   PHASE A — Setup (one-time)
//     1. Create organization
//     2. Add a team
//     3. Add players to roster
//
//   PHASE B — Launch an event (per-event)
//     4. Create event
//     5. Send invites to players          ← NEW (was missing)
//     6. Generate sponsor QR codes
//     7. Activate the event
//
//   PHASE C — Run it
//     8. Review submissions
//     9. Mark event complete
//
// Each step has a clickable action button when it's the "current" step,
// so the coach is never wondering "okay, but where do I actually click?"
// =============================================================================

import { useState } from "react";
import Link from "next/link";

interface DashboardGuideProps {
  hasOrganization: boolean;
  hasTeams: boolean;
  hasPlayers: boolean;
  hasEvent: boolean;
  // New in 5.7: track invite + QR + active-event progression so the
  // checklist can light up the right phase.
  hasInvited: boolean;
  hasQR: boolean;
  hasActiveOrCompletedEvent: boolean;
  hasSubmissions: boolean;
  hasCompletedEvent: boolean;
  // For action button hrefs
  firstOrgId?: string;
  firstTeamId?: string;
  firstEventId?: string;
}

interface StepCopy {
  num: number;
  phase: "setup" | "launch" | "run";
  title: string;
  intro: string;
  detail?: string;
  tip?: string;
  campNote?: string;
  tournamentNote?: string;
}

const STEPS: StepCopy[] = [
  // ------- PHASE A: Setup -------
  {
    num: 1,
    phase: "setup",
    title: "Create your organization",
    intro:
      "Your organization is the top-level container — your school, club, church, troop, gym, or business.",
    detail:
      "You can have more than one organization if you coach for multiple groups.",
    tip: "Example: 'Lincoln Middle School Athletics' or 'Crossroads Youth Group'.",
  },
  {
    num: 2,
    phase: "setup",
    title: "Add at least one team",
    intro:
      "Inside your organization, create a team. The team is the roster of players who will compete together.",
    detail:
      "If you coach multiple age groups, create a team for each.",
    tip: "Example: 'Lincoln Lions U14' inside 'Lincoln Athletics'.",
  },
  {
    num: 3,
    phase: "setup",
    title: "Add players to your roster",
    intro:
      "Add each player's name and jersey number. You can add them one at a time or import a CSV.",
    detail:
      "We auto-detect CSV exports from TeamSnap, GameChanger, SportsEngine, and a few others — just drop in the file.",
    tip: "An optional verification photo per player helps confirm it's the right kid in submitted videos.",
  },

  // ------- PHASE B: Launch an event -------
  {
    num: 4,
    phase: "launch",
    title: "Create the event",
    intro:
      "Pick whether it's a Camp or a Tournament. They use different money models — read both before choosing.",
    campNote:
      "Camp = one team, internal competition. Each player has a personal fundraising minimum (e.g. $250). Players who exceed it earn bonus points + extra prize money.",
    tournamentNote:
      "Tournament = multiple teams, head-to-head. Each player pays a flat registration fee (e.g. $50). Top teams win the prize pot, rest goes to the org.",
    tip: "Most events run 4–6 weeks. Once you click +New Event, the form has its own step-by-step walkthrough.",
  },
  {
    num: 5,
    phase: "launch",
    title: "Send invites to your players",
    intro:
      "Players need their own accounts to record challenges and track fundraising. Open the team page and click ✉ Send Invites.",
    detail:
      "Each player gets a branded email with a one-click sign-up link. They don't need a password — just click the link in their inbox.",
    tip: "If a parent's email is on the player record, that's where the invite goes. Otherwise paste in the right address right in the modal.",
  },
  {
    num: 6,
    phase: "launch",
    title: "Generate sponsor QR codes",
    intro:
      "Each player gets a unique QR code. Print them, share them, or have players hand them out at school or practice.",
    detail:
      "Sponsors (parents, family, local businesses) scan the QR, see the player's real verified work, and contribute. The code is tied to the player and the event.",
  },
  {
    num: 7,
    phase: "launch",
    title: "Activate the event",
    intro:
      "While your event is in Draft, players can't submit anything and sponsors can't pledge. Click ▶ Activate Event in the event header to flip it live.",
    tip: "You can activate before or after sending invites — players who claim a magic link before activation just see a 'gets ready' state until the event starts.",
  },

  // ------- PHASE C: Run it -------
  {
    num: 8,
    phase: "run",
    title: "Review submissions as they come in",
    intro:
      "As the event runs, players submit videos of their challenges. You review and approve them with one tap.",
    detail:
      "The leaderboard updates automatically. You can review submissions from the Events page → submissions tab.",
  },
  {
    num: 9,
    phase: "run",
    title: "Mark the event complete",
    intro:
      "When the event ends, mark it complete from the event header. The leaderboard locks, top performers earn prizes, the team or organization keeps the rest. Earned, not begged for.",
  },
];

const PHASE_LABELS: Record<string, string> = {
  setup: "PHASE A · SETUP (ONE-TIME)",
  launch: "PHASE B · LAUNCH AN EVENT",
  run: "PHASE C · RUN IT",
};

function getCurrentStep(props: DashboardGuideProps): number {
  if (!props.hasOrganization) return 1;
  if (!props.hasTeams) return 2;
  if (!props.hasPlayers) return 3;
  if (!props.hasEvent) return 4;
  if (!props.hasInvited) return 5;
  if (!props.hasQR) return 6;
  if (!props.hasActiveOrCompletedEvent) return 7;
  if (!props.hasCompletedEvent) return 8;
  return 10; // all done sentinel
}

function getActionFor(
  stepNum: number,
  props: DashboardGuideProps
): { label: string; href: string } | null {
  switch (stepNum) {
    case 1:
      return { label: "Create organization →", href: "/organizations/new" };
    case 2:
      return props.firstOrgId
        ? {
            label: "Add team →",
            href: `/organizations/${props.firstOrgId}/teams/new`,
          }
        : null;
    case 3:
      return props.firstTeamId
        ? {
            label: "Add players →",
            href: `/teams/${props.firstTeamId}/players/new`,
          }
        : null;
    case 4:
      return props.firstOrgId
        ? {
            label: "Create event →",
            href: `/organizations/${props.firstOrgId}/events/new`,
          }
        : null;
    case 5:
      // Slice 5.7: deep-link to the team page with ?send=true to auto-open
      // the invites modal.
      return props.firstTeamId
        ? {
            label: "✉ Open team to send invites →",
            href: `/teams/${props.firstTeamId}?send=true`,
          }
        : null;
    case 6:
      return props.firstEventId
        ? {
            label: "Open QR codes →",
            href: `/events/${props.firstEventId}/qr-codes`,
          }
        : null;
    case 7:
      return props.firstEventId
        ? {
            label: "▶ Open event to activate →",
            href: `/events/${props.firstEventId}`,
          }
        : null;
    case 8:
      return props.firstEventId
        ? {
            label: "Open submissions →",
            href: `/events/${props.firstEventId}/submissions`,
          }
        : null;
    case 9:
      return props.firstEventId
        ? {
            label: "Open event →",
            href: `/events/${props.firstEventId}`,
          }
        : null;
    default:
      return null;
  }
}

export default function DashboardGuide(props: DashboardGuideProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentStep = getCurrentStep(props);
  const allDone = currentStep >= 10;

  const phases: { key: string; label: string; steps: StepCopy[] }[] = [
    { key: "setup", label: PHASE_LABELS.setup, steps: STEPS.filter((s) => s.phase === "setup") },
    { key: "launch", label: PHASE_LABELS.launch, steps: STEPS.filter((s) => s.phase === "launch") },
    { key: "run", label: PHASE_LABELS.run, steps: STEPS.filter((s) => s.phase === "run") },
  ];

  return (
    <aside
      className={`e2k-walk-aside e2k-dash-guide ${
        collapsed ? "e2k-walk-aside-collapsed" : ""
      }`}
    >
      <div className="e2k-walk-aside-head">
        <div className="e2k-walk-aside-eyebrow-row">
          <span className="e2k-walk-aside-eyebrow">★ COACH JOURNEY ★</span>
          <button
            type="button"
            className="e2k-walk-aside-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand walkthrough" : "Collapse walkthrough"}
          >
            {collapsed ? "▾" : "▴"}
          </button>
        </div>
        <h3 className="e2k-walk-aside-title">Getting started</h3>
        <p className="e2k-walk-aside-progress">
          {allDone ? (
            "✓ You're up and running!"
          ) : (
            <>
              Step <strong>{currentStep}</strong> of <strong>{STEPS.length}</strong>{" "}
              — {STEPS[Math.min(currentStep, STEPS.length) - 1].title.toLowerCase()}
            </>
          )}
        </p>
      </div>

      {!collapsed && (
        <>
          {phases.map((phase) => {
            const reachedThisPhase = phase.steps.some((s) => s.num <= currentStep);
            if (!reachedThisPhase) return null;

            return (
              <div key={phase.key} className="e2k-walk-aside-phase">
                <div className="e2k-walk-aside-phase-label">{phase.label}</div>

                {phase.steps.map((step) => {
                  const status =
                    step.num < currentStep
                      ? "past"
                      : step.num === currentStep
                      ? "current"
                      : "future";
                  const action =
                    status === "current" ? getActionFor(step.num, props) : null;

                  return (
                    <div
                      key={step.num}
                      className={`e2k-walk-aside-step e2k-walk-aside-step-${status}`}
                    >
                      <div className="e2k-walk-aside-num">
                        {status === "past" ? "✓" : step.num}
                      </div>
                      <div className="e2k-walk-aside-body">
                        <div className="e2k-walk-aside-step-title">
                          {step.title}
                        </div>

                        {status === "current" && (
                          <>
                            <p className="e2k-walk-aside-text">{step.intro}</p>
                            {step.detail && (
                              <p className="e2k-walk-aside-text">{step.detail}</p>
                            )}

                            {step.num === 4 && (
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

                            {action && (
                              <Link
                                href={action.href}
                                className="e2k-dash-guide-action"
                              >
                                {action.label}
                              </Link>
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

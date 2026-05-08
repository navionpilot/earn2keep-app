"use client";

import { useState } from "react";
import Link from "next/link";

interface DashboardGuideProps {
  hasOrganization: boolean;
  hasTeams: boolean;
  hasPlayers: boolean;
  hasEvent: boolean;
  firstOrgId?: string;
  firstTeamId?: string;
  firstEventId?: string;
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
    title: "Create your organization",
    intro:
      "Your organization is the top-level container — your school, club, church, troop, gym, or business.",
    detail:
      "You can have more than one organization if you coach for multiple groups. Each org has its own teams, players, and events.",
    tip: "Example: ‘Lincoln Middle School Athletics’ or ‘Crossroads Youth Group’.",
  },
  {
    num: 2,
    title: "Add at least one team",
    intro:
      "Inside your organization, create a team. The team is the roster of players who will compete together.",
    detail:
      "If you coach multiple age groups, create a team for each. You can even let other coaches manage their own teams inside the same organization.",
    tip: "Example: ‘Lincoln Lions U14’ inside ‘Lincoln Athletics’.",
  },
  {
    num: 3,
    title: "Add players to your roster",
    intro:
      "Add each player’s name and jersey number. You can add them one at a time or import a CSV.",
    detail:
      "We auto-detect CSV exports from TeamSnap, GameChanger, SportsEngine, and a few others — just drop in the file.",
    tip: "An optional verification photo per player helps confirm it’s the right kid in submitted videos.",
  },
  {
    num: 4,
    title: "Create your first event",
    intro:
      "Pick whether it’s a Camp or a Tournament. They use different money models — read both before choosing.",
    campNote:
      "Camp = one team, internal competition. Each player has a personal fundraising minimum (e.g. $250). Players who exceed it earn bonus points + extra prize money. Best for a single team or group.",
    tournamentNote:
      "Tournament = multiple teams, head-to-head. Each player pays a flat registration fee (e.g. $50). Top teams win the prize pot, rest goes to the org. Best for leagues.",
    tip: "Most events run 4–6 weeks. Once you click +New Event, the form has its own step-by-step walkthrough.",
  },
  {
    num: 5,
    title: "Generate sponsor QR codes",
    intro:
      "Each player gets a unique QR code. Print them, share them, or have players hand them out at school or practice.",
    detail:
      "Sponsors (parents, family, local businesses) scan the QR, see the player’s real verified work, and contribute. The code is tied to the player and the event.",
  },
  {
    num: 6,
    title: "Run your event",
    intro:
      "As the event runs, players submit videos of their challenges. You review and approve them with one tap.",
    detail:
      "The leaderboard updates automatically. At the end of the event, top performers earn prizes; the team or organization keeps the rest. Earned, not begged for.",
    tip: "You can review submissions from the Events page → submissions tab.",
  },
];

function getCurrentStep(props: DashboardGuideProps): number {
  if (!props.hasOrganization) return 1;
  if (!props.hasTeams) return 2;
  if (!props.hasPlayers) return 3;
  if (!props.hasEvent) return 4;
  return 6; // Once they have an event, they're effectively in step 5/6
}

function getActionFor(stepNum: number, props: DashboardGuideProps): { label: string; href: string } | null {
  switch (stepNum) {
    case 1:
      return { label: "Create organization →", href: "/organizations/new" };
    case 2:
      return props.firstOrgId
        ? { label: "Add team →", href: `/organizations/${props.firstOrgId}/teams/new` }
        : null;
    case 3:
      return props.firstTeamId
        ? { label: "Add players →", href: `/teams/${props.firstTeamId}/players/new` }
        : null;
    case 4:
      return props.firstOrgId
        ? { label: "Create event →", href: `/organizations/${props.firstOrgId}/events/new` }
        : null;
    case 5:
      return props.firstEventId
        ? { label: "Open QR codes →", href: `/events/${props.firstEventId}/qr-codes` }
        : null;
    case 6:
      return props.firstEventId
        ? { label: "Open event →", href: `/events/${props.firstEventId}` }
        : null;
    default:
      return null;
  }
}

export default function DashboardGuide(props: DashboardGuideProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentStep = getCurrentStep(props);
  const allDone = currentStep >= 6 && props.hasEvent;

  return (
    <aside className={`e2k-walk-aside e2k-dash-guide ${collapsed ? "e2k-walk-aside-collapsed" : ""}`}>
      <div className="e2k-walk-aside-head">
        <div className="e2k-walk-aside-eyebrow-row">
          <span className="e2k-walk-aside-eyebrow">★ STEP-BY-STEP ★</span>
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
          {allDone
            ? "✓ You're up and running!"
            : <>Step <strong>{currentStep}</strong> of <strong>6</strong> — {STEPS[currentStep - 1].title.toLowerCase()}</>
          }
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
              <div key={step.num} className={`e2k-walk-aside-step e2k-walk-aside-step-${status}`}>
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

                      {/* Camp vs Tournament side-by-side at step 4 */}
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
                        <Link href={action.href} className="e2k-dash-guide-action">
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
                      {step.intro.length > 70 ? step.intro.substring(0, 70) + "…" : step.intro}
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

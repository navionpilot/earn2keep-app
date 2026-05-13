"use client";

import { useState } from "react";

export type EventType = "camp" | "tournament" | "";

interface EventCreationGuideProps {
  eventType: EventType;
  hasName: boolean;
  hasStartDate: boolean;
  hasEndDate: boolean;
  selectedTeamCount: number;
  hasGoalAmount: boolean;
  hasFirstPrize: boolean;
}

interface StepCopy {
  num: number;
  title: string;
  intro: string;
  campNote?: string;
  tournamentNote?: string;
  preTypeNote?: string;
  tip?: string;
}

const STEPS: StepCopy[] = [
  {
    num: 1,
    title: "Basics",
    intro:
      "Start by picking your event type. Then give it a name and pick your start and end dates.",
    preTypeNote:
      "There are two event types — Camp and Tournament. They use different money models, so this choice matters. Quick read below.",
    campNote:
      "A Camp is one team competing internally. Each player has a personal fundraising minimum (the goal you'll set in step 3). Best for: a single team, group, troop, class, gym, or club.",
    tournamentNote:
      "A Tournament is a multi-team commitment contest. Your team competes head-to-head against teams from other organizations. Each joining team's organizer pays a per-team Entry Fee (set in step 3). All Entry Fees go into a pot; the winning team takes the whole pot.",
    tip: "Most events run 4–6 weeks. Shorter loses momentum, longer loses focus.",
  },
  {
    num: 2,
    title: "Teams",
    intro: "Pick which team or teams will participate in this event.",
    campNote:
      "Camps need exactly ONE team — players compete against each other inside the team for prizes.",
    tournamentNote:
      "Pick which of YOUR OWN teams you want to enter. Other teams from other organizations don't get picked here — they join later by using the 6-character join code you'll share with their organizers via email after the event is created.",
    tip:
      "Don't see the team you want? You can add a new one from the Teams page first, then come back here.",
  },
  {
    num: 3,
    title: "Money model",
    intro: "This is the heart of the event — how your fundraising actually works.",
    campNote:
      "Set a per-player fundraising goal (the minimum each player needs to raise). Common: $150, $250, $500. Players who exceed their minimum get bonus points + extra prize money. Total Camp goal = per-player × number of players.",
    tournamentNote:
      "Set a flat per-team Entry Fee. Common: $250, $500, $1,000. The organizer of each joining team pays this once when their team registers. The pot = Entry Fee × number of teams registered. earn²keep takes ZERO transaction fees — only Stripe's standard card-processing fee (2.9% + $0.30 per transaction, paid to Stripe) comes out before the host receives funds.",
    tip:
      "Camp pays bonuses for over-performance. Tournament pays the entire pot to the team that wins. That's the core difference.",
  },
  {
    num: 4,
    title: "Prizes",
    intro:
      "Decide how prizes work. Setup depends on event type.",
    campNote:
      "Camp prizes go to top INDIVIDUAL players — usually whoever raised the most or earned the most points. Pick gift card type and amount per place. Most organizers do top 3.",
    tournamentNote:
      "Tournament prizes are automatic — nothing to configure. The whole pot of Entry Fees goes to the team that wins. No individual winners, no split pot, no gift cards. The form will skip the prize editor for you.",
    tip:
      "Camp: you can pick gift cards from major retailers (Amazon, Walmart, Dick's, etc.) or use a custom value. Tournament: the prize is the pot — that's it.",
  },
];

function getCurrentStep(props: EventCreationGuideProps): number {
  const { eventType, hasName, hasStartDate, hasEndDate, selectedTeamCount, hasGoalAmount } = props;
  if (!eventType || !hasName || !hasStartDate || !hasEndDate) return 1;
  if (selectedTeamCount === 0) return 2;
  if (!hasGoalAmount) return 3;
  return 4;
}

export default function EventCreationGuide(props: EventCreationGuideProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentStep = getCurrentStep(props);
  const { eventType } = props;

  return (
    <aside className={`e2k-walk-aside ${collapsed ? "e2k-walk-aside-collapsed" : ""}`}>
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
        <h3 className="e2k-walk-aside-title">Setup walkthrough</h3>
        <p className="e2k-walk-aside-progress">
          Step <strong>{currentStep}</strong> of <strong>4</strong>
          {currentStep === 1 && eventType === "" ? " — Pick your event type" : null}
          {currentStep === 1 && eventType !== "" ? " — Finishing the basics" : null}
          {currentStep === 2 ? " — Picking teams" : null}
          {currentStep === 3 ? " — Setting the money model" : null}
          {currentStep === 4 ? " — Setting prizes" : null}
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

                      {/* Pre-type note: only shown on step 1 before user picks a type */}
                      {step.num === 1 && eventType === "" && step.preTypeNote && (
                        <p className="e2k-walk-aside-text">{step.preTypeNote}</p>
                      )}

                      {/* Camp-specific guidance */}
                      {(eventType === "camp") && step.campNote && (
                        <div className="e2k-walk-aside-typetip e2k-walk-aside-camp">
                          <strong>Camp:</strong> {step.campNote}
                        </div>
                      )}

                      {/* Tournament-specific guidance */}
                      {eventType === "tournament" && step.tournamentNote && (
                        <div className="e2k-walk-aside-typetip e2k-walk-aside-tournament">
                          <strong>Tournament:</strong> {step.tournamentNote}
                        </div>
                      )}

                      {/* No type yet: show BOTH options on step 1 only */}
                      {step.num === 1 && eventType === "" && (
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
                    </>
                  )}

                  {status === "past" && (
                    <p className="e2k-walk-aside-text e2k-walk-aside-past-text">
                      Done — keep scrolling to refine.
                    </p>
                  )}

                  {status === "future" && (
                    <p className="e2k-walk-aside-text e2k-walk-aside-future-text">
                      Coming up next.
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="e2k-walk-aside-foot">
            <p className="e2k-walk-aside-foot-text">
              Stuck on something specific?
            </p>
            <a
              href="mailto:support@earn2keep.com"
              className="e2k-walk-aside-foot-link"
            >
              Email support →
            </a>
          </div>
        </>
      )}
    </aside>
  );
}

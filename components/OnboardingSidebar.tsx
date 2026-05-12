"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Step = {
  number: number;
  title: string;
  description: string;
  isComplete: boolean;
  isCurrent: boolean;
  href?: string;
};

interface OnboardingSidebarProps {
  hasOrganization: boolean;
  hasTeams?: boolean;
  hasPlayers?: boolean;
  hasEvent?: boolean;
  hasQRCodes?: boolean;
}

export default function OnboardingSidebar({
  hasOrganization = false,
  hasTeams = false,
  hasPlayers = false,
  hasEvent = false,
  hasQRCodes = false,
}: OnboardingSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = typeof window !== "undefined" && window.sessionStorage.getItem("e2k-sidebar-collapsed");
    if (saved === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("e2k-sidebar-collapsed", String(newState));
    }
  };

  const getCurrentStepNumber = () => {
    if (!hasOrganization) return 1;
    if (!hasTeams) return 2;
    if (!hasPlayers) return 3;
    if (!hasEvent) return 4;
    if (!hasQRCodes) return 5;
    return 6;
  };

  const currentStep = getCurrentStepNumber();

  const steps: Step[] = [
    {
      number: 1,
      title: "Create Organization",
      description: "Your school, club, church, troop, or gym",
      isComplete: hasOrganization,
      isCurrent: currentStep === 1,
      href: hasOrganization ? undefined : "/organizations/new",
    },
    {
      number: 2,
      title: "Add Teams",
      description: 'e.g., "Lincoln Lions U14"',
      isComplete: hasTeams,
      isCurrent: currentStep === 2,
    },
    {
      number: 3,
      title: "Add Players",
      description: "Build your roster",
      isComplete: hasPlayers,
      isCurrent: currentStep === 3,
    },
    {
      number: 4,
      title: "Create Event",
      description: "Mini-Camp, Camp, or Tournament",
      isComplete: hasEvent,
      isCurrent: currentStep === 4,
    },
    {
      number: 5,
      title: "Generate QR Codes",
      description: "Share with supporters",
      isComplete: hasQRCodes,
      isCurrent: currentStep === 5,
    },
  ];

  const completedCount = steps.filter((s) => s.isComplete).length;

  if (!mounted) {
    return null;
  }

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button
          className="sidebar-toggle sidebar-toggle-collapsed"
          onClick={toggleCollapsed}
          aria-label="Expand sidebar"
          title="Show setup checklist"
        >
          <span className="sidebar-toggle-arrow">→</span>
          <span className="sidebar-toggle-progress">{completedCount}/5</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <span className="sidebar-eyebrow">★ YOUR JOURNEY ★</span>
          <h3 className="sidebar-title">Setup Checklist</h3>
        </div>
        <button
          className="sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar"
          title="Hide sidebar"
        >
          ←
        </button>
      </div>

      <div className="sidebar-progress-bar">
        <div className="sidebar-progress-fill" style={{ width: `${(completedCount / 5) * 100}%` }}></div>
      </div>
      <div className="sidebar-progress-label">
        {completedCount === 5
          ? "All set! Ready to launch."
          : `${completedCount} of 5 complete`}
      </div>

      <div className="sidebar-steps">
        {steps.map((step, i) => {
          const lineActive = i < steps.length - 1 && (step.isComplete || (step.isCurrent && completedCount > 0));
          return (
            <div key={step.number} className="sidebar-step">
              <div className="sidebar-step-marker-wrap">
                <div
                  className={`sidebar-step-marker ${
                    step.isComplete
                      ? "marker-complete"
                      : step.isCurrent
                      ? "marker-current"
                      : "marker-pending"
                  }`}
                >
                  {step.isComplete ? "✓" : step.number}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`sidebar-step-line ${lineActive ? "line-active" : ""}`}
                  ></div>
                )}
              </div>
              <div className="sidebar-step-content">
                <div
                  className={`sidebar-step-title ${
                    step.isCurrent ? "step-title-current" : step.isComplete ? "step-title-complete" : "step-title-pending"
                  }`}
                >
                  {step.href && step.isCurrent ? (
                    <Link href={step.href} style={{ color: "inherit", textDecoration: "none", fontWeight: "inherit" }}>
                      {step.title}
                    </Link>
                  ) : (
                    step.title
                  )}
                </div>
                <div
                  className={`sidebar-step-description ${
                    step.isCurrent || step.isComplete ? "" : "step-description-pending"
                  }`}
                >
                  {step.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-help-label">Need Help?</div>
        <Link href="/help" className="sidebar-help-link">
          📖 How earn²keep works
        </Link>
        <a href="mailto:support@earn2keep.com" className="sidebar-help-link">
          💬 Contact support
        </a>
      </div>
    </aside>
  );
}

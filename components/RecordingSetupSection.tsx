"use client";

import { useEffect, useState, useMemo } from "react";
import {
  recommendRecordingSetup,
  RECORDING_TEMPLATES,
  type Recommendation,
  type ChallengeContext,
} from "@/lib/recordingRecommender";

interface RecordingSetupSectionProps {
  // Inputs from the parent form (used to compute the recommendation)
  category: string;
  subcategoryName?: string | null;
  unit?: string | null;
  name?: string | null;

  // Output state managed by parent
  setupTemplateKey: string;
  setSetupTemplateKey: (key: string) => void;
  recordingInstructions: string;
  setRecordingInstructions: (text: string) => void;
  verificationMode: "ai_only" | "coach_only" | "ai_and_coach" | "";
  setVerificationMode: (mode: "ai_only" | "coach_only" | "ai_and_coach" | "") => void;
  // Slice 8.6 — which AI strategy to use when this challenge is AI-verified.
  // Auto-suggested from the unit but coach can override.
  aiVerificationStrategy: AIStrategyValue;
  setAiVerificationStrategy: (s: AIStrategyValue) => void;
}

export type AIStrategyValue =
  | "rep_count"
  | "time_hold"
  | "photo_completion"
  | "performance"
  | "audio_match"
  | "none"
  | "";

/**
 * Suggest a default AI strategy from the challenge's unit string. Returns
 * "" when the unit is empty (so the coach must pick something). Used by the
 * parent form to auto-fill the strategy dropdown when the coach edits the
 * unit field. They can always change it after.
 */
export function suggestStrategyFromUnit(unit: string | null | undefined): AIStrategyValue {
  if (!unit) return "";
  const u = unit.toLowerCase().trim();
  // Time-based units → time_hold (matches lib/timeChallenge.ts logic)
  if (["second", "seconds", "sec", "secs", "s", "minute", "minutes", "min", "mins"].includes(u)) {
    return "time_hold";
  }
  // Units that aren't AI-verifiable with the current strategy set
  if (["book", "books", "page", "pages", "chapter", "chapters"].includes(u)) return "none";
  if (["hour", "hours", "hr", "hrs"].includes(u)) return "none";
  if (["mile", "miles", "km", "kilometer", "kilometers", "meter", "meters"].includes(u)) return "none";
  // Everything else countable → rep_count is the safe default
  return "rep_count";
}

export default function RecordingSetupSection({
  category,
  subcategoryName,
  unit,
  name,
  setupTemplateKey,
  setSetupTemplateKey,
  recordingInstructions,
  setRecordingInstructions,
  verificationMode,
  setVerificationMode,
  aiVerificationStrategy,
  setAiVerificationStrategy,
}: RecordingSetupSectionProps) {
  // Track whether the coach has accepted the recommendation
  const [accepted, setAccepted] = useState(false);
  // Track whether the coach has switched to manual edit mode
  const [editing, setEditing] = useState(false);
  // Track if the coach has manually edited the instructions text
  const [userEdited, setUserEdited] = useState(false);

  // Compute the current recommendation from form context
  const recommendation = useMemo<Recommendation | null>(() => {
    if (!category) return null;
    return recommendRecordingSetup({
      category,
      subcategoryName: subcategoryName || null,
      unit: unit || null,
      name: name || null,
    } as ChallengeContext);
  }, [category, subcategoryName, unit, name]);

  // When the recommendation changes AND the coach hasn't manually edited or
  // explicitly customized, auto-apply the new recommendation.
  useEffect(() => {
    if (!recommendation) return;
    if (userEdited || editing) return; // don't overwrite manual edits
    // Auto-apply
    setSetupTemplateKey(recommendation.templateKey);
    setRecordingInstructions(recommendation.template.instructions);
    if (!verificationMode) {
      setVerificationMode(recommendation.template.recommendedVerificationMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendation?.templateKey]);

  // If no category yet, show a placeholder
  if (!category) {
    return (
      <div className="recording-section">
        <h3 className="form-section-title">📹 Recording &amp; Verification</h3>
        <p className="recording-section-pending">
          Pick a category and subcategory above. We'll suggest the best phone
          recording setup for this challenge automatically.
        </p>
      </div>
    );
  }

  const currentTemplate = setupTemplateKey ? RECORDING_TEMPLATES[setupTemplateKey] : null;

  const handleAcceptRecommendation = () => {
    setAccepted(true);
    setEditing(false);
    setUserEdited(false);
    if (recommendation) {
      setSetupTemplateKey(recommendation.templateKey);
      setRecordingInstructions(recommendation.template.instructions);
      setVerificationMode(recommendation.template.recommendedVerificationMode);
    }
  };

  const handleCustomize = () => {
    setAccepted(true);
    setEditing(true);
  };

  const handleTemplateChange = (key: string) => {
    setSetupTemplateKey(key);
    const tmpl = RECORDING_TEMPLATES[key];
    if (tmpl) {
      setRecordingInstructions(tmpl.instructions);
      setVerificationMode(tmpl.recommendedVerificationMode);
      setUserEdited(false);
    }
  };

  const handleInstructionsChange = (text: string) => {
    setRecordingInstructions(text);
    setUserEdited(true);
  };

  return (
    <div className="recording-section">
      <h3 className="form-section-title">📹 Recording &amp; Verification</h3>
      <p className="recording-section-hint">
        How should players set up their phone to record this challenge? We use
        this to guide them and to feed AI verification.
      </p>

      {/* Show the recommendation card when not yet accepted */}
      {!accepted && recommendation && (
        <div className={`recording-rec-card recording-rec-${recommendation.confidence}`}>
          <div className="recording-rec-header">
            <span className="recording-rec-icon">{recommendation.template.icon}</span>
            <div className="recording-rec-title-block">
              <div className="recording-rec-eyebrow">
                ✨ AI Recommendation ({recommendation.confidence} confidence)
              </div>
              <div className="recording-rec-title">{recommendation.template.label}</div>
              <div className="recording-rec-reasoning">{recommendation.reasoning}</div>
            </div>
          </div>

          <div className="recording-rec-instructions">
            {recommendation.template.instructions.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          <div className="recording-rec-actions">
            <button
              type="button"
              className="btn-primary btn-inline"
              onClick={handleAcceptRecommendation}
            >
              ✓ Looks good — use this
            </button>
            <button
              type="button"
              className="btn-cancel"
              onClick={handleCustomize}
            >
              ✏️ Customize
            </button>
          </div>
        </div>
      )}

      {/* When accepted (or manually started), show the editable fields */}
      {(accepted || (recommendation === null && category)) && (
        <>
          {recommendation === null && !accepted && (
            <div className="recording-no-rec-banner">
              No automatic recommendation for this combination. Pick a template below or write custom instructions.
            </div>
          )}

          <div>
            <label htmlFor="setupTemplate" className="form-label">
              Recording template
            </label>
            <select
              id="setupTemplate"
              className="form-input"
              value={setupTemplateKey}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              <option value="">Select a template...</option>
              {Object.values(RECORDING_TEMPLATES).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
            {currentTemplate && (
              <p className="form-hint">{currentTemplate.shortDescription}</p>
            )}
          </div>

          <div>
            <label htmlFor="recordingInstructions" className="form-label">
              Instructions for the player
              {userEdited && <span className="recording-edited-pill">✏️ edited</span>}
            </label>
            <textarea
              id="recordingInstructions"
              className="form-input form-textarea"
              value={recordingInstructions}
              onChange={(e) => handleInstructionsChange(e.target.value)}
              rows={8}
              placeholder="Describe how the player should set up their phone, what should be in frame, audio requirements, etc."
              maxLength={2000}
            />
            <p className="form-hint">
              These instructions show to players right before they record. Be
              specific — bad recordings hurt verification accuracy.
            </p>
          </div>

          <div>
            <label htmlFor="verificationMode" className="form-label">
              Verification mode
            </label>
            <select
              id="verificationMode"
              className="form-input"
              value={verificationMode}
              onChange={(e) => setVerificationMode(e.target.value as any)}
            >
              <option value="">Select...</option>
              <option value="coach_only">
                👤 Coach manual review only
              </option>
              <option value="ai_only">
                🤖 AI verification only
              </option>
              <option value="ai_and_coach">
                🤖 + 👤 AI suggests, coach confirms (recommended)
              </option>
            </select>
            <p className="form-hint">
              Choose how this challenge gets verified. &ldquo;AI suggests, coach
              confirms&rdquo; is the safest default: AI counts reps automatically,
              the coach gets a one-click approve.
            </p>
          </div>

          {/* Slice 8.6 — AI verification strategy. Tells the AI route HOW to
              analyze submissions for this challenge. Auto-suggested from the
              unit field (e.g. "seconds" → time_hold) when not yet set. */}
          <div>
            <label htmlFor="aiVerificationStrategy" className="form-label">
              AI verification strategy
            </label>
            <select
              id="aiVerificationStrategy"
              className="form-input"
              value={aiVerificationStrategy}
              onChange={(e) =>
                setAiVerificationStrategy(e.target.value as AIStrategyValue)
              }
            >
              <option value="">Select...</option>
              <option value="rep_count">
                🔢 Count repetitions (push-ups, juggling, throws, etc.)
              </option>
              <option value="time_hold">
                ⏱️ Verify timed activity (plank holds, sprints, dribbles)
              </option>
              <option value="none">
                — Not AI-verifiable (manual review only)
              </option>
              <option value="photo_completion" disabled>
                📷 Photo completion (coming soon)
              </option>
              <option value="audio_match" disabled>
                🎤 Audio / verse match (coming soon)
              </option>
            </select>
            <p className="form-hint">
              Pick how AI should analyze submissions. Rep counting works for
              anything where you count completed reps. Time-hold works for
              challenges measured in seconds or minutes. Choose &ldquo;Not
              AI-verifiable&rdquo; for things AI can&apos;t reliably check
              (books read, miles run, hours volunteered).
            </p>
          </div>
        </>
      )}
    </div>
  );
}

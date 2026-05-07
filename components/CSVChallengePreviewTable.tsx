"use client";

import { RECORDING_TEMPLATES } from "@/lib/recordingRecommender";

export type ParsedChallengeRow = {
  rowNumber: number;
  // Raw values from CSV
  name: string;
  description: string;
  category: string;
  subcategory: string;
  subSubcategory: string;
  unit: string;
  defaultRepTarget: string;
  difficulty: string;
  // Recording fields (added in 4.5.3b)
  setupTemplate: string;       // template key, blank = will auto-recommend
  recordingInstructions: string;
  verificationMode: string;
  // Recommendation pre-computed during parse (so the preview can show it)
  recommendedSetupTemplate?: string;     // what we'll auto-fill if setupTemplate is blank
  recommendedConfidence?: "high" | "medium" | "low";
  // Parsed/validated values
  isValid: boolean;
  errors: string[];
  warnings: string[];
  // Whether the user wants to include this row in the import
  include: boolean;
  // If a new subcategory will be auto-created, mark it
  willCreateSubcategory?: boolean;
  willCreateSubSubcategory?: boolean;
};

interface CSVChallengePreviewTableProps {
  rows: ParsedChallengeRow[];
  onToggleRow: (rowNumber: number, include: boolean) => void;
  onToggleAll: (include: boolean) => void;
}

const verificationModeLabel = (mode: string): string => {
  switch (mode) {
    case "ai_only": return "🤖 AI only";
    case "coach_only": return "👤 Coach only";
    case "ai_and_coach": return "🤖+👤 AI + Coach";
    default: return "—";
  }
};

export default function CSVChallengePreviewTable({
  rows,
  onToggleRow,
  onToggleAll,
}: CSVChallengePreviewTableProps) {
  const validCount = rows.filter((r) => r.isValid && r.include).length;
  const errorCount = rows.filter((r) => !r.isValid).length;
  const willCreateCount = rows.filter(
    (r) => (r.willCreateSubcategory || r.willCreateSubSubcategory) && r.include
  ).length;
  const autoRecommendCount = rows.filter(
    (r) => !r.setupTemplate && r.recommendedSetupTemplate && r.include
  ).length;
  const allValidIncluded = rows
    .filter((r) => r.isValid)
    .every((r) => r.include);

  return (
    <div className="csv-preview">
      <div className="csv-preview-summary">
        <div className="csv-preview-stat">
          <span className="csv-preview-stat-num csv-preview-stat-good">{validCount}</span>
          <span className="csv-preview-stat-label">will import</span>
        </div>
        {errorCount > 0 && (
          <div className="csv-preview-stat">
            <span className="csv-preview-stat-num csv-preview-stat-error">{errorCount}</span>
            <span className="csv-preview-stat-label">with errors (skipped)</span>
          </div>
        )}
        {willCreateCount > 0 && (
          <div className="csv-preview-stat">
            <span className="csv-preview-stat-num csv-preview-stat-warning">{willCreateCount}</span>
            <span className="csv-preview-stat-label">new subcategories</span>
          </div>
        )}
        {autoRecommendCount > 0 && (
          <div className="csv-preview-stat">
            <span className="csv-preview-stat-num csv-preview-stat-info">{autoRecommendCount}</span>
            <span className="csv-preview-stat-label">auto-recommended setup</span>
          </div>
        )}
        <div className="csv-preview-toggle-all">
          <label>
            <input
              type="checkbox"
              checked={allValidIncluded}
              onChange={(e) => onToggleAll(e.target.checked)}
            />
            <span>Include all valid rows</span>
          </label>
        </div>
      </div>

      <div className="csv-preview-table-wrap">
        <table className="csv-preview-table">
          <thead>
            <tr>
              <th style={{ width: "40px" }}>#</th>
              <th style={{ width: "50px" }}>Use</th>
              <th>Name</th>
              <th>Category</th>
              <th>Subcategory</th>
              <th>Sub-subcategory</th>
              <th>Unit</th>
              <th>Target</th>
              <th>Difficulty</th>
              <th>Recording</th>
              <th>Verification</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // Effective setup template = user's choice OR auto-recommended
              const effectiveTemplateKey = row.setupTemplate || row.recommendedSetupTemplate || "";
              const effectiveTemplate = effectiveTemplateKey ? RECORDING_TEMPLATES[effectiveTemplateKey] : null;
              const isAutoRecommended = !row.setupTemplate && row.recommendedSetupTemplate;
              // Effective verification mode
              const effectiveVerification = row.verificationMode
                || (effectiveTemplate ? effectiveTemplate.recommendedVerificationMode : "coach_only");
              const isVerificationDefault = !row.verificationMode;

              return (
                <tr
                  key={row.rowNumber}
                  className={
                    !row.isValid
                      ? "csv-preview-row-error"
                      : !row.include
                        ? "csv-preview-row-excluded"
                        : ""
                  }
                >
                  <td className="csv-preview-row-num">{row.rowNumber}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.include && row.isValid}
                      disabled={!row.isValid}
                      onChange={(e) => onToggleRow(row.rowNumber, e.target.checked)}
                    />
                  </td>
                  <td className="csv-preview-cell-name">{row.name || <em>missing</em>}</td>
                  <td>{row.category || <em>missing</em>}</td>
                  <td>
                    {row.subcategory ? (
                      <>
                        {row.subcategory}
                        {row.willCreateSubcategory && (
                          <span className="csv-preview-new-sub-pill" title="Will be created as a new private subcategory">
                            NEW
                          </span>
                        )}
                      </>
                    ) : (
                      <em>—</em>
                    )}
                  </td>
                  <td>
                    {row.subSubcategory ? (
                      <>
                        {row.subSubcategory}
                        {row.willCreateSubSubcategory && (
                          <span className="csv-preview-new-sub-pill" title="Will be created as a new private sub-subcategory">
                            NEW
                          </span>
                        )}
                      </>
                    ) : (
                      <em>—</em>
                    )}
                  </td>
                  <td>{row.unit || <em>missing</em>}</td>
                  <td>{row.defaultRepTarget || <em>—</em>}</td>
                  <td>{row.difficulty || <em>—</em>}</td>
                  <td>
                    {effectiveTemplate ? (
                      <span
                        className={`csv-preview-template ${isAutoRecommended ? "csv-preview-template-auto" : ""}`}
                        title={isAutoRecommended ? `Auto-recommended (${row.recommendedConfidence} confidence): ${effectiveTemplate.shortDescription}` : effectiveTemplate.shortDescription}
                      >
                        <span className="csv-preview-template-icon">{effectiveTemplate.icon}</span>
                        <span className="csv-preview-template-name">
                          {effectiveTemplate.label}
                          {isAutoRecommended && <span className="csv-preview-template-auto-pill">auto</span>}
                        </span>
                      </span>
                    ) : (
                      <em>—</em>
                    )}
                  </td>
                  <td>
                    <span className={isVerificationDefault ? "csv-preview-verification-default" : ""}>
                      {verificationModeLabel(effectiveVerification)}
                      {isVerificationDefault && <span className="csv-preview-template-auto-pill">default</span>}
                    </span>
                  </td>
                  <td>
                    {row.isValid ? (
                      <span className="csv-preview-status-good">✓ Ready</span>
                    ) : (
                      <div className="csv-preview-errors">
                        {row.errors.map((err, i) => (
                          <span key={i} className="csv-preview-error-msg">⚠ {err}</span>
                        ))}
                      </div>
                    )}
                    {row.warnings.length > 0 && (
                      <div className="csv-preview-warnings">
                        {row.warnings.map((w, i) => (
                          <span key={i} className="csv-preview-warning-msg">ℹ {w}</span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

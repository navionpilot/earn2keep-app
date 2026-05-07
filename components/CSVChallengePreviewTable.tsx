"use client";

export type ParsedChallengeRow = {
  rowNumber: number;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  subSubcategory: string;
  unit: string;
  defaultRepTarget: string;
  difficulty: string;
  setupTemplate: string;
  recordingInstructions: string;
  verificationMode: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  include: boolean;
  willCreateSubcategory?: boolean;
  willCreateSubSubcategory?: boolean;
};

interface CSVChallengePreviewTableProps {
  rows: ParsedChallengeRow[];
  onToggleRow: (rowNumber: number, include: boolean) => void;
  onToggleAll: (include: boolean) => void;
}

export default function CSVChallengePreviewTable({
  rows,
  onToggleRow,
  onToggleAll,
}: CSVChallengePreviewTableProps) {
  const validCount = rows.filter((r) => r.isValid && r.include).length;
  const errorCount = rows.filter((r) => !r.isValid).length;
  const willCreateSubCount = rows.filter((r) => r.willCreateSubcategory && r.include).length;
  const willCreateSubSubCount = rows.filter((r) => r.willCreateSubSubcategory && r.include).length;
  const allValidIncluded = rows.filter((r) => r.isValid).every((r) => r.include);

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
        {willCreateSubCount > 0 && (
          <div className="csv-preview-stat">
            <span className="csv-preview-stat-num csv-preview-stat-warning">{willCreateSubCount}</span>
            <span className="csv-preview-stat-label">new subcategories</span>
          </div>
        )}
        {willCreateSubSubCount > 0 && (
          <div className="csv-preview-stat">
            <span className="csv-preview-stat-num csv-preview-stat-warning">{willCreateSubSubCount}</span>
            <span className="csv-preview-stat-label">new sub-subcategories</span>
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
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowNumber}
                className={!row.isValid ? "csv-preview-row-error" : !row.include ? "csv-preview-row-excluded" : ""}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

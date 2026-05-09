"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

import AppShell from "@/components/AppShell";
type ParsedRow = {
  raw: Record<string, string>;
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  dateOfBirth: string;
  parentEmail: string;
  parentPhone: string;
  hasMinimumData: boolean;
};

type FieldMapping = {
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  dateOfBirth: string;
  parentEmail: string;
  parentPhone: string;
};

const SOURCE_PRESETS: Record<
  string,
  { label: string; mapping: FieldMapping; matchKeywords: string[] }
> = {
  TeamSnap: {
    label: "TeamSnap",
    matchKeywords: ["teamsnap", "team snap"],
    mapping: {
      firstName: "First Name",
      lastName: "Last Name",
      jerseyNumber: "Jersey #",
      dateOfBirth: "Birthday",
      parentEmail: "Email",
      parentPhone: "Phone",
    },
  },
  GameChanger: {
    label: "GameChanger",
    matchKeywords: ["gamechanger", "game changer"],
    mapping: {
      firstName: "First Name",
      lastName: "Last Name",
      jerseyNumber: "Jersey Number",
      dateOfBirth: "Birth Date",
      parentEmail: "Parent Email",
      parentPhone: "Parent Phone",
    },
  },
  SportsEngine: {
    label: "SportsEngine",
    matchKeywords: ["sportsengine", "sports engine", "ngin"],
    mapping: {
      firstName: "Member First Name",
      lastName: "Member Last Name",
      jerseyNumber: "Roster Number",
      dateOfBirth: "Member Date of Birth",
      parentEmail: "Primary Email",
      parentPhone: "Primary Phone",
    },
  },
};

// Common variations of column names — we'll try to auto-match these
const FIELD_HEURISTICS: Record<keyof FieldMapping, string[]> = {
  firstName: ["first name", "firstname", "first", "given name", "fname"],
  lastName: ["last name", "lastname", "last", "surname", "family name", "lname"],
  jerseyNumber: ["jersey", "jersey #", "jersey number", "number", "#", "uniform", "roster number", "roster #"],
  dateOfBirth: ["dob", "birthday", "birth date", "date of birth", "born"],
  parentEmail: ["parent email", "guardian email", "email", "primary email", "contact email"],
  parentPhone: ["parent phone", "guardian phone", "phone", "primary phone", "contact phone", "mobile"],
};

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Simple CSV parser handling quoted values with commas
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] || "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

function autoDetectSource(headers: string[], rawText: string): string | null {
  const lowerHeaders = headers.map((h) => h.toLowerCase());
  const firstLine = rawText.split(/\r?\n/)[0]?.toLowerCase() || "";

  for (const [source, preset] of Object.entries(SOURCE_PRESETS)) {
    // Check for direct keyword matches in headers or first line
    if (preset.matchKeywords.some((kw) => firstLine.includes(kw))) {
      return source;
    }
    // Check for unique field combinations
    const expectedFields = Object.values(preset.mapping).map((v) => v.toLowerCase());
    const matchCount = expectedFields.filter((f) =>
      lowerHeaders.some((h) => h === f.toLowerCase())
    ).length;
    if (matchCount >= 4) {
      return source;
    }
  }
  return null;
}

function autoMapFields(headers: string[]): FieldMapping {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  const mapping: FieldMapping = {
    firstName: "",
    lastName: "",
    jerseyNumber: "",
    dateOfBirth: "",
    parentEmail: "",
    parentPhone: "",
  };

  for (const field of Object.keys(FIELD_HEURISTICS) as Array<keyof FieldMapping>) {
    const candidates = FIELD_HEURISTICS[field];
    for (const candidate of candidates) {
      const idx = lowerHeaders.indexOf(candidate);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }

  return mapping;
}

function normalizeDateOfBirth(value: string): string {
  if (!value || !value.trim()) return "";
  const trimmed = value.trim();
  // Try YYYY-MM-DD first (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Try MM/DD/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Try parsing as Date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return "";
}

export default function ImportPlayersPage() {
  const params = useParams();
  const teamId = params.id as string;
  const router = useRouter();

  const [teamName, setTeamName] = useState("");
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [detectedSource, setDetectedSource] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("Custom");
  const [mapping, setMapping] = useState<FieldMapping>({
    firstName: "",
    lastName: "",
    jerseyNumber: "",
    dateOfBirth: "",
    parentEmail: "",
    parentPhone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchTeam = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .single();

      if (fetchError || !data) {
        setError("Team not found.");
        setFetching(false);
        return;
      }
      setTeamName(data.name);
      setFetching(false);
    };
    fetchTeam();
  }, [teamId]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a CSV file (.csv extension).");
      return;
    }

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0 || rows.length === 0) {
        setError("This CSV file appears to be empty or invalid.");
        return;
      }

      const detected = autoDetectSource(headers, text);
      const autoMapping = detected
        ? mapPresetToActualHeaders(SOURCE_PRESETS[detected].mapping, headers)
        : autoMapFields(headers);

      setCsvHeaders(headers);
      setCsvRows(rows);
      setDetectedSource(detected);
      setSelectedSource(detected || "Custom");
      setMapping(autoMapping);
      setStep("preview");
    } catch (err) {
      setError("Failed to read CSV file. Please check the format and try again.");
    }
  };

  // Match preset field names to actual headers in the CSV (case-insensitive)
  function mapPresetToActualHeaders(
    preset: FieldMapping,
    actualHeaders: string[]
  ): FieldMapping {
    const result: FieldMapping = { ...preset };
    const lowerActual = actualHeaders.map((h) => h.toLowerCase().trim());

    (Object.keys(preset) as Array<keyof FieldMapping>).forEach((key) => {
      const presetValue = preset[key].toLowerCase();
      const idx = lowerActual.indexOf(presetValue);
      result[key] = idx !== -1 ? actualHeaders[idx] : "";
    });

    return result;
  }

  const parsedRows: ParsedRow[] = csvRows.map((raw) => {
    const firstName = (raw[mapping.firstName] || "").trim();
    const lastName = (raw[mapping.lastName] || "").trim();
    return {
      raw,
      firstName,
      lastName,
      jerseyNumber: (raw[mapping.jerseyNumber] || "").trim(),
      dateOfBirth: normalizeDateOfBirth(raw[mapping.dateOfBirth] || ""),
      parentEmail: (raw[mapping.parentEmail] || "").trim(),
      parentPhone: (raw[mapping.parentPhone] || "").trim(),
      hasMinimumData: firstName.length > 0,
    };
  });

  const validRows = parsedRows.filter((r) => r.hasMinimumData);
  const invalidRows = parsedRows.filter((r) => !r.hasMinimumData);

  const handleSourceChange = (source: string) => {
    setSelectedSource(source);
    if (source !== "Custom" && SOURCE_PRESETS[source]) {
      setMapping(mapPresetToActualHeaders(SOURCE_PRESETS[source].mapping, csvHeaders));
    }
  };

  const handleMappingChange = (field: keyof FieldMapping, value: string) => {
    setMapping({ ...mapping, [field]: value });
    if (selectedSource !== "Custom") {
      setSelectedSource("Custom");
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) {
      setError("No valid players/participants to import. Please check your column mappings.");
      return;
    }

    setStep("importing");
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in.");
      setStep("preview");
      return;
    }

    const sourceLabel = selectedSource === "Custom" ? "CSV Upload" : selectedSource;

    const insertRows = validRows.map((r) => ({
      team_id: teamId,
      owner_id: user.id,
      first_name: r.firstName,
      last_name: r.lastName || null,
      jersey_number: r.jerseyNumber || null,
      date_of_birth: r.dateOfBirth || null,
      parent_email: r.parentEmail || null,
      parent_phone: r.parentPhone || null,
      imported_from: sourceLabel,
    }));

    const { error: insertError } = await supabase.from("players").insert(insertRows);

    if (insertError) {
      setError(insertError.message);
      setStep("preview");
      return;
    }

    setImportResult({
      imported: validRows.length,
      skipped: invalidRows.length,
      errors: [],
    });
    setStep("done");
  };

  if (fetching) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <AppShell active="participants" userDisplayName="">
      <main className="form-page-main form-page-main-wide">
        <div className="form-card">
          {step === "upload" && (
            <>
              <div style={{ textAlign: "center" }}>
                <span className="auth-eyebrow">★ BULK IMPORT ★</span>
              </div>
              <h1 className="form-title">Upload Roster CSV</h1>
              <p className="form-subtitle">
                Importing players/participants to <strong>{teamName}</strong>. Works with exports
                from TeamSnap, GameChanger, SportsEngine, or any spreadsheet.
              </p>

              <div className="import-supported">
                <div className="import-supported-label">Auto-detected formats:</div>
                <div className="import-supported-list">
                  <span className="import-format-pill">TeamSnap</span>
                  <span className="import-format-pill">GameChanger</span>
                  <span className="import-format-pill">SportsEngine</span>
                  <span className="import-format-pill">Excel / Google Sheets</span>
                  <span className="import-format-pill">Any CSV</span>
                </div>
              </div>

              <div className="import-dropzone">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  id="csv-upload"
                  onChange={handleFile}
                  className="import-file-input"
                />
                <label htmlFor="csv-upload" className="import-file-label">
                  <div className="import-icon">📋</div>
                  <div className="import-dropzone-title">Click to choose a CSV file</div>
                  <div className="import-dropzone-text">
                    Or drag and drop one here
                  </div>
                </label>
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <div className="import-help">
                <div className="import-help-title">How to export your roster:</div>
                <ul className="import-help-list">
                  <li><strong>TeamSnap:</strong> Open your team → Roster → ⋮ menu → Export Roster (CSV)</li>
                  <li><strong>GameChanger:</strong> Team Settings → Roster → Export to CSV</li>
                  <li><strong>SportsEngine:</strong> Roster page → Tools → Download Roster</li>
                  <li><strong>Excel / Google Sheets:</strong> File → Download → CSV</li>
                </ul>
              </div>
            </>
          )}

          {step === "preview" && (
            <>
              <h1 className="form-title">Preview &amp; Confirm</h1>

              {detectedSource && selectedSource === detectedSource ? (
                <div className="alert alert-success">
                  ✓ Detected <strong>{SOURCE_PRESETS[detectedSource].label}</strong> format. Columns auto-mapped.
                </div>
              ) : (
                <p className="form-subtitle">
                  Verify the columns are mapped correctly, then confirm.
                </p>
              )}

              <div className="import-source-row">
                <label className="form-label">Source format:</label>
                <select
                  className="form-input"
                  value={selectedSource}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  style={{ maxWidth: "260px" }}
                >
                  <option value="Custom">Custom mapping</option>
                  {Object.keys(SOURCE_PRESETS).map((src) => (
                    <option key={src} value={src}>{SOURCE_PRESETS[src].label}</option>
                  ))}
                </select>
              </div>

              <div className="import-mapping">
                <div className="import-mapping-title">Column mapping</div>
                <div className="import-mapping-grid">
                  {(Object.keys(mapping) as Array<keyof FieldMapping>).map((field) => (
                    <div key={field}>
                      <label className="form-label">
                        {field === "firstName" && "First Name *"}
                        {field === "lastName" && "Last Name"}
                        {field === "jerseyNumber" && "Jersey #"}
                        {field === "dateOfBirth" && "Date of Birth"}
                        {field === "parentEmail" && "Parent Email"}
                        {field === "parentPhone" && "Parent Phone"}
                      </label>
                      <select
                        className="form-input"
                        value={mapping[field]}
                        onChange={(e) => handleMappingChange(field, e.target.value)}
                      >
                        <option value="">— Skip this field —</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="import-summary">
                <div className="import-summary-stat">
                  <div className="import-summary-num">{validRows.length}</div>
                  <div className="import-summary-label">Will be imported</div>
                </div>
                {invalidRows.length > 0 && (
                  <div className="import-summary-stat import-summary-warning">
                    <div className="import-summary-num">{invalidRows.length}</div>
                    <div className="import-summary-label">Skipped (no first name)</div>
                  </div>
                )}
              </div>

              <div className="import-mapping-title" style={{ marginTop: 28 }}>Preview (first 5 rows)</div>
              <div className="roster-table-wrap">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>First</th>
                      <th>Last</th>
                      <th>Jersey</th>
                      <th>DOB</th>
                      <th>Parent Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} style={{ opacity: row.hasMinimumData ? 1 : 0.4 }}>
                        <td className="roster-name">{row.firstName || <span style={{color: "#C62828"}}>(missing)</span>}</td>
                        <td>{row.lastName || "—"}</td>
                        <td>{row.jerseyNumber || "—"}</td>
                        <td className="roster-cell-muted">{row.dateOfBirth || "—"}</td>
                        <td className="roster-cell-muted">{row.parentEmail || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <div className="form-actions">
                <button type="button" onClick={() => setStep("upload")} className="btn-cancel">
                  ← Choose Different File
                </button>
                <button
                  type="button"
                  className="btn-primary btn-inline"
                  onClick={handleImport}
                  disabled={validRows.length === 0}
                >
                  Import {validRows.length} {validRows.length === 1 ? "Player/Participant" : "Players/Participants"} →
                </button>
              </div>
            </>
          )}

          {step === "importing" && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
              <h2 className="form-title">Importing players/participants...</h2>
              <p className="form-subtitle">This will only take a moment.</p>
            </div>
          )}

          {step === "done" && importResult && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "8px" }}>🎉</div>
              <h2 className="form-title">Import Complete!</h2>
              <p className="form-subtitle">
                Successfully imported <strong>{importResult.imported}</strong> {importResult.imported === 1 ? "player/participant" : "players/participants"} to your roster.
                {importResult.skipped > 0 && (
                  <> {importResult.skipped} {importResult.skipped === 1 ? "row was" : "rows were"} skipped because of missing first name.</>
                )}
              </p>
              <Link href={`/teams/${teamId}`} className="btn-primary-link">
                View Roster →
              </Link>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

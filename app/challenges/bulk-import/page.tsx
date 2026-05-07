"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import LogoutButton from "@/components/LogoutButton";
import CSVChallengePreviewTable, { ParsedChallengeRow } from "@/components/CSVChallengePreviewTable";

const VALID_CATEGORIES = ["Sports", "Faith", "Fitness", "Academic", "Scouts", "Service"];
const VALID_DIFFICULTIES = ["Easy", "Medium", "Hard"];
const SUBCATEGORY_REQUIRED = new Set(["Sports"]);

const CSV_TEMPLATE_CONTENT = `name,description,category,subcategory,unit,default_rep_target,difficulty
Push-Ups,Total push-ups completed (proper form),Fitness,Calisthenics,push-ups,50,Medium
Mile Run,Run one full mile. Track time or just completion.,Fitness,Cardio,miles,1,Hard
Bible Verses Memorized,Number of full Bible verses memorized and recited correctly,Faith,Bible Memorization,verses,10,Medium
Books Read,Total books read cover-to-cover during the event,Academic,Reading,books,3,Easy
Free Throws Made,Free throws successfully made out of 25 attempts,Sports,Basketball,shots,15,Medium
Soccer Juggles,Consecutive juggles with one foot,Sports,Soccer,juggles,30,Medium
Volunteer Hours,Hours volunteered at a community organization,Service,Volunteer Hours,hours,5,Easy`;

export default function BulkImportPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <BulkImportInner />
    </Suspense>
  );
}

function LoadingFallback() {
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

function BulkImportInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [organizationId, setOrganizationId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const [hasTeams, setHasTeams] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [hasEvent, setHasEvent] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [orgSubcategories, setOrgSubcategories] = useState<{ id: string; parent_category: string; name: string; is_public: boolean }[]>([]);

  const [parsedRows, setParsedRows] = useState<ParsedChallengeRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState<{ inserted: number; subsCreated: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFetching(false);
        return;
      }

      // Display name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (profile?.full_name) setUserDisplayName(profile.full_name);

      // Onboarding sidebar counts
      const [{ count: teamCount }, { count: playerCount }, { count: eventCount }] = await Promise.all([
        supabase.from("teams").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("players").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("events").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
      ]);
      setHasTeams((teamCount || 0) > 0);
      setHasPlayers((playerCount || 0) > 0);
      setHasEvent((eventCount || 0) > 0);

      // Resolve organization context
      let foundOrgId: string | null = null;
      let foundOrgName: string = "";
      if (returnTo) {
        const eventId = returnTo.split("/")[0];
        if (eventId) {
          const { data: event } = await supabase
            .from("events")
            .select("organization_id, organizations(name)")
            .eq("id", eventId)
            .single();
          if (event?.organization_id) {
            foundOrgId = event.organization_id;
            foundOrgName = (event as any).organizations?.name || "";
          }
        }
      }
      if (!foundOrgId) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1);
        if (orgs && orgs.length > 0) {
          foundOrgId = orgs[0].id;
          foundOrgName = orgs[0].name;
        }
      }

      if (foundOrgId) {
        setOrganizationId(foundOrgId);
        setOrgName(foundOrgName);

        // Fetch subcategories visible to this org (public + own org's private)
        const { data: subs } = await supabase
          .from("challenge_subcategories")
          .select("id, parent_category, name, is_public")
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });
        setOrgSubcategories((subs as any) || []);
      }

      setFetching(false);
    };
    init();
  }, [returnTo]);

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "earn2keep-challenges-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseCSVRow = (line: string): string[] => {
    // Simple CSV parser handling quoted fields
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += c;
      }
    }
    result.push(current);
    return result.map((s) => s.trim());
  };

  const handleFileSelected = (file: File) => {
    setParseError(null);
    setImportDone(null);
    setImportError(null);
    setParsedRows([]);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setParseError("Could not read the file.");
        return;
      }

      // Parse lines (handle Windows \r\n + Unix \n)
      const lines = text
        .split(/\r?\n/)
        .map((l) => l)
        .filter((l) => l.trim().length > 0);

      if (lines.length < 2) {
        setParseError("CSV must have a header row plus at least one data row.");
        return;
      }

      const headerCells = parseCSVRow(lines[0]).map((h) => h.toLowerCase().replace(/[\s_]+/g, ""));
      // Expected: name, description, category, subcategory, unit, default_rep_target, difficulty
      const expectedHeaders = ["name", "description", "category", "subcategory", "unit", "defaultreptarget", "difficulty"];
      const missingHeaders = expectedHeaders.filter((h) => !headerCells.includes(h));
      if (missingHeaders.length > 0) {
        setParseError(`Missing required columns: ${missingHeaders.join(", ")}. Download the template to see the correct format.`);
        return;
      }

      const colIndex: Record<string, number> = {};
      headerCells.forEach((h, idx) => { colIndex[h] = idx; });

      // Build a fast lookup: "Sports::Soccer" → existing subcategory
      const subLookup: Record<string, { id: string; is_public: boolean }> = {};
      orgSubcategories.forEach((s) => {
        const key = `${s.parent_category}::${s.name.toLowerCase()}`;
        subLookup[key] = { id: s.id, is_public: s.is_public };
      });

      // Track which new subcategories will be created (so we don't double-count duplicates within the CSV)
      const newSubsInCSV = new Set<string>();

      const parsed: ParsedChallengeRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVRow(lines[i]);
        const errors: string[] = [];
        const warnings: string[] = [];

        const name = (cells[colIndex.name] || "").trim();
        const description = (cells[colIndex.description] || "").trim();
        const categoryRaw = (cells[colIndex.category] || "").trim();
        const subcategory = (cells[colIndex.subcategory] || "").trim();
        const unit = (cells[colIndex.unit] || "").trim();
        const defaultRepTargetStr = (cells[colIndex.defaultreptarget] || "").trim();
        const difficultyRaw = (cells[colIndex.difficulty] || "").trim();

        // Normalize category (case-insensitive match against valid list)
        const category = VALID_CATEGORIES.find((c) => c.toLowerCase() === categoryRaw.toLowerCase()) || "";
        const difficulty = VALID_DIFFICULTIES.find((d) => d.toLowerCase() === difficultyRaw.toLowerCase()) || (difficultyRaw === "" ? "Medium" : "");

        // Validation
        if (!name) errors.push("Name is required");
        else if (name.length > 120) errors.push("Name too long (max 120 chars)");
        if (!categoryRaw) errors.push("Category is required");
        else if (!category) errors.push(`Category "${categoryRaw}" is not valid (must be one of: ${VALID_CATEGORIES.join(", ")})`);
        if (!unit) errors.push("Unit is required");
        else if (unit.length > 30) errors.push("Unit too long (max 30 chars)");
        if (difficultyRaw && !difficulty) errors.push(`Difficulty "${difficultyRaw}" is not valid (must be Easy, Medium, or Hard, or blank)`);

        // Validate rep target
        if (defaultRepTargetStr) {
          const n = parseInt(defaultRepTargetStr);
          if (isNaN(n) || n < 1) errors.push(`Default rep target "${defaultRepTargetStr}" must be a positive whole number`);
        }

        // Subcategory required for Sports
        let willCreateSubcategory = false;
        if (category === "Sports" && !subcategory) {
          errors.push("Subcategory (sport) is required for Sports challenges");
        }
        if (category && subcategory) {
          const lookupKey = `${category}::${subcategory.toLowerCase()}`;
          if (!subLookup[lookupKey] && !newSubsInCSV.has(lookupKey)) {
            // This will be created as a private subcategory
            newSubsInCSV.add(lookupKey);
            willCreateSubcategory = true;
            warnings.push(`Will create "${subcategory}" as a new private ${category} subcategory`);
          }
        }

        const isValid = errors.length === 0;
        parsed.push({
          rowNumber: i,
          name,
          description,
          category,
          subcategory,
          unit,
          defaultRepTarget: defaultRepTargetStr,
          difficulty,
          isValid,
          errors,
          warnings,
          include: isValid,
          willCreateSubcategory,
        });
      }

      setParsedRows(parsed);
    };

    reader.onerror = () => {
      setParseError("Could not read the file.");
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleToggleRow = (rowNumber: number, include: boolean) => {
    setParsedRows((rows) =>
      rows.map((r) => (r.rowNumber === rowNumber ? { ...r, include } : r))
    );
  };

  const handleToggleAll = (include: boolean) => {
    setParsedRows((rows) =>
      rows.map((r) => (r.isValid ? { ...r, include } : r))
    );
  };

  const handleImport = async () => {
    setImportError(null);
    const rowsToImport = parsedRows.filter((r) => r.isValid && r.include);
    if (rowsToImport.length === 0) {
      setImportError("No valid rows to import. Check the preview above.");
      return;
    }

    setImporting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setImportError("Not logged in.");
      setImporting(false);
      return;
    }

    // Step 1: collect every (category, subcategory) pair we need that doesn't exist yet
    // We'll create them as private to the org first, then map their IDs.
    const existingByKey: Record<string, string> = {};
    orgSubcategories.forEach((s) => {
      existingByKey[`${s.parent_category}::${s.name.toLowerCase()}`] = s.id;
    });

    const newSubsToCreate: { parent_category: string; name: string; key: string }[] = [];
    const seenKeys = new Set<string>();
    for (const row of rowsToImport) {
      if (!row.subcategory) continue;
      const key = `${row.category}::${row.subcategory.toLowerCase()}`;
      if (existingByKey[key]) continue;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      newSubsToCreate.push({ parent_category: row.category, name: row.subcategory, key });
    }

    // Insert new subcategories
    let subsCreated = 0;
    if (newSubsToCreate.length > 0) {
      const subRows = newSubsToCreate.map((s) => ({
        parent_category: s.parent_category,
        name: s.name,
        is_public: false,
        organization_id: organizationId,
        created_by: user.id,
        display_order: 500,
      }));
      const { data: insertedSubs, error: subErr } = await supabase
        .from("challenge_subcategories")
        .insert(subRows)
        .select("id, parent_category, name");
      if (subErr) {
        setImportError(`Failed to create subcategories: ${subErr.message}`);
        setImporting(false);
        return;
      }
      (insertedSubs || []).forEach((s: any) => {
        const key = `${s.parent_category}::${s.name.toLowerCase()}`;
        existingByKey[key] = s.id;
        subsCreated++;
      });
    }

    // Step 2: build challenge insert rows
    const challengeRows = rowsToImport.map((row) => {
      const subKey = row.subcategory ? `${row.category}::${row.subcategory.toLowerCase()}` : null;
      const subcategoryId = subKey ? existingByKey[subKey] || null : null;
      return {
        name: row.name,
        description: row.description || null,
        category: row.category,
        subcategory_id: subcategoryId,
        unit: row.unit,
        difficulty: row.difficulty || "Medium",
        default_rep_target: row.defaultRepTarget ? parseInt(row.defaultRepTarget) : null,
        owner_id: user.id,
        is_public: false,
      };
    });

    // Insert challenges in chunks of 100 to avoid hitting payload limits
    const chunkSize = 100;
    let inserted = 0;
    for (let i = 0; i < challengeRows.length; i += chunkSize) {
      const chunk = challengeRows.slice(i, i + chunkSize);
      const { error: insErr } = await supabase.from("challenges").insert(chunk);
      if (insErr) {
        setImportError(`Failed to import challenges (after ${inserted} successful): ${insErr.message}`);
        setImporting(false);
        return;
      }
      inserted += chunk.length;
    }

    setImporting(false);
    setImportDone({ inserted, subsCreated });
  };

  if (fetching) {
    return <LoadingFallback />;
  }

  if (!organizationId) {
    return (
      <div className="form-page">
        <header className="dashboard-header">
          <div className="dashboard-header-inner">
            <Link href="/dashboard" className="dashboard-logo">
              <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
            </Link>
            <Link href="/dashboard" className="btn-link">← Back</Link>
          </div>
        </header>
        <main className="form-page-main">
          <div className="form-card">
            <h1 className="form-title">Set Up an Organization First</h1>
            <p className="form-subtitle">
              Bulk-imported challenges are scoped to your organization. Create an organization first.
            </p>
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <Link href="/organizations/new" className="btn-primary-link">Create an Organization →</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
          </Link>
          <div className="dashboard-user-section">
            <span className="dashboard-user-email">{userDisplayName}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <OnboardingSidebar
          hasOrganization={true}
          hasTeams={hasTeams}
          hasPlayers={hasPlayers}
          hasEvent={hasEvent}
        />

        <main className="dashboard-main-with-sidebar">
          <Link href={returnTo ? `/events/${returnTo}` : "/dashboard"} className="btn-back">
            ← Back
          </Link>

          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">Bulk Import Challenges</span>
          </div>

          <h1 className="dashboard-welcome">Bulk Import Challenges</h1>
          <p className="dashboard-subtitle">
            Upload a CSV file to add many challenges at once. Imported challenges
            are private to <strong>{orgName}</strong>.
          </p>

          {importDone ? (
            <div className="csv-import-success-card">
              <h2 className="csv-import-success-title">✓ Import Complete</h2>
              <p className="csv-import-success-text">
                Successfully imported <strong>{importDone.inserted}</strong> challenge{importDone.inserted === 1 ? "" : "s"}
                {importDone.subsCreated > 0 && (
                  <> and created <strong>{importDone.subsCreated}</strong> new subcategor{importDone.subsCreated === 1 ? "y" : "ies"}</>
                )}.
              </p>
              <div className="form-actions">
                <Link href={returnTo ? `/events/${returnTo}` : "/dashboard"} className="btn-primary-link">
                  {returnTo ? "Back to Event →" : "Back to Dashboard →"}
                </Link>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setImportDone(null);
                    setParsedRows([]);
                  }}
                >
                  Import another batch
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="dashboard-card">
                <h2 className="dashboard-card-title">Step 1 — Get the template</h2>
                <p className="dashboard-card-text">
                  Download the CSV template, fill it in with your challenges, then upload it below.
                </p>
                <div className="csv-template-info">
                  <p className="csv-template-info-text">
                    <strong>Required columns:</strong> name, category, unit
                    <br />
                    <strong>Optional columns:</strong> description, subcategory, default_rep_target, difficulty
                    <br />
                    <strong>Categories:</strong> Sports, Faith, Fitness, Academic, Scouts, Service
                    <br />
                    <strong>Difficulty:</strong> Easy, Medium, or Hard (defaults to Medium if blank)
                    <br />
                    <strong>Subcategory:</strong> required for Sports, optional otherwise. New ones will be auto-created as private to your org.
                  </p>
                </div>
                <button type="button" className="btn-primary" onClick={downloadTemplate}>
                  📥 Download CSV Template
                </button>
              </div>

              <div className="dashboard-card">
                <h2 className="dashboard-card-title">Step 2 — Upload your CSV</h2>
                <div
                  className={`csv-dropzone ${isDragging ? "csv-dropzone-active" : ""}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelected(file);
                    }}
                  />
                  <div className="csv-dropzone-icon">📄</div>
                  <p className="csv-dropzone-text">
                    <strong>Click to upload</strong> or drag and drop your CSV file here
                  </p>
                  <p className="csv-dropzone-hint">
                    .csv files only, up to a few thousand rows
                  </p>
                </div>
                {parseError && <div className="alert alert-error">{parseError}</div>}
              </div>

              {parsedRows.length > 0 && (
                <>
                  <div className="dashboard-card">
                    <h2 className="dashboard-card-title">Step 3 — Review & confirm</h2>
                    <p className="dashboard-card-text">
                      Check the rows below. Rows with errors are skipped automatically. You can also uncheck individual rows you don't want to import.
                    </p>
                    <CSVChallengePreviewTable
                      rows={parsedRows}
                      onToggleRow={handleToggleRow}
                      onToggleAll={handleToggleAll}
                    />
                  </div>

                  {importError && <div className="alert alert-error">{importError}</div>}

                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => {
                        setParsedRows([]);
                        setParseError(null);
                      }}
                      disabled={importing}
                    >
                      Cancel — start over
                    </button>
                    <button
                      type="button"
                      className="btn-primary btn-inline"
                      onClick={handleImport}
                      disabled={importing || parsedRows.filter((r) => r.isValid && r.include).length === 0}
                    >
                      {importing
                        ? "Importing..."
                        : `Import ${parsedRows.filter((r) => r.isValid && r.include).length} challenge${parsedRows.filter((r) => r.isValid && r.include).length === 1 ? "" : "s"}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

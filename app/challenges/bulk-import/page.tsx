"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import LogoutButton from "@/components/LogoutButton";
import CSVChallengePreviewTable, { ParsedChallengeRow } from "@/components/CSVChallengePreviewTable";
import { recommendRecordingSetup } from "@/lib/recordingRecommender";

import AppShell from "@/components/AppShell";
const VALID_CATEGORIES = ["Sports", "Faith", "Fitness", "Academic", "Scouts", "Service"];
const VALID_DIFFICULTIES = ["Easy", "Medium", "Hard"];
const SUBCATEGORY_REQUIRED = new Set(["Sports"]);
const VALID_SETUP_TEMPLATES = [
  "side_angle_floor",
  "selfie_audio",
  "behind_player_target",
  "top_down_closeup",
  "gps_with_endpoints",
  "photo_completion",
  "wide_angle_court",
  "selfie_with_object",
  "custom",
];
const VALID_VERIFICATION_MODES = ["ai_only", "coach_only", "ai_and_coach"];

const CSV_TEMPLATE_CONTENT = `name,description,category,subcategory,sub_subcategory,unit,default_rep_target,difficulty,setup_template,recording_instructions,verification_mode
Push-Ups,Total push-ups completed (proper form),Fitness,Calisthenics,,push-ups,50,Medium,side_angle_floor,,ai_and_coach
Mile Run,Run one full mile. Track time or just completion.,Fitness,Cardio,,miles,1,Hard,gps_with_endpoints,,ai_and_coach
Bible Verses Memorized,Number of full Bible verses memorized and recited correctly,Faith,Bible Memorization,New Testament,verses,10,Medium,selfie_audio,,ai_and_coach
Books Read,Total books read cover-to-cover during the event,Academic,Reading,,books,3,Easy,photo_completion,,coach_only
Free Throws Made,Free throws successfully made out of 25 attempts,Sports,Basketball,Free Throws,shots,15,Medium,behind_player_target,,ai_and_coach
Solo Juggling - Feet Only,Consecutive juggles using only the feet,Sports,Soccer,Ball Control,touches,50,Medium,side_angle_floor,,ai_and_coach
Wall Passes Both Feet,Successful wall passes alternating feet,Sports,Soccer,Passing,passes,40,Medium,wide_angle_court,,ai_and_coach
Volunteer Hours,Hours volunteered at a community organization,Service,Volunteer Hours,,hours,5,Easy,photo_completion,,coach_only`;

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

type OrgSub = { id: string; parent_category: string; name: string; is_public: boolean; parent_subcategory_id: string | null };

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
  const [orgSubcategories, setOrgSubcategories] = useState<OrgSub[]>([]);

  const [parsedRows, setParsedRows] = useState<ParsedChallengeRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState<{ inserted: number; subsCreated: number; subSubsCreated: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFetching(false); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (profile?.full_name) setUserDisplayName(profile.full_name);

      const [{ count: teamCount }, { count: playerCount }, { count: eventCount }] = await Promise.all([
        supabase.from("teams").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("players").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("events").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
      ]);
      setHasTeams((teamCount || 0) > 0);
      setHasPlayers((playerCount || 0) > 0);
      setHasEvent((eventCount || 0) > 0);

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

        const { data: subs } = await supabase
          .from("challenge_subcategories")
          .select("id, parent_category, name, is_public, parent_subcategory_id")
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
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (c === "," && !inQuotes) { result.push(current); current = ""; }
      else { current += c; }
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
      if (!text) { setParseError("Could not read the file."); return; }

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) { setParseError("CSV must have a header row plus at least one data row."); return; }

      const headerCells = parseCSVRow(lines[0]).map((h) => h.toLowerCase().replace(/[\s_]+/g, ""));
      const requiredHeaders = ["name", "category", "unit"];
      const missingHeaders = requiredHeaders.filter((h) => !headerCells.includes(h));
      if (missingHeaders.length > 0) {
        setParseError(`Missing required columns: ${missingHeaders.join(", ")}. Download the template to see the correct format.`);
        return;
      }

      const colIndex: Record<string, number> = {};
      headerCells.forEach((h, idx) => { colIndex[h] = idx; });

      // Build a fast lookup keyed by (parent_category, name lowercase, parent_subcategory_id or "null")
      const subLookup: Record<string, { id: string; parent_subcategory_id: string | null }> = {};
      orgSubcategories.forEach((s) => {
        const parentKey = s.parent_subcategory_id || "null";
        const key = `${s.parent_category}::${s.name.toLowerCase()}::${parentKey}`;
        subLookup[key] = { id: s.id, parent_subcategory_id: s.parent_subcategory_id };
      });

      const newTier2Keys = new Set<string>();
      const newTier3Keys = new Set<string>();

      const parsed: ParsedChallengeRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVRow(lines[i]);
        const errors: string[] = [];
        const warnings: string[] = [];

        const name = (cells[colIndex.name] || "").trim();
        const description = colIndex.description !== undefined ? (cells[colIndex.description] || "").trim() : "";
        const categoryRaw = (cells[colIndex.category] || "").trim();
        const subcategory = colIndex.subcategory !== undefined ? (cells[colIndex.subcategory] || "").trim() : "";
        const subSubcategory = colIndex.subsubcategory !== undefined ? (cells[colIndex.subsubcategory] || "").trim() : "";
        const unit = (cells[colIndex.unit] || "").trim();
        const defaultRepTargetStr = colIndex.defaultreptarget !== undefined ? (cells[colIndex.defaultreptarget] || "").trim() : "";
        const difficultyRaw = colIndex.difficulty !== undefined ? (cells[colIndex.difficulty] || "").trim() : "";
        const setupTemplate = colIndex.setuptemplate !== undefined ? (cells[colIndex.setuptemplate] || "").trim() : "";
        const recordingInstructions = colIndex.recordinginstructions !== undefined ? (cells[colIndex.recordinginstructions] || "").trim() : "";
        const verificationMode = colIndex.verificationmode !== undefined ? (cells[colIndex.verificationmode] || "").trim() : "";

        const category = VALID_CATEGORIES.find((c) => c.toLowerCase() === categoryRaw.toLowerCase()) || "";
        const difficulty = VALID_DIFFICULTIES.find((d) => d.toLowerCase() === difficultyRaw.toLowerCase()) || (difficultyRaw === "" ? "Medium" : "");

        if (!name) errors.push("Name is required");
        else if (name.length > 120) errors.push("Name too long (max 120 chars)");
        if (!categoryRaw) errors.push("Category is required");
        else if (!category) errors.push(`Category "${categoryRaw}" is not valid (must be one of: ${VALID_CATEGORIES.join(", ")})`);
        if (!unit) errors.push("Unit is required");
        else if (unit.length > 30) errors.push("Unit too long (max 30 chars)");
        if (difficultyRaw && !difficulty) errors.push(`Difficulty "${difficultyRaw}" is not valid (Easy/Medium/Hard)`);

        if (defaultRepTargetStr) {
          const n = parseInt(defaultRepTargetStr);
          if (isNaN(n) || n < 1) errors.push(`Default rep target "${defaultRepTargetStr}" must be a positive whole number`);
        }

        if (setupTemplate && !VALID_SETUP_TEMPLATES.includes(setupTemplate)) {
          errors.push(`Setup template "${setupTemplate}" is not valid`);
        }
        if (verificationMode && !VALID_VERIFICATION_MODES.includes(verificationMode)) {
          errors.push(`Verification mode "${verificationMode}" must be ai_only, coach_only, or ai_and_coach`);
        }

        if (category === "Sports" && !subcategory) {
          errors.push("Subcategory (sport) is required for Sports challenges");
        }
        if (subSubcategory && !subcategory) {
          errors.push("Sub-subcategory requires a subcategory to be set");
        }

        // Check Tier 2 (subcategory) - find existing or flag for creation
        let willCreateSubcategory = false;
        let tier2Id: string | null = null;
        if (category && subcategory) {
          const tier2Key = `${category}::${subcategory.toLowerCase()}::null`;
          const existing = subLookup[tier2Key];
          if (existing) {
            tier2Id = existing.id;
          } else if (newTier2Keys.has(tier2Key)) {
            // already flagged in this CSV
          } else {
            newTier2Keys.add(tier2Key);
            willCreateSubcategory = true;
            warnings.push(`Will create "${subcategory}" as a new private ${category} subcategory`);
          }
        }

        // Check Tier 3 (sub-subcategory)
        let willCreateSubSubcategory = false;
        if (category && subcategory && subSubcategory) {
          if (tier2Id) {
            const tier3Key = `${category}::${subSubcategory.toLowerCase()}::${tier2Id}`;
            if (!subLookup[tier3Key] && !newTier3Keys.has(tier3Key)) {
              newTier3Keys.add(tier3Key);
              willCreateSubSubcategory = true;
              warnings.push(`Will create "${subSubcategory}" as a new private sub-subcategory under ${subcategory}`);
            }
          } else {
            // Tier 2 is also new — Tier 3 must also be new
            const tier3Key = `${category}::${subSubcategory.toLowerCase()}::NEW_TIER2:${subcategory.toLowerCase()}`;
            if (!newTier3Keys.has(tier3Key)) {
              newTier3Keys.add(tier3Key);
              willCreateSubSubcategory = true;
              warnings.push(`Will create "${subSubcategory}" as a new private sub-subcategory under new "${subcategory}"`);
            }
          }
        }

        // If setup_template is blank, run the recommender so we can show what will be used
        let recommendedSetupTemplate: string | undefined;
        let recommendedConfidence: "high" | "medium" | "low" | undefined;
        if (!setupTemplate && category) {
          const rec = recommendRecordingSetup({
            category,
            subcategoryName: subSubcategory || subcategory || null,
            unit,
            name,
          });
          if (rec) {
            recommendedSetupTemplate = rec.templateKey;
            recommendedConfidence = rec.confidence;
          }
        }

        const isValid = errors.length === 0;
        parsed.push({
          rowNumber: i,
          name,
          description,
          category,
          subcategory,
          subSubcategory,
          unit,
          defaultRepTarget: defaultRepTargetStr,
          difficulty,
          setupTemplate,
          recordingInstructions,
          verificationMode,
          recommendedSetupTemplate,
          recommendedConfidence,
          isValid,
          errors,
          warnings,
          include: isValid,
          willCreateSubcategory,
          willCreateSubSubcategory,
        });
      }

      setParsedRows(parsed);
    };

    reader.onerror = () => setParseError("Could not read the file.");
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  const handleToggleRow = (rowNumber: number, include: boolean) => {
    setParsedRows((rows) => rows.map((r) => (r.rowNumber === rowNumber ? { ...r, include } : r)));
  };
  const handleToggleAll = (include: boolean) => {
    setParsedRows((rows) => rows.map((r) => (r.isValid ? { ...r, include } : r)));
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
    if (!user) { setImportError("Not logged in."); setImporting(false); return; }

    // Build the existing lookup keyed by (parent_category, name lowercase, parent_subcategory_id or "null")
    const existingByKey: Record<string, string> = {};
    orgSubcategories.forEach((s) => {
      const parentKey = s.parent_subcategory_id || "null";
      const key = `${s.parent_category}::${s.name.toLowerCase()}::${parentKey}`;
      existingByKey[key] = s.id;
    });

    // STEP 1: Collect Tier 2 subcategories that need creation
    const tier2ToCreate: { parent_category: string; name: string; key: string }[] = [];
    const seenTier2 = new Set<string>();
    for (const row of rowsToImport) {
      if (!row.subcategory) continue;
      const key = `${row.category}::${row.subcategory.toLowerCase()}::null`;
      if (existingByKey[key]) continue;
      if (seenTier2.has(key)) continue;
      seenTier2.add(key);
      tier2ToCreate.push({ parent_category: row.category, name: row.subcategory, key });
    }

    let subsCreated = 0;
    if (tier2ToCreate.length > 0) {
      const subRows = tier2ToCreate.map((s) => ({
        parent_category: s.parent_category,
        name: s.name,
        is_public: false,
        organization_id: organizationId,
        created_by: user.id,
        display_order: 500,
        parent_subcategory_id: null,
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
        const key = `${s.parent_category}::${s.name.toLowerCase()}::null`;
        existingByKey[key] = s.id;
        subsCreated++;
      });
    }

    // STEP 2: Now that all Tier 2 ids are known, collect Tier 3 to create
    const tier3ToCreate: { parent_category: string; name: string; parent_subcategory_id: string; key: string }[] = [];
    const seenTier3 = new Set<string>();
    for (const row of rowsToImport) {
      if (!row.subcategory || !row.subSubcategory) continue;
      const tier2Key = `${row.category}::${row.subcategory.toLowerCase()}::null`;
      const tier2Id = existingByKey[tier2Key];
      if (!tier2Id) continue;
      const tier3Key = `${row.category}::${row.subSubcategory.toLowerCase()}::${tier2Id}`;
      if (existingByKey[tier3Key]) continue;
      if (seenTier3.has(tier3Key)) continue;
      seenTier3.add(tier3Key);
      tier3ToCreate.push({
        parent_category: row.category,
        name: row.subSubcategory,
        parent_subcategory_id: tier2Id,
        key: tier3Key,
      });
    }

    let subSubsCreated = 0;
    if (tier3ToCreate.length > 0) {
      const subRows = tier3ToCreate.map((s) => ({
        parent_category: s.parent_category,
        name: s.name,
        is_public: false,
        organization_id: organizationId,
        created_by: user.id,
        display_order: 500,
        parent_subcategory_id: s.parent_subcategory_id,
      }));
      const { data: insertedSubs, error: subErr } = await supabase
        .from("challenge_subcategories")
        .insert(subRows)
        .select("id, parent_category, name, parent_subcategory_id");
      if (subErr) {
        setImportError(`Failed to create sub-subcategories: ${subErr.message}`);
        setImporting(false);
        return;
      }
      (insertedSubs || []).forEach((s: any) => {
        const key = `${s.parent_category}::${s.name.toLowerCase()}::${s.parent_subcategory_id}`;
        existingByKey[key] = s.id;
        subSubsCreated++;
      });
    }

    // STEP 3: Build challenge insert rows
    const challengeRows = rowsToImport.map((row) => {
      let finalSubcategoryId: string | null = null;
      if (row.subcategory) {
        const tier2Key = `${row.category}::${row.subcategory.toLowerCase()}::null`;
        const tier2Id = existingByKey[tier2Key] || null;
        if (row.subSubcategory && tier2Id) {
          const tier3Key = `${row.category}::${row.subSubcategory.toLowerCase()}::${tier2Id}`;
          finalSubcategoryId = existingByKey[tier3Key] || tier2Id;
        } else {
          finalSubcategoryId = tier2Id;
        }
      }

      // Run recommender for blank setup_template rows
      let setupTemplateKey: string | null = row.setupTemplate || null;
      let recordingInstructions: string | null = row.recordingInstructions || null;
      let verificationMode: string | null = row.verificationMode || null;

      if (!setupTemplateKey && row.category) {
        const rec = recommendRecordingSetup({
          category: row.category,
          subcategoryName: row.subSubcategory || row.subcategory || null,
          unit: row.unit,
          name: row.name,
        });
        if (rec) {
          setupTemplateKey = rec.templateKey;
          if (!recordingInstructions) recordingInstructions = rec.template.instructions;
          if (!verificationMode) verificationMode = rec.template.recommendedVerificationMode;
        }
      }

      return {
        name: row.name,
        description: row.description || null,
        category: row.category,
        subcategory_id: finalSubcategoryId,
        unit: row.unit,
        difficulty: row.difficulty || "Medium",
        default_rep_target: row.defaultRepTarget ? parseInt(row.defaultRepTarget) : null,
        setup_template_key: setupTemplateKey,
        recording_instructions: recordingInstructions,
        verification_mode: verificationMode || "coach_only",
        owner_id: user.id,
        is_public: false,
      };
    });

    // STEP 4: Insert challenges in chunks of 100
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
    setImportDone({ inserted, subsCreated, subSubsCreated });
  };

  if (fetching) return <LoadingFallback />;

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
            <p className="form-subtitle">Bulk-imported challenges are scoped to your organization.</p>
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <Link href="/organizations/new" className="btn-primary-link">Create an Organization →</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <AppShell active="settings" userDisplayName={userDisplayName}>
          <Link href={returnTo ? `/events/${returnTo}` : "/dashboard"} className="btn-back">← Back</Link>

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
                )}
                {importDone.subSubsCreated > 0 && (
                  <> + <strong>{importDone.subSubsCreated}</strong> new sub-subcategor{importDone.subSubsCreated === 1 ? "y" : "ies"}</>
                )}.
              </p>
              <div className="form-actions">
                <Link href={returnTo ? `/events/${returnTo}` : "/dashboard"} className="btn-primary-link">
                  {returnTo ? "Back to Event →" : "Back to Dashboard →"}
                </Link>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => { setImportDone(null); setParsedRows([]); }}
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
                    <strong>Optional columns:</strong> description, subcategory, sub_subcategory, default_rep_target, difficulty, setup_template, recording_instructions, verification_mode
                    <br />
                    <strong>Categories:</strong> Sports, Faith, Fitness, Academic, Scouts, Service
                    <br />
                    <strong>Difficulty:</strong> Easy, Medium, or Hard (defaults to Medium if blank)
                    <br />
                    <strong>Subcategory:</strong> required for Sports (e.g., Soccer, Basketball, Bible Memorization, Cardio).
                    <br />
                    <strong>Sub-subcategory (NEW):</strong> optional third level (e.g., Ball Control, Free Throws, New Testament). New entries auto-created as private to your org.
                    <br />
                    <strong>Setup template (optional):</strong> side_angle_floor, selfie_audio, behind_player_target, top_down_closeup, gps_with_endpoints, photo_completion, wide_angle_court, selfie_with_object, custom. If blank, AI auto-recommends.
                    <br />
                    <strong>Verification mode (optional):</strong> ai_only, coach_only, or ai_and_coach. Defaults to coach_only.
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
                    <h2 className="dashboard-card-title">Step 3 — Review &amp; confirm</h2>
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
                      onClick={() => { setParsedRows([]); setParseError(null); }}
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
    </AppShell>
  );
}

"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";
import CategoryHierarchyPicker, { type Subcategory } from "@/components/CategoryHierarchyPicker";
import RecordingSetupSection, {
  type AIStrategyValue,
} from "@/components/RecordingSetupSection";
import ReferencePhotoUpload from "@/components/ReferencePhotoUpload";

import AppShell from "@/components/AppShell";
const SUBCATEGORY_REQUIRED = new Set(["Sports"]);

// Hardcoded admin email (mirrored across the codebase). Admin can edit any
// challenge in the library; everyone else can only edit challenges they own.
// Backed by RLS on the challenges table — even if someone hand-crafted the
// URL the database would refuse the UPDATE.
const ADMIN_EMAIL = "waylon.hdd@comcast.net";

// The default export wraps everything in <Suspense> so Next.js can prerender
// the page even though useSearchParams() is used inside.
export default function EditChallengePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EditChallengeForm />
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

function EditChallengeForm() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const challengeId = params?.id;
  const returnTo = searchParams.get("returnTo");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [subSubcategoryId, setSubSubcategoryId] = useState<string | null>(null);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [unit, setUnit] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [defaultRepTarget, setDefaultRepTarget] = useState("");
  const [organizationId, setOrganizationId] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPublicChallenge, setIsPublicChallenge] = useState(false);

  // Recording fields
  const [setupTemplateKey, setSetupTemplateKey] = useState<string>("");
  const [recordingInstructions, setRecordingInstructions] = useState<string>("");
  const [verificationMode, setVerificationMode] = useState<"ai_only" | "coach_only" | "ai_and_coach" | "">("");
  const [aiVerificationStrategy, setAiVerificationStrategy] = useState<AIStrategyValue>("");

  // Reference photo fields (Slice 4.5.4)
  const [referencePhotoUrl, setReferencePhotoUrl] = useState<string | null>(null);
  const [referencePhotoCaption, setReferencePhotoCaption] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Load the existing challenge + org context + subcategories.
  useEffect(() => {
    const load = async () => {
      if (!challengeId) {
        setError("No challenge id in URL.");
        setFetching(false);
        return;
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in.");
        setFetching(false);
        return;
      }

      const userIsAdmin = user.email === ADMIN_EMAIL;
      setIsAdmin(userIsAdmin);

      // Fetch the challenge itself
      const { data: challenge, error: chErr } = await supabase
        .from("challenges")
        .select("*")
        .eq("id", challengeId)
        .single();

      if (chErr || !challenge) {
        setError(chErr?.message || "Challenge not found.");
        setFetching(false);
        return;
      }

      // Permission gate: admin always allowed; everyone else only if they own
      // it (and even then, only if it's not public — non-admins shouldn't edit
      // public seeded library entries).
      const userOwns = challenge.owner_id === user.id;
      const allowed = userIsAdmin || (userOwns && !challenge.is_public);
      if (!allowed) {
        setPermissionError(
          challenge.is_public
            ? "This is a public library challenge. Only the platform admin can edit it."
            : "You can only edit challenges you created."
        );
        setFetching(false);
        return;
      }

      // Prefill all form state from the existing row
      setName(challenge.name || "");
      setDescription(challenge.description || "");
      setCategory(challenge.category || "");
      setUnit(challenge.unit || "");
      setDifficulty(challenge.difficulty || "Medium");
      setDefaultRepTarget(
        challenge.default_rep_target ? String(challenge.default_rep_target) : ""
      );
      setSetupTemplateKey(challenge.setup_template_key || "");
      setRecordingInstructions(challenge.recording_instructions || "");
      setVerificationMode((challenge.verification_mode as any) || "");
      setAiVerificationStrategy((challenge.ai_verification_strategy as AIStrategyValue) || "");
      setReferencePhotoUrl(challenge.reference_photo_url || null);
      setReferencePhotoCaption(challenge.reference_photo_caption || "");
      setIsPublicChallenge(!!challenge.is_public);

      // Fetch subcategories so we can resolve the saved subcategory_id into
      // (Tier 2 id, Tier 3 id) for the picker. Categories can be 2-level or
      // 3-level deep — if the saved subcategory has a parent, it's a Tier 3.
      const { data: subs } = await supabase
        .from("challenge_subcategories")
        .select("id, parent_category, name, display_order, is_public, organization_id, parent_subcategory_id")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      const allSubs = (subs as any) || [];
      setSubcategories(allSubs);

      if (challenge.subcategory_id) {
        const savedSub = allSubs.find((s: Subcategory) => s.id === challenge.subcategory_id);
        if (savedSub) {
          if (savedSub.parent_subcategory_id) {
            // Tier 3 — set both parent (Tier 2) and self (Tier 3)
            setSubcategoryId(savedSub.parent_subcategory_id);
            setSubSubcategoryId(savedSub.id);
          } else {
            // Tier 2 — set just self
            setSubcategoryId(savedSub.id);
            setSubSubcategoryId(null);
          }
        }
      }

      // Resolve org context. Admin editing a public challenge has no org of
      // their own that matters; we use the user's first org for the
      // CategoryHierarchyPicker context (it's required by the picker for
      // creating new private subcategories on the fly, but admin's "create
      // new" flow publishes globally and ignores the org id).
      let foundOrgId: string | null = null;
      if (returnTo) {
        const eventId = returnTo.split("/")[0];
        if (eventId) {
          const { data: event } = await supabase
            .from("events")
            .select("organization_id")
            .eq("id", eventId)
            .single();
          if (event?.organization_id) foundOrgId = event.organization_id;
        }
      }
      if (!foundOrgId) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1);
        if (orgs && orgs.length > 0) foundOrgId = orgs[0].id;
      }
      // Admin may not own any orgs but is still allowed to edit. Use empty
      // string in that case — the picker only uses this for new subcategory
      // creation, which admin can perform via /admin/subcategories instead.
      setOrganizationId(foundOrgId || "");

      setFetching(false);
    };

    load();
  }, [challengeId, returnTo]);

  // Look up the deepest selected subcategory name for the recommender
  // (use Tier 3 name if set, else Tier 2 name)
  const subcategoryName = useMemo(() => {
    if (subSubcategoryId) {
      return subcategories.find((s) => s.id === subSubcategoryId)?.name || null;
    }
    if (subcategoryId) {
      return subcategories.find((s) => s.id === subcategoryId)?.name || null;
    }
    return null;
  }, [subcategoryId, subSubcategoryId, subcategories]);

  const handleSubcategoryCreated = (newSub: Subcategory) => {
    setSubcategories((prev) => [...prev, newSub]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!challengeId) {
      setError("Missing challenge id.");
      return;
    }
    if (!name.trim() || !category || !unit.trim()) {
      setError("Name, category, and unit are required.");
      return;
    }
    if (SUBCATEGORY_REQUIRED.has(category) && !subcategoryId) {
      setError(`Pick a sport for this Sports challenge (or add a new one).`);
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const finalSubcategoryId = subSubcategoryId || subcategoryId;

    // Build the patch. Note: we deliberately do NOT touch is_public or owner_id
    // on edit — visibility stays whatever it already was. Admin can flip
    // visibility separately via a dedicated tool later.
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        category,
        subcategory_id: finalSubcategoryId,
        unit: unit.trim(),
        difficulty,
        default_rep_target: defaultRepTarget ? parseInt(defaultRepTarget) : null,
        setup_template_key: setupTemplateKey || null,
        recording_instructions: recordingInstructions.trim() || null,
        verification_mode: verificationMode || "coach_only",
        ai_verification_strategy: aiVerificationStrategy || null,
        reference_photo_url: referencePhotoUrl || null,
        reference_photo_caption: referencePhotoCaption.trim() || null,
      })
      .eq("id", challengeId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    if (returnTo) {
      router.push(`/events/${returnTo}`);
    } else {
      router.push("/dashboard");
    }
    router.refresh();
  };

  if (fetching) {
    return <LoadingFallback />;
  }

  // Permission rejection — distinct from generic error
  if (permissionError) {
    const backHref = returnTo ? `/events/${returnTo}` : "/dashboard";
    return (
      <AppShell active="settings" userDisplayName={""}>
        <main className="form-page-main">
          <div className="form-card">
            <h1 className="form-title">🔒 Cannot Edit</h1>
            <p className="form-subtitle">{permissionError}</p>
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <Link href={backHref} className="btn-primary-link">
                ← Go back
              </Link>
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  // Generic load error (challenge missing, not logged in, etc.)
  if (error && !name) {
    const backHref = returnTo ? `/events/${returnTo}` : "/dashboard";
    return (
      <AppShell active="settings" userDisplayName={""}>
        <main className="form-page-main">
          <div className="form-card">
            <h1 className="form-title">Could not load challenge</h1>
            <p className="form-subtitle">{error}</p>
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <Link href={backHref} className="btn-primary-link">
                ← Go back
              </Link>
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  const backHref = returnTo ? `/events/${returnTo}` : "/dashboard";

  // The visibility callout reflects the EXISTING visibility (we don't change
  // it on edit — see handleSubmit) so the admin always knows what surface
  // their changes will touch.
  return (
    <AppShell active="settings" userDisplayName={""}>
      <main className="form-page-main">
        <div className="form-card">
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">★ EDIT CHALLENGE ★</span>
          </div>

          <h1 className="form-title">Edit Challenge</h1>
          <p className="form-subtitle">
            Update the details below and save. Players will see the new version
            the next time they open the schedule.
          </p>

          <div
            style={{
              marginTop: "8px",
              marginBottom: "16px",
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              lineHeight: 1.5,
              background: isPublicChallenge
                ? "rgba(53, 213, 223, 0.10)"
                : "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${isPublicChallenge
                ? "rgba(53, 213, 223, 0.32)"
                : "var(--e2k-border-soft, rgba(95,230,225,0.12))"}`,
              color: "var(--e2k-text, #f7fbfb)",
            }}
          >
            {isPublicChallenge ? (
              <>
                <strong>🌐 Public library challenge.</strong>{" "}
                This challenge is visible to every coach. Your edits will apply
                everywhere it's used.
              </>
            ) : (
              <>
                <strong>🔒 Private challenge.</strong>{" "}
                Only your organization sees this. Your edits stay private.
              </>
            )}
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="form-label">
                Challenge name <span className="required">*</span>
                <Tooltip text="The name of the activity. Be specific enough that players know what they're doing.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="name" type="text" className="form-input"
                value={name} onChange={(e) => setName(e.target.value)}
                required maxLength={120} autoFocus
              />
            </div>

            <CategoryHierarchyPicker
              category={category}
              setCategory={setCategory}
              subcategoryId={subcategoryId}
              setSubcategoryId={setSubcategoryId}
              subSubcategoryId={subSubcategoryId}
              setSubSubcategoryId={setSubSubcategoryId}
              organizationId={organizationId}
              subcategories={subcategories}
              onSubcategoryCreated={handleSubcategoryCreated}
            />

            <div>
              <label htmlFor="unit" className="form-label">
                Unit <span className="required">*</span>
                <Tooltip text="What is being counted? Examples: reps, miles, hours, verses, books, push-ups, points.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="unit" type="text" className="form-input"
                value={unit} onChange={(e) => setUnit(e.target.value)}
                required maxLength={30}
              />
            </div>

            <div>
              <label htmlFor="difficulty" className="form-label">Difficulty</label>
              <select
                id="difficulty" className="form-input"
                value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div>
              <label htmlFor="defaultRepTarget" className="form-label">
                Default rep target (optional)
                <Tooltip text="A starter goal that pre-fills when adding this challenge to an event. Coaches can override per event.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="defaultRepTarget" type="number" className="form-input"
                value={defaultRepTarget} onChange={(e) => setDefaultRepTarget(e.target.value)}
                min="1"
              />
            </div>

            <div>
              <label htmlFor="description" className="form-label">Description (optional)</label>
              <textarea
                id="description" className="form-input form-textarea"
                value={description} onChange={(e) => setDescription(e.target.value)}
                rows={3} maxLength={500}
              />
            </div>

            <RecordingSetupSection
              category={category}
              subcategoryName={subcategoryName}
              unit={unit}
              name={name}
              setupTemplateKey={setupTemplateKey}
              setSetupTemplateKey={setSetupTemplateKey}
              recordingInstructions={recordingInstructions}
              setRecordingInstructions={setRecordingInstructions}
              verificationMode={verificationMode}
              setVerificationMode={setVerificationMode}
              aiVerificationStrategy={aiVerificationStrategy}
              setAiVerificationStrategy={setAiVerificationStrategy}
            />

            <ReferencePhotoUpload
              photoUrl={referencePhotoUrl}
              setPhotoUrl={setReferencePhotoUrl}
              caption={referencePhotoCaption}
              setCaption={setReferencePhotoCaption}
              organizationId={organizationId}
              disabled={loading}
            />

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <Link href={backHref} className="btn-cancel">Cancel</Link>
              <button type="submit" className="btn-primary btn-inline" disabled={loading}>
                {loading ? "Saving..." : "Save Changes →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AppShell>
  );
}

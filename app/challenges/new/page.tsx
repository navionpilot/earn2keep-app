"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";
import CategoryHierarchyPicker, { type Subcategory } from "@/components/CategoryHierarchyPicker";
import RecordingSetupSection from "@/components/RecordingSetupSection";
import ReferencePhotoUpload from "@/components/ReferencePhotoUpload";

import AppShell from "@/components/AppShell";
const SUBCATEGORY_REQUIRED = new Set(["Sports"]);

// Hardcoded admin email (mirrored in app/events/[id]/schedule/page.tsx and
// app/admin/subcategories/page.tsx). When the admin creates a challenge,
// it is auto-published to the global library so every other coach sees it.
// Regular users' challenges stay private to their own org.
const ADMIN_EMAIL = "waylon.hdd@comcast.net";

// The default export wraps everything in <Suspense> so Next.js can prerender
// the page even though useSearchParams() is used inside.
export default function NewChallengePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NewChallengeForm />
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

function NewChallengeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // Recording fields
  const [setupTemplateKey, setSetupTemplateKey] = useState<string>("");
  const [recordingInstructions, setRecordingInstructions] = useState<string>("");
  const [verificationMode, setVerificationMode] = useState<"ai_only" | "coach_only" | "ai_and_coach" | "">("");

  // Reference photo fields (Slice 4.5.4)
  const [referencePhotoUrl, setReferencePhotoUrl] = useState<string | null>(null);
  const [referencePhotoCaption, setReferencePhotoCaption] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Fetch the org context (from the event if returnTo exists, otherwise user's first org)
  useEffect(() => {
    const fetchOrg = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in.");
        setFetching(false);
        return;
      }

      // Track admin status — controls whether the new challenge is published
      // to the global library or kept private to this org.
      setIsAdmin(user.email === ADMIN_EMAIL);

      // returnTo format is "<eventId>/schedule" — extract eventId
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
        // Fall back to user's first org
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1);
        if (orgs && orgs.length > 0) foundOrgId = orgs[0].id;
      }

      if (!foundOrgId) {
        setError("You need to create an organization before adding custom challenges.");
        setFetching(false);
        return;
      }

      setOrganizationId(foundOrgId);

      // Also fetch subcategories so we can:
      // 1. Pass them to the picker (avoids double-fetching)
      // 2. Look up the subcategory NAME from the selected ID for the recommender
      const { data: subs } = await supabase
        .from("challenge_subcategories")
        .select("id, parent_category, name, display_order, is_public, organization_id, parent_subcategory_id")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      setSubcategories((subs as any) || []);

      setFetching(false);
    };

    fetchOrg();
  }, [returnTo]);

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("You must be logged in."); setLoading(false); return; }

    // File the challenge under the DEEPEST selected level
    // (Tier 3 if available, else Tier 2)
    const finalSubcategoryId = subSubcategoryId || subcategoryId;

    const { error: insertError } = await supabase.from("challenges").insert({
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
      reference_photo_url: referencePhotoUrl || null,
      reference_photo_caption: referencePhotoCaption.trim() || null,
      owner_id: user.id,
      // Admin's challenges are auto-published to the global library so every
      // coach sees them. Everyone else's stay private to their own org.
      is_public: isAdmin,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    if (returnTo) {
      // returnTo format is "<eventId>/schedule"
      router.push(`/events/${returnTo}`);
    } else {
      router.push("/dashboard");
    }
    router.refresh();
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
              Custom challenges are scoped to your organization. Create an organization first, then come back here.
            </p>
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <Link href="/organizations/new" className="btn-primary-link">Create an Organization →</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const backHref = returnTo ? `/events/${returnTo}` : "/dashboard";

  return (
    <AppShell active="settings" userDisplayName={""}>
      <main className="form-page-main">
        <div className="form-card">
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">
              {isAdmin ? "★ NEW LIBRARY CHALLENGE ★" : "★ CUSTOM CHALLENGE ★"}
            </span>
          </div>

          <h1 className="form-title">
            {isAdmin ? "Add to the Challenge Library" : "Create a Custom Challenge"}
          </h1>
          <p className="form-subtitle">
            {isAdmin
              ? "You're signed in as the platform admin. This challenge will be added to the public library and visible to every organizer."
              : "This challenge will only be visible to you and your organization. Use it for activities that don't fit the standard library."}
          </p>

          {/* Visibility callout — explicit, hard to miss. Keeps the admin
              from accidentally publishing global content while not realizing,
              and reassures regular users their stuff stays private. */}
          <div
            className={isAdmin ? "alert alert-info" : "alert"}
            style={{
              marginTop: "8px",
              marginBottom: "16px",
              padding: "12px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              lineHeight: 1.5,
              background: isAdmin
                ? "rgba(53, 213, 223, 0.10)"
                : "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${isAdmin
                ? "rgba(53, 213, 223, 0.32)"
                : "var(--e2k-border-soft, rgba(95,230,225,0.12))"}`,
              color: "var(--e2k-text, #f7fbfb)",
            }}
          >
            {isAdmin ? (
              <>
                <strong>🌐 Public to all organizers.</strong>{" "}
                As admin, every challenge you create is auto-shared with the
                global library. New organizers will see it the moment they sign up.
              </>
            ) : (
              <>
                <strong>🔒 Private to your organization.</strong>{" "}
                Only you and members of your org will see this challenge.
                It will not appear for other organizers.
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
                placeholder="e.g., Vertical Jump Touches, Trash Bags Filled"
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
                placeholder="e.g., reps, miles, hours, books"
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
                <Tooltip text="A starter goal that pre-fills when adding this challenge to an event. Organizers can override per event.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="defaultRepTarget" type="number" className="form-input"
                placeholder="e.g., 25"
                value={defaultRepTarget} onChange={(e) => setDefaultRepTarget(e.target.value)}
                min="1"
              />
            </div>

            <div>
              <label htmlFor="description" className="form-label">Description (optional)</label>
              <textarea
                id="description" className="form-input form-textarea"
                placeholder="Explain how to do this challenge or how to verify it..."
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
                {loading ? "Creating..." : "Create Challenge →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AppShell>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";
import SubcategoryPicker from "@/components/SubcategoryPicker";

const SUBCATEGORY_REQUIRED = new Set(["Sports"]);

export default function NewChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [unit, setUnit] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [defaultRepTarget, setDefaultRepTarget] = useState("");
  const [organizationId, setOrganizationId] = useState<string>("");
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
      setFetching(false);
    };

    fetchOrg();
  }, [returnTo]);

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

    const { error: insertError } = await supabase.from("challenges").insert({
      name: name.trim(),
      description: description.trim() || null,
      category,
      subcategory_id: subcategoryId,
      unit: unit.trim(),
      difficulty,
      default_rep_target: defaultRepTarget ? parseInt(defaultRepTarget) : null,
      owner_id: user.id,
      is_public: false,
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
    <div className="form-page">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
          </Link>
          <Link href={backHref} className="btn-link">← Back</Link>
        </div>
      </header>

      <main className="form-page-main">
        <div className="form-card">
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">★ CUSTOM CHALLENGE ★</span>
          </div>

          <h1 className="form-title">Create a Custom Challenge</h1>
          <p className="form-subtitle">
            This challenge will only be visible to you and your organization. Use
            it for activities that don't fit the standard library.
          </p>

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

            <SubcategoryPicker
              category={category}
              setCategory={setCategory}
              subcategoryId={subcategoryId}
              setSubcategoryId={setSubcategoryId}
              organizationId={organizationId}
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
                <Tooltip text="A starter goal that pre-fills when adding this challenge to an event. Coaches can override per event.">
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
    </div>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

const CATEGORIES = ["Sports", "Faith", "Scouts", "Fitness", "Academic", "Service"];

function NewChallengeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [defaultRepTarget, setDefaultRepTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !category || !unit.trim()) {
      setError("Name, category, and unit are required.");
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
      router.push(`/events/${returnTo}/challenges/add`);
    } else {
      router.push("/dashboard");
    }
    router.refresh();
  };

  return (
    <div className="form-page">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
          </Link>
          <Link
            href={returnTo ? `/events/${returnTo}/challenges/add` : "/dashboard"}
            className="btn-link"
          >
            ← Back
          </Link>
        </div>
      </header>

      <main className="form-page-main">
        <div className="form-card">
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">★ CUSTOM CHALLENGE ★</span>
          </div>

          <h1 className="form-title">Create a Custom Challenge</h1>
          <p className="form-subtitle">
            This challenge will only be visible to you. Use it for activities
            that don't fit the standard library.
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

            <div>
              <label htmlFor="category" className="form-label">
                Category <span className="required">*</span>
              </label>
              <select
                id="category" className="form-input"
                value={category} onChange={(e) => setCategory(e.target.value)}
                required
              >
                <option value="">Pick a category...</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

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
              <Link
                href={returnTo ? `/events/${returnTo}/challenges/add` : "/dashboard"}
                className="btn-cancel"
              >
                Cancel
              </Link>
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

export default function NewChallengePage() {
  return (
    <Suspense
      fallback={
        <div className="form-page">
          <main className="form-page-main">
            <div className="form-card">
              <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
                Loading...
              </p>
            </div>
          </main>
        </div>
      }
    >
      <NewChallengeForm />
    </Suspense>
  );
}

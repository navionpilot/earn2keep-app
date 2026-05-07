"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

type Challenge = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  unit: string | null;
  difficulty: string | null;
  default_rep_target: number | null;
  is_public: boolean;
  owner_id: string | null;
};

type EventChallenge = {
  id: string;
  challenge_id: string;
  rep_target: number | null;
};

const CATEGORIES = ["Sports", "Faith", "Scouts", "Fitness", "Academic", "Service"];

export default function AddChallengesPage() {
  const params = useParams();
  const eventId = params.id as string;
  const router = useRouter();

  const [eventName, setEventName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [allChallenges, setAllChallenges] = useState<Challenge[]>([]);
  const [existingEventChallenges, setExistingEventChallenges] = useState<EventChallenge[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingChallengeId, setSavingChallengeId] = useState<string | null>(null);
  const [addingBundle, setAddingBundle] = useState<string | null>(null);

  // Per-challenge rep target inputs (uncommitted)
  const [repTargets, setRepTargets] = useState<Record<string, string>>({});

  const fetchData = async () => {
    const supabase = createClient();

    const { data: event } = await supabase
      .from("events")
      .select("name, organization_id")
      .eq("id", eventId)
      .single();

    if (event) {
      setEventName(event.name);
      setOrgId(event.organization_id);
    }

    const { data: challenges } = await supabase
      .from("challenges")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    setAllChallenges(challenges || []);

    const { data: eventChallenges } = await supabase
      .from("event_challenges")
      .select("id, challenge_id, rep_target")
      .eq("event_id", eventId);

    setExistingEventChallenges(eventChallenges || []);

    // Pre-populate rep targets with default values
    const targets: Record<string, string> = {};
    (challenges || []).forEach((c) => {
      // If already in event, use existing rep_target
      const existing = (eventChallenges || []).find((ec) => ec.challenge_id === c.id);
      if (existing) {
        targets[c.id] = existing.rep_target?.toString() || "";
      } else {
        targets[c.id] = c.default_rep_target?.toString() || "";
      }
    });
    setRepTargets(targets);

    setFetching(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const filteredChallenges = useMemo(() => {
    if (activeCategory === "All") return allChallenges;
    return allChallenges.filter((c) => c.category === activeCategory);
  }, [allChallenges, activeCategory]);

  const isAssigned = (challengeId: string): boolean => {
    return existingEventChallenges.some((ec) => ec.challenge_id === challengeId);
  };

  const handleAddChallenge = async (challenge: Challenge) => {
    setError(null);
    setSavingChallengeId(challenge.id);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("You must be logged in."); setSavingChallengeId(null); return; }

    const repTarget = parseInt(repTargets[challenge.id] || "") || null;

    const existing = existingEventChallenges.find((ec) => ec.challenge_id === challenge.id);

    if (existing) {
      // Update existing
      const { error: updateError } = await supabase
        .from("event_challenges")
        .update({ rep_target: repTarget })
        .eq("id", existing.id);

      if (updateError) {
        setError(updateError.message);
        setSavingChallengeId(null);
        return;
      }
    } else {
      // Insert new
      const { error: insertError } = await supabase.from("event_challenges").insert({
        event_id: eventId,
        challenge_id: challenge.id,
        rep_target: repTarget,
        owner_id: user.id,
      });

      if (insertError) {
        setError(insertError.message);
        setSavingChallengeId(null);
        return;
      }
    }

    await fetchData();
    setSavingChallengeId(null);
  };

  const handleRemoveChallenge = async (challengeId: string) => {
    setError(null);
    setSavingChallengeId(challengeId);

    const supabase = createClient();
    const existing = existingEventChallenges.find((ec) => ec.challenge_id === challengeId);
    if (!existing) { setSavingChallengeId(null); return; }

    const { error: deleteError } = await supabase
      .from("event_challenges")
      .delete()
      .eq("id", existing.id);

    if (deleteError) {
      setError(deleteError.message);
      setSavingChallengeId(null);
      return;
    }

    await fetchData();
    setSavingChallengeId(null);
  };

  const handleAddBundle = async (category: string) => {
    setError(null);
    setAddingBundle(category);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("You must be logged in."); setAddingBundle(null); return; }

    const bundleChallenges = allChallenges.filter(
      (c) => c.category === category && !isAssigned(c.id)
    );

    if (bundleChallenges.length === 0) {
      setError("All challenges in this bundle are already added.");
      setAddingBundle(null);
      return;
    }

    const rows = bundleChallenges.map((c) => ({
      event_id: eventId,
      challenge_id: c.id,
      rep_target: c.default_rep_target,
      owner_id: user.id,
    }));

    const { error: insertError } = await supabase.from("event_challenges").insert(rows);

    if (insertError) {
      setError(insertError.message);
      setAddingBundle(null);
      return;
    }

    await fetchData();
    setAddingBundle(null);
  };

  // Group challenges by category for bundles section
  const challengesByCategory = useMemo(() => {
    const grouped: Record<string, Challenge[]> = {};
    allChallenges.forEach((c) => {
      if (!grouped[c.category]) grouped[c.category] = [];
      grouped[c.category].push(c);
    });
    return grouped;
  }, [allChallenges]);

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
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
          </Link>
          <Link href={`/events/${eventId}`} className="btn-link">← Back to Event</Link>
        </div>
      </header>

      <main className="dashboard-main">
        <Link href={`/events/${eventId}`} className="btn-back">
          ← Back to {eventName}
        </Link>

        <div className="breadcrumb">
          <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/events/${eventId}`} className="breadcrumb-link">{eventName}</Link>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-current">Add Challenges</span>
        </div>

        <h1 className="dashboard-welcome">Add Challenges</h1>
        <p className="dashboard-subtitle">
          Pick what your players or participants will do to earn sponsorships.
          Add individual challenges or grab a category bundle.
        </p>

        <div className="add-custom-bar">
          <div>
            <h3 className="add-custom-title">Don't see what you need?</h3>
            <p className="add-custom-text">Create your own custom challenge — visible only to you.</p>
          </div>
          <Link href={`/challenges/new?returnTo=${eventId}`} className="btn-add">
            + Create Custom Challenge
          </Link>
        </div>

        {/* Quick category bundles */}
        <div className="bundles-section">
          <h2 className="section-heading" style={{ marginBottom: "10px" }}>Quick Bundles</h2>
          <p className="form-section-hint" style={{ marginBottom: "14px" }}>
            One-click setup: add all challenges in a category at once with their default rep targets.
          </p>
          <div className="bundle-grid">
            {CATEGORIES.map((cat) => {
              const count = (challengesByCategory[cat] || []).length;
              const assignedInCat = (challengesByCategory[cat] || []).filter((c) =>
                isAssigned(c.id)
              ).length;
              if (count === 0) return null;

              return (
                <button
                  key={cat}
                  type="button"
                  className="bundle-card"
                  onClick={() => handleAddBundle(cat)}
                  disabled={addingBundle === cat || assignedInCat === count}
                >
                  <div className={`bundle-cat-icon cat-${cat.toLowerCase()}`}>
                    {cat === "Sports" && "🏃"}
                    {cat === "Faith" && "✝️"}
                    {cat === "Scouts" && "🏕"}
                    {cat === "Fitness" && "💪"}
                    {cat === "Academic" && "📚"}
                    {cat === "Service" && "🤝"}
                  </div>
                  <div className="bundle-cat-name">{cat}</div>
                  <div className="bundle-cat-count">
                    {assignedInCat === count
                      ? "All added ✓"
                      : `${count - assignedInCat} to add`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter chips */}
        <div className="section-header" style={{ marginTop: "32px", marginBottom: "12px" }}>
          <h2 className="section-heading">Browse Library</h2>
        </div>
        <div className="filter-chips">
          <button
            type="button"
            className={`filter-chip ${activeCategory === "All" ? "filter-chip-active" : ""}`}
            onClick={() => setActiveCategory("All")}
          >
            All ({allChallenges.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = (challengesByCategory[cat] || []).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                className={`filter-chip ${activeCategory === cat ? "filter-chip-active" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Challenge cards */}
        <div className="challenge-grid">
          {filteredChallenges.length === 0 ? (
            <p className="dashboard-card-text">
              No challenges in this category yet.
            </p>
          ) : (
            filteredChallenges.map((c) => {
              const assigned = isAssigned(c.id);
              const saving = savingChallengeId === c.id;

              return (
                <div
                  key={c.id}
                  className={`challenge-card ${assigned ? "challenge-card-active" : ""}`}
                >
                  <div className="challenge-card-header">
                    <span className={`challenge-cat-pill cat-${c.category.toLowerCase()}`}>
                      {c.category}
                    </span>
                    {!c.is_public && (
                      <span className="challenge-custom-pill">Custom</span>
                    )}
                    {c.difficulty && (
                      <span className={`challenge-diff-pill diff-${c.difficulty.toLowerCase()}`}>
                        {c.difficulty}
                      </span>
                    )}
                  </div>
                  <h3 className="challenge-card-name">{c.name}</h3>
                  {c.description && (
                    <p className="challenge-card-desc">{c.description}</p>
                  )}
                  <div className="challenge-card-target">
                    <label htmlFor={`target-${c.id}`} className="challenge-target-label">
                      Rep target:
                    </label>
                    <input
                      id={`target-${c.id}`}
                      type="number"
                      className="challenge-target-input"
                      value={repTargets[c.id] || ""}
                      onChange={(e) =>
                        setRepTargets({ ...repTargets, [c.id]: e.target.value })
                      }
                      min="1"
                      placeholder="—"
                    />
                    <span className="challenge-target-unit">{c.unit}</span>
                  </div>

                  <div className="challenge-card-actions">
                    {assigned ? (
                      <>
                        <button
                          type="button"
                          className="btn-update"
                          onClick={() => handleAddChallenge(c)}
                          disabled={saving}
                        >
                          {saving ? "..." : "Update target"}
                        </button>
                        <button
                          type="button"
                          className="btn-remove"
                          onClick={() => handleRemoveChallenge(c.id)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-add-challenge"
                        onClick={() => handleAddChallenge(c)}
                        disabled={saving}
                      >
                        {saving ? "Adding..." : "+ Add to Event"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <Link href={`/events/${eventId}`} className="btn-primary-link">
            Done — Back to Event →
          </Link>
        </div>
      </main>
    </div>
  );
}

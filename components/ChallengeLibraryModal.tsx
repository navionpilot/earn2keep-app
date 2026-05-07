"use client";

import { useState, useMemo } from "react";

export type LibraryChallenge = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory_id: string | null;
  unit: string | null;
  difficulty: string | null;
  default_rep_target: number | null;
  is_public: boolean;
};

export type LibrarySubcategory = {
  id: string;
  parent_category: string;
  name: string;
  is_public: boolean;
};

const CATEGORIES = ["Sports", "Faith", "Scouts", "Fitness", "Academic", "Service"];

interface ChallengeLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onSelectChallenge: (challenge: LibraryChallenge, repTarget: number) => void;
  challenges: LibraryChallenge[];
  // Subcategories (so we can show "Sports → Soccer" labels and filter)
  subcategories: LibrarySubcategory[];
  // Challenge IDs already on the current day (so we can show "Already on this day")
  alreadyOnDay: Set<string>;
  selectedDateLabel: string; // e.g., "Wed, June 3"
  // Custom challenge creation link
  createCustomHref: string;
  // Bulk import link
  bulkImportHref: string;
}

export default function ChallengeLibraryModal({
  open,
  onClose,
  onSelectChallenge,
  challenges,
  subcategories,
  alreadyOnDay,
  selectedDateLabel,
  createCustomHref,
  bulkImportHref,
}: ChallengeLibraryModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [pendingChallenge, setPendingChallenge] = useState<LibraryChallenge | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string>("");

  // Build subcategory lookup map
  const subcategoryById = useMemo(() => {
    const map: Record<string, LibrarySubcategory> = {};
    subcategories.forEach((s) => { map[s.id] = s; });
    return map;
  }, [subcategories]);

  // Subcategories visible for the active category
  const subsForActiveCategory = useMemo(() => {
    if (activeCategory === "All") return [];
    return subcategories.filter((s) => s.parent_category === activeCategory);
  }, [subcategories, activeCategory]);

  // Reset subcategory filter when category changes
  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setActiveSubcategoryId("");
  };

  const filtered = useMemo(() => {
    let list = challenges;
    if (activeCategory !== "All") {
      list = list.filter((c) => c.category === activeCategory);
    }
    if (activeSubcategoryId) {
      list = list.filter((c) => c.subcategory_id === activeSubcategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [challenges, activeCategory, search]);

  if (!open) return null;

  const handleAddClick = (c: LibraryChallenge) => {
    if (alreadyOnDay.has(c.id)) return;
    setPendingChallenge(c);
    setPendingTarget(c.default_rep_target?.toString() || "");
  };

  const handleConfirm = () => {
    if (!pendingChallenge) return;
    const target = parseInt(pendingTarget) || pendingChallenge.default_rep_target || 1;
    onSelectChallenge(pendingChallenge, target);
    setPendingChallenge(null);
    setPendingTarget("");
  };

  const handleCancel = () => {
    setPendingChallenge(null);
    setPendingTarget("");
  };

  const countByCategory = (cat: string) => {
    if (cat === "All") return challenges.length;
    return challenges.filter((c) => c.category === cat).length;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">★ Add Challenge ★</div>
            <h2 className="modal-title">Pick a challenge for {selectedDateLabel}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {pendingChallenge ? (
          <div className="modal-body">
            <div className="rep-target-form">
              <h3 className="rep-target-title">{pendingChallenge.name}</h3>
              {pendingChallenge.description && (
                <p className="rep-target-desc">{pendingChallenge.description}</p>
              )}
              <label htmlFor="repTarget" className="form-label">
                Rep target for this day:
              </label>
              <div className="rep-target-input-wrap">
                <input
                  id="repTarget"
                  type="number"
                  min="1"
                  className="form-input rep-target-input"
                  value={pendingTarget}
                  onChange={(e) => setPendingTarget(e.target.value)}
                  autoFocus
                />
                <span className="rep-target-unit">{pendingChallenge.unit || "reps"}</span>
              </div>
              <p className="form-hint">
                How many {pendingChallenge.unit || "reps"} should each player complete on this day?
              </p>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={handleCancel}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary btn-inline"
                  onClick={handleConfirm}
                  disabled={!pendingTarget || parseInt(pendingTarget) <= 0}
                >
                  Add to {selectedDateLabel}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="library-toolbar">
              <input
                type="text"
                className="form-input library-search"
                placeholder="Search challenges..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <a href={bulkImportHref} className="btn-secondary-link library-custom-btn" title="Upload many challenges from a CSV file">
                📥 Bulk
              </a>
              <a href={createCustomHref} className="btn-secondary-link library-custom-btn">
                + Custom
              </a>
            </div>

            <div className="filter-chips">
              <button
                type="button"
                className={`filter-chip ${activeCategory === "All" ? "filter-chip-active" : ""}`}
                onClick={() => handleCategoryChange("All")}
              >
                All ({countByCategory("All")})
              </button>
              {CATEGORIES.map((cat) => {
                const cnt = countByCategory(cat);
                if (cnt === 0) return null;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`filter-chip ${activeCategory === cat ? "filter-chip-active" : ""}`}
                    onClick={() => handleCategoryChange(cat)}
                  >
                    {cat} ({cnt})
                  </button>
                );
              })}
            </div>

            {activeCategory !== "All" && subsForActiveCategory.length > 0 && (
              <div className="filter-chips filter-chips-subcategory">
                <span className="filter-chips-label">Filter by {activeCategory === "Sports" ? "sport" : "subcategory"}:</span>
                <button
                  type="button"
                  className={`filter-chip filter-chip-sub ${activeSubcategoryId === "" ? "filter-chip-active" : ""}`}
                  onClick={() => setActiveSubcategoryId("")}
                >
                  All
                </button>
                {subsForActiveCategory.map((sub) => {
                  // Count matching challenges (in current category, this subcategory)
                  const cnt = challenges.filter(
                    (c) => c.category === activeCategory && c.subcategory_id === sub.id
                  ).length;
                  if (cnt === 0) return null;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      className={`filter-chip filter-chip-sub ${activeSubcategoryId === sub.id ? "filter-chip-active" : ""}`}
                      onClick={() => setActiveSubcategoryId(sub.id)}
                    >
                      {sub.name}{!sub.is_public ? " ✦" : ""} ({cnt})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="library-grid">
              {filtered.length === 0 ? (
                <p className="dashboard-card-text">
                  No challenges match. Try a different filter or create a custom one.
                </p>
              ) : (
                filtered.map((c) => {
                  const already = alreadyOnDay.has(c.id);
                  const sub = c.subcategory_id ? subcategoryById[c.subcategory_id] : null;
                  return (
                    <div
                      key={c.id}
                      className={`library-card ${already ? "library-card-disabled" : ""}`}
                    >
                      <div className="library-card-header">
                        <span className={`challenge-cat-pill cat-${c.category.toLowerCase()}`}>
                          {sub ? `${c.category} › ${sub.name}` : c.category}
                        </span>
                        {!c.is_public && <span className="challenge-custom-pill">Custom</span>}
                        {c.difficulty && (
                          <span className={`challenge-diff-pill diff-${c.difficulty.toLowerCase()}`}>
                            {c.difficulty}
                          </span>
                        )}
                      </div>
                      <h4 className="library-card-name">{c.name}</h4>
                      {c.description && <p className="library-card-desc">{c.description}</p>}
                      <div className="library-card-meta">
                        Default: {c.default_rep_target || "—"} {c.unit}
                      </div>
                      <button
                        type="button"
                        className={already ? "btn-already-added" : "btn-add-challenge"}
                        disabled={already}
                        onClick={() => handleAddClick(c)}
                      >
                        {already ? "✓ Already on this day" : "+ Add"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";

export type LibraryChallenge = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  unit: string | null;
  difficulty: string | null;
  default_rep_target: number | null;
  is_public: boolean;
};

const CATEGORIES = ["Sports", "Faith", "Scouts", "Fitness", "Academic", "Service"];

interface ChallengeLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onSelectChallenge: (challenge: LibraryChallenge, repTarget: number) => void;
  challenges: LibraryChallenge[];
  // Challenge IDs already on the current day (so we can show "Already on this day")
  alreadyOnDay: Set<string>;
  selectedDateLabel: string; // e.g., "Wed, June 3"
  // Custom challenge creation link
  createCustomHref: string;
}

export default function ChallengeLibraryModal({
  open,
  onClose,
  onSelectChallenge,
  challenges,
  alreadyOnDay,
  selectedDateLabel,
  createCustomHref,
}: ChallengeLibraryModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [pendingChallenge, setPendingChallenge] = useState<LibraryChallenge | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string>("");

  const filtered = useMemo(() => {
    let list = challenges;
    if (activeCategory !== "All") {
      list = list.filter((c) => c.category === activeCategory);
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
              <a href={createCustomHref} className="btn-secondary-link library-custom-btn">
                + Custom
              </a>
            </div>

            <div className="filter-chips">
              <button
                type="button"
                className={`filter-chip ${activeCategory === "All" ? "filter-chip-active" : ""}`}
                onClick={() => setActiveCategory("All")}
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
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat} ({cnt})
                  </button>
                );
              })}
            </div>

            <div className="library-grid">
              {filtered.length === 0 ? (
                <p className="dashboard-card-text">
                  No challenges match. Try a different category or create a custom one.
                </p>
              ) : (
                filtered.map((c) => {
                  const already = alreadyOnDay.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`library-card ${already ? "library-card-disabled" : ""}`}
                    >
                      <div className="library-card-header">
                        <span className={`challenge-cat-pill cat-${c.category.toLowerCase()}`}>
                          {c.category}
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

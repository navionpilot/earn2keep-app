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
  owner_id: string | null;
  setup_template_key?: string | null;
  recording_instructions?: string | null;
  verification_mode?: string | null;
  // Slice 4.5.4 — Reference photo fields
  reference_photo_url?: string | null;
  reference_photo_caption?: string | null;
};

export type LibrarySubcategory = {
  id: string;
  parent_category: string;
  name: string;
  is_public: boolean;
  parent_subcategory_id: string | null;
};

const CATEGORIES = ["Sports", "Faith", "Scouts", "Fitness", "Academic", "Service"];

// Recording template icons (mirrors lib/recordingRecommender.ts)
const TEMPLATE_ICONS: Record<string, string> = {
  side_angle_floor: "📱",
  selfie_audio: "🤳",
  behind_player_target: "🎯",
  top_down_closeup: "🔍",
  gps_with_endpoints: "📍",
  photo_completion: "📷",
  wide_angle_court: "🏟",
  selfie_with_object: "✋",
  custom: "✏️",
};

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
  // For management actions
  currentUserId: string;
  isAdmin: boolean;
  // Called with array of challenges that the user wants to delete; parent handles
  // showing the DeleteChallengeModal and refetching the library after success.
  onRequestDelete: (challenges: LibraryChallenge[]) => void;
  // Builds the URL the modal should send the user to when they click Edit on a
  // challenge in manage mode. Parent owns the URL (returnTo etc.) so the
  // modal stays page-agnostic.
  editHrefForChallenge: (challengeId: string) => string;
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
  currentUserId,
  isAdmin,
  onRequestDelete,
  editHrefForChallenge,
}: ChallengeLibraryModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<string>("");
  const [activeSubSubcategoryId, setActiveSubSubcategoryId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [pendingChallenge, setPendingChallenge] = useState<LibraryChallenge | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string>("");
  // Slice 5.7: track which library cards are expanded to show full details.
  // Click "▾ More details" to expand, "▴ Minimize" or the toggle again to
  // collapse. Set of challenge IDs.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  // Manage-mode state
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Helper: can the current user delete this challenge?
  // The same rules govern editing (admin can edit anything; everyone else can
  // only edit/delete their own private challenges). Backed by RLS on the
  // challenges table — even if someone hand-crafted the URL the DB refuses.
  const canDelete = (c: LibraryChallenge): boolean => {
    if (isAdmin) return true;
    if (c.is_public) return false;
    return c.owner_id === currentUserId;
  };

  const exitManageMode = () => {
    setManageMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build subcategory lookup map
  const subcategoryById = useMemo(() => {
    const map: Record<string, LibrarySubcategory> = {};
    subcategories.forEach((s) => { map[s.id] = s; });
    return map;
  }, [subcategories]);

  // Tier 2 subcategories under the active category
  const tier2ForActiveCategory = useMemo(() => {
    if (activeCategory === "All") return [];
    return subcategories.filter(
      (s) => s.parent_category === activeCategory && s.parent_subcategory_id === null
    );
  }, [subcategories, activeCategory]);

  // Tier 3 sub-subcategories under the active Tier 2
  const tier3ForActiveSubcategory = useMemo(() => {
    if (!activeSubcategoryId) return [];
    return subcategories.filter((s) => s.parent_subcategory_id === activeSubcategoryId);
  }, [subcategories, activeSubcategoryId]);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setActiveSubcategoryId("");
    setActiveSubSubcategoryId("");
  };

  const handleSubcategoryChange = (id: string) => {
    setActiveSubcategoryId(id);
    setActiveSubSubcategoryId("");
  };

  // Build the full hierarchy path string for display on each card
  const getHierarchyPath = (challenge: LibraryChallenge): string => {
    const parts: string[] = [challenge.category];
    if (challenge.subcategory_id) {
      const sub = subcategoryById[challenge.subcategory_id];
      if (sub) {
        if (sub.parent_subcategory_id) {
          const parent = subcategoryById[sub.parent_subcategory_id];
          if (parent) parts.push(parent.name);
        }
        parts.push(sub.name);
      }
    }
    return parts.join(" › ");
  };

  const filtered = useMemo(() => {
    let list = challenges;
    if (activeCategory !== "All") {
      list = list.filter((c) => c.category === activeCategory);
    }
    if (activeSubcategoryId) {
      // Match if the challenge's subcategory IS the active Tier 2,
      // OR is a Tier 3 whose parent is the active Tier 2
      list = list.filter((c) => {
        if (!c.subcategory_id) return false;
        const sub = subcategoryById[c.subcategory_id];
        if (!sub) return false;
        if (sub.id === activeSubcategoryId) return true;
        if (sub.parent_subcategory_id === activeSubcategoryId) return true;
        return false;
      });
    }
    if (activeSubSubcategoryId) {
      list = list.filter((c) => c.subcategory_id === activeSubSubcategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [challenges, activeCategory, activeSubcategoryId, activeSubSubcategoryId, search, subcategoryById]);

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
              {pendingChallenge.reference_photo_url && (
                <div className="rep-target-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingChallenge.reference_photo_url}
                    alt={pendingChallenge.reference_photo_caption || "Reference photo"}
                  />
                  {pendingChallenge.reference_photo_caption && (
                    <p className="rep-target-photo-caption">
                      {pendingChallenge.reference_photo_caption}
                    </p>
                  )}
                </div>
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
              {manageMode ? (
                <button
                  type="button"
                  className="btn-secondary library-custom-btn"
                  onClick={exitManageMode}
                  title="Exit manage mode"
                >
                  ✓ Done managing
                </button>
              ) : (
                <>
                  <a href={bulkImportHref} className="btn-secondary-link library-custom-btn" title="Upload many challenges from a CSV file">
                    📥 Bulk
                  </a>
                  <a href={createCustomHref} className="btn-secondary-link library-custom-btn">
                    + Custom
                  </a>
                  <button
                    type="button"
                    className="btn-secondary library-custom-btn"
                    onClick={() => setManageMode(true)}
                    title="Select multiple challenges to delete"
                  >
                    ✏ Manage
                  </button>
                </>
              )}
            </div>

            {manageMode && (
              <div className="library-manage-banner">
                <div className="library-manage-banner-text">
                  <strong>Manage mode</strong>
                  {isAdmin
                    ? <> — edit or delete any challenge in the library. As admin, your changes apply for every organizer.</>
                    : <> — edit or delete challenges you created. Public/seeded library challenges can only be modified by the platform admin.</>}
                </div>
                <div className="library-manage-banner-actions">
                  {selectedIds.size > 0 && (
                    <span className="library-manage-count">
                      {selectedIds.size} selected
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ fontSize: "12px", padding: "6px 14px" }}
                    disabled={selectedIds.size === 0}
                    onClick={() => {
                      const toDelete = challenges.filter((c) => selectedIds.has(c.id));
                      onRequestDelete(toDelete);
                    }}
                  >
                    🗑 Delete {selectedIds.size > 0 ? selectedIds.size : ""} selected
                  </button>
                </div>
              </div>
            )}

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

            {activeCategory !== "All" && tier2ForActiveCategory.length > 0 && (
              <div className="filter-chips filter-chips-subcategory">
                <span className="filter-chips-label">Filter by {activeCategory === "Sports" ? "sport" : "subcategory"}:</span>
                <button
                  type="button"
                  className={`filter-chip filter-chip-sub ${activeSubcategoryId === "" ? "filter-chip-active" : ""}`}
                  onClick={() => handleSubcategoryChange("")}
                >
                  All
                </button>
                {tier2ForActiveCategory.map((sub) => {
                  // Count matching challenges (in this Tier 2 directly OR any Tier 3 under it)
                  const cnt = challenges.filter((c) => {
                    if (c.category !== activeCategory || !c.subcategory_id) return false;
                    const cSub = subcategoryById[c.subcategory_id];
                    if (!cSub) return false;
                    if (cSub.id === sub.id) return true;
                    if (cSub.parent_subcategory_id === sub.id) return true;
                    return false;
                  }).length;
                  if (cnt === 0) return null;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      className={`filter-chip filter-chip-sub ${activeSubcategoryId === sub.id ? "filter-chip-active" : ""}`}
                      onClick={() => handleSubcategoryChange(sub.id)}
                    >
                      {sub.name}{!sub.is_public ? " ✦" : ""} ({cnt})
                    </button>
                  );
                })}
              </div>
            )}

            {activeSubcategoryId && tier3ForActiveSubcategory.length > 0 && (
              <div className="filter-chips filter-chips-subsubcategory">
                <span className="filter-chips-label">Filter by skill type:</span>
                <button
                  type="button"
                  className={`filter-chip filter-chip-subsub ${activeSubSubcategoryId === "" ? "filter-chip-active" : ""}`}
                  onClick={() => setActiveSubSubcategoryId("")}
                >
                  All
                </button>
                {tier3ForActiveSubcategory.map((sub) => {
                  const cnt = challenges.filter((c) => c.subcategory_id === sub.id).length;
                  if (cnt === 0) return null;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      className={`filter-chip filter-chip-subsub ${activeSubSubcategoryId === sub.id ? "filter-chip-active" : ""}`}
                      onClick={() => setActiveSubSubcategoryId(sub.id)}
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
                  const hierarchyPath = getHierarchyPath(c);
                  const recIcon = c.setup_template_key ? TEMPLATE_ICONS[c.setup_template_key] : null;
                  const userCanDelete = canDelete(c);
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`library-card ${already && !manageMode ? "library-card-disabled" : ""} ${isSelected ? "library-card-selected" : ""} ${manageMode && !userCanDelete ? "library-card-locked" : ""}`}
                    >
                      {manageMode && (
                        <div className="library-card-manage-overlay">
                          {userCanDelete ? (
                            <label className="library-card-checkbox-label">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelected(c.id)}
                              />
                              <span>{isSelected ? "Selected" : "Select"}</span>
                            </label>
                          ) : (
                            <span className="library-card-locked-label" title="Public/seeded challenges can only be deleted by the platform admin">
                              🔒 Library
                            </span>
                          )}
                        </div>
                      )}

                      {c.reference_photo_url && (
                        <div className="library-card-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={c.reference_photo_url}
                            alt={c.reference_photo_caption || c.name}
                            loading="lazy"
                          />
                        </div>
                      )}

                      <div className="library-card-header">
                        <span className={`challenge-cat-pill cat-${c.category.toLowerCase()}`}>
                          {hierarchyPath}
                        </span>
                        {!c.is_public && <span className="challenge-custom-pill">Custom</span>}
                        {c.difficulty && (
                          <span className={`challenge-diff-pill diff-${c.difficulty.toLowerCase()}`}>
                            {c.difficulty}
                          </span>
                        )}
                        {recIcon && (
                          <span
                            className="library-card-rec-icon"
                            title={`Recording template: ${c.setup_template_key}`}
                          >
                            {recIcon}
                          </span>
                        )}
                      </div>
                      <h4 className="library-card-name">{c.name}</h4>
                      {c.description && <p className="library-card-desc">{c.description}</p>}
                      <div className="library-card-meta">
                        Default: {c.default_rep_target || "—"} {c.unit}
                      </div>

                      {/* Slice 5.7: click "More details" to expand the card.
                          Reveals recording setup, verification rules, etc.
                          Hidden in manage mode (Edit/Delete row already
                          consumes the bottom of the card). */}
                      {(c.recording_instructions || c.verification_mode || c.setup_template_key) &&
                        !manageMode && (
                          <>
                            <button
                              type="button"
                              className="library-card-expand-toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(c.id);
                              }}
                              aria-expanded={expandedIds.has(c.id)}
                            >
                              {expandedIds.has(c.id) ? "▴ Less details" : "▾ More details"}
                            </button>
                            {expandedIds.has(c.id) && (
                              <div className="library-card-expanded">
                                {c.setup_template_key && (
                                  <div className="library-card-expanded-block">
                                    <div className="library-card-expanded-label">
                                      📱 Recording setup
                                    </div>
                                    <div className="library-card-expanded-value">
                                      {c.setup_template_key
                                        .replace(/_/g, " ")
                                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                                    </div>
                                  </div>
                                )}
                                {c.recording_instructions && (
                                  <div className="library-card-expanded-block">
                                    <div className="library-card-expanded-label">
                                      Setup instructions
                                    </div>
                                    <div className="library-card-expanded-text">
                                      {c.recording_instructions
                                        .split("\n\n")
                                        .map((para, i) => (
                                          <p key={i}>{para}</p>
                                        ))}
                                    </div>
                                  </div>
                                )}
                                {c.verification_mode && (
                                  <div className="library-card-expanded-block">
                                    <div className="library-card-expanded-label">
                                      Verification
                                    </div>
                                    <div className="library-card-expanded-value">
                                      {c.verification_mode === "ai_only"
                                        ? "AI verification only — instant scoring"
                                        : c.verification_mode === "coach_only"
                                        ? "Coach review required"
                                        : c.verification_mode === "ai_then_coach"
                                        ? "AI pre-screen, organizer confirms"
                                        : c.verification_mode}
                                    </div>
                                  </div>
                                )}
                                {c.reference_photo_caption && (
                                  <div className="library-card-expanded-block">
                                    <div className="library-card-expanded-label">
                                      🖼 Reference photo
                                    </div>
                                    <div className="library-card-expanded-text">
                                      {c.reference_photo_caption}
                                    </div>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  className="library-card-expanded-close"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpanded(c.id);
                                  }}
                                >
                                  ▴ Minimize
                                </button>
                              </div>
                            )}
                          </>
                        )}

                      {manageMode ? (
                        userCanDelete ? (
                          // Side-by-side Edit + Delete in manage mode. Both
                          // gated by RLS server-side, so even if someone
                          // hand-crafted the URL the database would refuse.
                          <div className="library-card-actions-row">
                            <a
                              href={editHrefForChallenge(c.id)}
                              className="library-card-edit-btn"
                              title="Edit this challenge"
                            >
                              ✏ Edit
                            </a>
                            <button
                              type="button"
                              className="btn-danger library-card-delete-btn"
                              onClick={() => onRequestDelete([c])}
                              title="Delete this challenge permanently"
                            >
                              🗑 Delete
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-already-added"
                            disabled
                          >
                            🔒 Admin only
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className={already ? "btn-already-added" : "btn-add-challenge"}
                          disabled={already}
                          onClick={() => handleAddClick(c)}
                        >
                          {already ? "✓ Already on this day" : "+ Add"}
                        </button>
                      )}
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

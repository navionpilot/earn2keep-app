"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

export type Subcategory = {
  id: string;
  parent_category: string;
  name: string;
  display_order: number;
  is_public: boolean;
  organization_id: string | null;
  parent_subcategory_id: string | null; // null = Tier 2; otherwise = Tier 3 child of that parent
};

const CATEGORIES = ["Sports", "Faith", "Fitness", "Academic", "Scouts", "Service"];

// Categories where a Tier 2 subcategory MUST be selected
const SUBCATEGORY_REQUIRED = new Set(["Sports"]);

// Hardcoded admin email (mirrored across the codebase). When admin creates a
// new subcategory on the fly from the create/edit challenge form, it gets
// auto-published to the public library (is_public=true, organization_id=null)
// so it shows up for every coach. Regular users' on-the-fly subcategories
// stay scoped to their own org.
const ADMIN_EMAIL = "waylon.hdd@comcast.net";

interface CategoryHierarchyPickerProps {
  category: string;
  setCategory: (cat: string) => void;

  // Tier 2 — the subcategory (e.g. Soccer under Sports)
  subcategoryId: string | null;
  setSubcategoryId: (id: string | null) => void;

  // Tier 3 — the optional sub-subcategory (e.g. Ball Control under Sports > Soccer)
  subSubcategoryId: string | null;
  setSubSubcategoryId: (id: string | null) => void;

  // Org context — needed when adding new private subcategories
  organizationId: string;
  // Full list of subcategories (parent provides this so it can also use them elsewhere)
  subcategories: Subcategory[];
  // Callback when a new subcategory is created (parent updates its list)
  onSubcategoryCreated: (newSub: Subcategory) => void;
}

export default function CategoryHierarchyPicker({
  category,
  setCategory,
  subcategoryId,
  setSubcategoryId,
  subSubcategoryId,
  setSubSubcategoryId,
  organizationId,
  subcategories,
  onSubcategoryCreated,
}: CategoryHierarchyPickerProps) {
  // Add-new flow state for Tier 2
  const [showAddTier2, setShowAddTier2] = useState(false);
  const [newTier2Name, setNewTier2Name] = useState("");
  const [addingTier2, setAddingTier2] = useState(false);
  const [addTier2Error, setAddTier2Error] = useState<string | null>(null);

  // Add-new flow state for Tier 3
  const [showAddTier3, setShowAddTier3] = useState(false);
  const [newTier3Name, setNewTier3Name] = useState("");
  const [addingTier3, setAddingTier3] = useState(false);
  const [addTier3Error, setAddTier3Error] = useState<string | null>(null);

  // Tier 2 subcategories visible for the active category
  const tier2Subs = useMemo(() => {
    return subcategories.filter(
      (s) => s.parent_category === category && s.parent_subcategory_id === null
    );
  }, [subcategories, category]);

  // Tier 3 subcategories visible for the active Tier 2 subcategory
  const tier3Subs = useMemo(() => {
    if (!subcategoryId) return [];
    return subcategories.filter((s) => s.parent_subcategory_id === subcategoryId);
  }, [subcategories, subcategoryId]);

  const isTier2Required = SUBCATEGORY_REQUIRED.has(category);

  // Reset Tier 2 when category changes (since old Tier 2 won't match)
  useEffect(() => {
    if (subcategoryId) {
      const sub = subcategories.find((s) => s.id === subcategoryId);
      if (sub && sub.parent_category !== category) {
        setSubcategoryId(null);
        setSubSubcategoryId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Reset Tier 3 when Tier 2 changes
  useEffect(() => {
    if (subSubcategoryId) {
      const sub = subcategories.find((s) => s.id === subSubcategoryId);
      if (sub && sub.parent_subcategory_id !== subcategoryId) {
        setSubSubcategoryId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategoryId]);

  const handleTier2Change = (value: string) => {
    if (value === "__ADD_NEW__") {
      setShowAddTier2(true);
      return;
    }
    setSubcategoryId(value || null);
    setSubSubcategoryId(null); // reset tier 3 when tier 2 changes
  };

  const handleTier3Change = (value: string) => {
    if (value === "__ADD_NEW__") {
      setShowAddTier3(true);
      return;
    }
    setSubSubcategoryId(value || null);
  };

  const handleAddTier2 = async () => {
    setAddTier2Error(null);
    const trimmed = newTier2Name.trim();
    if (!trimmed) {
      setAddTier2Error("Name is required.");
      return;
    }
    if (trimmed.length > 60) {
      setAddTier2Error("Name must be 60 characters or fewer.");
      return;
    }

    // Duplicate check (case-insensitive) within visible Tier 2s
    const dup = tier2Subs.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) {
      setAddTier2Error(`"${trimmed}" already exists in ${category}. Pick it from the list above.`);
      return;
    }

    setAddingTier2(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddTier2Error("Not logged in."); setAddingTier2(false); return; }

    // Admin's on-the-fly subcategories publish globally (matches the bulk-import
    // and admin/subcategories conventions). Everyone else's stay private.
    const userIsAdmin = user.email === ADMIN_EMAIL;

    const { data: newSub, error: insErr } = await supabase
      .from("challenge_subcategories")
      .insert({
        parent_category: category,
        parent_subcategory_id: null,
        name: trimmed,
        display_order: 500,
        is_public: userIsAdmin,
        organization_id: userIsAdmin ? null : organizationId,
        created_by: user.id,
      })
      .select()
      .single();

    if (insErr || !newSub) {
      setAddTier2Error(insErr?.message || "Failed to create.");
      setAddingTier2(false);
      return;
    }

    onSubcategoryCreated(newSub as any);
    setSubcategoryId(newSub.id);
    setNewTier2Name("");
    setShowAddTier2(false);
    setAddingTier2(false);
  };

  const handleAddTier3 = async () => {
    setAddTier3Error(null);
    const trimmed = newTier3Name.trim();
    if (!trimmed) {
      setAddTier3Error("Name is required.");
      return;
    }
    if (trimmed.length > 60) {
      setAddTier3Error("Name must be 60 characters or fewer.");
      return;
    }
    if (!subcategoryId) {
      setAddTier3Error("Pick a parent subcategory first.");
      return;
    }

    // Duplicate check within current Tier 3 list
    const dup = tier3Subs.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) {
      setAddTier3Error(`"${trimmed}" already exists here. Pick it from the list above.`);
      return;
    }

    setAddingTier3(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddTier3Error("Not logged in."); setAddingTier3(false); return; }

    // Same admin-aware visibility rule as Tier 2 (above).
    const userIsAdmin = user.email === ADMIN_EMAIL;

    const { data: newSub, error: insErr } = await supabase
      .from("challenge_subcategories")
      .insert({
        parent_category: category,
        parent_subcategory_id: subcategoryId,
        name: trimmed,
        display_order: 500,
        is_public: userIsAdmin,
        organization_id: userIsAdmin ? null : organizationId,
        created_by: user.id,
      })
      .select()
      .single();

    if (insErr || !newSub) {
      setAddTier3Error(insErr?.message || "Failed to create.");
      setAddingTier3(false);
      return;
    }

    onSubcategoryCreated(newSub as any);
    setSubSubcategoryId(newSub.id);
    setNewTier3Name("");
    setShowAddTier3(false);
    setAddingTier3(false);
  };

  // Find the current Tier 2 to label the Tier 3 dropdown nicely
  const currentTier2 = subcategoryId ? subcategories.find((s) => s.id === subcategoryId) : null;
  const tier2Label = category === "Sports" ? "Sport" : "Subcategory";
  const tier3Label = currentTier2
    ? `Sub-type within ${currentTier2.name}`
    : "Sub-type";

  return (
    <div className="hierarchy-picker">
      {/* TIER 1 — Category */}
      <div>
        <label htmlFor="category" className="form-label">
          Category <span className="required">*</span>
        </label>
        <select
          id="category"
          className="form-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        >
          <option value="">Select a category...</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* TIER 2 — Subcategory */}
      {category && (
        <div className="hierarchy-tier-2">
          <label htmlFor="subcategory" className="form-label">
            {tier2Label}
            {isTier2Required ? <span className="required"> *</span> : <span className="form-label-optional"> (optional)</span>}
          </label>

          {!showAddTier2 ? (
            <>
              <select
                id="subcategory"
                className="form-input"
                value={subcategoryId || ""}
                onChange={(e) => handleTier2Change(e.target.value)}
                required={isTier2Required}
              >
                <option value="">
                  {isTier2Required ? `Select a ${tier2Label.toLowerCase()}...` : "(none — leave blank for general)"}
                </option>
                {tier2Subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{!s.is_public ? " (custom)" : ""}
                  </option>
                ))}
                <option value="__ADD_NEW__">+ Add new {tier2Label.toLowerCase()}...</option>
              </select>
              <p className="form-hint">
                {category === "Sports"
                  ? "Pick the sport this challenge applies to. Don't see yours? Add a new one."
                  : "Optional: pick a more specific subcategory, or leave blank for a general challenge."}
                {" "}New entries will be private to your organization.
              </p>
            </>
          ) : (
            <div className="subcategory-add-form">
              <p className="subcategory-add-form-title">
                Add new {tier2Label.toLowerCase()} to {category}
              </p>
              <p className="subcategory-add-form-hint">
                This will be private to your organization. Admins can promote popular ones to global later.
              </p>
              <input
                type="text"
                className="form-input"
                placeholder={category === "Sports" ? "e.g., Pickleball, Disc Golf, Badminton" : "e.g., Custom subcategory name"}
                value={newTier2Name}
                onChange={(e) => setNewTier2Name(e.target.value)}
                maxLength={60}
                autoFocus
              />
              {addTier2Error && (
                <div className="alert alert-error" style={{ marginTop: "8px" }}>{addTier2Error}</div>
              )}
              <div className="subcategory-add-form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => { setShowAddTier2(false); setNewTier2Name(""); setAddTier2Error(null); }}
                  disabled={addingTier2}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-inline"
                  onClick={handleAddTier2}
                  disabled={addingTier2 || !newTier2Name.trim()}
                >
                  {addingTier2 ? "Adding..." : `Add to ${category}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TIER 3 — Sub-subcategory (only when Tier 2 is picked) */}
      {category && subcategoryId && (
        <div className="hierarchy-tier-3">
          <label htmlFor="subSubcategory" className="form-label">
            {tier3Label}
            <span className="form-label-optional"> (optional)</span>
          </label>

          {!showAddTier3 ? (
            <>
              <select
                id="subSubcategory"
                className="form-input"
                value={subSubcategoryId || ""}
                onChange={(e) => handleTier3Change(e.target.value)}
              >
                <option value="">(none — file directly under {currentTier2?.name})</option>
                {tier3Subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{!s.is_public ? " (custom)" : ""}
                  </option>
                ))}
                <option value="__ADD_NEW__">+ Add new sub-type under {currentTier2?.name}...</option>
              </select>
              <p className="form-hint">
                Use this for skill types or focus areas within {currentTier2?.name}
                {category === "Sports" ? " — like 'Ball Control', 'Passing', 'Shooting', etc." : ""}.
                Leave blank if not needed.
              </p>
            </>
          ) : (
            <div className="subcategory-add-form">
              <p className="subcategory-add-form-title">
                Add new sub-type under {currentTier2?.name}
              </p>
              <p className="subcategory-add-form-hint">
                This will be private to your organization. Use it to group challenges by skill type, focus area, or theme.
              </p>
              <input
                type="text"
                className="form-input"
                placeholder={
                  category === "Sports"
                    ? "e.g., Ball Control, Passing, Shooting, Dribbling"
                    : category === "Faith"
                      ? "e.g., Old Testament, New Testament, Psalms"
                      : "e.g., Sub-type name"
                }
                value={newTier3Name}
                onChange={(e) => setNewTier3Name(e.target.value)}
                maxLength={60}
                autoFocus
              />
              {addTier3Error && (
                <div className="alert alert-error" style={{ marginTop: "8px" }}>{addTier3Error}</div>
              )}
              <div className="subcategory-add-form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => { setShowAddTier3(false); setNewTier3Name(""); setAddTier3Error(null); }}
                  disabled={addingTier3}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-inline"
                  onClick={handleAddTier3}
                  disabled={addingTier3 || !newTier3Name.trim()}
                >
                  {addingTier3 ? "Adding..." : `Add to ${currentTier2?.name}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

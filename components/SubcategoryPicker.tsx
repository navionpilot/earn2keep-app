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
};

const CATEGORIES = ["Sports", "Faith", "Fitness", "Academic", "Scouts", "Service"];

// Categories where a subcategory MUST be selected
const SUBCATEGORY_REQUIRED = new Set(["Sports"]);

interface SubcategoryPickerProps {
  category: string;
  setCategory: (cat: string) => void;
  subcategoryId: string | null;
  setSubcategoryId: (id: string | null) => void;
  // Org context — needed when adding new private subcategories
  organizationId: string;
  // Optional: full list of subcategories already loaded (caller can pass to skip the fetch)
  subcategories?: Subcategory[];
  // Optional callback when a new subcategory is created (parent can refresh)
  onSubcategoryCreated?: (newSub: Subcategory) => void;
}

export default function SubcategoryPicker({
  category,
  setCategory,
  subcategoryId,
  setSubcategoryId,
  organizationId,
  subcategories: passedSubs,
  onSubcategoryCreated,
}: SubcategoryPickerProps) {
  const [internalSubs, setInternalSubs] = useState<Subcategory[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Use passed subs if provided, else fetch them ourselves
  const subcategories = passedSubs ?? internalSubs;

  useEffect(() => {
    if (passedSubs) return; // parent is managing the data
    const fetchSubs = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("challenge_subcategories")
        .select("id, parent_category, name, display_order, is_public, organization_id")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      setInternalSubs((data as any) || []);
    };
    fetchSubs();
  }, [passedSubs]);

  // Filter to subs in the currently picked category
  const subsInCategory = useMemo(() => {
    return subcategories.filter((s) => s.parent_category === category);
  }, [subcategories, category]);

  const isRequired = SUBCATEGORY_REQUIRED.has(category);

  const handleAddNewSubcategory = async () => {
    setAddError(null);
    const trimmed = newSubName.trim();
    if (!trimmed) {
      setAddError("Subcategory name is required.");
      return;
    }
    if (trimmed.length > 60) {
      setAddError("Subcategory name must be 60 characters or fewer.");
      return;
    }

    setAdding(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAddError("You must be logged in.");
      setAdding(false);
      return;
    }

    // Check for duplicate (case-insensitive) within the same category and org
    const existingMatch = subsInCategory.find(
      (s) => s.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existingMatch) {
      setAddError(`"${trimmed}" already exists in ${category}. Pick it from the list above.`);
      setAdding(false);
      return;
    }

    const { data: newSub, error: insertError } = await supabase
      .from("challenge_subcategories")
      .insert({
        parent_category: category,
        name: trimmed,
        display_order: 500,
        is_public: false,
        organization_id: organizationId,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError || !newSub) {
      setAddError(insertError?.message || "Failed to create subcategory.");
      setAdding(false);
      return;
    }

    // Add to local list and select it
    if (passedSubs && onSubcategoryCreated) {
      onSubcategoryCreated(newSub as any);
    } else {
      setInternalSubs((prev) => [...prev, newSub as any]);
    }
    setSubcategoryId(newSub.id);
    setNewSubName("");
    setShowAddForm(false);
    setAdding(false);
  };

  const handleSubcategoryChange = (value: string) => {
    if (value === "__ADD_NEW__") {
      setShowAddForm(true);
      return;
    }
    setSubcategoryId(value || null);
  };

  // Reset subcategory when category changes (since old subcategory won't match new category)
  useEffect(() => {
    if (subcategoryId) {
      const sub = subcategories.find((s) => s.id === subcategoryId);
      if (sub && sub.parent_category !== category) {
        setSubcategoryId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <div className="subcategory-picker">
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

      {category && (
        <div style={{ marginTop: "16px" }}>
          <label htmlFor="subcategory" className="form-label">
            {category === "Sports" ? "Sport" : "Subcategory"}
            {isRequired && <span className="required"> *</span>}
            {!isRequired && <span className="form-label-optional"> (optional)</span>}
          </label>

          {!showAddForm ? (
            <>
              <select
                id="subcategory"
                className="form-input"
                value={subcategoryId || ""}
                onChange={(e) => handleSubcategoryChange(e.target.value)}
                required={isRequired}
              >
                <option value="">
                  {isRequired ? "Select a sport..." : "(none — leave blank for general)"}
                </option>
                {subsInCategory.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{!s.is_public ? " (custom)" : ""}
                  </option>
                ))}
                <option value="__ADD_NEW__">+ Add new {category === "Sports" ? "sport" : "subcategory"}...</option>
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
                Add new {category === "Sports" ? "sport" : "subcategory"} to {category}
              </p>
              <p className="subcategory-add-form-hint">
                This will be private to your organization. (If many coaches add the same one, an admin can promote it to global later.)
              </p>
              <input
                type="text"
                className="form-input"
                placeholder={
                  category === "Sports"
                    ? "e.g., Pickleball, Badminton, Frisbee Golf"
                    : "e.g., Custom subcategory name"
                }
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                maxLength={60}
                autoFocus
              />
              {addError && (
                <div className="alert alert-error" style={{ marginTop: "8px" }}>
                  {addError}
                </div>
              )}
              <div className="subcategory-add-form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewSubName("");
                    setAddError(null);
                  }}
                  disabled={adding}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-inline"
                  onClick={handleAddNewSubcategory}
                  disabled={adding || !newSubName.trim()}
                >
                  {adding ? "Adding..." : `Add to ${category}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

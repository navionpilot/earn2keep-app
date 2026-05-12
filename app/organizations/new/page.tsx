"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

import AppShell from "@/components/AppShell";
export default function NewOrganizationPage() {
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to create an organization.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("organizations").insert({
      name: name.trim(),
      org_type: orgType,
      city: city.trim() || null,
      state: state.trim() || null,
      description: description.trim() || null,
      owner_id: user.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <AppShell active="organizations" userDisplayName={""}>
      <main className="form-page-main">
        <div className="form-card">
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">★ STEP 1 OF YOUR JOURNEY ★</span>
          </div>

          <h1 className="form-title">Create Your Organization</h1>
          <p className="form-subtitle">
            Your organization is your school, club, church, troop, or gym.
            You'll create teams and run events under it.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="form-label">
                Organization name <span className="required">*</span>
                <Tooltip text="The official name of your school, club, church, troop, or gym. This is what supporters and players will see.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="name"
                type="text"
                className="form-input"
                placeholder="e.g., Lincoln Middle School Athletics"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </div>

            <div>
              <label htmlFor="orgType" className="form-label">
                Type <span className="required">*</span>
                <Tooltip text="Pick the category that best fits your group. This helps us suggest relevant challenges later.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <select
                id="orgType"
                className="form-input"
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
                required
              >
                <option value="">Select a type...</option>
                <option value="School Sports">School Sports</option>
                <option value="Club Sports">Club / Travel Sports</option>
                <option value="Church Youth Group">Church / Youth Group</option>
                <option value="Scouts">Scouts / 4-H Club</option>
                <option value="Fitness Gym">Fitness Gym / CrossFit</option>
                <option value="School Club">School Club / Organization</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-row">
              <div style={{ flex: 1 }}>
                <label htmlFor="city" className="form-label">
                  City
                </label>
                <input
                  id="city"
                  type="text"
                  className="form-input"
                  placeholder="Meridian"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div style={{ flex: "0 0 120px" }}>
                <label htmlFor="state" className="form-label">
                  State
                </label>
                <input
                  id="state"
                  type="text"
                  className="form-input"
                  placeholder="MS"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase())}
                  maxLength={2}
                />
              </div>
            </div>
            <p className="form-hint">
              Optional, but useful for matching you with local supporters later.
            </p>

            <div>
              <label htmlFor="description" className="form-label">
                Description (optional)
              </label>
              <textarea
                id="description"
                className="form-input form-textarea"
                placeholder="A brief description of your organization..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <Link href="/dashboard" className="btn-cancel">
                Cancel
              </Link>
              <button type="submit" className="btn-primary btn-inline" disabled={loading}>
                {loading ? "Creating..." : "Create Organization →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AppShell>
  );
}

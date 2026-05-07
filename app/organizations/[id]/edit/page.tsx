"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

import AppShell from "@/components/AppShell";
export default function EditOrganizationPage() {
  const params = useParams();
  const orgId = params.id as string;
  const router = useRouter();

  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchOrg = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();

      if (fetchError || !data) {
        setError("Organization not found.");
        setFetching(false);
        return;
      }

      setName(data.name || "");
      setOrgType(data.org_type || "");
      setCity(data.city || "");
      setState(data.state || "");
      setDescription(data.description || "");
      setFetching(false);
    };

    fetchOrg();
  }, [orgId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        name: name.trim(),
        org_type: orgType,
        city: city.trim() || null,
        state: state.trim() || null,
        description: description.trim() || null,
      })
      .eq("id", orgId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push(`/organizations/${orgId}`);
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

  return (
    <AppShell active="teams" userDisplayName={""}>
      <main className="form-page-main">
        <div className="form-card">
          <h1 className="form-title">Edit Organization</h1>
          <p className="form-subtitle">Update your organization details below.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="form-label">
                Organization name <span className="required">*</span>
                <Tooltip text="The official name of your school, club, church, troop, or gym.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </div>

            <div>
              <label htmlFor="orgType" className="form-label">
                Type <span className="required">*</span>
              </label>
              <select
                id="orgType"
                className="form-input"
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
                required
              >
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
                <label htmlFor="city" className="form-label">City</label>
                <input
                  id="city"
                  type="text"
                  className="form-input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div style={{ flex: "0 0 120px" }}>
                <label htmlFor="state" className="form-label">State</label>
                <input
                  id="state"
                  type="text"
                  className="form-input"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase())}
                  maxLength={2}
                />
              </div>
            </div>

            <div>
              <label htmlFor="description" className="form-label">Description</label>
              <textarea
                id="description"
                className="form-input form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <Link href={`/organizations/${orgId}`} className="btn-cancel">
                Cancel
              </Link>
              <button type="submit" className="btn-primary btn-inline" disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AppShell>
  );
}

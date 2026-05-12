"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

import AppShell from "@/components/AppShell";
export default function NewTeamPage() {
  const params = useParams();
  const orgId = params.id as string;
  const router = useRouter();

  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [sportOrActivity, setSportOrActivity] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchOrg = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();

      if (fetchError || !data) {
        setError("Organization not found.");
        setFetching(false);
        return;
      }

      setOrgName(data.name);
      setFetching(false);
    };

    fetchOrg();
  }, [orgId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("teams").insert({
      organization_id: orgId,
      name: name.trim(),
      sport_or_activity: sportOrActivity,
      age_group: ageGroup.trim() || null,
      description: description.trim() || null,
      owner_id: user.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // L25 — Redirect to /dashboard (not back to the org detail page) so the
    // step-by-step guide picks up the new team and advances to step 3.
    // Matches the redirect pattern that organization creation already uses.
    router.push("/dashboard");
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
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">★ STEP 2 OF YOUR JOURNEY ★</span>
          </div>

          <h1 className="form-title">Add a Team</h1>
          <p className="form-subtitle">
            Adding a team to <strong>{orgName}</strong>. A team is a group of
            players that will compete together.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="form-label">
                Team name <span className="required">*</span>
                <Tooltip text="The name your players know this team by. Be specific so you can tell teams apart later.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="name"
                type="text"
                className="form-input"
                placeholder='e.g., "Lincoln Lions U14" or "Sunday 9th Grade"'
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="sportOrActivity" className="form-label">
                Sport or activity <span className="required">*</span>
                <Tooltip text="What kind of team is this? This helps us suggest relevant challenges later.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <select
                id="sportOrActivity"
                className="form-input"
                value={sportOrActivity}
                onChange={(e) => setSportOrActivity(e.target.value)}
                required
              >
                <option value="">Select an activity...</option>
                <option value="Soccer">Soccer</option>
                <option value="Basketball">Basketball</option>
                <option value="Football">Football</option>
                <option value="Baseball">Baseball / Softball</option>
                <option value="Volleyball">Volleyball</option>
                <option value="Track">Track / Cross Country</option>
                <option value="Wrestling">Wrestling</option>
                <option value="Swimming">Swimming</option>
                <option value="Cheerleading">Cheerleading / Dance</option>
                <option value="Faith Group">Faith / Bible Study</option>
                <option value="Scouts">Scouts / 4-H</option>
                <option value="Fitness">Fitness / CrossFit</option>
                <option value="Service Group">Service / Volunteer Group</option>
                <option value="Academic">Academic Team / Club</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="ageGroup" className="form-label">
                Age group (optional)
                <Tooltip text='Examples: "U10", "U14", "Middle School", "Adult", "Mixed Ages". Helps when you have multiple teams of the same sport.'>
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="ageGroup"
                type="text"
                className="form-input"
                placeholder='e.g., "U14" or "Middle School"'
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                maxLength={40}
              />
            </div>

            <div>
              <label htmlFor="description" className="form-label">
                Description (optional)
              </label>
              <textarea
                id="description"
                className="form-input form-textarea"
                placeholder="A brief description of this team..."
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
                {loading ? "Creating..." : "Create Team →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AppShell>
  );
}

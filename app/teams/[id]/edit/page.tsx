"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

import AppShell from "@/components/AppShell";
export default function EditTeamPage() {
  const params = useParams();
  const teamId = params.id as string;
  const router = useRouter();

  const [name, setName] = useState("");
  const [sportOrActivity, setSportOrActivity] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchTeam = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single();

      if (fetchError || !data) {
        setError("Team not found.");
        setFetching(false);
        return;
      }

      setName(data.name || "");
      setSportOrActivity(data.sport_or_activity || "");
      setAgeGroup(data.age_group || "");
      setDescription(data.description || "");
      setFetching(false);
    };

    fetchTeam();
  }, [teamId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("teams")
      .update({
        name: name.trim(),
        sport_or_activity: sportOrActivity,
        age_group: ageGroup.trim() || null,
        description: description.trim() || null,
      })
      .eq("id", teamId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push(`/teams/${teamId}`);
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
          <h1 className="form-title">Edit Team</h1>
          <p className="form-subtitle">Update your team details below.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="form-label">
                Team name <span className="required">*</span>
                <Tooltip text="The name your players/participants know this team by.">
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
              <label htmlFor="sportOrActivity" className="form-label">
                Sport or activity <span className="required">*</span>
              </label>
              <select
                id="sportOrActivity"
                className="form-input"
                value={sportOrActivity}
                onChange={(e) => setSportOrActivity(e.target.value)}
                required
              >
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
              </label>
              <input
                id="ageGroup"
                type="text"
                className="form-input"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                maxLength={40}
              />
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
              <Link href={`/teams/${teamId}`} className="btn-cancel">
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

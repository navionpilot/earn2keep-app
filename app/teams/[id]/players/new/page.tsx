"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

import AppShell from "@/components/AppShell";
export default function NewPlayerPage() {
  const params = useParams();
  const teamId = params.id as string;
  const router = useRouter();

  const [teamName, setTeamName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [addAnother, setAddAnother] = useState(false);

  useEffect(() => {
    const fetchTeam = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .single();

      if (fetchError || !data) {
        setError("Team not found.");
        setFetching(false);
        return;
      }

      setTeamName(data.name);
      setFetching(false);
    };

    fetchTeam();
  }, [teamId]);

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

    const { error: insertError } = await supabase.from("players").insert({
      team_id: teamId,
      owner_id: user.id,
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      jersey_number: jerseyNumber.trim() || null,
      date_of_birth: dateOfBirth || null,
      parent_email: parentEmail.trim() || null,
      parent_phone: parentPhone.trim() || null,
      notes: notes.trim() || null,
      imported_from: "Manual",
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    if (addAnother) {
      setFirstName("");
      setLastName("");
      setJerseyNumber("");
      setDateOfBirth("");
      setParentEmail("");
      setParentPhone("");
      setNotes("");
      setLoading(false);
      const firstNameField = document.getElementById("firstName");
      if (firstNameField) firstNameField.focus();
    } else {
      router.push(`/teams/${teamId}`);
      router.refresh();
    }
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
    <AppShell active="participants" userDisplayName={""}>
      <main className="form-page-main">
        <div className="form-card">
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">★ STEP 3 OF YOUR JOURNEY ★</span>
          </div>

          <h1 className="form-title">Add a Player</h1>
          <p className="form-subtitle">
            Adding a player to <strong>{teamName}</strong>. Only first name is
            required — fill in the rest now or come back later.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div style={{ flex: 1 }}>
                <label htmlFor="firstName" className="form-label">
                  First name <span className="required">*</span>
                </label>
                <input
                  id="firstName"
                  type="text"
                  className="form-input"
                  placeholder="e.g., Marcus"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  maxLength={50}
                  autoFocus
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="lastName" className="form-label">
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  className="form-input"
                  placeholder="e.g., Johnson"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={50}
                />
              </div>
            </div>

            <div>
              <label htmlFor="jerseyNumber" className="form-label">
                Jersey number (optional)
              </label>
              <input
                id="jerseyNumber"
                type="text"
                className="form-input"
                placeholder="e.g., 14"
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
                maxLength={10}
              />
            </div>

            <div>
              <label htmlFor="dateOfBirth" className="form-label">
                Date of birth (optional)
                <Tooltip text="Helps with age verification and grouping. Not required.">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                id="dateOfBirth"
                type="date"
                className="form-input"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div style={{ flex: 1 }}>
                <label htmlFor="parentEmail" className="form-label">
                  Parent / guardian email
                  <Tooltip text="Used to send sponsor notifications and event updates. Recommended for minors.">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  id="parentEmail"
                  type="email"
                  className="form-input"
                  placeholder="parent@example.com"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="parentPhone" className="form-label">
                  Parent / guardian phone
                </label>
                <input
                  id="parentPhone"
                  type="tel"
                  className="form-input"
                  placeholder="(555) 555-1234"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  maxLength={20}
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="form-label">
                Notes (optional)
              </label>
              <textarea
                id="notes"
                className="form-input form-textarea"
                placeholder="Any notes about this player..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="checkbox-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={addAnother}
                  onChange={(e) => setAddAnother(e.target.checked)}
                />
                <span>Add another player after saving (clears form, stays on this page)</span>
              </label>
            </div>

            <div className="form-actions">
              <Link href={`/teams/${teamId}`} className="btn-cancel">
                Cancel
              </Link>
              <button type="submit" className="btn-primary btn-inline" disabled={loading}>
                {loading ? "Saving..." : addAnother ? "Save & Add Another" : "Save Player →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AppShell>
  );
}

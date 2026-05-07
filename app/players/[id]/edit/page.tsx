"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

import AppShell from "@/components/AppShell";
export default function EditPlayerPage() {
  const params = useParams();
  const playerId = params.id as string;
  const router = useRouter();

  const [teamId, setTeamId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchPlayer = async () => {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("players")
        .select("*")
        .eq("id", playerId)
        .single();

      if (fetchError || !data) {
        setError("Player not found.");
        setFetching(false);
        return;
      }

      setTeamId(data.team_id);
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setJerseyNumber(data.jersey_number || "");
      setDateOfBirth(data.date_of_birth || "");
      setParentEmail(data.parent_email || "");
      setParentPhone(data.parent_phone || "");
      setNotes(data.notes || "");
      setFetching(false);
    };

    fetchPlayer();
  }, [playerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("players")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        jersey_number: jerseyNumber.trim() || null,
        date_of_birth: dateOfBirth || null,
        parent_email: parentEmail.trim() || null,
        parent_phone: parentPhone.trim() || null,
        notes: notes.trim() || null,
      })
      .eq("id", playerId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push(`/teams/${teamId}`);
    router.refresh();
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);

    const supabase = createClient();
    // Soft delete - just set is_active to false
    const { error: deleteError } = await supabase
      .from("players")
      .update({ is_active: false })
      .eq("id", playerId);

    if (deleteError) {
      setError(deleteError.message);
      setRemoving(false);
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
    <AppShell active="participants" userDisplayName={""}>
      <main className="form-page-main">
        <div className="form-card">
          <h1 className="form-title">Edit Player</h1>
          <p className="form-subtitle">Update player details below.</p>

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
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  maxLength={50}
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
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={50}
                />
              </div>
            </div>

            <div>
              <label htmlFor="jerseyNumber" className="form-label">
                Jersey number
              </label>
              <input
                id="jerseyNumber"
                type="text"
                className="form-input"
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
                maxLength={10}
              />
            </div>

            <div>
              <label htmlFor="dateOfBirth" className="form-label">
                Date of birth
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
                </label>
                <input
                  id="parentEmail"
                  type="email"
                  className="form-input"
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
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  maxLength={20}
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="form-label">Notes</label>
              <textarea
                id="notes"
                className="form-input form-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
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

          <div className="danger-zone">
            <div className="danger-zone-label">
              <Tooltip text="Removes the player from your roster. They won't appear in future events. Their data is preserved in case you need to restore them.">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Remove player from team
                  <span className="help-icon">?</span>
                </span>
              </Tooltip>
            </div>
            {!confirmingRemove ? (
              <button
                type="button"
                className="btn-danger"
                onClick={() => setConfirmingRemove(true)}
              >
                Remove Player
              </button>
            ) : (
              <div className="danger-confirm">
                <span className="danger-confirm-text">
                  Remove <strong>{firstName} {lastName}</strong> from the team?
                </span>
                <div className="danger-confirm-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setConfirmingRemove(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={handleRemove}
                    disabled={removing}
                  >
                    {removing ? "Removing..." : "Yes, Remove"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}

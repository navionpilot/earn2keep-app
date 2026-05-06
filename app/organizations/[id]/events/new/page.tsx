"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

type Team = {
  id: string;
  name: string;
  sport_or_activity: string | null;
  age_group: string | null;
};

export default function NewEventPage() {
  const params = useParams();
  const orgId = params.id as string;
  const router = useRouter();

  const [orgName, setOrgName] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [fetching, setFetching] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<"camp" | "tournament" | "">("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [goalType, setGoalType] = useState<"per_player" | "per_team">("per_player");
  const [goalAmount, setGoalAmount] = useState("");
  const [prizeCount, setPrizeCount] = useState<1 | 2 | 3>(1);
  const [firstPlacePrize, setFirstPlacePrize] = useState("");
  const [secondPlacePrize, setSecondPlacePrize] = useState("");
  const [thirdPlacePrize, setThirdPlacePrize] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchOrgAndTeams = async () => {
      const supabase = createClient();

      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();

      if (org) setOrgName(org.name);

      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name, sport_or_activity, age_group")
        .eq("organization_id", orgId)
        .order("name");

      setTeams(teamsData || []);
      setFetching(false);
    };

    fetchOrgAndTeams();
  }, [orgId]);

  const toggleTeam = (teamId: string) => {
    if (eventType === "camp") {
      // Camp: only one team can be selected
      setSelectedTeamIds([teamId]);
    } else {
      // Tournament: multi-select
      if (selectedTeamIds.includes(teamId)) {
        setSelectedTeamIds(selectedTeamIds.filter((id) => id !== teamId));
      } else {
        setSelectedTeamIds([...selectedTeamIds, teamId]);
      }
    }
  };

  // When event type changes, reset team selection
  const handleEventTypeChange = (newType: "camp" | "tournament") => {
    setEventType(newType);
    setSelectedTeamIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError("Event name is required.");
      return;
    }
    if (!eventType) {
      setError("Please pick Camp or Tournament.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Please set start and end dates.");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after start date.");
      return;
    }
    if (selectedTeamIds.length === 0) {
      setError(eventType === "camp" ? "Please pick a team." : "Please pick at least one team.");
      return;
    }
    if (eventType === "tournament" && selectedTeamIds.length < 2) {
      setError("A Tournament needs at least 2 teams. Use a Camp for single-team events.");
      return;
    }
    if (goalAmount && Number(goalAmount) < 0) {
      setError("Goal amount must be a positive number.");
      return;
    }

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

    // Insert the event
    const { data: event, error: insertError } = await supabase
      .from("events")
      .insert({
        organization_id: orgId,
        owner_id: user.id,
        name: name.trim(),
        event_type: eventType,
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate,
        goal_type: goalType,
        goal_amount: goalAmount ? Number(goalAmount) : null,
        prize_count: prizeCount,
        first_place_prize: firstPlacePrize.trim() || null,
        second_place_prize: prizeCount >= 2 ? (secondPlacePrize.trim() || null) : null,
        third_place_prize: prizeCount >= 3 ? (thirdPlacePrize.trim() || null) : null,
        status: "draft",
      })
      .select()
      .single();

    if (insertError || !event) {
      setError(insertError?.message || "Failed to create event.");
      setLoading(false);
      return;
    }

    // Insert event_participants for each selected team
    const participantRows = selectedTeamIds.map((teamId) => ({
      event_id: event.id,
      team_id: teamId,
      owner_id: user.id,
    }));

    const { error: partError } = await supabase
      .from("event_participants")
      .insert(participantRows);

    if (partError) {
      setError(`Event created but failed to link teams: ${partError.message}`);
      setLoading(false);
      return;
    }

    router.push(`/events/${event.id}`);
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

  if (teams.length === 0) {
    return (
      <div className="form-page">
        <header className="dashboard-header">
          <div className="dashboard-header-inner">
            <Link href="/dashboard" className="dashboard-logo">
              <span className="logo-text">
                earn<sup className="logo-sup">2</sup>keep
              </span>
            </Link>
            <Link href={`/organizations/${orgId}`} className="btn-link">
              ← Back
            </Link>
          </div>
        </header>
        <main className="form-page-main">
          <div className="form-card">
            <h1 className="form-title">No Teams Yet</h1>
            <p className="form-subtitle">
              You need at least one team before creating an event. Add a team to{" "}
              <strong>{orgName}</strong> first.
            </p>
            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <Link href={`/organizations/${orgId}/teams/new`} className="btn-primary-link">
                Add a Team →
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="form-page">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">
              earn<sup className="logo-sup">2</sup>keep
            </span>
          </Link>
          <Link href={`/organizations/${orgId}`} className="btn-link">
            ← Back
          </Link>
        </div>
      </header>

      <main className="form-page-main-wide">
        <div className="form-card">
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">★ STEP 4 OF YOUR JOURNEY ★</span>
          </div>

          <h1 className="form-title">Create Event</h1>
          <p className="form-subtitle">
            Setting up an event for <strong>{orgName}</strong>. Fill in the
            sections below — you can change anything after creating it.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {/* SECTION 1: Basics */}
            <div className="form-section">
              <h3 className="form-section-title">1. Basics</h3>

              <div>
                <label htmlFor="name" className="form-label">
                  Event name <span className="required">*</span>
                  <Tooltip text="What sponsors and players will see. Be specific and time-bound (e.g., add the year).">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  id="name"
                  type="text"
                  className="form-input"
                  placeholder='e.g., "Lincoln Lions Spring Camp 2026"'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label">
                  Event type <span className="required">*</span>
                  <Tooltip text="A Camp is one team competing internally for individual prizes. A Tournament is multiple teams competing against each other.">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <div className="radio-cards">
                  <label className={`radio-card ${eventType === "camp" ? "radio-card-active" : ""}`}>
                    <input
                      type="radio"
                      name="eventType"
                      value="camp"
                      checked={eventType === "camp"}
                      onChange={() => handleEventTypeChange("camp")}
                    />
                    <div className="radio-card-content">
                      <div className="radio-card-icon">🏃</div>
                      <div className="radio-card-title">Camp</div>
                      <div className="radio-card-text">
                        One team. Players compete against each other for individual prizes.
                      </div>
                    </div>
                  </label>
                  <label className={`radio-card ${eventType === "tournament" ? "radio-card-active" : ""}`}>
                    <input
                      type="radio"
                      name="eventType"
                      value="tournament"
                      checked={eventType === "tournament"}
                      onChange={() => handleEventTypeChange("tournament")}
                    />
                    <div className="radio-card-content">
                      <div className="radio-card-icon">🏆</div>
                      <div className="radio-card-title">Tournament</div>
                      <div className="radio-card-text">
                        Multiple teams. Teams compete against each other for team prizes.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-row">
                <div style={{ flex: 1 }}>
                  <label htmlFor="startDate" className="form-label">
                    Start date <span className="required">*</span>
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    className="form-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="endDate" className="form-label">
                    End date <span className="required">*</span>
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="description" className="form-label">
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  className="form-input form-textarea"
                  placeholder="Describe the theme or purpose of this event..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>

            {/* SECTION 2: Teams */}
            {eventType && (
              <div className="form-section">
                <h3 className="form-section-title">
                  2. {eventType === "camp" ? "Pick the Team" : "Pick Participating Teams"}
                </h3>
                <p className="form-section-hint">
                  {eventType === "camp"
                    ? "A Camp involves one team. Pick which one is competing."
                    : "A Tournament needs at least 2 teams. Check all the teams that will compete."}
                </p>

                <div className="team-picker">
                  {teams.map((team) => (
                    <label
                      key={team.id}
                      className={`team-pick-card ${
                        selectedTeamIds.includes(team.id) ? "team-pick-card-active" : ""
                      }`}
                    >
                      <input
                        type={eventType === "camp" ? "radio" : "checkbox"}
                        name="team"
                        checked={selectedTeamIds.includes(team.id)}
                        onChange={() => toggleTeam(team.id)}
                      />
                      <div className="team-pick-content">
                        <div className="team-pick-name">{team.name}</div>
                        <div className="team-pick-meta">
                          {team.sport_or_activity}
                          {team.age_group && ` · ${team.age_group}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedTeamIds.length > 0 && (
                  <p className="form-section-hint" style={{ marginTop: "8px", color: "var(--color-blue-dark)" }}>
                    ✓ {selectedTeamIds.length} team{selectedTeamIds.length === 1 ? "" : "s"} selected
                  </p>
                )}
              </div>
            )}

            {/* SECTION 3: Fundraising Goal */}
            <div className="form-section">
              <h3 className="form-section-title">3. Fundraising Goal</h3>
              <p className="form-section-hint">
                Tell sponsors what you're aiming to raise. This is for display only —
                you can hit it, exceed it, or fall short.
              </p>

              <div>
                <label className="form-label">
                  Goal type
                  <Tooltip text="Per-player makes the goal feel personal (each kid raises X). Per-team makes it a shared mission (we together raise X).">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <div className="radio-cards-compact">
                  <label className={`radio-card-small ${goalType === "per_player" ? "radio-card-active" : ""}`}>
                    <input
                      type="radio"
                      name="goalType"
                      value="per_player"
                      checked={goalType === "per_player"}
                      onChange={() => setGoalType("per_player")}
                    />
                    <div>
                      <div className="radio-card-title-small">Per Player</div>
                      <div className="radio-card-text-small">e.g., $50 per player</div>
                    </div>
                  </label>
                  <label className={`radio-card-small ${goalType === "per_team" ? "radio-card-active" : ""}`}>
                    <input
                      type="radio"
                      name="goalType"
                      value="per_team"
                      checked={goalType === "per_team"}
                      onChange={() => setGoalType("per_team")}
                    />
                    <div>
                      <div className="radio-card-title-small">Per Team</div>
                      <div className="radio-card-text-small">e.g., $5,000 total</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="goalAmount" className="form-label">
                  Amount (optional)
                </label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input
                    id="goalAmount"
                    type="number"
                    className="form-input form-input-with-prefix"
                    placeholder={goalType === "per_player" ? "50" : "5000"}
                    value={goalAmount}
                    onChange={(e) => setGoalAmount(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: Prizes */}
            <div className="form-section">
              <h3 className="form-section-title">4. Prizes</h3>
              <p className="form-section-hint">
                How many prize winners? You can give just a 1st place prize, or
                add 2nd and 3rd place too.
              </p>

              <div>
                <label className="form-label">
                  Number of prize winners
                  <Tooltip text="More prizes = more motivation for players. But it also means more prizes to fund. Pick what works for your fundraiser.">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <div className="radio-cards-compact">
                  <label className={`radio-card-small ${prizeCount === 1 ? "radio-card-active" : ""}`}>
                    <input
                      type="radio"
                      name="prizeCount"
                      checked={prizeCount === 1}
                      onChange={() => setPrizeCount(1)}
                    />
                    <div>
                      <div className="radio-card-title-small">1 Winner</div>
                      <div className="radio-card-text-small">1st place only</div>
                    </div>
                  </label>
                  <label className={`radio-card-small ${prizeCount === 2 ? "radio-card-active" : ""}`}>
                    <input
                      type="radio"
                      name="prizeCount"
                      checked={prizeCount === 2}
                      onChange={() => setPrizeCount(2)}
                    />
                    <div>
                      <div className="radio-card-title-small">2 Winners</div>
                      <div className="radio-card-text-small">1st & 2nd</div>
                    </div>
                  </label>
                  <label className={`radio-card-small ${prizeCount === 3 ? "radio-card-active" : ""}`}>
                    <input
                      type="radio"
                      name="prizeCount"
                      checked={prizeCount === 3}
                      onChange={() => setPrizeCount(3)}
                    />
                    <div>
                      <div className="radio-card-title-small">3 Winners</div>
                      <div className="radio-card-text-small">1st, 2nd, 3rd</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="firstPlace" className="form-label">
                  🥇 1st place prize
                </label>
                <input
                  id="firstPlace"
                  type="text"
                  className="form-input"
                  placeholder="e.g., $200 cash, signed jersey, or pizza party"
                  value={firstPlacePrize}
                  onChange={(e) => setFirstPlacePrize(e.target.value)}
                  maxLength={200}
                />
              </div>

              {prizeCount >= 2 && (
                <div>
                  <label htmlFor="secondPlace" className="form-label">
                    🥈 2nd place prize
                  </label>
                  <input
                    id="secondPlace"
                    type="text"
                    className="form-input"
                    placeholder="e.g., $100 cash or team swag"
                    value={secondPlacePrize}
                    onChange={(e) => setSecondPlacePrize(e.target.value)}
                    maxLength={200}
                  />
                </div>
              )}

              {prizeCount >= 3 && (
                <div>
                  <label htmlFor="thirdPlace" className="form-label">
                    🥉 3rd place prize
                  </label>
                  <input
                    id="thirdPlace"
                    type="text"
                    className="form-input"
                    placeholder="e.g., $50 gift card"
                    value={thirdPlacePrize}
                    onChange={(e) => setThirdPlacePrize(e.target.value)}
                    maxLength={200}
                  />
                </div>
              )}
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <Link href={`/organizations/${orgId}`} className="btn-cancel">
                Cancel
              </Link>
              <button type="submit" className="btn-primary btn-inline" disabled={loading}>
                {loading ? "Creating..." : "Create Event →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

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

export default function EditEventPage() {
  const params = useParams();
  const eventId = params.id as string;
  const router = useRouter();

  const [orgId, setOrgId] = useState("");
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
    const fetchEverything = async () => {
      const supabase = createClient();

      // Fetch event
      const { data: event } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (!event) {
        setError("Event not found.");
        setFetching(false);
        return;
      }

      setOrgId(event.organization_id);
      setName(event.name || "");
      setEventType(event.event_type || "");
      setDescription(event.description || "");
      setStartDate(event.start_date || "");
      setEndDate(event.end_date || "");
      setGoalType(event.goal_type || "per_player");
      setGoalAmount(event.goal_amount?.toString() || "");
      setPrizeCount((event.prize_count as 1 | 2 | 3) || 1);
      setFirstPlacePrize(event.first_place_prize || "");
      setSecondPlacePrize(event.second_place_prize || "");
      setThirdPlacePrize(event.third_place_prize || "");

      // Fetch org name
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", event.organization_id)
        .single();
      if (org) setOrgName(org.name);

      // Fetch teams in the org
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name, sport_or_activity, age_group")
        .eq("organization_id", event.organization_id)
        .order("name");
      setTeams(teamsData || []);

      // Fetch participants for this event
      const { data: parts } = await supabase
        .from("event_participants")
        .select("team_id")
        .eq("event_id", eventId);
      setSelectedTeamIds((parts || []).map((p) => p.team_id));

      setFetching(false);
    };

    fetchEverything();
  }, [eventId]);

  const toggleTeam = (teamId: string) => {
    if (eventType === "camp") {
      setSelectedTeamIds([teamId]);
    } else {
      if (selectedTeamIds.includes(teamId)) {
        setSelectedTeamIds(selectedTeamIds.filter((id) => id !== teamId));
      } else {
        setSelectedTeamIds([...selectedTeamIds, teamId]);
      }
    }
  };

  const handleEventTypeChange = (newType: "camp" | "tournament") => {
    setEventType(newType);
    if (newType === "camp" && selectedTeamIds.length > 1) {
      setSelectedTeamIds([selectedTeamIds[0]]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
      setError("A Tournament needs at least 2 teams.");
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

    // Update event
    const { error: updateError } = await supabase
      .from("events")
      .update({
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
      })
      .eq("id", eventId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Update event_participants - delete old and insert new
    await supabase.from("event_participants").delete().eq("event_id", eventId);

    const participantRows = selectedTeamIds.map((teamId) => ({
      event_id: eventId,
      team_id: teamId,
      owner_id: user.id,
    }));

    const { error: partError } = await supabase
      .from("event_participants")
      .insert(participantRows);

    if (partError) {
      setError(`Event updated but failed to update teams: ${partError.message}`);
      setLoading(false);
      return;
    }

    router.push(`/events/${eventId}`);
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
    <div className="form-page">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">
              earn<sup className="logo-sup">2</sup>keep
            </span>
          </Link>
          <Link href={`/events/${eventId}`} className="btn-link">
            ← Back
          </Link>
        </div>
      </header>

      <main className="form-page-main-wide">
        <div className="form-card">
          <h1 className="form-title">Edit Event</h1>
          <p className="form-subtitle">
            Updating event for <strong>{orgName}</strong>.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {/* SECTION 1: Basics */}
            <div className="form-section">
              <h3 className="form-section-title">1. Basics</h3>

              <div>
                <label htmlFor="name" className="form-label">
                  Event name <span className="required">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>

              <div>
                <label className="form-label">
                  Event type <span className="required">*</span>
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
                      <div className="radio-card-text">One team. Players compete internally.</div>
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
                      <div className="radio-card-text">Multiple teams competing.</div>
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
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>

            {/* SECTION 2: Teams */}
            <div className="form-section">
              <h3 className="form-section-title">
                2. {eventType === "camp" ? "Pick the Team" : "Pick Participating Teams"}
              </h3>

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
            </div>

            {/* SECTION 3: Goal */}
            <div className="form-section">
              <h3 className="form-section-title">3. Fundraising Goal</h3>

              <div>
                <label className="form-label">Goal type</label>
                <div className="radio-cards-compact">
                  <label className={`radio-card-small ${goalType === "per_player" ? "radio-card-active" : ""}`}>
                    <input
                      type="radio"
                      name="goalType"
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

              <div>
                <label className="form-label">Number of prize winners</label>
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
                <label htmlFor="firstPlace" className="form-label">🥇 1st place prize</label>
                <input
                  id="firstPlace"
                  type="text"
                  className="form-input"
                  value={firstPlacePrize}
                  onChange={(e) => setFirstPlacePrize(e.target.value)}
                  maxLength={200}
                />
              </div>

              {prizeCount >= 2 && (
                <div>
                  <label htmlFor="secondPlace" className="form-label">🥈 2nd place prize</label>
                  <input
                    id="secondPlace"
                    type="text"
                    className="form-input"
                    value={secondPlacePrize}
                    onChange={(e) => setSecondPlacePrize(e.target.value)}
                    maxLength={200}
                  />
                </div>
              )}

              {prizeCount >= 3 && (
                <div>
                  <label htmlFor="thirdPlace" className="form-label">🥉 3rd place prize</label>
                  <input
                    id="thirdPlace"
                    type="text"
                    className="form-input"
                    value={thirdPlacePrize}
                    onChange={(e) => setThirdPlacePrize(e.target.value)}
                    maxLength={200}
                  />
                </div>
              )}
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <Link href={`/events/${eventId}`} className="btn-cancel">
                Cancel
              </Link>
              <button type="submit" className="btn-primary btn-inline" disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

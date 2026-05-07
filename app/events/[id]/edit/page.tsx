"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

type Team = {
  id: string;
  name: string;
  sport_or_activity: string | null;
  age_group: string | null;
  playerCount: number;
};

const GIFT_CARD_OPTIONS = [
  "Amazon Gift Card",
  "Walmart Gift Card",
  "Dick's Sporting Goods Gift Card",
  "Academy Sports Gift Card",
  "Soccer.com Gift Card",
  "Visa/Mastercard Gift Card",
  "Other",
];

const formatMoney = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const combineGiftCard = (selection: string, custom: string): string | null => {
  if (!selection) return null;
  if (selection === "Other") {
    const trimmed = custom.trim();
    return trimmed || null;
  }
  return selection;
};

// Reverse mapping for loading: figure out if existing prize text matches a known option
const splitGiftCard = (existing: string | null): { selection: string; custom: string } => {
  if (!existing) return { selection: "", custom: "" };
  if (GIFT_CARD_OPTIONS.includes(existing)) {
    return { selection: existing, custom: "" };
  }
  // Existing text doesn't match a known option → treat as "Other" with custom text
  return { selection: "Other", custom: existing };
};

export default function EditEventPage() {
  const params = useParams();
  const eventId = params.id as string;
  const router = useRouter();

  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [fetching, setFetching] = useState(true);

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<"camp" | "tournament" | "">("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [goalType, setGoalType] = useState<"per_player" | "per_team">("per_team");
  const [goalAmount, setGoalAmount] = useState("");
  const [prizeCount, setPrizeCount] = useState<1 | 2 | 3>(1);

  const [firstPlaceAmount, setFirstPlaceAmount] = useState("");
  const [firstPlaceGiftCard, setFirstPlaceGiftCard] = useState("");
  const [firstPlaceCustom, setFirstPlaceCustom] = useState("");

  const [secondPlaceAmount, setSecondPlaceAmount] = useState("");
  const [secondPlaceGiftCard, setSecondPlaceGiftCard] = useState("");
  const [secondPlaceCustom, setSecondPlaceCustom] = useState("");

  const [thirdPlaceAmount, setThirdPlaceAmount] = useState("");
  const [thirdPlaceGiftCard, setThirdPlaceGiftCard] = useState("");
  const [thirdPlaceCustom, setThirdPlaceCustom] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchEverything = async () => {
      const supabase = createClient();

      const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();
      if (!event) { setError("Event not found."); setFetching(false); return; }

      setOrgId(event.organization_id);
      setName(event.name || "");
      setEventType(event.event_type || "");
      setDescription(event.description || "");
      setStartDate(event.start_date || "");
      setEndDate(event.end_date || "");
      setGoalType(event.goal_type || "per_team");
      setGoalAmount(event.goal_amount?.toString() || "");
      setPrizeCount((event.prize_count as 1 | 2 | 3) || 1);

      // Load prize fields with reverse mapping
      const first = splitGiftCard(event.first_place_prize);
      setFirstPlaceGiftCard(first.selection);
      setFirstPlaceCustom(first.custom);
      setFirstPlaceAmount(event.first_place_amount?.toString() || "");

      const second = splitGiftCard(event.second_place_prize);
      setSecondPlaceGiftCard(second.selection);
      setSecondPlaceCustom(second.custom);
      setSecondPlaceAmount(event.second_place_amount?.toString() || "");

      const third = splitGiftCard(event.third_place_prize);
      setThirdPlaceGiftCard(third.selection);
      setThirdPlaceCustom(third.custom);
      setThirdPlaceAmount(event.third_place_amount?.toString() || "");

      const { data: org } = await supabase.from("organizations").select("name").eq("id", event.organization_id).single();
      if (org) setOrgName(org.name);

      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name, sport_or_activity, age_group")
        .eq("organization_id", event.organization_id)
        .order("name");

      const teamIds = (teamsData || []).map((t) => t.id);
      const playerCounts: Record<string, number> = {};
      if (teamIds.length > 0) {
        const { data: playerData } = await supabase
          .from("players").select("team_id")
          .in("team_id", teamIds).eq("is_active", true);
        (playerData || []).forEach((p) => {
          playerCounts[p.team_id] = (playerCounts[p.team_id] || 0) + 1;
        });
      }
      setTeams((teamsData || []).map((t) => ({
        ...t,
        playerCount: playerCounts[t.id] || 0,
      })));

      const { data: parts } = await supabase
        .from("event_participants").select("team_id").eq("event_id", eventId);
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

  const totalPlayerCount = useMemo(() => {
    return selectedTeamIds.reduce((sum, teamId) => {
      const team = teams.find((t) => t.id === teamId);
      return sum + (team?.playerCount || 0);
    }, 0);
  }, [selectedTeamIds, teams]);

  const goalNum = parseFloat(goalAmount) || 0;
  const firstNum = parseFloat(firstPlaceAmount) || 0;
  const secondNum = prizeCount >= 2 ? parseFloat(secondPlaceAmount) || 0 : 0;
  const thirdNum = prizeCount >= 3 ? parseFloat(thirdPlaceAmount) || 0 : 0;
  const prizePool = firstNum + secondNum + thirdNum;
  const totalGoal = goalType === "per_team" ? goalNum : goalNum * totalPlayerCount;
  const netToTeam = totalGoal - prizePool;
  const perPlayerNet = totalPlayerCount > 0 ? netToTeam / totalPlayerCount : 0;
  const showBreakdown = goalNum > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError("Event name is required."); return; }
    if (!eventType) { setError("Please pick Camp or Tournament."); return; }
    if (!startDate || !endDate) { setError("Please set start and end dates."); return; }
    if (new Date(endDate) < new Date(startDate)) { setError("End date must be on or after start date."); return; }
    if (selectedTeamIds.length === 0) {
      setError(eventType === "camp" ? "Please pick a team." : "Please pick at least one team.");
      return;
    }
    if (eventType === "tournament" && selectedTeamIds.length < 2) {
      setError("A Tournament needs at least 2 teams."); return;
    }
    if (!goalAmount || goalNum <= 0) {
      setError("Please enter a fundraising goal amount."); return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("You must be logged in."); setLoading(false); return; }

    const firstPrize = combineGiftCard(firstPlaceGiftCard, firstPlaceCustom);
    const secondPrize = prizeCount >= 2 ? combineGiftCard(secondPlaceGiftCard, secondPlaceCustom) : null;
    const thirdPrize = prizeCount >= 3 ? combineGiftCard(thirdPlaceGiftCard, thirdPlaceCustom) : null;

    const { error: updateError } = await supabase.from("events").update({
      name: name.trim(),
      event_type: eventType,
      description: description.trim() || null,
      start_date: startDate,
      end_date: endDate,
      goal_type: goalType,
      goal_amount: goalNum,
      prize_count: prizeCount,
      first_place_prize: firstPrize,
      first_place_amount: firstNum > 0 ? firstNum : null,
      second_place_prize: secondPrize,
      second_place_amount: prizeCount >= 2 && secondNum > 0 ? secondNum : null,
      third_place_prize: thirdPrize,
      third_place_amount: prizeCount >= 3 && thirdNum > 0 ? thirdNum : null,
    }).eq("id", eventId);

    if (updateError) { setError(updateError.message); setLoading(false); return; }

    await supabase.from("event_participants").delete().eq("event_id", eventId);
    const participantRows = selectedTeamIds.map((teamId) => ({
      event_id: eventId, team_id: teamId, owner_id: user.id,
    }));
    const { error: partError } = await supabase.from("event_participants").insert(participantRows);
    if (partError) {
      setError(`Event updated but failed to update teams: ${partError.message}`);
      setLoading(false); return;
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
            <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
          </Link>
          <Link href={`/events/${eventId}`} className="btn-link">← Back</Link>
        </div>
      </header>

      <main className="form-page-main-wide">
        <div className="form-card">
          <h1 className="form-title">Edit Event</h1>
          <p className="form-subtitle">
            Updating event for <strong>{orgName}</strong>.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <h3 className="form-section-title">1. Basics</h3>

              <div>
                <label htmlFor="name" className="form-label">
                  Event name <span className="required">*</span>
                </label>
                <input id="name" type="text" className="form-input"
                  value={name} onChange={(e) => setName(e.target.value)}
                  required maxLength={120} />
              </div>

              <div>
                <label className="form-label">Event type <span className="required">*</span></label>
                <div className="radio-cards">
                  <label className={`radio-card ${eventType === "camp" ? "radio-card-active" : ""}`}>
                    <input type="radio" name="eventType" value="camp"
                      checked={eventType === "camp"} onChange={() => handleEventTypeChange("camp")} />
                    <div className="radio-card-content">
                      <div className="radio-card-icon">🏃</div>
                      <div className="radio-card-title">Camp</div>
                      <div className="radio-card-text">One team. Players/participants compete internally.</div>
                    </div>
                  </label>
                  <label className={`radio-card ${eventType === "tournament" ? "radio-card-active" : ""}`}>
                    <input type="radio" name="eventType" value="tournament"
                      checked={eventType === "tournament"} onChange={() => handleEventTypeChange("tournament")} />
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
                  <label htmlFor="startDate" className="form-label">Start date <span className="required">*</span></label>
                  <input id="startDate" type="date" className="form-input"
                    value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="endDate" className="form-label">End date <span className="required">*</span></label>
                  <input id="endDate" type="date" className="form-input"
                    value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
              </div>

              <div>
                <label htmlFor="description" className="form-label">Description (optional)</label>
                <textarea id="description" className="form-input form-textarea"
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  rows={3} maxLength={500} />
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">
                2. {eventType === "camp" ? "Pick the Team" : "Pick Participating Teams"}
              </h3>
              <div className="team-picker">
                {teams.map((team) => (
                  <label key={team.id}
                    className={`team-pick-card ${selectedTeamIds.includes(team.id) ? "team-pick-card-active" : ""}`}>
                    <input type={eventType === "camp" ? "radio" : "checkbox"} name="team"
                      checked={selectedTeamIds.includes(team.id)} onChange={() => toggleTeam(team.id)} />
                    <div className="team-pick-content">
                      <div className="team-pick-name">{team.name}</div>
                      <div className="team-pick-meta">
                        {team.sport_or_activity}
                        {team.age_group && ` · ${team.age_group}`}
                        {" · "}
                        <strong>{team.playerCount} player{team.playerCount === 1 ? "" : "s"}/participant{team.playerCount === 1 ? "" : "s"}</strong>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* SECTION 3: Fundraising Goal — Amount FIRST */}
            <div className="form-section">
              <h3 className="form-section-title">3. Fundraising Goal</h3>

              <div>
                <label htmlFor="goalAmount" className="form-label">
                  Fundraising Goal Amount <span className="required">*</span>
                </label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input id="goalAmount" type="number"
                    className="form-input form-input-with-prefix"
                    value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)}
                    min="0" step="0.01" required />
                </div>
              </div>

              <div>
                <label className="form-label">
                  Is this a per-team or per-player/participant goal? <span className="required">*</span>
                </label>
                <div className="radio-cards-compact">
                  <label className={`radio-card-small ${goalType === "per_team" ? "radio-card-active" : ""}`}>
                    <input type="radio" checked={goalType === "per_team"} onChange={() => setGoalType("per_team")} />
                    <div>
                      <div className="radio-card-title-small">Per Team</div>
                      <div className="radio-card-text-small">e.g., $2,000 total</div>
                    </div>
                  </label>
                  <label className={`radio-card-small ${goalType === "per_player" ? "radio-card-active" : ""}`}>
                    <input type="radio" checked={goalType === "per_player"} onChange={() => setGoalType("per_player")} />
                    <div>
                      <div className="radio-card-title-small">Per Player / Participant</div>
                      <div className="radio-card-text-small">e.g., $50 each</div>
                    </div>
                  </label>
                </div>
                <p className="form-hint" style={{ marginTop: "8px" }}>
                  {goalType === "per_team"
                    ? "The total amount your whole team will raise during this event."
                    : "The amount each player/participant will raise individually."}
                </p>
              </div>
            </div>

            {/* SECTION 4: Prizes with Gift Card dropdowns */}
            <div className="form-section">
              <h3 className="form-section-title">4. Prizes</h3>

              <div>
                <label className="form-label">Number of prize winners</label>
                <div className="radio-cards-compact">
                  <label className={`radio-card-small ${prizeCount === 1 ? "radio-card-active" : ""}`}>
                    <input type="radio" checked={prizeCount === 1} onChange={() => setPrizeCount(1)} />
                    <div>
                      <div className="radio-card-title-small">1 Winner</div>
                      <div className="radio-card-text-small">1st place only</div>
                    </div>
                  </label>
                  <label className={`radio-card-small ${prizeCount === 2 ? "radio-card-active" : ""}`}>
                    <input type="radio" checked={prizeCount === 2} onChange={() => setPrizeCount(2)} />
                    <div>
                      <div className="radio-card-title-small">2 Winners</div>
                      <div className="radio-card-text-small">1st & 2nd</div>
                    </div>
                  </label>
                  <label className={`radio-card-small ${prizeCount === 3 ? "radio-card-active" : ""}`}>
                    <input type="radio" checked={prizeCount === 3} onChange={() => setPrizeCount(3)} />
                    <div>
                      <div className="radio-card-title-small">3 Winners</div>
                      <div className="radio-card-text-small">1st, 2nd, 3rd</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 1st place */}
              <div className="prize-input-group">
                <div className="prize-input-row">
                  <div className="prize-input-amount">
                    <label htmlFor="firstAmount" className="form-label">🥇 1st place — Amount</label>
                    <div className="input-prefix-wrap">
                      <span className="input-prefix">$</span>
                      <input id="firstAmount" type="number"
                        className="form-input form-input-with-prefix"
                        value={firstPlaceAmount} onChange={(e) => setFirstPlaceAmount(e.target.value)}
                        min="0" step="0.01" />
                    </div>
                  </div>
                  <div className="prize-input-desc">
                    <label htmlFor="firstGiftCard" className="form-label">Gift Card Type</label>
                    <select id="firstGiftCard" className="form-input"
                      value={firstPlaceGiftCard} onChange={(e) => setFirstPlaceGiftCard(e.target.value)}>
                      <option value="">Select gift card type...</option>
                      {GIFT_CARD_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {firstPlaceGiftCard === "Other" && (
                  <div className="prize-custom-row">
                    <label htmlFor="firstCustom" className="form-label">Specify gift card / prize</label>
                    <input id="firstCustom" type="text" className="form-input"
                      placeholder="e.g., Target Gift Card, Local pizza place"
                      value={firstPlaceCustom} onChange={(e) => setFirstPlaceCustom(e.target.value)}
                      maxLength={200} />
                  </div>
                )}
              </div>

              {/* 2nd place */}
              {prizeCount >= 2 && (
                <div className="prize-input-group">
                  <div className="prize-input-row">
                    <div className="prize-input-amount">
                      <label htmlFor="secondAmount" className="form-label">🥈 2nd place — Amount</label>
                      <div className="input-prefix-wrap">
                        <span className="input-prefix">$</span>
                        <input id="secondAmount" type="number"
                          className="form-input form-input-with-prefix"
                          value={secondPlaceAmount} onChange={(e) => setSecondPlaceAmount(e.target.value)}
                          min="0" step="0.01" />
                      </div>
                    </div>
                    <div className="prize-input-desc">
                      <label htmlFor="secondGiftCard" className="form-label">Gift Card Type</label>
                      <select id="secondGiftCard" className="form-input"
                        value={secondPlaceGiftCard} onChange={(e) => setSecondPlaceGiftCard(e.target.value)}>
                        <option value="">Select gift card type...</option>
                        {GIFT_CARD_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {secondPlaceGiftCard === "Other" && (
                    <div className="prize-custom-row">
                      <label htmlFor="secondCustom" className="form-label">Specify gift card / prize</label>
                      <input id="secondCustom" type="text" className="form-input"
                        placeholder="e.g., Target Gift Card"
                        value={secondPlaceCustom} onChange={(e) => setSecondPlaceCustom(e.target.value)}
                        maxLength={200} />
                    </div>
                  )}
                </div>
              )}

              {/* 3rd place */}
              {prizeCount >= 3 && (
                <div className="prize-input-group">
                  <div className="prize-input-row">
                    <div className="prize-input-amount">
                      <label htmlFor="thirdAmount" className="form-label">🥉 3rd place — Amount</label>
                      <div className="input-prefix-wrap">
                        <span className="input-prefix">$</span>
                        <input id="thirdAmount" type="number"
                          className="form-input form-input-with-prefix"
                          value={thirdPlaceAmount} onChange={(e) => setThirdPlaceAmount(e.target.value)}
                          min="0" step="0.01" />
                      </div>
                    </div>
                    <div className="prize-input-desc">
                      <label htmlFor="thirdGiftCard" className="form-label">Gift Card Type</label>
                      <select id="thirdGiftCard" className="form-input"
                        value={thirdPlaceGiftCard} onChange={(e) => setThirdPlaceGiftCard(e.target.value)}>
                        <option value="">Select gift card type...</option>
                        {GIFT_CARD_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {thirdPlaceGiftCard === "Other" && (
                    <div className="prize-custom-row">
                      <label htmlFor="thirdCustom" className="form-label">Specify gift card / prize</label>
                      <input id="thirdCustom" type="text" className="form-input"
                        placeholder="e.g., Target Gift Card"
                        value={thirdPlaceCustom} onChange={(e) => setThirdPlaceCustom(e.target.value)}
                        maxLength={200} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Breakdown */}
            <div className="breakdown-card">
              <div className="breakdown-eyebrow">★ YOUR FUNDRAISING PLAN ★</div>
              <h3 className="breakdown-title">The Math at a Glance</h3>

              {!showBreakdown ? (
                <p className="breakdown-empty">Enter a goal amount above to see your fundraising breakdown.</p>
              ) : (
                <>
                  <div className="breakdown-rows">
                    <div className="breakdown-row">
                      <span className="breakdown-label">
                        {goalType === "per_team"
                          ? "Total Fundraising Goal"
                          : `${formatMoney(goalNum)} × ${totalPlayerCount}`}
                      </span>
                      <span className="breakdown-value">${formatMoney(totalGoal)}</span>
                    </div>
                    {prizePool > 0 && (
                      <div className="breakdown-row breakdown-row-deduct">
                        <span className="breakdown-label">− Prize Pool</span>
                        <span className="breakdown-value">−${formatMoney(prizePool)}</span>
                      </div>
                    )}
                    <div className="breakdown-divider"></div>
                    <div className="breakdown-row breakdown-row-final">
                      <span className="breakdown-label">Net to Your Team</span>
                      <span className="breakdown-value breakdown-value-final">${formatMoney(netToTeam)}</span>
                    </div>
                  </div>

                  {totalPlayerCount === 0 ? (
                    <div className="breakdown-per-player breakdown-per-player-empty">
                      ★ Add players or participants to your team(s) to see per-person breakdown
                    </div>
                  ) : netToTeam < 0 ? (
                    <div className="breakdown-per-player breakdown-per-player-warning">
                      ⚠ Prize pool exceeds your goal. Reduce prizes or raise the goal.
                    </div>
                  ) : (
                    <div className="breakdown-per-player">
                      <span className="breakdown-per-player-icon">★</span>
                      <span>
                        {totalPlayerCount} player{totalPlayerCount === 1 ? "" : "s"}/participant{totalPlayerCount === 1 ? "" : "s"} ×{" "}
                        <strong>${formatMoney(perPlayerNet)}</strong> each
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <Link href={`/events/${eventId}`} className="btn-cancel">Cancel</Link>
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

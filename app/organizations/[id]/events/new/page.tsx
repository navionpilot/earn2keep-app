"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

import AppShell from "@/components/AppShell";
import EventCreationGuide from "@/components/EventCreationGuide";
import {
  CAMP_FEE_USD,
  TOURNAMENT_FEE_USD,
  MAX_EVENT_DAYS,
  MINI_CAMP_GOAL_THRESHOLD_USD,
  isWithinMaxDuration,
  eventDurationDays,
  shouldAutoUpgradeToCamp,
} from "@/lib/pricing";
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

export default function NewEventPage() {
  const params = useParams();
  const orgId = params.id as string;
  const router = useRouter();

  const [orgName, setOrgName] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [fetching, setFetching] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<"mini-camp" | "camp" | "tournament" | "">("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
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

      const teamIds = (teamsData || []).map((t) => t.id);
      const playerCounts: Record<string, number> = {};
      if (teamIds.length > 0) {
        const { data: playerData } = await supabase
          .from("players")
          .select("team_id")
          .in("team_id", teamIds)
          .eq("is_active", true);
        (playerData || []).forEach((p) => {
          playerCounts[p.team_id] = (playerCounts[p.team_id] || 0) + 1;
        });
      }

      setTeams((teamsData || []).map((t) => ({
        ...t,
        playerCount: playerCounts[t.id] || 0,
      })));
      setFetching(false);
    };

    fetchOrgAndTeams();
  }, [orgId]);

  const toggleTeam = (teamId: string) => {
    if ((eventType === "camp" || eventType === "mini-camp")) {
      setSelectedTeamIds([teamId]);
    } else {
      if (selectedTeamIds.includes(teamId)) {
        setSelectedTeamIds(selectedTeamIds.filter((id) => id !== teamId));
      } else {
        setSelectedTeamIds([...selectedTeamIds, teamId]);
      }
    }
  };

  const handleEventTypeChange = (newType: "mini-camp" | "camp" | "tournament") => {
    setEventType(newType);
    setSelectedTeamIds([]);
    setGoalAmount(""); // Reset since meaning changes
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

  // Both Camp and Tournament: total = per-person amount × number of people
  const totalRaised = goalNum * totalPlayerCount;
  const netToTeam = totalRaised - prizePool;
  const showBreakdown = goalNum > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError("Event name is required."); return; }
    if (!eventType) { setError("Please pick Mini-Camp, Camp, or Tournament."); return; }
    if (!startDate || !endDate) { setError("Please set start and end dates."); return; }
    if (new Date(endDate) < new Date(startDate)) { setError("End date must be on or after start date."); return; }
    if (!isWithinMaxDuration(startDate, endDate)) {
      setError(`Events run up to ${MAX_EVENT_DAYS} days. Please shorten the date range.`);
      return;
    }
    if (selectedTeamIds.length === 0) {
      setError((eventType === "camp" || eventType === "mini-camp") ? "Please pick a team." : "Please pick at least one team.");
      return;
    }
    if (eventType === "tournament" && selectedTeamIds.length < 2) {
      setError("A Tournament needs at least 2 teams.");
      return;
    }
    if (!goalAmount || goalNum <= 0) {
      setError((eventType === "camp" || eventType === "mini-camp")
        ? "Please enter a per-player fundraising goal."
        : "Please enter a per-player registration fee.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("You must be logged in."); setLoading(false); return; }

    const firstPrize = combineGiftCard(firstPlaceGiftCard, firstPlaceCustom);
    const secondPrize = prizeCount >= 2 ? combineGiftCard(secondPlaceGiftCard, secondPlaceCustom) : null;
    const thirdPrize = prizeCount >= 3 ? combineGiftCard(thirdPlaceGiftCard, thirdPlaceCustom) : null;

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
        goal_type: "per_player", // Always per_player now
        goal_amount: goalNum,
        prize_count: prizeCount,
        first_place_prize: firstPrize,
        first_place_amount: firstNum > 0 ? firstNum : null,
        second_place_prize: secondPrize,
        second_place_amount: prizeCount >= 2 && secondNum > 0 ? secondNum : null,
        third_place_prize: thirdPrize,
        third_place_amount: prizeCount >= 3 && thirdNum > 0 ? thirdNum : null,
        status: "draft",
      })
      .select()
      .single();

    if (insertError || !event) {
      setError(insertError?.message || "Failed to create event.");
      setLoading(false);
      return;
    }

    const participantRows = selectedTeamIds.map((teamId) => ({
      event_id: event.id,
      team_id: teamId,
      owner_id: user.id,
    }));

    const { error: partError } = await supabase.from("event_participants").insert(participantRows);
    if (partError) {
      setError(`Event created but failed to link teams: ${partError.message}`);
      setLoading(false);
      return;
    }

    router.push(`/events/${event.id}/payment`);
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
              <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
            </Link>
            <Link href={`/organizations/${orgId}`} className="btn-link">← Back</Link>
          </div>
        </header>
        <main className="form-page-main">
          <div className="form-card">
            <h1 className="form-title">No Teams Yet</h1>
            <p className="form-subtitle">
              You need at least one team before creating an event. Add a team to <strong>{orgName}</strong> first.
            </p>
            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <Link href={`/organizations/${orgId}/teams/new`} className="btn-primary-link">Add a Team →</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Dynamic labels based on event type
  const goalFieldLabel = (eventType === "camp" || eventType === "mini-camp")
    ? "Fundraising Goal Amount per Player/Participant"
    : eventType === "tournament"
    ? "Registration Fee per Player/Participant"
    : "Amount per Player/Participant";

  const goalFieldHint = (eventType === "camp" || eventType === "mini-camp")
    ? "The minimum amount each player or participant must raise to compete. Players can raise more — extra fundraising counts toward their total points."
    : eventType === "tournament"
    ? "The flat entry fee each player pays to register. Players can pay it themselves or get a supporter (parent, family, business) to cover it."
    : "Pick an event type first.";

  const goalPlaceholder = (eventType === "camp" || eventType === "mini-camp") ? "50" : eventType === "tournament" ? "25" : "";

  return (
    <AppShell active="events" userDisplayName={""}>
      <div className="e2k-form-2col">
        <main className="e2k-form-main">
          <div className="form-card">
          <div style={{ textAlign: "center" }}>
            <span className="auth-eyebrow">★ STEP 4 OF YOUR JOURNEY ★</span>
          </div>

          <h1 className="form-title">Create Event</h1>
          <p className="form-subtitle">
            Setting up an event for <strong>{orgName}</strong>. Pick Camp (one
            team fundraiser) or Tournament (multi-team registration competition).
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
                  id="name" type="text" className="form-input"
                  placeholder='e.g., "Lincoln Lions Spring Camp 2026"'
                  value={name} onChange={(e) => setName(e.target.value)}
                  required maxLength={120} autoFocus
                />
              </div>

              <div>
                <label className="form-label">
                  Event type <span className="required">*</span>
                </label>
                <div className="radio-cards">
                  <label className={`radio-card ${eventType === "mini-camp" ? "radio-card-active" : ""}`}>
                    <input type="radio" name="eventType" value="mini-camp"
                      checked={eventType === "mini-camp"} onChange={() => handleEventTypeChange("mini-camp")} />
                    <div className="radio-card-content">
                      <div className="radio-card-icon">🌱</div>
                      <div className="radio-card-title">Mini-Camp <span style={{ fontWeight: 600, opacity: 0.7, fontSize: "0.85em" }}>· $99</span></div>
                      <div className="radio-card-text">
                        <strong>One team. Smaller fundraiser.</strong> Same as
                        Camp but priced for events targeting under $2,000.
                        Best for smaller groups or first-time fundraisers.
                      </div>
                    </div>
                  </label>
                  <label className={`radio-card ${eventType === "camp" ? "radio-card-active" : ""}`}>
                    <input type="radio" name="eventType" value="camp"
                      checked={eventType === "camp"} onChange={() => handleEventTypeChange("camp")} />
                    <div className="radio-card-content">
                      <div className="radio-card-icon">🏃</div>
                      <div className="radio-card-title">Camp <span style={{ fontWeight: 600, opacity: 0.7, fontSize: "0.85em" }}>· $189</span></div>
                      <div className="radio-card-text">
                        <strong>One team. Fundraiser model.</strong> Each
                        player has a fundraising goal — they get supporters
                        (family, friends, businesses) to fund their entry.
                        Raise more = earn more points toward winning.
                      </div>
                    </div>
                  </label>
                  <label className={`radio-card ${eventType === "tournament" ? "radio-card-active" : ""}`}>
                    <input type="radio" name="eventType" value="tournament"
                      checked={eventType === "tournament"} onChange={() => handleEventTypeChange("tournament")} />
                    <div className="radio-card-content">
                      <div className="radio-card-icon">🏆</div>
                      <div className="radio-card-title">Tournament <span style={{ fontWeight: 600, opacity: 0.7, fontSize: "0.85em" }}>· $349</span></div>
                      <div className="radio-card-text">
                        <strong>Multiple teams. Registration model.</strong>{" "}
                        Each player pays a flat registration fee to enter.
                        Teams compete head-to-head. Could be dozens of teams.
                      </div>
                    </div>
                  </label>
                </div>
                <p className="form-section-hint">
                  ${CAMP_FEE_USD} per Camp · ${TOURNAMENT_FEE_USD} per Tournament. You'll review your event and pay the fee on the next step. Plus a 3.5% transaction fee on funds raised.
                </p>
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
              <p className="form-section-hint">
                Events run up to {MAX_EVENT_DAYS} days.{" "}
                {startDate && endDate && !isNaN(eventDurationDays(startDate, endDate)) && (
                  <span style={{
                    fontWeight: 600,
                    color: isWithinMaxDuration(startDate, endDate) ? "inherit" : "#dc2626",
                  }}>
                    Currently: {eventDurationDays(startDate, endDate)} day{eventDurationDays(startDate, endDate) === 1 ? "" : "s"}
                    {!isWithinMaxDuration(startDate, endDate) && " — exceeds 30-day maximum"}
                  </span>
                )}
              </p>

              <div>
                <label htmlFor="description" className="form-label">Description (optional)</label>
                <textarea id="description" className="form-input form-textarea"
                  placeholder="Describe the theme or purpose of this event..."
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  rows={3} maxLength={500} />
              </div>
            </div>

            {/* SECTION 2: Teams */}
            {eventType && (
              <div className="form-section">
                <h3 className="form-section-title">
                  2. {(eventType === "camp" || eventType === "mini-camp") ? "Pick the Team" : "Pick Participating Teams"}
                </h3>
                <p className="form-section-hint">
                  {(eventType === "camp" || eventType === "mini-camp")
                    ? "A Camp involves exactly one team. Pick which one is participating in this fundraiser."
                    : "A Tournament needs at least 2 teams. Check all the teams that will compete."}
                </p>

                <div className="team-picker">
                  {teams.map((team) => (
                    <label key={team.id}
                      className={`team-pick-card ${selectedTeamIds.includes(team.id) ? "team-pick-card-active" : ""}`}>
                      <input type={(eventType === "camp" || eventType === "mini-camp") ? "radio" : "checkbox"} name="team"
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
                {selectedTeamIds.length > 0 && (
                  <p className="form-section-hint" style={{ marginTop: "8px", color: "var(--color-blue-dark)" }}>
                    ✓ {selectedTeamIds.length} team{selectedTeamIds.length === 1 ? "" : "s"} selected ·{" "}
                    {totalPlayerCount} total
                  </p>
                )}
              </div>
            )}

            {/* SECTION 3: Money — type-aware */}
            {eventType && (
              <div className="form-section">
                <h3 className="form-section-title">
                  3. {(eventType === "camp" || eventType === "mini-camp") ? "Fundraising Goal" : "Registration Fee"}
                </h3>

                {/* Type-specific explainer box */}
                <div className={`info-box info-box-${eventType}`}>
                  {(eventType === "camp" || eventType === "mini-camp") ? (
                    <>
                      <strong>How a Camp works:</strong> Each player or
                      participant has a minimum fundraising goal. They share
                      a unique QR code with parents, family, friends, and
                      local businesses to collect donations. Once they hit
                      the minimum, they're registered. The more they raise
                      above the minimum, the more points they earn toward
                      winning prizes.
                    </>
                  ) : (
                    <>
                      <strong>How a Tournament works:</strong> Each player
                      pays a flat registration fee to enter. They can pay it
                      themselves, or get a supporter (parent, family, business)
                      to cover it. Once paid, they're registered for the
                      tournament. Players compete in challenges — winners
                      take home prizes.
                    </>
                  )}
                </div>

                <div>
                  <label htmlFor="goalAmount" className="form-label">
                    {goalFieldLabel} <span className="required">*</span>
                    <Tooltip text={goalFieldHint}>
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <div className="input-prefix-wrap">
                    <span className="input-prefix">$</span>
                    <input id="goalAmount" type="number"
                      className="form-input form-input-with-prefix"
                      placeholder={goalPlaceholder}
                      value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)}
                      min="0" step="0.01" required />
                  </div>
                  <p className="form-hint">{goalFieldHint}</p>
                </div>
              </div>
            )}

            {/* SECTION 4: Prizes */}
            {eventType && (
              <div className="form-section">
                <h3 className="form-section-title">4. Prizes</h3>
                <p className="form-section-hint">
                  How many prize winners? Pick the gift card type and amount —
                  the prize pool is paid out from the total raised.
                </p>

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
                          className="form-input form-input-with-prefix" placeholder="200"
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

                {prizeCount >= 2 && (
                  <div className="prize-input-group">
                    <div className="prize-input-row">
                      <div className="prize-input-amount">
                        <label htmlFor="secondAmount" className="form-label">🥈 2nd place — Amount</label>
                        <div className="input-prefix-wrap">
                          <span className="input-prefix">$</span>
                          <input id="secondAmount" type="number"
                            className="form-input form-input-with-prefix" placeholder="100"
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

                {prizeCount >= 3 && (
                  <div className="prize-input-group">
                    <div className="prize-input-row">
                      <div className="prize-input-amount">
                        <label htmlFor="thirdAmount" className="form-label">🥉 3rd place — Amount</label>
                        <div className="input-prefix-wrap">
                          <span className="input-prefix">$</span>
                          <input id="thirdAmount" type="number"
                            className="form-input form-input-with-prefix" placeholder="50"
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
            )}

            {/* Mini-Camp tier-mismatch warning — fires when the user picked
                Mini-Camp but their total goal exceeds the threshold. */}
            {eventType === "mini-camp" && shouldAutoUpgradeToCamp({
              eventType,
              totalGoalUsd: totalRaised,
            }) && (
              <div className="alert alert-warning" style={{ marginTop: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                  <strong>Your goal exceeds the Mini-Camp threshold.</strong>{" "}
                  Mini-Camp is meant for fundraisers up to ${MINI_CAMP_GOAL_THRESHOLD_USD.toLocaleString()}.
                  Your total of ${formatMoney(totalRaised)} pushes this into Camp tier territory (${CAMP_FEE_USD}).
                  If you keep Mini-Camp here, the event will auto-upgrade to Camp pricing at payment.
                </div>
                <button
                  type="button"
                  onClick={() => handleEventTypeChange("camp")}
                  className="btn-primary btn-inline"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Switch to Camp →
                </button>
              </div>
            )}

            {/* Live Breakdown */}
            {eventType && (
              <div className="breakdown-card">
                <div className="breakdown-eyebrow">★ YOUR FUNDRAISING PLAN ★</div>
                <h3 className="breakdown-title">The Math at a Glance</h3>

                {!showBreakdown ? (
                  <p className="breakdown-empty">
                    Enter a {(eventType === "camp" || eventType === "mini-camp") ? "fundraising goal" : "registration fee"} above to see the breakdown.
                  </p>
                ) : (
                  <>
                    <div className="breakdown-rows">
                      <div className="breakdown-row">
                        <span className="breakdown-label">
                          ${formatMoney(goalNum)} {(eventType === "camp" || eventType === "mini-camp") ? "minimum" : "fee"} × {totalPlayerCount} player{totalPlayerCount === 1 ? "" : "s"}/participant{totalPlayerCount === 1 ? "" : "s"}
                        </span>
                        <span className="breakdown-value">${formatMoney(totalRaised)}</span>
                      </div>
                      {prizePool > 0 && (
                        <div className="breakdown-row breakdown-row-deduct">
                          <span className="breakdown-label">− Prize Pool</span>
                          <span className="breakdown-value">−${formatMoney(prizePool)}</span>
                        </div>
                      )}
                      <div className="breakdown-divider"></div>
                      <div className="breakdown-row breakdown-row-final">
                        <span className="breakdown-label">
                          {(eventType === "camp" || eventType === "mini-camp") ? "Minimum Net to Team" : "Net to Team"}
                        </span>
                        <span className="breakdown-value breakdown-value-final">
                          ${formatMoney(netToTeam)}
                        </span>
                      </div>
                    </div>

                    {totalPlayerCount === 0 ? (
                      <div className="breakdown-per-player breakdown-per-player-empty">
                        ★ Add players or participants to your team(s) to see the breakdown
                      </div>
                    ) : netToTeam < 0 ? (
                      <div className="breakdown-per-player breakdown-per-player-warning">
                        ⚠ Prize pool exceeds total raised. Reduce prizes or raise the {(eventType === "camp" || eventType === "mini-camp") ? "goal" : "fee"}.
                      </div>
                    ) : (eventType === "camp" || eventType === "mini-camp") ? (
                      <div className="breakdown-per-player">
                        <span className="breakdown-per-player-icon">★</span>
                        <span>
                          Each player must raise <strong>${formatMoney(goalNum)}</strong>{" "}
                          minimum to compete — and can raise more for extra points
                        </span>
                      </div>
                    ) : (
                      <div className="breakdown-per-player">
                        <span className="breakdown-per-player-icon">★</span>
                        <span>
                          Each player pays <strong>${formatMoney(goalNum)}</strong>{" "}
                          to register and compete
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-actions">
              <Link href={`/organizations/${orgId}`} className="btn-cancel">Cancel</Link>
              <button type="submit" className="btn-primary btn-inline" disabled={loading || !eventType}>
                {loading ? "Creating..." : "Create Event →"}
              </button>
            </div>
          </form>
        </div>
      </main>

      <EventCreationGuide
        eventType={eventType}
        hasName={name.trim().length > 0}
        hasStartDate={startDate.length > 0}
        hasEndDate={endDate.length > 0}
        selectedTeamCount={selectedTeamIds.length}
        hasGoalAmount={goalAmount.trim().length > 0 && Number(goalAmount) > 0}
        hasFirstPrize={firstPlaceAmount.trim().length > 0}
      />
      </div>
    </AppShell>
  );
}

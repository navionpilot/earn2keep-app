"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import Tooltip from "@/components/Tooltip";

import AppShell from "@/components/AppShell";
import {
  CAMP_FEE_USD,
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

const splitGiftCard = (existing: string | null): { selection: string; custom: string } => {
  if (!existing) return { selection: "", custom: "" };
  if (GIFT_CARD_OPTIONS.includes(existing)) {
    return { selection: existing, custom: "" };
  }
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
      setGoalAmount(event.goal_amount?.toString() || "");
      setPrizeCount((event.prize_count as 1 | 2 | 3) || 1);

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
        .from("teams").select("id, name, sport_or_activity, age_group")
        .eq("organization_id", event.organization_id).order("name");

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
    if ((newType === "camp" || newType === "mini-camp") && selectedTeamIds.length > 1) {
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
      setError("A Tournament needs at least 2 teams."); return;
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

    const { error: updateError } = await supabase.from("events").update({
      name: name.trim(),
      event_type: eventType,
      description: description.trim() || null,
      start_date: startDate,
      end_date: endDate,
      goal_type: "per_player",
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

  const goalFieldLabel = (eventType === "camp" || eventType === "mini-camp")
    ? "Fundraising Goal Amount per Player/Participant"
    : "Registration Fee per Player/Participant";

  const goalFieldHint = (eventType === "camp" || eventType === "mini-camp")
    ? "The minimum amount each player must raise to compete. Players can raise more — extra fundraising = extra points."
    : "The flat entry fee each player pays to register.";

  return (
    <AppShell active="events" userDisplayName={""}>
      <main className="form-page-main-wide">
        <div className="form-card">
          <h1 className="form-title">Edit Event</h1>
          <p className="form-subtitle">Updating event for <strong>{orgName}</strong>.</p>

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
                  <label className={`radio-card ${eventType === "mini-camp" ? "radio-card-active" : ""}`}>
                    <input type="radio" name="eventType" value="mini-camp"
                      checked={eventType === "mini-camp"} onChange={() => handleEventTypeChange("mini-camp")} />
                    <div className="radio-card-content">
                      <div className="radio-card-icon">🌱</div>
                      <div className="radio-card-title">Mini-Camp <span style={{ fontWeight: 600, opacity: 0.7, fontSize: "0.85em" }}>· $99</span></div>
                      <div className="radio-card-text">
                        <strong>One team. Smaller fundraiser.</strong> Same as Camp,
                        priced for events targeting under $3,000.
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
                        player raises a minimum amount through supporters.
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
                        Each player pays a flat entry fee.
                      </div>
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
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  rows={3} maxLength={500} />
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">
                2. {(eventType === "camp" || eventType === "mini-camp") ? "Pick the Team" : "Pick Participating Teams"}
              </h3>
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
            </div>

            <div className="form-section">
              <h3 className="form-section-title">
                3. {(eventType === "camp" || eventType === "mini-camp") ? "Fundraising Goal" : "Registration Fee"}
              </h3>

              <div className={`info-box info-box-${eventType}`}>
                {(eventType === "camp" || eventType === "mini-camp") ? (
                  <>
                    <strong>How a Camp works:</strong> Each player has a
                    minimum fundraising goal. They share QR codes with
                    supporters to collect funds. Raising more = more points
                    toward winning.
                  </>
                ) : (
                  <>
                    <strong>How a Tournament works:</strong> Each player
                    pays a flat registration fee. Supporters can cover it
                    via QR code. Once paid, they're registered to compete.
                  </>
                )}
              </div>

              <div>
                <label htmlFor="goalAmount" className="form-label">
                  {goalFieldLabel} <span className="required">*</span>
                </label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input id="goalAmount" type="number"
                    className="form-input form-input-with-prefix"
                    value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)}
                    min="0" step="0.01" required />
                </div>
                <p className="form-hint">{goalFieldHint}</p>
              </div>
            </div>

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
                        value={thirdPlaceCustom} onChange={(e) => setThirdPlaceCustom(e.target.value)}
                        maxLength={200} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mini-Camp tier-mismatch warning */}
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

            <div className="breakdown-card">
              <div className="breakdown-eyebrow">★ YOUR FUNDRAISING PLAN ★</div>
              <h3 className="breakdown-title">The Math at a Glance</h3>

              {!showBreakdown ? (
                <p className="breakdown-empty">Enter an amount above to see the breakdown.</p>
              ) : (
                <>
                  <div className="breakdown-rows">
                    <div className="breakdown-row">
                      <span className="breakdown-label">
                        ${formatMoney(goalNum)} {(eventType === "camp" || eventType === "mini-camp") ? "minimum" : "fee"} × {totalPlayerCount}
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
                      <span className="breakdown-value breakdown-value-final">${formatMoney(netToTeam)}</span>
                    </div>
                  </div>

                  {totalPlayerCount === 0 ? (
                    <div className="breakdown-per-player breakdown-per-player-empty">
                      ★ Add players or participants to your team(s) to see breakdown
                    </div>
                  ) : netToTeam < 0 ? (
                    <div className="breakdown-per-player breakdown-per-player-warning">
                      ⚠ Prize pool exceeds total raised. Reduce prizes or raise the {(eventType === "camp" || eventType === "mini-camp") ? "goal" : "fee"}.
                    </div>
                  ) : (eventType === "camp" || eventType === "mini-camp") ? (
                    <div className="breakdown-per-player">
                      <span className="breakdown-per-player-icon">★</span>
                      <span>Each player must raise <strong>${formatMoney(goalNum)}</strong> minimum — extra raised = extra points</span>
                    </div>
                  ) : (
                    <div className="breakdown-per-player">
                      <span className="breakdown-per-player-icon">★</span>
                      <span>Each player pays <strong>${formatMoney(goalNum)}</strong> to register</span>
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
    </AppShell>
  );
}

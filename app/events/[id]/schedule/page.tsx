"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import LogoutButton from "@/components/LogoutButton";
import CalendarMonthView, { DayChallenge } from "@/components/CalendarMonthView";
import DayPlanSidebar, { AssignedChallenge } from "@/components/DayPlanSidebar";
import ChallengeLibraryModal, { LibraryChallenge } from "@/components/ChallengeLibraryModal";

type EventChallengeRow = {
  id: string;
  challenge_id: string;
  day_index: number;
  rep_target: number | null;
  challenges: {
    id: string;
    name: string;
    category: string;
    unit: string | null;
  } | null;
};

const dateToYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const dayIndexFromDate = (date: string, eventStart: string): number => {
  const d = new Date(date + "T12:00:00");
  const start = new Date(eventStart + "T12:00:00");
  const ms = d.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const dateFromDayIndex = (dayIndex: number, eventStart: string): string => {
  const start = new Date(eventStart + "T12:00:00");
  start.setDate(start.getDate() + dayIndex);
  return dateToYMD(start);
};

const formatShortDate = (date: string): string => {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export default function SchedulePlannerPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [eventName, setEventName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");

  // All event_challenges for this event
  const [scheduledRows, setScheduledRows] = useState<EventChallengeRow[]>([]);
  // Library
  const [libraryChallenges, setLibraryChallenges] = useState<LibraryChallenge[]>([]);

  // Selected day state
  const [selectedDate, setSelectedDate] = useState<string>("");
  // Currently displayed month (year + 0-based month)
  const [displayYear, setDisplayYear] = useState<number>(new Date().getFullYear());
  const [displayMonth, setDisplayMonth] = useState<number>(new Date().getMonth());

  const [fetching, setFetching] = useState(true);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sidebar state for the OnboardingSidebar
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const [hasTeams, setHasTeams] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [hasEvent, setHasEvent] = useState(false);

  const today = useMemo(() => dateToYMD(new Date()), []);

  const fetchAll = async () => {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (profile?.full_name) setUserDisplayName(profile.full_name);

      const [{ count: teamCount }, { count: playerCount }, { count: eventCount }] = await Promise.all([
        supabase.from("teams").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("players").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("events").select("*", { count: "exact", head: true }).eq("owner_id", user.id),
      ]);
      setHasTeams((teamCount || 0) > 0);
      setHasPlayers((playerCount || 0) > 0);
      setHasEvent((eventCount || 0) > 0);
    }

    // Fetch event details
    const { data: event } = await supabase
      .from("events")
      .select("name, organization_id, start_date, end_date, status")
      .eq("id", eventId)
      .single();

    if (!event) { setError("Event not found."); setFetching(false); return; }

    setEventName(event.name);
    setOrgId(event.organization_id);
    setEventStartDate(event.start_date);
    setEventEndDate(event.end_date);

    // Default selected day:
    // - If today is within event window, select today
    // - Else, select event start date (Day 1)
    let initialDate = event.start_date;
    if (today >= event.start_date && today <= event.end_date) {
      initialDate = today;
    }
    setSelectedDate(initialDate);

    // Display month is the month of the initial selected date
    const initial = new Date(initialDate + "T12:00:00");
    setDisplayYear(initial.getFullYear());
    setDisplayMonth(initial.getMonth());

    // Fetch scheduled challenges with challenge details
    const { data: scheduled } = await supabase
      .from("event_challenges")
      .select("id, challenge_id, day_index, rep_target, challenges(id, name, category, unit)")
      .eq("event_id", eventId)
      .order("day_index", { ascending: true });

    setScheduledRows((scheduled as any) || []);

    // Fetch library
    const { data: library } = await supabase
      .from("challenges")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    setLibraryChallenges(library || []);

    setFetching(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Build dayContent map: YYYY-MM-DD -> categories for that day
  const dayContent = useMemo(() => {
    const map: Record<string, DayChallenge[]> = {};
    if (!eventStartDate) return map;

    scheduledRows.forEach((row) => {
      const cat = row.challenges?.category || "Sports";
      const date = dateFromDayIndex(row.day_index, eventStartDate);
      if (!map[date]) map[date] = [];
      const existing = map[date].find((c) => c.category === cat);
      if (existing) {
        existing.count++;
      } else {
        map[date].push({ category: cat, count: 1 });
      }
    });

    return map;
  }, [scheduledRows, eventStartDate]);

  // Derive challenges for the currently selected day
  const selectedDayChallenges: AssignedChallenge[] = useMemo(() => {
    if (!eventStartDate || !selectedDate) return [];
    const dayIdx = dayIndexFromDate(selectedDate, eventStartDate);
    return scheduledRows
      .filter((r) => r.day_index === dayIdx)
      .map((r) => ({
        id: r.id,
        challengeId: r.challenge_id,
        name: r.challenges?.name || "Unknown",
        category: r.challenges?.category || "Sports",
        unit: r.challenges?.unit || null,
        repTarget: r.rep_target,
      }));
  }, [scheduledRows, selectedDate, eventStartDate]);

  // Already-assigned challenge IDs on the selected day (so library modal can disable them)
  const alreadyOnDay = useMemo(() => {
    return new Set(selectedDayChallenges.map((c) => c.challengeId));
  }, [selectedDayChallenges]);

  // Day index of the selected date (within event window)
  const selectedDayIndex = useMemo(() => {
    if (!eventStartDate || !selectedDate) return 0;
    return dayIndexFromDate(selectedDate, eventStartDate);
  }, [selectedDate, eventStartDate]);

  // Total event days
  const totalDays = useMemo(() => {
    if (!eventStartDate || !eventEndDate) return 0;
    return dayIndexFromDate(eventEndDate, eventStartDate) + 1;
  }, [eventStartDate, eventEndDate]);

  // Month nav handlers
  const goPrevMonth = () => {
    if (displayMonth === 0) {
      setDisplayMonth(11);
      setDisplayYear(displayYear - 1);
    } else {
      setDisplayMonth(displayMonth - 1);
    }
  };

  const goNextMonth = () => {
    if (displayMonth === 11) {
      setDisplayMonth(0);
      setDisplayYear(displayYear + 1);
    } else {
      setDisplayMonth(displayMonth + 1);
    }
  };

  const monthLabel = useMemo(() => {
    const d = new Date(displayYear, displayMonth, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [displayYear, displayMonth]);

  // Mutation handlers
  const handleAddChallenge = async (challenge: LibraryChallenge, repTarget: number) => {
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not logged in"); return; }

    const dayIdx = dayIndexFromDate(selectedDate, eventStartDate);

    const { error: insertError } = await supabase.from("event_challenges").insert({
      event_id: eventId,
      challenge_id: challenge.id,
      day_index: dayIdx,
      rep_target: repTarget,
      owner_id: user.id,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setShowLibraryModal(false);
    await fetchAll();
  };

  const handleRemoveChallenge = async (id: string) => {
    setError(null);
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("event_challenges")
      .delete()
      .eq("id", id);
    if (delErr) { setError(delErr.message); return; }
    await fetchAll();
  };

  const handleUpdateRepTarget = async (id: string, newTarget: number) => {
    setError(null);
    const supabase = createClient();
    const { error: updErr } = await supabase
      .from("event_challenges")
      .update({ rep_target: newTarget })
      .eq("id", id);
    if (updErr) { setError(updErr.message); return; }
    // Optimistic local update for snappy feel
    setScheduledRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, rep_target: newTarget } : r))
    );
  };

  const handleMarkAsRestDay = async () => {
    setError(null);
    const supabase = createClient();
    const dayIdx = dayIndexFromDate(selectedDate, eventStartDate);
    const { error: delErr } = await supabase
      .from("event_challenges")
      .delete()
      .eq("event_id", eventId)
      .eq("day_index", dayIdx);
    if (delErr) { setError(delErr.message); return; }
    await fetchAll();
  };

  if (fetching) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>Loading schedule...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
          </Link>
          <div className="dashboard-user-section">
            <span className="dashboard-user-email">{userDisplayName}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <OnboardingSidebar
          hasOrganization={true}
          hasTeams={hasTeams}
          hasPlayers={hasPlayers}
          hasEvent={hasEvent}
        />

        <main className="dashboard-main-with-sidebar">
          <Link href={`/events/${eventId}`} className="btn-back">
            ← Back to {eventName}
          </Link>

          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
            <span className="breadcrumb-sep">›</span>
            <Link href={`/events/${eventId}`} className="breadcrumb-link">{eventName}</Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">Training Schedule</span>
          </div>

          <div className="schedule-header">
            <div>
              <h1 className="dashboard-welcome">Training Schedule</h1>
              <p className="dashboard-subtitle">
                Plan which challenges your players or participants will tackle each
                day of <strong>{eventName}</strong>. Click a day to edit it.
              </p>
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}

          <div className="schedule-toolbar">
            <div className="schedule-month-nav">
              <button type="button" className="btn-icon" onClick={goPrevMonth} aria-label="Previous month">←</button>
              <span className="schedule-month-label">{monthLabel}</span>
              <button type="button" className="btn-icon" onClick={goNextMonth} aria-label="Next month">→</button>
            </div>
            <div className="schedule-view-toggle">
              <button type="button" className="schedule-view-btn schedule-view-btn-active">📅 Calendar</button>
              <button type="button" className="schedule-view-btn schedule-view-btn-disabled" disabled title="Coming next">📋 List</button>
              <button type="button" className="schedule-view-btn schedule-view-btn-disabled" disabled title="Coming next">📊 Week</button>
            </div>
          </div>

          <div className="schedule-layout">
            <div className="schedule-calendar-area">
              <CalendarMonthView
                year={displayYear}
                month={displayMonth}
                eventStartDate={eventStartDate}
                eventEndDate={eventEndDate}
                selectedDate={selectedDate}
                dayContent={dayContent}
                onSelectDay={(date) => setSelectedDate(date)}
                today={today}
              />
            </div>

            <div className="schedule-sidebar-area">
              <DayPlanSidebar
                selectedDate={selectedDate}
                dayIndex={selectedDayIndex}
                totalDays={totalDays}
                challenges={selectedDayChallenges}
                onAddChallenge={() => setShowLibraryModal(true)}
                onRemoveChallenge={handleRemoveChallenge}
                onUpdateRepTarget={handleUpdateRepTarget}
                onMarkAsRestDay={handleMarkAsRestDay}
              />
            </div>
          </div>

          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <Link href={`/events/${eventId}`} className="btn-primary-link">
              Done — Back to Event →
            </Link>
          </div>
        </main>
      </div>

      <ChallengeLibraryModal
        open={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        onSelectChallenge={handleAddChallenge}
        challenges={libraryChallenges}
        alreadyOnDay={alreadyOnDay}
        selectedDateLabel={selectedDate ? formatShortDate(selectedDate) : ""}
        createCustomHref={`/challenges/new?returnTo=${eventId}/schedule`}
      />
    </div>
  );
}

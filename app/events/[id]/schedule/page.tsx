"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import LogoutButton from "@/components/LogoutButton";
import CalendarMonthView, { DayChallenge } from "@/components/CalendarMonthView";
import CalendarWeekView from "@/components/CalendarWeekView";
import CalendarListView from "@/components/CalendarListView";
import DayPlanSidebar, { AssignedChallenge } from "@/components/DayPlanSidebar";
import ChallengeLibraryModal, { LibraryChallenge, LibrarySubcategory } from "@/components/ChallengeLibraryModal";
import ApplyToDaysModal from "@/components/ApplyToDaysModal";

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
  const [librarySubcategories, setLibrarySubcategories] = useState<LibrarySubcategory[]>([]);

  // Selected day state
  const [selectedDate, setSelectedDate] = useState<string>("");
  // Currently displayed month (year + 0-based month)
  const [displayYear, setDisplayYear] = useState<number>(new Date().getFullYear());
  const [displayMonth, setDisplayMonth] = useState<number>(new Date().getMonth());

  const [fetching, setFetching] = useState(true);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View mode: "month" | "week" | "list"
  const [viewMode, setViewMode] = useState<"month" | "week" | "list">("month");

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

    // Fetch subcategories (RLS automatically filters to public + own org)
    const { data: subs } = await supabase
      .from("challenge_subcategories")
      .select("id, parent_category, name, is_public")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    setLibrarySubcategories((subs as any) || []);

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

  // Apply this day's plan to selected target days
  const handleApplyToDays = async (targetDates: string[], replaceExisting: boolean) => {
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    const sourceDayIdx = dayIndexFromDate(selectedDate, eventStartDate);
    const sourceRows = scheduledRows.filter((r) => r.day_index === sourceDayIdx);
    if (sourceRows.length === 0) throw new Error("No challenges to copy from this day");

    // Convert target dates to day indices
    const targetIndices = targetDates.map((d) => dayIndexFromDate(d, eventStartDate));

    // If replaceExisting, delete all existing challenges on target days first
    if (replaceExisting && targetIndices.length > 0) {
      const { error: delErr } = await supabase
        .from("event_challenges")
        .delete()
        .eq("event_id", eventId)
        .in("day_index", targetIndices);
      if (delErr) throw new Error(delErr.message);
    }

    // Build rows to insert. If MERGING, skip rows where (challenge_id, day_index) already exists.
    let existingByKey = new Set<string>();
    if (!replaceExisting) {
      // Refetch fresh state of all rows in target days
      const { data: existing } = await supabase
        .from("event_challenges")
        .select("challenge_id, day_index")
        .eq("event_id", eventId)
        .in("day_index", targetIndices);
      existingByKey = new Set((existing || []).map((r: any) => `${r.challenge_id}::${r.day_index}`));
    }

    const rowsToInsert: any[] = [];
    for (const targetIdx of targetIndices) {
      for (const src of sourceRows) {
        const key = `${src.challenge_id}::${targetIdx}`;
        if (!replaceExisting && existingByKey.has(key)) continue; // skip duplicates in merge mode
        rowsToInsert.push({
          event_id: eventId,
          challenge_id: src.challenge_id,
          day_index: targetIdx,
          rep_target: src.rep_target,
          owner_id: user.id,
        });
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insErr } = await supabase.from("event_challenges").insert(rowsToInsert);
      if (insErr) throw new Error(insErr.message);
    }

    setShowApplyModal(false);
    await fetchAll();
  };

  // Repeat the current week's pattern across all remaining weeks of the event
  const handleRepeatWeekly = async () => {
    setError(null);
    if (!confirm("This will copy this week's plan (Sunday-Saturday containing the selected day) to all remaining weeks of the event. Continue?")) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not logged in"); return; }

    // Determine the Sunday of the week containing the selected date
    const selectedD = new Date(selectedDate + "T12:00:00");
    const dow = selectedD.getDay();
    const sundayOfWeek = new Date(selectedD);
    sundayOfWeek.setDate(sundayOfWeek.getDate() - dow);

    // Build the 7-day pattern: { dayOfWeekIdx: [source rows for that day] }
    // We look at the event_challenges within the source week
    const startD = new Date(eventStartDate + "T12:00:00");
    const endD = new Date(eventEndDate + "T12:00:00");

    const pattern: Record<number, typeof scheduledRows> = {}; // 0-6 (Sun-Sat) => rows
    for (let i = 0; i < 7; i++) {
      const dateOfWeek = new Date(sundayOfWeek);
      dateOfWeek.setDate(sundayOfWeek.getDate() + i);
      if (dateOfWeek < startD || dateOfWeek > endD) continue;
      const idx = Math.floor((dateOfWeek.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
      pattern[i] = scheduledRows.filter((r) => r.day_index === idx);
    }

    // Find all dates in event window AFTER the source week's Saturday
    const saturdayOfWeek = new Date(sundayOfWeek);
    saturdayOfWeek.setDate(saturdayOfWeek.getDate() + 6);

    const targetWeeks: { dayOfWeek: number; dayIndex: number }[] = [];
    const cursor = new Date(saturdayOfWeek);
    cursor.setDate(cursor.getDate() + 1); // start day after source Saturday
    while (cursor <= endD) {
      const idx = Math.floor((cursor.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
      targetWeeks.push({ dayOfWeek: cursor.getDay(), dayIndex: idx });
      cursor.setDate(cursor.getDate() + 1);
    }

    if (targetWeeks.length === 0) {
      setError("No remaining weeks to copy to. The selected week is the last week of the event.");
      return;
    }

    // Build rows to insert
    const targetIndices = targetWeeks.map((w) => w.dayIndex);

    // Delete existing on target days (replace mode for repeat-weekly)
    const { error: delErr } = await supabase
      .from("event_challenges")
      .delete()
      .eq("event_id", eventId)
      .in("day_index", targetIndices);
    if (delErr) { setError(delErr.message); return; }

    const rowsToInsert: any[] = [];
    for (const tw of targetWeeks) {
      const sourceRows = pattern[tw.dayOfWeek] || [];
      for (const src of sourceRows) {
        rowsToInsert.push({
          event_id: eventId,
          challenge_id: src.challenge_id,
          day_index: tw.dayIndex,
          rep_target: src.rep_target,
          owner_id: user.id,
        });
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insErr } = await supabase.from("event_challenges").insert(rowsToInsert);
      if (insErr) { setError(insErr.message); return; }
    }

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
              {viewMode === "month" && (
                <>
                  <button type="button" className="btn-icon" onClick={goPrevMonth} aria-label="Previous month">←</button>
                  <span className="schedule-month-label">{monthLabel}</span>
                  <button type="button" className="btn-icon" onClick={goNextMonth} aria-label="Next month">→</button>
                </>
              )}
              {viewMode !== "month" && (
                <span className="schedule-month-label" style={{ minWidth: "auto" }}>
                  {totalDays}-day event
                </span>
              )}
            </div>
            <div className="schedule-view-toggle">
              <button
                type="button"
                className={`schedule-view-btn ${viewMode === "month" ? "schedule-view-btn-active" : ""}`}
                onClick={() => setViewMode("month")}
              >
                📅 Calendar
              </button>
              <button
                type="button"
                className={`schedule-view-btn ${viewMode === "week" ? "schedule-view-btn-active" : ""}`}
                onClick={() => setViewMode("week")}
              >
                📊 Week
              </button>
              <button
                type="button"
                className={`schedule-view-btn ${viewMode === "list" ? "schedule-view-btn-active" : ""}`}
                onClick={() => setViewMode("list")}
              >
                📋 List
              </button>
            </div>
          </div>

          <div className="schedule-layout">
            <div className="schedule-calendar-area">
              {viewMode === "month" && (
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
              )}
              {viewMode === "week" && (
                <CalendarWeekView
                  eventStartDate={eventStartDate}
                  eventEndDate={eventEndDate}
                  selectedDate={selectedDate}
                  dayContent={dayContent}
                  onSelectDay={(date) => setSelectedDate(date)}
                  today={today}
                />
              )}
              {viewMode === "list" && (
                <CalendarListView
                  eventStartDate={eventStartDate}
                  eventEndDate={eventEndDate}
                  selectedDate={selectedDate}
                  dayContent={dayContent}
                  onSelectDay={(date) => setSelectedDate(date)}
                  today={today}
                />
              )}
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
                onApplyToOtherDays={() => setShowApplyModal(true)}
                onRepeatWeekly={handleRepeatWeekly}
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
        subcategories={librarySubcategories}
        alreadyOnDay={alreadyOnDay}
        selectedDateLabel={selectedDate ? formatShortDate(selectedDate) : ""}
        createCustomHref={`/challenges/new?returnTo=${eventId}/schedule`}
        bulkImportHref={`/challenges/bulk-import?returnTo=${eventId}/schedule`}
      />

      <ApplyToDaysModal
        open={showApplyModal}
        onClose={() => setShowApplyModal(false)}
        eventStartDate={eventStartDate}
        eventEndDate={eventEndDate}
        sourceDate={selectedDate}
        sourceChallengeCount={selectedDayChallenges.length}
        daysWithContent={new Set(Object.keys(dayContent))}
        onApply={handleApplyToDays}
      />
    </div>
  );
}

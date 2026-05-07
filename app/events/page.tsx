import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import EventListRow, { type EventListItem } from "@/components/EventListRow";

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00").getTime();
  const b = new Date(toIso + "T00:00:00").getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

export default async function EventsIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // All events the user owns
  const { data: events } = await supabase
    .from("events")
    .select(
      "id, name, event_type, status, start_date, end_date, fundraising_goal, registration_fee"
    )
    .eq("owner_id", user.id)
    .order("start_date", { ascending: false });

  // Default new-event destination — first org
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const newEventHref = orgs && orgs[0]
    ? `/organizations/${orgs[0].id}/events/new`
    : "/organizations/new";

  // Build EventListItem rows. We hydrate player/team counts per event.
  const rows: EventListItem[] = [];
  for (const ev of events || []) {
    const [{ data: parts }, { data: evPlayers }] = await Promise.all([
      supabase.from("event_participants").select("team_id").eq("event_id", ev.id),
      supabase
        .from("event_participants")
        .select("team_id, teams!inner(players(id))")
        .eq("event_id", ev.id),
    ]);
    let playersInEvent = 0;
    (evPlayers || []).forEach((row: any) => {
      const ps = row.teams?.players || [];
      playersInEvent += Array.isArray(ps) ? ps.length : 0;
    });
    const today = new Date().toISOString().slice(0, 10);
    const daysLeft = ev.end_date ? daysBetween(today, ev.end_date) : null;
    const goal =
      ev.event_type === "camp"
        ? Number(ev.fundraising_goal) || 0
        : (Number(ev.registration_fee) || 0) * playersInEvent;
    rows.push({
      id: ev.id,
      name: ev.name,
      event_type: (ev.event_type === "tournament" ? "tournament" : "camp"),
      start_date: ev.start_date,
      end_date: ev.end_date,
      player_count: playersInEvent,
      team_count: ev.event_type === "tournament" ? (parts || []).length : undefined,
      amount_raised: 0,
      amount_goal: goal > 0 ? goal : null,
      days_left: daysLeft,
    });
  }

  const activeRows = rows.filter((r) => r.days_left === null || r.days_left >= 0);
  const completedRows = rows.filter((r) => r.days_left !== null && r.days_left < 0);

  return (
    <AppShell active="events" userDisplayName={profile?.full_name || ""}>
      <div className="e2k-page-head">
        <div>
          <h1 className="e2k-page-title">Events</h1>
          <p className="e2k-page-sub">
            All your camps and tournaments across every organization.
          </p>
        </div>
        <Link href={newEventHref} className="e2k-btn-coral">
          <span className="e2k-btn-plus">+</span> New Event
        </Link>
      </div>

      <section className="e2k-panel">
        <div className="e2k-panel-head">
          <h2 className="e2k-panel-title">Active &amp; upcoming</h2>
          <p className="e2k-panel-sub">
            {activeRows.length === 0
              ? "Nothing live right now — create one to get started."
              : `${activeRows.length} ${activeRows.length === 1 ? "event" : "events"}`}
          </p>
        </div>
        {activeRows.length > 0 ? (
          <div className="e2k-events-list">
            {activeRows.map((ev) => (
              <EventListRow key={ev.id} event={ev} />
            ))}
          </div>
        ) : (
          <div className="e2k-empty">
            <p>Your first event is just a few clicks away.</p>
            <Link href={newEventHref} className="e2k-link-cyan">
              Create your first event →
            </Link>
          </div>
        )}
      </section>

      {completedRows.length > 0 && (
        <section className="e2k-panel">
          <div className="e2k-panel-head">
            <h2 className="e2k-panel-title">Completed</h2>
            <p className="e2k-panel-sub">{completedRows.length} {completedRows.length === 1 ? "event" : "events"}</p>
          </div>
          <div className="e2k-events-list">
            {completedRows.map((ev) => (
              <EventListRow key={ev.id} event={ev} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

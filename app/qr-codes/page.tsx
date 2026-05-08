import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function QrCodesIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_type, status, start_date, end_date")
    .eq("owner_id", user.id)
    .order("start_date", { ascending: false });

  // Player count per event
  const eventPlayerCount = new Map<string, number>();
  if (events && events.length > 0) {
    for (const ev of events) {
      const { data: parts } = await supabase
        .from("event_participants")
        .select("teams!inner(players(id))")
        .eq("event_id", ev.id);
      let count = 0;
      (parts || []).forEach((row: any) => {
        const ps = row.teams?.players || [];
        count += Array.isArray(ps) ? ps.length : 0;
      });
      eventPlayerCount.set(ev.id, count);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const activeEvents = (events || []).filter(
    (e: any) => !e.end_date || e.end_date >= today
  );
  const completedEvents = (events || []).filter(
    (e: any) => e.end_date && e.end_date < today
  );

  return (
    <AppShell active="qr-codes" userDisplayName={profile?.full_name?.trim() || ""}>
      <div className="e2k-page-head">
        <div>
          <h1 className="e2k-page-title">QR Codes</h1>
          <p className="e2k-page-sub">
            Generate, print, and share player QR codes. Sponsors scan them to
            see verified work and contribute toward player goals.
          </p>
        </div>
      </div>

      {!events || events.length === 0 ? (
        <section className="e2k-panel">
          <div className="e2k-empty">
            <p>You don&apos;t have any events yet.</p>
            <p style={{ marginTop: "8px", fontSize: "13px", color: "var(--e2k-text-muted)" }}>
              QR codes are generated per event. Each player gets a unique QR
              code tied to that event. Create an event first, then come back
              here to print and share QR codes.
            </p>
            <Link href="/events" className="e2k-link-cyan" style={{ marginTop: "16px", display: "inline-block" }}>
              Open Events →
            </Link>
          </div>
        </section>
      ) : (
        <>
          {activeEvents.length > 0 && (
            <section className="e2k-panel">
              <div className="e2k-panel-head">
                <h2 className="e2k-panel-title">Active &amp; upcoming</h2>
                <p className="e2k-panel-sub">
                  {activeEvents.length} {activeEvents.length === 1 ? "event" : "events"} ready for QR distribution
                </p>
              </div>
              <div className="e2k-qr-grid">
                {activeEvents.map((ev: any) => {
                  const playerCount = eventPlayerCount.get(ev.id) || 0;
                  return (
                    <Link
                      key={ev.id}
                      href={`/events/${ev.id}/qr-codes`}
                      className="e2k-qr-card"
                    >
                      <div className={`e2k-qr-card-tag e2k-qr-card-tag-${ev.event_type === "tournament" ? "tournament" : "camp"}`}>
                        {ev.event_type === "tournament" ? "TOURNAMENT" : "CAMP"}
                      </div>
                      <div className="e2k-qr-card-name">{ev.name}</div>
                      <div className="e2k-qr-card-meta">
                        {ev.start_date} → {ev.end_date}
                      </div>
                      <div className="e2k-qr-card-stats">
                        <strong>{playerCount}</strong>{" "}
                        {playerCount === 1 ? "player QR" : "player QRs"}
                      </div>
                      <div className="e2k-qr-card-action">View QR codes →</div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {completedEvents.length > 0 && (
            <section className="e2k-panel">
              <div className="e2k-panel-head">
                <h2 className="e2k-panel-title">Completed</h2>
                <p className="e2k-panel-sub">
                  {completedEvents.length} {completedEvents.length === 1 ? "event" : "events"} — QR codes still accessible
                </p>
              </div>
              <div className="e2k-qr-grid">
                {completedEvents.map((ev: any) => {
                  const playerCount = eventPlayerCount.get(ev.id) || 0;
                  return (
                    <Link
                      key={ev.id}
                      href={`/events/${ev.id}/qr-codes`}
                      className="e2k-qr-card e2k-qr-card-done"
                    >
                      <div className={`e2k-qr-card-tag e2k-qr-card-tag-${ev.event_type === "tournament" ? "tournament" : "camp"}`}>
                        {ev.event_type === "tournament" ? "TOURNAMENT" : "CAMP"}
                      </div>
                      <div className="e2k-qr-card-name">{ev.name}</div>
                      <div className="e2k-qr-card-meta">
                        Completed · {ev.end_date}
                      </div>
                      <div className="e2k-qr-card-stats">
                        <strong>{playerCount}</strong>{" "}
                        {playerCount === 1 ? "player QR" : "player QRs"}
                      </div>
                      <div className="e2k-qr-card-action">View QR codes →</div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

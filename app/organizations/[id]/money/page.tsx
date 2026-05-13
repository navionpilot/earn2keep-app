// =============================================================================
// app/organizations/[id]/money/page.tsx — Org Money dashboard (L40)
// =============================================================================
// Org-level activity dashboard, distinct from /account (which is config).
//
// Sections:
//   1. Top stats grid: Total received (all-time + this month) and a
//      transparent platform-fee disclosure. Pending payouts placeholder
//      until Phase 10.
//   2. Per-event breakdown table — every event in the org with its
//      money state. Tournament events show real(-ish stub) data from
//      tournament_teams. Camp events show a "tracking enables in Phase 10"
//      callout since no donation table exists yet.
//   3. Recent activity feed — last 20 Entry Fee payments across the org,
//      newest first.
//
// Access: ORG OWNER ONLY (same gate as /account).
//
// Stub-data semantics:
//   - Tournament Entry Fee revenue comes from tournament_teams rows where
//     status in ('active', 'pending_approval') — those are paid (in stub
//     mode, that's a direct insert from L32; in Phase 10, it'll be a
//     webhook insert).
//   - Camp donation revenue: no source data, displayed as $0 with
//     callouts noting Phase 10 will enable it.
//   - Platform fees: calculated transparently at 3.5% + $0.40 per
//     transaction. Just a derived number — earn²keep doesn't actually
//     collect anything yet either.
// =============================================================================

import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

interface PageProps {
  params: Promise<{ id: string }>;
}

const PLATFORM_FEE_PCT = 0.035;
const PLATFORM_FEE_FLAT_CENTS = 40;

function dollarsFromCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function OrgMoneyPage({ params }: PageProps) {
  const { id: orgId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the org
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, owner_id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) {
    return (
      <AppShell active="organizations" userDisplayName="">
        <div style={{ padding: 40, textAlign: "center" }}>
          <h1>Organization not found</h1>
          <Link href="/dashboard" style={{ color: "#35d5df" }}>Back to Dashboard →</Link>
        </div>
      </AppShell>
    );
  }

  if (org.owner_id !== user.id) {
    return (
      <AppShell active="organizations" userDisplayName="">
        <div style={{ padding: 40, textAlign: "center" }}>
          <h1>Access restricted</h1>
          <p style={{ opacity: 0.7, maxWidth: 480, margin: "12px auto" }}>
            The Money dashboard is only visible to the organization&apos;s owner.
          </p>
          <Link href={`/organizations/${orgId}`} style={{ color: "#35d5df" }}>
            Back to {org.name} →
          </Link>
        </div>
      </AppShell>
    );
  }

  // Profile name for AppShell
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = profile?.full_name || "";

  // All events in this org
  const { data: events } = await supabase
    .from("events")
    .select(
      `id, name, event_type, start_date, end_date,
       tournament_entry_fee_cents, tournament_join_code,
       created_at`
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const eventIds = (events || []).map((e) => e.id);
  const tournamentEventIds = (events || [])
    .filter((e) => e.event_type === "tournament")
    .map((e) => e.id);

  // Tournament payments — query tournament_teams paid rows
  type PaidRow = {
    id: string;
    tournament_event_id: string;
    team_id: string;
    entry_fee_paid_cents: number | null;
    entry_fee_paid_at: string | null;
    status: string;
    joined_at: string;
  };
  let paidRows: PaidRow[] = [];
  if (tournamentEventIds.length > 0) {
    const { data } = await supabase
      .from("tournament_teams")
      .select("id, tournament_event_id, team_id, entry_fee_paid_cents, entry_fee_paid_at, status, joined_at")
      .in("tournament_event_id", tournamentEventIds)
      .in("status", ["active", "pending_approval"])
      .order("entry_fee_paid_at", { ascending: false });
    paidRows = (data as PaidRow[]) || [];
  }

  // Look up team names for the activity feed
  const teamIds = Array.from(new Set(paidRows.map((r) => r.team_id)));
  const { data: teamsData } = teamIds.length > 0
    ? await supabase
        .from("teams")
        .select("id, name, organizations(name)")
        .in("id", teamIds)
    : { data: [] };
  const teamLookup = new Map<string, { name: string; orgName: string | null }>();
  (teamsData || []).forEach((t) => {
    const orgRel = t.organizations;
    let orgName: string | null = null;
    if (orgRel) {
      const o = Array.isArray(orgRel) ? orgRel[0] : orgRel;
      if (o) orgName = (o as { name?: string }).name ?? null;
    }
    teamLookup.set(t.id, { name: t.name, orgName });
  });

  // Aggregations
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const totalReceivedCents = paidRows.reduce(
    (sum, r) => sum + (r.entry_fee_paid_cents || 0),
    0
  );
  const thisMonthCents = paidRows
    .filter((r) => r.entry_fee_paid_at && r.entry_fee_paid_at >= startOfMonth)
    .reduce((sum, r) => sum + (r.entry_fee_paid_cents || 0), 0);

  const transactionCount = paidRows.length;
  const platformFeesCents =
    Math.round(totalReceivedCents * PLATFORM_FEE_PCT) +
    PLATFORM_FEE_FLAT_CENTS * transactionCount;
  const netToOrgCents = Math.max(0, totalReceivedCents - platformFeesCents);

  // Per-event breakdown
  type EventBreakdown = {
    event_id: string;
    event_name: string;
    event_type: string;
    start_date: string;
    end_date: string;
    join_code: string | null;
    entry_fee_cents: number | null;
    contributors_count: number;  // teams for tournament, donations for camp (currently 0)
    total_collected_cents: number;
    is_tournament: boolean;
  };
  const eventBreakdown: EventBreakdown[] = (events || []).map((ev) => {
    if (ev.event_type === "tournament") {
      const evPaidRows = paidRows.filter((r) => r.tournament_event_id === ev.id);
      const collected = evPaidRows.reduce(
        (s, r) => s + (r.entry_fee_paid_cents || 0),
        0
      );
      return {
        event_id: ev.id,
        event_name: ev.name,
        event_type: ev.event_type,
        start_date: ev.start_date,
        end_date: ev.end_date,
        join_code: ev.tournament_join_code,
        entry_fee_cents: ev.tournament_entry_fee_cents,
        contributors_count: evPaidRows.length,
        total_collected_cents: collected,
        is_tournament: true,
      };
    }
    return {
      event_id: ev.id,
      event_name: ev.name,
      event_type: ev.event_type,
      start_date: ev.start_date,
      end_date: ev.end_date,
      join_code: null,
      entry_fee_cents: null,
      contributors_count: 0,
      total_collected_cents: 0,
      is_tournament: false,
    };
  });

  // Activity feed: last 20 Entry Fee payments, newest first
  const activityRows = paidRows
    .filter((r) => r.entry_fee_paid_at)
    .slice(0, 20)
    .map((r) => {
      const team = teamLookup.get(r.team_id);
      const ev = events?.find((e) => e.id === r.tournament_event_id);
      return {
        id: r.id,
        when: r.entry_fee_paid_at!,
        team_name: team?.name ?? "(unknown team)",
        team_org: team?.orgName ?? null,
        event_name: ev?.name ?? "(unknown event)",
        amount_cents: r.entry_fee_paid_cents || 0,
        status: r.status,
      };
    });

  return (
    <AppShell active="organizations" userDisplayName={displayName}>
      <div style={{ marginBottom: 24 }}>
        <Link
          href={`/organizations/${orgId}`}
          style={{ fontSize: 12, color: "#9fc3c7", textDecoration: "none" }}
        >
          ← Back to {org.name}
        </Link>
      </div>

      <div className="e2k-page-head" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#35d5df", letterSpacing: 1.5, marginBottom: 4 }}>
            MONEY
          </div>
          <h1 className="e2k-page-title">{org.name}</h1>
          <p className="e2k-page-sub">
            Activity across all your events — what&apos;s come in, what&apos;s due to settle, and what&apos;s gone where.
          </p>
        </div>
      </div>

      {/* PHASE 10 BANNER */}
      <div
        style={{
          padding: 14,
          background: "rgba(53, 213, 223, 0.06)",
          border: "1px solid rgba(53, 213, 223, 0.25)",
          borderRadius: 10,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 20 }}>💳</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#35d5df" }}>
            Real payments enable in Phase 10
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5, marginTop: 2 }}>
            What you see below reflects current platform activity. When Stripe Connect is wired up,
            the same dashboard surfaces real settled money flowing through your org&apos;s connected
            account.
          </div>
        </div>
        <Link
          href={`/organizations/${orgId}/account`}
          style={{
            padding: "8px 14px",
            background: "transparent",
            color: "#35d5df",
            border: "1px solid rgba(53, 213, 223, 0.4)",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 12,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          Connect Stripe →
        </Link>
      </div>

      {/* TOP STATS GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Total Received"
          subLabel="All-time across all events"
          value={dollarsFromCents(totalReceivedCents)}
          accent="#6EE7B7"
        />
        <StatCard
          label="This Month"
          subLabel={now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          value={dollarsFromCents(thisMonthCents)}
          accent="#35d5df"
        />
        <StatCard
          label="Pending Payouts"
          subLabel="Will settle to your bank"
          value="$0"
          mutedValue
          footer="Activates with Stripe in Phase 10"
        />
        <StatCard
          label="Transactions"
          subLabel="Total successful payments"
          value={transactionCount.toLocaleString()}
        />
      </div>

      {/* Platform fee disclosure */}
      <div
        style={{
          padding: 16,
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 10,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#9fc3c7",
            letterSpacing: 1.2,
            marginBottom: 10,
          }}
        >
          💰 BREAKDOWN
        </div>
        <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
          <BreakdownRow
            label="Gross received"
            value={dollarsFromCents(totalReceivedCents)}
            note="From Entry Fees and donations"
          />
          <BreakdownRow
            label="Platform fees"
            value={`− ${dollarsFromCents(platformFeesCents)}`}
            note={`earn²keep · 3.5% + $0.40 per transaction · ${transactionCount} transaction${transactionCount === 1 ? "" : "s"}`}
            color="#ff755f"
          />
          <BreakdownRow
            label="Net to your org"
            value={dollarsFromCents(netToOrgCents)}
            note="Will route to your bank account once Stripe is connected"
            color="#6EE7B7"
            bold
          />
        </div>
      </div>

      {/* PER-EVENT BREAKDOWN */}
      <section
        style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 12,
          padding: 18,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#35d5df", letterSpacing: 1.5, marginBottom: 2 }}>
              BY EVENT
            </div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Money in for each of your events.
            </div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.5 }}>
            {eventBreakdown.length} event{eventBreakdown.length === 1 ? "" : "s"}
          </div>
        </div>

        {eventBreakdown.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", opacity: 0.6, fontSize: 13 }}>
            No events yet. <Link href={`/organizations/${orgId}/events/new`} style={{ color: "#35d5df" }}>Create one →</Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {eventBreakdown.map((ev) => (
              <div
                key={ev.event_id}
                style={{
                  padding: 14,
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 8,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      href={`/organizations/${orgId}/events/${ev.event_id}/money`}
                      style={{ fontWeight: 700, fontSize: 14, color: "#f7fbfb", textDecoration: "none" }}
                    >
                      {ev.event_name}
                    </Link>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: ev.is_tournament ? "#ff755f" : "#35d5df",
                        background: ev.is_tournament ? "rgba(255, 117, 95, 0.12)" : "rgba(53, 213, 223, 0.12)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                      }}
                    >
                      {ev.event_type}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
                    {formatDateShort(ev.start_date)} – {formatDateShort(ev.end_date)}
                    {ev.is_tournament && ev.entry_fee_cents !== null && (
                      <> · Entry: {dollarsFromCents(ev.entry_fee_cents)} / team</>
                    )}
                    {ev.is_tournament && (
                      <> · {ev.contributors_count} team{ev.contributors_count === 1 ? "" : "s"} paid</>
                    )}
                  </div>
                  {!ev.is_tournament && (
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.55,
                        marginTop: 4,
                        fontStyle: "italic",
                        color: "#9fc3c7",
                      }}
                    >
                      Camp donation tracking enables in Phase 10
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontFamily: "Sora, system-ui, sans-serif",
                      fontWeight: 800,
                      fontSize: 22,
                      color: ev.total_collected_cents > 0 ? "#6EE7B7" : "rgba(255, 255, 255, 0.4)",
                    }}
                  >
                    {dollarsFromCents(ev.total_collected_cents)}
                  </div>
                  <Link
                    href={`/organizations/${orgId}/events/${ev.event_id}/money`}
                    style={{ fontSize: 11, color: "#35d5df", textDecoration: "none" }}
                  >
                    Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* RECENT ACTIVITY */}
      <section
        style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 12,
          padding: 18,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#35d5df", letterSpacing: 1.5, marginBottom: 2 }}>
              RECENT ACTIVITY
            </div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Latest 20 payments across all events.
            </div>
          </div>
        </div>

        {activityRows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", opacity: 0.6, fontSize: 13 }}>
            No payments yet. Once teams start joining your tournaments or supporters
            donate to your camps, you&apos;ll see the activity here.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {activityRows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 12,
                  padding: "10px 12px",
                  background: "rgba(255, 255, 255, 0.02)",
                  borderRadius: 6,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {row.team_name}
                    {row.team_org && (
                      <span style={{ opacity: 0.55, fontWeight: 400, fontSize: 11 }}>
                        {" "}· {row.team_org}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                    paid Entry Fee for <strong>{row.event_name}</strong>
                    {row.status === "pending_approval" && (
                      <span style={{ color: "#ffd000", marginLeft: 6 }}>
                        · pending approval
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, flexShrink: 0 }}>
                  {formatRelativeTime(row.when)}
                </div>
                <div
                  style={{
                    fontFamily: "Sora, system-ui, sans-serif",
                    fontWeight: 700,
                    color: "#6EE7B7",
                    flexShrink: 0,
                    minWidth: 70,
                    textAlign: "right",
                  }}
                >
                  +{dollarsFromCents(row.amount_cents)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function StatCard({
  label,
  subLabel,
  value,
  accent,
  mutedValue,
  footer,
}: {
  label: string;
  subLabel: string;
  value: string;
  accent?: string;
  mutedValue?: boolean;
  footer?: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: "#9fc3c7",
          letterSpacing: 1.2,
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Sora, system-ui, sans-serif",
          fontSize: 26,
          fontWeight: 800,
          color: mutedValue ? "rgba(255, 255, 255, 0.4)" : accent || "#f7fbfb",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
        {subLabel}
      </div>
      {footer && (
        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6, fontStyle: "italic" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  note,
  color,
  bold,
}: {
  label: string;
  value: string;
  note?: string;
  color?: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "baseline",
        padding: "8px 0",
        borderTop: bold ? "1px solid rgba(255, 255, 255, 0.1)" : "none",
        paddingTop: bold ? 12 : 8,
      }}
    >
      <div>
        <div style={{ fontWeight: bold ? 700 : 500 }}>{label}</div>
        {note && (
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
            {note}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "Sora, system-ui, sans-serif",
          fontWeight: bold ? 800 : 700,
          fontSize: bold ? 18 : 15,
          color: color || "#f7fbfb",
        }}
      >
        {value}
      </div>
    </div>
  );
}

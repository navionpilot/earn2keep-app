// =============================================================================
// app/organizations/[id]/events/[eventId]/money/page.tsx — Per-event money
// drill-down (L41)
// =============================================================================
// Drills down into a single event's money activity. Reached via the
// "Details →" link on each event row in the org-level Money dashboard
// (L40 By Event section).
//
// Sections:
//   1. Header — event name, type, dates, status, back link
//   2. Summary card — pot (Tournament) or total raised (Camp) +
//      transparent platform-fee disclosure
//   3. Transactions list — every paid Entry Fee (Tournament) or every
//      donation (Camp). For Tournament: team, coach, joined date, amount,
//      status, refund button placeholder. For Camp: empty until Phase 10.
//   4. CSV export — top-right button, hits the route at
//      /api/organizations/[id]/events/[eventId]/money-csv
//
// Access: ORG OWNER ONLY (same gate as L40).
//
// Camp note: donation tracking has no source table yet. Camp events show
// a Phase-10 placeholder for the whole transactions section.
// =============================================================================

import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import EventMoneyCsvButton from "@/components/EventMoneyCsvButton";

interface PageProps {
  params: Promise<{ id: string; eventId: string }>;
}

// Stripe's standard card-processing fee. earn²keep takes zero platform
// percentage in the L43 cleanup model.
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FLAT_CENTS = 30;

function dollarsFromCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateWithTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  active: { label: "✓ Active", color: "#6EE7B7" },
  pending_approval: { label: "⏳ Pending Approval", color: "#ffd000" },
  cancelled: { label: "✗ Cancelled", color: "#9fc3c7" },
  declined: { label: "✗ Declined", color: "#ff755f" },
};

export default async function EventMoneyDetailPage({ params }: PageProps) {
  const { id: orgId, eventId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the org (must be owned by current user)
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
          <p style={{ opacity: 0.7 }}>The Money pages are only visible to the org owner.</p>
          <Link href={`/organizations/${orgId}`} style={{ color: "#35d5df" }}>Back to {org.name} →</Link>
        </div>
      </AppShell>
    );
  }

  // Fetch the event (must belong to this org)
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!event) {
    return (
      <AppShell active="organizations" userDisplayName="">
        <div style={{ padding: 40, textAlign: "center" }}>
          <h1>Event not found</h1>
          <p style={{ opacity: 0.7 }}>This event doesn&apos;t exist or doesn&apos;t belong to this org.</p>
          <Link href={`/organizations/${orgId}/money`} style={{ color: "#35d5df" }}>← Back to Money</Link>
        </div>
      </AppShell>
    );
  }

  const isTournament = event.event_type === "tournament";

  // ---------- Tournament transactions ----------
  type TournamentTxRow = {
    id: string;
    team_id: string;
    team_name: string;
    team_org_name: string | null;
    coach_name: string | null;
    joined_at: string;
    entry_fee_paid_cents: number;
    entry_fee_paid_at: string | null;
    status: string;
  };
  let tournamentTransactions: TournamentTxRow[] = [];
  let totalGrossCents = 0;
  let totalNetCents = 0;
  let totalStripeFeesCents = 0;
  let registeredTeamCount = 0;
  let pendingTeamCount = 0;

  if (isTournament) {
    const { data: ttRows } = await supabase
      .from("tournament_teams")
      .select(
        `id, team_id, joined_at, entry_fee_paid_cents, entry_fee_paid_at, status,
         teams(id, name, owner_id, organizations(name))`
      )
      .eq("tournament_event_id", eventId)
      .order("joined_at", { ascending: false });

    // Collect coach (team owner) IDs to resolve names in one batch
    const coachUserIds = new Set<string>();
    (ttRows || []).forEach((r) => {
      const teamRel = r.teams as { owner_id?: string } | null;
      if (teamRel?.owner_id) coachUserIds.add(teamRel.owner_id);
    });
    const coachIdsArray = Array.from(coachUserIds);
    let coachProfileMap = new Map<string, string>();
    if (coachIdsArray.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", coachIdsArray);
      (profs || []).forEach((p) => {
        if (p.full_name) coachProfileMap.set(p.id, p.full_name);
      });
    }

    tournamentTransactions = (ttRows || []).map((r) => {
      const teamRel = r.teams as
        | { name?: string; owner_id?: string; organizations?: { name?: string } | null }
        | null;
      const teamName = teamRel?.name || "Team";
      const teamOrgName = teamRel?.organizations?.name || null;
      const coachName = teamRel?.owner_id
        ? coachProfileMap.get(teamRel.owner_id) || null
        : null;
      return {
        id: r.id,
        team_id: r.team_id,
        team_name: teamName,
        team_org_name: teamOrgName,
        coach_name: coachName,
        joined_at: r.joined_at,
        entry_fee_paid_cents: r.entry_fee_paid_cents ?? 0,
        entry_fee_paid_at: r.entry_fee_paid_at,
        status: r.status || "active",
      };
    });

    // Money totals — only count active + pending_approval (paid) rows.
    // Cancelled/declined rows are not included in totals (they'd be
    // refunded in Phase 10).
    const paidRows = tournamentTransactions.filter(
      (t) => t.status === "active" || t.status === "pending_approval"
    );
    registeredTeamCount = tournamentTransactions.filter(
      (t) => t.status === "active"
    ).length;
    pendingTeamCount = tournamentTransactions.filter(
      (t) => t.status === "pending_approval"
    ).length;

    paidRows.forEach((t) => {
      const gross = t.entry_fee_paid_cents;
      // L43 cleanup: only Stripe's card-processing fee comes out of the
      // gross. earn²keep takes 0% per transaction.
      const fee = Math.round(gross * STRIPE_FEE_PCT) + STRIPE_FEE_FLAT_CENTS;
      totalGrossCents += gross;
      totalStripeFeesCents += fee;
      totalNetCents += gross - fee;
    });
  }

  const profileResult = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = profileResult.data?.full_name || "";

  const eventTypeLabel =
    event.event_type === "tournament" ? "Tournament" :
    event.event_type === "camp" ? "Camp" : event.event_type;

  return (
    <AppShell active="organizations" userDisplayName={displayName}>
      {/* Back link */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/organizations/${orgId}/money`}
          style={{ fontSize: 12, color: "#9fc3c7", textDecoration: "none" }}
        >
          ← Back to Money dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="e2k-page-head" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#35d5df", letterSpacing: 1.5, marginBottom: 6 }}>
            MONEY · {eventTypeLabel?.toUpperCase()}
          </div>
          <h1 className="e2k-page-title">{event.name}</h1>
          <p className="e2k-page-sub">
            {formatDate(event.start_date)} – {formatDate(event.end_date)}{" "}
            {event.status && (
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(53, 213, 223, 0.12)",
                  color: "#35d5df",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                {event.status}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Summary card */}
      {isTournament ? (
        <section style={{ marginBottom: 20 }}>
          <div
            style={{
              padding: 24,
              background: "rgba(255, 208, 0, 0.05)",
              border: "1px solid rgba(255, 208, 0, 0.25)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: "#ffd000", letterSpacing: 1.5, marginBottom: 10 }}>
              🏆 POT
            </div>
            <div
              style={{
                fontFamily: "Sora, system-ui, sans-serif",
                fontSize: 38,
                fontWeight: 800,
                color: "#ffd000",
                lineHeight: 1.1,
                marginBottom: 6,
              }}
            >
              {dollarsFromCents(totalGrossCents)}
              <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.7, marginLeft: 12 }}>
                ({registeredTeamCount} active · {pendingTeamCount} pending)
              </span>
            </div>
            <p style={{ fontSize: 13, opacity: 0.8, margin: "0 0 16px 0", lineHeight: 1.6 }}>
              Pot = Entry Fee (
              {dollarsFromCents(event.tournament_entry_fee_cents ?? 0)}) × teams.
              Winning team takes the whole pot when the tournament resolves.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                fontSize: 13,
                paddingTop: 14,
                borderTop: "1px solid rgba(255, 208, 0, 0.2)",
              }}
            >
              <div>Gross received</div>
              <div style={{ textAlign: "right" }}>{dollarsFromCents(totalGrossCents)}</div>
              <div style={{ opacity: 0.8 }}>
                Stripe card-processing fee{" "}
                <span style={{ opacity: 0.6, fontSize: 11 }}>
                  (2.9% + $0.30 ·{" "}
                  {tournamentTransactions.filter((t) => t.status === "active" || t.status === "pending_approval").length}{" "}
                  txn · paid to Stripe)
                </span>
              </div>
              <div style={{ textAlign: "right", color: "#ff755f" }}>
                −{dollarsFromCents(totalStripeFeesCents)}
              </div>
              <div style={{ opacity: 0.8 }}>
                earn²keep platform cut{" "}
                <span style={{ opacity: 0.6, fontSize: 11 }}>
                  (0% — flat launch fee only)
                </span>
              </div>
              <div style={{ textAlign: "right", color: "#6EE7B7" }}>$0</div>
              <div style={{ fontWeight: 700 }}>Net to your org</div>
              <div style={{ textAlign: "right", fontWeight: 700, color: "#6EE7B7" }}>
                {dollarsFromCents(totalNetCents)}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section style={{ marginBottom: 20 }}>
          <div
            style={{
              padding: 24,
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed rgba(255, 255, 255, 0.12)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: "#9fc3c7", letterSpacing: 1.5, marginBottom: 6 }}>
              CAMP DONATIONS
            </div>
            <div style={{ fontFamily: "Sora, system-ui, sans-serif", fontSize: 32, fontWeight: 800, color: "#9fc3c7", marginBottom: 8 }}>
              $0
            </div>
            <p style={{ fontSize: 13, opacity: 0.7, margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: "#9fc3c7" }}>Coming in Phase 10.</strong>{" "}
              Camp donation tracking activates when supporter payments wire up
              to Stripe. For now, this section is a placeholder.
            </p>
          </div>
        </section>
      )}

      {/* Transactions list */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ fontFamily: "Sora, system-ui, sans-serif", fontSize: 18, fontWeight: 800, margin: 0 }}>
              {isTournament ? "Team registrations" : "Donations"}
            </h2>
            <p style={{ fontSize: 12, opacity: 0.6, margin: "4px 0 0 0" }}>
              {isTournament
                ? `${tournamentTransactions.length} ${
                    tournamentTransactions.length === 1 ? "row" : "rows"
                  } · newest first`
                : "Per-donation list activates in Phase 10"}
            </p>
          </div>
          {isTournament && tournamentTransactions.length > 0 && (
            <EventMoneyCsvButton orgId={orgId} eventId={eventId} eventName={event.name} />
          )}
        </div>

        {isTournament ? (
          tournamentTransactions.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px dashed rgba(255, 255, 255, 0.1)",
                borderRadius: 10,
              }}
            >
              <p style={{ fontSize: 13, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
                No teams have registered yet.
                <br />
                Open the event page and use the Tournament Invitations panel to
                email the join code to coaches.
              </p>
              <Link
                href={`/events/${eventId}`}
                style={{ color: "#35d5df", fontSize: 13, marginTop: 12, display: "inline-block" }}
              >
                Open event page →
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {tournamentTransactions.map((tx) => {
                const isPaid = tx.status === "active" || tx.status === "pending_approval";
                const statusInfo = STATUS_DISPLAY[tx.status] || {
                  label: tx.status,
                  color: "#9fc3c7",
                };
                return (
                  <div
                    key={tx.id}
                    style={{
                      padding: 14,
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 8,
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {tx.team_name}
                        {tx.team_org_name && tx.team_org_name !== org.name && (
                          <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>
                            {" "}· {tx.team_org_name}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
                        {tx.coach_name && <>Organizer: <strong>{tx.coach_name}</strong> · </>}
                        Joined {formatDateWithTime(tx.joined_at)}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: statusInfo.color }}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontFamily: "Sora, system-ui, sans-serif",
                          fontSize: 18,
                          fontWeight: 800,
                          color: isPaid ? "#6EE7B7" : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {isPaid ? "+" : ""}
                        {dollarsFromCents(tx.entry_fee_paid_cents)}
                      </div>
                    </div>
                    {/* Refund button placeholder — disabled, tooltip
                        explains Phase 10. Refunds become real with
                        Stripe Connect. */}
                    <button
                      type="button"
                      disabled
                      title="Refunds activate with Stripe Connect in Phase 10"
                      style={{
                        padding: "6px 12px",
                        background: "transparent",
                        color: "rgba(255, 255, 255, 0.25)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 999,
                        fontWeight: 600,
                        fontSize: 11,
                        cursor: "not-allowed",
                      }}
                    >
                      Refund (P10)
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed rgba(255, 255, 255, 0.1)",
              borderRadius: 10,
            }}
          >
            <p style={{ fontSize: 13, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
              Camp donation tracking enables in Phase 10.
              <br />
              When supporters pay through Stripe, each donation will appear here
              with supporter name, amount, date, player supported, and a refund
              option.
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}

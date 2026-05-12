import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  getPricing,
  shouldAutoUpgradeToCamp,
  MINI_CAMP_GOAL_THRESHOLD_USD,
  type EventType,
} from "@/lib/pricing";

const formatMoney = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const formatDate = (date: string | null | undefined): string => {
  if (!date) return "Not set";
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch event (owner-only access matches the events/[id] page pattern)
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!event) {
    notFound();
  }

  // Fetch parent organization (separate query — matches existing pattern)
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", event.organization_id)
    .single();

  // Count linked teams via event_participants
  const { count: teamCount, data: participants } = await supabase
    .from("event_participants")
    .select("team_id", { count: "exact" })
    .eq("event_id", id);

  // Count active players across all linked teams — needed to compute the
  // event's TOTAL goal (= per-player goal × total players), which drives
  // the Mini-Camp -> Camp auto-upgrade.
  const teamIds = (participants || []).map((p: { team_id: string }) => p.team_id);
  let totalPlayers = 0;
  if (teamIds.length > 0) {
    const { count } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .in("team_id", teamIds)
      .eq("is_active", true);
    totalPlayers = count || 0;
  }

  // Get user profile for AppShell display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const storedType = event.event_type as EventType;
  const goalAmount = Number(event.goal_amount) || 0;
  const totalGoal = goalAmount * totalPlayers;

  // Auto-upgrade logic: Mini-Camp events with a total goal above the
  // threshold are charged as Camp tier. We display Camp pricing and a
  // notice; when real Stripe payment ships, the actual charge follows
  // this same rule (so it can't be bypassed by editing back after launch).
  const wasAutoUpgraded = shouldAutoUpgradeToCamp({
    eventType: storedType,
    totalGoalUsd: totalGoal,
  });
  const effectiveType: EventType = wasAutoUpgraded ? "camp" : storedType;
  const pricing = getPricing(effectiveType);

  return (
    <AppShell
      active="events"
      userDisplayName={profile?.full_name?.trim() || ""}
    >
      <div className="form-page">
        <main className="form-page-main">
          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">
              Dashboard
            </Link>
            <span className="breadcrumb-sep">›</span>
            {org && (
              <>
                <Link
                  href={`/organizations/${org.id}`}
                  className="breadcrumb-link"
                >
                  {org.name}
                </Link>
                <span className="breadcrumb-sep">›</span>
              </>
            )}
            <Link
              href={`/events/${event.id}`}
              className="breadcrumb-link"
            >
              {event.name}
            </Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">Payment</span>
          </div>

          <div className="form-card">
            <h1
              className="auth-title"
              style={{ marginBottom: 8, marginTop: 0 }}
            >
              Review &amp; launch
            </h1>
            <p
              className="auth-subtitle"
              style={{ marginBottom: 24 }}
            >
              Your event has been saved as a draft. Pay the event fee to
              launch and start accepting supporters.
            </p>

            <div
              className="alert alert-info"
              style={{ marginBottom: 28 }}
            >
              <strong>Payment processing launches soon.</strong>{" "}
              For now, you can continue to event setup at no charge —
              payment will be required once our payment system goes live.
            </div>

            {/* Event summary */}
            <div className="form-section">
              <h3 className="form-section-title">Your event</h3>
              <div className="breakdown-card">
                <div className="breakdown-rows">
                  <div className="breakdown-row">
                    <span className="breakdown-label">Name</span>
                    <span className="breakdown-value">{event.name}</span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label">Type</span>
                    <span className="breakdown-value">
                      {pricing.label} — {pricing.subtitle}
                    </span>
                  </div>
                  <div className="breakdown-row">
                    <span className="breakdown-label">Dates</span>
                    <span className="breakdown-value">
                      {formatDate(event.start_date)} –{" "}
                      {formatDate(event.end_date)}
                    </span>
                  </div>
                  {teamCount !== null && (
                    <div className="breakdown-row">
                      <span className="breakdown-label">Teams</span>
                      <span className="breakdown-value">
                        {teamCount} team{teamCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="form-section">
              <h3 className="form-section-title">Event fee</h3>
              {wasAutoUpgraded && (
                <div
                  className="alert alert-warning"
                  style={{ marginBottom: 16 }}
                >
                  <strong>Auto-upgraded to Camp tier.</strong> Your total
                  goal of ${formatMoney(totalGoal)}{" "}
                  (${formatMoney(goalAmount)} × {totalPlayers}{" "}
                  player{totalPlayers === 1 ? "" : "s"}/participant
                  {totalPlayers === 1 ? "" : "s"}) exceeds the Mini-Camp
                  threshold of ${MINI_CAMP_GOAL_THRESHOLD_USD.toLocaleString()}.
                  Camp tier pricing (${pricing.fee}) applies.{" "}
                  <Link
                    href={`/events/${event.id}/edit`}
                    style={{ textDecoration: "underline", color: "inherit" }}
                  >
                    Edit event to change tier
                  </Link>
                  .
                </div>
              )}
              <div className="breakdown-card">
                <div className="breakdown-rows">
                  <div className="breakdown-row">
                    <span className="breakdown-label">
                      {pricing.label} fee
                    </span>
                    <span className="breakdown-value">
                      ${formatMoney(pricing.fee)}
                    </span>
                  </div>
                  {effectiveType !== "tournament" ? (
                    <div className="breakdown-row">
                      <span className="breakdown-label">
                        Payment processing fee
                      </span>
                      <span className="breakdown-value">
                        3.5% + $0.40 per donation
                      </span>
                    </div>
                  ) : (
                    <div className="breakdown-row">
                      <span className="breakdown-label">
                        Registration processing
                      </span>
                      <span className="breakdown-value">
                        Standard Stripe rate
                      </span>
                    </div>
                  )}
                  <div className="breakdown-divider"></div>
                  <div className="breakdown-row breakdown-row-final">
                    <span className="breakdown-label">Due to launch</span>
                    <span className="breakdown-value-final">
                      ${formatMoney(pricing.fee)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* What's included */}
            <div className="form-section">
              <h3 className="form-section-title">What&apos;s included</h3>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {pricing.features.map((feature) => (
                  <li
                    key={feature}
                    style={{
                      paddingLeft: 28,
                      position: "relative",
                      marginBottom: 10,
                      lineHeight: 1.5,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        color: "#10b981",
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Actions */}
            <div
              className="form-actions"
              style={{
                flexDirection: "column",
                alignItems: "stretch",
                gap: 12,
              }}
            >
              <button
                type="button"
                className="btn-primary btn-inline"
                disabled
                title="Payment system launching soon"
                style={{
                  opacity: 0.55,
                  cursor: "not-allowed",
                }}
              >
                Pay ${formatMoney(pricing.fee)} &amp; Launch (coming soon)
              </button>
              <Link
                href={`/events/${event.id}`}
                className="btn-cancel"
                style={{ textAlign: "center" }}
              >
                Continue to event setup →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}

// =============================================================================
// app/api/organizations/[id]/events/[eventId]/money-csv/route.ts — CSV export
// (L41)
// =============================================================================
// GET /api/organizations/[id]/events/[eventId]/money-csv
//
// Returns a CSV file of all Entry Fee transactions for a tournament event
// (Camp events get an empty CSV with a Phase-10 note row). The route
// validates the caller owns the org, fetches tournament_teams rows with
// joined team/org/coach metadata, and writes a deterministic CSV with
// platform-fee math included.
//
// Headers ensure the browser triggers a download:
//   Content-Type: text/csv; charset=utf-8
//   Content-Disposition: attachment; filename="..."
//
// CSV columns:
//   row_id, team_name, team_organization, coach_name, joined_at,
//   entry_fee_paid_cents, entry_fee_paid_dollars, platform_fee_cents,
//   platform_fee_dollars, net_to_org_cents, net_to_org_dollars, status
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const PLATFORM_FEE_PCT = 0.035;
const PLATFORM_FEE_FLAT_CENTS = 40;

function dollarsFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Properly escape a CSV field — wraps in double quotes if it contains
// special chars, doubles up any internal double-quotes.
function csvField(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function safeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9\-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60)
    .toLowerCase();
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id: orgId, eventId } = await ctx.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Verify caller owns the org
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, owner_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  if (org.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Only the org owner can export money data." },
      { status: 403 }
    );
  }

  // Verify the event belongs to this org
  const { data: event } = await supabase
    .from("events")
    .select("id, name, event_type, tournament_entry_fee_cents, organization_id")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!event) {
    return NextResponse.json({ error: "Event not found in this org." }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${safeFilename(event.name)}-money-${today}.csv`;
  const lines: string[] = [];

  // Header rows for context
  lines.push(
    csvField(`Event: ${event.name}`) +
      "," +
      csvField(`Type: ${event.event_type}`) +
      "," +
      csvField(`Exported: ${new Date().toISOString()}`)
  );
  lines.push("");

  // Camp: no source data yet
  if (event.event_type !== "tournament") {
    lines.push(
      csvField(
        "Camp donation tracking activates in Phase 10. No transactions available to export yet."
      )
    );
    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // Tournament: fetch tournament_teams + related metadata
  const { data: ttRows } = await supabase
    .from("tournament_teams")
    .select(
      `id, team_id, joined_at, entry_fee_paid_cents, entry_fee_paid_at, status,
       teams(id, name, owner_id, organizations(name))`
    )
    .eq("tournament_event_id", eventId)
    .order("joined_at", { ascending: false });

  const rows = ttRows || [];

  // Batch-resolve coach names
  const coachUserIds = new Set<string>();
  rows.forEach((r) => {
    const teamRel = r.teams as { owner_id?: string } | null;
    if (teamRel?.owner_id) coachUserIds.add(teamRel.owner_id);
  });
  const coachIdsArray = Array.from(coachUserIds);
  const coachMap = new Map<string, string>();
  if (coachIdsArray.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", coachIdsArray);
    (profs || []).forEach((p) => {
      if (p.full_name) coachMap.set(p.id, p.full_name);
    });
  }

  // Column header row
  lines.push(
    [
      "row_id",
      "team_name",
      "team_organization",
      "coach_name",
      "joined_at",
      "entry_fee_paid_dollars",
      "platform_fee_dollars",
      "net_to_org_dollars",
      "status",
    ]
      .map(csvField)
      .join(",")
  );

  // Totals
  let totalGross = 0;
  let totalFees = 0;
  let totalNet = 0;
  let paidCount = 0;

  rows.forEach((r) => {
    const teamRel = r.teams as
      | { name?: string; owner_id?: string; organizations?: { name?: string } | null }
      | null;
    const teamName = teamRel?.name || "Team";
    const teamOrgName = teamRel?.organizations?.name || "";
    const coachName = teamRel?.owner_id
      ? coachMap.get(teamRel.owner_id) || ""
      : "";
    const gross = r.entry_fee_paid_cents ?? 0;
    const isPaid = r.status === "active" || r.status === "pending_approval";
    const fee = isPaid && gross > 0
      ? Math.round(gross * PLATFORM_FEE_PCT) + PLATFORM_FEE_FLAT_CENTS
      : 0;
    const net = isPaid ? gross - fee : 0;
    if (isPaid) {
      totalGross += gross;
      totalFees += fee;
      totalNet += net;
      paidCount += 1;
    }
    lines.push(
      [
        r.id,
        teamName,
        teamOrgName,
        coachName,
        r.joined_at,
        dollarsFromCents(gross),
        dollarsFromCents(fee),
        dollarsFromCents(net),
        r.status,
      ]
        .map(csvField)
        .join(",")
    );
  });

  // Trailing totals block
  lines.push("");
  lines.push(
    csvField(`Totals — paid transactions: ${paidCount}`) +
      "," +
      csvField(`Gross: $${dollarsFromCents(totalGross)}`) +
      "," +
      csvField(`Platform fees: $${dollarsFromCents(totalFees)}`) +
      "," +
      csvField(`Net to org: $${dollarsFromCents(totalNet)}`)
  );

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

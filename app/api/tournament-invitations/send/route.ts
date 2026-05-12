// =============================================================================
// app/api/tournament-invitations/send/route.ts — Send Tournament invitations
// =============================================================================
// POST { tournamentId, emails[], recipientNames? }
//
// Sends a per-recipient tournament invitation email to each address. Auth:
// the caller must be the owner of the tournament event (events.owner_id =
// auth.uid()).
//
// Response shape:
//   {
//     results: [
//       { email, status: "sent" | "failed", error?: string, resendId?: string },
//       ...
//     ]
//   }
//
// Per-recipient failures don't abort the batch. Each result records its
// own status; the UI can surface "3 sent, 1 failed (bad email format)"
// or whatever from the response.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { sendTournamentInvitationEmail } from "@/lib/email";

interface SendBody {
  tournamentId: string;
  emails: string[];
  recipientNames?: (string | null)[]; // optional, matches emails by index
}

interface ResultItem {
  email: string;
  status: "sent" | "failed";
  error?: string;
  resendId?: string;
}

// Basic email format check. We use a forgiving regex — Resend will reject
// truly malformed addresses anyway. This is just to catch obvious typos
// (no @, no .) before paying for the API call.
function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!body.tournamentId) {
    return NextResponse.json(
      { error: "tournamentId is required." },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.emails) || body.emails.length === 0) {
    return NextResponse.json(
      { error: "emails must be a non-empty array." },
      { status: 400 }
    );
  }
  if (body.emails.length > 50) {
    return NextResponse.json(
      { error: "Maximum 50 invitations per request. Split into batches." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Verify the user owns this tournament event. Pull the fields we'll need
  // for the email template at the same time.
  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select(
      `id, name, description, start_date, end_date, owner_id, event_type,
       tournament_entry_fee_cents, tournament_join_code,
       first_place_prize, first_place_amount,
       organizations(name)`
    )
    .eq("id", body.tournamentId)
    .single();

  if (evErr || !ev) {
    return NextResponse.json(
      { error: "Tournament not found." },
      { status: 404 }
    );
  }
  if (ev.owner_id !== user.id) {
    return NextResponse.json(
      { error: "You don't own this tournament." },
      { status: 403 }
    );
  }
  if (ev.event_type !== "tournament") {
    return NextResponse.json(
      { error: "This event is not a tournament." },
      { status: 400 }
    );
  }
  if (!ev.tournament_join_code) {
    return NextResponse.json(
      { error: "Tournament join code is missing. Recreate the tournament or contact support." },
      { status: 500 }
    );
  }

  // Fetch the inviter's name (the host coach) so we can personalize the
  // "X at OrgName is hosting..." line.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const inviterName = profile?.full_name?.trim() || null;

  // Resolve host org name (foreign-key relation returns shape that depends
  // on the join — handle both array and object cases).
  let hostOrgName = "Their organization";
  const orgRel = ev.organizations;
  if (orgRel) {
    if (Array.isArray(orgRel)) {
      hostOrgName = orgRel[0]?.name || hostOrgName;
    } else if (typeof orgRel === "object" && "name" in orgRel) {
      hostOrgName = (orgRel as { name?: string }).name || hostOrgName;
    }
  }

  // Build the public tournament URL. The recipient lands on a no-auth
  // info page first; they decide there whether to sign up or log in.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    "https://app.earn2keep.com";
  const tournamentUrl = `${baseUrl}/tournament/${ev.tournament_join_code}`;

  // Build a prize description string from whichever fields are populated.
  // Falls back to null if no prize info is set.
  let prizeDescription: string | null = null;
  if (ev.first_place_prize) {
    prizeDescription = ev.first_place_prize;
    if (ev.first_place_amount && Number(ev.first_place_amount) > 0) {
      prizeDescription += ` ($${Number(ev.first_place_amount).toLocaleString("en-US")})`;
    }
  }

  // Send each email. Per-recipient failures don't abort the batch.
  const results: ResultItem[] = [];
  for (let i = 0; i < body.emails.length; i++) {
    const rawEmail = String(body.emails[i] ?? "").trim();
    const recipientName =
      Array.isArray(body.recipientNames) && body.recipientNames[i]
        ? String(body.recipientNames[i]).trim() || null
        : null;

    if (!isPlausibleEmail(rawEmail)) {
      results.push({
        email: rawEmail || "(empty)",
        status: "failed",
        error: "Invalid email format.",
      });
      continue;
    }

    const sendResult = await sendTournamentInvitationEmail({
      to: rawEmail,
      recipientFirstName: recipientName,
      hostOrgName,
      hostInviterName: inviterName,
      tournamentName: ev.name,
      tournamentDescription: ev.description ?? null,
      startDate: ev.start_date,
      endDate: ev.end_date,
      entryFeeCents: ev.tournament_entry_fee_cents ?? 0,
      joinCode: ev.tournament_join_code,
      tournamentUrl,
      prizeDescription,
    });

    if (sendResult.ok) {
      results.push({
        email: rawEmail,
        status: "sent",
        resendId: sendResult.resendId,
      });
    } else {
      results.push({
        email: rawEmail,
        status: "failed",
        error: sendResult.error,
      });
    }
  }

  return NextResponse.json({ results });
}

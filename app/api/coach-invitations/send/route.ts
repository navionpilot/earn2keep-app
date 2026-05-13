// =============================================================================
// app/api/coach-invitations/send/route.ts — Send coach invitation (L39)
// =============================================================================
// POST { orgId, email, recipientName? }
//
// 1. Validates caller is the org owner
// 2. Checks for an existing pending invite to the same email (idempotency)
// 3. Inserts a row into org_coach_invitations (status='pending', random token)
// 4. Sends the email via Resend with the accept link
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { sendCoachInvitationEmail } from "@/lib/email";

interface SendBody {
  orgId: string;
  email: string;
  recipientName?: string | null;
}

function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.orgId || !body.email) {
    return NextResponse.json(
      { error: "orgId and email are required." },
      { status: 400 }
    );
  }

  const email = String(body.email).trim();
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Verify caller owns the org
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, owner_id")
    .eq("id", body.orgId)
    .maybeSingle();

  if (orgErr || !org) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  if (org.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Only the org owner can invite coaches." },
      { status: 403 }
    );
  }

  // Look up the inviter's profile name for the email greeting
  const { data: inviterProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const inviterName = inviterProfile?.full_name || null;

  // Insert the invite. The partial unique index on (org, lower(email)) WHERE
  // status='pending' enforces no-double-invite at the DB level.
  const { data: invite, error: insErr } = await supabase
    .from("org_coach_invitations")
    .insert({
      organization_id: body.orgId,
      email: email,
      recipient_name: body.recipientName?.trim() || null,
      invited_by_user_id: user.id,
    })
    .select("id, token, email, recipient_name")
    .single();

  if (insErr) {
    // Surface unique-index violation as a friendlier error
    if (insErr.message.includes("duplicate") || insErr.code === "23505") {
      return NextResponse.json(
        { error: `A pending invitation already exists for ${email}. Revoke it first or wait for them to accept.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Send the email
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    "https://app.earn2keep.com";
  const acceptUrl = `${baseUrl}/accept-coach-invitation/${invite.token}`;

  const sendResult = await sendCoachInvitationEmail({
    to: email,
    recipientFirstName: body.recipientName?.split(" ")[0] || null,
    inviterName,
    orgName: org.name,
    acceptUrl,
  });

  if (!sendResult.ok) {
    // Email failed; the row is still in DB. Surface the error but the
    // invite is technically valid — the org owner could manually share
    // the URL.
    return NextResponse.json(
      {
        ok: true,
        warning: `Invitation created but email delivery failed: ${sendResult.error}`,
        inviteId: invite.id,
        token: invite.token,
        acceptUrl,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    inviteId: invite.id,
    email,
    resendId: sendResult.resendId,
  });
}

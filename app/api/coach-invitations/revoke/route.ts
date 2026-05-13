// =============================================================================
// app/api/coach-invitations/revoke/route.ts — Revoke pending invite (L39)
// =============================================================================
// POST { inviteId, orgId }
// Marks status='revoked' on the row. RLS enforces caller is the org owner.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

interface RevokeBody {
  inviteId: string;
  orgId: string;
}

export async function POST(req: NextRequest) {
  let body: RevokeBody;
  try {
    body = (await req.json()) as RevokeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.inviteId || !body.orgId) {
    return NextResponse.json(
      { error: "inviteId and orgId are required." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // RLS check happens here implicitly — the UPDATE will fail if the caller
  // doesn't own the org.
  const { error: updErr } = await supabase
    .from("org_coach_invitations")
    .update({ status: "revoked" })
    .eq("id", body.inviteId)
    .eq("organization_id", body.orgId)
    .eq("status", "pending");

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

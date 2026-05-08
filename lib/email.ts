// =============================================================================
// lib/email.ts — Outbound email via Resend (Slice 5.1.1)
// =============================================================================
// We hit the Resend HTTP API directly with fetch instead of installing the
// `resend` npm package. Reasons:
//   - No package.json churn / no `npm install` step for the user
//   - One less version to keep in sync
//   - The API is one endpoint with one POST shape; the SDK doesn't add much
//
// Required env: RESEND_API_KEY — set this in Vercel project env vars (it's
// the same key generated during the Slice 4.8 SMTP setup).
//
// Sender address: noreply@earn2keep.com — matches the verified domain from
// the SMTP setup, so deliverability inherits the DKIM/SPF/DMARC config you
// already put in place.
// =============================================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Sender displayed in the recipient's inbox. Resend will reject sends from
// this address unless the domain is verified — which it should already be
// from Slice 4.8.
const FROM_ADDRESS = "earn²keep <noreply@earn2keep.com>";

export interface InviteEmailOptions {
  to: string;
  playerFirstName: string;
  playerLastName: string | null;
  teamName: string;
  teamSport: string | null;
  orgName: string;
  // If the team currently has an active or draft event, we frame the email
  // around it ("competing in [Event Name]"). If not, we fall back to a
  // friendlier roster-only line.
  eventName: string | null;
  eventType: "camp" | "tournament" | null;
  inviteUrl: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  // Resend assigns each successful send an id we can use later for log
  // correlation if needed.
  resendId?: string;
}

/**
 * Send a branded invite email through Resend. Never throws — failures are
 * returned in the result so the caller can mark per-row delivery status
 * without aborting the whole batch.
 */
export async function sendInviteEmail(opts: InviteEmailOptions): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set on the server." };
  }

  const subject = buildSubject(opts);
  const html = buildHtmlTemplate(opts);
  const text = buildPlainText(opts);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [opts.to],
        subject,
        html,
        text,
        // reply_to lets the player's parent reply directly to the coach in a
        // future slice; for now we just bounce replies off the noreply box.
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      // Try to surface the Resend-specific error message ("Invalid email",
      // "Domain not verified", etc.) for a better coach-facing UX.
      let parsed: { message?: string } = {};
      try {
        parsed = JSON.parse(errBody);
      } catch {
        // not JSON, ignore
      }
      const friendly =
        parsed.message ||
        `Email service returned ${response.status}: ${errBody.slice(0, 200) || "no detail"}`;
      return { ok: false, error: friendly };
    }

    const json = (await response.json()) as { id?: string };
    return { ok: true, resendId: json.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown network error.";
    return { ok: false, error: message };
  }
}

// -----------------------------------------------------------------------------
// Subject line — short, recognizable, no emoji-only header (some spam filters
// down-rank emoji-heavy subjects).
// -----------------------------------------------------------------------------
function buildSubject(opts: InviteEmailOptions): string {
  if (opts.eventName) {
    return `You're invited to ${opts.eventName} on earn²keep`;
  }
  return `You've been added to ${opts.teamName} on earn²keep`;
}

// -----------------------------------------------------------------------------
// HTML template — inline styles only (Gmail/Outlook strip <style>).
// Table-based layout for Outlook compatibility. Keeps width to 600px.
//
// Visually mirrors the in-app dark-glass look but uses solid hexes (no rgba +
// backdrop-filter, neither of which work in email clients). Coral header,
// dark body, three feature blurbs, big CTA button, fine-print footer.
// -----------------------------------------------------------------------------
function buildHtmlTemplate(opts: InviteEmailOptions): string {
  const { playerFirstName, teamName, teamSport, orgName, eventName, eventType, inviteUrl } = opts;

  // Hero copy varies based on whether we have event context.
  const heroLine = eventName
    ? `You've been invited to compete in <strong>${escape(eventName)}</strong> with the <strong>${escape(teamName)}</strong>${teamSport ? ` ${escape(teamSport)} team` : ""} at <strong>${escape(orgName)}</strong>.`
    : `Your coach added you to <strong>${escape(teamName)}</strong>${teamSport ? ` (${escape(teamSport)})` : ""} at <strong>${escape(orgName)}</strong>.`;

  // Event-type label for the eyebrow ("CAMP INVITE" / "TOURNAMENT INVITE" /
  // "ROSTER INVITE"). All-caps, letterspaced — feels official, not clickbaity.
  const eyebrow =
    eventType === "camp"
      ? "CAMP INVITE"
      : eventType === "tournament"
      ? "TOURNAMENT INVITE"
      : "YOU'RE ON THE ROSTER";

  // Pre-header: the inbox-preview snippet that sits next to the subject in
  // most clients. Keep it under ~90 chars and on-message.
  const preheader = eventName
    ? `Your coach added you to ${eventName}. Set up your account to compete and earn.`
    : `Your coach added you to ${teamName}. Set up your account on earn²keep.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(buildSubject(opts))}</title>
</head>
<body style="margin:0;padding:0;background:#041418;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f7fbfb;-webkit-font-smoothing:antialiased;">

<!-- pre-header (hidden in body, visible in inbox preview) -->
<div style="display:none;font-size:1px;color:#041418;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
${escape(preheader)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#041418;padding:32px 16px;">
  <tr>
    <td align="center">

      <!-- Outer card -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#062b32;border:1px solid rgba(95,230,225,0.15);border-radius:16px;overflow:hidden;">

        <!-- Coral header bar -->
        <tr>
          <td style="background:linear-gradient(135deg,#ff755f 0%,#ff9a7b 100%);padding:24px 28px;">
            <div style="font-family:'Sora',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.6px;line-height:1;">
              earn<sup style="font-size:14px;vertical-align:super;line-height:0;">2</sup>keep
            </div>
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:1.6px;text-transform:uppercase;margin-top:4px;">
              Earn it. Keep it.
            </div>
          </td>
        </tr>

        <!-- Eyebrow + hero -->
        <tr>
          <td style="padding:32px 32px 12px 32px;">
            <div style="font-size:11px;font-weight:800;color:#35d5df;letter-spacing:1.8px;text-transform:uppercase;">
              ${escape(eyebrow)}
            </div>
            <h1 style="font-family:'Sora',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:30px;font-weight:800;color:#f7fbfb;letter-spacing:-0.5px;margin:8px 0 16px 0;line-height:1.15;">
              Welcome, ${escape(playerFirstName)}! 🎉
            </h1>
            <p style="font-size:15px;line-height:1.6;color:#cfe7e7;margin:0 0 24px 0;">
              ${heroLine}
            </p>
          </td>
        </tr>

        <!-- Three-feature row -->
        <tr>
          <td style="padding:0 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

              <tr>
                <td style="padding:14px 0;border-top:1px solid rgba(95,230,225,0.12);">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td width="44" valign="top" style="font-size:24px;line-height:1;">📹</td>
                      <td valign="top">
                        <div style="font-size:14px;font-weight:700;color:#f7fbfb;margin-bottom:2px;">Record your challenges.</div>
                        <div style="font-size:13px;color:#9fc3c7;line-height:1.5;">Push-ups, free throws, drills — film it from your phone, send it in, get scored.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:14px 0;border-top:1px solid rgba(95,230,225,0.12);">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td width="44" valign="top" style="font-size:24px;line-height:1;">💸</td>
                      <td valign="top">
                        <div style="font-size:14px;font-weight:700;color:#f7fbfb;margin-bottom:2px;">Get sponsored. Keep more.</div>
                        <div style="font-size:13px;color:#9fc3c7;line-height:1.5;">Your sponsors back YOUR effort, not a cookie-dough catalog. Money raised stays with the team.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:14px 0;border-top:1px solid rgba(95,230,225,0.12);border-bottom:1px solid rgba(95,230,225,0.12);">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td width="44" valign="top" style="font-size:24px;line-height:1;">🏆</td>
                      <td valign="top">
                        <div style="font-size:14px;font-weight:700;color:#f7fbfb;margin-bottom:2px;">Climb the leaderboard.</div>
                        <div style="font-size:13px;color:#9fc3c7;line-height:1.5;">Top performers win prize gift cards. Best fundraisers earn bonus points.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- CTA button -->
        <tr>
          <td align="center" style="padding:28px 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:linear-gradient(135deg,#ff755f 0%,#ff9a7b 100%);border-radius:999px;">
                  <a href="${escape(inviteUrl)}" style="display:inline-block;padding:14px 36px;font-family:'Sora',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">
                    Set up my account →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- URL fallback -->
        <tr>
          <td align="center" style="padding:0 32px 28px 32px;">
            <div style="font-size:11px;color:#9fc3c7;margin-top:14px;">
              Or paste this into your browser:
            </div>
            <div style="font-size:11px;color:#35d5df;word-break:break-all;margin-top:4px;">
              ${escape(inviteUrl)}
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#041418;padding:20px 32px;border-top:1px solid rgba(95,230,225,0.10);">
            <div style="font-size:11px;color:#6b8788;line-height:1.6;text-align:center;">
              You got this email because a coach at <strong style="color:#9fc3c7;">${escape(orgName)}</strong> added you to their team on earn²keep. If you weren't expecting this, it's safe to ignore — no account is created until you click the button.
            </div>
            <div style="font-size:11px;color:#6b8788;text-align:center;margin-top:10px;">
              earn²keep · Earn it. Keep it.
            </div>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

// -----------------------------------------------------------------------------
// Plain-text fallback for clients that prefer it (and for spam-score). Keeps
// the same structure as HTML but with line breaks and ASCII-only characters.
// -----------------------------------------------------------------------------
function buildPlainText(opts: InviteEmailOptions): string {
  const { playerFirstName, teamName, teamSport, orgName, eventName, eventType, inviteUrl } = opts;

  const heroLine = eventName
    ? `You've been invited to compete in ${eventName} with the ${teamName}${teamSport ? ` ${teamSport} team` : ""} at ${orgName}.`
    : `Your coach added you to ${teamName}${teamSport ? ` (${teamSport})` : ""} at ${orgName}.`;

  const eyebrow =
    eventType === "camp"
      ? "CAMP INVITE"
      : eventType === "tournament"
      ? "TOURNAMENT INVITE"
      : "YOU'RE ON THE ROSTER";

  return `${eyebrow}

Welcome, ${playerFirstName}!

${heroLine}

What you'll do on earn²keep:
* Record your challenges — push-ups, free throws, drills.
* Get sponsored. Sponsors back YOUR effort, not catalogs.
* Climb the leaderboard — top performers win prizes.

Set up your account:
${inviteUrl}

You got this email because a coach at ${orgName} added you to their team
on earn²keep. If you weren't expecting it, ignore this message — no
account is created until you click the link.

earn²keep · Earn it. Keep it.
`;
}

// -----------------------------------------------------------------------------
// HTML escape helper — only the bare minimum needed for safety in the
// template. We don't accept rich-text input so we don't need a full sanitizer.
// -----------------------------------------------------------------------------
function escape(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

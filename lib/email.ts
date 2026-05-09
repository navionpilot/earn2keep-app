// =============================================================================
// lib/email.ts — Outbound email via Resend (Slice 5.1.1, retemplated in 5.1.2)
// =============================================================================
// We hit the Resend HTTP API directly with fetch instead of installing the
// `resend` npm package.
//
// Required env: RESEND_API_KEY — set in Vercel project env vars.
//
// 5.1.2 retemplate notes:
//   The original (5.1.1) HTML used gradients, body backgrounds, and
//   <style> blocks — all of which Outlook desktop's Word rendering engine
//   strips or ignores, producing the washed-out light-gray email shown in
//   the user's screenshot. This version uses the "bulletproof email"
//   patterns: bgcolor= attributes on tables, solid hex colors instead of
//   gradients, color-scheme meta tag to prevent dark-mode auto-inversion,
//   and a VML/anchor combo for the CTA button so Outlook + Gmail + Apple
//   Mail all render it as a coral pill.
// =============================================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const FROM_ADDRESS = "earn²keep <noreply@earn2keep.com>";

export interface InviteEmailOptions {
  to: string;
  playerFirstName: string;
  playerLastName: string | null;
  teamName: string;
  teamSport: string | null;
  orgName: string;
  eventName: string | null;
  eventType: "camp" | "tournament" | null;
  inviteUrl: string;
  // Slice 5.4.2: inclusive role label so emails don't always say "coach".
  // Caller passes whatever's appropriate ("coach", "youth pastor", "scout
  // leader", etc.). Defaults to "team leader" if not provided.
  inviterLabel?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
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
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
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
// Subject line — short, recognizable.
// -----------------------------------------------------------------------------
function buildSubject(opts: InviteEmailOptions): string {
  if (opts.eventName) {
    return `You're invited to ${opts.eventName} on earn²keep`;
  }
  return `You've been added to ${opts.teamName} on earn²keep`;
}

// -----------------------------------------------------------------------------
// HTML template — bulletproof email patterns.
//
// Color palette (matches Variation F app theme but with solid hexes only —
// Outlook strips rgba and gradients):
//   #041418  outer body / page background (almost-black teal)
//   #06242b  inner card background
//   #0a3940  feature-row separator hover-tint
//   #ff755f  coral primary (CTA button, accent strip)
//   #35d5df  cyan accent (eyebrow text, link color)
//   #f7fbfb  primary body text on dark
//   #9fc3c7  muted text
//   #6b8788  fine-print text
//
// Outlook bullets:
//   - Use bgcolor= on tables (not just CSS) — Word's renderer respects the
//     attribute even when it ignores the CSS.
//   - <meta name="color-scheme" content="dark"> tells Outlook this email
//     is intentionally dark, so it doesn't auto-invert.
//   - VML <v:roundrect> renders the button on Outlook desktop. Non-Outlook
//     clients see the <a> fallback inside the [if !mso] block.
// -----------------------------------------------------------------------------
function buildHtmlTemplate(opts: InviteEmailOptions): string {
  const { playerFirstName, teamName, teamSport, orgName, eventName, eventType, inviteUrl } = opts;
  // Slice 5.4.2: inviterLabel falls back to "team leader" — generic and
  // works for all 8 roles when none is specified.
  const inviter = opts.inviterLabel || "team leader";

  const heroLine = eventName
    ? `You've been invited to compete in <strong style="color:#ffffff;">${escape(eventName)}</strong> with the <strong style="color:#ffffff;">${escape(teamName)}</strong>${teamSport ? ` ${escape(teamSport)} team` : ""} at <strong style="color:#ffffff;">${escape(orgName)}</strong>.`
    : `Your ${escape(inviter)} added you to <strong style="color:#ffffff;">${escape(teamName)}</strong>${teamSport ? ` (${escape(teamSport)})` : ""} at <strong style="color:#ffffff;">${escape(orgName)}</strong>.`;

  const eyebrow =
    eventType === "camp"
      ? "CAMP INVITE"
      : eventType === "tournament"
      ? "TOURNAMENT INVITE"
      : "YOU'RE ON THE ROSTER";

  const preheader = eventName
    ? `Your ${inviter} added you to ${eventName}. Set up your account to compete and earn.`
    : `Your ${inviter} added you to ${teamName}. Set up your account on earn²keep.`;

  // Bulletproof CTA button. The VML rect renders in Outlook desktop with the
  // exact coral pill shape and centered white text. Every other client uses
  // the <a> element wrapped in [if !mso].
  const ctaButton = `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escape(inviteUrl)}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="100%" stroke="f" fillcolor="#ff755f">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.3px;">
        Set up my account →
      </center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${escape(inviteUrl)}"
       style="background-color:#ff755f;color:#ffffff;display:inline-block;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.3px;line-height:50px;text-align:center;text-decoration:none;width:280px;border-radius:999px;-webkit-text-size-adjust:none;mso-hide:all;">
      Set up my account →
    </a>
    <!--<![endif]-->
  `.trim();

  return `<!doctype html>
<html lang="en" style="margin:0;padding:0;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escape(buildSubject(opts))}</title>
<!--[if mso]>
<style type="text/css">
  table {border-collapse:collapse;}
  body, table, td, p, a {font-family:Arial,sans-serif !important;}
</style>
<xml>
<o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office">
  <o:AllowPNG/>
  <o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
</head>
<body bgcolor="#041418" style="margin:0;padding:0;background-color:#041418;color:#f7fbfb;-webkit-font-smoothing:antialiased;">

<!-- pre-header (hidden in body, visible in inbox preview) -->
<div style="display:none;font-size:1px;color:#041418;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
${escape(preheader)}
</div>

<!-- Outer 100% wrapper that paints the page background dark. bgcolor +
     inline style covers Outlook's stripped CSS. -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#041418" style="background-color:#041418;">
  <tr>
    <td align="center" bgcolor="#041418" style="background-color:#041418;padding:32px 16px;">

      <!-- Inner 600px content table -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#06242b" style="max-width:600px;width:100%;background-color:#06242b;border-radius:12px;">

        <!-- Coral header bar (solid color — Outlook strips gradients) -->
        <tr>
          <td bgcolor="#ff755f" style="background-color:#ff755f;padding:24px 28px;border-radius:12px 12px 0 0;font-family:Arial,sans-serif;">
            <div style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.6px;line-height:1;mso-line-height-rule:exactly;">
              earn<sup style="font-size:14px;vertical-align:super;">2</sup>keep
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:1.6px;text-transform:uppercase;margin-top:6px;">
              Earn it. Keep it.
            </div>
          </td>
        </tr>

        <!-- Eyebrow + hero -->
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:32px 32px 12px 32px;font-family:Arial,sans-serif;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;color:#35d5df;letter-spacing:1.8px;text-transform:uppercase;">
              ${escape(eyebrow)}
            </div>
            <h1 style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:30px;font-weight:800;color:#f7fbfb;letter-spacing:-0.5px;margin:8px 0 16px 0;line-height:1.15;mso-line-height-rule:exactly;">
              Welcome, ${escape(playerFirstName)}! 🎉
            </h1>
            <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#cfe7e7;margin:0 0 24px 0;">
              ${heroLine}
            </p>
          </td>
        </tr>

        <!-- Three feature rows -->
        ${renderFeatureRow("📹", "Record your challenges.", "Push-ups, free throws, drills — film it from your phone, send it in, get scored.", true)}
        ${renderFeatureRow("💸", "Get sponsored. Keep more.", "Your sponsors back YOUR effort, not a cookie-dough catalog. Money raised stays with the team.", false)}
        ${renderFeatureRow("🏆", "Climb the leaderboard.", "Top performers win prize gift cards. Best fundraisers earn bonus points.", false, true)}

        <!-- CTA button row -->
        <tr>
          <td bgcolor="#06242b" align="center" style="background-color:#06242b;padding:32px 32px 12px 32px;">
            ${ctaButton}
          </td>
        </tr>

        <!-- URL fallback -->
        <tr>
          <td bgcolor="#06242b" align="center" style="background-color:#06242b;padding:0 32px 28px 32px;font-family:Arial,sans-serif;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#9fc3c7;margin-top:14px;">
              Or paste this into your browser:
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#35d5df;word-break:break-all;margin-top:4px;">
              <a href="${escape(inviteUrl)}" style="color:#35d5df;text-decoration:underline;">${escape(inviteUrl)}</a>
            </div>
          </td>
        </tr>

        <!-- Footer (slightly darker so it reads as separate from body) -->
        <tr>
          <td bgcolor="#041418" style="background-color:#041418;padding:20px 32px;border-radius:0 0 12px 12px;font-family:Arial,sans-serif;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#6b8788;line-height:1.6;text-align:center;">
              You got this email because a ${escape(inviter)} at <strong style="color:#9fc3c7;">${escape(orgName)}</strong> added you to their team on earn²keep. If you weren't expecting this, it's safe to ignore — no account is created until you click the button.
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#6b8788;text-align:center;margin-top:10px;">
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

// Render one feature row. Used for the three-up "Record / Sponsored /
// Leaderboard" section. Top border on the first row, bottom on the last.
function renderFeatureRow(
  emoji: string,
  title: string,
  body: string,
  isFirst: boolean,
  isLast = false
): string {
  const borderTop = isFirst
    ? "border-top:1px solid #0a3940;"
    : "border-top:1px solid #0a3940;";
  const borderBottom = isLast ? "border-bottom:1px solid #0a3940;" : "";
  return `
    <tr>
      <td bgcolor="#06242b" style="background-color:#06242b;padding:0 32px;font-family:Arial,sans-serif;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${borderTop}${borderBottom}">
          <tr>
            <td style="padding:14px 0;" valign="top">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="44" valign="top" style="font-size:24px;line-height:1;mso-line-height-rule:exactly;width:44px;">
                    ${emoji}
                  </td>
                  <td valign="top" style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
                    <div style="font-size:14px;font-weight:700;color:#f7fbfb;margin-bottom:4px;line-height:1.3;">${escape(title)}</div>
                    <div style="font-size:13px;color:#9fc3c7;line-height:1.5;">${escape(body)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `.trim();
}

// -----------------------------------------------------------------------------
// Plain-text fallback for clients that prefer it (and for spam-score).
// -----------------------------------------------------------------------------
function buildPlainText(opts: InviteEmailOptions): string {
  const { playerFirstName, teamName, teamSport, orgName, eventName, eventType, inviteUrl } = opts;
  const inviter = opts.inviterLabel || "team leader";

  const heroLine = eventName
    ? `You've been invited to compete in ${eventName} with the ${teamName}${teamSport ? ` ${teamSport} team` : ""} at ${orgName}.`
    : `Your ${inviter} added you to ${teamName}${teamSport ? ` (${teamSport})` : ""} at ${orgName}.`;

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

You got this email because a ${inviter} at ${orgName} added you to their team
on earn²keep. If you weren't expecting it, ignore this message — no
account is created until you click the link.

earn²keep · Earn it. Keep it.
`;
}

// -----------------------------------------------------------------------------
// HTML escape — bare minimum for safety in the template.
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

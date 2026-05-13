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

// =============================================================================
// Slice 7.8: roleToLabel — translates the 8 organizer roles (stored as
// profiles.primary_role) into a friendly noun for emails. Mirrors the
// SQL CASE in tg_submission_review_notify (slice 7.6) and the local
// roleToInviterLabel in app/api/invites/send/route.ts (slice 5.4.2).
//
// Centralized here so any email module can stay consistent. Anything not
// recognized falls through to "team leader" — covers org_director, other,
// null, and any role added in the future before this mapping is updated.
// =============================================================================
export function roleToLabel(role: string | null | undefined): string {
  switch (role) {
    case "coach":        return "coach";
    case "teacher":      return "teacher";
    case "youth_pastor": return "youth pastor";
    case "scout_leader": return "scout leader";
    case "gym_owner":    return "gym instructor";
    case "parent":       return "parent";
    case "org_director":
    case "other":
    default:             return "team leader";
  }
}

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
    (eventType === "camp")
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
        ${renderFeatureRow("💸", "Find supporters. Keep more.", "Your supporters back YOUR effort, not a cookie-dough catalog. Money raised stays with the team.", false)}
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

// Render one feature row. Used for the three-up "Record / Supported /
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
    (eventType === "camp")
      ? "CAMP INVITE"
      : eventType === "tournament"
      ? "TOURNAMENT INVITE"
      : "YOU'RE ON THE ROSTER";

  return `${eyebrow}

Welcome, ${playerFirstName}!

${heroLine}

What you'll do on earn²keep:
* Record your challenges — push-ups, free throws, drills.
* Find supporters. Supporters back YOUR effort, not catalogs.
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


// =============================================================================
// Slice 5.9 — Submission-reviewed email
// =============================================================================
// Sent to the player when a coach approves or rejects one of their
// submissions. Respects players.notification_prefs.submission_reviewed
// (caller checks this before invoking; this function just sends).
// =============================================================================

export interface SubmissionReviewedEmailOptions {
  to: string;
  playerFirstName: string;
  challengeName: string;
  eventName: string | null;
  status: "approved" | "rejected";
  // Approved-only fields
  repsApproved: number | null;
  coachNote: string | null;
  // Rejected-only field
  rejectionReason: string | null;
  // Deep link back into the app's recording page
  appUrl: string;
  // Slice 7.8: noun for the organizer ("coach", "youth pastor", "scout
  // leader", "gym instructor", "teacher", "parent", or "team leader").
  // Caller resolves via roleToLabel(profile.primary_role). Optional for
  // back-compat — defaults to "coach" when not provided so older call
  // sites keep their current wording.
  ownerLabel?: string;
}

export async function sendSubmissionReviewedEmail(
  opts: SubmissionReviewedEmailOptions
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set on the server." };
  }

  const subject =
    opts.status === "approved"
      ? `✓ ${opts.challengeName} approved!`
      : `Try again — ${opts.challengeName}`;

  const html = buildSubmissionReviewedHtml(opts, subject);
  const text = buildSubmissionReviewedText(opts);

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
      try { parsed = JSON.parse(errBody); } catch { /* not json */ }
      return {
        ok: false,
        error: parsed.message || `Resend ${response.status}`,
      };
    }

    const json: { id?: string } = await response.json().catch(() => ({}));
    return { ok: true, resendId: json.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error reaching Resend.";
    return { ok: false, error: msg };
  }
}


function buildSubmissionReviewedHtml(
  opts: SubmissionReviewedEmailOptions,
  subj: string
): string {
  const safeName = escape(opts.playerFirstName);
  const safeChallenge = escape(opts.challengeName);
  const safeEvent = opts.eventName ? escape(opts.eventName) : "";
  const safeUrl = escape(opts.appUrl);

  // Outlook-bulletproof layout: tables, inline styles, no Flex/Grid.
  const isApproved = opts.status === "approved";
  const accent = isApproved ? "#35d5df" : "#ff755f";
  const headerEmoji = isApproved ? "✓" : "🔁";
  const headlineText = isApproved
    ? `Nice work, ${safeName}!`
    : `Hey ${safeName} — give it another shot.`;

  // Slice 7.8: noun for the organizer (varies by their primary_role).
  // Default to "coach" when not provided so existing call sites stay
  // grammatical even before they upgrade.
  const ownerLabel = opts.ownerLabel || "coach";

  const bodyHtml = isApproved
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#0a2f37;">
         Your <strong>${safeChallenge}</strong>${safeEvent ? ` submission for <strong>${safeEvent}</strong>` : ""} just got approved by your ${escape(ownerLabel)}.
       </p>`
       + (opts.repsApproved != null
         ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#0a2f37;">
              You got credit for <strong>${opts.repsApproved}</strong> reps. Every rep counts toward your total.
            </p>`
         : "")
       + (opts.coachNote
         ? `<table cellpadding="14" cellspacing="0" style="background:#f0fafb;border-left:3px solid ${accent};border-radius:6px;margin:0 0 18px;">
              <tr><td>
                <div style="font-size:11px;font-weight:700;color:${accent};letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px;">Note from your ${escape(ownerLabel)}</div>
                <div style="font-size:14px;color:#0a2f37;line-height:1.5;font-style:italic;">"${escape(opts.coachNote)}"</div>
              </td></tr>
            </table>`
         : "")
    : `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#0a2f37;">
         Your <strong>${safeChallenge}</strong>${safeEvent ? ` submission for <strong>${safeEvent}</strong>` : ""} needs another go.
       </p>`
       + (opts.rejectionReason
         ? `<table cellpadding="14" cellspacing="0" style="background:#fef0ec;border-left:3px solid ${accent};border-radius:6px;margin:0 0 18px;">
              <tr><td>
                <div style="font-size:11px;font-weight:700;color:${accent};letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px;">Feedback from your ${escape(ownerLabel)}</div>
                <div style="font-size:14px;color:#0a2f37;line-height:1.5;">${escape(opts.rejectionReason)}</div>
              </td></tr>
            </table>`
         : "");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${escape(subj)}</title></head>
<body style="margin:0;padding:0;background:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a2f37;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#041418;padding:28px 32px 24px;color:#ffffff;text-align:center;">
          <div style="font-size:26px;font-weight:800;letter-spacing:-0.5px;">earn<sup style="font-size:14px;color:#ff755f;">2</sup>keep</div>
          <div style="margin-top:4px;font-size:10px;font-weight:700;letter-spacing:1.6px;color:#35d5df;">EARN IT. KEEP IT.</div>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <div style="font-size:36px;line-height:1;margin-bottom:8px;">${headerEmoji}</div>
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0a2f37;">${headlineText}</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;">
          ${bodyHtml}
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">
            <tr><td align="center">
              <a href="${safeUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:99px;font-weight:800;font-size:15px;letter-spacing:0.4px;">
                ${isApproved ? "View on earn²keep →" : "Try again →"}
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#fafafa;padding:16px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #eaecef;">
          You're getting this because your earn²keep notification preferences are on.<br>
          Want fewer emails? Update them in your <a href="${escape(opts.appUrl).replace(/\/home.*$/, "/home/profile")}" style="color:#35d5df;">profile settings</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildSubmissionReviewedText(opts: SubmissionReviewedEmailOptions): string {
  const ownerLabel = opts.ownerLabel || "coach"; // Slice 7.8
  const lines: string[] = [];
  if (opts.status === "approved") {
    lines.push(`Nice work, ${opts.playerFirstName}!`);
    lines.push("");
    lines.push(
      `Your ${opts.challengeName}${opts.eventName ? ` submission for ${opts.eventName}` : ""} just got approved by your ${ownerLabel}.`
    );
    if (opts.repsApproved != null) {
      lines.push(`You got credit for ${opts.repsApproved} reps.`);
    }
    if (opts.coachNote) {
      lines.push("");
      lines.push(`Note from your ${ownerLabel}: "${opts.coachNote}"`);
    }
  } else {
    lines.push(`Hey ${opts.playerFirstName} — your ${opts.challengeName} submission needs another go.`);
    if (opts.rejectionReason) {
      lines.push("");
      lines.push(`Feedback from your ${ownerLabel}: ${opts.rejectionReason}`);
    }
  }
  lines.push("");
  lines.push(`View on earn²keep: ${opts.appUrl}`);
  lines.push("");
  lines.push("--");
  lines.push("earn²keep — Earn it. Keep it.");
  return lines.join("\n");
}


// =============================================================================
// Slice 7.9 (7.3 + 7.5 combined wrap) —
// sendSubmissionCreatedEmail — coach-facing notification
// =============================================================================
// Sent to the coach when one of their players records and submits a video.
// Brings parity with the player-side sendSubmissionReviewedEmail flow:
// in-app notification fires via DB trigger (slice 7.1's
// trg_notify_coach_of_submission), email is best-effort from app code.
//
// Coach-facing — does NOT use the role-aware ownerLabel (the coach IS the
// organizer, so there's nothing to translate).
// =============================================================================

export interface SubmissionCreatedEmailOptions {
  to: string;
  coachFirstName: string;
  playerFullName: string;
  challengeName: string;
  eventName: string | null;
  repsClaimed: number | null;
  playerNote: string | null;
  /** Deep link straight to the event submissions queue */
  reviewUrl: string;
}

export async function sendSubmissionCreatedEmail(
  opts: SubmissionCreatedEmailOptions
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set on the server." };
  }

  const subject = `New submission from ${opts.playerFullName}`;
  const html = buildSubmissionCreatedHtml(opts, subject);
  const text = buildSubmissionCreatedText(opts);

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
      try { parsed = JSON.parse(errBody); } catch { /* not json */ }
      return {
        ok: false,
        error: parsed.message || `Resend ${response.status}`,
      };
    }

    const json: { id?: string } = await response.json().catch(() => ({}));
    return { ok: true, resendId: json.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error reaching Resend.";
    return { ok: false, error: msg };
  }
}


function buildSubmissionCreatedHtml(
  opts: SubmissionCreatedEmailOptions,
  subj: string
): string {
  const safeName = escape(opts.coachFirstName);
  const safePlayer = escape(opts.playerFullName);
  const safeChallenge = escape(opts.challengeName);
  const safeEvent = opts.eventName ? escape(opts.eventName) : "";
  const safeUrl = escape(opts.reviewUrl);
  const accent = "#35d5df";

  const repsBlock = opts.repsClaimed != null
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#0a2f37;">
         Claimed <strong>${opts.repsClaimed}</strong> reps.
       </p>`
    : "";

  const noteBlock = opts.playerNote
    ? `<table cellpadding="14" cellspacing="0" style="background:#f0fafb;border-left:3px solid ${accent};border-radius:6px;margin:0 0 18px;">
         <tr><td>
           <div style="font-size:11px;font-weight:700;color:${accent};letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px;">Player's note</div>
           <div style="font-size:14px;color:#0a2f37;line-height:1.5;font-style:italic;">"${escape(opts.playerNote)}"</div>
         </td></tr>
       </table>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${escape(subj)}</title></head>
<body style="margin:0;padding:0;background:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0a2f37;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:#041418;padding:28px 32px 24px;color:#ffffff;text-align:center;">
          <div style="font-size:26px;font-weight:800;letter-spacing:-0.5px;">earn<sup style="font-size:14px;color:#ff755f;">2</sup>keep</div>
          <div style="margin-top:4px;font-size:10px;font-weight:700;letter-spacing:1.6px;color:#35d5df;">EARN IT. KEEP IT.</div>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <div style="font-size:36px;line-height:1;margin-bottom:8px;">📝</div>
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0a2f37;">${safeName ? `Hi ${safeName},` : "New submission!"}</h1>
          <p style="margin:0;font-size:15px;color:#5b6e75;">A new submission needs your review.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#0a2f37;">
            <strong>${safePlayer}</strong> submitted <strong>${safeChallenge}</strong>${safeEvent ? ` for <strong>${safeEvent}</strong>` : ""}.
          </p>
          ${repsBlock}
          ${noteBlock}
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">
            <tr><td align="center">
              <a href="${safeUrl}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:99px;font-weight:800;font-size:15px;letter-spacing:0.4px;">
                Review submission →
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#fafafa;padding:16px 32px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #eaecef;">
          You're getting this because you're the coach on this player's roster.<br>
          Reviewing one submission takes about 30 seconds.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildSubmissionCreatedText(opts: SubmissionCreatedEmailOptions): string {
  const lines: string[] = [];
  lines.push(opts.coachFirstName ? `Hi ${opts.coachFirstName},` : "New submission!");
  lines.push("");
  lines.push(
    `${opts.playerFullName} submitted ${opts.challengeName}${opts.eventName ? ` for ${opts.eventName}` : ""}.`
  );
  if (opts.repsClaimed != null) {
    lines.push(`Claimed ${opts.repsClaimed} reps.`);
  }
  if (opts.playerNote) {
    lines.push("");
    lines.push(`Player's note: "${opts.playerNote}"`);
  }
  lines.push("");
  lines.push(`Review on earn²keep: ${opts.reviewUrl}`);
  lines.push("");
  lines.push("--");
  lines.push("earn²keep — Earn it. Keep it.");
  return lines.join("\n");
}

// =============================================================================
// L33 — Tournament invitation email
// =============================================================================
// Sent by the host of a Tournament v2 event to other team organizers to
// invite their teams to join the tournament. Tone is energetic and
// competitive — this is one coach inviting another to a head-to-head
// commitment contest, not the player-onboarding "welcome to the team" vibe
// of sendInviteEmail.
//
// The CTA links to the PUBLIC tournament info page (/tournament/[code]),
// which works without login. The recipient sees what they're being invited
// to first, then signs up (or logs in) to actually register their team.
// =============================================================================

export interface TournamentInvitationEmailOptions {
  to: string;
  recipientFirstName: string | null;
  hostOrgName: string;
  hostInviterName: string | null;
  tournamentName: string;
  tournamentDescription: string | null;
  startDate: string;
  endDate: string;
  entryFeeCents: number;
  joinCode: string;
  tournamentUrl: string;
  /**
   * L38 — The tournament prize model is "winner takes the pot."
   * Pot = Entry Fee × number of registered teams (net of payment processing).
   * We display the current calculated pot and the per-team contribution so
   * the recipient understands what they're competing for.
   */
  currentPotCents: number;
  teamsRegistered: number;
}

export async function sendTournamentInvitationEmail(
  opts: TournamentInvitationEmailOptions
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set on the server." };
  }

  const subject = buildTournamentInvitationSubject(opts);
  const html = buildTournamentInvitationHtml(opts);
  const text = buildTournamentInvitationText(opts);

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
      const errText = await response.text();
      return { ok: false, error: `Resend ${response.status}: ${errText}` };
    }

    const data = (await response.json()) as { id?: string };
    return { ok: true, resendId: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function tournamentFormatMoney(cents: number): string {
  if (cents === 0) return "Free entry";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  })}`;
}

function tournamentFormatDisplayCode(canonical: string): string {
  const cleaned = canonical.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (cleaned.length !== 6) return canonical;
  return cleaned.slice(0, 3) + "-" + cleaned.slice(3);
}

function tournamentFormatDateRange(startISO: string, endISO: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  return `${fmt(startISO)} – ${fmt(endISO)}`;
}

function buildTournamentInvitationSubject(opts: TournamentInvitationEmailOptions): string {
  return `⚡ Your team is challenged: ${opts.tournamentName}`;
}

function buildTournamentInvitationHtml(opts: TournamentInvitationEmailOptions): string {
  const {
    recipientFirstName,
    hostOrgName,
    hostInviterName,
    tournamentName,
    tournamentDescription,
    startDate,
    endDate,
    entryFeeCents,
    joinCode,
    tournamentUrl,
    currentPotCents,
    teamsRegistered,
  } = opts;

  const greeting = recipientFirstName
    ? `Hey ${escape(recipientFirstName)},`
    : `Hey coach,`;

  const inviterPhrase = hostInviterName
    ? `<strong style="color:#ffffff;">${escape(hostInviterName)}</strong> at <strong style="color:#ffffff;">${escape(hostOrgName)}</strong>`
    : `<strong style="color:#ffffff;">${escape(hostOrgName)}</strong>`;

  const dateRange = tournamentFormatDateRange(startDate, endDate);
  const feeDisplay = tournamentFormatMoney(entryFeeCents);
  const displayCode = tournamentFormatDisplayCode(joinCode);
  const potDisplay = tournamentFormatMoney(currentPotCents);

  const preheader = `${hostOrgName} invited your team to ${tournamentName}. ${dateRange}. View tournament details and decide if you're in.`;

  // Optional rows
  const descriptionBlock = tournamentDescription
    ? `
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:8px 32px 16px 32px;font-family:Arial,sans-serif;">
            <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#cfe7e7;margin:0;font-style:italic;">
              "${escape(tournamentDescription)}"
            </p>
          </td>
        </tr>`
    : "";

  // L38 — "Winner takes the pot" — replaces the old configurable gift-card
  // prize. Pot = Entry Fee × number of registered teams (gross; net of
  // payment processing per the terms). We always show this block since
  // every tournament has this model.
  const prizeBlock = `
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:0 32px 16px 32px;font-family:Arial,sans-serif;">
            <div style="background-color:#0a2f37;padding:14px 16px;border-radius:8px;border-left:3px solid #ffd000;">
              <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:10px;font-weight:800;color:#ffd000;letter-spacing:1.6px;text-transform:uppercase;">
                🏆 Winner takes the pot
              </div>
              <div style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:22px;color:#f7fbfb;margin-top:6px;font-weight:800;">
                ${escape(potDisplay)}${teamsRegistered > 0 ? ` <span style="font-size:13px;font-weight:500;color:#9fc3c7;">(${teamsRegistered} ${teamsRegistered === 1 ? "team" : "teams"} registered)</span>` : ""}
              </div>
              <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:12px;color:#cfe7e7;margin-top:6px;line-height:1.5;">
                Pot grows by <strong style="color:#f7fbfb;">${escape(feeDisplay)}</strong> for every team that joins. The team that wins the tournament takes the whole pot. No individual prizes, no split pot.
              </div>
            </div>
          </td>
        </tr>`;

  // Bulletproof CTA. The "See tournament" wording — not "Pay & Join" —
  // because the recipient is unauthenticated; clicking goes to the public
  // info page first, decision happens there.
  const ctaButton = `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escape(tournamentUrl)}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="100%" stroke="f" fillcolor="#ff755f">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.3px;">
        See tournament details →
      </center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${escape(tournamentUrl)}"
       style="background-color:#ff755f;color:#ffffff;display:inline-block;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.3px;line-height:50px;text-align:center;text-decoration:none;width:300px;border-radius:999px;-webkit-text-size-adjust:none;mso-hide:all;">
      See tournament details →
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
<title>${escape(buildTournamentInvitationSubject(opts))}</title>
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

<!-- preheader -->
<div style="display:none;font-size:1px;color:#041418;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
${escape(preheader)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#041418" style="background-color:#041418;">
  <tr>
    <td align="center" bgcolor="#041418" style="background-color:#041418;padding:32px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#06242b" style="max-width:600px;width:100%;background-color:#06242b;border-radius:12px;">

        <!-- Coral header bar -->
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
          <td bgcolor="#06242b" style="background-color:#06242b;padding:32px 32px 8px 32px;font-family:Arial,sans-serif;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;color:#35d5df;letter-spacing:1.8px;text-transform:uppercase;">
              ⚡ Tournament Challenge
            </div>
            <h1 style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:28px;font-weight:800;color:#f7fbfb;letter-spacing:-0.5px;margin:8px 0 12px 0;line-height:1.2;mso-line-height-rule:exactly;">
              ${greeting} your team is challenged.
            </h1>
            <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#cfe7e7;margin:0 0 6px 0;">
              ${inviterPhrase} is hosting <strong style="color:#ffffff;">${escape(tournamentName)}</strong> — a head-to-head tournament. Bring your team. Show up. Compete.
            </p>
          </td>
        </tr>
        ${descriptionBlock}

        <!-- Tournament details grid -->
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:16px 32px;font-family:Arial,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding:12px 0;border-top:1px solid #0e3e47;border-bottom:1px solid #0e3e47;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td width="50%" style="vertical-align:top;padding-right:12px;">
                        <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:10px;font-weight:800;color:#9fc3c7;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:4px;">📅 Dates</div>
                        <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;color:#f7fbfb;font-weight:700;">${escape(dateRange)}</div>
                      </td>
                      <td width="50%" style="vertical-align:top;padding-left:12px;">
                        <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:10px;font-weight:800;color:#9fc3c7;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:4px;">💵 Entry fee</div>
                        <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;color:#f7fbfb;font-weight:700;">${escape(feeDisplay)}${entryFeeCents > 0 ? ' / team' : ''}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${prizeBlock}

        <!-- The hook: explain strict scoring so coach knows what they're signing up for -->
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:8px 32px 24px 32px;font-family:Arial,sans-serif;">
            <div style="background-color:#0a2f37;padding:16px 18px;border-radius:8px;border-left:3px solid #35d5df;">
              <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.55;color:#cfe7e7;margin:0;">
                <strong style="color:#35d5df;">🎯 Heads up — strict scoring.</strong> Your team only earns the points for a challenge when <em>every</em> player on your roster completes it. The whole team is the unit of competition. No backseat warriors. No carry jobs.
              </div>
            </div>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td bgcolor="#06242b" align="center" style="background-color:#06242b;padding:8px 32px 16px 32px;">
            ${ctaButton}
          </td>
        </tr>

        <!-- L38 — Big highlighted join code box (was a tiny line under the button) -->
        <tr>
          <td bgcolor="#06242b" align="center" style="background-color:#06242b;padding:0 32px 24px 32px;font-family:Arial,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:440px;margin:8px auto 0 auto;">
              <tr>
                <td bgcolor="#0a2f37" align="center" style="background-color:#0a2f37;padding:18px 20px;border-radius:10px;border:2px solid #35d5df;">
                  <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;color:#9fc3c7;letter-spacing:1.8px;text-transform:uppercase;margin-bottom:8px;">
                    Tournament Join Code
                  </div>
                  <div style="font-family:'Sora','Consolas','Courier New',monospace;font-size:36px;font-weight:800;color:#35d5df;letter-spacing:6px;line-height:1.1;mso-line-height-rule:exactly;">
                    ${escape(displayCode)}
                  </div>
                  <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:12px;color:#cfe7e7;margin-top:10px;">
                    Enter this at <strong style="color:#f7fbfb;">earn2keep.com/join-tournament</strong>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td bgcolor="#041418" style="background-color:#041418;padding:20px 32px;border-radius:0 0 12px 12px;font-family:Arial,sans-serif;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#6b8788;line-height:1.6;text-align:center;">
              You got this email because someone at <strong style="color:#9fc3c7;">${escape(hostOrgName)}</strong> invited your team to compete on earn²keep. If you weren't expecting this, it's safe to ignore — no team is registered until you act on it.
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

function buildTournamentInvitationText(opts: TournamentInvitationEmailOptions): string {
  const dateRange = tournamentFormatDateRange(opts.startDate, opts.endDate);
  const feeDisplay = tournamentFormatMoney(opts.entryFeeCents);
  const displayCode = tournamentFormatDisplayCode(opts.joinCode);
  const inviterLine = opts.hostInviterName
    ? `${opts.hostInviterName} at ${opts.hostOrgName}`
    : opts.hostOrgName;

  const lines: string[] = [];
  lines.push("⚡ TOURNAMENT CHALLENGE");
  lines.push("");
  lines.push(opts.recipientFirstName ? `Hey ${opts.recipientFirstName},` : "Hey coach,");
  lines.push("");
  lines.push(`Your team is challenged. ${inviterLine} is hosting a tournament on earn²keep:`);
  lines.push("");
  lines.push(`TOURNAMENT: ${opts.tournamentName}`);
  if (opts.tournamentDescription) {
    lines.push(`           "${opts.tournamentDescription}"`);
  }
  lines.push(`DATES:      ${dateRange}`);
  lines.push(`ENTRY FEE:  ${feeDisplay}${opts.entryFeeCents > 0 ? " / team" : ""}`);
  lines.push(
    `WINNER TAKES THE POT: ${tournamentFormatMoney(opts.currentPotCents)} (${opts.teamsRegistered} ${opts.teamsRegistered === 1 ? "team" : "teams"} registered, pot grows by ${feeDisplay} per join).`
  );
  lines.push("");
  lines.push("HEADS UP — STRICT SCORING:");
  lines.push("Your team only earns the points for a challenge when every player on");
  lines.push("your roster completes it. The whole team is the unit of competition.");
  lines.push("");
  lines.push(`See full details and decide if you're in: ${opts.tournamentUrl}`);
  lines.push("");
  lines.push("============================================");
  lines.push(`  TOURNAMENT JOIN CODE:  ${displayCode}`);
  lines.push("  Enter at earn2keep.com/join-tournament");
  lines.push("============================================");
  lines.push("");
  lines.push("--");
  lines.push("earn²keep — Earn it. Keep it.");
  return lines.join("\n");
}

// =============================================================================
// L37 — Tournament tiebreaker notification email
// =============================================================================
// Sent when the sudden-death tiebreaker transitions state:
//   - "activated" → tied teams' coaches: tiebreaker is now live, X-hour window
//   - "resolved" → tied teams' coaches: winner announced (automated)
//   - "host_decision_needed" → host only: window closed, you need to pick
//   - "host_decided" → tied teams' coaches: winner announced (host-picked)
//
// Single email function with a `variant` parameter that picks the right
// copy. Same Resend integration as the L33 invitation email.
// =============================================================================

export type TiebreakerEmailVariant =
  | "activated"
  | "resolved"
  | "host_decision_needed"
  | "host_decided";

export interface TiebreakerNotificationEmailOptions {
  to: string;
  recipientFirstName: string | null;
  variant: TiebreakerEmailVariant;
  tournamentName: string;
  hostOrgName: string;
  tournamentUrl: string;
  // Variant-specific extras (any may be null depending on variant):
  tiebreakerChallengeName: string | null;
  tiebreakerChallengeTarget: string | null;  // e.g. "100 burpees"
  deadlineIso: string | null;                // for "activated"
  windowHours: number | null;                // for "activated"
  winnerTeamName: string | null;             // for "resolved"/"host_decided"
}

export async function sendTiebreakerNotificationEmail(
  opts: TiebreakerNotificationEmailOptions
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set on the server." };
  }

  const subject = buildTiebreakerSubject(opts);
  const html = buildTiebreakerHtml(opts);
  const text = buildTiebreakerText(opts);

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
      const errText = await response.text();
      return { ok: false, error: `Resend ${response.status}: ${errText}` };
    }

    const data = (await response.json()) as { id?: string };
    return { ok: true, resendId: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildTiebreakerSubject(opts: TiebreakerNotificationEmailOptions): string {
  switch (opts.variant) {
    case "activated":
      return `⚡ TIEBREAKER ACTIVATED: ${opts.tournamentName}`;
    case "resolved":
      return `🏆 ${opts.tournamentName} tiebreaker won by ${opts.winnerTeamName ?? "a team"}`;
    case "host_decision_needed":
      return `⚖️ ${opts.tournamentName}: tiebreaker needs your decision`;
    case "host_decided":
      return `🏆 ${opts.tournamentName} tiebreaker decided`;
  }
}

function formatDeadline(iso: string | null): string {
  if (!iso) return "the deadline";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function buildTiebreakerHtml(opts: TiebreakerNotificationEmailOptions): string {
  const greeting = opts.recipientFirstName
    ? `Hey ${escape(opts.recipientFirstName)},`
    : `Hey coach,`;

  const heroLine = (() => {
    switch (opts.variant) {
      case "activated":
        return `Your team is tied for a prize position in <strong style="color:#ffffff;">${escape(opts.tournamentName)}</strong>. Sudden-death tiebreaker is live.`;
      case "resolved":
        return `The sudden-death tiebreaker in <strong style="color:#ffffff;">${escape(opts.tournamentName)}</strong> is decided.`;
      case "host_decision_needed":
        return `The sudden-death window closed without any team hitting 100% completion. You need to pick the winner.`;
      case "host_decided":
        return `The host has decided the sudden-death tiebreaker in <strong style="color:#ffffff;">${escape(opts.tournamentName)}</strong>.`;
    }
  })();

  const bodyBlock = (() => {
    switch (opts.variant) {
      case "activated": {
        const tbName = opts.tiebreakerChallengeName ?? "the pre-declared tiebreaker challenge";
        const tbTarget = opts.tiebreakerChallengeTarget
          ? ` (target: ${escape(opts.tiebreakerChallengeTarget)})`
          : "";
        const windowDesc = opts.windowHours
          ? `${opts.windowHours}-hour window`
          : "submission window";
        return `
          <div style="background-color:#0a2f37;padding:16px 18px;border-radius:8px;border-left:3px solid #ff755f;margin:16px 0;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;color:#ff755f;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:4px;">
              ⚡ TIEBREAKER CHALLENGE
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:15px;color:#f7fbfb;font-weight:700;">
              ${escape(tbName)}${tbTarget}
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:13px;color:#cfe7e7;margin-top:8px;">
              ${windowDesc} · Deadline: <strong>${escape(formatDeadline(opts.deadlineIso))}</strong>
            </div>
          </div>
          <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#cfe7e7;margin:12px 0;">
            <strong style="color:#ffffff;">Strict scoring still applies.</strong> Every player on your roster needs to complete the tiebreaker challenge before the deadline. The team with the earliest 100%-completion timestamp wins.
          </p>
          <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#cfe7e7;margin:12px 0;">
            Get your roster moving. Every player needs to record their video before time runs out.
          </p>
        `;
      }
      case "resolved": {
        const winner = opts.winnerTeamName
          ? `<strong style="color:#6EE7B7;">${escape(opts.winnerTeamName)}</strong>`
          : "A team";
        return `
          <div style="background-color:#0a2f37;padding:16px 18px;border-radius:8px;border-left:3px solid #6EE7B7;margin:16px 0;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;color:#6EE7B7;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:4px;">
              🏆 WINNER
            </div>
            <div style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:22px;color:#f7fbfb;font-weight:800;">
              ${winner}
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:13px;color:#cfe7e7;margin-top:8px;">
              Earliest 100%-completion timestamp on the tiebreaker challenge.
            </div>
          </div>
          <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#cfe7e7;margin:12px 0;">
            Other tied teams take the lower prize position. Prizes get distributed off-platform by the host.
          </p>
        `;
      }
      case "host_decision_needed":
        return `
          <div style="background-color:#0a2f37;padding:16px 18px;border-radius:8px;border-left:3px solid #ffd000;margin:16px 0;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;color:#ffd000;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:4px;">
              ⚖️ WHAT HAPPENED
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;color:#cfe7e7;line-height:1.6;">
              No team hit 100% completion on the tiebreaker challenge within the window. Per the v5 rules, this falls through to your discretion.
            </div>
          </div>
          <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#cfe7e7;margin:12px 0;">
            Open the tournament page, review the tied teams, and click <strong>Declare winner</strong>. You can pick using any criteria — partial completion, sportsmanship, a coin flip, whatever fits.
          </p>
        `;
      case "host_decided": {
        const winner = opts.winnerTeamName
          ? `<strong style="color:#35d5df;">${escape(opts.winnerTeamName)}</strong>`
          : "A team";
        return `
          <div style="background-color:#0a2f37;padding:16px 18px;border-radius:8px;border-left:3px solid #35d5df;margin:16px 0;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:800;color:#35d5df;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:4px;">
              🏆 HOST DECISION
            </div>
            <div style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:22px;color:#f7fbfb;font-weight:800;">
              ${winner}
            </div>
          </div>
          <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#cfe7e7;margin:12px 0;">
            No team hit 100% on the tiebreaker within the window, so the host picked using their discretion. Other tied teams take the lower prize position.
          </p>
        `;
      }
    }
  })();

  const ctaLabel = opts.variant === "activated"
    ? "Go submit →"
    : opts.variant === "host_decision_needed"
      ? "Open tournament to decide →"
      : "View tournament →";

  const ctaButton = `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escape(opts.tournamentUrl)}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="100%" stroke="f" fillcolor="#ff755f">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.3px;">
        ${ctaLabel}
      </center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${escape(opts.tournamentUrl)}"
       style="background-color:#ff755f;color:#ffffff;display:inline-block;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.3px;line-height:50px;text-align:center;text-decoration:none;width:280px;border-radius:999px;-webkit-text-size-adjust:none;mso-hide:all;">
      ${ctaLabel}
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
<title>${escape(buildTiebreakerSubject(opts))}</title>
</head>
<body bgcolor="#041418" style="margin:0;padding:0;background-color:#041418;color:#f7fbfb;-webkit-font-smoothing:antialiased;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#041418" style="background-color:#041418;">
  <tr>
    <td align="center" bgcolor="#041418" style="background-color:#041418;padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#06242b" style="max-width:600px;width:100%;background-color:#06242b;border-radius:12px;">
        <tr>
          <td bgcolor="#ff755f" style="background-color:#ff755f;padding:24px 28px;border-radius:12px 12px 0 0;font-family:Arial,sans-serif;">
            <div style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.6px;line-height:1;mso-line-height-rule:exactly;">
              earn<sup style="font-size:14px;vertical-align:super;">2</sup>keep
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:1.6px;text-transform:uppercase;margin-top:6px;">
              ${opts.variant === "activated" ? "⚡ Tiebreaker activated" : opts.variant === "host_decision_needed" ? "⚖️ Decision needed" : "🏆 Tiebreaker resolved"}
            </div>
          </td>
        </tr>
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:32px 32px 12px 32px;font-family:Arial,sans-serif;">
            <h1 style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#f7fbfb;letter-spacing:-0.4px;margin:0 0 12px 0;line-height:1.25;mso-line-height-rule:exactly;">
              ${greeting}
            </h1>
            <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#cfe7e7;margin:0;">
              ${heroLine}
            </p>
          </td>
        </tr>
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:0 32px;font-family:Arial,sans-serif;">
            ${bodyBlock}
          </td>
        </tr>
        <tr>
          <td bgcolor="#06242b" align="center" style="background-color:#06242b;padding:8px 32px 24px 32px;">
            ${ctaButton}
          </td>
        </tr>
        <tr>
          <td bgcolor="#041418" style="background-color:#041418;padding:20px 32px;border-radius:0 0 12px 12px;font-family:Arial,sans-serif;text-align:center;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#6b8788;line-height:1.6;">
              Hosted by ${escape(opts.hostOrgName)}
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#6b8788;margin-top:8px;">
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

function buildTiebreakerText(opts: TiebreakerNotificationEmailOptions): string {
  const lines: string[] = [];
  switch (opts.variant) {
    case "activated":
      lines.push("⚡ TIEBREAKER ACTIVATED");
      lines.push("");
      lines.push(opts.recipientFirstName ? `Hey ${opts.recipientFirstName},` : "Hey coach,");
      lines.push("");
      lines.push(`Your team is tied for a prize position in ${opts.tournamentName}.`);
      lines.push("Sudden-death tiebreaker is live.");
      lines.push("");
      if (opts.tiebreakerChallengeName) {
        lines.push(`Challenge: ${opts.tiebreakerChallengeName}${opts.tiebreakerChallengeTarget ? ` (${opts.tiebreakerChallengeTarget})` : ""}`);
      }
      if (opts.deadlineIso) {
        lines.push(`Deadline: ${formatDeadline(opts.deadlineIso)}`);
      }
      lines.push("");
      lines.push("STRICT SCORING STILL APPLIES.");
      lines.push("Every player on your roster needs to complete the tiebreaker.");
      lines.push("Earliest 100%-completion timestamp wins.");
      break;
    case "resolved":
      lines.push("🏆 TIEBREAKER RESOLVED");
      lines.push("");
      lines.push(`${opts.winnerTeamName ?? "A team"} won the ${opts.tournamentName} tiebreaker.`);
      lines.push("Earliest 100%-completion timestamp on the tiebreaker challenge.");
      lines.push("");
      lines.push("Other tied teams take the lower prize position.");
      break;
    case "host_decision_needed":
      lines.push("⚖️ TIEBREAKER NEEDS YOUR DECISION");
      lines.push("");
      lines.push(`The sudden-death window closed without any team hitting 100% in ${opts.tournamentName}.`);
      lines.push("Open the tournament page and pick the winner using your discretion.");
      break;
    case "host_decided":
      lines.push("🏆 TIEBREAKER DECIDED");
      lines.push("");
      lines.push(`Host picked ${opts.winnerTeamName ?? "a team"} as the winner of the ${opts.tournamentName} tiebreaker.`);
      break;
  }
  lines.push("");
  lines.push(`Tournament: ${opts.tournamentUrl}`);
  lines.push("");
  lines.push("--");
  lines.push("earn²keep — Earn it. Keep it.");
  return lines.join("\n");
}

// =============================================================================
// L39 — Coach invitation email
// =============================================================================
// Sent when an org owner invites a coach to join their organization. Tone
// is warm + collegial — this is "hey, come coach with us" not the more
// competitive Tournament invitation. Single CTA goes to the accept page.
// =============================================================================

export interface CoachInvitationEmailOptions {
  to: string;
  recipientFirstName: string | null;
  inviterName: string | null;
  orgName: string;
  acceptUrl: string;
}

export async function sendCoachInvitationEmail(
  opts: CoachInvitationEmailOptions
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set on the server." };
  }

  const subject = `🏟️ ${opts.inviterName || "A coach"} invited you to join ${opts.orgName} on earn²keep`;
  const html = buildCoachInvitationHtml(opts);
  const text = buildCoachInvitationText(opts, subject);

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
      const errText = await response.text();
      return { ok: false, error: `Resend ${response.status}: ${errText}` };
    }

    const data = (await response.json()) as { id?: string };
    return { ok: true, resendId: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildCoachInvitationHtml(opts: CoachInvitationEmailOptions): string {
  const greeting = opts.recipientFirstName
    ? `Hey ${escape(opts.recipientFirstName)},`
    : `Hey coach,`;

  const inviterPhrase = opts.inviterName
    ? `<strong style="color:#ffffff;">${escape(opts.inviterName)}</strong>`
    : `Someone`;

  const ctaButton = `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escape(opts.acceptUrl)}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="100%" stroke="f" fillcolor="#ff755f">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:0.3px;">
        Accept invitation →
      </center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${escape(opts.acceptUrl)}"
       style="background-color:#ff755f;color:#ffffff;display:inline-block;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.3px;line-height:50px;text-align:center;text-decoration:none;width:300px;border-radius:999px;-webkit-text-size-adjust:none;mso-hide:all;">
      Accept invitation →
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
<title>Coach invitation</title>
</head>
<body bgcolor="#041418" style="margin:0;padding:0;background-color:#041418;color:#f7fbfb;-webkit-font-smoothing:antialiased;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#041418" style="background-color:#041418;">
  <tr>
    <td align="center" bgcolor="#041418" style="background-color:#041418;padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#06242b" style="max-width:600px;width:100%;background-color:#06242b;border-radius:12px;">
        <tr>
          <td bgcolor="#ff755f" style="background-color:#ff755f;padding:24px 28px;border-radius:12px 12px 0 0;font-family:Arial,sans-serif;">
            <div style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.6px;line-height:1;mso-line-height-rule:exactly;">
              earn<sup style="font-size:14px;vertical-align:super;">2</sup>keep
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:1.6px;text-transform:uppercase;margin-top:6px;">
              🏟️ Coach Invitation
            </div>
          </td>
        </tr>
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:32px 32px 12px 32px;font-family:Arial,sans-serif;">
            <h1 style="font-family:'Sora','Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#f7fbfb;letter-spacing:-0.4px;margin:0 0 12px 0;line-height:1.25;mso-line-height-rule:exactly;">
              ${greeting}
            </h1>
            <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#cfe7e7;margin:0 0 12px 0;">
              ${inviterPhrase} invited you to be a coach at <strong style="color:#ffffff;">${escape(opts.orgName)}</strong> on earn²keep.
            </p>
            <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.6;color:#cfe7e7;margin:0;">
              Once you accept, you&rsquo;ll be able to create teams under this org, manage their rosters, and join the organization&rsquo;s Camps and Tournaments.
            </p>
          </td>
        </tr>
        <tr>
          <td bgcolor="#06242b" align="center" style="background-color:#06242b;padding:24px 32px;">
            ${ctaButton}
          </td>
        </tr>
        <tr>
          <td bgcolor="#06242b" style="background-color:#06242b;padding:0 32px 24px 32px;font-family:Arial,sans-serif;">
            <div style="padding:14px 16px;background-color:#0a2f37;border-radius:8px;border-left:3px solid #35d5df;">
              <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:10px;font-weight:800;color:#35d5df;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:4px;">
                What is earn²keep?
              </div>
              <p style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#cfe7e7;margin:0;">
                A fundraising platform built around effort, not asks. Players earn donations by completing real verified challenges. Coaches verify submissions. Supporters give based on what kids actually do.
              </p>
            </div>
          </td>
        </tr>
        <tr>
          <td bgcolor="#041418" style="background-color:#041418;padding:20px 32px;border-radius:0 0 12px 12px;font-family:Arial,sans-serif;text-align:center;">
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#6b8788;line-height:1.6;">
              If you weren&rsquo;t expecting this, it&rsquo;s safe to ignore — no account is created until you click the button above.
            </div>
            <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:11px;color:#6b8788;margin-top:8px;">
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

function buildCoachInvitationText(opts: CoachInvitationEmailOptions, subject: string): string {
  const lines: string[] = [];
  lines.push("🏟️ COACH INVITATION");
  lines.push("");
  lines.push(opts.recipientFirstName ? `Hey ${opts.recipientFirstName},` : "Hey coach,");
  lines.push("");
  lines.push(
    `${opts.inviterName || "Someone"} invited you to be a coach at ${opts.orgName} on earn²keep.`
  );
  lines.push("");
  lines.push("Once you accept, you can create teams under this org and join the organization's Camps and Tournaments.");
  lines.push("");
  lines.push(`Accept here: ${opts.acceptUrl}`);
  lines.push("");
  lines.push("If you weren't expecting this email, it's safe to ignore.");
  lines.push("");
  lines.push("--");
  lines.push("earn²keep — Earn it. Keep it.");
  return lines.join("\n");
}

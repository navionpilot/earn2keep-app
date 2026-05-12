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
  eventType: "mini-camp" | "camp" | "tournament" | null;
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
    (eventType === "camp" || eventType === "mini-camp")
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
    (eventType === "camp" || eventType === "mini-camp")
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

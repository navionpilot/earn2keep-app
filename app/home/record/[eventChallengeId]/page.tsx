// =============================================================================
// app/home/record/[eventChallengeId]/page.tsx — Recording page (Slice 5.4)
// =============================================================================
// Server component. Validates that:
//   - User is signed in (middleware also enforces /home protection)
//   - User is linked to a player record
//   - The event_challenge belongs to an event that this player's team is
//     participating in
//   - The event is active (no point recording for a draft / completed event)
// Then renders RecordingForm with the necessary props.
//
// Edge cases get rendered as friendly error states (not crashes).
// =============================================================================

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import PlayerTopBar from "@/components/PlayerTopBar";
import { getUnreadNotificationCount } from "@/lib/notifications";
import RecordingForm from "@/components/RecordingForm";
import {
  getRecordingTemplate,
  GENERAL_RECORDING_TIPS,
} from "@/lib/recordingTemplates";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  avatar_url: string | null;
  team_id: string;
}

interface ChallengeRel {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  // Slice 5.7.4: extra fields surfaced on the recording page so players
  // know exactly how to set up their phone + what counts.
  setup_template_key: string | null;
  recording_instructions: string | null;
  reference_photo_url: string | null;
  reference_photo_caption: string | null;
  // Slice 8.3: AI verification strategy assigned to this challenge.
  // Passed to RecordingForm so the client can decide whether to extract
  // frames + fire the AI call.
  ai_verification_strategy: string | null;
}

interface EventRel {
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | string | null;
  start_date: string | null;
  end_date: string | null;
}

interface EventChallengeRow {
  id: string;
  event_id: string;
  day_index: number | null;
  rep_target: number | null;
  points_value: number | null;
  notes: string | null;
  challenges: ChallengeRel | ChallengeRel[] | null;
  events: EventRel | EventRel[] | null;
}

function single<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

interface PriorSubmission {
  id: string;
  status: string;
  reps_claimed: number | null;
  reps_approved: number | null;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  // Slice 8.9 — surface AI verification state to the player so they get
  // faster feedback than waiting for the coach. Null = AI didn't run for
  // this challenge type.
  ai_status: "pending" | "completed" | "failed" | "skipped" | null;
  ai_rep_count: number | null;
  ai_confidence: "high" | "medium" | "low" | "unable_to_verify" | null;
  ai_strategy_used: string | null;
  approved_by_ai: boolean;
}

export default async function RecordPage({
  params,
}: {
  params: Promise<{ eventChallengeId: string }>;
}) {
  const { eventChallengeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Look up player record for this auth user.
  const { data: playerRow } = await supabase
    .from("players")
    .select("id, first_name, last_name, avatar_url, team_id")
    .eq("linked_user_id", user.id)
    .maybeSingle();

  if (!playerRow) {
    // Not a player — bounce them home (which will route to /dashboard
    // for coach accounts).
    redirect("/dashboard");
  }
  const player = playerRow as PlayerRow;

  // 2. Look up the event challenge with its event metadata.
  const { data: ecData } = await supabase
    .from("event_challenges")
    .select(
      `id, event_id, day_index, rep_target, points_value, notes,
       challenges(id, name, description, category, unit, setup_template_key, recording_instructions, reference_photo_url, reference_photo_caption, ai_verification_strategy),
       events(id, name, status, start_date, end_date)`
    )
    .eq("id", eventChallengeId)
    .maybeSingle();

  if (!ecData) {
    notFound();
  }
  const ec = ecData as EventChallengeRow;
  const challenge = single(ec.challenges);
  const event = single(ec.events);

  if (!challenge || !event) {
    notFound();
  }

  // 3. Verify the event is one this player's team is participating in.
  //    (Defense in depth — the URL is opaque, but we shouldn't trust it.)
  const { data: partRow } = await supabase
    .from("event_participants")
    .select("event_id")
    .eq("event_id", event.id)
    .eq("team_id", player.team_id)
    .maybeSingle();

  if (!partRow) {
    // Player's team isn't in this event — refuse politely.
    return (
      <ErrorPage
        playerFirstName={player.first_name}
        playerLastName={player.last_name}
        title="That challenge isn't yours"
        text="This challenge belongs to an event your team isn't competing in. Head back home to see today's challenges."
      />
    );
  }

  // 4. Block submission unless the event is active.
  if (event.status !== "active") {
    let title: string;
    let text: string;
    if (event.status === "draft") {
      title = "Event hasn't started yet";
      text =
        "Your coach hasn't activated this event yet. Once it goes live, you'll be able to record and submit challenges.";
    } else if (event.status === "completed") {
      title = "Event has ended";
      text =
        "This event is finished — submissions are closed. Check back home for what's coming next.";
    } else {
      title = "Submissions are paused";
      text =
        "Your coach has paused this event. Hold tight — recording will reopen soon.";
    }
    return (
      <ErrorPage playerFirstName={player.first_name} playerLastName={player.last_name} title={title} text={text} />
    );
  }

  // 5. Pull prior submissions for this event_challenge by this player.
  //    We show the most recent one as a status pill above the form so
  //    the player knows whether they're already pending review or got
  //    rejected and need to retry.
  //    Slice 8.9 — include AI fields so the pill can show what AI saw
  //    even before the coach reviews.
  const { data: priorSubs } = await supabase
    .from("submissions")
    .select(
      "id, status, reps_claimed, reps_approved, rejection_reason, submitted_at, reviewed_at, ai_status, ai_rep_count, ai_confidence, ai_strategy_used, approved_by_ai"
    )
    .eq("player_id", player.id)
    .eq("event_challenge_id", eventChallengeId)
    .order("submitted_at", { ascending: false })
    .limit(1);

  const lastSub = (priorSubs?.[0] || null) as PriorSubmission | null;

  // Slice 5.9: unread notification count for the bell badge.
  const unreadCount = await getUnreadNotificationCount(supabase);

  // ---------- Render ----------
  return (
    <>
      <PlayerTopBar displayName={player.first_name} lastName={player.last_name} avatarUrl={player.avatar_url ?? null} unreadCount={unreadCount} />
      <main className="recording-page-wrap">
        <Link href="/home" className="recording-back">
          ← Back to home
        </Link>

        <div className="recording-challenge-header">
          <div className="recording-eyebrow">
            CHALLENGE · {event.name}
          </div>
          <h1 className="recording-title">{challenge.name}</h1>
          <div className="recording-meta">
            {ec.rep_target != null && (
              <span>
                Target: <strong>{ec.rep_target}</strong>
                {challenge.unit ? ` ${challenge.unit}` : ""}
              </span>
            )}
            {ec.points_value != null && (
              <span>
                · <strong>{ec.points_value}</strong> pt
                {ec.points_value === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {challenge.description && (
            <p className="recording-description">{challenge.description}</p>
          )}
          {ec.notes && (
            <div className="recording-notes">
              <strong>Note from coach:</strong> {ec.notes}
            </div>
          )}
        </div>

        {/* Slice 5.7.4: Instructions panel — tells the player exactly
            what to do, how to set up their phone, what counts. Renders
            up to 4 sub-sections, in this order:
              1. Phone setup template (if challenge has setup_template_key)
              2. Coach's recording_instructions (if set)
              3. Reference photo (if set)
              4. Always-on general tips (collapsible)
            Even if the challenge is missing custom content, the player
            still sees something useful via the general tips block. */}
        <RecordingInstructions
          templateKey={challenge.setup_template_key}
          recordingInstructions={challenge.recording_instructions}
          referencePhotoUrl={challenge.reference_photo_url}
          referencePhotoCaption={challenge.reference_photo_caption}
        />

        {/* If the player has a prior submission for THIS challenge, show
            its status above the form so they have context. They can
            still submit a new attempt below. */}
        {lastSub && <PriorSubmissionPill sub={lastSub} unit={challenge.unit} />}

        <RecordingForm
          playerId={player.id}
          eventId={event.id}
          eventChallengeId={ec.id}
          challengeName={challenge.name}
          repTarget={ec.rep_target}
          challengeUnit={challenge.unit}
          pointsValue={ec.points_value}
          aiVerificationStrategy={
            (challenge.ai_verification_strategy as
              | "rep_count"
              | "time_hold"
              | "photo_completion"
              | "performance"
              | "audio_match"
              | "none"
              | null) ?? null
          }
        />
      </main>
    </>
  );
}

// ---------- Helpers ----------

// Slice 5.7.4 — Renders the full "how to do this challenge" panel.
// Uses lib/recordingTemplates for setup-template content; falls back
// gracefully if the challenge has no template / instructions / photo
// set (general tips always render).
function RecordingInstructions({
  templateKey,
  recordingInstructions,
  referencePhotoUrl,
  referencePhotoCaption,
}: {
  templateKey: string | null;
  recordingInstructions: string | null;
  referencePhotoUrl: string | null;
  referencePhotoCaption: string | null;
}) {
  const template = getRecordingTemplate(templateKey);

  return (
    <div className="recording-instructions">
      {/* Setup template — only renders if the challenge has one */}
      {template && (
        <section className="recording-instructions-panel">
          <header className="recording-instructions-head">
            <span className="recording-instructions-icon" aria-hidden="true">
              {template.icon}
            </span>
            <div>
              <div className="recording-instructions-eyebrow">
                PHONE SETUP
              </div>
              <h2 className="recording-instructions-title">
                {template.label}
              </h2>
            </div>
          </header>
          <p className="recording-instructions-desc">{template.description}</p>
          <ol className="recording-instructions-list">
            {template.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {template.whatCounts && template.whatCounts.length > 0 && (
            <div className="recording-instructions-counts">
              <strong>What counts:</strong>
              <ul>
                {template.whatCounts.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Coach's specific recording_instructions text — renders below
          the template panel so it reads as "extra detail from coach". */}
      {recordingInstructions && (
        <section className="recording-instructions-panel recording-instructions-panel-coach">
          <header className="recording-instructions-head">
            <span className="recording-instructions-icon" aria-hidden="true">
              📋
            </span>
            <div>
              <div className="recording-instructions-eyebrow">
                COACH&apos;S INSTRUCTIONS
              </div>
              <h2 className="recording-instructions-title">
                Specific to this challenge
              </h2>
            </div>
          </header>
          <p className="recording-instructions-desc recording-instructions-desc-block">
            {recordingInstructions}
          </p>
        </section>
      )}

      {/* Reference photo from coach — visual example. */}
      {referencePhotoUrl && (
        <section className="recording-instructions-panel">
          <header className="recording-instructions-head">
            <span className="recording-instructions-icon" aria-hidden="true">
              🖼
            </span>
            <div>
              <div className="recording-instructions-eyebrow">
                EXAMPLE
              </div>
              <h2 className="recording-instructions-title">
                What it should look like
              </h2>
            </div>
          </header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={referencePhotoUrl}
            alt={referencePhotoCaption ?? "Reference example"}
            className="recording-instructions-photo"
          />
          {referencePhotoCaption && (
            <p className="recording-instructions-photo-caption">
              {referencePhotoCaption}
            </p>
          )}
        </section>
      )}

      {/* General tips — always renders. Collapsed by default with
          <details> so it doesn't dominate the page when the challenge
          already has a template. */}
      <details className="recording-instructions-panel recording-instructions-tips">
        <summary>
          <span className="recording-instructions-icon" aria-hidden="true">
            💡
          </span>
          <span className="recording-instructions-tips-summary-text">
            <span className="recording-instructions-eyebrow">
              GENERAL TIPS
            </span>
            <span className="recording-instructions-tips-toggle-hint">
              tap to expand
            </span>
          </span>
        </summary>
        <ul className="recording-instructions-list recording-instructions-tips-list">
          {GENERAL_RECORDING_TIPS.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// A small panel that summarizes the player's most recent submission for
// this challenge — what the status is, what reps they claimed/got
// approved for, and any rejection reason. Doesn't block re-submission.
function PriorSubmissionPill({
  sub,
  unit,
}: {
  sub: PriorSubmission;
  unit: string | null;
}) {
  let pillClass = "recording-prior-pill";
  let pillLabel = sub.status.toUpperCase();
  let intro = "Your last submission for this challenge:";

  if (sub.status === "pending") {
    pillClass += " recording-prior-pill-pending";
    pillLabel = "⏳ PENDING REVIEW";
  } else if (sub.status === "approved") {
    pillClass += " recording-prior-pill-approved";
    pillLabel = sub.approved_by_ai ? "✓ APPROVED BY AI" : "✓ APPROVED";
    intro = sub.approved_by_ai
      ? "AI auto-approved this submission:"
      : "You already nailed this challenge:";
  } else if (sub.status === "rejected") {
    pillClass += " recording-prior-pill-rejected";
    pillLabel = "❌ REJECTED";
    intro = "Your last attempt was rejected. Submit a new one below:";
  }

  // Slice 8.9 — sub-line showing AI verification state. Only renders for
  // pending submissions where AI ran. We don't show AI info on approved
  // submissions (the approval is what matters at that point) or on
  // rejected submissions (the rejection reason is what matters).
  let aiNote: React.ReactNode = null;
  if (sub.status === "pending" && sub.ai_status === "completed" && sub.ai_rep_count !== null) {
    const unitTxt = unit ? ` ${unit}` : "";
    const isTimeHold = sub.ai_strategy_used === "time_hold";
    aiNote = (
      <p className="recording-prior-ai-note">
        <span className="recording-prior-ai-icon" aria-hidden="true">🤖</span>{" "}
        {isTimeHold ? (
          <>AI verified <strong>{sub.ai_rep_count}{unitTxt}</strong> of activity</>
        ) : (
          <>AI counted <strong>{sub.ai_rep_count}{unitTxt}</strong></>
        )}
        {sub.ai_confidence && sub.ai_confidence !== "unable_to_verify" && (
          <span className={`recording-prior-ai-confidence ai-confidence-${sub.ai_confidence}`}>
            {sub.ai_confidence} confidence
          </span>
        )}
        <span className="recording-prior-ai-hint">
          — your coach will give the final word
        </span>
      </p>
    );
  } else if (sub.status === "pending" && sub.ai_status === "pending") {
    aiNote = (
      <p className="recording-prior-ai-note">
        <span className="recording-prior-ai-icon" aria-hidden="true">🤖</span>{" "}
        AI is reviewing your video…
      </p>
    );
  }
  // ai_status of "failed" or "skipped" → no note. Don't worry the player.

  return (
    <div className="recording-prior">
      <p className="recording-prior-intro">{intro}</p>
      <div className="recording-prior-row">
        <span className={pillClass}>{pillLabel}</span>
        {sub.status === "approved" && sub.reps_approved != null && (
          <span className="recording-prior-detail">
            {sub.reps_approved} approved
          </span>
        )}
        {sub.status === "pending" && sub.reps_claimed != null && (
          <span className="recording-prior-detail">
            Claimed {sub.reps_claimed}
          </span>
        )}
      </div>
      {aiNote}
      {sub.status === "rejected" && sub.rejection_reason && (
        <p className="recording-prior-reason">
          <strong>Reason:</strong> {sub.rejection_reason}
        </p>
      )}
    </div>
  );
}

// Friendly error page — used for "not your event" + "not active" branches.
function ErrorPage({
  playerFirstName,
  playerLastName,
  title,
  text,
}: {
  playerFirstName: string;
  playerLastName?: string | null;
  title: string;
  text: string;
}) {
  return (
    <>
      <PlayerTopBar displayName={playerFirstName} lastName={playerLastName} />
      <main className="recording-page-wrap">
        <Link href="/home" className="recording-back">
          ← Back to home
        </Link>
        <div className="player-home-empty">
          <div className="player-home-empty-icon">🛑</div>
          <h2 className="player-home-empty-title">{title}</h2>
          <p className="player-home-empty-text">{text}</p>
          <Link
            href="/home"
            className="btn-primary-link"
            style={{ marginTop: "16px", display: "inline-block" }}
          >
            Go home →
          </Link>
        </div>
      </main>
    </>
  );
}

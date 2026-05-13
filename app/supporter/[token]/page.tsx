import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import SupporterComingSoonButton from "./SupporterComingSoonButton";

// Open Graph metadata so that when a supporter link is shared via
// iMessage / WhatsApp / social, the preview shows the player's name
// instead of a generic page title.
export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_public_supporter_view", {
      token_input: token,
    });
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { title: "Supporter a player — earn²keep" };
    }
    const playerName = row.player_last_initial
      ? `${row.player_first_name} ${row.player_last_initial}`
      : row.player_first_name;
    const isCamp = (row.event_type === "camp" || row.event_type === "camp");
    const title = isCamp
      ? `Help ${playerName} hit their goal — earn²keep`
      : `Cover ${playerName}'s spot — earn²keep`;
    const description = isCamp
      ? `${playerName} is competing with the ${row.team_name} from ${row.organization_name}. Help them earn it. Help them keep it.`
      : `${playerName} is registering for ${row.event_name} with the ${row.team_name}. Help them earn it. Help them keep it.`;
    return {
      title,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return { title: "Supporter a player — earn²keep" };
  }
}

const formatMoney = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const formatDateRange = (start: string, end: string) => {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sStr = s.toLocaleDateString("en-US", opts);
  const eStr = e.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  if (sameMonth) {
    return `${s.toLocaleDateString("en-US", { month: "short" })} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  if (sameYear) {
    return `${sStr} – ${eStr}`;
  }
  return `${s.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${eStr}`;
};

type SupporterView = {
  player_first_name: string;
  player_last_initial: string;
  team_name: string;
  team_sport: string | null;
  team_age_group: string | null;
  event_name: string;
  event_type: string;
  event_start_date: string;
  event_end_date: string;
  event_status: string;
  event_goal_amount: number | null;
  organization_name: string;
};

export default async function SupporterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_supporter_view", {
    token_input: token,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    notFound();
  }

  const row: SupporterView = Array.isArray(data) ? data[0] : data;

  // Slice 5.5: pull the player extras (avatar, bio, pronouns) from the
  // new sibling RPC. If the RPC returns null (older supporter links from
  // before 5.5 deploy still work fine — bucket + columns may exist but
  // this player just hasn't filled out a profile yet), we fall back to
  // initials + no-bio rendering.
  const { data: extrasData } = await supabase.rpc(
    "get_public_supporter_player_extras",
    { token_input: token }
  );
  const extras = (extrasData || {}) as {
    avatar_url?: string | null;
    bio?: string | null;
    pronouns?: string | null;
  };

  // Slice 5.9.3: pull event prize fields from the new sibling RPC. If
  // the RPC isn't deployed yet, prizesData will be null and the page
  // gracefully omits the prizes section.
  const { data: prizesData } = await supabase.rpc(
    "get_public_supporter_event_prizes",
    { token_input: token }
  );
  const prizes = (prizesData || {}) as {
    prize_count?: number | null;
    first_place_prize?: string | null;
    first_place_amount?: number | null;
    second_place_prize?: string | null;
    second_place_amount?: number | null;
    third_place_prize?: string | null;
    third_place_amount?: number | null;
  };
  const hasFirst = !!(prizes.first_place_prize || prizes.first_place_amount);
  const hasSecond = !!(prizes.second_place_prize || prizes.second_place_amount);
  const hasThird = !!(prizes.third_place_prize || prizes.third_place_amount);
  const hasAnyPrize = hasFirst || hasSecond || hasThird;

  const isCamp = (row.event_type === "camp" || row.event_type === "camp");
  const playerName = row.player_last_initial
    ? `${row.player_first_name} ${row.player_last_initial}`
    : row.player_first_name;
  const goal = Number(row.event_goal_amount || 0);
  const eventDateRange = formatDateRange(row.event_start_date, row.event_end_date);

  // Initials for the avatar placeholder if no photo yet.
  const avatarInitials = `${row.player_first_name[0] ?? "?"}${
    row.player_last_initial?.[0] ?? ""
  }`.toUpperCase();

  // Slice 5.9.2: compute event length in days for the explainer line
  // ("they'll complete challenges over X days"). Inclusive count.
  const eventStart = new Date(row.event_start_date + "T12:00:00");
  const eventEnd = new Date(row.event_end_date + "T12:00:00");
  const totalDays = Math.max(
    1,
    Math.round((eventEnd.getTime() - eventStart.getTime()) / 86_400_000) + 1
  );

  // Slice 5.9.5: build a polite team label for the headline.
  // If the coach already named the team something ending in "Team",
  // don't double it up ("Hawks Team Team").
  const teamLabel = /\bteam\s*$/i.test(row.team_name)
    ? row.team_name
    : `${row.team_name} Team`;

  return (
    <div className="supporter-page">
      {/* ============================================================
          Header — bigger logo + tagline so visitors who land cold
          immediately know they're on a real platform, not just one
          person's GoFundMe.
          ============================================================ */}
      <header className="supporter-header">
        <div className="supporter-header-inner">
          <div className="supporter-brand">
            <span className="supporter-logo">
              earn<sup className="logo-sup">2</sup>keep
            </span>
            <span className="supporter-brand-tag">EARN IT. KEEP IT.</span>
          </div>
        </div>
      </header>

      <main className="supporter-main">
        <div className="supporter-card">
          {/* "What is this?" eyebrow + first-time framing.
              The previous version led with "Help Blake hit their goal"
              which assumed the visitor already knew what earn²keep was.
              Cold visitors said "I have no idea what this is for" —
              so now we lead with the structural context. */}
          <div className="supporter-eyebrow">
            ★ {isCamp ? "FUNDRAISER" : "TOURNAMENT REGISTRATION"} ★
          </div>

          <div className="supporter-frame">
            earn²keep is a platform where participants earn their way into
            camps, tournaments, and prizes by completing daily challenges
            with video proof. Supporters back their effort.
          </div>

          {/* Player avatar + pronouns (Slice 5.5). Falls back to initials. */}
          <div className="supporter-player-avatar-wrap">
            {extras.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={extras.avatar_url}
                alt={playerName}
                className="supporter-player-avatar"
              />
            ) : (
              <div className="supporter-player-avatar supporter-player-avatar-initials">
                {avatarInitials}
              </div>
            )}
            {extras.pronouns && (
              <div className="supporter-player-pronouns">({extras.pronouns})</div>
            )}
          </div>

          {isCamp ? (
            <h1 className="supporter-headline">
              Support <span className="supporter-name">{playerName}</span> and the{" "}
              <span className="supporter-team">{teamLabel}</span>
            </h1>
          ) : (
            <h1 className="supporter-headline">
              Support <span className="supporter-name">{playerName}</span> and the{" "}
              <span className="supporter-team">{teamLabel}</span>
            </h1>
          )}

          {/* The pitch — corrected wording: money supports the team
              (not a "prize unlock"); players earn points by completing
              video-verified challenges; bonus points for raising above
              goal; top performers take home the door prizes shown below. */}
          <div className="supporter-pitch">
            {isCamp ? (
              <p>
                <strong>{playerName}</strong> is on the{" "}
                <strong>{row.team_name}</strong>
                {row.team_sport ? ` (${row.team_sport}${row.team_age_group ? `, ${row.team_age_group}` : ""})` : ""}{" "}
                from <strong>{row.organization_name}</strong>. They&apos;re competing in{" "}
                <strong>{row.event_name}</strong> — a {totalDays}-day fundraiser
                where every dollar raised supports{" "}
                <strong>{row.organization_name}</strong>.{" "}
                {row.player_first_name}&apos;s personal goal is{" "}
                <strong>${formatMoney(goal)}</strong>. Players earn points by
                completing daily video challenges, with bonus points for raising
                above their goal — and top performers take home the door prizes
                shown below.
              </p>
            ) : (
              <p>
                <strong>{playerName}</strong> is on the{" "}
                <strong>{row.team_name}</strong>
                {row.team_sport ? ` (${row.team_sport}${row.team_age_group ? `, ${row.team_age_group}` : ""})` : ""}{" "}
                from <strong>{row.organization_name}</strong>. They&apos;re registering
                for <strong>{row.event_name}</strong>. The{" "}
                <strong>${formatMoney(goal)}</strong> registration fee covers their
                spot and supports{" "}
                <strong>{row.organization_name}</strong>. Players earn points by
                competing during the event, and top performers take home the
                door prizes shown below.
              </p>
            )}
          </div>

          {/* Optional bio quote (Slice 5.5) — the player's own words. */}
          {extras.bio && (
            <blockquote className="supporter-player-bio">
              <span className="supporter-player-bio-mark">&ldquo;</span>
              {extras.bio}
              <span className="supporter-player-bio-mark">&rdquo;</span>
              <cite>— {playerName}</cite>
            </blockquote>
          )}

          {/* Event-detail strip — kept (it's useful), but now it lives
              BELOW the pitch so the explanation comes first. */}
          <div className="supporter-event-strip">
            <div className="supporter-event-block">
              <div className="supporter-event-label">Event</div>
              <div className="supporter-event-value">{row.event_name}</div>
            </div>
            <div className="supporter-event-block">
              <div className="supporter-event-label">Dates</div>
              <div className="supporter-event-value">{eventDateRange}</div>
            </div>
            <div className="supporter-event-block">
              <div className="supporter-event-label">
                {isCamp ? "Event goal" : "Reg fee"}
              </div>
              <div className="supporter-event-value supporter-event-amount">
                {goal > 0 ? `$${formatMoney(goal)}` : "—"}
              </div>
            </div>
          </div>

          {/* Slice 5.9.3: Prizes — what's actually on the line. Only
              renders when at least one place has a prize set. Each row
              shows the medal + place + dollar amount (if set) + prize
              description (gift card name or custom text). */}
          {hasAnyPrize && (
            <div className="supporter-prizes">
              <div className="supporter-prizes-title">
                What {row.player_first_name} can win
              </div>
              <div className="supporter-prizes-list">
                {hasFirst && (
                  <div className="supporter-prize-row">
                    <span className="supporter-prize-medal" aria-hidden="true">🥇</span>
                    <div className="supporter-prize-body">
                      <div className="supporter-prize-place">1st Place</div>
                      <div className="supporter-prize-text">
                        {prizes.first_place_amount && (
                          <strong>${formatMoney(Number(prizes.first_place_amount))} </strong>
                        )}
                        {prizes.first_place_prize}
                      </div>
                    </div>
                  </div>
                )}
                {hasSecond && (
                  <div className="supporter-prize-row">
                    <span className="supporter-prize-medal" aria-hidden="true">🥈</span>
                    <div className="supporter-prize-body">
                      <div className="supporter-prize-place">2nd Place</div>
                      <div className="supporter-prize-text">
                        {prizes.second_place_amount && (
                          <strong>${formatMoney(Number(prizes.second_place_amount))} </strong>
                        )}
                        {prizes.second_place_prize}
                      </div>
                    </div>
                  </div>
                )}
                {hasThird && (
                  <div className="supporter-prize-row">
                    <span className="supporter-prize-medal" aria-hidden="true">🥉</span>
                    <div className="supporter-prize-body">
                      <div className="supporter-prize-place">3rd Place</div>
                      <div className="supporter-prize-text">
                        {prizes.third_place_amount && (
                          <strong>${formatMoney(Number(prizes.third_place_amount))} </strong>
                        )}
                        {prizes.third_place_prize}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="supporter-prizes-foot">
                Top performers — measured by completed challenges and
                fundraising — take home these prizes when the event ends.
              </div>
            </div>
          )}

          {/* CTA — "launching soon" until Stripe ships in 5.10 */}
          <SupporterComingSoonButton playerName={playerName} />

          {/* "What you get as a supporter" — answers the unasked question
              "why would I bother?" Each item is concrete and verifiable. */}
          <div className="supporter-benefits">
            <div className="supporter-benefits-title">
              What you get as a supporter
            </div>
            <ul className="supporter-benefits-list">
              <li>
                <span className="supporter-benefits-icon" aria-hidden="true">📺</span>
                <span>
                  <strong>See the work.</strong> {row.player_first_name} submits a video for every challenge.
                  You can watch their progress as they go.
                </span>
              </li>
              <li>
                <span className="supporter-benefits-icon" aria-hidden="true">📨</span>
                <span>
                  <strong>Get updates.</strong> We&apos;ll email you when {row.player_first_name}{" "}
                  hits milestones — first challenge, halfway point, goal reached.
                </span>
              </li>
              <li>
                <span className="supporter-benefits-icon" aria-hidden="true">🏫</span>
                <span>
                  <strong>Backs the team.</strong> Your support supports{" "}
                  {row.organization_name} and the players competing for them.
                </span>
              </li>
              <li>
                <span className="supporter-benefits-icon" aria-hidden="true">🔒</span>
                <span>
                  <strong>Secure payments.</strong> Card processing through Stripe.
                  Receipt emailed instantly. Cancel anytime before charge.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* "How earn²keep works" deeper explainer — kept for the curious
            who scroll down for more context. The hero now says enough
            for an action decision; this section is for "tell me more". */}
        <div className="supporter-explainer">
          <h2 className="supporter-explainer-title">How earn²keep works</h2>
          <p>
            <strong>Organizers</strong> — coaches, teachers, scout leaders,
            youth pastors, gym owners, parents, organization directors, and
            other group leaders — create fundraisers and tournaments for
            their teams, troops, classes, programs, or other groups.
          </p>
          <p>
            <strong>Players</strong> like {row.player_first_name} compete in
            daily challenges chosen by their organizer — push-ups, free throws,
            memory verses, mile times, reading minutes — and submit short
            videos as proof. Every approved challenge earns them points.
          </p>
          <p>
            <strong>Supporters</strong> like you back a specific player&apos;s
            effort. Your support covers their entry fee or fundraising
            minimum, and you get to follow their progress all the way through.
          </p>
          <p>
            <strong>The players who put in the most work win.</strong> Top
            performers earn cash prizes, gear, scholarships, or whatever the
            organization sets up for their event.
          </p>
          <p style={{ marginTop: "10px" }}>
            <a href="https://earn2keep.com" className="supporter-explainer-link" target="_blank" rel="noopener noreferrer">
              Learn more at earn2keep.com →
            </a>
          </p>
        </div>
      </main>

      <footer className="supporter-footer">
        <div className="supporter-footer-inner">
          <span>© earn²keep · A platform for fundraisers and tournaments</span>
          <Link href="/" className="supporter-footer-link">Organizer login</Link>
        </div>
      </footer>
    </div>
  );
}

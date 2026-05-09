import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import SponsorComingSoonButton from "./SponsorComingSoonButton";

// Open Graph metadata so that when a sponsor link is shared via
// iMessage / WhatsApp / social, the preview shows the player's name
// instead of a generic page title.
export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_public_sponsor_view", {
      token_input: token,
    });
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { title: "Sponsor a player — earn²keep" };
    }
    const playerName = row.player_last_initial
      ? `${row.player_first_name} ${row.player_last_initial}`
      : row.player_first_name;
    const isCamp = row.event_type === "camp";
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
    return { title: "Sponsor a player — earn²keep" };
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

type SponsorView = {
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

export default async function SponsorPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_sponsor_view", {
    token_input: token,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    notFound();
  }

  const row: SponsorView = Array.isArray(data) ? data[0] : data;

  // Slice 5.5: pull the player extras (avatar, bio, pronouns) from the
  // new sibling RPC. If the RPC returns null (older sponsor links from
  // before 5.5 deploy still work fine — bucket + columns may exist but
  // this player just hasn't filled out a profile yet), we fall back to
  // initials + no-bio rendering.
  const { data: extrasData } = await supabase.rpc(
    "get_public_sponsor_player_extras",
    { token_input: token }
  );
  const extras = (extrasData || {}) as {
    avatar_url?: string | null;
    bio?: string | null;
    pronouns?: string | null;
  };

  const isCamp = row.event_type === "camp";
  const playerName = row.player_last_initial
    ? `${row.player_first_name} ${row.player_last_initial}`
    : row.player_first_name;
  const goal = Number(row.event_goal_amount || 0);
  const eventDateRange = formatDateRange(row.event_start_date, row.event_end_date);

  // Initials for the avatar placeholder if no photo yet.
  const avatarInitials = `${row.player_first_name[0] ?? "?"}${
    row.player_last_initial?.[0] ?? ""
  }`.toUpperCase();

  return (
    <div className="sponsor-page">
      <header className="sponsor-header">
        <div className="sponsor-header-inner">
          <span className="sponsor-logo">
            earn<sup className="logo-sup">2</sup>keep
          </span>
        </div>
      </header>

      <main className="sponsor-main">
        <div className="sponsor-card">
          <div className="sponsor-eyebrow">
            ★ {isCamp ? "FUNDRAISER" : "TOURNAMENT"} ★
          </div>

          {/* Slice 5.5: player avatar + pronouns (when set). The avatar
              gets a soft glow ring; falls back to initials when the
              player hasn't uploaded a photo yet. */}
          <div className="sponsor-player-avatar-wrap">
            {extras.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={extras.avatar_url}
                alt={playerName}
                className="sponsor-player-avatar"
              />
            ) : (
              <div className="sponsor-player-avatar sponsor-player-avatar-initials">
                {avatarInitials}
              </div>
            )}
            {extras.pronouns && (
              <div className="sponsor-player-pronouns">({extras.pronouns})</div>
            )}
          </div>

          {isCamp ? (
            <h1 className="sponsor-headline">
              Help <span className="sponsor-name">{playerName}</span> hit their goal.
            </h1>
          ) : (
            <h1 className="sponsor-headline">
              Cover <span className="sponsor-name">{playerName}</span>'s spot.
            </h1>
          )}

          <p className="sponsor-subhead">
            <strong>{playerName}</strong> is competing with the{" "}
            <strong>{row.team_name}</strong>
            {row.team_sport && <> ({row.team_sport}{row.team_age_group ? `, ${row.team_age_group}` : ""})</>}
            {" "}from <strong>{row.organization_name}</strong>.
          </p>

          {/* Slice 5.5: optional bio in the player's own words. Skipped
              entirely when not set so we don't show an empty quote box. */}
          {extras.bio && (
            <blockquote className="sponsor-player-bio">
              <span className="sponsor-player-bio-mark">"</span>
              {extras.bio}
              <span className="sponsor-player-bio-mark">"</span>
              <cite>— {playerName}</cite>
            </blockquote>
          )}

          <div className="sponsor-event-strip">
            <div className="sponsor-event-block">
              <div className="sponsor-event-label">Event</div>
              <div className="sponsor-event-value">{row.event_name}</div>
            </div>
            <div className="sponsor-event-block">
              <div className="sponsor-event-label">Dates</div>
              <div className="sponsor-event-value">{eventDateRange}</div>
            </div>
            <div className="sponsor-event-block">
              <div className="sponsor-event-label">
                {isCamp ? "Their goal" : "Reg fee"}
              </div>
              <div className="sponsor-event-value sponsor-event-amount">
                {goal > 0 ? `$${formatMoney(goal)}` : "—"}
              </div>
            </div>
          </div>

          <div className="sponsor-pitch">
            {isCamp ? (
              <>
                <p>
                  <strong>{playerName}</strong> needs to raise{" "}
                  <strong>${formatMoney(goal)}</strong> to compete in{" "}
                  <strong>{row.event_name}</strong>. Every dollar they raise above the
                  minimum earns them bonus points toward winning the prize.
                </p>
                <p className="sponsor-pitch-mantra">
                  Help them <em>earn it.</em> Help them <em>keep it.</em>
                </p>
              </>
            ) : (
              <>
                <p>
                  Covering <strong>{playerName}</strong>'s ${formatMoney(goal)}{" "}
                  registration fee gets them a spot in{" "}
                  <strong>{row.event_name}</strong>. They'll compete with the{" "}
                  {row.team_name} for the prize.
                </p>
                <p className="sponsor-pitch-mantra">
                  Help them <em>earn it.</em> Help them <em>keep it.</em>
                </p>
              </>
            )}
          </div>

          <SponsorComingSoonButton playerName={playerName} />

          <div className="sponsor-trust-row">
            <span className="sponsor-trust-item">🔒 Secure payment when live</span>
            <span className="sponsor-trust-item">📺 You'll see {row.player_first_name}'s submissions</span>
            <span className="sponsor-trust-item">🏆 Get notified when they win</span>
          </div>
        </div>

        <div className="sponsor-explainer">
          <h2 className="sponsor-explainer-title">What is earn²keep?</h2>
          <p>
            earn²keep is a youth fundraising platform that lets kids earn rewards
            instead of just collecting donations. Athletes, scouts, students, and
            kids of faith use it to{" "}
            {isCamp
              ? "raise money for their teams and earn prizes for the work they put in."
              : "compete for prizes in fair, structured tournaments."}
          </p>
          <p>
            Coaches set the rules. Players compete. Sponsors back them. Everyone wins.
          </p>
          <p style={{ marginTop: "10px" }}>
            <a href="https://earn2keep.com" className="sponsor-explainer-link" target="_blank" rel="noopener noreferrer">
              Learn more at earn2keep.com →
            </a>
          </p>
        </div>
      </main>

      <footer className="sponsor-footer">
        <div className="sponsor-footer-inner">
          <span>© earn²keep · A platform for youth fundraisers and tournaments</span>
          <Link href="/" className="sponsor-footer-link">Coach login</Link>
        </div>
      </footer>
    </div>
  );
}

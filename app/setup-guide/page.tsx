import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function SetupGuidePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // Live setup status
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const hasOrg = (orgs?.length || 0) > 0;
  const firstOrgId = orgs?.[0]?.id;

  let hasTeam = false;
  let firstTeamId: string | null = null;
  let hasPlayers = false;
  if (firstOrgId) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, players(id)")
      .eq("organization_id", firstOrgId)
      .limit(5);
    hasTeam = (teams?.length || 0) > 0;
    if (hasTeam && teams) {
      firstTeamId = teams[0].id;
      hasPlayers = teams.some((t: any) => (t.players?.length || 0) > 0);
    }
  }

  const allReady = hasOrg && hasTeam && hasPlayers;

  // Pick the right CTA href based on setup state
  let nextStepHref = "/organizations/new";
  let nextStepLabel = "Create your organization →";
  if (hasOrg && !hasTeam) {
    nextStepHref = `/organizations/${firstOrgId}/teams/new`;
    nextStepLabel = "Add your first team →";
  } else if (hasOrg && hasTeam && !hasPlayers) {
    nextStepHref = `/teams/${firstTeamId}/players/new`;
    nextStepLabel = "Add players to your team →";
  } else if (allReady) {
    nextStepHref = `/organizations/${firstOrgId}/events/new`;
    nextStepLabel = "Create your first event →";
  }

  return (
    <AppShell active="settings" userDisplayName={profile?.full_name?.trim() || ""}>
      <div className="breadcrumb">
        <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
        <span className="breadcrumb-sep">›</span>
        <Link href="/help" className="breadcrumb-link">Help</Link>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-current">Setup Guide</span>
      </div>

      {/* HERO */}
      <div className="e2k-guide-hero">
        <span className="e2k-guide-eyebrow">★ Setup Playbook ★</span>
        <h1 className="e2k-guide-title">Your earn²keep playbook</h1>
        <p className="e2k-guide-sub">
          Pick Camp or Tournament, then walk through every step from setup to
          launch. Most coaches finish setup in under 30 minutes.
        </p>
      </div>

      {/* COMPARISON */}
      <h2 className="e2k-guide-h2">Step 1 — Which event type is right for you?</h2>
      <div className="e2k-compare-grid">
        {/* CAMP CARD */}
        <div className="e2k-compare-card e2k-compare-camp">
          <div className="e2k-compare-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 21l9 -18l9 18" />
              <path d="M9 17h6" />
            </svg>
          </div>
          <div className="e2k-compare-name">CAMP</div>
          <div className="e2k-compare-tag">One team. Players compete internally.</div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Money model</div>
            <div className="e2k-compare-value">Per-player fundraising goal</div>
            <div className="e2k-compare-detail">
              Each player has a personal $X minimum. Sponsors fund their effort.
              Anything raised over the minimum becomes bonus points + extra prize money.
            </div>
          </div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Who is this for?</div>
            <ul className="e2k-compare-list">
              <li>A single soccer/football/basketball team</li>
              <li>A youth group, scout troop, or Bible study</li>
              <li>A CrossFit box or yoga studio</li>
              <li>One classroom or school club</li>
            </ul>
          </div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Typical numbers</div>
            <div className="e2k-compare-formula">
              <strong>$250</strong> per-player goal &nbsp;×&nbsp; <strong>20</strong> players
              &nbsp;=&nbsp; <strong className="accent">$5,000</strong> raised
            </div>
          </div>

          <a href="#camp-walkthrough" className="e2k-compare-cta">
            See the Camp walkthrough →
          </a>
        </div>

        {/* TOURNAMENT CARD */}
        <div className="e2k-compare-card e2k-compare-tournament">
          <div className="e2k-compare-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 4h10" />
              <path d="M17 4v8a5 5 0 0 1 -10 0v-8" />
              <path d="M5 9h-2v3a3 3 0 0 0 3 3" />
              <path d="M19 9h2v3a3 3 0 0 1 -3 3" />
            </svg>
          </div>
          <div className="e2k-compare-name">TOURNAMENT</div>
          <div className="e2k-compare-tag">Multiple teams. Head-to-head competition.</div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Money model</div>
            <div className="e2k-compare-value">Flat registration fee per player</div>
            <div className="e2k-compare-detail">
              Sponsors pay a flat entry fee per player. Teams compete on points
              over the season. Top teams win the prize pot, organization keeps
              the rest.
            </div>
          </div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Who is this for?</div>
            <ul className="e2k-compare-list">
              <li>A youth league with 4+ teams</li>
              <li>An interscholastic competition (multiple schools)</li>
              <li>A multi-troop scouting event</li>
              <li>A regional gym or studio championship</li>
            </ul>
          </div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Typical numbers</div>
            <div className="e2k-compare-formula">
              <strong>$50</strong> reg fee &nbsp;×&nbsp; <strong>60</strong> players
              &nbsp;=&nbsp; <strong className="accent">$3,000</strong> raised
            </div>
          </div>

          <a href="#tournament-walkthrough" className="e2k-compare-cta">
            See the Tournament walkthrough →
          </a>
        </div>
      </div>

      <div className="e2k-guide-decider">
        <strong>Still not sure?</strong> Quick test —
        <span> if you have <em>one team</em> competing internally for prizes, pick <strong>Camp</strong>.</span>
        <span> If you have <em>multiple teams</em> competing against each other, pick <strong>Tournament</strong>.</span>
        <span> You can also run both — many coaches do a Camp first, then a Tournament finale.</span>
      </div>

      {/* SETUP CHECKLIST */}
      <h2 className="e2k-guide-h2">Step 2 — Before you create an event</h2>
      <p className="e2k-guide-h2-sub">
        You need an organization, at least one team, and players on the roster.
        Here&apos;s where you stand right now:
      </p>

      <div className="e2k-checklist">
        <div className={`e2k-check-row ${hasOrg ? "done" : "todo"}`}>
          <div className="e2k-check-mark">{hasOrg ? "✓" : "1"}</div>
          <div className="e2k-check-body">
            <div className="e2k-check-title">Organization created</div>
            <div className="e2k-check-text">
              Your top-level group — your school, club, church, troop, or gym.
              {hasOrg && orgs && orgs[0] && <> You have <strong>{orgs[0].name}</strong>.</>}
            </div>
          </div>
          {!hasOrg && (
            <Link href="/organizations/new" className="e2k-check-action">
              Create →
            </Link>
          )}
          {hasOrg && (
            <span className="e2k-check-status">Done</span>
          )}
        </div>

        <div className={`e2k-check-row ${hasTeam ? "done" : hasOrg ? "todo" : "locked"}`}>
          <div className="e2k-check-mark">{hasTeam ? "✓" : "2"}</div>
          <div className="e2k-check-body">
            <div className="e2k-check-title">At least one team</div>
            <div className="e2k-check-text">
              Inside your organization, create a team. Example: &ldquo;Lincoln Lions
              U14&rdquo; inside &ldquo;Lincoln Middle School Athletics.&rdquo;
            </div>
          </div>
          {!hasTeam && hasOrg && firstOrgId && (
            <Link href={`/organizations/${firstOrgId}/teams/new`} className="e2k-check-action">
              Add team →
            </Link>
          )}
          {hasTeam && <span className="e2k-check-status">Done</span>}
        </div>

        <div className={`e2k-check-row ${hasPlayers ? "done" : hasTeam ? "todo" : "locked"}`}>
          <div className="e2k-check-mark">{hasPlayers ? "✓" : "3"}</div>
          <div className="e2k-check-body">
            <div className="e2k-check-title">Players added</div>
            <div className="e2k-check-text">
              Add each player&apos;s name and jersey number. You can add them
              one at a time or import a CSV from TeamSnap, GameChanger, or SportsEngine.
            </div>
          </div>
          {!hasPlayers && hasTeam && firstTeamId && (
            <Link href={`/teams/${firstTeamId}/players/new`} className="e2k-check-action">
              Add players →
            </Link>
          )}
          {hasPlayers && <span className="e2k-check-status">Done</span>}
        </div>
      </div>

      <div className="e2k-guide-bigcta">
        <Link href={nextStepHref} className="btn-primary-link">
          {nextStepLabel}
        </Link>
        {!allReady && (
          <p className="e2k-guide-bigcta-sub">
            Finish the steps above first, then come back to create your event.
          </p>
        )}
      </div>

      {/* CAMP WALKTHROUGH */}
      <h2 className="e2k-guide-h2" id="camp-walkthrough">Camp walkthrough — step by step</h2>

      <details className="e2k-walkthrough" open>
        <summary>
          <span className="e2k-walkthrough-summary-icon">🏕</span>
          <span>Setting up a Camp (7 steps)</span>
          <span className="e2k-walkthrough-toggle">▼</span>
        </summary>

        <div className="e2k-walk-steps">
          <div className="e2k-walk-step">
            <div className="e2k-walk-num">1</div>
            <div>
              <h4 className="e2k-walk-title">Open your organization → click &ldquo;+ New Event&rdquo;</h4>
              <p className="e2k-walk-text">
                From the dashboard or the Events page, click into your organization,
                then click the orange <strong>+ New Event</strong> button.
              </p>
              <div className="e2k-walk-tip">
                <strong>Tip:</strong> If you have multiple organizations, make sure
                you&apos;re inside the right one before creating the event.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">2</div>
            <div>
              <h4 className="e2k-walk-title">Pick &ldquo;Camp&rdquo;</h4>
              <p className="e2k-walk-text">
                The first screen asks you to pick the event type. Click the
                <strong> Camp</strong> tile. Camp is selected when its border
                glows cyan.
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">3</div>
            <div>
              <h4 className="e2k-walk-title">Name &amp; dates</h4>
              <p className="e2k-walk-text">
                Name your Camp something motivating —
                <em> &ldquo;Lincoln Lions Spring Camp&rdquo;</em> or
                <em> &ldquo;Crossroads Youth Group June Push.&rdquo;</em> Then set
                your start and end dates.
              </p>
              <div className="e2k-walk-tip">
                <strong>Recommended:</strong> 4–6 weeks. Shorter than 4 weeks rushes
                the kids and limits sponsor reach. Longer than 6 weeks loses momentum.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">4</div>
            <div>
              <h4 className="e2k-walk-title">Set the per-player fundraising goal</h4>
              <p className="e2k-walk-text">
                This is the <strong>minimum each player needs to raise</strong> to
                fully participate. Common targets: $150, $250, $500. The total
                Camp goal is calculated automatically: per-player goal × number
                of players on the team.
              </p>
              <div className="e2k-walk-tip">
                <strong>How extra money works:</strong> If a player raises more
                than their minimum, the overage becomes <em>bonus points</em> on
                the leaderboard plus extra prize money for that player. This is
                the &ldquo;earn it / keep it&rdquo; magic — kids who hustle harder
                actually win more.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">5</div>
            <div>
              <h4 className="e2k-walk-title">Pick your weekly challenges</h4>
              <p className="e2k-walk-text">
                Open the Schedule tab and use the calendar to assign challenges
                to specific days. The library has 8 starter challenges across
                Sports, Faith, Fitness, Academic, Scouts, and Service categories
                — or click <strong>+ Custom</strong> to make your own. You can
                also bulk-import a CSV.
              </p>
              <div className="e2k-walk-tip">
                <strong>Tip:</strong> Start with 2–3 challenges per week. Use
                &ldquo;Apply this day to other days&rdquo; to copy a day&apos;s
                plan to all weekdays in one click.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">6</div>
            <div>
              <h4 className="e2k-walk-title">Set prize tiers (optional)</h4>
              <p className="e2k-walk-text">
                Decide how prizes get awarded. Common setup: top 3 fundraisers
                get extra prize money, top 1 also gets a special prize (gift
                card, gear, etc.). Players who don&apos;t hit minimum still
                participate, but bonus prizes go to the top performers.
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">7</div>
            <div>
              <h4 className="e2k-walk-title">Generate QR codes &amp; launch</h4>
              <p className="e2k-walk-text">
                Once the event is created, open <strong>QR Codes</strong> from
                the event page. Each player gets a unique QR — print, share, or
                download. Players hand them to family, friends, and local
                sponsors. Sponsors scan, see the player&apos;s real verified
                effort, and contribute. You&apos;re live.
              </p>
            </div>
          </div>
        </div>
      </details>

      {/* TOURNAMENT WALKTHROUGH */}
      <h2 className="e2k-guide-h2" id="tournament-walkthrough">Tournament walkthrough — step by step</h2>

      <details className="e2k-walkthrough">
        <summary>
          <span className="e2k-walkthrough-summary-icon">🏆</span>
          <span>Setting up a Tournament (7 steps)</span>
          <span className="e2k-walkthrough-toggle">▼</span>
        </summary>

        <div className="e2k-walk-steps">
          <div className="e2k-walk-step">
            <div className="e2k-walk-num">1</div>
            <div>
              <h4 className="e2k-walk-title">Make sure you have multiple teams set up</h4>
              <p className="e2k-walk-text">
                A Tournament needs at least 2 teams to run, and 4+ teams is
                ideal. If you only have one team in your org right now, head to
                <strong> Teams → + New Team</strong> first.
              </p>
              <div className="e2k-walk-tip">
                <strong>Note:</strong> If multiple coaches each manage their own
                team, they can each set up their team inside the same organization
                and the Tournament can pull from all of them.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">2</div>
            <div>
              <h4 className="e2k-walk-title">Open your organization → click &ldquo;+ New Event&rdquo; → pick Tournament</h4>
              <p className="e2k-walk-text">
                Same starting place as Camp. From your organization page, click
                <strong> + New Event</strong> and choose the
                <strong> Tournament</strong> tile.
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">3</div>
            <div>
              <h4 className="e2k-walk-title">Name &amp; dates</h4>
              <p className="e2k-walk-text">
                Tournaments often have league-flavored names —
                <em> &ldquo;Spring Soccer League&rdquo;</em> or
                <em> &ldquo;Regional Faith Bowl 2026.&rdquo;</em> Pick start and
                end dates that span the full competition (typically 4–8 weeks).
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">4</div>
            <div>
              <h4 className="e2k-walk-title">Set the registration fee per player</h4>
              <p className="e2k-walk-text">
                This is a <strong>flat fee per player</strong>, paid by their
                sponsor when they scan the QR code. Common: $25, $50, $100. The
                total tournament pot equals: registration fee × players entered.
              </p>
              <div className="e2k-walk-tip">
                <strong>Different from Camp:</strong> there&apos;s no &ldquo;over
                the minimum&rdquo; bonus in Tournament. The whole pot is the pot —
                top teams win prizes from it, the rest goes to the organization.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">5</div>
            <div>
              <h4 className="e2k-walk-title">Add the competing teams</h4>
              <p className="e2k-walk-text">
                Pick which teams from your organization are competing in this
                tournament. Each team brings their full roster.
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">6</div>
            <div>
              <h4 className="e2k-walk-title">Pick your challenges &amp; prize structure</h4>
              <p className="e2k-walk-text">
                Same library, same scheduling tools as Camp. Difference: prizes
                are awarded at the team level, not individual. Common setup:
                <strong> 1st place team</strong> gets the biggest cut, 2nd and 3rd
                get smaller pots, organization keeps the remainder.
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">7</div>
            <div>
              <h4 className="e2k-walk-title">Generate QR codes &amp; launch</h4>
              <p className="e2k-walk-text">
                Each player still gets a personal QR for sponsors to scan. The
                difference: each scan adds the registration fee to the pot
                rather than progressing toward an individual minimum.
              </p>
            </div>
          </div>
        </div>
      </details>

      {/* FAQ */}
      <h2 className="e2k-guide-h2">Common questions</h2>

      <div className="e2k-faq-list">
        <div className="help-faq">
          <h4 className="help-faq-q">Can I run a Camp and a Tournament at the same time?</h4>
          <p className="help-faq-a">
            Yes — they&apos;re separate events. You can have multiple events
            running at once. Many coaches run a Camp during regular season,
            then a Tournament for an end-of-season showdown.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">Can I switch an event from Camp to Tournament after creating it?</h4>
          <p className="help-faq-a">
            No — the money model is locked in once the event is created. If
            you picked the wrong type, you can delete the event and create a
            new one. Player rosters are preserved when you delete an event.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">What if I don&apos;t hit my fundraising goal?</h4>
          <p className="help-faq-a">
            Camp: that&apos;s OK — the goal is a target, not a contract. Whatever
            actually gets raised is what your organization keeps. Players who
            didn&apos;t hit individual minimum still participate; they just
            don&apos;t get bonus points/prizes.
            <br /><br />
            Tournament: registration fees are paid up front per player, so the
            pot is the pot. The competition still runs whether sponsors fund 5
            players or 50.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">Do players need accounts?</h4>
          <p className="help-faq-a">
            Not in Phase 4. You (the coach) manage everything: roster, challenge
            verification, QR distribution. Player-facing accounts come in Phase 5,
            where each kid gets a magic-link login and uploads their own challenge
            videos.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">When does payment processing go live?</h4>
          <p className="help-faq-a">
            Payment integration is a later phase. Right now you can run the
            entire flow — set up everything, generate QR codes, track player
            progress, run challenges — and we&apos;ll have Stripe integration
            live before your first real fundraiser launches.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">Can I edit an event after it&apos;s created?</h4>
          <p className="help-faq-a">
            Most fields yes — name, dates, fundraising goal, prize structure,
            challenges. Event type (Camp vs Tournament) cannot be changed.
          </p>
        </div>
      </div>

      {/* FINAL CTA */}
      <div className="e2k-guide-finalcta">
        <h3 className="e2k-guide-finalcta-title">Ready to launch?</h3>
        <p className="e2k-guide-finalcta-sub">
          {allReady
            ? "Everything's in place. Time to create your first event."
            : "Finish the setup checklist above, then come back here."}
        </p>
        <Link href={nextStepHref} className="btn-primary-link">
          {nextStepLabel}
        </Link>
      </div>

      <div className="e2k-guide-footer-note">
        Still stuck? Email us at <a href="mailto:support@earn2keep.com">support@earn2keep.com</a> and we&apos;ll get back to you within one business day.
      </div>
    </AppShell>
  );
}

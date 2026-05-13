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
    nextStepLabel = "Add players/participants to your team →";
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
          Pick Mini-Camp, Camp, or Tournament, then walk through every step from setup to
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
          <div className="e2k-compare-tag">One team or group. Players/participants compete internally.</div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Money model</div>
            <div className="e2k-compare-value">Per-person fundraising goal</div>
            <div className="e2k-compare-detail">
              Each participant has a personal $X minimum. Supporters fund their effort.
              Anything raised over the minimum becomes bonus points + extra prize money.
            </div>
          </div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Who is this for?</div>
            <ul className="e2k-compare-list">
              <li>A single soccer/football/basketball team</li>
              <li>A youth group, scout troop, classroom, or small group</li>
              <li>A CrossFit box or yoga studio</li>
              <li>One classroom or school club</li>
            </ul>
          </div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Typical numbers</div>
            <div className="e2k-compare-formula">
              <strong>$250</strong> per-person goal &nbsp;×&nbsp; <strong>20</strong> participants
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
          <div className="e2k-compare-tag">Multi-team commitment contest. Strict scoring.</div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Money model</div>
            <div className="e2k-compare-value">Per-team Entry Fee + strict scoring</div>
            <div className="e2k-compare-detail">
              The host sets a flat Entry Fee that other teams pay to compete.
              Teams compete on strict-scored challenges — a team earns the
              points for a challenge only when every player on its roster
              completes it. Top teams win the prize pot.
            </div>
          </div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Who is this for?</div>
            <ul className="e2k-compare-list">
              <li>A multi-team league or interscholastic competition (4+ teams)</li>
              <li>An interscholastic competition (multiple schools)</li>
              <li>A multi-troop scouting event</li>
              <li>A regional gym or studio championship</li>
            </ul>
          </div>

          <div className="e2k-compare-section">
            <div className="e2k-compare-label">Typical numbers</div>
            <div className="e2k-compare-formula">
              <strong>$400</strong> Entry Fee &nbsp;×&nbsp; <strong>6</strong> teams
              &nbsp;=&nbsp; <strong className="accent">$2,400</strong> raised
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
        You need an organization, at least one team, and players/participants
        on the roster. Here&apos;s where you stand right now:
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
            <div className="e2k-check-title">Players/participants added</div>
            <div className="e2k-check-text">
              Add each person&apos;s name and jersey number (optional). You can
              add them one at a time or import a CSV from TeamSnap, GameChanger,
              or SportsEngine.
            </div>
          </div>
          {!hasPlayers && hasTeam && firstTeamId && (
            <Link href={`/teams/${firstTeamId}/players/new`} className="e2k-check-action">
              Add players/participants →
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
                <strong>Recommended:</strong> 4–6 weeks. Shorter than 4 weeks
                rushes the group and limits supporter reach. Longer than 6 weeks
                loses momentum.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">4</div>
            <div>
              <h4 className="e2k-walk-title">Set the per-person fundraising goal</h4>
              <p className="e2k-walk-text">
                This is the <strong>minimum each participant needs to raise</strong>
                to fully participate. Common targets: $150, $250, $500. The
                total Camp goal is calculated automatically: per-person goal ×
                number of participants on the roster.
              </p>
              <div className="e2k-walk-tip">
                <strong>How extra money works:</strong> If a participant raises
                more than their minimum, the overage becomes <em>bonus points</em>
                on the leaderboard plus extra prize money for that participant.
                This is the &ldquo;earn it / keep it&rdquo; magic — those who
                hustle harder actually win more.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">5</div>
            <div>
              <h4 className="e2k-walk-title">Pick your weekly challenges</h4>
              <p className="e2k-walk-text">
                Open the Schedule tab and use the calendar to assign challenges
                to specific days. The starter library has{" "}
                <strong>51 challenges</strong> across Sports, Faith, Fitness,
                Academic, Scouts, and Service categories — or click{" "}
                <strong>+ Custom</strong> to make your own. You can also
                bulk-import a CSV.
              </p>
              <div className="e2k-walk-tip">
                <strong>Tip:</strong> Start with 2–3 challenges per week. Use
                &ldquo;Apply this day to other days&rdquo; to copy a day&apos;s
                plan to all weekdays in one click.
              </div>
              <div className="e2k-walk-tip">
                <strong>How submissions get verified:</strong> participants
                record video of their attempts on their phone. AI verifies the
                videos automatically — counting reps, confirming timed
                activities, etc. You only step in for anything AI can&apos;t
                confirm or to override its call. No reviewing every push-up
                by hand.
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
                card, gear, etc.). Participants who don&apos;t hit minimum
                still take part, but bonus prizes go to the top performers.
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">7</div>
            <div>
              <h4 className="e2k-walk-title">Generate QR codes &amp; launch</h4>
              <p className="e2k-walk-text">
                Once the event is created, open <strong>QR Codes</strong> from
                the event page. Each participant gets a unique QR — print,
                share, or download. Participants hand them to family, friends,
                and local supporters. Supporters scan, see the real verified
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
          <span>Setting up a Tournament (8 steps)</span>
          <span className="e2k-walkthrough-toggle">▼</span>
        </summary>

        <div className="e2k-walk-steps">
          <div className="e2k-walk-step">
            <div className="e2k-walk-num">1</div>
            <div>
              <h4 className="e2k-walk-title">Make sure you have at least one of your own teams set up</h4>
              <p className="e2k-walk-text">
                You compete too. A Tournament has a <em>host team</em>
                (yours) plus <em>joining teams</em> from other organizations.
                If you don&apos;t have a team yet, head to <strong>Teams →
                + New Team</strong> first and add your roster.
              </p>
              <div className="e2k-walk-tip">
                <strong>Note:</strong> Joining teams set up their own teams
                inside their own organizations. They don&apos;t need to be in
                your org — they just need the join code (more on that in step 8).
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
              <h4 className="e2k-walk-title">Set the per-team Entry Fee</h4>
              <p className="e2k-walk-text">
                This is what <strong>other teams</strong> pay to enter your
                tournament — not per player, per team. Common: $250, $400,
                $1,000. Each joining team&apos;s coach pays this once at
                checkout, then collects from their own players however they
                want (off-platform).
              </p>
              <div className="e2k-walk-tip">
                <strong>Your own teams join for free</strong> — you&apos;re
                already in as the host. You pay the one-time launch fee
                separately when you go live; that&apos;s what funds the
                platform side.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">5</div>
            <div>
              <h4 className="e2k-walk-title">Optional settings — Max teams, Registration deadline, Approval mode</h4>
              <p className="e2k-walk-text">
                Three knobs you can tune in the same Tournament Settings section.
                <strong> Maximum teams</strong> caps registration — useful for
                bracketed tournaments needing exactly 8 or 16 teams; once the
                cap is hit, the join code stops working.
                <strong> Registration deadline</strong> closes joins on a
                specific date (e.g., a week before the tournament starts so
                teams have time to prepare); leave blank to allow joins through
                the tournament start.
                <strong> Require my approval</strong> lets you curate who
                joins — each paying team lands in a pending queue on your
                event page; approve or decline from there. Recommended OFF
                unless you specifically need it.
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">6</div>
            <div>
              <h4 className="e2k-walk-title">Add your competing team(s)</h4>
              <p className="e2k-walk-text">
                Pick which of <em>your own</em> teams from your organization
                are entering this tournament. You can enter one or more. They
                join automatically — no Entry Fee for the host&apos;s teams.
              </p>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">7</div>
            <div>
              <h4 className="e2k-walk-title">Pick challenges &amp; designate the sudden-death tiebreaker</h4>
              <p className="e2k-walk-text">
                Same challenge library, same scheduling tools as Camp. Add
                the regular challenges teams will compete on, then mark
                <strong> ONE</strong> as the pre-declared
                <strong> sudden-death tiebreaker</strong>. The tiebreaker
                stays hidden during regular play and only activates if teams
                tie for a prize position at the end of the tournament. The
                team with the earliest 100% completion in the tiebreaker
                window wins the tie.
              </p>
              <div className="e2k-walk-tip">
                <strong>Strict scoring:</strong> teams earn the points for a
                challenge only when every player on the roster completes it.
                One absence = zero for that challenge. This is what makes the
                tournament a true commitment contest — disciplined small rosters
                can beat larger ones.
              </div>
            </div>
          </div>

          <div className="e2k-walk-step">
            <div className="e2k-walk-num">8</div>
            <div>
              <h4 className="e2k-walk-title">Share the join code with other team coaches</h4>
              <p className="e2k-walk-text">
                Every tournament gets a 6-character join code like
                <strong> ABC-XYZ</strong>. Use the in-app
                <strong> Invitations</strong> panel to send the code via email
                to coaches you want to invite, or paste it anywhere — text
                message, group chat, league forum.
              </p>
              <p className="e2k-walk-text">
                Coaches who receive the code enter it, see your tournament&apos;s
                public info page (name, dates, Entry Fee, your challenges, your
                tiebreaker), pick which of their teams to enter, pay the Entry
                Fee, and they&apos;re in. If you enabled approval mode in step 5,
                they show up on your event page as pending — you approve or
                decline before they&apos;re competing.
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
            actually gets raised is what your organization keeps. Participants
            who didn&apos;t hit individual minimum still take part; they just
            don&apos;t get bonus points/prizes.
            <br /><br />
            Tournament: there&apos;s no per-person fundraising goal. Other
            teams pay a flat <strong>Entry Fee</strong> per team to join. The
            pot is the sum of Entry Fees collected. The competition runs
            whether 2 teams join or 20 — strict scoring rewards the team
            that shows up no matter the field size.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">How do other teams join my Tournament?</h4>
          <p className="help-faq-a">
            Every Tournament gets a unique 6-character join code (like
            <strong> ABC-XYZ</strong>). Share it via the in-app
            <strong> Invitations</strong> panel — type in coach email
            addresses and we send a one-click invitation. Or paste the code
            anywhere — text, group chat, league forum. Coaches enter the
            code, see your tournament&apos;s public info page, pick which of
            their teams to enter, pay the Entry Fee, and they&apos;re
            registered. If you turned on Approval mode at setup, you decide
            whether to accept or decline each joining team from the event
            page before they&apos;re competing.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">What&apos;s &ldquo;strict scoring&rdquo; in a Tournament?</h4>
          <p className="help-faq-a">
            A team earns the points for a challenge <strong>only when every
            player on its roster completes that challenge</strong>. One
            absence = zero points for that challenge. This is what makes
            Tournament a true commitment contest: a disciplined roster of 6
            can beat a half-engaged roster of 20. Players see live roster
            status — who&apos;s done it, who hasn&apos;t — so the team holds
            itself accountable. No automated nudges; the social pressure
            happens inside the team.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">What if teams tie at the end?</h4>
          <p className="help-faq-a">
            When you set up the Tournament, you pre-declare ONE of your
            challenges as the <strong>sudden-death tiebreaker</strong>. It
            stays hidden during regular play. If teams tie for a prize
            position at the end, the tiebreaker automatically unlocks for
            those tied teams with a 48-hour submission window
            (configurable). Same strict scoring — every player on the
            roster has to finish. The team with the earliest 100%-completion
            timestamp wins the tie. If nobody hits 100% in the window, you
            get a button on the event page to declare the winner using your
            own judgment.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">Do players/participants need accounts?</h4>
          <p className="help-faq-a">
            Yes — each participant gets their own login (a magic link sent to
            their phone or email). They sign in, view today&apos;s challenges,
            record video of their attempts, and submit them. AI verifies most
            submissions automatically; you step in only for anything AI
            can&apos;t confirm. Participants also see their progress on the
            leaderboard, get notifications when you review a submission, and
            can share their supporter QR code from inside the app.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">How does AI verification work?</h4>
          <p className="help-faq-a">
            When a participant submits a challenge video, AI analyzes the
            footage and tries to verify it — counting reps for push-ups,
            confirming the duration of a plank hold, etc. If AI is confident,
            you can have submissions auto-approved (turn it on in Settings).
            If AI isn&apos;t confident or the challenge isn&apos;t the type AI
            can verify, the submission lands in your review queue for you to
            approve or reject manually. You stay in control without having to
            review every single video by hand.
          </p>
        </div>

        <div className="help-faq">
          <h4 className="help-faq-q">When does payment processing go live?</h4>
          <p className="help-faq-a">
            Supporter payments are coming soon. Right now you can run the entire
            flow — set up everything, generate QR codes, track participant
            progress, run challenges — and payments will be live before your
            first real fundraiser launches.
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

import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

import AppShell from "@/components/AppShell";
export default async function HelpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user?.id)
    .single();

  const { data: organizations } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", user?.id);

  const hasOrganization = (organizations?.length || 0) > 0;

  return (
    <AppShell active="help" userDisplayName={profile?.full_name?.trim() || ""}>
          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">Help</span>
          </div>

          <h1 className="dashboard-welcome">How earn²keep Works</h1>
          <p className="dashboard-subtitle">
            A complete guide to running your first season.
          </p>

          <Link href="/setup-guide" className="e2k-help-spotlight">
            <div className="e2k-help-spotlight-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12a10 10 0 1 0 20 0a10 10 0 0 0 -20 0" />
                <path d="M12 8v4l3 3" />
                <path d="M9 16l2 -3l3 1l2 -3" />
              </svg>
            </div>
            <div className="e2k-help-spotlight-body">
              <div className="e2k-help-spotlight-eyebrow">★ START HERE ★</div>
              <h2 className="e2k-help-spotlight-title">
                Setup Playbook: Camp vs Tournament
              </h2>
              <p className="e2k-help-spotlight-text">
                Side-by-side comparison, live setup checklist, and step-by-step
                walkthroughs for both event types. Most coaches finish in 30 minutes.
              </p>
            </div>
            <div className="e2k-help-spotlight-arrow">→</div>
          </Link>

          <div className="help-section">
            <h2 className="help-section-title">The Basics</h2>
            <p className="help-paragraph">
              <strong>earn²keep</strong> is a fundraising platform where your
              players/participants actually <em>earn</em> the money — through
              verified challenges and real effort, not by selling cookie dough
              or knocking on doors.
            </p>
            <p className="help-paragraph">
              Here&apos;s the core idea: players/participants sign up for a
              4–6 week Camp or Tournament. Each week, they complete real
              challenges (push-ups, free throws, Bible verses, service hours
              — whatever fits your group). Their family, friends, and local
              businesses supporter them by scanning a QR code. The organization
              keeps what they earn.
            </p>
            <p className="help-paragraph">
              <strong>How verification works:</strong> participants record
              video of their attempts on their phone. AI verifies the videos
              automatically — counting reps, confirming timed activities, etc.
              You only step in for anything AI can&apos;t confirm or to override
              its call. You stay in control without having to review every
              single push-up.
            </p>
          </div>

          <div className="help-section">
            <h2 className="help-section-title">The 5 Steps</h2>

            <div className="help-step">
              <div className="help-step-num">1</div>
              <div>
                <h3 className="help-step-title">Create your organization</h3>
                <p className="help-step-text">
                  Your organization is the top level — your school, club, church,
                  troop, or gym. You can have more than one if you coach for
                  multiple groups.
                </p>
              </div>
            </div>

            <div className="help-step">
              <div className="help-step-num">2</div>
              <div>
                <h3 className="help-step-title">Add your teams</h3>
                <p className="help-step-text">
                  Inside an organization, you create teams. For example,
                  "Lincoln Lions U14" might be a team within "Lincoln Middle
                  School Athletics."
                </p>
              </div>
            </div>

            <div className="help-step">
              <div className="help-step-num">3</div>
              <div>
                <h3 className="help-step-title">Add players/participants to your roster</h3>
                <p className="help-step-text">
                  Add each person&apos;s name, jersey number (optional), and a
                  profile photo (optional). You can add them one at a time or
                  import a CSV from TeamSnap, GameChanger, or SportsEngine.
                </p>
              </div>
            </div>

            <div className="help-step">
              <div className="help-step-num">4</div>
              <div>
                <h3 className="help-step-title">Create your event</h3>
                <p className="help-step-text">
                  Pick Camp (your single team/group competing internally) or
                  Tournament (multiple teams competing against each other).
                  Set dates, pick challenges from the 51-challenge starter
                  library (or create your own), and set door prizes.
                </p>
              </div>
            </div>

            <div className="help-step">
              <div className="help-step-num">5</div>
              <div>
                <h3 className="help-step-title">Generate supporter QR codes</h3>
                <p className="help-step-text">
                  Each player/participant gets a unique QR code. They share
                  it with family, friends, and local businesses. Supporters
                  scan, see the real effort and progress, and contribute.
                  Your organization keeps what&apos;s raised.
                </p>
              </div>
            </div>
          </div>

          <div className="help-section">
            <h2 className="help-section-title">Common Questions</h2>

            <div className="help-faq">
              <h4 className="help-faq-q">When does a season run?</h4>
              <p className="help-faq-a">Typical Camps and Tournaments run 4-6 weeks. You set the start and end dates.</p>
            </div>

            <div className="help-faq">
              <h4 className="help-faq-q">What&apos;s the difference between a Camp and a Tournament?</h4>
              <p className="help-faq-a">
                A <strong>Camp</strong> is one team or group competing internally — players/participants compete against each other for door prizes you set. A <strong>Tournament</strong> is multiple teams competing against each other for team-level prizes.
              </p>
            </div>

            <div className="help-faq">
              <h4 className="help-faq-q">How does support work?</h4>
              <p className="help-faq-a">
                Each participant gets a personalized QR code. They share it with their network. Supporters scan, see the participant&apos;s progress, and contribute. Donations are processed securely and the funds go to your organization at the end of the season.
              </p>
            </div>

            <div className="help-faq">
              <h4 className="help-faq-q">When does payment happen?</h4>
              <p className="help-faq-a">
                Payment processing is launching in a later phase. For now, you can run the entire season — set up teams, run challenges, generate QR codes, track progress — and we'll have payment processing live before your first real fundraiser.
              </p>
            </div>
          </div>

          <div className="help-section">
            <h2 className="help-section-title">Still need help?</h2>
            <p className="help-paragraph">
              Email us at <a href="mailto:support@earn2keep.com">support@earn2keep.com</a>{" "}
              and we'll get back to you within one business day.
            </p>
          </div>
    </AppShell>
  );
}

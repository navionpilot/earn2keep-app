import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, primary_role")
    .eq("id", user?.id)
    .single();

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Coach";

  return (
    <div className="dashboard">
      <div className="dashboard-ticker">
        <div className="dashboard-ticker-inner">
          <span className="dashboard-ticker-live">● PLATFORM PREVIEW</span>
          <span>You're in the early access program</span>
          <span>·</span>
          <span>Phase 4 features coming soon</span>
        </div>
      </div>

      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">
              earn<sup className="logo-sup">2</sup>keep
            </span>
          </Link>

          <div className="dashboard-user-section">
            <span className="dashboard-user-email">{user?.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <h1 className="dashboard-welcome">Welcome, {displayName}</h1>
        <p className="dashboard-subtitle">
          Here's where you'll manage your teams and earn²keep events.
        </p>

        <div className="dashboard-card">
          <h2 className="dashboard-card-title">
            Your Teams
            <span className="coming-soon-tag">Coming Soon</span>
          </h2>
          <p className="dashboard-card-text">
            Create and manage your teams here. Add players, upload roster photos,
            and organize your members by age group or skill tier.
          </p>
        </div>

        <div className="dashboard-card">
          <h2 className="dashboard-card-title">
            Your Events
            <span className="coming-soon-tag">Coming Soon</span>
          </h2>
          <p className="dashboard-card-text">
            Create Camps and Tournaments. Set entry fees, pick weekly challenges,
            and track participant progress.
          </p>
        </div>

        <div className="dashboard-card">
          <h2 className="dashboard-card-title">
            Submissions To Verify
            <span className="coming-soon-tag">Coming Soon</span>
          </h2>
          <p className="dashboard-card-text">
            When players submit their challenge videos, you'll review them here
            with one-tap approve, reject, or adjust.
          </p>
        </div>
      </main>
    </div>
  );
}

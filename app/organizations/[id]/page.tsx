import { createClient } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import Tooltip from "@/components/Tooltip";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user?.id)
    .single();

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user?.id)
    .single();

  if (!org) {
    notFound();
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">
              earn<sup className="logo-sup">2</sup>keep
            </span>
          </Link>

          <div className="dashboard-user-section">
            <span className="dashboard-user-email">
              {profile?.full_name?.trim() || user?.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <OnboardingSidebar hasOrganization={true} />

        <main className="dashboard-main-with-sidebar">
          <div className="breadcrumb">
            <Link href="/dashboard" className="breadcrumb-link">Dashboard</Link>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-current">{org.name}</span>
          </div>

          <div className="org-header">
            <div>
              <span className="org-detail-type-pill">{org.org_type}</span>
              <h1 className="dashboard-welcome">{org.name}</h1>
              {(org.city || org.state) && (
                <p className="org-detail-location">
                  {[org.city, org.state].filter(Boolean).join(", ")}
                </p>
              )}
              {org.description && (
                <p className="org-detail-description">{org.description}</p>
              )}
            </div>
            <Tooltip text="Update your organization name, type, location, or description.">
              <Link href={`/organizations/${org.id}/edit`} className="btn-secondary-link">
                Edit Organization
              </Link>
            </Tooltip>
          </div>

          <div className="dashboard-card">
            <h2 className="dashboard-card-title">
              Teams
              <span className="coming-soon-tag">Slice 4.2</span>
            </h2>
            <p className="dashboard-card-text">
              In the next slice, you'll be able to create teams under this organization.
              For example: "Lincoln Lions U14" inside "Lincoln Middle School Athletics."
            </p>
          </div>

          <div className="dashboard-card">
            <h2 className="dashboard-card-title">
              Events
              <span className="coming-soon-tag">Slice 4.4</span>
            </h2>
            <p className="dashboard-card-text">
              Once you have teams, you'll create Camps and Tournaments here —
              with weekly challenges, sponsor QR codes, and prize structures.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

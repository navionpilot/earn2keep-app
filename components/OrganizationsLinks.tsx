// =============================================================================
// components/OrganizationsLinks.tsx — User's orgs list (L39)
// =============================================================================
// Server component, used by the Settings page. Lists each org the user
// owns, with quick links to that org's Account page (where Stripe Connect
// and coaches live).
// =============================================================================

import Link from "next/link";
import { createClient } from "@/lib/supabase-server";

interface Props {
  userId: string;
}

export default async function OrganizationsLinks({ userId }: Props) {
  const supabase = await createClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  if (!orgs || orgs.length === 0) {
    return null;
  }

  return (
    <section className="e2k-panel">
      <div className="e2k-panel-head">
        <h2 className="e2k-panel-title">Your Organizations</h2>
        <p className="e2k-panel-sub">
          Manage coaches, payment settings, and money activity for each org.
        </p>
      </div>
      <div className="e2k-settings-links">
        {orgs.map((org) => (
          <Link
            key={org.id}
            href={`/organizations/${org.id}/account`}
            className="e2k-settings-link"
          >
            <div className="e2k-settings-link-title">{org.name}</div>
            <div className="e2k-settings-link-desc">
              Account page · coaches, payments, settings
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

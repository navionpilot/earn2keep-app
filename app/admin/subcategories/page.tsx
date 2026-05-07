"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import OnboardingSidebar from "@/components/OnboardingSidebar";
import LogoutButton from "@/components/LogoutButton";

// Hardcoded admin email — replace with proper role system in a future slice
const ADMIN_EMAIL = "waylon.hdd@comcast.net";

type PrivateSubcategory = {
  id: string;
  parent_category: string;
  name: string;
  organization_id: string;
  parent_subcategory_id: string | null;
  parent_subcategory_name: string | null;
  created_at: string;
  challenge_count: number;
  org_name: string | null;
};

export default function AdminSubcategoriesPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const [subs, setSubs] = useState<PrivateSubcategory[]>([]);
  const [fetching, setFetching] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchAll = async () => {
    setFetching(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsAdmin(false);
      setFetching(false);
      return;
    }

    if (user.email !== ADMIN_EMAIL) {
      setIsAdmin(false);
      setFetching(false);
      return;
    }
    setIsAdmin(true);

    // Display name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    if (profile?.full_name) setUserDisplayName(profile.full_name);

    // Fetch all private subcategories with their org names + parent subcategory ids
    const { data: privSubs, error: subErr } = await supabase
      .from("challenge_subcategories")
      .select("id, parent_category, name, organization_id, parent_subcategory_id, created_at, organizations(name)")
      .eq("is_public", false)
      .order("parent_category", { ascending: true })
      .order("name", { ascending: true });

    if (subErr) {
      setError(subErr.message);
      setFetching(false);
      return;
    }

    // Build a name lookup for ALL subcategories (so we can resolve parent names — public Tier 2 ids can be parents)
    const { data: allSubs } = await supabase
      .from("challenge_subcategories")
      .select("id, name");
    const nameById: Record<string, string> = {};
    (allSubs || []).forEach((s: any) => { nameById[s.id] = s.name; });

    // Get challenge counts per subcategory
    const ids = (privSubs || []).map((s: any) => s.id);
    const counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: counts_data } = await supabase
        .from("challenges")
        .select("subcategory_id")
        .in("subcategory_id", ids);
      (counts_data || []).forEach((c: any) => {
        counts[c.subcategory_id] = (counts[c.subcategory_id] || 0) + 1;
      });
    }

    const enriched: PrivateSubcategory[] = (privSubs || []).map((s: any) => ({
      id: s.id,
      parent_category: s.parent_category,
      name: s.name,
      organization_id: s.organization_id,
      parent_subcategory_id: s.parent_subcategory_id,
      parent_subcategory_name: s.parent_subcategory_id ? (nameById[s.parent_subcategory_id] || null) : null,
      created_at: s.created_at,
      challenge_count: counts[s.id] || 0,
      org_name: s.organizations?.name || null,
    }));

    // Sort by challenge_count desc (most-used first)
    enriched.sort((a, b) => b.challenge_count - a.challenge_count);
    setSubs(enriched);
    setFetching(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handlePromote = async (subId: string, name: string, parentCategory: string) => {
    if (!confirm(`Promote "${name}" (${parentCategory}) to GLOBAL? This makes it visible to everyone on the platform. The subcategory will no longer be tied to a specific org.`)) {
      return;
    }
    setPromoting(subId);
    setError(null);
    setSuccessMsg(null);
    const supabase = createClient();

    // Check for collision: a public subcategory with the same name in the same parent_category already exists
    const { data: existingPublic } = await supabase
      .from("challenge_subcategories")
      .select("id")
      .eq("is_public", true)
      .eq("parent_category", parentCategory)
      .ilike("name", name)
      .limit(1);

    if (existingPublic && existingPublic.length > 0) {
      setError(`A public subcategory called "${name}" already exists in ${parentCategory}. Cannot promote — would create a duplicate.`);
      setPromoting(null);
      return;
    }

    const { error: updErr } = await supabase
      .from("challenge_subcategories")
      .update({
        is_public: true,
        organization_id: null,
      })
      .eq("id", subId);

    if (updErr) {
      setError(`Failed to promote: ${updErr.message}`);
      setPromoting(null);
      return;
    }

    setSuccessMsg(`Promoted "${name}" to global ✓`);
    setPromoting(null);
    await fetchAll();
  };

  const handleDelete = async (subId: string, name: string, challengeCount: number) => {
    if (challengeCount > 0) {
      if (!confirm(`"${name}" is used by ${challengeCount} challenge${challengeCount === 1 ? "" : "s"}. Deleting it will leave those challenges without a subcategory (they'll show as just their parent category). Continue?`)) {
        return;
      }
    } else {
      if (!confirm(`Delete subcategory "${name}"? It's not used by any challenges, so this is safe.`)) {
        return;
      }
    }

    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("challenge_subcategories")
      .delete()
      .eq("id", subId);

    if (delErr) {
      setError(`Failed to delete: ${delErr.message}`);
      return;
    }

    setSuccessMsg(`Deleted "${name}"`);
    await fetchAll();
  };

  // Re-parent a subcategory to be a child of another subcategory (Tier 3 nesting)
  const handleReparent = async (subId: string, name: string, parentCategory: string) => {
    // Build list of possible parents — Tier 2 entries in the same parent_category
    // (excluding self)
    const possibleParents = subs
      .filter((s) => s.parent_category === parentCategory && s.id !== subId && !s.parent_subcategory_id)
      .map((s) => ({ id: s.id, name: s.name }));

    // Also include public Tier 2 subcategories from the same parent_category
    const supabase = createClient();
    const { data: publicTier2 } = await supabase
      .from("challenge_subcategories")
      .select("id, name")
      .eq("parent_category", parentCategory)
      .eq("is_public", true)
      .is("parent_subcategory_id", null)
      .order("name");

    const allParents = [
      ...(publicTier2 || []).map((p: any) => ({ id: p.id, name: p.name + " (public)" })),
      ...possibleParents.map((p) => ({ id: p.id, name: p.name + " (private)" })),
    ];

    if (allParents.length === 0) {
      alert(`No possible parents in ${parentCategory}. Create a Tier 2 subcategory first.`);
      return;
    }

    // Build a numbered prompt
    let promptText = `Move "${name}" to be a sub-type under which subcategory?\n\n`;
    promptText += `0. (top-level — not nested)\n`;
    allParents.forEach((p, i) => {
      promptText += `${i + 1}. ${p.name}\n`;
    });
    promptText += `\nEnter the number:`;

    const choice = window.prompt(promptText, "0");
    if (choice === null) return; // cancelled

    const choiceNum = parseInt(choice);
    if (isNaN(choiceNum) || choiceNum < 0 || choiceNum > allParents.length) {
      alert("Invalid choice. Cancelled.");
      return;
    }

    const newParentId = choiceNum === 0 ? null : allParents[choiceNum - 1].id;

    setError(null);
    setSuccessMsg(null);

    const { error: updErr } = await supabase
      .from("challenge_subcategories")
      .update({ parent_subcategory_id: newParentId })
      .eq("id", subId);

    if (updErr) {
      setError(`Failed to re-parent: ${updErr.message}`);
      return;
    }

    setSuccessMsg(
      newParentId === null
        ? `Moved "${name}" to top-level (Tier 2)`
        : `Moved "${name}" under "${allParents[choiceNum - 1].name}"`
    );
    await fetchAll();
  };

  if (fetching) {
    return (
      <div className="form-page">
        <main className="form-page-main">
          <div className="form-card">
            <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="form-page">
        <header className="dashboard-header">
          <div className="dashboard-header-inner">
            <Link href="/dashboard" className="dashboard-logo">
              <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
            </Link>
            <Link href="/dashboard" className="btn-link">← Back to Dashboard</Link>
          </div>
        </header>
        <main className="form-page-main">
          <div className="form-card">
            <h1 className="form-title">Access Denied</h1>
            <p className="form-subtitle">
              This page is for platform administrators only.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href="/dashboard" className="dashboard-logo">
            <span className="logo-text">earn<sup className="logo-sup">2</sup>keep</span>
          </Link>
          <div className="dashboard-user-section">
            <span className="dashboard-user-email">{userDisplayName} (admin)</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="dashboard-layout">
        <OnboardingSidebar
          hasOrganization={true}
          hasTeams={true}
          hasPlayers={true}
          hasEvent={true}
        />

        <main className="dashboard-main-with-sidebar">
          <Link href="/dashboard" className="btn-back">
            ← Back to Dashboard
          </Link>

          <h1 className="dashboard-welcome">Admin: Subcategories</h1>
          <p className="dashboard-subtitle">
            All org-private subcategories across the platform. Promote popular ones to <strong>global</strong> so everyone benefits, or delete junk entries.
          </p>

          {error && <div className="alert alert-error">{error}</div>}
          {successMsg && <div className="alert alert-success">{successMsg}</div>}

          <div className="dashboard-card">
            <h2 className="dashboard-card-title">
              Private Subcategories
              <span className="roster-count">({subs.length})</span>
            </h2>
            {subs.length === 0 ? (
              <p className="dashboard-card-text">
                No private subcategories yet. As coaches add custom sports/subcategories, they'll appear here.
              </p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Used by</th>
                      <th>Org</th>
                      <th>Created</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => (
                      <tr key={s.id}>
                        <td className="admin-table-name">{s.name}</td>
                        <td>
                          <span className={`challenge-cat-pill cat-${s.parent_category.toLowerCase()}`}>
                            {s.parent_category}
                          </span>
                        </td>
                        <td>
                          <strong>{s.challenge_count}</strong> challenge{s.challenge_count === 1 ? "" : "s"}
                        </td>
                        <td className="admin-table-org">{s.org_name || <em>—</em>}</td>
                        <td className="admin-table-date">
                          {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="btn-primary btn-inline"
                              style={{ fontSize: "12px", padding: "6px 12px" }}
                              onClick={() => handlePromote(s.id, s.name, s.parent_category)}
                              disabled={promoting === s.id}
                            >
                              {promoting === s.id ? "Promoting..." : "↑ Promote to global"}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: "12px", padding: "6px 12px" }}
                              onClick={() => handleReparent(s.id, s.name, s.parent_category)}
                              title="Move this subcategory to be nested under another"
                            >
                              ↳ Re-parent
                            </button>
                            <button
                              type="button"
                              className="btn-danger"
                              style={{ fontSize: "12px", padding: "6px 12px" }}
                              onClick={() => handleDelete(s.id, s.name, s.challenge_count)}
                            >
                              🗑 Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

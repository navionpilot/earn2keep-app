"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const ROLE_OPTIONS = [
  { value: "coach", label: "Coach (sports team)" },
  { value: "parent", label: "Parent" },
  { value: "teacher", label: "Teacher / school administrator" },
  { value: "youth_pastor", label: "Youth pastor / church leader" },
  { value: "scout_leader", label: "Scout leader / troop volunteer" },
  { value: "gym_owner", label: "Gym owner / fitness coach" },
  { value: "org_director", label: "Organization director / nonprofit leader" },
  { value: "other", label: "Other" },
];

export default function ProfileCompletePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExisting, setIsExisting] = useState(false);

  // Hydrate existing profile if present
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: existing } = await supabase
        .from("profiles")
        .select("full_name, primary_role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (existing) {
        setIsExisting(true);
        if (existing.full_name) setFullName(existing.full_name);
        if (existing.primary_role) setRole(existing.primary_role);
      }
      setFetching(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmed = fullName.trim();
    if (!trimmed) {
      setError("Please enter your name.");
      setLoading(false);
      return;
    }
    if (!role) {
      setError("Please pick the role that best describes you.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    if (isExisting) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ full_name: trimmed, primary_role: role })
        .eq("id", user.id);
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        full_name: trimmed,
        email: user.email,
        primary_role: role,
      });
      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
    router.refresh();
  };

  if (fetching) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-subtitle">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-text">
            earn<sup className="logo-sup">2</sup>keep
          </span>
        </div>

        <div style={{ textAlign: "center" }}>
          <span className="auth-eyebrow">
            {isExisting ? "★ EDIT PROFILE ★" : "★ ONE QUICK STEP ★"}
          </span>
        </div>

        <h1 className="auth-title">
          {isExisting ? "Update Your Profile" : "Welcome to earn²keep"}
        </h1>
        <p className="auth-subtitle">
          {isExisting
            ? "Change your name or role anytime."
            : "Tell us your name and what brings you here so we can tailor your experience."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="fullName" className="form-label">
              Your name
            </label>
            <input
              id="fullName"
              type="text"
              className="form-input"
              placeholder="e.g., Waylon Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoFocus={!isExisting}
              maxLength={100}
              autoComplete="name"
            />
            <p className="form-hint" style={{ marginTop: "8px" }}>
              We&apos;ll show your first name on your dashboard.
            </p>
          </div>

          <div>
            <label htmlFor="role" className="form-label">
              I&apos;m a&hellip;
            </label>
            <select
              id="role"
              className="form-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            >
              <option value="">Select one&hellip;</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="form-hint" style={{ marginTop: "8px" }}>
              earn²keep works for sports teams, scouts, churches, gyms, schools,
              classes, and any organized group. Pick whatever fits best — you can change it later.
            </p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Saving..." : isExisting ? "Save changes →" : "Continue →"}
          </button>
        </form>
      </div>
    </div>
  );
}

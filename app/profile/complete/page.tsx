"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function CompleteProfilePage() {
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      setError("Please enter your full name (at least 2 characters).");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    // Check if profile row exists
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (existing) {
      // Profile exists, just update full_name
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ full_name: trimmed })
        .eq("id", user.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
    } else {
      // Profile row doesn't exist, create it
      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        full_name: trimmed,
        email: user.email,
        primary_role: "coach",
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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-text">
            earn<sup className="logo-sup">2</sup>keep
          </span>
        </div>

        <div style={{ textAlign: "center" }}>
          <span className="auth-eyebrow">★ ONE QUICK STEP ★</span>
        </div>

        <h1 className="auth-title">What's Your Name?</h1>
        <p className="auth-subtitle">
          We'd like to greet you properly. Tell us what to call you.
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
              autoFocus
              maxLength={100}
              autoComplete="name"
            />
            <p className="form-hint" style={{ marginTop: "8px" }}>
              We'll show your first name on your dashboard. You can edit this anytime.
            </p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Saving..." : "Continue →"}
          </button>
        </form>
      </div>
    </div>
  );
}

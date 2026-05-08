"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        data: {
          full_name: fullName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        full_name: fullName,
        email: email,
        primary_role: "coach",
      });

      if (profileError) {
        console.error("Profile creation error:", profileError);
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Link href="/" className="auth-logo">
            <span className="logo-text">
              earn<sup className="logo-sup">2</sup>keep
            </span>
          </Link>

          <h1 className="auth-title">Check Your Email</h1>
          <p className="auth-subtitle">
            We sent a confirmation link to <strong>{email}</strong>. Click the link
            to verify your account, then come back and log in.
          </p>

          <div className="auth-footer">
            <Link href="/login" style={{ fontWeight: 700 }}>
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          <span className="logo-text">
            earn<sup className="logo-sup">2</sup>keep
          </span>
        </Link>

        <div style={{ textAlign: "center" }}>
          <span className="auth-eyebrow">★ JOIN earn²keep ★</span>
        </div>

        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">Set up earn²keep for your team, club, school, or organization</p>

        <form className="auth-form" onSubmit={handleSignup}>
          <div>
            <label htmlFor="fullName" className="form-label">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              className="form-input"
              placeholder="Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div>
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Creating account..." : "Create account →"}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{" "}
          <Link href="/login" style={{ fontWeight: 700 }}>
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          <span className="logo-text">
            earn<sup className="logo-sup">2</sup>keep
          </span>
        </Link>

        <div style={{ textAlign: "center" }}>
          <span className="auth-eyebrow">★ EARN IT. KEEP IT. ★</span>
        </div>

        <h1 className="auth-title">Welcome Back</h1>
        <p className="auth-subtitle">Log in to manage your teams, events, and roster</p>

        <form className="auth-form" onSubmit={handleLogin}>
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
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Logging in..." : "Log in →"}
          </button>
        </form>

        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link
            href="/forgot-password"
            style={{ fontSize: "14px", color: "var(--color-text-muted)" }}
          >
            Forgot your password?
          </Link>
        </div>

        <div className="auth-footer">
          New to earn²keep?{" "}
          <Link href="/signup" style={{ fontWeight: 700 }}>
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

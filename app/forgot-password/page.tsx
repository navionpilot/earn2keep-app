"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          <span className="auth-logo-mark">E2K</span>
          <span className="auth-logo-name">Earn2Keep</span>
        </Link>

        <h1 className="auth-title">Reset your password</h1>

        {success ? (
          <>
            <p className="auth-subtitle">
              If an account exists for <strong>{email}</strong>, a password
              reset link has been sent. Check your inbox.
            </p>
            <div className="auth-footer">
              <Link href="/login" style={{ fontWeight: 600 }}>
                Back to login
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="auth-subtitle">
              Enter your email and we'll send you a link to reset your password.
            </p>

            <form className="auth-form" onSubmit={handleResetRequest}>
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

              {error && <div className="alert alert-error">{error}</div>}

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>

            <div className="auth-footer">
              Remembered it?{" "}
              <Link href="/login" style={{ fontWeight: 600 }}>
                Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

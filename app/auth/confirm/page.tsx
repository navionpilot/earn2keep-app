import Link from "next/link";

export default function ConfirmPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          <span className="logo-text">
            earn<sup className="logo-sup">2</sup>keep
          </span>
        </Link>

        <h1 className="auth-title">Email Confirmed!</h1>
        <p className="auth-subtitle">
          Your account is verified. Log in to start setting up your team.
        </p>

        <Link href="/login" className="btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          Go to login →
        </Link>
      </div>
    </div>
  );
}

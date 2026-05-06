import Link from "next/link";

export default function ConfirmPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          <span className="auth-logo-mark">E2K</span>
          <span className="auth-logo-name">Earn2Keep</span>
        </Link>

        <h1 className="auth-title">Email confirmed!</h1>
        <p className="auth-subtitle">
          Your account is verified. Log in to start setting up your team.
        </p>

        <Link href="/login" className="btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          Go to login
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function SponsorNotFound() {
  return (
    <div className="sponsor-page">
      <header className="sponsor-header">
        <div className="sponsor-header-inner">
          <span className="sponsor-logo">
            earn<sup className="logo-sup">2</sup>keep
          </span>
        </div>
      </header>

      <main className="sponsor-main">
        <div className="sponsor-card sponsor-card-not-found">
          <div className="sponsor-eyebrow">★ Link not found ★</div>
          <h1 className="sponsor-headline">This sponsor link isn't active.</h1>
          <p className="sponsor-subhead">
            It may have been deactivated, the event may have ended, or there's
            a typo. Reach out to the player or their coach for an updated link.
          </p>

          <div className="sponsor-not-found-actions">
            <a
              href="https://earn2keep.com"
              className="sponsor-cta-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn about earn²keep →
            </a>
          </div>
        </div>
      </main>

      <footer className="sponsor-footer">
        <div className="sponsor-footer-inner">
          <span>© earn²keep</span>
          <Link href="/" className="sponsor-footer-link">Coach login</Link>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link";

export default function SupporterNotFound() {
  return (
    <div className="supporter-page">
      <header className="supporter-header">
        <div className="supporter-header-inner">
          <span className="supporter-logo">
            earn<sup className="logo-sup">2</sup>keep
          </span>
        </div>
      </header>

      <main className="supporter-main">
        <div className="supporter-card supporter-card-not-found">
          <div className="supporter-eyebrow">★ Link not found ★</div>
          <h1 className="supporter-headline">This supporter link isn't active.</h1>
          <p className="supporter-subhead">
            It may have been deactivated, the event may have ended, or there's
            a typo. Reach out to the player or their coach for an updated link.
          </p>

          <div className="supporter-not-found-actions">
            <a
              href="https://earn2keep.com"
              className="supporter-cta-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn about earn²keep →
            </a>
          </div>
        </div>
      </main>

      <footer className="supporter-footer">
        <div className="supporter-footer-inner">
          <span>© earn²keep</span>
          <Link href="/" className="supporter-footer-link">Organizer login</Link>
        </div>
      </footer>
    </div>
  );
}

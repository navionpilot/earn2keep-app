"use client";

// =============================================================================
// components/InstallAppPanel.tsx — "Add to Home Screen" guide (Slice 5.8.1)
// =============================================================================
// Renders a step-by-step install panel on the player home page that
// auto-detects platform (iOS / Android / desktop / other) and shows
// the matching 3-step instructions inline.
//
// Auto-hide behavior:
//   - When the page is loaded inside the installed PWA (display-mode:
//     standalone on Android, navigator.standalone on iOS), the whole
//     panel renders nothing — the user already installed the app.
//   - When dismissed by the user, the dismissal is remembered in
//     localStorage so the panel stays hidden on subsequent visits.
//
// Android one-tap install:
//   - Chrome fires `beforeinstallprompt` once it deems the site
//     installable. We capture that event and surface a "📲 Install now"
//     button next to the Android instructions. Tapping it opens
//     Chrome's native install sheet (faster than the 3-dot menu path).
//   - iOS Safari does NOT support beforeinstallprompt — there is no
//     programmatic install on iOS, only the manual share-sheet flow.
// =============================================================================

import { useEffect, useState } from "react";

// Minimal type for Chrome's beforeinstallprompt event (not in lib.dom.d.ts).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop" | "other";

const DISMISS_KEY = "e2k_install_panel_dismissed_v1";

export default function InstallAppPanel() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidPrompted, setShowAndroidPrompted] = useState(false);

  // Detect platform + install state on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // -- Already installed? --
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ?? false;
    // iOS uses navigator.standalone (non-standard but only iOS check that works)
    const navWithStandalone = window.navigator as Navigator & {
      standalone?: boolean;
    };
    const iosStandalone = navWithStandalone.standalone === true;
    setInstalled(standalone || iosStandalone);

    // -- Dismissed? --
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // Some embedded browsers throw on localStorage; treat as not dismissed.
      setDismissed(false);
    }

    // -- Platform detection --
    const ua = window.navigator.userAgent || "";
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ reports as Mac with touch
      (ua.includes("Mac") && "ontouchend" in document);
    const isAndroid = /android/i.test(ua);
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    if (isIOS) setPlatform("ios");
    else if (isAndroid) setPlatform("android");
    else if (!isMobile) setPlatform("desktop");
    else setPlatform("other");

    // -- Capture Chrome's installable signal --
    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    // If user installs via 3-dot menu while panel is open, hide the panel.
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Don't render anything until detection has run (avoid SSR/CSR flash).
  if (platform === null || installed === null || dismissed === null) {
    return null;
  }
  if (installed || dismissed) return null;

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    setShowAndroidPrompted(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        // Browser will fire `appinstalled` and our listener hides the panel.
        // Belt + suspenders: also flip the local flag.
        setInstalled(true);
      }
    } catch {
      // If something goes wrong, silently fall back to manual instructions.
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore — dismissal just won't persist on this device
    }
    setDismissed(true);
  };

  return (
    <section className="player-home-install">
      <div className="player-home-section-head">
        <span className="player-home-section-eyebrow">
          <span className="player-home-hero-prompt">&gt;</span> INSTALL ON YOUR PHONE
        </span>
        <button
          type="button"
          className="player-home-install-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss install panel"
          title="Dismiss — won't show again"
        >
          ✕
        </button>
      </div>
      <h2 className="player-home-section-title">
        Get one-tap access 📱
      </h2>
      <p className="player-home-install-intro">
        Add earn²keep to your home screen so you can open it like a regular
        app — no URL typing, no hunting through bookmarks.
      </p>

      {platform === "ios" && (
        <div className="player-home-install-card">
          <div className="player-home-install-card-head">
            <span className="player-home-install-card-icon" aria-hidden="true">
              📱
            </span>
            <div className="player-home-install-card-title">
              On iPhone or iPad (Safari)
            </div>
          </div>
          <ol className="player-home-install-steps">
            <li>
              Tap the <strong>Share</strong> button{" "}
              <span className="player-home-install-icon-inline">⬆</span>{" "}
              at the bottom of Safari.
            </li>
            <li>
              Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
            </li>
            <li>
              Tap <strong>&ldquo;Add&rdquo;</strong> in the top-right corner — done!
            </li>
          </ol>
          <p className="player-home-install-footnote">
            Heads up: install only works in <strong>Safari</strong>. If
            you&apos;re in Chrome or another browser on iPhone, switch
            to Safari first.
          </p>
        </div>
      )}

      {platform === "android" && (
        <div className="player-home-install-card">
          <div className="player-home-install-card-head">
            <span className="player-home-install-card-icon" aria-hidden="true">
              🤖
            </span>
            <div className="player-home-install-card-title">
              On Android (Chrome)
            </div>
          </div>

          {deferredPrompt && !showAndroidPrompted && (
            <button
              type="button"
              className="player-home-install-cta"
              onClick={handleAndroidInstall}
            >
              📲 Install in one tap →
            </button>
          )}

          <ol className="player-home-install-steps">
            <li>
              Tap the <strong>3-dot menu</strong>{" "}
              <span className="player-home-install-icon-inline">⋮</span>{" "}
              in the top-right corner of Chrome.
            </li>
            <li>
              Tap <strong>&ldquo;Install app&rdquo;</strong> (or{" "}
              <strong>&ldquo;Add to Home Screen&rdquo;</strong> on older Chrome).
            </li>
            <li>
              Tap <strong>&ldquo;Install&rdquo;</strong> on the popup — done!
            </li>
          </ol>
          {!deferredPrompt && (
            <p className="player-home-install-footnote">
              If you don&apos;t see &ldquo;Install app&rdquo;, your browser
              might not support it. Try Chrome instead of Firefox/Samsung
              Internet.
            </p>
          )}
        </div>
      )}

      {platform === "desktop" && (
        <div className="player-home-install-card">
          <div className="player-home-install-card-head">
            <span className="player-home-install-card-icon" aria-hidden="true">
              💻
            </span>
            <div className="player-home-install-card-title">
              You&apos;re on a computer
            </div>
          </div>
          <p className="player-home-install-desktop-text">
            For the best experience, open this page on your phone (iPhone or
            Android). Then come back here for the install steps.
          </p>
          <p className="player-home-install-footnote">
            Tip: text yourself the URL{" "}
            <strong>app.earn2keep.com/home</strong> from your phone — when
            you tap it, your phone&apos;s browser opens and you can install
            from there.
          </p>
        </div>
      )}

      {platform === "other" && (
        <div className="player-home-install-card">
          <div className="player-home-install-card-head">
            <span className="player-home-install-card-icon" aria-hidden="true">
              📱
            </span>
            <div className="player-home-install-card-title">
              Add to your home screen
            </div>
          </div>
          <p className="player-home-install-desktop-text">
            Open your browser&apos;s menu (often a 3-dot or 3-line icon) and
            look for an option like <strong>&ldquo;Add to Home Screen&rdquo;</strong>{" "}
            or <strong>&ldquo;Install app&rdquo;</strong>.
          </p>
          <p className="player-home-install-footnote">
            For the best results: use Safari on iPhone, or Chrome on Android.
          </p>
        </div>
      )}
    </section>
  );
}
